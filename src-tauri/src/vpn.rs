use crate::errors::{err_msg, AppError};
use crate::models::VpnConnection;
use std::path::Path;
use std::process::{Command, Stdio};

/// Elenco nomi connessione VPN registrate in Windows (Cmdlet `Get-VpnConnection`).
#[cfg(target_os = "windows")]
pub fn list_windows_vpn_profiles() -> Result<Vec<String>, String> {
    let ps = r#"try {
  $names = @(Get-VpnConnection -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object { $_.Name })
  if ($null -eq $names -or $names.Count -eq 0) { '' }
  else { ($names | Where-Object { $_ -and $_.Trim().Length -gt 0 }) -join [Environment]::NewLine }
} catch { '' }"#;

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            ps,
        ])
        .output()
        .map_err(|e| format!("Impossibile eseguire PowerShell: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut names: Vec<String> = stdout
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(std::string::ToString::to_string)
        .collect();
    names.sort();
    names.dedup();
    Ok(names)
}

#[cfg(not(target_os = "windows"))]
pub fn list_windows_vpn_profiles() -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[cfg(target_os = "windows")]
fn ras_dial_windows(
    connection_name: &str,
    username: Option<&str>,
    password_plain: Option<&str>,
) -> Result<(), String> {
    let name = connection_name.trim();
    if name.is_empty() {
        return Err(err_msg(
            AppError::VpnLaunchError,
            Some("Nome connessione Windows VPN mancante"),
        ));
    }

    let mut cmd = Command::new("rasdial");
    cmd.arg(name);

    let u = username.map(str::trim).filter(|s| !s.is_empty());
    let p = password_plain.map(str::trim).filter(|s| !s.is_empty());
    match (u, p) {
        (Some(user), Some(pw)) => {
            cmd.arg(user).arg(pw);
        }
        (Some(user), None) => {
            cmd.arg(user);
        }
        _ => {}
    }

    let out = cmd.output().map_err(|e| {
        err_msg(
            AppError::VpnLaunchError,
            Some(&format!("Impossibile eseguire rasdial: {e}")),
        )
    })?;

    if out.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&out.stderr);
    let stdout = String::from_utf8_lossy(&out.stdout);
    let detail = if !stderr.trim().is_empty() {
        stderr.into_owned()
    } else {
        stdout.into_owned()
    };
    if detail.trim().is_empty() {
        return Err(err_msg(
            AppError::VpnLaunchError,
            Some("Connessione VPN non riuscita (rasdial)."),
        ));
    }
    Err(err_msg(AppError::VpnLaunchError, Some(detail.trim())))
}

pub fn launch_vpn_connection(
    vpn: &VpnConnection,
    password_plain: Option<&str>,
) -> Result<(), String> {
    let t = vpn.type_.to_ascii_lowercase();

    if t.contains("openvpn") {
        let cfg = vpn
            .config_path
            .as_deref()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                err_msg(
                    AppError::VpnLaunchError,
                    Some("Percorso config OpenVPN mancante"),
                )
            })?;
        Command::new("openvpn")
            .arg("--config")
            .arg(cfg)
            .stdin(Stdio::null())
            .spawn()
            .map_err(|_| {
                err_msg(
                    AppError::VpnLaunchError,
                    Some("OpenVPN non trovato nel PATH"),
                )
            })?;
        return Ok(());
    }

    if t.contains("wireguard") {
        let cfg = vpn
            .config_path
            .as_deref()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                err_msg(
                    AppError::VpnLaunchError,
                    Some("Percorso config WireGuard mancante"),
                )
            })?;
        #[cfg(target_os = "windows")]
        {
            Command::new("wireguard")
                .arg("/installtunnelservice")
                .arg(cfg)
                .spawn()
                .map_err(|_| {
                    err_msg(
                        AppError::VpnLaunchError,
                        Some("Impossibile avviare WireGuard su Windows"),
                    )
                })?;
            return Ok(());
        }
        #[cfg(not(target_os = "windows"))]
        {
            Command::new("sudo")
                .args(["wg-quick", "up", cfg])
                .spawn()
                .map_err(|_| err_msg(AppError::VpnLaunchError, Some("wg-quick non disponibile")))?;
            return Ok(());
        }
    }

    #[cfg(target_os = "windows")]
    if t.contains("windows") || t.contains("pptp") || t.contains("l2tp") || t.contains("ikev2") {
        let conn_name = vpn
            .config_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| vpn.name.trim());

        return ras_dial_windows(conn_name, vpn.username.as_deref(), password_plain);
    }

    if t.contains("forti") {
        #[cfg(target_os = "windows")]
        {
            let exe = vpn
                .config_path
                .as_deref()
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    err_msg(
                        AppError::VpnLaunchError,
                        Some(
                            "Per FortiClient imposta «Percorso file» su FortiClient.exe \
                         (es. C:\\Program Files\\Fortinet\\FortiClient\\FortiClient.exe)",
                        ),
                    )
                })?;
            let path = Path::new(exe.trim());
            if !path.is_file() {
                return Err(err_msg(
                    AppError::VpnLaunchError,
                    Some(&format!("FortiClient non trovato: {}", path.display())),
                ));
            }
            let work_dir = path.parent().unwrap_or_else(|| Path::new("."));
            Command::new(path)
                .current_dir(work_dir)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| {
                    err_msg(
                        AppError::VpnLaunchError,
                        Some(&format!("Impossibile avviare FortiClient: {e}")),
                    )
                })?;
            return Ok(());
        }
        #[cfg(not(target_os = "windows"))]
        {
            return Err(err_msg(
                AppError::VpnLaunchError,
                Some("FortiClient su questo sistema va avviato manualmente"),
            ));
        }
    }

    #[cfg(target_os = "windows")]
    if let Some(exe) = vpn
        .config_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let path = Path::new(exe);
        if path.is_file() {
            if path
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("exe"))
            {
                let work_dir = path.parent().unwrap_or_else(|| Path::new("."));
                Command::new(path)
                    .current_dir(work_dir)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .map_err(|e| {
                        err_msg(
                            AppError::VpnLaunchError,
                            Some(&format!("Impossibile avviare il client VPN: {e}")),
                        )
                    })?;
                return Ok(());
            }
        }
    }

    if t.contains("anyconnect") || t.contains("cisco") {
        return Err(err_msg(
            AppError::VpnLaunchError,
            Some(
                "Cisco AnyConnect: indica il percorso completo di vpnui.exe (o l’eseguibile del client) \
                 nel campo «Percorso file config», oppure avvia il client manualmente.",
            ),
        ));
    }

    let server = vpn.server.clone().unwrap_or_default();
    let user = vpn.username.clone().unwrap_or_default();
    let pw = password_plain.unwrap_or("");

    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("cmd.exe");
        cmd.arg("/C").arg("start").arg("").arg("powershell").arg("-NoProfile").arg("-Command").arg(format!(
            "Write-Host 'VPN generica: configura manualmente. Server: {server} Utente: {user}' ; pause"
        ));
        cmd.spawn()
            .map_err(|e| err_msg(AppError::VpnLaunchError, Some(&e.to_string())))?;
        let _ = pw;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("sh")
            .arg("-c")
            .arg(format!(
                "echo \"VPN '{typ}' — avvio automatico non disponibile. Server: {server}\"",
                typ = vpn.type_
            ))
            .spawn()
            .map_err(|e| err_msg(AppError::VpnLaunchError, Some(&e.to_string())))?;
        Ok(())
    }
}
