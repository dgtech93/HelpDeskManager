use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("database")]
    DatabaseError,
    #[error("crypto")]
    CryptoError,
    #[error("validation")]
    ValidationError,
    #[error("vault_locked")]
    VaultLocked,
    #[error("rdp_launch")]
    RdpLaunchError,
    #[error("vpn_launch")]
    VpnLaunchError,
    #[error("backup")]
    BackupError,
    #[error("not_found")]
    NotFound,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl AppError {
    pub fn message_it(&self, detail: Option<&str>) -> String {
        let base = match self {
            AppError::VaultLocked => "Vault bloccato. Inserisci la master password.",
            AppError::NotFound => "Elemento non trovato.",
            AppError::CryptoError => "Errore crittografico o password non valida.",
            AppError::DatabaseError => "Errore database.",
            AppError::ValidationError => "Dati non validi.",
            AppError::RdpLaunchError => "Impossibile avviare la sessione RDP.",
            AppError::VpnLaunchError => "Impossibile avviare la VPN.",
            AppError::BackupError => "Errore durante backup o ripristino.",
        };
        match detail {
            Some(d) if !d.is_empty() => format!("{base} ({d})"),
            _ => base.to_string(),
        }
    }
}

pub fn err_msg(e: AppError, detail: Option<&str>) -> String {
    e.message_it(detail)
}
