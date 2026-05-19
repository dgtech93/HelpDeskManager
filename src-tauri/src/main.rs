#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backup;
mod crypto;
mod db;
mod errors;
mod models;
mod rdp;
mod rdp_file;
mod vpn;

use crate::backup::{export_backup_encrypted, import_backup_decrypted};
use crate::crypto::{
    decrypt_aes256_gcm, derive_key_argon2id, encrypt_aes256_gcm, generate_kdf_salt_b64,
};
use crate::db::PasswordChange;
use crate::errors::{err_msg, AppError};
use crate::models::*;
use arboard::Clipboard;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use chrono::Utc;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;
use uuid::Uuid;
use zeroize::Zeroizing;

pub struct AppState {
    db_path: PathBuf,
    vault_key: Mutex<Option<Zeroizing<[u8; 32]>>>,
}

const KDF_SALT_KEY: &str = "kdf_salt";
const VAULT_VERIFIER_KEY: &str = "vault_verifier";
const VERIFIER_PT: &str = "VAULT_OK";
const SETTING_THEME: &str = "theme";
const SETTING_FAVORITES: &str = "favorite_rdp_ids";
const SETTING_RDP_PRESETS: &str = "rdp_connection_name_presets";
const SETTING_ENVIRONMENTS: &str = "connection_environments";
const SETTING_VERSION_OPTIONS: &str = "connection_version_options";
const SETTING_RELEASE_OPTIONS: &str = "connection_release_options";
const SETTING_CONTRACT_TYPES: &str = "contract_types";
const SETTING_CRM_MODULES: &str = "crm_modules";
const SETTING_COLLAB_COMPETENCIES: &str = "collaborator_competencies";
const SETTING_DASHBOARD_LAYOUT: &str = "dashboard_layout";
const SETTING_CLIENT_CARD_MODULES: &str = "client_card_modules";
const SETTING_PLANNING_ACTIVITY_TYPES: &str = "planning_activity_types";
const SETTING_PLANNING_STATES: &str = "planning_states";
const SETTING_PLANNING_ACTIVITIES: &str = "planning_activities";
const SETTING_AGENDA_SETTINGS: &str = "agenda_settings";
const SETTING_PLANNING_REMINDER_PRE_ALERT_MINUTES: &str = "planning_reminder_pre_alert_minutes";
const VAULT_KDF_PRESET: &str = "vault_kdf_preset";
/// Chiave sessione vault ripetuta sul DB (mai inclusa nei backup esportati).
const LOCAL_VAULT_SESSION_SETTING: &str = "_vault_session_key_b64";

#[derive(serde::Serialize, serde::Deserialize)]
struct VaultRecoveryKitV1 {
    version: u32,
    recovery_salt_b64: String,
    wrapped_vault_key_b64: String,
}

fn db_err(e: rusqlite::Error) -> String {
    err_msg(AppError::DatabaseError, Some(&e.to_string()))
}

fn open(state: &AppState) -> Result<Connection, String> {
    db::open_db(&state.db_path).map_err(db_err)
}

/// File locale (solo cartella dati app) che memorizza la chiave AES quando il vault è stato
/// sbloccato almeno una volta; evita di richiedere la master password a ogni avvio.
const VAULT_SESSION_FILENAME: &str = "vault-session.key";

fn vault_session_key_path(state: &AppState) -> PathBuf {
    state
        .db_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(VAULT_SESSION_FILENAME)
}

fn persist_vault_session_key(state: &AppState, key: &Zeroizing<[u8; 32]>) {
    let path = vault_session_key_path(state);
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if std::fs::write(&path, key.as_ref()).is_err() {
        eprintln!("vault-session: salvataggio file sessione fallito (uso fallback DB)");
    }
    if let Ok(conn) = open(state) {
        let _ = db::set_setting(
            &conn,
            LOCAL_VAULT_SESSION_SETTING,
            &STANDARD.encode(key.as_ref()),
        );
    }
}

fn clear_vault_session_storage(state: &AppState) {
    let _ = std::fs::remove_file(vault_session_key_path(state));
    if let Ok(conn) = open(state) {
        let _ = conn.execute(
            "DELETE FROM settings WHERE key = ?1",
            [LOCAL_VAULT_SESSION_SETTING],
        );
    }
}

fn try_apply_session_raw(state: &AppState, raw: &[u8], verifier_b64: &str) -> bool {
    if raw.len() != 32 {
        return false;
    }
    let mut key = Zeroizing::new([0u8; 32]);
    key.copy_from_slice(&raw[..32]);
    let Ok(plain) = decrypt_aes256_gcm(key.as_ref(), verifier_b64) else {
        return false;
    };
    if plain != VERIFIER_PT {
        return false;
    }
    let Ok(mut g) = state.vault_key.lock() else {
        return false;
    };
    if g.is_some() {
        return true;
    }
    *g = Some(key);
    true
}

/// Ripristina il vault in RAM dal file di sessione o dall'impostazione locale (mai esportata nei backup).
fn try_restore_vault_session(state: &AppState) {
    let Ok(conn) = open(state) else {
        return;
    };
    let Ok(Some(_salt)) = db::get_setting(&conn, KDF_SALT_KEY) else {
        return;
    };
    let Ok(Some(verifier_b64)) = db::get_setting(&conn, VAULT_VERIFIER_KEY) else {
        return;
    };

    let mut candidates: Vec<Vec<u8>> = Vec::new();
    if let Ok(raw) = std::fs::read(vault_session_key_path(state)) {
        candidates.push(raw);
    }
    if let Ok(Some(b64)) = db::get_setting(&conn, LOCAL_VAULT_SESSION_SETTING) {
        if let Ok(raw) = STANDARD.decode(&b64) {
            candidates.push(raw);
        }
    }

    for raw in candidates {
        if try_apply_session_raw(state, &raw, &verifier_b64) {
            return;
        }
    }
}

/// Installa il vault con la master password scelta dall'utente (primo avvio da Impostazioni).
fn install_new_vault(state: &AppState, password: &str) -> Result<(), String> {
    let conn = open(state)?;
    let salt_b64 = generate_kdf_salt_b64().map_err(|_| err_msg(AppError::CryptoError, None))?;
    let salt_bytes = STANDARD
        .decode(&salt_b64)
        .map_err(|_| err_msg(AppError::CryptoError, Some("salt")))?;
    let derived = derive_key_argon2id(password.as_bytes(), &salt_bytes, Some("balanced"))
        .map_err(|_| err_msg(AppError::CryptoError, Some("derivazione chiave")))?;
    let verifier = encrypt_aes256_gcm(derived.as_ref(), VERIFIER_PT)
        .map_err(|_| err_msg(AppError::CryptoError, Some("verifier")))?;
    db::set_setting(&conn, KDF_SALT_KEY, &salt_b64).map_err(db_err)?;
    db::set_setting(&conn, VAULT_VERIFIER_KEY, &verifier).map_err(db_err)?;
    db::set_setting(&conn, VAULT_KDF_PRESET, "balanced").map_err(db_err)?;
    if db::get_setting(&conn, SETTING_THEME)
        .map_err(db_err)?
        .is_none()
    {
        db::set_setting(&conn, SETTING_THEME, "light").map_err(db_err)?;
    }
    if db::get_setting(&conn, SETTING_FAVORITES)
        .map_err(db_err)?
        .is_none()
    {
        db::set_setting(&conn, SETTING_FAVORITES, "[]").map_err(db_err)?;
    }
    if db::get_setting(&conn, SETTING_RDP_PRESETS)
        .map_err(db_err)?
        .is_none()
    {
        db::set_setting(&conn, SETTING_RDP_PRESETS, "[]").map_err(db_err)?;
    }
    persist_vault_session_key(state, &derived);
    let mut g = state
        .vault_key
        .lock()
        .map_err(|_| err_msg(AppError::CryptoError, None))?;
    *g = Some(derived);
    Ok(())
}

fn derive_unlock_key_from_password(
    conn: &Connection,
    password: &str,
) -> Result<Zeroizing<[u8; 32]>, String> {
    let salt_b64 = db::get_setting(conn, KDF_SALT_KEY)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::ValidationError, Some("Vault non configurato")))?;
    let verifier_b64 = db::get_setting(conn, VAULT_VERIFIER_KEY)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::CryptoError, Some("verifier mancante")))?;
    let salt_bytes = STANDARD
        .decode(&salt_b64)
        .map_err(|_| err_msg(AppError::CryptoError, Some("salt")))?;
    let kdf_preset = db::get_setting(conn, VAULT_KDF_PRESET).map_err(db_err)?;
    let preset_arg = match kdf_preset.as_deref() {
        Some("balanced") => Some("balanced"),
        _ => None,
    };
    let derived = derive_key_argon2id(password.as_bytes(), &salt_bytes, preset_arg)
        .map_err(|_| err_msg(AppError::CryptoError, Some("derivazione chiave")))?;
    let plain = decrypt_aes256_gcm(derived.as_ref(), &verifier_b64)
        .map_err(|_| err_msg(AppError::CryptoError, Some("Password non valida")))?;
    if plain != VERIFIER_PT {
        return Err(err_msg(AppError::CryptoError, Some("Password non valida")));
    }
    Ok(derived)
}

fn verify_vault_key_matches_verifier(
    conn: &Connection,
    candidate: &Zeroizing<[u8; 32]>,
) -> Result<(), String> {
    let verifier_b64 = db::get_setting(conn, VAULT_VERIFIER_KEY)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::CryptoError, Some("verifier mancante")))?;
    let plain = decrypt_aes256_gcm(candidate.as_ref(), &verifier_b64)
        .map_err(|_| err_msg(AppError::CryptoError, Some("Chiave vault non valida")))?;
    if plain != VERIFIER_PT {
        return Err(err_msg(
            AppError::CryptoError,
            Some("Chiave vault non valida"),
        ));
    }
    Ok(())
}

fn collect_plaintext_secrets(
    conn: &Connection,
    old_key: &Zeroizing<[u8; 32]>,
) -> Result<
    (
        Vec<(String, String)>,
        Vec<(String, String)>,
        Vec<(String, String)>,
    ),
    String,
