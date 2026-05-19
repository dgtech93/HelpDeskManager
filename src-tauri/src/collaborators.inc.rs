// Collaboratori interni — incluso da db.rs (evita dipendenze cicliche col restore).

fn collab_ue(msg: &'static str) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
        std::io::ErrorKind::InvalidInput,
        msg,
    )))
}

pub fn collaborator_next_role_rank(conn: &Connection) -> SqlResult<i64> {
    let v: Option<i64> = conn.query_row(
        "SELECT MAX(sort_rank) FROM collaborator_roles",
        [],
        |r| r.get::<_, Option<i64>>(0),
    )?;
    Ok(v.unwrap_or(-10_i64).saturating_add(10_i64))
}

pub fn list_collaborator_roles(conn: &Connection) -> SqlResult<Vec<CollaboratorRole>> {
    let mut stmt = conn.prepare(
        "SELECT id, label, sort_rank, created_at, updated_at FROM collaborator_roles ORDER BY sort_rank ASC, label COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(CollaboratorRole {
            id: row.get(0)?,
            label: row.get(1)?,
            sort_rank: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn collaborator_count_for_role(conn: &Connection, role_id: &str) -> SqlResult<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM collaborators WHERE role_id = ?1",
        [role_id],
        |r| r.get(0),
    )
}

pub fn collaborator_exists(conn: &Connection, id: &str) -> SqlResult<bool> {
    let n: i64 = conn.query_row("SELECT COUNT(*) FROM collaborators WHERE id = ?1", [id], |r| r.get(0))?;
    Ok(n > 0)
}

pub fn collaborator_role_exists(conn: &Connection, id: &str) -> SqlResult<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM collaborator_roles WHERE id = ?1",
        [id],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

