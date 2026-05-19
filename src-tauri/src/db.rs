use crate::models::{
    AuditLogEntry, Client, ClientContact, Collaborator, CollaboratorCompetencyRow,
    CollaboratorExport, CollaboratorRole, ConnectionNamePreset, CreateClientContactInput,
    CreateClientInput, CreateCollaboratorInput, CreateCollaboratorRoleInput, CreateRdpInput,
    CreateVpnInput, CreateWebAccessInput, RdpConnection, RdpEnvironmentDeployment,
    UpdateClientContactInput, UpdateClientInput, UpdateCollaboratorInput,
    UpdateCollaboratorRoleInput, UpdateRdpInput, UpdateVpnInput, UpdateWebAccessInput,
    VpnConnection, WebAccess,
};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Result as SqlResult};
use uuid::Uuid;

pub fn open_db(path: &std::path::Path) -> SqlResult<Connection> {
    let mut conn = Connection::open(path)?;
    conn.execute_batch(
        "
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        ",
    )?;
    migrate(&mut conn)?;
    Ok(conn)
}

fn migrate(conn: &mut Connection) -> SqlResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vpn_connections (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            server TEXT,
            username TEXT,
            password_encrypted TEXT,
            config_path TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS rdp_connections (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL,
            name TEXT NOT NULL,
            host TEXT NOT NULL,
            port INTEGER NOT NULL DEFAULT 3389,
            username TEXT,
            password_encrypted TEXT,
            domain TEXT,
            resolution_width INTEGER DEFAULT 1920,
            resolution_height INTEGER DEFAULT 1080,
            color_depth INTEGER DEFAULT 32,
            use_fullscreen INTEGER DEFAULT 1,
            use_clipboard INTEGER DEFAULT 1,
            ignore_certificate INTEGER DEFAULT 1,
            gateway_host TEXT,
            vpn_id TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
            FOREIGN KEY(vpn_id) REFERENCES vpn_connections(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_rdp_client ON rdp_connections(client_id);
        CREATE INDEX IF NOT EXISTS idx_vpn_client ON vpn_connections(client_id);

        CREATE TABLE IF NOT EXISTS web_access (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            username TEXT,
            password_encrypted TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_web_access_client ON web_access(client_id);
        ",
    )?;
    migrate_rdp_file_column(conn)?;
    migrate_client_default_vpn_column(conn)?;
    migrate_client_profile_columns(conn)?;
    migrate_client_obsolete_column(conn)?;
    migrate_client_hidden_from_clients_nav_column(conn)?;
    migrate_client_contract_columns(conn)?;
    migrate_client_contacts_table(conn)?;
    migrate_collaborators_schema(conn)?;
    migrate_rdp_web_version_columns(conn)?;
    migrate_rdp_web_env_link_columns(conn)?;
    migrate_rdp_web_release_option_columns(conn)?;
    migrate_rdp_environment_deployments_json(conn)?;
    migrate_web_domain_column(conn)?;
    migrate_web_crm_dashboard_columns(conn)?;
    migrate_web_crm_module_ids_json(conn)?;
    migrate_rdp_dashboard_flag_columns(conn)?;
    migrate_collaborator_competencies_catalog(conn)?;
    Ok(())
}

fn migrate_collaborator_competencies_catalog(conn: &Connection) -> SqlResult<()> {
    const KEY: &str = "collaborator_competencies";
    if let Some(s) = get_setting(conn, KEY)? {
        if !s.trim().is_empty() {
            return Ok(());
        }
    }

    let presets_raw = match get_setting(conn, "rdp_connection_name_presets")? {
        Some(s) => s,
        None => "[]".to_string(),
    };
    let presets: Vec<ConnectionNamePreset> =
        serde_json::from_str(&presets_raw).unwrap_or_else(|_| Vec::new());

    let mut preset_id_to_name: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for p in presets {
        let id = p.id.trim().to_string();
        if id.is_empty() {
            continue;
        }
        let name = p.name.trim().to_string();
        preset_id_to_name.entry(id).or_insert(name);
    }

    let mut stmt =
        conn.prepare("SELECT DISTINCT preset_id FROM collaborator_competency_presets")?;
    let ids: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<SqlResult<Vec<_>>>()?;

    let mut rows: Vec<CollaboratorCompetencyRow> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for preset_id in ids {
        let pid = preset_id.trim().to_string();
        if pid.is_empty() || !seen.insert(pid.clone()) {
            continue;
        }
        let name = preset_id_to_name
            .get(&pid)
            .cloned()
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| pid.clone());
        rows.push(CollaboratorCompetencyRow { id: pid, name });
    }

    rows.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.id.cmp(&b.id))
    });

    let json = serde_json::to_string(&rows).map_err(|e| {
        rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("collaborator_competencies migrate: {}", e),
        )))
    })?;
    set_setting(conn, KEY, &json)
}

fn migrate_web_crm_dashboard_columns(conn: &Connection) -> SqlResult<()> {
    let mut stmt = conn.prepare(
        "SELECT COUNT(*) FROM pragma_table_info('web_access') WHERE name='crm_module_id'",
    )?;
    let n: i64 = stmt.query_row([], |r| r.get(0))?;
    if n == 0 {
        conn.execute("ALTER TABLE web_access ADD COLUMN crm_module_id TEXT", [])?;
    }
    let mut stmt = conn
        .prepare("SELECT COUNT(*) FROM pragma_table_info('web_access') WHERE name='sportello'")?;
    let n2: i64 = stmt.query_row([], |r| r.get(0))?;
    if n2 == 0 {
        conn.execute(
            "ALTER TABLE web_access ADD COLUMN sportello INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }
    Ok(())
}

fn migrate_web_crm_module_ids_json(conn: &Connection) -> SqlResult<()> {
    let mut stmt = conn.prepare(
        "SELECT COUNT(*) FROM pragma_table_info('web_access') WHERE name='crm_module_ids_json'",
    )?;
    let n: i64 = stmt.query_row([], |r| r.get(0))?;
    if n == 0 {
        conn.execute(
            "ALTER TABLE web_access ADD COLUMN crm_module_ids_json TEXT",
            [],
        )?;
    }
    let mut stmt = conn.prepare("SELECT id, crm_module_id, crm_module_ids_json FROM web_access")?;
    let rows: Vec<(String, Option<String>, Option<String>)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<SqlResult<Vec<_>>>()?;
    for (id, legacy_id, json_col) in rows {
        let json_trim = json_col
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        if json_trim.is_some() {
            continue;
        }
        let merged = parse_web_crm_module_ids(None, legacy_id);
        let (j_stored, _) = web_crm_sql_tuple(&merged);
        if let Some(blob) = j_stored {
            conn.execute(
                "UPDATE web_access SET crm_module_ids_json = ?2 WHERE id = ?1",
                params![id, blob],
            )?;
        }
    }
    Ok(())
}

fn parse_web_crm_module_ids(
    json_raw: Option<String>,
    legacy_single: Option<String>,
) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Some(j) = json_raw {
        let t = j.trim();
        if !t.is_empty() {
            if let Ok(parsed) = serde_json::from_str::<Vec<String>>(t) {
                for s in parsed {
                    let x = s.trim().to_string();
                    if !x.is_empty() && !out.contains(&x) {
                        out.push(x);
                    }
                }
            }
        }
    }
    if out.is_empty() {
        if let Some(l) = legacy_single {
            let x = l.trim().to_string();
            if !x.is_empty() {
                out.push(x);
            }
        }
    }
    out
}

fn normalize_web_crm_input_ids(ids: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for s in ids {
        let x = s.trim().to_string();
        if !x.is_empty() && !out.contains(&x) {
            out.push(x);
        }
    }
    out
}

fn merged_crm_ids_for_create(input: &CreateWebAccessInput) -> Vec<String> {
    if let Some(ref list) = input.crm_module_ids {
        let n = normalize_web_crm_input_ids(list);
        if !n.is_empty() {
            return n;
        }
    }
    parse_web_crm_module_ids(None, input.crm_module_id.clone())
}

fn web_crm_sql_tuple(ids: &[String]) -> (Option<String>, Option<String>) {
    if ids.is_empty() {
        return (None, None);
    }
    let json_blob = serde_json::to_string(ids).ok();
    let first = ids.first().cloned();
    (json_blob, first)
}

fn migrate_rdp_dashboard_flag_columns(conn: &Connection) -> SqlResult<()> {
    for col in ["billing", "finance", "gw_credit"] {
        let mut stmt = conn.prepare(&format!(
            "SELECT COUNT(*) FROM pragma_table_info('rdp_connections') WHERE name='{col}'",
        ))?;
        let n: i64 = stmt.query_row([], |r| r.get(0))?;
        if n == 0 {
            conn.execute(
                &format!("ALTER TABLE rdp_connections ADD COLUMN {col} INTEGER NOT NULL DEFAULT 0"),
                [],
            )?;
        }
    }
    Ok(())
}

fn migrate_rdp_environment_deployments_json(conn: &Connection) -> SqlResult<()> {
    let mut stmt = conn.prepare(
        "SELECT COUNT(*) FROM pragma_table_info('rdp_connections') WHERE name='environment_deployments_json'",
    )?;
    let n: i64 = stmt.query_row([], |r| r.get(0))?;
    if n == 0 {
        conn.execute(
            "ALTER TABLE rdp_connections ADD COLUMN environment_deployments_json TEXT",
            [],
        )?;
    }
    let mut stmt = conn.prepare(
        "SELECT id, environment_id, release_option_id, environment_deployments_json
         FROM rdp_connections
         WHERE (environment_deployments_json IS NULL OR trim(environment_deployments_json) = '')
           AND environment_id IS NOT NULL AND trim(environment_id) != ''",
    )?;
    let rows: Vec<(String, String, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })?
        .collect::<Result<_, _>>()?;
    for (id, env, rel) in rows {
        let slot = RdpEnvironmentDeployment {
            environment_id: env.trim().to_string(),
            release_option_id: rel
                .as_ref()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
        };
        let json = serde_json::to_string(&vec![slot]).unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            "UPDATE rdp_connections SET environment_deployments_json = ?2 WHERE id = ?1",
            params![id, json],
        )?;
    }
    Ok(())
}