> {
    let mut rdp_pwds = Vec::new();
    for row in db::list_rdp(conn).map_err(db_err)? {
        if let Some(blob) = row.password_encrypted {
            let plain = decrypt_aes256_gcm(old_key.as_ref(), &blob).map_err(|_| {
                err_msg(
                    AppError::CryptoError,
                    Some("Impossibile decifrare una password RDP"),
                )
            })?;
            rdp_pwds.push((row.id, plain));
        }
    }
    let mut vpn_pwds = Vec::new();
    for row in db::list_vpn(conn).map_err(db_err)? {
        if let Some(blob) = row.password_encrypted {
            let plain = decrypt_aes256_gcm(old_key.as_ref(), &blob).map_err(|_| {
                err_msg(
                    AppError::CryptoError,
                    Some("Impossibile decifrare una password VPN"),
                )
            })?;
            vpn_pwds.push((row.id, plain));
        }
    }
    let mut web_pwds = Vec::new();
    for row in db::list_web(conn).map_err(db_err)? {
        if let Some(blob) = row.password_encrypted {
            let plain = decrypt_aes256_gcm(old_key.as_ref(), &blob).map_err(|_| {
                err_msg(
                    AppError::CryptoError,
                    Some("Impossibile decifrare una password Web"),
                )
            })?;
            web_pwds.push((row.id, plain));
        }
    }
    Ok((rdp_pwds, vpn_pwds, web_pwds))
}

fn write_new_vault_salt_and_verifier(
    conn: &Connection,
    new_password: &str,
) -> Result<Zeroizing<[u8; 32]>, String> {
    let salt_b64 = generate_kdf_salt_b64().map_err(|_| err_msg(AppError::CryptoError, None))?;
    let salt_bytes = STANDARD
        .decode(&salt_b64)
        .map_err(|_| err_msg(AppError::CryptoError, Some("salt")))?;
    let derived = derive_key_argon2id(new_password.as_bytes(), &salt_bytes, Some("balanced"))
        .map_err(|_| err_msg(AppError::CryptoError, Some("derivazione chiave")))?;
    let verifier = encrypt_aes256_gcm(derived.as_ref(), VERIFIER_PT)
        .map_err(|_| err_msg(AppError::CryptoError, Some("verifier")))?;
    db::set_setting(conn, KDF_SALT_KEY, &salt_b64).map_err(db_err)?;
    db::set_setting(conn, VAULT_VERIFIER_KEY, &verifier).map_err(db_err)?;
    db::set_setting(conn, VAULT_KDF_PRESET, "balanced").map_err(db_err)?;
    Ok(derived)
}

fn apply_rotated_passwords(
    conn: &Connection,
    new_key: &Zeroizing<[u8; 32]>,
    rdp: Vec<(String, String)>,
    vpn: Vec<(String, String)>,
    web: Vec<(String, String)>,
) -> Result<(), String> {
    for (id, plain) in rdp {
        let enc = encrypt_aes256_gcm(new_key.as_ref(), &plain)
            .map_err(|_| err_msg(AppError::CryptoError, Some("cifratura RDP")))?;
        db::update_rdp_password_enc(conn, &id, Some(enc)).map_err(db_err)?;
    }
    for (id, plain) in vpn {
        let enc = encrypt_aes256_gcm(new_key.as_ref(), &plain)
            .map_err(|_| err_msg(AppError::CryptoError, Some("cifratura VPN")))?;
        db::update_vpn_password_enc(conn, &id, Some(enc)).map_err(db_err)?;
    }
    for (id, plain) in web {
        let enc = encrypt_aes256_gcm(new_key.as_ref(), &plain)
            .map_err(|_| err_msg(AppError::CryptoError, Some("cifratura Web")))?;
        db::update_web_password_enc(conn, &id, Some(enc)).map_err(db_err)?;
    }
    Ok(())
}

fn finalize_vault_session_ram(
    state: &AppState,
    new_derived: &Zeroizing<[u8; 32]>,
) -> Result<(), String> {
    let mut g = state
        .vault_key
        .lock()
        .map_err(|_| err_msg(AppError::CryptoError, None))?;
    *g = Some(new_derived.clone());
    drop(g);
    persist_vault_session_key(state, new_derived);
    Ok(())
}

fn unwrap_vault_key_with_recovery_passphrase(
    kit: &VaultRecoveryKitV1,
    recovery_passphrase: &str,
) -> Result<Zeroizing<[u8; 32]>, String> {
    if recovery_passphrase.len() < 8 {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Passphrase recupero troppo corta (min 8 caratteri)"),
        ));
    }
    let salt_bytes = STANDARD
        .decode(&kit.recovery_salt_b64)
        .map_err(|_| err_msg(AppError::CryptoError, Some("salt kit")))?;
    let r_derived = derive_key_argon2id(
        recovery_passphrase.as_bytes(),
        &salt_bytes,
        Some("balanced"),
    )
    .map_err(|_| err_msg(AppError::CryptoError, Some("derivazione recupero")))?;
    let inner_b64 =
        decrypt_aes256_gcm(r_derived.as_ref(), &kit.wrapped_vault_key_b64).map_err(|_| {
            err_msg(
                AppError::CryptoError,
                Some("Passphrase recupero non valida"),
            )
        })?;
    let raw = STANDARD
        .decode(inner_b64.trim())
        .map_err(|_| err_msg(AppError::CryptoError, Some("chiave kit malformata")))?;
    if raw.len() != 32 {
        return Err(err_msg(
            AppError::CryptoError,
            Some("chiave kit malformata"),
        ));
    }
    let mut key = Zeroizing::new([0u8; 32]);
    key.copy_from_slice(&raw[..32]);
    Ok(key)
}

fn vault_unlocked_key(state: &AppState) -> Result<Zeroizing<[u8; 32]>, String> {
    try_restore_vault_session(state);
    let guard = state
        .vault_key
        .lock()
        .map_err(|_| err_msg(AppError::CryptoError, None))?;
    if let Some(ref k) = *guard {
        return Ok(k.clone());
    }
    drop(guard);

    let conn = open(state)?;
    let configured = db::get_setting(&conn, KDF_SALT_KEY)
        .map_err(db_err)?
        .is_some();
    if !configured {
        return Err(err_msg(
            AppError::VaultLocked,
            Some("Configura la protezione credenziali in Impostazioni."),
        ));
    }
    Err(err_msg(AppError::VaultLocked, None))
}

fn clip_copy(text: String) -> Result<(), String> {
    let mut cb = Clipboard::new().map_err(|_| err_msg(AppError::CryptoError, Some("clipboard")))?;
    cb.set_text(text)
        .map_err(|_| err_msg(AppError::CryptoError, Some("clipboard")))?;
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_secs(30));
        if let Ok(mut c) = Clipboard::new() {
            let _ = c.clear();
        }
    });
    Ok(())
}

fn parse_favorites(raw: Option<String>) -> Vec<String> {
    raw.and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
        .unwrap_or_default()
}

fn parse_connection_name_presets(raw: Option<String>) -> Vec<ConnectionNamePreset> {
    let Some(s) = raw.filter(|x| !x.trim().is_empty()) else {
        return Vec::new();
    };
    if let Ok(v) = serde_json::from_str::<Vec<ConnectionNamePreset>>(&s) {
        return v
            .into_iter()
            .map(|mut p| {
                p.name = p.name.trim().to_string();
                p
            })
            .filter(|p| !p.name.is_empty())
            .collect();
    }
    if let Ok(strings) = serde_json::from_str::<Vec<String>>(&s) {
        return strings
            .into_iter()
            .map(|x| x.trim().to_string())
            .filter(|x| !x.is_empty())
            .map(|name| ConnectionNamePreset {
                id: String::new(),
                name,
                kind: ConnectionPresetKind::Rdp,
                environment_ids: Vec::new(),
            })
            .collect();
    }
    Vec::new()
}

fn parse_environments(raw: Option<String>) -> Vec<EnvironmentRow> {
    raw.filter(|x| !x.trim().is_empty())
        .and_then(|s| serde_json::from_str::<Vec<EnvironmentRow>>(&s).ok())
        .unwrap_or_default()
}

fn parse_version_options(raw: Option<String>) -> Vec<VersionOptionRow> {
    raw.filter(|x| !x.trim().is_empty())
        .and_then(|s| serde_json::from_str::<Vec<VersionOptionRow>>(&s).ok())
        .unwrap_or_default()
}

fn parse_release_options(raw: Option<String>) -> Vec<ReleaseOptionRow> {
    raw.filter(|x| !x.trim().is_empty())
        .and_then(|s| serde_json::from_str::<Vec<ReleaseOptionRow>>(&s).ok())
        .unwrap_or_default()
}

fn parse_contract_types(raw: Option<String>) -> Vec<ContractTypeRow> {
    raw.filter(|x| !x.trim().is_empty())
        .and_then(|s| serde_json::from_str::<Vec<ContractTypeRow>>(&s).ok())
        .unwrap_or_default()
}

fn parse_crm_modules(raw: Option<String>) -> Vec<CrmModuleRow> {
    raw.filter(|x| !x.trim().is_empty())
        .and_then(|s| serde_json::from_str::<Vec<CrmModuleRow>>(&s).ok())
        .unwrap_or_default()
}

fn parse_collaborator_competencies(raw: Option<String>) -> Vec<CollaboratorCompetencyRow> {
    raw.filter(|x| !x.trim().is_empty())
        .and_then(|s| serde_json::from_str::<Vec<CollaboratorCompetencyRow>>(&s).ok())
        .unwrap_or_default()
}

fn parse_dashboard_layout(raw: Option<String>) -> DashboardLayoutSettings {
    raw.filter(|x| !x.trim().is_empty())
        .and_then(|s| serde_json::from_str::<DashboardLayoutSettings>(&s).ok())
        .unwrap_or_default()
}

fn parse_client_card_modules(raw: Option<String>) -> ClientCardModulesSettings {
    raw.filter(|x| !x.trim().is_empty())
        .and_then(|s| serde_json::from_str::<ClientCardModulesSettings>(&s).ok())
        .unwrap_or_default()
}

fn parse_agenda_settings(raw: Option<String>) -> Option<AgendaSettingsDto> {
    raw.filter(|x| !x.trim().is_empty())
        .and_then(|s| serde_json::from_str::<AgendaSettingsDto>(&s).ok())
}