fn collaborator_role_by_id(conn: &Connection, id: &str) -> SqlResult<Option<CollaboratorRole>> {
    conn.query_row(
        "SELECT id, label, sort_rank, created_at, updated_at FROM collaborator_roles WHERE id = ?1",
        [id],
        |row| {
            Ok(CollaboratorRole {
                id: row.get(0)?,
                label: row.get(1)?,
                sort_rank: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
    .optional()
}

pub fn create_collaborator_role(
    conn: &Connection,
    input: &CreateCollaboratorRoleInput,
) -> SqlResult<CollaboratorRole> {
    let label = input.label.trim().to_string();
    if label.is_empty() {
        return Err(collab_ue("etichetta ruolo vuota"));
    }
    let rank = match input.sort_rank {
        Some(r) => r,
        None => collaborator_next_role_rank(conn)?,
    };
    let id = Uuid::new_v4().to_string();
    let ts = now_iso();
    conn.execute(
        "INSERT INTO collaborator_roles (id, label, sort_rank, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, label, rank, &ts, &ts],
    )?;
    insert_audit(conn, "create", "collaborator_role", Some(&id))?;
    collaborator_role_by_id(conn, &id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn update_collaborator_role(
    conn: &Connection,
    id: &str,
    input: &UpdateCollaboratorRoleInput,
) -> SqlResult<()> {
    let existing = collaborator_role_by_id(conn, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
    let label = input.label.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let label = label.map(|x| x.to_string()).unwrap_or(existing.label);
    let sort_rank = input.sort_rank.unwrap_or(existing.sort_rank);
    let ts = now_iso();
    conn.execute(
        "UPDATE collaborator_roles SET label = ?2, sort_rank = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, label, sort_rank, ts],
    )?;
    insert_audit(conn, "update", "collaborator_role", Some(id))?;
    Ok(())
}

pub fn delete_collaborator_role(conn: &Connection, id: &str) -> SqlResult<()> {
    if collaborator_count_for_role(conn, id)? > 0 {
        return Err(collab_ue("Ruolo ancora usato dai collaboratori: riassegnali prima."));
    }
    conn.execute("DELETE FROM collaborator_roles WHERE id = ?1", [id])?;
    insert_audit(conn, "delete", "collaborator_role", Some(id))?;
    Ok(())
}

fn collaborator_client_ids(conn: &Connection, collaborator_id: &str) -> SqlResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT client_id FROM collaborator_clients WHERE collaborator_id = ?1 ORDER BY client_id",
    )?;
    let ids = stmt.query_map([collaborator_id], |r| r.get::<_, String>(0))?;
    ids.collect()
}

fn collaborator_preset_ids(conn: &Connection, collaborator_id: &str) -> SqlResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT preset_id FROM collaborator_competency_presets WHERE collaborator_id = ?1 ORDER BY preset_id",
    )?;
    let ids = stmt.query_map([collaborator_id], |r| r.get::<_, String>(0))?;
    ids.collect()
}

type CollabJoined = (
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    String,
    Option<String>,
    i64,
    String,
    String,
);

fn row_collab_joined(row: &rusqlite::Row<'_>) -> rusqlite::Result<CollabJoined> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get(8)?,
        row.get(9)?,
        row.get(10)?,
        row.get(11)?,
    ))
}

pub fn collaborator_by_id_public(conn: &Connection, id: &str) -> SqlResult<Option<Collaborator>> {
    let sql = "
        SELECT c.id, c.first_name, c.last_name, c.linkedin_url, c.photo_url, c.email, c.phone, c.role_id, r.label, r.sort_rank, c.created_at, c.updated_at
        FROM collaborators c
        INNER JOIN collaborator_roles r ON r.id = c.role_id
        WHERE c.id = ?1
    ";
    let mut stmt = conn.prepare(sql)?;
    let mapped = stmt.query_row([id], row_collab_joined).optional()?;
    match mapped {
        Some(t) => Ok(Some(collab_tuple_as_dto(conn, t)?)),
        None => Ok(None),
    }
}

fn collab_tuple_as_dto(conn: &Connection, t: CollabJoined) -> SqlResult<Collaborator> {
    let (
        id,
        first_name,
        last_name,
        linkedin_url,
        photo_url,
        email,
        phone,
        role_id,
        role_label,
        role_sort_rank,
        created_at,
        updated_at,
    ) = t;
    let client_ids = collaborator_client_ids(conn, &id)?;
    let competency_preset_ids = collaborator_preset_ids(conn, &id)?;
    Ok(Collaborator {
        id,
        first_name,
        last_name,
        linkedin_url,
        photo_url,
        email,
        phone,
        role_id,
        role_label,
        role_sort_rank: Some(role_sort_rank),
        client_ids,
        competency_preset_ids,
        created_at,
        updated_at,
    })
}

pub fn list_collaborators(conn: &Connection) -> SqlResult<Vec<Collaborator>> {
    let mut stmt = conn.prepare(
        "
        SELECT c.id, c.first_name, c.last_name, c.linkedin_url, c.photo_url, c.email, c.phone, c.role_id, r.label, r.sort_rank, c.created_at, c.updated_at
        FROM collaborators c
        INNER JOIN collaborator_roles r ON r.id = c.role_id
        ORDER BY r.sort_rank ASC, c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE
        ",
    )?;
    let rows = stmt.query_map([], row_collab_joined)?;
    rows.map(|mr| collab_tuple_as_dto(conn, mr?)).collect()
}

pub fn list_collaborators_for_client(conn: &Connection, client_id: &str) -> SqlResult<Vec<Collaborator>> {
    let mut stmt = conn.prepare(
        "
        SELECT DISTINCT c.id, c.first_name, c.last_name, c.linkedin_url, c.photo_url, c.email, c.phone, c.role_id, r.label, r.sort_rank, c.created_at, c.updated_at
        FROM collaborators c
        INNER JOIN collaborator_roles r ON r.id = c.role_id
        INNER JOIN collaborator_clients l ON l.collaborator_id = c.id AND l.client_id = ?1
        ORDER BY r.sort_rank ASC, c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE
        ",
    )?;
    let rows = stmt.query_map([client_id], row_collab_joined)?;
    rows.map(|mr| collab_tuple_as_dto(conn, mr?)).collect()
}

fn replace_collaborator_links(
    conn: &Connection,
    collaborator_id: &str,
    client_ids: &[String],
    preset_ids: &[String],
) -> SqlResult<()> {
    conn.execute(
        "DELETE FROM collaborator_clients WHERE collaborator_id = ?1",
        [collaborator_id],
    )?;
    conn.execute(
        "DELETE FROM collaborator_competency_presets WHERE collaborator_id = ?1",
        [collaborator_id],
    )?;
    for cid in client_ids {
        let t = cid.trim();
        if t.is_empty() {
            continue;
        }
        conn.execute(
            "INSERT INTO collaborator_clients (collaborator_id, client_id) VALUES (?1, ?2)",
            params![collaborator_id, t],
        )?;
    }
    for pid in preset_ids {
        let t = pid.trim();
        if t.is_empty() {
            continue;
        }
        conn.execute(
            "INSERT INTO collaborator_competency_presets (collaborator_id, preset_id) VALUES (?1, ?2)",
            params![collaborator_id, t],
        )?;
    }
    Ok(())
}

pub fn collaborators_export_for_backup(conn: &Connection) -> SqlResult<Vec<CollaboratorExport>> {
    let mut stmt = conn.prepare(
        "SELECT id, first_name, last_name, linkedin_url, photo_url, email, phone, role_id, created_at, updated_at FROM collaborators ORDER BY created_at",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
        ))
    })?;
    let mut out = Vec::new();
    for r in rows {
        let (
            id,
            first_name,
            last_name,
            linkedin_url,
            photo_url,
            email,
            phone,
            role_id,
            created_at,
            updated_at,
        ) = r?;
        let client_ids = collaborator_client_ids(conn, &id)?;
        let competency_preset_ids = collaborator_preset_ids(conn, &id)?;
        out.push(CollaboratorExport {
            id,
            first_name,
            last_name,
            linkedin_url,
            photo_url,
            email,
            phone,
            role_id,
            created_at,
            updated_at,
            client_ids,
            competency_preset_ids,
        });
    }
    Ok(out)
}

