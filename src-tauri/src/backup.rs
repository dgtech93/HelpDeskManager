use crate::crypto::{backup_derive_key, decrypt_aes256_gcm, encrypt_aes256_gcm, random_bytes};
use crate::models::{
    AuditLogEntry, Client, ClientContact, CollaboratorExport, CollaboratorRole, RdpConnection,
    VpnConnection, WebAccess,
};
use anyhow::{anyhow, Context};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
struct BackupPayload {
    version: u32,
    exported_at: String,
    clients: Vec<Client>,
    rdp: Vec<RdpConnection>,
    vpn: Vec<VpnConnection>,
    web: Vec<WebAccess>,
    #[serde(default)]
    client_contacts: Vec<ClientContact>,
    collaborator_roles: Vec<CollaboratorRole>,
    collaborators: Vec<CollaboratorExport>,
    audit_logs: Vec<AuditLogEntry>,
    settings_pairs: Vec<(String, String)>,
}

#[derive(Debug, Deserialize)]
pub struct BackupPayloadDe {
    pub version: u32,
    pub exported_at: String,
    pub clients: Vec<Client>,
    pub rdp: Vec<RdpConnection>,
    pub vpn: Vec<VpnConnection>,
    #[serde(default)]
    pub web: Vec<WebAccess>,
    #[serde(default)]
    pub client_contacts: Vec<ClientContact>,
    #[serde(default)]
    pub collaborator_roles: Vec<CollaboratorRole>,
    #[serde(default)]
    pub collaborators: Vec<CollaboratorExport>,
    #[serde(default)]
    pub audit_logs: Vec<AuditLogEntry>,
    #[serde(default)]
    pub settings_pairs: Vec<(String, String)>,
}

#[derive(Debug, Serialize, Deserialize)]
struct EncryptedBackupEnvelope {
    version: u32,
    salt_b64: String,
    ciphertext_b64: String,
}

pub fn export_backup_encrypted(
    clients: Vec<Client>,
    rdp: Vec<RdpConnection>,
    vpn: Vec<VpnConnection>,
    web: Vec<WebAccess>,
    client_contacts: Vec<ClientContact>,
    collaborator_roles: Vec<CollaboratorRole>,
    collaborators: Vec<CollaboratorExport>,
    audit_logs: Vec<AuditLogEntry>,
    settings_pairs: Vec<(String, String)>,
    password: &str,
) -> anyhow::Result<String> {
    let payload = BackupPayload {
        version: 3,
        exported_at: chrono::Utc::now().to_rfc3339(),
        clients,
        rdp,
        vpn,
        web,
        client_contacts,
        collaborator_roles,
        collaborators,
        audit_logs,
        settings_pairs,
    };
    let json_str = serde_json::to_string(&payload)?;
    let salt = random_bytes(16);
    let key = backup_derive_key(password.as_bytes(), &salt)?;
    let ciphertext_b64 = encrypt_aes256_gcm(key.as_ref(), &json_str)?;
    let envelope = EncryptedBackupEnvelope {
        version: 1,
        salt_b64: STANDARD.encode(&salt),
        ciphertext_b64,
    };
    serde_json::to_string_pretty(&envelope).map_err(|e| anyhow!("serialize {}", e))
}

pub fn import_backup_decrypted(blob: &str, password: &str) -> anyhow::Result<BackupPayloadDe> {
    let env: EncryptedBackupEnvelope = serde_json::from_str(blob).context("parse envelope")?;
    let salt = STANDARD.decode(&env.salt_b64).context("salt")?;
    let key = backup_derive_key(password.as_bytes(), &salt)?;
    let plain = decrypt_aes256_gcm(key.as_ref(), &env.ciphertext_b64).context("decrypt")?;
    let payload: BackupPayloadDe = serde_json::from_str(&plain).context("payload json")?;
    Ok(payload)
}