fn normalize_planning_reminder_pre_alert_minutes_vec(mut v: Vec<i64>) -> Vec<i64> {
    let max_m: i64 = 366 * 24 * 60;
    v.retain(|x| *x > 0 && *x <= max_m);
    v.sort_unstable_by(|a, b| b.cmp(a));
    v.dedup();
    if v.is_empty() {
        vec![
            7 * 24 * 60,
            2 * 24 * 60,
            24 * 60,
            60,
            30,
            5,
            1,
        ]
    } else {
        v
    }
}

fn parse_planning_reminder_pre_alert_minutes(raw: Option<String>) -> Vec<i64> {
    let Some(js) = raw.filter(|x| !x.trim().is_empty()) else {
        return normalize_planning_reminder_pre_alert_minutes_vec(Vec::new());
    };
    serde_json::from_str::<Vec<i64>>(&js)
        .map(normalize_planning_reminder_pre_alert_minutes_vec)
        .unwrap_or_else(|_| normalize_planning_reminder_pre_alert_minutes_vec(Vec::new()))
}

fn parse_planning_states(raw: Option<String>) -> Vec<PlanningStateRow> {
    raw.filter(|x| !x.trim().is_empty())
        .and_then(|s| serde_json::from_str::<Vec<PlanningStateRow>>(&s).ok())
        .unwrap_or_default()
}

fn clean_planning_state_row(mut r: PlanningStateRow) -> PlanningStateRow {
    if r.id.trim().is_empty() {
        r.id = Uuid::new_v4().to_string();
    } else {
        r.id = r.id.trim().to_string();
    }
    r.name = r.name.trim().to_string();
    if !r.associate_button {
        r.button_role = None;
    }
    // `is_default` dedup dopo la raccolta in `update_settings`.
    r
}

fn parse_planning_activity_types(raw: Option<String>) -> Vec<PlanningActivityTypeRow> {
    let Some(js) = raw.filter(|x| !x.trim().is_empty()) else {
        return Vec::new();
    };
    serde_json::from_str::<serde_json::Value>(&js)
        .ok()
        .and_then(|root| root.as_array().cloned())
        .map(|arr| arr.into_iter().map(planning_activity_type_from_json_value).collect())
        .unwrap_or_default()
}

fn parse_planning_activities(raw: Option<String>) -> Vec<PlanningActivityRow> {
    let mut rows: Vec<PlanningActivityRow> = raw
        .filter(|x| !x.trim().is_empty())
        .and_then(|s| serde_json::from_str::<Vec<PlanningActivityRow>>(&s).ok())
        .unwrap_or_default();
    for row in rows.iter_mut() {
        row.payload = consolidate_planning_payload(std::mem::take(&mut row.payload));
    }
    rows
}

/// Migra JSON vecchio (campo singoli 1–3) verso [`PlanningActivityTypeRow::fields`].
fn planning_activity_type_from_json_value(v: serde_json::Value) -> PlanningActivityTypeRow {
    let o = match v.as_object() {
        Some(m) => m,
        None => return PlanningActivityTypeRow::default(),
    };
    fn str_field(o: &serde_json::Map<String, serde_json::Value>, k: &str) -> String {
        o.get(k).and_then(|v| v.as_str()).unwrap_or("").trim().to_string()
    }
    fn bool_field(o: &serde_json::Map<String, serde_json::Value>, k: &str) -> bool {
        o.get(k).and_then(|v| v.as_bool()).unwrap_or(false)
    }
    fn legacy_kind(o: &serde_json::Map<String, serde_json::Value>, camel: &str) -> PlanningCustomFieldKind {
        o.get(camel).and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default()
    }

    let id = str_field(o, "id");
    let name = str_field(o, "name");
    let mut fields: Vec<PlanningFieldDef> = o
        .get("fields")
        .and_then(|f| serde_json::from_value(f.clone()).ok())
        .unwrap_or_default();

    if fields.is_empty() {
        fn push_legacy(
            acc: &mut Vec<PlanningFieldDef>,
            id: &'static str,
            kind: PlanningCustomFieldKind,
            label: String,
        ) {
            match kind {
                PlanningCustomFieldKind::None => {}
                PlanningCustomFieldKind::ComboBox | PlanningCustomFieldKind::SelectList => {}
                _ => {
                    if label.trim().is_empty() {
                        return;
                    }
                    acc.push(PlanningFieldDef {
                        id: id.to_string(),
                        label,
                        kind,
                        catalog_ref: None,
                        visible_in_reminder_sidebar: false,
                    });
                }
            }
        }

        push_legacy(
            &mut fields,
            "legacy-field-1",
            legacy_kind(o, "field1Kind"),
            str_field(o, "field1Label"),
        );
        push_legacy(
            &mut fields,
            "legacy-field-2",
            legacy_kind(o, "field2Kind"),
            str_field(o, "field2Label"),
        );
        push_legacy(
            &mut fields,
            "legacy-field-3",
            legacy_kind(o, "field3Kind"),
            str_field(o, "field3Label"),
        );
    }

    PlanningActivityTypeRow {
        id,
        name,
        fields,
        show_status: bool_field(o, "showStatus"),
        show_start_date: bool_field(o, "showStartDate"),
        show_end_date: bool_field(o, "showEndDate"),
        show_reminder: bool_field(o, "showReminder"),
        show_btn_completed: bool_field(o, "showBtnCompleted"),
        show_btn_todo: bool_field(o, "showBtnTodo"),
        show_btn_restore_status: bool_field(o, "showBtnRestoreStatus"),
        show_btn_planned: bool_field(o, "showBtnPlanned"),
        use_contacts: bool_field(o, "useContacts"),
    }
}

fn consolidate_planning_payload(mut p: PlanningActivityPayload) -> PlanningActivityPayload {
    let mut map = std::mem::take(&mut p.field_values);
    if p.field1.is_some() || p.field2.is_some() || p.field3.is_some() {
        if let Some(v) = p.field1.take() {
            map.entry("legacy-field-1".into()).or_insert(v);
        }
        if let Some(v) = p.field2.take() {
            map.entry("legacy-field-2".into()).or_insert(v);
        }
        if let Some(v) = p.field3.take() {
            map.entry("legacy-field-3".into()).or_insert(v);
        }
    }
    PlanningActivityPayload {
        field_values: map,
        field1: None,
        field2: None,
        field3: None,
        start_date: p.start_date,
        end_date: p.end_date,
        reminder_at: p.reminder_at,
        status_id: p.status_id.clone().and_then(|s| {
            let t = s.trim().to_string();
            if t.is_empty() {
                None
            } else {
                Some(t)
            }
        }),
    }
}

fn clean_planning_activity_type_row(mut r: PlanningActivityTypeRow) -> PlanningActivityTypeRow {
    if r.id.trim().is_empty() {
        r.id.clear();
    } else {
        r.id = r.id.trim().to_string();
    }
    r.name = r.name.trim().to_string();
    r.fields = r
        .fields
        .into_iter()
        .filter_map(|mut f| {
            f.label = f.label.trim().to_string();
            if f.id.trim().is_empty() {
                f.id = Uuid::new_v4().to_string();
            } else {
                f.id = f.id.trim().to_string();
            }
            match f.kind {
                PlanningCustomFieldKind::None => None,
                PlanningCustomFieldKind::ComboBox | PlanningCustomFieldKind::SelectList => {
                    f.catalog_ref?;
                    Some(f)
                }
                _ => {
                    if f.label.is_empty() {
                        None
                    } else {
                        Some(f)
                    }
                }
            }
        })
        .collect();
    r
}

fn ensure_preset_ids(
    conn: &Connection,
    presets: &mut Vec<ConnectionNamePreset>,
) -> Result<(), rusqlite::Error> {
    let mut changed = false;
    for p in presets.iter_mut() {
        if p.id.trim().is_empty() {
            p.id = Uuid::new_v4().to_string();
            changed = true;
        }
    }
    if changed {
        let s = serde_json::to_string(presets).map_err(|_| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "preset json",
            )))
        })?;
        db::set_setting(conn, SETTING_RDP_PRESETS, &s)?;
    }
    Ok(())
}

fn normalize_web_url(url: &str) -> Result<String, String> {
    let t = url.trim();
    if t.is_empty() {
        return Err(err_msg(AppError::ValidationError, Some("URL obbligatorio")));
    }
    if t.starts_with("http://") || t.starts_with("https://") {
        Ok(t.to_string())
    } else {
        Ok(format!("https://{t}"))
    }
}

fn validate_port(port: i64) -> Result<(), String> {
    if !(1..=65535).contains(&port) {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Porta non valida (1-65535)"),
        ));
    }
    Ok(())
}

/// VPN predefinita sul cliente o unica VPN del cliente: vale per tutte le RDP di quel cliente.
fn forced_vpn_for_client(conn: &Connection, client_id: &str) -> Result<Option<String>, String> {
    let client = db::get_client(conn, client_id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Cliente non trovato")))?;
    if let Some(ref dv) = client.default_vpn_id {
        return Ok(Some(dv.clone()));
    }
    db::single_vpn_id_for_client(conn, client_id).map_err(db_err)
}

fn require_active_client(conn: &Connection, client_id: &str) -> Result<(), String> {
    let c = db::get_client(conn, client_id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::ValidationError, Some("Cliente non valido")))?;
    if c.obsolete {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Cliente obsoleto: riattivalo in Impostazioni per usarlo."),
        ));
    }
    Ok(())
}

#[tauri::command]
fn get_clients(state: tauri::State<AppState>) -> Result<Vec<Client>, String> {
    let conn = open(&state)?;
    db::list_clients(&conn).map_err(db_err)
}

#[tauri::command]
fn get_clients_all(state: tauri::State<AppState>) -> Result<Vec<Client>, String> {
    let conn = open(&state)?;
    db::list_clients_all(&conn).map_err(db_err)
}

#[tauri::command]
fn get_client(state: tauri::State<AppState>, id: String) -> Result<Client, String> {
    let conn = open(&state)?;
    db::get_client(&conn, &id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Cliente non trovato")))
}

#[tauri::command]
fn create_client(
    state: tauri::State<AppState>,
    input: CreateClientInput,
) -> Result<Client, String> {
    if input.name.trim().is_empty() {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Nome cliente obbligatorio"),
        ));
    }
    let conn = open(&state)?;
    db::create_client(&conn, &input).map_err(db_err)
}