pub fn create_collaborator(conn: &Connection, input: &CreateCollaboratorInput) -> SqlResult<Collaborator> {
    let first_name = input.first_name.trim().to_string();
    let last_name = input.last_name.trim().to_string();
    if first_name.is_empty() && last_name.is_empty() {
        return Err(collab_ue("indica nome o cognome"));
    }
    collaborator_role_by_id(conn, input.role_id.trim())?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;

    let cid_list: Vec<String> = input
        .client_ids
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let pid_list: Vec<String> = input
        .competency_preset_ids
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    for c in &cid_list {
        get_client(conn, c)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
    }

    let id = Uuid::new_v4().to_string();
    let ts = now_iso();

    conn.execute(
        "INSERT INTO collaborators (id, first_name, last_name, linkedin_url, photo_url, email, phone, role_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            id,
            first_name,
            last_name,
            trim_opt(&input.linkedin_url.clone()),
            trim_opt(&input.photo_url.clone()),
            trim_opt(&input.email.clone()),
            trim_opt(&input.phone.clone()),
            input.role_id.trim(),
            &ts,
            &ts,
        ],
    )?;
    replace_collaborator_links(conn, &id, &cid_list, &pid_list)?;
    insert_audit(conn, "create", "collaborator", Some(&id))?;

    collaborator_by_id_public(conn, &id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn update_collaborator(conn: &Connection, id: &str, input: &UpdateCollaboratorInput) -> SqlResult<()> {
    let cur = collaborator_by_id_public(conn, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;

    let first_name = input
        .first_name
        .as_ref()
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| cur.first_name.clone());
    let last_name = input
        .last_name
        .as_ref()
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| cur.last_name.clone());
    if first_name.is_empty() && last_name.is_empty() {
        return Err(collab_ue("indica nome o cognome"));
    }

    let role_id = match &input.role_id {
        Some(r) => {
            let rt = r.trim();
            collaborator_role_by_id(conn, rt)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
            rt.to_string()
        }
        None => cur.role_id.clone(),
    };

    let linkedin_url = match input.linkedin_url.clone() {
        Some(s) => trim_opt(&Some(s)),
        None => cur.linkedin_url.clone(),
    };
    let photo_url = match input.photo_url.clone() {
        Some(s) => trim_opt(&Some(s)),
        None => cur.photo_url.clone(),
    };
    let email = match input.email.clone() {
        Some(s) => trim_opt(&Some(s)),
        None => cur.email.clone(),
    };
    let phone = match input.phone.clone() {
        Some(s) => trim_opt(&Some(s)),
        None => cur.phone.clone(),
    };

    let client_ids_fin: Vec<String> = match &input.client_ids {
        Some(v) => v.iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(),
        None => collaborator_client_ids(conn, id)?,
    };
    let preset_ids_fin: Vec<String> = match &input.competency_preset_ids {
        Some(v) => v.iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(),
        None => collaborator_preset_ids(conn, id)?,
    };

    for c in &client_ids_fin {
        get_client(conn, c)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
    }

    let ts = now_iso();
    conn.execute(
        "UPDATE collaborators SET first_name=?2, last_name=?3, linkedin_url=?4, photo_url=?5,
         email=?6, phone=?7, role_id=?8, updated_at=?9 WHERE id=?1",
        params![id, first_name, last_name, linkedin_url, photo_url, email, phone, role_id, ts],
    )?;
    replace_collaborator_links(conn, id, &client_ids_fin, &preset_ids_fin)?;
    insert_audit(conn, "update", "collaborator", Some(id))?;
    Ok(())
}

