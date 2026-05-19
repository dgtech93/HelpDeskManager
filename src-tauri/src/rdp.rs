use crate::errors::{err_msg, AppError};

use crate::models::RdpConnection;

use crate::rdp_file;

use std::fs;

use std::path::Path;

use std::process::{Command, Stdio};

use std::thread;

use std::time::Duration;

#[cfg(target_os = "windows")]
fn launch_windows(rdp: &RdpConnection, password_plain: Option<&str>) -> Result<(), String> {
    let tmp_dir = std::env::temp_dir();

    let file_path = tmp_dir.join(format!("rdpmanager-{}.rdp", &rdp.id));

    if let Some(ref src) = rdp.rdp_file_path {
        let src_path = Path::new(src.as_str());

        if src_path.is_file() {
            let bytes = fs::read(src_path)
                .map_err(|e| err_msg(AppError::RdpLaunchError, Some(&e.to_string())))?;
            let raw = rdp_file::decode_rdp_bytes(&bytes)
                .map_err(|m| err_msg(AppError::RdpLaunchError, Some(&m)))?;

            if !rdp_file::needs_secret_lines_removed(&raw) {
                fs::copy(src_path, &file_path)
                    .map_err(|e| err_msg(AppError::RdpLaunchError, Some(&e.to_string())))?;
            } else {
                let stripped = rdp_file::strip_credential_lines(&raw);
                rdp_file::write_rdp_utf16_le_bom(&file_path, &stripped)
                    .map_err(|e| err_msg(AppError::RdpLaunchError, Some(&e.to_string())))?;
            }

            if let Some(pw) = password_plain.filter(|p| !p.is_empty()) {
                let host_key = rdp_file::address_host_part(&rdp.host);

                let generic = format!("TERMSRV/{host_key}");

                let cmdkey_user = match (&rdp.domain, &rdp.username) {
                    (Some(dom), Some(u)) if !dom.trim().is_empty() && !u.trim().is_empty() => {
                        format!("{}\\{}", dom.trim(), u.trim())
                    }

                    (_, Some(u)) if !u.trim().is_empty() => u.trim().to_string(),

                    _ => String::new(),
                };

                if !cmdkey_user.is_empty() {
                    let _ = Command::new("cmdkey.exe")
                        .arg(format!("/generic:{generic}"))
                        .arg(format!("/user:{cmdkey_user}"))
                        .arg(format!("/pass:{pw}"))
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .status();

                    let generic_del = generic.clone();

                    thread::spawn(move || {
                        thread::sleep(Duration::from_secs(120));

                        let _ = Command::new("cmdkey.exe")
                            .arg(format!("/delete:{generic_del}"))
                            .stdout(Stdio::null())
                            .stderr(Stdio::null())
                            .status();
                    });
                }
            }

            let mut cmd = Command::new("mstsc.exe");

            cmd.arg(&file_path);

            cmd.stdin(Stdio::null());

            cmd.spawn().map_err(|_| {
                let _ = fs::remove_file(&file_path);

                err_msg(AppError::RdpLaunchError, Some("mstsc.exe non disponibile"))
            })?;

            let path_clone = file_path.clone();

            thread::spawn(move || {
                thread::sleep(Duration::from_secs(8));

                let _ = fs::remove_file(path_clone);
            });

            return Ok(());
        }
    }

    let screen_mode_line = if rdp.use_fullscreen != 0 {
        "screen mode id:i:2\n"
    } else {
        "screen mode id:i:1\n"
    };

    let redirect_clipboard = if rdp.use_clipboard != 0 { "i:1" } else { "i:0" };

    let user_line = match (&rdp.domain, &rdp.username) {
        (Some(dom), Some(u)) if !dom.is_empty() && !u.is_empty() => {
            format!("username:s:{}\\{}\n", dom.trim(), u.trim())
        }

        (_, Some(u)) if !u.is_empty() => format!("username:s:{}\n", u.trim()),

        _ => String::new(),
    };

    let mut contents = format!(

        "full address:s:{}:{}\n{}{}desktopwidth:i:{}\ndesktopheight:i:{}\nsession bpp:i:{}\nredirectclipboard:{redirect_clipboard}\nauthentication level:i:0\nprompt for credentials:i:1\n",

        rdp.host.trim(),

        rdp.port,

        screen_mode_line,

        user_line,

        rdp.resolution_width,

        rdp.resolution_height,

        rdp.color_depth,

    );

    if let Some(gw) = &rdp.gateway_host {
        if !gw.trim().is_empty() {
            contents.push_str(&format!("gatewayhostname:s:{}\n", gw.trim()));
        }
    }

    fs::write(&file_path, contents)
        .map_err(|e| err_msg(AppError::RdpLaunchError, Some(&e.to_string())))?;

    let mut cmd = Command::new("mstsc.exe");

    cmd.arg(&file_path);

    let _ = password_plain;

    cmd.stdin(Stdio::null());

    cmd.spawn().map_err(|_| {
        let _ = fs::remove_file(&file_path);

        err_msg(AppError::RdpLaunchError, Some("mstsc.exe non disponibile"))
    })?;

    let path_clone = file_path.clone();

    thread::spawn(move || {
        thread::sleep(Duration::from_secs(4));

        let _ = fs::remove_file(path_clone);
    });

    Ok(())
}