#[tauri::command]
fn update_client(
    state: tauri::State<AppState>,
    id: String,
    input: UpdateClientInput,
) -> Result<(), String> {
    let conn = open(&state)?;
    if db::get_client(&conn, &id).map_err(db_err)?.is_none() {
        return Err(err_msg(AppError::NotFound, Some("Cliente non trovato")));
    }
    if let Some(Some(ref vid)) = input.default_vpn_id {
        if !db::vpn_belongs_to_client(&conn, vid, &id).map_err(db_err)? {
            return Err(err_msg(
                AppError::ValidationError,
                Some("La VPN predefinita deve appartenere a questo cliente"),
            ));
        }
    }
    db::update_client(&conn, &id, &input).map_err(db_err)
}

#[tauri::command]
fn delete_client(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let conn = open(&state)?;
    if db::get_client(&conn, &id).map_err(db_err)?.is_none() {
        return Err(err_msg(AppError::NotFound, Some("Cliente non trovato")));
    }
    db::delete_client(&conn, &id).map_err(db_err)
}

fn build_tel_uri(raw: &str) -> Option<String> {
    let t = raw.trim();
    if t.is_empty() {
        return None;
    }
    let has_plus = t.starts_with('+');
    let digits: String = t.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    let n = if has_plus {
        format!("+{}", digits)
    } else {
        digits
    };
    Some(format!("tel:{n}"))
}

#[tauri::command]
fn get_contacts_by_client(
    state: tauri::State<AppState>,
    client_id: String,
) -> Result<Vec<ClientContact>, String> {
    let conn = open(&state)?;
    db::list_contacts_by_client(&conn, &client_id).map_err(db_err)
}

#[tauri::command]
fn get_all_contacts(state: tauri::State<AppState>) -> Result<Vec<ClientContact>, String> {
    let conn = open(&state)?;
    db::list_contacts_all_visible_clients(&conn).map_err(db_err)
}

#[tauri::command]
fn create_contact(
    state: tauri::State<AppState>,
    input: CreateClientContactInput,
) -> Result<ClientContact, String> {
    if input.first_name.trim().is_empty() && input.last_name.trim().is_empty() {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Indica almeno nome o cognome"),
        ));
    }
    if input.client_id.trim().is_empty() {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Cliente obbligatorio"),
        ));
    }
    let conn = open(&state)?;
    db::create_client_contact(&conn, &input).map_err(db_err)
}

#[tauri::command]
fn update_contact(
    state: tauri::State<AppState>,
    id: String,
    input: UpdateClientContactInput,
) -> Result<(), String> {
    let conn = open(&state)?;
    if db::get_client_contact(&conn, &id)
        .map_err(db_err)?
        .is_none()
    {
        return Err(err_msg(AppError::NotFound, Some("Contatto non trovato")));
    }
    db::update_client_contact(&conn, &id, &input).map_err(db_err)
}

#[tauri::command]
fn delete_contact(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let conn = open(&state)?;
    if db::get_client_contact(&conn, &id)
        .map_err(db_err)?
        .is_none()
    {
        return Err(err_msg(AppError::NotFound, Some("Contatto non trovato")));
    }
    db::delete_client_contact(&conn, &id).map_err(db_err)
}

#[tauri::command]
fn dial_phone_number(number: String) -> Result<(), String> {
    let uri = build_tel_uri(&number).ok_or_else(|| {
        err_msg(
            AppError::ValidationError,
            Some("Numero non valido per la composizione"),
        )
    })?;
    open::that(&uri).map_err(|e| {
        err_msg(
            AppError::ValidationError,
            Some(&format!("Impossibile avviare la chiamata: {e}")),
        )
    })?;
    Ok(())
}

#[tauri::command]
fn open_contact_mailto(email: String) -> Result<(), String> {
    let e = email.trim();
    if e.len() > 254 || !e.contains('@') {
        return Err(err_msg(AppError::ValidationError, Some("Email non valida")));
    }
    if e.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err(err_msg(AppError::ValidationError, Some("Email non valida")));
    }
    let uri = format!("mailto:{e}");
    open::that(&uri).map_err(|e| {
        err_msg(
            AppError::ValidationError,
            Some(&format!("Impossibile aprire il client email: {e}")),
        )
    })?;
    Ok(())
}

#[tauri::command]
fn open_https_url(url: String) -> Result<(), String> {
    let mut u = url.trim().to_string();
    if u.is_empty() {
        return Err(err_msg(AppError::ValidationError, Some("URL vuota")));
    }
    if !u.contains("://") {
        u = format!("https://{u}");
    }
    open::that(&u).map_err(|e| {
        err_msg(
            AppError::ValidationError,
            Some(&format!("Impossibile aprire il collegamento: {e}")),
        )
    })?;
    Ok(())
}

#[tauri::command]
fn get_collaborator_roles(state: tauri::State<AppState>) -> Result<Vec<CollaboratorRole>, String> {
    let conn = open(&state)?;
    db::list_collaborator_roles(&conn).map_err(db_err)
}

#[tauri::command]
fn create_collaborator_role(
    state: tauri::State<AppState>,
    input: CreateCollaboratorRoleInput,
) -> Result<CollaboratorRole, String> {
    let conn = open(&state)?;
    db::create_collaborator_role(&conn, &input).map_err(db_err)
}

#[tauri::command]
fn update_collaborator_role(
    state: tauri::State<AppState>,
    id: String,
    input: UpdateCollaboratorRoleInput,
) -> Result<(), String> {
    let conn = open(&state)?;
    if !db::collaborator_role_exists(&conn, &id).map_err(db_err)? {
        return Err(err_msg(AppError::NotFound, Some("Ruolo non trovato")));
    }
    db::update_collaborator_role(&conn, &id, &input).map_err(db_err)
}

#[tauri::command]
fn delete_collaborator_role(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let conn = open(&state)?;
    if !db::collaborator_role_exists(&conn, &id).map_err(db_err)? {
        return Err(err_msg(AppError::NotFound, Some("Ruolo non trovato")));
    }
    db::delete_collaborator_role(&conn, &id).map_err(db_err)
}

#[tauri::command]
fn get_collaborators(state: tauri::State<AppState>) -> Result<Vec<Collaborator>, String> {
    let conn = open(&state)?;
    db::list_collaborators(&conn).map_err(db_err)
}

#[tauri::command]
fn get_collaborators_for_client(
    state: tauri::State<AppState>,
    client_id: String,
) -> Result<Vec<Collaborator>, String> {
    let conn = open(&state)?;
    db::list_collaborators_for_client(&conn, &client_id).map_err(db_err)
}

#[tauri::command]
fn create_collaborator(
    state: tauri::State<AppState>,
    input: CreateCollaboratorInput,
) -> Result<Collaborator, String> {
    let conn = open(&state)?;
    db::create_collaborator(&conn, &input).map_err(db_err)
}

#[tauri::command]
fn update_collaborator(
    state: tauri::State<AppState>,
    id: String,
    input: UpdateCollaboratorInput,
) -> Result<(), String> {
    let conn = open(&state)?;
    if db::collaborator_by_id_public(&conn, &id)
        .map_err(db_err)?
        .is_none()
    {
        return Err(err_msg(
            AppError::NotFound,
            Some("Collaboratore non trovato"),
        ));
    }
    db::update_collaborator(&conn, &id, &input).map_err(db_err)
}

#[tauri::command]
fn delete_collaborator(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let conn = open(&state)?;
    if !db::collaborator_exists(&conn, &id).map_err(db_err)? {
        return Err(err_msg(
            AppError::NotFound,
            Some("Collaboratore non trovato"),
        ));
    }
    db::delete_collaborator(&conn, &id).map_err(db_err)
}

#[tauri::command]
fn get_rdp_connections(state: tauri::State<AppState>) -> Result<Vec<RdpConnection>, String> {
    let conn = open(&state)?;
    db::list_rdp(&conn).map_err(db_err)
}

#[tauri::command]
fn get_rdp_by_client(
    state: tauri::State<AppState>,
    client_id: String,
) -> Result<Vec<RdpConnection>, String> {
    let conn = open(&state)?;
    db::list_rdp_by_client(&conn, &client_id).map_err(db_err)
}

#[tauri::command]
fn get_rdp(state: tauri::State<AppState>, id: String) -> Result<RdpConnection, String> {
    let conn = open(&state)?;
    db::get_rdp(&conn, &id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Connessione RDP non trovata")))
}

#[tauri::command]
fn preview_rdp_file(path: String) -> Result<RdpFilePreview, String> {
    let t = path.trim();
    if t.is_empty() {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Percorso file vuoto"),
        ));
    }
    let parsed = crate::rdp_file::parse_rdp_file(Path::new(t))?;
    Ok(RdpFilePreview {
        host: parsed.host,
        port: parsed.port,
        username: parsed.username,
        domain: parsed.domain,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RdpFilePreview {
    host: String,
    port: i64,
    username: Option<String>,
    domain: Option<String>,
}

#[tauri::command]
fn create_rdp(
    state: tauri::State<AppState>,
    mut input: CreateRdpInput,
) -> Result<RdpConnection, String> {
    if input.name.trim().is_empty() {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Nome connessione obbligatorio"),
        ));
    }
    let file_trimmed = input
        .rdp_file_path
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let mut eff_host = input.host.trim().to_string();
    let mut eff_port = input.port.unwrap_or(3389);
    let mut eff_username = input.username.clone();
    let mut eff_domain = input.domain.clone();

    let stored_path = file_trimmed.clone();

    if let Some(ref p) = file_trimmed {
        let parsed = crate::rdp_file::parse_rdp_file(Path::new(p))?;
        eff_host = parsed.host;
        eff_port = parsed.port;
        if eff_username
            .as_ref()
            .map(|s| s.trim().is_empty())
            .unwrap_or(true)
        {
            eff_username = parsed.username;
        }
        if eff_domain
            .as_ref()
            .map(|s| s.trim().is_empty())
            .unwrap_or(true)
        {
            eff_domain = parsed.domain;
        }
    } else if eff_host.is_empty() {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Host obbligatorio, oppure scegli un file .rdp"),
        ));
    }

    validate_port(eff_port)?;

    input.host = eff_host;
    input.port = Some(eff_port);
    input.username = eff_username;
    input.domain = eff_domain;
    input.rdp_file_path = stored_path;

    let conn = open(&state)?;
    require_active_client(&conn, &input.client_id)?;
    if let Some(vid) = forced_vpn_for_client(&conn, &input.client_id)? {
        input.vpn_id = Some(vid);
    }
    let enc_pw = if let Some(p) = &input.password_plain {
        if p.is_empty() {
            None
        } else {
            let key = vault_unlocked_key(&state)?;
            Some(
                encrypt_aes256_gcm(key.as_ref(), p)
                    .map_err(|_| err_msg(AppError::CryptoError, Some("cifratura password")))?,
            )
        }
    } else {
        None
    };
    db::create_rdp(&conn, &input, enc_pw).map_err(db_err)
}