pub fn delete_collaborator(conn: &Connection, id: &str) -> SqlResult<()> {
    conn.execute("DELETE FROM collaborators WHERE id = ?1", [id])?;
    insert_audit(conn, "delete", "collaborator", Some(id))?;
    Ok(())
}

pub fn insert_collaborator_role_raw(tx: &rusqlite::Transaction<'_>, r: &CollaboratorRole) -> SqlResult<()> {
    tx.execute(
        "INSERT OR REPLACE INTO collaborator_roles (id, label, sort_rank, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5)",
        params![r.id, r.label, r.sort_rank, r.created_at, r.updated_at],
    )?;
    Ok(())
}

pub fn insert_collaborator_export_raw(tx: &rusqlite::Transaction<'_>, e: &CollaboratorExport) -> SqlResult<()> {
    tx.execute(
        "INSERT OR REPLACE INTO collaborators (id, first_name, last_name, linkedin_url, photo_url, email, phone, role_id, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![
            e.id,
            e.first_name,
            e.last_name,
            e.linkedin_url,
            e.photo_url,
            e.email,
            e.phone,
            e.role_id,
            e.created_at,
            e.updated_at
        ],
    )?;
    for cid in &e.client_ids {
        let t = cid.trim();
        if t.is_empty() {
            continue;
        }
        tx.execute(
            "INSERT OR IGNORE INTO collaborator_clients (collaborator_id, client_id) VALUES (?1,?2)",
            params![e.id, t],
        )?;
    }
    for pid in &e.competency_preset_ids {
        let t = pid.trim();
        if t.is_empty() {
            continue;
        }
        tx.execute(
            "INSERT OR IGNORE INTO collaborator_competency_presets (collaborator_id, preset_id) VALUES (?1,?2)",
            params![e.id, t],
        )?;
    }
    Ok(())
}