fn migrate_web_domain_column(conn: &Connection) -> SqlResult<()> {
    let mut stmt =
        conn.prepare("SELECT COUNT(*) FROM pragma_table_info('web_access') WHERE name='domain'")?;
    let n: i64 = stmt.query_row([], |r| r.get(0))?;
    if n == 0 {
        conn.execute("ALTER TABLE web_access ADD COLUMN domain TEXT", [])?;
    }
    Ok(())
}

fn migrate_rdp_web_release_option_columns(conn: &Connection) -> SqlResult<()> {
    for table in ["rdp_connections", "web_access"] {
        let mut stmt = conn.prepare(&format!(
            "SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name='release_option_id'",
        ))?;
        let n: i64 = stmt.query_row([], |r| r.get(0))?;
        if n == 0 {
            conn.execute(
                &format!("ALTER TABLE {table} ADD COLUMN release_option_id TEXT"),
                [],
            )?;
        }
    }
    Ok(())
}

fn migrate_rdp_web_env_link_columns(conn: &Connection) -> SqlResult<()> {
    for table in ["rdp_connections", "web_access"] {
        for col in ["environment_id", "version_option_id"] {
            let mut stmt = conn.prepare(&format!(
                "SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name='{col}'",
            ))?;
            let n: i64 = stmt.query_row([], |r| r.get(0))?;
            if n == 0 {
                conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {col} TEXT"), [])?;
            }
        }
    }
    Ok(())
}

fn migrate_rdp_web_version_columns(conn: &Connection) -> SqlResult<()> {
    for (table, col) in [("rdp_connections", "version"), ("web_access", "version")] {
        let mut stmt = conn.prepare(&format!(
            "SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name='{col}'",
        ))?;
        let n: i64 = stmt.query_row([], |r| r.get(0))?;
        if n == 0 {
            conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {col} TEXT"), [])?;
        }
    }
    Ok(())
}