#[tauri::command]
fn update_rdp(
    state: tauri::State<AppState>,
    id: String,
    mut input: UpdateRdpInput,
) -> Result<(), String> {
    let conn = open(&state)?;
    let existing = db::get_rdp(&conn, &id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Connessione RDP non trovata")))?;

    if let Some(ref new_fp) = input.rdp_file_path {
        let t = new_fp.trim();
        if !t.is_empty() {
            let old = existing
                .rdp_file_path
                .as_deref()
                .map(|s| s.trim())
                .unwrap_or("");
            if t != old {
                let parsed = crate::rdp_file::parse_rdp_file(Path::new(t))?;
                input.host = Some(parsed.host);
                input.port = Some(parsed.port);
                if input
                    .username
                    .as_ref()
                    .map(|s| s.trim().is_empty())
                    .unwrap_or(true)
                {
                    input.username = parsed.username;
                }
                if input
                    .domain
                    .as_ref()
                    .map(|s| s.trim().is_empty())
                    .unwrap_or(true)
                {
                    input.domain = parsed.domain;
                }
            }
        }
    }

    if let Some(p) = input.port {
        validate_port(p)?;
    }

    let cid = input
        .client_id
        .as_ref()
        .unwrap_or(&existing.client_id)
        .clone();
    require_active_client(&conn, &cid)?;
    if let Some(vid) = forced_vpn_for_client(&conn, &cid)? {
        input.vpn_id = Some(vid);
    }

    let pw_change = if input.clear_password == Some(true) {
        PasswordChange::Clear
    } else if let Some(p) = &input.password_plain {
        if p.is_empty() {
            PasswordChange::NoOp
        } else {
            let key = vault_unlocked_key(&state)?;
            PasswordChange::Set(
                encrypt_aes256_gcm(key.as_ref(), p)
                    .map_err(|_| err_msg(AppError::CryptoError, Some("cifratura password")))?,
            )
        }
    } else {
        PasswordChange::NoOp
    };
    db::update_rdp(&conn, &id, &input, pw_change).map_err(db_err)
}

#[tauri::command]
fn delete_rdp(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let conn = open(&state)?;
    if db::get_rdp(&conn, &id).map_err(db_err)?.is_none() {
        return Err(err_msg(
            AppError::NotFound,
            Some("Connessione RDP non trovata"),
        ));
    }
    db::delete_rdp(&conn, &id).map_err(db_err)
}

#[tauri::command]
fn launch_rdp(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let conn = open(&state)?;
    let rdp = db::get_rdp(&conn, &id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Connessione RDP non trovata")))?;
    let pw_plain =
        match &rdp.password_encrypted {
            Some(blob) => {
                let key = vault_unlocked_key(&state)?;
                Some(decrypt_aes256_gcm(key.as_ref(), blob).map_err(|_| {
                    err_msg(AppError::CryptoError, Some("password non decifrabile"))
                })?)
            }
            None => None,
        };
    let pw_slice = pw_plain.as_deref();
    rdp::launch_rdp_connection(&rdp, pw_slice)?;
    let _ = db::insert_audit(&conn, "launch_rdp", "rdp", Some(&id));
    Ok(())
}

#[tauri::command]
fn copy_rdp_field(state: tauri::State<AppState>, id: String, field: String) -> Result<(), String> {
    let conn = open(&state)?;
    let rdp = db::get_rdp(&conn, &id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Connessione RDP non trovata")))?;
    let text = match field.as_str() {
        "host" => rdp.host.trim().to_string(),
        "username" => rdp
            .username
            .clone()
            .unwrap_or_else(|| "".into())
            .trim()
            .to_string(),
        "password" => {
            let key = vault_unlocked_key(&state)?;
            let blob = rdp
                .password_encrypted
                .as_ref()
                .ok_or_else(|| err_msg(AppError::CryptoError, Some("password assente")))?;
            decrypt_aes256_gcm(key.as_ref(), blob)
                .map_err(|_| err_msg(AppError::CryptoError, Some("password non decifrabile")))?
        }
        _ => {
            return Err(err_msg(
                AppError::ValidationError,
                Some("campo sconosciuto"),
            ))
        }
    };
    clip_copy(text)
}

#[tauri::command]
fn reveal_rdp_password(
    state: tauri::State<AppState>,
    id: String,
) -> Result<Option<String>, String> {
    let conn = open(&state)?;
    let rdp = db::get_rdp(&conn, &id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Connessione RDP non trovata")))?;
    let Some(ref blob) = rdp.password_encrypted else {
        return Ok(None);
    };
    let key = vault_unlocked_key(&state)?;
    let plain = decrypt_aes256_gcm(key.as_ref(), blob)
        .map_err(|_| err_msg(AppError::CryptoError, Some("password non decifrabile")))?;
    Ok(Some(plain))
}

#[tauri::command]
fn get_vpn_connections(state: tauri::State<AppState>) -> Result<Vec<VpnConnection>, String> {
    let conn = open(&state)?;
    db::list_vpn(&conn).map_err(db_err)
}

#[tauri::command]
fn get_vpn_by_client(
    state: tauri::State<AppState>,
    client_id: String,
) -> Result<Vec<VpnConnection>, String> {
    let conn = open(&state)?;
    db::list_vpn_by_client(&conn, &client_id).map_err(db_err)
}

#[tauri::command]
fn get_vpn(state: tauri::State<AppState>, id: String) -> Result<VpnConnection, String> {
    let conn = open(&state)?;
    db::get_vpn(&conn, &id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Connessione VPN non trovata")))
}

#[tauri::command]
fn create_vpn(
    state: tauri::State<AppState>,
    input: CreateVpnInput,
) -> Result<VpnConnection, String> {
    if input.name.trim().is_empty() || input.type_.trim().is_empty() {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Nome e tipo VPN obbligatori"),
        ));
    }
    let conn = open(&state)?;
    require_active_client(&conn, &input.client_id)?;
    let enc_pw = if let Some(p) = &input.password_plain {
        if p.is_empty() {
            None
        } else {
            let key = vault_unlocked_key(&state)?;
            Some(
                encrypt_aes256_gcm(key.as_ref(), p)
                    .map_err(|_| err_msg(AppError::CryptoError, Some("cifratura password")))?,
            )
        }
    } else {
        None
    };
    db::create_vpn(&conn, &input, enc_pw).map_err(db_err)
}

#[tauri::command]
fn update_vpn(
    state: tauri::State<AppState>,
    id: String,
    input: UpdateVpnInput,
) -> Result<(), String> {
    let conn = open(&state)?;
    let existing = db::get_vpn(&conn, &id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Connessione VPN non trovata")))?;
    let target_client = input
        .client_id
        .clone()
        .unwrap_or_else(|| existing.client_id.clone());
    require_active_client(&conn, &target_client)?;
    let pw_change = if input.clear_password == Some(true) {
        PasswordChange::Clear
    } else if let Some(p) = &input.password_plain {
        if p.is_empty() {
            PasswordChange::NoOp
        } else {
            let key = vault_unlocked_key(&state)?;
            PasswordChange::Set(
                encrypt_aes256_gcm(key.as_ref(), p)
                    .map_err(|_| err_msg(AppError::CryptoError, Some("cifratura password")))?,
            )
        }
    } else {
        PasswordChange::NoOp
    };
    db::update_vpn(&conn, &id, &input, pw_change).map_err(db_err)
}

#[tauri::command]
fn delete_vpn(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let conn = open(&state)?;
    if db::get_vpn(&conn, &id).map_err(db_err)?.is_none() {
        return Err(err_msg(
            AppError::NotFound,
            Some("Connessione VPN non trovata"),
        ));
    }
    db::delete_vpn(&conn, &id).map_err(db_err)
}

#[tauri::command]
fn list_windows_vpn_profiles() -> Result<Vec<String>, String> {
    vpn::list_windows_vpn_profiles()
}

#[tauri::command]
fn launch_vpn(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let conn = open(&state)?;
    let vpn = db::get_vpn(&conn, &id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Connessione VPN non trovata")))?;
    let pw_plain =
        match &vpn.password_encrypted {
            Some(blob) => {
                let key = vault_unlocked_key(&state)?;
                Some(decrypt_aes256_gcm(key.as_ref(), blob).map_err(|_| {
                    err_msg(AppError::CryptoError, Some("password non decifrabile"))
                })?)
            }
            None => None,
        };
    vpn::launch_vpn_connection(&vpn, pw_plain.as_deref())?;
    let _ = db::insert_audit(&conn, "launch_vpn", "vpn", Some(&id));
    Ok(())
}

#[tauri::command]
fn copy_vpn_field(state: tauri::State<AppState>, id: String, field: String) -> Result<(), String> {
    let conn = open(&state)?;
    let vpn = db::get_vpn(&conn, &id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Connessione VPN non trovata")))?;
    let text = match field.as_str() {
        "server" => vpn.server.clone().unwrap_or_default(),
        "username" => vpn.username.clone().unwrap_or_default(),
        "password" => {
            let key = vault_unlocked_key(&state)?;
            let blob = vpn
                .password_encrypted
                .as_ref()
                .ok_or_else(|| err_msg(AppError::CryptoError, Some("password assente")))?;
            decrypt_aes256_gcm(key.as_ref(), blob)
                .map_err(|_| err_msg(AppError::CryptoError, Some("password non decifrabile")))?
        }
        _ => {
            return Err(err_msg(
                AppError::ValidationError,
                Some("campo sconosciuto"),
            ))
        }
    };
    clip_copy(text)
}

#[tauri::command]
fn get_web_connections(state: tauri::State<AppState>) -> Result<Vec<WebAccess>, String> {
    let conn = open(&state)?;
    db::list_web(&conn).map_err(db_err)
}

#[tauri::command]
fn get_web_by_client(
    state: tauri::State<AppState>,
    client_id: String,
) -> Result<Vec<WebAccess>, String> {
    let conn = open(&state)?;
    db::list_web_by_client(&conn, &client_id).map_err(db_err)
}

#[tauri::command]
fn get_web_access(state: tauri::State<AppState>, id: String) -> Result<WebAccess, String> {
    let conn = open(&state)?;
    db::get_web(&conn, &id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Accesso web non trovato")))
}

#[tauri::command]
fn create_web_access(
    state: tauri::State<AppState>,
    mut input: CreateWebAccessInput,
) -> Result<WebAccess, String> {
    if input.name.trim().is_empty() {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Nome obbligatorio"),
        ));
    }
    input.url = normalize_web_url(&input.url)?;
    let conn = open(&state)?;
    require_active_client(&conn, &input.client_id)?;
    let enc_pw = if let Some(p) = &input.password_plain {
        if p.is_empty() {
            None
        } else {
            let key = vault_unlocked_key(&state)?;
            Some(
                encrypt_aes256_gcm(key.as_ref(), p)
                    .map_err(|_| err_msg(AppError::CryptoError, Some("cifratura password")))?,
            )
        }
    } else {
        None
    };
    db::create_web(&conn, &input, enc_pw).map_err(db_err)
}

#[tauri::command]
fn update_web_access(
    state: tauri::State<AppState>,
    id: String,
    mut input: UpdateWebAccessInput,
) -> Result<(), String> {
    let conn = open(&state)?;
    let existing = db::get_web(&conn, &id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Accesso web non trovato")))?;
    let target_client = input
        .client_id
        .clone()
        .unwrap_or_else(|| existing.client_id.clone());
    require_active_client(&conn, &target_client)?;
    if let Some(u) = input.url.clone() {
        input.url = Some(normalize_web_url(&u)?);
    }
    let pw_change = if input.clear_password == Some(true) {
        PasswordChange::Clear
    } else if let Some(p) = &input.password_plain {
        if p.is_empty() {
            PasswordChange::NoOp
        } else {
            let key = vault_unlocked_key(&state)?;
            PasswordChange::Set(
                encrypt_aes256_gcm(key.as_ref(), p)
                    .map_err(|_| err_msg(AppError::CryptoError, Some("cifratura password")))?,
            )
        }
    } else {
        PasswordChange::NoOp
    };
    db::update_web(&conn, &id, &input, pw_change).map_err(db_err)
}

#[tauri::command]
fn delete_web_access(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let conn = open(&state)?;
    if db::get_web(&conn, &id).map_err(db_err)?.is_none() {
        return Err(err_msg(AppError::NotFound, Some("Accesso web non trovato")));
    }
    db::delete_web(&conn, &id).map_err(db_err)
}

#[tauri::command]
fn launch_web_access(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let conn = open(&state)?;
    let row = db::get_web(&conn, &id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Accesso web non trovato")))?;
    let url = normalize_web_url(&row.url)?;
    open::that(&url).map_err(|e| {
        err_msg(
            AppError::ValidationError,
            Some(&format!("Impossibile aprire il browser: {e}")),
        )
    })?;
    let _ = db::insert_audit(&conn, "launch_web", "web_access", Some(&id));
    Ok(())
}

#[tauri::command]
fn copy_web_field(state: tauri::State<AppState>, id: String, field: String) -> Result<(), String> {
    let conn = open(&state)?;
    let row = db::get_web(&conn, &id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Accesso web non trovato")))?;
    let text = match field.as_str() {
        "url" => row.url.clone(),
        "username" => row.username.clone().unwrap_or_default(),
        "domain" => row.domain.clone().unwrap_or_default(),
        "password" => {
            let key = vault_unlocked_key(&state)?;
            let blob = row
                .password_encrypted
                .as_ref()
                .ok_or_else(|| err_msg(AppError::CryptoError, Some("password assente")))?;
            decrypt_aes256_gcm(key.as_ref(), blob)
                .map_err(|_| err_msg(AppError::CryptoError, Some("password non decifrabile")))?
        }
        _ => {
            return Err(err_msg(
                AppError::ValidationError,
                Some("campo sconosciuto"),
            ))
        }
    };
    clip_copy(text)
}

#[tauri::command]
fn reveal_web_password(
    state: tauri::State<AppState>,
    id: String,
) -> Result<Option<String>, String> {
    let conn = open(&state)?;
    let row = db::get_web(&conn, &id)
        .map_err(db_err)?
        .ok_or_else(|| err_msg(AppError::NotFound, Some("Accesso web non trovato")))?;
    let Some(ref blob) = row.password_encrypted else {
        return Ok(None);
    };
    let key = vault_unlocked_key(&state)?;
    let plain = decrypt_aes256_gcm(key.as_ref(), blob)
        .map_err(|_| err_msg(AppError::CryptoError, Some("password non decifrabile")))?;
    Ok(Some(plain))
}

#[tauri::command]
fn set_master_password(state: tauri::State<AppState>, password: String) -> Result<(), String> {
    if password.len() < 8 {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Password troppo corta (min 8 caratteri)"),
        ));
    }
    let conn = open(&state)?;
    if db::get_setting(&conn, KDF_SALT_KEY)
        .map_err(db_err)?
        .is_some()
    {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Vault già configurato"),
        ));
    }
    install_new_vault(&*state, &password)
}

#[tauri::command]
fn unlock_vault(state: tauri::State<AppState>, password: String) -> Result<VaultStatus, String> {
    let conn = open(&state)?;
    let derived = derive_unlock_key_from_password(&conn, &password)?;
    let mut g = state
        .vault_key
        .lock()
        .map_err(|_| err_msg(AppError::CryptoError, None))?;
    *g = Some(derived.clone());
    drop(g);
    persist_vault_session_key(&*state, &derived);
    Ok(VaultStatus {
        configured: true,
        unlocked: true,
    })
}

/// Verifica la master password senza sbloccare il vault in RAM (per gate UI es. eliminazione clienti).
#[tauri::command]
fn verify_vault_master_password(
    state: tauri::State<AppState>,
    password: String,
) -> Result<(), String> {
    let conn = open(&state)?;
    let _ = derive_unlock_key_from_password(&conn, &password)?;
    Ok(())
}

#[tauri::command]
fn change_vault_master_password(
    state: tauri::State<AppState>,
    current_password: String,
    new_password: String,
) -> Result<VaultStatus, String> {
    if new_password.len() < 8 {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Nuova password troppo corta (min 8 caratteri)"),
        ));
    }
    let conn = open(&state)?;
    let old_derived = derive_unlock_key_from_password(&conn, &current_password)?;
    let (rdp_p, vpn_p, web_p) = collect_plaintext_secrets(&conn, &old_derived)?;
    let new_derived = write_new_vault_salt_and_verifier(&conn, &new_password)?;
    apply_rotated_passwords(&conn, &new_derived, rdp_p, vpn_p, web_p)?;
    finalize_vault_session_ram(&state, &new_derived)?;
    Ok(VaultStatus {
        configured: true,
        unlocked: true,
    })
}

#[tauri::command]
fn export_vault_recovery_kit(
    state: tauri::State<AppState>,
    path: String,
    recovery_passphrase: String,
) -> Result<(), String> {
    if recovery_passphrase.len() < 8 {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Passphrase recupero troppo corta (min 8 caratteri)"),
        ));
    }
    let vault_key = vault_unlocked_key(&state)?;
    let recovery_salt_b64 =
        generate_kdf_salt_b64().map_err(|_| err_msg(AppError::CryptoError, None))?;
    let salt_bytes = STANDARD
        .decode(&recovery_salt_b64)
        .map_err(|_| err_msg(AppError::CryptoError, Some("salt")))?;
    let r_derived = derive_key_argon2id(
        recovery_passphrase.as_bytes(),
        &salt_bytes,
        Some("balanced"),
    )
    .map_err(|_| err_msg(AppError::CryptoError, Some("derivazione recupero")))?;
    let inner_b64 = STANDARD.encode(vault_key.as_ref());
    let wrapped_vault_key_b64 = encrypt_aes256_gcm(r_derived.as_ref(), &inner_b64)
        .map_err(|_| err_msg(AppError::CryptoError, Some("cifratura kit")))?;
    let kit = VaultRecoveryKitV1 {
        version: 1,
        recovery_salt_b64,
        wrapped_vault_key_b64,
    };
    let json =
        serde_json::to_string_pretty(&kit).map_err(|_| err_msg(AppError::CryptoError, None))?;
    std::fs::write(PathBuf::from(path), json)
        .map_err(|e| err_msg(AppError::CryptoError, Some(&format!("scrittura file: {e}"))))
}