#[cfg(not(target_os = "windows"))]

fn launch_unix(rdp: &RdpConnection, password_plain: Option<&str>) -> Result<(), String> {
    let tmp_dir = std::env::temp_dir();

    let file_path = tmp_dir.join(format!("rdpmanager-{}.rdp", &rdp.id));

    if let Some(ref src) = rdp.rdp_file_path {
        let src_path = Path::new(src.as_str());

        if src_path.is_file() {
            let bytes = fs::read(src_path)
                .map_err(|e| err_msg(AppError::RdpLaunchError, Some(&e.to_string())))?;
            let raw = rdp_file::decode_rdp_bytes(&bytes)
                .map_err(|m| err_msg(AppError::RdpLaunchError, Some(&m)))?;

            if !rdp_file::needs_secret_lines_removed(&raw) {
                fs::copy(src_path, &file_path)
                    .map_err(|e| err_msg(AppError::RdpLaunchError, Some(&e.to_string())))?;
            } else {
                let stripped = rdp_file::strip_credential_lines(&raw);
                fs::write(&file_path, stripped)
                    .map_err(|e| err_msg(AppError::RdpLaunchError, Some(&e.to_string())))?;
            }

            let mut cmd = Command::new("xfreerdp");

            cmd.arg(file_path.to_string_lossy().as_ref());

            if let Some(pw) = password_plain.filter(|p| !p.is_empty()) {
                cmd.arg(format!("/p:{pw}"));
            }

            cmd.stdin(Stdio::null());

            cmd.stdout(Stdio::null());

            cmd.stderr(Stdio::null());

            cmd.spawn().map_err(|_| {
                let _ = fs::remove_file(&file_path);

                err_msg(
                    AppError::RdpLaunchError,
                    Some("FreeRDP non risulta installato (xfreerdp)."),
                )
            })?;

            let path_clone = file_path.clone();

            thread::spawn(move || {
                thread::sleep(Duration::from_secs(8));

                let _ = fs::remove_file(path_clone);
            });

            return Ok(());
        }
    }

    let pw = password_plain.unwrap_or("");

    let mut cmd = Command::new("xfreerdp");

    cmd.arg(format!("/v:{}:{}", rdp.host.trim(), rdp.port));

    if let Some(u) = &rdp.username {
        if !u.is_empty() {
            cmd.arg(format!("/u:{}", u.trim()));
        }
    }

    if let Some(d) = &rdp.domain {
        if !d.is_empty() {
            cmd.arg(format!("/d:{}", d.trim()));
        }
    }

    cmd.arg(format!("/p:{pw}"));

    cmd.arg("/dynamic-resolution");

    if rdp.ignore_certificate != 0 {
        cmd.arg("/cert:ignore");
    }

    if rdp.use_clipboard != 0 {
        cmd.arg("+clipboard");
    }

    if rdp.use_fullscreen != 0 {
        cmd.arg("/f");
    }

    cmd.stdin(Stdio::null());

    cmd.stdout(Stdio::null());

    cmd.stderr(Stdio::null());

    cmd.spawn().map_err(|_| {
        err_msg(
            AppError::RdpLaunchError,
            Some("FreeRDP non risulta installato (xfreerdp)."),
        )
    })?;

    Ok(())
}

pub fn launch_rdp_connection(
    rdp: &RdpConnection,
    password_plain: Option<&str>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    return launch_windows(rdp, password_plain);

    #[cfg(not(target_os = "windows"))]
    launch_unix(rdp, password_plain)
}