fn migrate_client_obsolete_column(conn: &Connection) -> SqlResult<()> {
    let mut stmt =
        conn.prepare("SELECT COUNT(*) FROM pragma_table_info('clients') WHERE name='obsolete'")?;
    let n: i64 = stmt.query_row([], |r| r.get(0))?;
    if n == 0 {
        conn.execute(
            "ALTER TABLE clients ADD COLUMN obsolete INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }
    Ok(())
}

fn migrate_client_hidden_from_clients_nav_column(conn: &Connection) -> SqlResult<()> {
    let mut stmt = conn.prepare(
        "SELECT COUNT(*) FROM pragma_table_info('clients') WHERE name='hidden_from_clients_nav'",
    )?;
    let n: i64 = stmt.query_row([], |r| r.get(0))?;
    if n == 0 {
        conn.execute(
            "ALTER TABLE clients ADD COLUMN hidden_from_clients_nav INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }
    Ok(())
}

fn migrate_client_contract_columns(conn: &Connection) -> SqlResult<()> {
    let mut stmt = conn.prepare(
        "SELECT COUNT(*) FROM pragma_table_info('clients') WHERE name='contract_type_id'",
    )?;
    let n: i64 = stmt.query_row([], |r| r.get(0))?;
    if n == 0 {
        conn.execute("ALTER TABLE clients ADD COLUMN contract_type_id TEXT", [])?;
    }
    let mut stmt = conn
        .prepare("SELECT COUNT(*) FROM pragma_table_info('clients') WHERE name='update_count'")?;
    let n2: i64 = stmt.query_row([], |r| r.get(0))?;
    if n2 == 0 {
        conn.execute(
            "ALTER TABLE clients ADD COLUMN update_count INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }
    Ok(())
}

fn migrate_client_contacts_table(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS client_contacts (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL,
            first_name TEXT NOT NULL DEFAULT '',
            last_name TEXT NOT NULL DEFAULT '',
            email TEXT,
            phone TEXT,
            mobile TEXT,
            role TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON client_contacts(client_id);
        ",
    )
}

fn migrate_collaborators_schema(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS collaborator_roles (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            sort_rank INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS collaborators (
            id TEXT PRIMARY KEY,
            first_name TEXT NOT NULL DEFAULT '',
            last_name TEXT NOT NULL DEFAULT '',
            linkedin_url TEXT,
            photo_url TEXT,
            email TEXT,
            phone TEXT,
            role_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(role_id) REFERENCES collaborator_roles(id) ON DELETE RESTRICT
        );

        CREATE TABLE IF NOT EXISTS collaborator_clients (
            collaborator_id TEXT NOT NULL,
            client_id TEXT NOT NULL,
            PRIMARY KEY (collaborator_id, client_id),
            FOREIGN KEY(collaborator_id) REFERENCES collaborators(id) ON DELETE CASCADE,
            FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS collaborator_competency_presets (
            collaborator_id TEXT NOT NULL,
            preset_id TEXT NOT NULL,
            PRIMARY KEY (collaborator_id, preset_id),
            FOREIGN KEY(collaborator_id) REFERENCES collaborators(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_collab_clients_by_client ON collaborator_clients(client_id);
        ",
    )?;
    collaborator_seed_default_roles(conn)?;
    Ok(())
}

fn collaborator_seed_default_roles(conn: &Connection) -> SqlResult<()> {
    let n: i64 = conn.query_row("SELECT COUNT(*) FROM collaborator_roles", [], |r| r.get(0))?;
    if n > 0 {
        return Ok(());
    }
    let ts = now_iso();
    let seeds = [
        ("collab-role-ceo", "CEO", 0i64),
        ("collab-role-dt", "Direttore Tecnico", 10),
        ("collab-role-do", "Direttore Operativo", 20),
        ("collab-role-pm", "PM", 30),
        ("collab-role-resp", "Responsabile", 40),
        ("collab-role-cons", "Consulente", 50),
        ("collab-role-coord", "Coordinatore", 60),
        ("collab-role-op", "Operatore Tecnico", 70),
    ];
    for (id, label, rank) in seeds {
        conn.execute(
            "INSERT INTO collaborator_roles (id, label, sort_rank, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, label, rank, &ts, &ts],
        )?;
    }
    Ok(())
}

fn migrate_client_profile_columns(conn: &Connection) -> SqlResult<()> {
    for col in ["website_url", "location"] {
        let mut stmt = conn.prepare(&format!(
            "SELECT COUNT(*) FROM pragma_table_info('clients') WHERE name='{col}'",
        ))?;
        let n: i64 = stmt.query_row([], |r| r.get(0))?;
        if n == 0 {
            conn.execute(&format!("ALTER TABLE clients ADD COLUMN {col} TEXT"), [])?;
        }
    }
    Ok(())
}

fn migrate_client_default_vpn_column(conn: &Connection) -> SqlResult<()> {
    let mut stmt = conn
        .prepare("SELECT COUNT(*) FROM pragma_table_info('clients') WHERE name='default_vpn_id'")?;
    let n: i64 = stmt.query_row([], |r| r.get(0))?;
    if n == 0 {
        conn.execute(
            "ALTER TABLE clients ADD COLUMN default_vpn_id TEXT REFERENCES vpn_connections(id) ON DELETE SET NULL",
            [],
        )?;
    }
    Ok(())
}

fn migrate_rdp_file_column(conn: &Connection) -> SqlResult<()> {
    let mut stmt = conn.prepare(
        "SELECT COUNT(*) FROM pragma_table_info('rdp_connections') WHERE name='rdp_file_path'",
    )?;
    let n: i64 = stmt.query_row([], |r| r.get(0))?;
    if n == 0 {
        conn.execute(
            "ALTER TABLE rdp_connections ADD COLUMN rdp_file_path TEXT",
            [],
        )?;
    }
    Ok(())
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

pub fn insert_audit(
    conn: &Connection,
    action: &str,
    entity_type: &str,
    entity_id: Option<&str>,
) -> SqlResult<()> {
    let id = Uuid::new_v4().to_string();
    let ts = now_iso();
    conn.execute(
        "INSERT INTO audit_logs (id, action, entity_type, entity_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, action, entity_type, entity_id, ts],
    )?;
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> SqlResult<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    stmt.query_row([key], |r| r.get(0)).optional()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn delete_setting(conn: &Connection, key: &str) -> SqlResult<()> {
    conn.execute("DELETE FROM settings WHERE key = ?1", [key])?;
    Ok(())
}

pub fn clear_all_password_encrypted(conn: &Connection) -> SqlResult<()> {
    conn.execute("UPDATE rdp_connections SET password_encrypted = NULL", [])?;
    conn.execute("UPDATE vpn_connections SET password_encrypted = NULL", [])?;
    conn.execute("UPDATE web_access SET password_encrypted = NULL", [])?;
    Ok(())
}

pub fn update_rdp_password_enc(conn: &Connection, id: &str, blob: Option<String>) -> SqlResult<()> {
    let ts = now_iso();
    conn.execute(
        "UPDATE rdp_connections SET password_encrypted = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, blob, ts],
    )?;
    Ok(())
}

pub fn update_vpn_password_enc(conn: &Connection, id: &str, blob: Option<String>) -> SqlResult<()> {
    let ts = now_iso();
    conn.execute(
        "UPDATE vpn_connections SET password_encrypted = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, blob, ts],
    )?;
    Ok(())
}

pub fn update_web_password_enc(conn: &Connection, id: &str, blob: Option<String>) -> SqlResult<()> {
    let ts = now_iso();
    conn.execute(
        "UPDATE web_access SET password_encrypted = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, blob, ts],
    )?;
    Ok(())
}

fn sql_clients_select() -> &'static str {
    "SELECT id, name, description, default_vpn_id, website_url, location, COALESCE(obsolete, 0), COALESCE(hidden_from_clients_nav, 0), contract_type_id, COALESCE(update_count, 0), created_at, updated_at FROM clients"
}

fn map_client_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Client> {
    let obsolete_i: i64 = row.get(6)?;
    let hidden_nav_i: i64 = row.get(7)?;
    Ok(Client {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        default_vpn_id: row.get(3)?,
        website_url: row.get(4)?,
        location: row.get(5)?,
        obsolete: obsolete_i != 0,
        hidden_from_clients_nav: hidden_nav_i != 0,
        contract_type_id: row.get(8)?,
        update_count: row.get::<_, i64>(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

pub fn list_clients(conn: &Connection) -> SqlResult<Vec<Client>> {
    let sql = format!(
        "{} WHERE COALESCE(obsolete, 0) = 0 ORDER BY name COLLATE NOCASE",
        sql_clients_select()
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], map_client_row)?;
    rows.collect()
}

pub fn list_clients_all(conn: &Connection) -> SqlResult<Vec<Client>> {
    let sql = format!("{} ORDER BY name COLLATE NOCASE", sql_clients_select());
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], map_client_row)?;
    rows.collect()
}

pub fn get_client(conn: &Connection, id: &str) -> SqlResult<Option<Client>> {
    let sql = format!("{} WHERE id = ?1", sql_clients_select());
    let mut stmt = conn.prepare(&sql)?;
    stmt.query_row([id], map_client_row).optional()
}

pub fn create_client(conn: &Connection, input: &CreateClientInput) -> SqlResult<Client> {
    let id = Uuid::new_v4().to_string();
    let ts = now_iso();
    let website_url = input
        .website_url
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let location = input
        .location
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let contract_type_id = input
        .contract_type_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let update_count = input.update_count.unwrap_or(0).max(0);
    conn.execute(
        "INSERT INTO clients (id, name, description, default_vpn_id, website_url, location, obsolete, hidden_from_clients_nav, contract_type_id, update_count, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, ?4, ?5, 0, 0, ?6, ?7, ?8, ?9)",
        params![
            id,
            input.name.trim(),
            input.description.as_ref().map(|s| s.trim().to_string()),
            website_url,
            location,
            contract_type_id,
            update_count,
            ts,
            ts
        ],
    )?;
    insert_audit(conn, "create", "client", Some(&id))?;
    Ok(Client {
        id,
        name: input.name.trim().to_string(),
        description: input
            .description
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        obsolete: false,
        hidden_from_clients_nav: false,
        default_vpn_id: None,
        website_url,
        location,
        contract_type_id,
        update_count,
        created_at: ts.clone(),
        updated_at: ts,
    })
}

pub fn update_client(conn: &Connection, id: &str, input: &UpdateClientInput) -> SqlResult<()> {
    let existing = get_client(conn, id)?.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
    let name = input
        .name
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or(existing.name);
    let description = input
        .description
        .as_ref()
        .map(|s| s.trim().to_string())
        .map(Some)
        .unwrap_or(existing.description);
    let default_vpn_id = match &input.default_vpn_id {
        None => existing.default_vpn_id.clone(),
        Some(inner) => inner.clone(),
    };
    let website_url = match input.website_url.as_ref() {
        None => existing.website_url.clone(),
        Some(s) => {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        }
    };
    let location = match input.location.as_ref() {
        None => existing.location.clone(),
        Some(s) => {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        }
    };
    let obsolete = match input.obsolete {
        None => existing.obsolete,
        Some(v) => v,
    };
    let hidden_from_clients_nav = match input.hidden_from_clients_nav {
        None => existing.hidden_from_clients_nav,
        Some(v) => v,
    };
    let contract_type_id = match &input.contract_type_id {
        None => existing.contract_type_id.clone(),
        Some(None) => None,
        Some(Some(s)) => {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        }
    };
    let update_count = match input.update_count {
        None => existing.update_count,
        Some(n) => n.max(0),
    };
    let ts = now_iso();
    conn.execute(
        "UPDATE clients SET name = ?2, description = ?3, default_vpn_id = ?4, website_url = ?5, location = ?6, obsolete = ?7, hidden_from_clients_nav = ?8, contract_type_id = ?9, update_count = ?10, updated_at = ?11 WHERE id = ?1",
        params![
            id,
            name,
            description,
            default_vpn_id,
            website_url,
            location,
            if obsolete { 1 } else { 0 },
            if hidden_from_clients_nav { 1 } else { 0 },
            contract_type_id,
            update_count,
            ts
        ],
    )?;
    insert_audit(conn, "update", "client", Some(id))?;
    Ok(())
}

/// Se il cliente ha esattamente una VPN, ne restituisce l'id (per allineare RDP senza campo esplicito).
pub fn single_vpn_id_for_client(conn: &Connection, client_id: &str) -> SqlResult<Option<String>> {
    let mut stmt = conn.prepare(
        "SELECT id FROM vpn_connections WHERE client_id = ?1 ORDER BY name COLLATE NOCASE",
    )?;
    let ids: Vec<String> = stmt
        .query_map([client_id], |r| r.get::<_, String>(0))?
        .collect::<Result<_, _>>()?;
    if ids.len() == 1 {
        Ok(Some(ids[0].clone()))
    } else {
        Ok(None)
    }
}

pub fn vpn_belongs_to_client(conn: &Connection, vpn_id: &str, client_id: &str) -> SqlResult<bool> {
    let mut stmt =
        conn.prepare("SELECT 1 FROM vpn_connections WHERE id = ?1 AND client_id = ?2 LIMIT 1")?;
    let ok = stmt.exists(params![vpn_id, client_id])?;
    Ok(ok)
}

pub fn delete_client(conn: &Connection, id: &str) -> SqlResult<()> {
    conn.execute("DELETE FROM clients WHERE id = ?1", [id])?;
    insert_audit(conn, "delete", "client", Some(id))?;
    Ok(())
}

fn parse_deployments_blob(
    json_col: Option<String>,
    legacy_env: Option<String>,
    legacy_rel: Option<String>,
) -> Vec<RdpEnvironmentDeployment> {
    if let Some(raw) = json_col
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        if let Ok(mut v) = serde_json::from_str::<Vec<RdpEnvironmentDeployment>>(raw) {
            v.retain(|d| !d.environment_id.trim().is_empty());
            if !v.is_empty() {
                return v;
            }
        }
    }
    let e = legacy_env
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Some(environment_id) = e {
        let release_option_id = legacy_rel
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        return vec![RdpEnvironmentDeployment {
            environment_id,
            release_option_id,
        }];
    }
    Vec::new()
}

fn deployments_json_for_db(slots: &[RdpEnvironmentDeployment]) -> Option<String> {
    if slots.is_empty() {
        return None;
    }
    serde_json::to_string(slots).ok()
}

fn sync_legacy_from_deployments(cur: &mut RdpConnection) {
    if cur.environment_deployments.is_empty() {
        cur.environment_id = None;
        cur.release_option_id = None;
        return;
    }
    if let Some(first) = cur.environment_deployments.first() {
        cur.environment_id = Some(first.environment_id.clone());
        cur.release_option_id = first.release_option_id.clone();
    }
}

fn sanitize_new_deployments(
    multis: Option<Vec<RdpEnvironmentDeployment>>,
    singular_env: Option<String>,
    singular_rel: Option<String>,
) -> Vec<RdpEnvironmentDeployment> {
    let mut out: Vec<RdpEnvironmentDeployment> = multis
        .unwrap_or_default()
        .into_iter()
        .filter_map(|d| {
            let e = d.environment_id.trim().to_string();
            if e.is_empty() {
                return None;
            }
            let release_option_id = d
                .release_option_id
                .as_ref()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            Some(RdpEnvironmentDeployment {
                environment_id: e,
                release_option_id,
            })
        })
        .collect();
    if out.is_empty() {
        let e = singular_env
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        if let Some(environment_id) = e {
            let release_option_id = singular_rel
                .as_ref()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            out.push(RdpEnvironmentDeployment {
                environment_id,
                release_option_id,
            });
        }
    }
    out
}

fn ensure_unique_deployments(slots: &[RdpEnvironmentDeployment]) -> SqlResult<()> {
    let mut seen = std::collections::HashSet::<&str>::new();
    for s in slots {
        if !seen.insert(s.environment_id.as_str()) {
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "Ambienti duplicati sullo stesso host/IP",
                ),
            )));
        }
    }
    Ok(())
}

fn map_rdp(row: &rusqlite::Row<'_>) -> rusqlite::Result<RdpConnection> {
    let json_col: Option<String> = row.get(22)?;
    let env_legacy: Option<String> = row.get(19)?;
    let rel_legacy: Option<String> = row.get(21)?;
    let mut environment_deployments =
        parse_deployments_blob(json_col.clone(), env_legacy.clone(), rel_legacy.clone());
    if environment_deployments.is_empty() {
        environment_deployments = Vec::new();
    }
    let billing = row.get::<_, i64>(25)? != 0;
    let finance = row.get::<_, i64>(26)? != 0;
    let gw_credit = row.get::<_, i64>(27)? != 0;
    let mut r = RdpConnection {
        id: row.get(0)?,
        client_id: row.get(1)?,
        name: row.get(2)?,
        host: row.get(3)?,
        port: row.get(4)?,
        username: row.get(5)?,
        password_encrypted: row.get(6)?,
        domain: row.get(7)?,
        resolution_width: row.get(8)?,
        resolution_height: row.get(9)?,
        color_depth: row.get(10)?,
        use_fullscreen: row.get(11)?,
        use_clipboard: row.get(12)?,
        ignore_certificate: row.get(13)?,
        gateway_host: row.get(14)?,
        vpn_id: row.get(15)?,
        notes: row.get(16)?,
        rdp_file_path: row.get(17)?,
        version: row.get(18)?,
        environment_id: env_legacy,
        version_option_id: row.get(20)?,
        release_option_id: rel_legacy,
        environment_deployments,
        billing,
        finance,
        gw_credit,
        created_at: row.get(23)?,
        updated_at: row.get(24)?,
    };
    if !r.environment_deployments.is_empty() {
        sync_legacy_from_deployments(&mut r);
    }
    Ok(r)
}

pub fn list_rdp(conn: &Connection) -> SqlResult<Vec<RdpConnection>> {
    let mut stmt = conn.prepare(
        "SELECT r.id, r.client_id, r.name, r.host, r.port, r.username, r.password_encrypted, r.domain,
                r.resolution_width, r.resolution_height, r.color_depth, r.use_fullscreen, r.use_clipboard,
                r.ignore_certificate, r.gateway_host, r.vpn_id, r.notes, r.rdp_file_path, r.version,
                r.environment_id, r.version_option_id, r.release_option_id, r.environment_deployments_json,
                r.created_at, r.updated_at, COALESCE(r.billing, 0), COALESCE(r.finance, 0), COALESCE(r.gw_credit, 0)
         FROM rdp_connections r
         INNER JOIN clients c ON c.id = r.client_id AND COALESCE(c.obsolete, 0) = 0
         ORDER BY r.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], map_rdp)?;
    rows.collect()
}

pub fn list_rdp_by_client(conn: &Connection, client_id: &str) -> SqlResult<Vec<RdpConnection>> {
    let mut stmt = conn.prepare(
        "SELECT r.id, r.client_id, r.name, r.host, r.port, r.username, r.password_encrypted, r.domain,
                r.resolution_width, r.resolution_height, r.color_depth, r.use_fullscreen, r.use_clipboard,
                r.ignore_certificate, r.gateway_host, r.vpn_id, r.notes, r.rdp_file_path, r.version,
                r.environment_id, r.version_option_id, r.release_option_id, r.environment_deployments_json,
                r.created_at, r.updated_at, COALESCE(r.billing, 0), COALESCE(r.finance, 0), COALESCE(r.gw_credit, 0)
         FROM rdp_connections r
         INNER JOIN clients c ON c.id = r.client_id AND COALESCE(c.obsolete, 0) = 0
         WHERE r.client_id = ?1 ORDER BY r.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([client_id], map_rdp)?;
    rows.collect()
}

/// Tutte le connessioni RDP, incluso per clienti obsoleti (export backup completo).
pub fn list_rdp_for_backup(conn: &Connection) -> SqlResult<Vec<RdpConnection>> {
    let mut stmt = conn.prepare(
        "SELECT r.id, r.client_id, r.name, r.host, r.port, r.username, r.password_encrypted, r.domain,
                r.resolution_width, r.resolution_height, r.color_depth, r.use_fullscreen, r.use_clipboard,
                r.ignore_certificate, r.gateway_host, r.vpn_id, r.notes, r.rdp_file_path, r.version,
                r.environment_id, r.version_option_id, r.release_option_id, r.environment_deployments_json,
                r.created_at, r.updated_at, COALESCE(r.billing, 0), COALESCE(r.finance, 0), COALESCE(r.gw_credit, 0)
         FROM rdp_connections r
         ORDER BY r.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], map_rdp)?;
    rows.collect()
}

pub fn get_rdp(conn: &Connection, id: &str) -> SqlResult<Option<RdpConnection>> {
    let mut stmt = conn.prepare(
        "SELECT id, client_id, name, host, port, username, password_encrypted, domain,
                resolution_width, resolution_height, color_depth, use_fullscreen, use_clipboard,
                ignore_certificate, gateway_host, vpn_id, notes, rdp_file_path, version,
                environment_id, version_option_id, release_option_id, environment_deployments_json,
                created_at, updated_at, COALESCE(billing, 0), COALESCE(finance, 0), COALESCE(gw_credit, 0)
         FROM rdp_connections WHERE id = ?1",
    )?;
    stmt.query_row([id], map_rdp).optional()
}

pub fn create_rdp(
    conn: &Connection,
    input: &CreateRdpInput,
    password_enc: Option<String>,
) -> SqlResult<RdpConnection> {
    let id = Uuid::new_v4().to_string();
    let ts = now_iso();
    let port = input.port.unwrap_or(3389);
    let rw = input.resolution_width.unwrap_or(1920);
    let rh = input.resolution_height.unwrap_or(1080);
    let cd = input.color_depth.unwrap_or(32);
    let fs = if input.use_fullscreen.unwrap_or(true) {
        1
    } else {
        0
    };
    let cb = if input.use_clipboard.unwrap_or(true) {
        1
    } else {
        0
    };
    let ic = if input.ignore_certificate.unwrap_or(true) {
        1
    } else {
        0
    };
    let path_store = input
        .rdp_file_path
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let version_store = input
        .version
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let vo_id = input
        .version_option_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let slots = sanitize_new_deployments(
        input.environment_deployments.clone(),
        input.environment_id.clone(),
        input.release_option_id.clone(),
    );
    ensure_unique_deployments(&slots)?;
    let env_id = slots.first().map(|s| s.environment_id.clone());
    let ro_id = slots.first().and_then(|s| s.release_option_id.clone());
    let dep_json = deployments_json_for_db(&slots);
    let billing = if input.billing.unwrap_or(false) { 1 } else { 0 };
    let finance = if input.finance.unwrap_or(false) { 1 } else { 0 };
    let gw_credit = if input.gw_credit.unwrap_or(false) {
        1
    } else {
        0
    };
    conn.execute(
        "INSERT INTO rdp_connections (
            id, client_id, name, host, port, username, password_encrypted, domain,
            resolution_width, resolution_height, color_depth, use_fullscreen, use_clipboard,
            ignore_certificate, gateway_host, vpn_id, notes, rdp_file_path, version,
            environment_id, version_option_id, release_option_id, environment_deployments_json,
            created_at, updated_at, billing, finance, gw_credit
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28)",
        params![
            id,
            input.client_id,
            input.name.trim(),
            input.host.trim(),
            port,
            input.username.as_ref().map(|s| s.trim().to_string()),
            password_enc,
            input.domain.as_ref().map(|s| s.trim().to_string()),
            rw,
            rh,
            cd,
            fs,
            cb,
            ic,
            input.gateway_host.as_ref().map(|s| s.trim().to_string()),
            input.vpn_id.as_ref().cloned(),
            input.notes.as_ref().map(|s| s.trim().to_string()),
            path_store,
            version_store,
            env_id,
            vo_id,
            ro_id,
            dep_json,
            ts,
            ts,
            billing,
            finance,
            gw_credit,
        ],
    )?;
    insert_audit(conn, "create", "rdp", Some(&id))?;
    get_rdp(conn, &id).map(|o| o.expect("just inserted"))
}

pub enum PasswordChange {
    NoOp,
    Clear,
    Set(String),
}

pub fn update_rdp(
    conn: &Connection,
    id: &str,
    input: &UpdateRdpInput,
    password_change: PasswordChange,
) -> SqlResult<()> {
    let mut cur = get_rdp(conn, id)?.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
    if let Some(cid) = &input.client_id {
        cur.client_id = cid.clone();
    }
    if let Some(n) = &input.name {
        cur.name = n.trim().to_string();
    }
    if let Some(h) = &input.host {
        cur.host = h.trim().to_string();
    }
    if let Some(p) = input.port {
        cur.port = p;
    }
    if let Some(u) = &input.username {
        cur.username = Some(u.trim().to_string());
    }
    match &password_change {
        PasswordChange::NoOp => {}
        PasswordChange::Clear => cur.password_encrypted = None,
        PasswordChange::Set(blob) => cur.password_encrypted = Some(blob.clone()),
    }
    if let Some(d) = &input.domain {
        cur.domain = Some(d.trim().to_string());
    }
    if let Some(w) = input.resolution_width {
        cur.resolution_width = w;
    }
    if let Some(h) = input.resolution_height {
        cur.resolution_height = h;
    }
    if let Some(c) = input.color_depth {
        cur.color_depth = c;
    }
    if let Some(v) = input.use_fullscreen {
        cur.use_fullscreen = if v { 1 } else { 0 };
    }
    if let Some(v) = input.use_clipboard {
        cur.use_clipboard = if v { 1 } else { 0 };
    }
    if let Some(v) = input.ignore_certificate {
        cur.ignore_certificate = if v { 1 } else { 0 };
    }
    if let Some(g) = &input.gateway_host {
        cur.gateway_host = Some(g.trim().to_string());
    }
    if let Some(vid) = &input.vpn_id {
        cur.vpn_id = Some(vid.clone());
    }
    if let Some(n) = &input.notes {
        cur.notes = Some(n.trim().to_string());
    }
    if let Some(fp) = &input.rdp_file_path {
        let t = fp.trim();
        cur.rdp_file_path = if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        };
    }
    if let Some(ref ver) = input.version {
        cur.version = if ver.trim().is_empty() {
            None
        } else {
            Some(ver.trim().to_string())
        };
    }
    let had_multi = cur.environment_deployments.len() > 1;
    let sing_env_ok = input.environment_deployments.is_none() && !had_multi;
    if sing_env_ok {
        if let Some(ref eid) = input.environment_id {
            cur.environment_id = if eid.trim().is_empty() {
                None
            } else {
                Some(eid.trim().to_string())
            };
        }
        if let Some(ref roi) = input.release_option_id {
            cur.release_option_id = if roi.trim().is_empty() {
                None
            } else {
                Some(roi.trim().to_string())
            };
        }
    }
    if let Some(ref voi) = input.version_option_id {
        cur.version_option_id = if voi.trim().is_empty() {
            None
        } else {
            Some(voi.trim().to_string())
        };
    }
    if let Some(ref dep) = input.environment_deployments {
        cur.environment_deployments = sanitize_new_deployments(Some(dep.clone()), None, None);
    } else if !had_multi {
        cur.environment_deployments = sanitize_new_deployments(
            None,
            cur.environment_id.clone(),
            cur.release_option_id.clone(),
        );
    }
    ensure_unique_deployments(&cur.environment_deployments)?;
    sync_legacy_from_deployments(&mut cur);
    let dep_json = deployments_json_for_db(&cur.environment_deployments);
    if let Some(v) = input.billing {
        cur.billing = v;
    }
    if let Some(v) = input.finance {
        cur.finance = v;
    }
    if let Some(v) = input.gw_credit {
        cur.gw_credit = v;
    }
    let ts = now_iso();
    conn.execute(
        "UPDATE rdp_connections SET
            client_id = ?2, name = ?3, host = ?4, port = ?5, username = ?6, password_encrypted = ?7,
            domain = ?8, resolution_width = ?9, resolution_height = ?10, color_depth = ?11,
            use_fullscreen = ?12, use_clipboard = ?13, ignore_certificate = ?14,
            gateway_host = ?15, vpn_id = ?16, notes = ?17, rdp_file_path = ?18, version = ?19,
            environment_id = ?20, version_option_id = ?21, release_option_id = ?22,
            environment_deployments_json = ?23, updated_at = ?24,
            billing = ?25, finance = ?26, gw_credit = ?27
         WHERE id = ?1",
        params![
            id,
            cur.client_id,
            cur.name,
            cur.host,
            cur.port,
            cur.username,
            cur.password_encrypted,
            cur.domain,
            cur.resolution_width,
            cur.resolution_height,
            cur.color_depth,
            cur.use_fullscreen,
            cur.use_clipboard,
            cur.ignore_certificate,
            cur.gateway_host,
            cur.vpn_id,
            cur.notes,
            cur.rdp_file_path,
            cur.version,
            cur.environment_id,
            cur.version_option_id,
            cur.release_option_id,
            dep_json,
            ts,
            if cur.billing { 1 } else { 0 },
            if cur.finance { 1 } else { 0 },
            if cur.gw_credit { 1 } else { 0 },
        ],
    )?;
    insert_audit(conn, "update", "rdp", Some(id))?;
    Ok(())
}

pub fn delete_rdp(conn: &Connection, id: &str) -> SqlResult<()> {
    conn.execute("DELETE FROM rdp_connections WHERE id = ?1", [id])?;
    insert_audit(conn, "delete", "rdp", Some(id))?;
    Ok(())
}

fn map_vpn(row: &rusqlite::Row<'_>) -> rusqlite::Result<VpnConnection> {
    Ok(VpnConnection {
        id: row.get(0)?,
        client_id: row.get(1)?,
        name: row.get(2)?,
        type_: row.get(3)?,
        server: row.get(4)?,
        username: row.get(5)?,
        password_encrypted: row.get(6)?,
        config_path: row.get(7)?,
        notes: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

pub fn list_vpn(conn: &Connection) -> SqlResult<Vec<VpnConnection>> {
    let mut stmt = conn.prepare(
        "SELECT v.id, v.client_id, v.name, v.type, v.server, v.username, v.password_encrypted, v.config_path, v.notes, v.created_at, v.updated_at
         FROM vpn_connections v
         INNER JOIN clients c ON c.id = v.client_id AND COALESCE(c.obsolete, 0) = 0
         ORDER BY v.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], map_vpn)?;
    rows.collect()
}

pub fn list_vpn_by_client(conn: &Connection, client_id: &str) -> SqlResult<Vec<VpnConnection>> {
    let mut stmt = conn.prepare(
        "SELECT v.id, v.client_id, v.name, v.type, v.server, v.username, v.password_encrypted, v.config_path, v.notes, v.created_at, v.updated_at
         FROM vpn_connections v
         INNER JOIN clients c ON c.id = v.client_id AND COALESCE(c.obsolete, 0) = 0
         WHERE v.client_id = ?1 ORDER BY v.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([client_id], map_vpn)?;
    rows.collect()
}

/// Tutte le VPN, incluso per clienti obsoleti (export backup completo).
pub fn list_vpn_for_backup(conn: &Connection) -> SqlResult<Vec<VpnConnection>> {
    let mut stmt = conn.prepare(
        "SELECT v.id, v.client_id, v.name, v.type, v.server, v.username, v.password_encrypted, v.config_path, v.notes, v.created_at, v.updated_at
         FROM vpn_connections v
         ORDER BY v.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], map_vpn)?;
    rows.collect()
}

pub fn get_vpn(conn: &Connection, id: &str) -> SqlResult<Option<VpnConnection>> {
    let mut stmt = conn.prepare(
        "SELECT id, client_id, name, type, server, username, password_encrypted, config_path, notes, created_at, updated_at
         FROM vpn_connections WHERE id = ?1",
    )?;
    stmt.query_row([id], map_vpn).optional()
}

pub fn create_vpn(
    conn: &Connection,
    input: &CreateVpnInput,
    password_enc: Option<String>,
) -> SqlResult<VpnConnection> {
    let id = Uuid::new_v4().to_string();
    let ts = now_iso();
    conn.execute(
        "INSERT INTO vpn_connections (id, client_id, name, type, server, username, password_encrypted, config_path, notes, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![
            id,
            input.client_id,
            input.name.trim(),
            input.type_.trim(),
            input.server.as_ref().map(|s| s.trim().to_string()),
            input.username.as_ref().map(|s| s.trim().to_string()),
            password_enc,
            input.config_path.as_ref().map(|s| s.trim().to_string()),
            input.notes.as_ref().map(|s| s.trim().to_string()),
            ts,
            ts,
        ],
    )?;
    insert_audit(conn, "create", "vpn", Some(&id))?;
    let v = get_vpn(conn, &id).map(|o| o.expect("inserted"))?;
    let cnt: i64 = conn.query_row(
        "SELECT COUNT(*) FROM vpn_connections WHERE client_id = ?1",
        [&input.client_id],
        |r| r.get(0),
    )?;
    if cnt == 1 {
        let ts2 = now_iso();
        conn.execute(
            "UPDATE clients SET default_vpn_id = ?1, updated_at = ?2 WHERE id = ?3 AND default_vpn_id IS NULL",
            params![id, ts2, input.client_id],
        )?;
    }
    Ok(v)
}

pub fn update_vpn(
    conn: &Connection,
    id: &str,
    input: &UpdateVpnInput,
    password_change: PasswordChange,
) -> SqlResult<()> {
    let mut cur = get_vpn(conn, id)?.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
    let old_client_id = cur.client_id.clone();
    if let Some(cid) = &input.client_id {
        cur.client_id = cid.clone();
    }
    if let Some(n) = &input.name {
        cur.name = n.trim().to_string();
    }
    if let Some(t) = &input.type_ {
        cur.type_ = t.trim().to_string();
    }
    if let Some(s) = &input.server {
        cur.server = Some(s.trim().to_string());
    }
    if let Some(u) = &input.username {
        cur.username = Some(u.trim().to_string());
    }
    match &password_change {
        PasswordChange::NoOp => {}
        PasswordChange::Clear => cur.password_encrypted = None,
        PasswordChange::Set(blob) => cur.password_encrypted = Some(blob.clone()),
    }
    if let Some(c) = &input.config_path {
        cur.config_path = Some(c.trim().to_string());
    }
    if let Some(n) = &input.notes {
        cur.notes = Some(n.trim().to_string());
    }
    let ts = now_iso();
    conn.execute(
        "UPDATE vpn_connections SET client_id = ?2, name = ?3, type = ?4, server = ?5, username = ?6,
            password_encrypted = ?7, config_path = ?8, notes = ?9, updated_at = ?10 WHERE id = ?1",
        params![
            id,
            cur.client_id,
            cur.name,
            cur.type_,
            cur.server,
            cur.username,
            cur.password_encrypted,
            cur.config_path,
            cur.notes,
            ts,
        ],
    )?;
    insert_audit(conn, "update", "vpn", Some(id))?;
    if old_client_id != cur.client_id {
        conn.execute(
            "UPDATE clients SET default_vpn_id = NULL WHERE default_vpn_id = ?1",
            [id],
        )?;
    }
    Ok(())
}

pub fn delete_vpn(conn: &Connection, id: &str) -> SqlResult<()> {
    conn.execute(
        "UPDATE clients SET default_vpn_id = NULL WHERE default_vpn_id = ?1",
        [id],
    )?;
    conn.execute("DELETE FROM vpn_connections WHERE id = ?1", [id])?;
    insert_audit(conn, "delete", "vpn", Some(id))?;
    Ok(())
}

fn map_web(row: &rusqlite::Row<'_>) -> rusqlite::Result<WebAccess> {
    let json_raw: Option<String> = row.get(12)?;
    let legacy_single: Option<String> = row.get(13)?;
    let sportello_i: i64 = row.get(14)?;
    let crm_module_ids = parse_web_crm_module_ids(json_raw, legacy_single);
    Ok(WebAccess {
        id: row.get(0)?,
        client_id: row.get(1)?,
        name: row.get(2)?,
        url: row.get(3)?,
        username: row.get(4)?,
        domain: row.get(5)?,
        password_encrypted: row.get(6)?,
        notes: row.get(7)?,
        version: row.get(8)?,
        environment_id: row.get(9)?,
        version_option_id: row.get(10)?,
        release_option_id: row.get(11)?,
        crm_module_ids,
        crm_module_id: None,
        sportello: sportello_i != 0,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
    })
}

pub fn list_web(conn: &Connection) -> SqlResult<Vec<WebAccess>> {
    let mut stmt = conn.prepare(
        "SELECT w.id, w.client_id, w.name, w.url, w.username, w.domain, w.password_encrypted, w.notes, w.version,
                w.environment_id, w.version_option_id, w.release_option_id,
                w.crm_module_ids_json, w.crm_module_id, COALESCE(w.sportello, 0),
                w.created_at, w.updated_at
         FROM web_access w
         INNER JOIN clients c ON c.id = w.client_id AND COALESCE(c.obsolete, 0) = 0
         ORDER BY w.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], map_web)?;
    rows.collect()
}

pub fn list_web_by_client(conn: &Connection, client_id: &str) -> SqlResult<Vec<WebAccess>> {
    let mut stmt = conn.prepare(
        "SELECT w.id, w.client_id, w.name, w.url, w.username, w.domain, w.password_encrypted, w.notes, w.version,
                w.environment_id, w.version_option_id, w.release_option_id,
                w.crm_module_ids_json, w.crm_module_id, COALESCE(w.sportello, 0),
                w.created_at, w.updated_at
         FROM web_access w
         INNER JOIN clients c ON c.id = w.client_id AND COALESCE(c.obsolete, 0) = 0
         WHERE w.client_id = ?1 ORDER BY w.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([client_id], map_web)?;
    rows.collect()
}

/// Tutti gli accessi web, incluso per clienti obsoleti (export backup completo).
pub fn list_web_for_backup(conn: &Connection) -> SqlResult<Vec<WebAccess>> {
    let mut stmt = conn.prepare(
        "SELECT w.id, w.client_id, w.name, w.url, w.username, w.domain, w.password_encrypted, w.notes, w.version,
                w.environment_id, w.version_option_id, w.release_option_id,
                w.crm_module_ids_json, w.crm_module_id, COALESCE(w.sportello, 0),
                w.created_at, w.updated_at
         FROM web_access w
         ORDER BY w.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], map_web)?;
    rows.collect()
}

pub fn get_web(conn: &Connection, id: &str) -> SqlResult<Option<WebAccess>> {
    let mut stmt = conn.prepare(
        "SELECT id, client_id, name, url, username, domain, password_encrypted, notes, version,
                environment_id, version_option_id, release_option_id,
                crm_module_ids_json, crm_module_id, COALESCE(sportello, 0), created_at, updated_at
         FROM web_access WHERE id = ?1",
    )?;
    stmt.query_row([id], map_web).optional()
}

pub fn create_web(
    conn: &Connection,
    input: &CreateWebAccessInput,
    password_enc: Option<String>,
) -> SqlResult<WebAccess> {
    let id = Uuid::new_v4().to_string();
    let ts = now_iso();
    let version_store = input
        .version
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let env_id = input
        .environment_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let vo_id = input
        .version_option_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let ro_id = input
        .release_option_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let domain_store = input
        .domain
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let merged_crm = merged_crm_ids_for_create(input);
    let (crm_json_store, crm_legacy_store) = web_crm_sql_tuple(&merged_crm);
    let sportello_i = if input.sportello.unwrap_or(false) {
        1
    } else {
        0
    };
    conn.execute(
        "INSERT INTO web_access (id, client_id, name, url, username, domain, password_encrypted, notes, version, environment_id, version_option_id, release_option_id, crm_module_ids_json, crm_module_id, sportello, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
        params![
            id,
            input.client_id,
            input.name.trim(),
            input.url.trim(),
            input.username.as_ref().map(|s| s.trim().to_string()),
            domain_store,
            password_enc,
            input.notes.as_ref().map(|s| s.trim().to_string()),
            version_store,
            env_id,
            vo_id,
            ro_id,
            crm_json_store,
            crm_legacy_store,
            sportello_i,
            ts,
            ts,
        ],
    )?;
    insert_audit(conn, "create", "web_access", Some(&id))?;
    get_web(conn, &id).map(|o| o.expect("inserted"))
}

pub fn update_web(
    conn: &Connection,
    id: &str,
    input: &UpdateWebAccessInput,
    password_change: PasswordChange,
) -> SqlResult<()> {
    let mut cur = get_web(conn, id)?.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
    if let Some(cid) = &input.client_id {
        cur.client_id = cid.clone();
    }
    if let Some(n) = &input.name {
        cur.name = n.trim().to_string();
    }
    if let Some(u) = &input.url {
        cur.url = u.trim().to_string();
    }
    if let Some(user) = &input.username {
        cur.username = Some(user.trim().to_string());
    }
    if let Some(dom) = &input.domain {
        cur.domain = if dom.trim().is_empty() {
            None
        } else {
            Some(dom.trim().to_string())
        };
    }
    match &password_change {
        PasswordChange::NoOp => {}
        PasswordChange::Clear => cur.password_encrypted = None,
        PasswordChange::Set(blob) => cur.password_encrypted = Some(blob.clone()),
    }
    if let Some(n) = &input.notes {
        cur.notes = Some(n.trim().to_string());
    }
    if let Some(ref ver) = input.version {
        cur.version = if ver.trim().is_empty() {
            None
        } else {
            Some(ver.trim().to_string())
        };
    }
    if let Some(ref eid) = input.environment_id {
        cur.environment_id = if eid.trim().is_empty() {
            None
        } else {
            Some(eid.trim().to_string())
        };
    }
    if let Some(ref voi) = input.version_option_id {
        cur.version_option_id = if voi.trim().is_empty() {
            None
        } else {
            Some(voi.trim().to_string())
        };
    }
    if let Some(ref roi) = input.release_option_id {
        cur.release_option_id = if roi.trim().is_empty() {
            None
        } else {
            Some(roi.trim().to_string())
        };
    }
    if let Some(ref list) = input.crm_module_ids {
        cur.crm_module_ids = normalize_web_crm_input_ids(list);
    } else if input.crm_module_id.is_some() {
        cur.crm_module_ids = parse_web_crm_module_ids(None, input.crm_module_id.clone());
    }
    if let Some(s) = input.sportello {
        cur.sportello = s;
    }
    let ts = now_iso();
    let (crm_j, crm_first) = web_crm_sql_tuple(&cur.crm_module_ids);
    conn.execute(
        "UPDATE web_access SET client_id = ?2, name = ?3, url = ?4, username = ?5, domain = ?6,
            password_encrypted = ?7, notes = ?8, version = ?9,
            environment_id = ?10, version_option_id = ?11, release_option_id = ?12,
            crm_module_ids_json = ?13, crm_module_id = ?14, sportello = ?15, updated_at = ?16 WHERE id = ?1",
        params![
            id,
            cur.client_id,
            cur.name,
            cur.url,
            cur.username,
            cur.domain,
            cur.password_encrypted,
            cur.notes,
            cur.version,
            cur.environment_id,
            cur.version_option_id,
            cur.release_option_id,
            crm_j,
            crm_first,
            if cur.sportello { 1 } else { 0 },
            ts,
        ],
    )?;
    insert_audit(conn, "update", "web_access", Some(id))?;
    Ok(())
}

pub fn delete_web(conn: &Connection, id: &str) -> SqlResult<()> {
    conn.execute("DELETE FROM web_access WHERE id = ?1", [id])?;
    insert_audit(conn, "delete", "web_access", Some(id))?;
    Ok(())
}

pub fn recent_audit(conn: &Connection, limit: i64) -> SqlResult<Vec<AuditLogEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, action, entity_type, entity_id, created_at FROM audit_logs ORDER BY datetime(created_at) DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], |row| {
        Ok(AuditLogEntry {
            id: row.get(0)?,
            action: row.get(1)?,
            entity_type: row.get(2)?,
            entity_id: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn count_clients(conn: &Connection) -> SqlResult<i64> {
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM clients WHERE COALESCE(obsolete, 0) = 0")?;
    stmt.query_row([], |r| r.get(0))
}

pub fn count_rdp(conn: &Connection) -> SqlResult<i64> {
    let mut stmt = conn.prepare(
        "SELECT COUNT(*) FROM rdp_connections r
         INNER JOIN clients c ON c.id = r.client_id AND COALESCE(c.obsolete, 0) = 0",
    )?;
    stmt.query_row([], |r| r.get(0))
}

pub fn count_vpn(conn: &Connection) -> SqlResult<i64> {
    let mut stmt = conn.prepare(
        "SELECT COUNT(*) FROM vpn_connections v
         INNER JOIN clients c ON c.id = v.client_id AND COALESCE(c.obsolete, 0) = 0",
    )?;
    stmt.query_row([], |r| r.get(0))
}

pub fn count_web(conn: &Connection) -> SqlResult<i64> {
    let mut stmt = conn.prepare(
        "SELECT COUNT(*) FROM web_access w
         INNER JOIN clients c ON c.id = w.client_id AND COALESCE(c.obsolete, 0) = 0",
    )?;
    stmt.query_row([], |r| r.get(0))
}

pub fn list_all_settings(conn: &Connection) -> SqlResult<Vec<(String, String)>> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings ORDER BY key")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    rows.collect()
}

pub fn list_all_audit(conn: &Connection) -> SqlResult<Vec<AuditLogEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, action, entity_type, entity_id, created_at FROM audit_logs ORDER BY datetime(created_at) ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(AuditLogEntry {
            id: row.get(0)?,
            action: row.get(1)?,
            entity_type: row.get(2)?,
            entity_id: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn insert_client_raw(tx: &rusqlite::Transaction<'_>, c: &Client) -> SqlResult<()> {
    tx.execute(
        "INSERT OR REPLACE INTO clients (id, name, description, default_vpn_id, website_url, location, obsolete, hidden_from_clients_nav, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![
            c.id,
            c.name,
            c.description,
            c.default_vpn_id,
            c.website_url,
            c.location,
            if c.obsolete { 1 } else { 0 },
            if c.hidden_from_clients_nav { 1 } else { 0 },
            c.created_at,
            c.updated_at
        ],
    )?;
    Ok(())
}

pub fn insert_vpn_raw(tx: &rusqlite::Transaction<'_>, v: &VpnConnection) -> SqlResult<()> {
    tx.execute(
        "INSERT OR REPLACE INTO vpn_connections (id, client_id, name, type, server, username, password_encrypted, config_path, notes, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![
            v.id,
            v.client_id,
            v.name,
            v.type_,
            v.server,
            v.username,
            v.password_encrypted,
            v.config_path,
            v.notes,
            v.created_at,
            v.updated_at,
        ],
    )?;
    Ok(())
}

pub fn insert_rdp_raw(tx: &rusqlite::Transaction<'_>, r: &RdpConnection) -> SqlResult<()> {
    let dep_json = deployments_json_for_db(&r.environment_deployments);
    tx.execute(
        "INSERT OR REPLACE INTO rdp_connections (
            id, client_id, name, host, port, username, password_encrypted, domain,
            resolution_width, resolution_height, color_depth, use_fullscreen, use_clipboard,
            ignore_certificate, gateway_host, vpn_id, notes, rdp_file_path, version,
            environment_id, version_option_id, release_option_id, environment_deployments_json,
            created_at, updated_at, billing, finance, gw_credit
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28)",
        params![
            r.id,
            r.client_id,
            r.name,
            r.host,
            r.port,
            r.username,
            r.password_encrypted,
            r.domain,
            r.resolution_width,
            r.resolution_height,
            r.color_depth,
            r.use_fullscreen,
            r.use_clipboard,
            r.ignore_certificate,
            r.gateway_host,
            r.vpn_id,
            r.notes,
            r.rdp_file_path,
            r.version,
            r.environment_id,
            r.version_option_id,
            r.release_option_id,
            dep_json,
            r.created_at,
            r.updated_at,
            if r.billing { 1 } else { 0 },
            if r.finance { 1 } else { 0 },
            if r.gw_credit { 1 } else { 0 },
        ],
    )?;
    Ok(())
}

pub fn insert_web_raw(tx: &rusqlite::Transaction<'_>, w: &WebAccess) -> SqlResult<()> {
    let mut merged = w.crm_module_ids.clone();
    if merged.is_empty() {
        if let Some(ref s) = w.crm_module_id {
            let t = s.trim().to_string();
            if !t.is_empty() {
                merged.push(t);
            }
        }
    }
    let (cj, cfirst) = web_crm_sql_tuple(&merged);
    tx.execute(
        "INSERT OR REPLACE INTO web_access (id, client_id, name, url, username, domain, password_encrypted, notes, version, environment_id, version_option_id, release_option_id, crm_module_ids_json, crm_module_id, sportello, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
        params![
            w.id,
            w.client_id,
            w.name,
            w.url,
            w.username,
            w.domain,
            w.password_encrypted,
            w.notes,
            w.version,
            w.environment_id,
            w.version_option_id,
            w.release_option_id,
            cj,
            cfirst,
            if w.sportello { 1 } else { 0 },
            w.created_at,
            w.updated_at,
        ],
    )?;
    Ok(())
}

fn map_client_contact_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ClientContact> {
    Ok(ClientContact {
        id: row.get(0)?,
        client_id: row.get(1)?,
        first_name: row.get(2)?,
        last_name: row.get(3)?,
        email: row.get(4)?,
        phone: row.get(5)?,
        mobile: row.get(6)?,
        role: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

pub fn list_contacts_by_client(
    conn: &Connection,
    client_id: &str,
) -> SqlResult<Vec<ClientContact>> {
    let mut stmt = conn.prepare(
        "SELECT id, client_id, first_name, last_name, email, phone, mobile, role, created_at, updated_at
         FROM client_contacts WHERE client_id = ?1 ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([client_id], map_client_contact_row)?;
    rows.collect()
}

pub fn list_contacts_all_visible_clients(conn: &Connection) -> SqlResult<Vec<ClientContact>> {
    let mut stmt = conn.prepare(
        "SELECT cc.id, cc.client_id, cc.first_name, cc.last_name, cc.email, cc.phone, cc.mobile, cc.role, cc.created_at, cc.updated_at
         FROM client_contacts cc
         INNER JOIN clients c ON c.id = cc.client_id AND COALESCE(c.obsolete, 0) = 0
         ORDER BY c.name COLLATE NOCASE, cc.last_name COLLATE NOCASE, cc.first_name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], map_client_contact_row)?;
    rows.collect()
}

pub fn list_contacts_for_backup(conn: &Connection) -> SqlResult<Vec<ClientContact>> {
    let mut stmt = conn.prepare(
        "SELECT id, client_id, first_name, last_name, email, phone, mobile, role, created_at, updated_at
         FROM client_contacts ORDER BY client_id, last_name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], map_client_contact_row)?;
    rows.collect()
}

pub fn get_client_contact(conn: &Connection, id: &str) -> SqlResult<Option<ClientContact>> {
    let mut stmt = conn.prepare(
        "SELECT id, client_id, first_name, last_name, email, phone, mobile, role, created_at, updated_at
         FROM client_contacts WHERE id = ?1",
    )?;
    stmt.query_row([id], map_client_contact_row).optional()
}

fn trim_opt(s: &Option<String>) -> Option<String> {
    s.as_ref()
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty())
}

pub fn create_client_contact(
    conn: &Connection,
    input: &CreateClientContactInput,
) -> SqlResult<ClientContact> {
    get_client(conn, input.client_id.trim())?
        .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
    let id = Uuid::new_v4().to_string();
    let ts = now_iso();
    let first = input.first_name.trim().to_string();
    let last = input.last_name.trim().to_string();
    let email = trim_opt(&input.email);
    let phone = trim_opt(&input.phone);
    let mobile = trim_opt(&input.mobile);
    let role = trim_opt(&input.role);
    conn.execute(
        "INSERT INTO client_contacts (id, client_id, first_name, last_name, email, phone, mobile, role, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![
            id,
            input.client_id.trim(),
            first,
            last,
            email,
            phone,
            mobile,
            role,
            ts,
            ts
        ],
    )?;
    insert_audit(conn, "create", "client_contact", Some(&id))?;
    get_client_contact(conn, &id)?.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)
}

pub fn update_client_contact(
    conn: &Connection,
    id: &str,
    input: &UpdateClientContactInput,
) -> SqlResult<()> {
    let existing =
        get_client_contact(conn, id)?.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
    let mut client_id = existing.client_id.clone();
    if let Some(ref cid) = input.client_id {
        let t = cid.trim();
        if !t.is_empty() {
            get_client(conn, t)?.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
            client_id = t.to_string();
        }
    }
    let first_name = input
        .first_name
        .as_ref()
        .map(|s| s.trim().to_string())
        .unwrap_or(existing.first_name);
    let last_name = input
        .last_name
        .as_ref()
        .map(|s| s.trim().to_string())
        .unwrap_or(existing.last_name);
    let email = match input.email.as_ref() {
        None => existing.email,
        Some(s) => trim_opt(&Some(s.clone())),
    };
    let phone = match input.phone.as_ref() {
        None => existing.phone,
        Some(s) => trim_opt(&Some(s.clone())),
    };
    let mobile = match input.mobile.as_ref() {
        None => existing.mobile,
        Some(s) => trim_opt(&Some(s.clone())),
    };
    let role = match input.role.as_ref() {
        None => existing.role,
        Some(s) => trim_opt(&Some(s.clone())),
    };
    let ts = now_iso();
    conn.execute(
        "UPDATE client_contacts SET client_id = ?2, first_name = ?3, last_name = ?4, email = ?5, phone = ?6, mobile = ?7, role = ?8, updated_at = ?9 WHERE id = ?1",
        params![id, client_id, first_name, last_name, email, phone, mobile, role, ts],
    )?;
    insert_audit(conn, "update", "client_contact", Some(id))?;
    Ok(())
}

pub fn delete_client_contact(conn: &Connection, id: &str) -> SqlResult<()> {
    conn.execute("DELETE FROM client_contacts WHERE id = ?1", [id])?;
    insert_audit(conn, "delete", "client_contact", Some(id))?;
    Ok(())
}

pub fn insert_client_contact_raw(
    tx: &rusqlite::Transaction<'_>,
    c: &ClientContact,
) -> SqlResult<()> {
    tx.execute(
        "INSERT OR REPLACE INTO client_contacts (id, client_id, first_name, last_name, email, phone, mobile, role, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![
            c.id,
            c.client_id,
            c.first_name,
            c.last_name,
            c.email,
            c.phone,
            c.mobile,
            c.role,
            c.created_at,
            c.updated_at
        ],
    )?;
    Ok(())
}

pub fn insert_audit_raw(tx: &rusqlite::Transaction<'_>, a: &AuditLogEntry) -> SqlResult<()> {
    tx.execute(
        "INSERT OR REPLACE INTO audit_logs (id, action, entity_type, entity_id, created_at) VALUES (?1,?2,?3,?4,?5)",
        params![a.id, a.action, a.entity_type, a.entity_id, a.created_at],
    )?;
    Ok(())
}

include!("collaborators.inc.rs");

/// Cancella tutte le righe applicative e le impostazioni (stesso risultato di un import backup
/// senza dati restituiti). Include rimozione della configurazione Vault e di tutti i contenuti DB.
pub fn wipe_database_to_empty(conn: &mut Connection) -> SqlResult<()> {
    let empty = crate::backup::BackupPayloadDe {
        version: 3,
        exported_at: Utc::now().to_rfc3339(),
        clients: Vec::new(),
        rdp: Vec::new(),
        vpn: Vec::new(),
        web: Vec::new(),
        client_contacts: Vec::new(),
        collaborator_roles: Vec::new(),
        collaborators: Vec::new(),
        audit_logs: Vec::new(),
        settings_pairs: Vec::new(),
    };
    restore_from_backup_payload(conn, &empty)
}

pub fn restore_from_backup_payload(
    conn: &mut Connection,
    data: &crate::backup::BackupPayloadDe,
) -> SqlResult<()> {
    let tx = conn.transaction()?;
    tx.execute_batch(
        "DELETE FROM rdp_connections;
         DELETE FROM web_access;
         DELETE FROM vpn_connections;
         DELETE FROM client_contacts;
         DELETE FROM collaborators;
         DELETE FROM collaborator_roles;
         DELETE FROM clients;
         DELETE FROM audit_logs;
         DELETE FROM settings;",
    )?;
    for c in &data.clients {
        insert_client_raw(&tx, c)?;
    }
    for cr in &data.collaborator_roles {
        insert_collaborator_role_raw(&tx, cr)?;
    }
    for cx in &data.collaborators {
        insert_collaborator_export_raw(&tx, cx)?;
    }
    for cc in &data.client_contacts {
        insert_client_contact_raw(&tx, cc)?;
    }
    for v in &data.vpn {
        insert_vpn_raw(&tx, v)?;
    }
    for r in &data.rdp {
        insert_rdp_raw(&tx, r)?;
    }
    for w in &data.web {
        insert_web_raw(&tx, w)?;
    }
    for a in &data.audit_logs {
        insert_audit_raw(&tx, a)?;
    }
    for (k, v) in &data.settings_pairs {
        tx.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![k, v],
        )?;
    }
    tx.commit()
}