#[tauri::command]
fn recover_vault_with_recovery_kit(
    state: tauri::State<AppState>,
    path: String,
    recovery_passphrase: String,
    new_master_password: String,
) -> Result<VaultStatus, String> {
    if new_master_password.len() < 8 {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Nuova master password troppo corta (min 8 caratteri)"),
        ));
    }
    let raw = std::fs::read_to_string(PathBuf::from(path))
        .map_err(|e| err_msg(AppError::CryptoError, Some(&e.to_string())))?;
    let kit: VaultRecoveryKitV1 = serde_json::from_str(&raw)
        .map_err(|_| err_msg(AppError::CryptoError, Some("File recupero non valido")))?;
    if kit.version != 1 {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Versione file recupero non supportata"),
        ));
    }
    let old_key = unwrap_vault_key_with_recovery_passphrase(&kit, &recovery_passphrase)?;
    let conn = open(&state)?;
    verify_vault_key_matches_verifier(&conn, &old_key)?;
    let (rdp_p, vpn_p, web_p) = collect_plaintext_secrets(&conn, &old_key)?;
    let new_derived = write_new_vault_salt_and_verifier(&conn, &new_master_password)?;
    apply_rotated_passwords(&conn, &new_derived, rdp_p, vpn_p, web_p)?;
    finalize_vault_session_ram(&state, &new_derived)?;
    Ok(VaultStatus {
        configured: true,
        unlocked: true,
    })
}

