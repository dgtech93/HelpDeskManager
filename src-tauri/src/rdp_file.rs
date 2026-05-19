//! Lettura file `.rdp` (formato Remote Desktop) e preparazione per il lancio.

use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Default)]
pub struct ParsedRdp {
    pub host: String,
    pub port: i64,
    pub username: Option<String>,
    pub domain: Option<String>,
}

fn split_key_value(line: &str) -> Option<(String, String)> {
    let line = line.trim_end_matches(['\r', '\n']).trim();
    if line.is_empty() {
        return None;
    }
    for sep in [":s:", ":i:", ":b:"] {
        if let Some(idx) = line.find(sep) {
            let key = line[..idx].trim().to_string();
            let val = line[idx + sep.len()..].to_string();
            return Some((key, val));
        }
    }
    None
}

fn split_host_port(addr: &str) -> (String, i64) {
    let addr = addr.trim();
    if addr.starts_with('[') {
        if let Some(end) = addr.find(']') {
            let host = addr[..=end].to_string();
            let rest = addr[end + 1..].trim_start_matches(':');
            let port = rest.parse::<i64>().unwrap_or(3389);
            return (host, port);
        }
    }
    if let Some(pos) = addr.rfind(':') {
        let tail = &addr[pos + 1..];
        if !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit()) {
            let host = addr[..pos].trim().to_string();
            if let Ok(p) = tail.parse::<i64>() {
                if !host.is_empty() {
                    return (host, p);
                }
            }
        }
    }
    (addr.to_string(), 3389)
}

/// Solo righe che salvano segreti incorporati (blob password di MSTSC).
/// Evita di rimuovere chiavi come «gatewaycredentialssource» che non sono password.
fn key_is_embedded_secret_line(key: &str) -> bool {
    let k = key.trim().to_ascii_lowercase();
    k.starts_with("password ") || k.starts_with("pin ") || k.starts_with("gatewaypassword ")
}

/// Legge i byte di un `.rdp`: UTF-16 LE/BE con BOM oppure UTF-8 (eventuale BOM UTF-8 ignorato).
pub fn decode_rdp_bytes(bytes: &[u8]) -> Result<String, String> {
    let bytes = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &bytes[3..]
    } else {
        bytes
    };

    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        return decode_utf16_body_le(&bytes[2..]);
    }
    if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
        return decode_utf16_body_be(&bytes[2..]);
    }

    std::str::from_utf8(bytes)
        .map(|s| s.to_string())
        .map_err(|_| {
            "Codifica del file .rdp non supportata (atteso UTF-8 o UTF-16 con BOM).".into()
        })
}

fn decode_utf16_body_le(body: &[u8]) -> Result<String, String> {
    if body.len() % 2 != 0 {
        return Err("File UTF-16 LE non valido (lunghezza dispari).".into());
    }
    let units: Vec<u16> = body
        .chunks_exact(2)
        .map(|w| u16::from_le_bytes([w[0], w[1]]))
        .collect();
    String::from_utf16(&units).map_err(|e| format!("UTF-16 LE non valido: {e}"))
}

fn decode_utf16_body_be(body: &[u8]) -> Result<String, String> {
    if body.len() % 2 != 0 {
        return Err("File UTF-16 BE non valido (lunghezza dispari).".into());
    }
    let units: Vec<u16> = body
        .chunks_exact(2)
        .map(|w| u16::from_be_bytes([w[0], w[1]]))
        .collect();
    String::from_utf16(&units).map_err(|e| format!("UTF-16 BE non valido: {e}"))
}

/// True se conviene riscrivere il contenuto (righe password incorporate).
pub fn needs_secret_lines_removed(content: &str) -> bool {
    content.lines().any(|line| {
        split_key_value(line)
            .map(|(k, _)| key_is_embedded_secret_line(&k))
            .unwrap_or(false)
    })
}

/// Legge un `.rdp` e ricava host/porta e credenziali suggerite dal file.
pub fn parse_rdp_file(path: &Path) -> Result<ParsedRdp, String> {
    let bytes = fs::read(path).map_err(|e| format!("Impossibile leggere il file .rdp: {e}"))?;
    let raw = decode_rdp_bytes(&bytes)?;
    parse_rdp_contents(&raw)
}

/// Scrive `.rdp` nel formato che MSTSC si aspetta di più spesso: **UTF-16 LE + BOM**, righe **CRLF**.
pub fn write_rdp_utf16_le_bom(path: &Path, content: &str) -> std::io::Result<()> {
    let mut out = Vec::with_capacity(content.len().saturating_mul(2).saturating_add(8));
    out.extend_from_slice(&[0xFF, 0xFE]);
    let trimmed_end = content.trim_end_matches(['\r', '\n']);
    if trimmed_end.is_empty() {
        return fs::write(path, out);
    }
    for line in trimmed_end.lines() {
        let line = line.trim_end_matches('\r');
        for unit in line.encode_utf16() {
            out.extend_from_slice(&unit.to_le_bytes());
        }
        out.extend_from_slice(&[0x0D, 0x00, 0x0A, 0x00]); // \r\n in UTF-16 LE
    }
    fs::write(path, out)
}

pub fn parse_rdp_contents(content: &str) -> Result<ParsedRdp, String> {
    let mut out = ParsedRdp::default();
    for line in content.lines() {
        let Some((key, val)) = split_key_value(line) else {
            continue;
        };
        let lk = key.to_ascii_lowercase();
        if lk == "full address" {
            let (h, p) = split_host_port(&val);
            if !h.is_empty() {
                out.host = h;
                out.port = p;
            }
        } else if lk == "username" && !val.trim().is_empty() {
            let v = val.trim().to_string();
            if v.contains('\\') {
                let mut parts = v.splitn(2, '\\');
                if let (Some(dom), Some(u)) = (parts.next(), parts.next()) {
                    if !dom.is_empty() {
                        out.domain = Some(dom.to_string());
                    }
                    if !u.is_empty() {
                        out.username = Some(u.to_string());
                    }
                }
            } else {
                out.username = Some(v);
            }
        } else if lk == "domain" && !val.trim().is_empty() {
            out.domain = Some(val.trim().to_string());
        }
    }
    if out.host.is_empty() {
        return Err(
            "Nel file .rdp non è stata trovata la riga «full address:s:…». Verifica il file."
                .into(),
        );
    }
    Ok(out)
}

/// Solo hostname / IP senza porta (per `cmdkey TERMSRV/...`).
pub fn address_host_part(addr: &str) -> String {
    split_host_port(addr).0
}

/// Rimuove dal contenuto le righe con blob password/PIN (`password 51`, …).
pub fn strip_credential_lines(content: &str) -> String {
    let mut buf = String::with_capacity(content.len());
    for line in content.lines() {
        let keep = split_key_value(line)
            .map(|(k, _)| !key_is_embedded_secret_line(&k))
            .unwrap_or(true);
        if keep {
            buf.push_str(line.trim_end_matches('\r'));
            buf.push('\n');
        }
    }
    buf
}