#[tauri::command]
fn reset_vault_wipe_secrets(
    state: tauri::State<AppState>,
    confirmation: String,
) -> Result<(), String> {
    if confirmation.trim() != "RESETTA" {
        return Err(err_msg(
            AppError::ValidationError,
            Some("Digita esattamente RESETTA per confermare"),
        ));
    }
    let conn = open(&state)?;
    db::delete_setting(&conn, KDF_SALT_KEY).map_err(db_err)?;
    db::delete_setting(&conn, VAULT_VERIFIER_KEY).map_err(db_err)?;
    db::delete_setting(&conn, VAULT_KDF_PRESET).map_err(db_err)?;
    db::clear_all_password_encrypted(&conn).map_err(db_err)?;
    let mut g = state
        .vault_key
        .lock()
        .map_err(|_| err_msg(AppError::CryptoError, None))?;
    *g = None;
    drop(g);
    clear_vault_session_storage(&*state);
    Ok(())
}

#[tauri::command]
fn lock_vault(state: tauri::State<AppState>) -> Result<(), String> {
    let mut g = state
        .vault_key
        .lock()
        .map_err(|_| err_msg(AppError::CryptoError, None))?;
    *g = None;
    clear_vault_session_storage(&*state);
    Ok(())
}

#[tauri::command]
fn is_vault_unlocked(state: tauri::State<AppState>) -> Result<bool, String> {
    let g = state
        .vault_key
        .lock()
        .map_err(|_| err_msg(AppError::CryptoError, None))?;
    Ok(g.is_some())
}

#[tauri::command]
fn encrypt_secret(state: tauri::State<AppState>, value: String) -> Result<String, String> {
    let key = vault_unlocked_key(&state)?;
    encrypt_aes256_gcm(key.as_ref(), &value)
        .map_err(|_| err_msg(AppError::CryptoError, Some("cifratura")))
}

#[tauri::command]
fn decrypt_secret(state: tauri::State<AppState>, value: String) -> Result<String, String> {
    let key = vault_unlocked_key(&state)?;
    decrypt_aes256_gcm(key.as_ref(), &value)
        .map_err(|_| err_msg(AppError::CryptoError, Some("decifratura")))
}

#[tauri::command]
fn export_encrypted_backup(
    state: tauri::State<AppState>,
    path: String,
    password: String,
) -> Result<(), String> {
    if password.len() < 8 {
        return Err(err_msg(
            AppError::BackupError,
            Some("Password backup troppo debole"),
        ));
    }
    let conn = open(&state)?;
    let clients = db::list_clients_all(&conn).map_err(db_err)?;
    let rdp = db::list_rdp_for_backup(&conn).map_err(db_err)?;
    let vpn = db::list_vpn_for_backup(&conn).map_err(db_err)?;
    let web = db::list_web_for_backup(&conn).map_err(db_err)?;
    let contacts = db::list_contacts_for_backup(&conn).map_err(db_err)?;
    let collaborator_roles = db::list_collaborator_roles(&conn).map_err(db_err)?;
    let collaborators = db::collaborators_export_for_backup(&conn).map_err(db_err)?;
    let audit = db::list_all_audit(&conn).map_err(db_err)?;
    let settings = db::list_all_settings(&conn).map_err(db_err)?;
    let settings: Vec<(String, String)> = settings
        .into_iter()
        .filter(|(k, _)| k.as_str() != LOCAL_VAULT_SESSION_SETTING)
        .collect();
    let json = export_backup_encrypted(
        clients,
        rdp,
        vpn,
        web,
        contacts,
        collaborator_roles,
        collaborators,
        audit,
        settings,
        &password,
    )
    .map_err(|e| err_msg(AppError::BackupError, Some(&e.to_string())))?;
    std::fs::write(PathBuf::from(path), json)
        .map_err(|e| err_msg(AppError::BackupError, Some(&format!("scrittura file: {e}"))))
}

/// Pulizia completa del database (come installazione vuota): richiede la master password Vault
/// solo per impedire uso accidentale del comando.
#[tauri::command]
fn master_wipe_application_data(
    state: tauri::State<AppState>,
    vault_password: String,
) -> Result<(), String> {
    let mut conn = open(&state)?;
    let _ = derive_unlock_key_from_password(&conn, &vault_password)?;
    db::wipe_database_to_empty(&mut conn).map_err(db_err)?;
    let mut g = state
        .vault_key
        .lock()
        .map_err(|_| err_msg(AppError::CryptoError, None))?;
    *g = None;
    drop(g);
    clear_vault_session_storage(&*state);
    Ok(())
}

#[tauri::command]
fn import_encrypted_backup(
    state: tauri::State<AppState>,
    path: String,
    password: String,
    overwrite: bool,
) -> Result<(), String> {
    if !overwrite {
        return Err(err_msg(
            AppError::BackupError,
            Some("Import richiede conferma sovrascrittura"),
        ));
    }
    let raw = std::fs::read_to_string(PathBuf::from(path))
        .map_err(|e| err_msg(AppError::BackupError, Some(&e.to_string())))?;
    let payload = import_backup_decrypted(&raw, &password).map_err(|_| {
        err_msg(
            AppError::BackupError,
            Some("Password non valida o file corrotto"),
        )
    })?;
    let mut conn = open(&state)?;
    db::restore_from_backup_payload(&mut conn, &payload).map_err(db_err)?;
    let mut g = state
        .vault_key
        .lock()
        .map_err(|_| err_msg(AppError::CryptoError, None))?;
    *g = None;
    clear_vault_session_storage(&*state);
    Ok(())
}

#[tauri::command]
fn get_settings(state: tauri::State<AppState>) -> Result<AppSettingsDto, String> {
    let conn = open(&state)?;
    let theme = db::get_setting(&conn, SETTING_THEME)
        .map_err(db_err)?
        .unwrap_or_else(|| "light".into());
    let favorites = parse_favorites(db::get_setting(&conn, SETTING_FAVORITES).map_err(db_err)?);
    let mut presets =
        parse_connection_name_presets(db::get_setting(&conn, SETTING_RDP_PRESETS).map_err(db_err)?);
    ensure_preset_ids(&conn, &mut presets).map_err(db_err)?;
    let environments =
        parse_environments(db::get_setting(&conn, SETTING_ENVIRONMENTS).map_err(db_err)?);
    let version_options =
        parse_version_options(db::get_setting(&conn, SETTING_VERSION_OPTIONS).map_err(db_err)?);
    let release_options =
        parse_release_options(db::get_setting(&conn, SETTING_RELEASE_OPTIONS).map_err(db_err)?);
    let contract_types =
        parse_contract_types(db::get_setting(&conn, SETTING_CONTRACT_TYPES).map_err(db_err)?);
    let crm_modules =
        parse_crm_modules(db::get_setting(&conn, SETTING_CRM_MODULES).map_err(db_err)?);
    let collaborator_competencies = parse_collaborator_competencies(
        db::get_setting(&conn, SETTING_COLLAB_COMPETENCIES).map_err(db_err)?,
    );
    let dashboard_layout =
        parse_dashboard_layout(db::get_setting(&conn, SETTING_DASHBOARD_LAYOUT).map_err(db_err)?);
    let client_card_modules = parse_client_card_modules(
        db::get_setting(&conn, SETTING_CLIENT_CARD_MODULES).map_err(db_err)?,
    );
    let planning_states = parse_planning_states(db::get_setting(&conn, SETTING_PLANNING_STATES).map_err(db_err)?);
    let planning_activity_types = parse_planning_activity_types(
        db::get_setting(&conn, SETTING_PLANNING_ACTIVITY_TYPES).map_err(db_err)?,
    );
    let planning_activities = parse_planning_activities(
        db::get_setting(&conn, SETTING_PLANNING_ACTIVITIES).map_err(db_err)?,
    );
    let agenda_settings = parse_agenda_settings(db::get_setting(&conn, SETTING_AGENDA_SETTINGS).map_err(db_err)?);
    let planning_reminder_pre_alert_minutes_before = parse_planning_reminder_pre_alert_minutes(
        db::get_setting(&conn, SETTING_PLANNING_REMINDER_PRE_ALERT_MINUTES).map_err(db_err)?,
    );
    Ok(AppSettingsDto {
        theme,
        favorite_rdp_ids: favorites,
        connection_name_presets: presets,
        environments,
        version_options,
        release_options,
        contract_types,
        crm_modules,
        collaborator_competencies,
        dashboard_layout,
        planning_states,
        planning_activity_types,
        planning_activities,
        client_card_modules,
        agenda_settings,
        planning_reminder_pre_alert_minutes_before,
    })
}

#[tauri::command]
fn update_settings(
    state: tauri::State<AppState>,
    input: UpdateSettingsInput,
) -> Result<(), String> {
    let conn = open(&state)?;
    if let Some(t) = &input.theme {
        db::set_setting(&conn, SETTING_THEME, t).map_err(db_err)?;
    }
    if let Some(fav) = input.favorite_rdp_ids {
        let s =
            serde_json::to_string(&fav).map_err(|_| err_msg(AppError::ValidationError, None))?;
        db::set_setting(&conn, SETTING_FAVORITES, &s).map_err(db_err)?;
    }
    if let Some(presets) = &input.connection_name_presets {
        let cleaned: Vec<ConnectionNamePreset> = presets
            .iter()
            .map(|p| ConnectionNamePreset {
                id: if p.id.trim().is_empty() {
                    Uuid::new_v4().to_string()
                } else {
                    p.id.trim().to_string()
                },
                name: p.name.trim().to_string(),
                kind: p.kind,
                environment_ids: Vec::new(),
            })
            .filter(|p| !p.name.is_empty())
            .collect();
        let s = serde_json::to_string(&cleaned)
            .map_err(|_| err_msg(AppError::ValidationError, None))?;
        db::set_setting(&conn, SETTING_RDP_PRESETS, &s).map_err(db_err)?;
    }
    if let Some(envs) = &input.environments {
        let cleaned: Vec<EnvironmentRow> = envs
            .iter()
            .map(|e| EnvironmentRow {
                id: if e.id.trim().is_empty() {
                    Uuid::new_v4().to_string()
                } else {
                    e.id.trim().to_string()
                },
                name: e.name.trim().to_string(),
                version_option_ids: Vec::new(),
                release_option_ids: Vec::new(),
            })
            .filter(|e| !e.name.is_empty())
            .collect();
        let s = serde_json::to_string(&cleaned)
            .map_err(|_| err_msg(AppError::ValidationError, None))?;
        db::set_setting(&conn, SETTING_ENVIRONMENTS, &s).map_err(db_err)?;
    }
    if let Some(vopts) = &input.version_options {
        let s =
            serde_json::to_string(vopts).map_err(|_| err_msg(AppError::ValidationError, None))?;
        db::set_setting(&conn, SETTING_VERSION_OPTIONS, &s).map_err(db_err)?;
    }
    if let Some(ropts) = &input.release_options {
        let s =
            serde_json::to_string(ropts).map_err(|_| err_msg(AppError::ValidationError, None))?;
        db::set_setting(&conn, SETTING_RELEASE_OPTIONS, &s).map_err(db_err)?;
    }
    if let Some(cts) = &input.contract_types {
        let cleaned: Vec<ContractTypeRow> = cts
            .iter()
            .map(|r| ContractTypeRow {
                id: if r.id.trim().is_empty() {
                    Uuid::new_v4().to_string()
                } else {
                    r.id.trim().to_string()
                },
                name: r.name.trim().to_string(),
            })
            .filter(|r| !r.name.is_empty())
            .collect();
        let s = serde_json::to_string(&cleaned)
            .map_err(|_| err_msg(AppError::ValidationError, None))?;
        db::set_setting(&conn, SETTING_CONTRACT_TYPES, &s).map_err(db_err)?;
    }
    if let Some(mods) = &input.crm_modules {
        let cleaned: Vec<CrmModuleRow> = mods
            .iter()
            .map(|r| CrmModuleRow {
                id: if r.id.trim().is_empty() {
                    Uuid::new_v4().to_string()
                } else {
                    r.id.trim().to_string()
                },
                name: r.name.trim().to_string(),
            })
            .filter(|r| !r.name.is_empty())
            .collect();
        let s = serde_json::to_string(&cleaned)
            .map_err(|_| err_msg(AppError::ValidationError, None))?;
        db::set_setting(&conn, SETTING_CRM_MODULES, &s).map_err(db_err)?;
    }
    if let Some(comp) = &input.collaborator_competencies {
        let cleaned: Vec<CollaboratorCompetencyRow> = comp
            .iter()
            .map(|r| CollaboratorCompetencyRow {
                id: if r.id.trim().is_empty() {
                    Uuid::new_v4().to_string()
                } else {
                    r.id.trim().to_string()
                },
                name: r.name.trim().to_string(),
            })
            .filter(|r| !r.name.is_empty())
            .collect();
        let s = serde_json::to_string(&cleaned)
            .map_err(|_| err_msg(AppError::ValidationError, None))?;
        db::set_setting(&conn, SETTING_COLLAB_COMPETENCIES, &s).map_err(db_err)?;
    }
    if let Some(layout) = &input.dashboard_layout {
        let s =
            serde_json::to_string(layout).map_err(|_| err_msg(AppError::ValidationError, None))?;
        db::set_setting(&conn, SETTING_DASHBOARD_LAYOUT, &s).map_err(db_err)?;
    }
    if let Some(mods) = &input.client_card_modules {
        let s =
            serde_json::to_string(mods).map_err(|_| err_msg(AppError::ValidationError, None))?;
        db::set_setting(&conn, SETTING_CLIENT_CARD_MODULES, &s).map_err(db_err)?;
    }
    if let Some(rows) = &input.planning_states {
        let mut cleaned: Vec<PlanningStateRow> = rows
            .iter()
            .cloned()
            .map(clean_planning_state_row)
            .filter(|r| !r.name.is_empty())
            .collect();
        let mut seen_default = false;
        for r in cleaned.iter_mut() {
            if r.is_default {
                if seen_default {
                    r.is_default = false;
                } else {
                    seen_default = true;
                }
            }
        }
        let s = serde_json::to_string(&cleaned)
            .map_err(|_| err_msg(AppError::ValidationError, None))?;
        db::set_setting(&conn, SETTING_PLANNING_STATES, &s).map_err(db_err)?;
    }
    if let Some(rows) = &input.planning_activity_types {
        let cleaned: Vec<PlanningActivityTypeRow> = rows
            .iter()
            .cloned()
            .map(|mut r| {
                if r.id.trim().is_empty() {
                    r.id = Uuid::new_v4().to_string();
                } else {
                    r.id = r.id.trim().to_string();
                }
                clean_planning_activity_type_row(r)
            })
            .filter(|r| !r.name.is_empty())
            .collect();
        let s = serde_json::to_string(&cleaned)
            .map_err(|_| err_msg(AppError::ValidationError, None))?;
        db::set_setting(&conn, SETTING_PLANNING_ACTIVITY_TYPES, &s).map_err(db_err)?;
    }
    if let Some(rows) = &input.planning_activities {
        let cleaned: Vec<PlanningActivityRow> = rows
            .iter()
            .cloned()
            .map(|mut r| {
                if r.id.trim().is_empty() {
                    r.id = Uuid::new_v4().to_string();
                } else {
                    r.id = r.id.trim().to_string();
                }
                r.activity_type_id = r.activity_type_id.trim().to_string();
                if r.created_at.trim().is_empty() {
                    r.created_at = Utc::now().to_rfc3339();
                } else {
                    r.created_at = r.created_at.trim().to_string();
                }
                r.payload = consolidate_planning_payload(std::mem::take(&mut r.payload));
                r
            })
            .filter(|r| !r.activity_type_id.is_empty())
            .collect();
        let s = serde_json::to_string(&cleaned)
            .map_err(|_| err_msg(AppError::ValidationError, None))?;
        db::set_setting(&conn, SETTING_PLANNING_ACTIVITIES, &s).map_err(db_err)?;
    }
    if let Some(agenda) = &input.agenda_settings {
        let s =
            serde_json::to_string(agenda).map_err(|_| err_msg(AppError::ValidationError, None))?;
        db::set_setting(&conn, SETTING_AGENDA_SETTINGS, &s).map_err(db_err)?;
    }
    if let Some(vals) = &input.planning_reminder_pre_alert_minutes_before {
        let cleaned = normalize_planning_reminder_pre_alert_minutes_vec(vals.clone());
        let s =
            serde_json::to_string(&cleaned).map_err(|_| err_msg(AppError::ValidationError, None))?;
        db::set_setting(
            &conn,
            SETTING_PLANNING_REMINDER_PRE_ALERT_MINUTES,
            &s,
        )
        .map_err(db_err)?;
    }
    Ok(())
}

#[tauri::command]
fn get_dashboard_stats(state: tauri::State<AppState>) -> Result<DashboardStats, String> {
    let conn = open(&state)?;
    let total_clients = db::count_clients(&conn).map_err(db_err)?;
    let total_rdp = db::count_rdp(&conn).map_err(db_err)?;
    let total_vpn = db::count_vpn(&conn).map_err(db_err)?;
    let total_web = db::count_web(&conn).map_err(db_err)?;
    let recent_audit = db::recent_audit(&conn, 12).map_err(db_err)?;
    let favorites = parse_favorites(db::get_setting(&conn, SETTING_FAVORITES).map_err(db_err)?);
    Ok(DashboardStats {
        total_clients,
        total_rdp,
        total_vpn,
        total_web,
        recent_audit,
        favorite_rdp_ids: favorites,
    })
}

#[tauri::command]
fn get_vault_status(state: tauri::State<AppState>) -> Result<VaultStatus, String> {
    let conn = open(&state)?;
    let configured = db::get_setting(&conn, KDF_SALT_KEY)
        .map_err(db_err)?
        .is_some();
    let unlocked = state
        .vault_key
        .lock()
        .map_err(|_| err_msg(AppError::CryptoError, None))?
        .is_some();
    Ok(VaultStatus {
        configured,
        unlocked,
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let resolver = app.path().app_data_dir().expect("app_data_dir");
            std::fs::create_dir_all(&resolver).expect("mkdir");
            let db_file = resolver.join("rdp-manager.sqlite");
            db::open_db(&db_file).expect("db init");
            let state = AppState {
                db_path: db_file,
                vault_key: Mutex::new(None),
            };
            app.manage(state);
            let managed = app.state::<AppState>();
            try_restore_vault_session(&*managed);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            preview_rdp_file,
            get_clients,
            get_clients_all,
            get_client,
            create_client,
            update_client,
            delete_client,
            get_contacts_by_client,
            get_all_contacts,
            create_contact,
            update_contact,
            delete_contact,
            dial_phone_number,
            open_contact_mailto,
            open_https_url,
            get_collaborator_roles,
            create_collaborator_role,
            update_collaborator_role,
            delete_collaborator_role,
            get_collaborators,
            get_collaborators_for_client,
            create_collaborator,
            update_collaborator,
            delete_collaborator,
            get_rdp_connections,
            get_rdp_by_client,
            get_rdp,
            create_rdp,
            update_rdp,
            delete_rdp,
            launch_rdp,
            copy_rdp_field,
            reveal_rdp_password,
            get_vpn_connections,
            get_vpn_by_client,
            get_vpn,
            create_vpn,
            update_vpn,
            delete_vpn,
            launch_vpn,
            list_windows_vpn_profiles,
            copy_vpn_field,
            get_web_connections,
            get_web_by_client,
            get_web_access,
            create_web_access,
            update_web_access,
            delete_web_access,
            launch_web_access,
            copy_web_field,
            reveal_web_password,
            set_master_password,
            unlock_vault,
            verify_vault_master_password,
            change_vault_master_password,
            export_vault_recovery_kit,
            recover_vault_with_recovery_kit,
            reset_vault_wipe_secrets,
            lock_vault,
            is_vault_unlocked,
            get_vault_status,
            encrypt_secret,
            decrypt_secret,
            export_encrypted_backup,
            import_encrypted_backup,
            master_wipe_application_data,
            get_settings,
            update_settings,
            get_dashboard_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
