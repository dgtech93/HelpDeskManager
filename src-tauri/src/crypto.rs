use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use anyhow::anyhow;
use argon2::{Algorithm, Argon2, Params, Version};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use rand::RngCore;
use zeroize::{Zeroize, Zeroizing};

const NONCE_LEN: usize = 12;

pub fn random_bytes(len: usize) -> Vec<u8> {
    let mut buf = vec![0u8; len];
    rand::thread_rng().fill_bytes(&mut buf);
    buf
}

/// Derivazione chiave vault.
/// - `preset`: [`None`] o valor diverso da `"balanced"` → parametri legacy (più lenti, compatibilità vault esistenti).
/// - `Some("balanced")` → meno memoria/iterazioni, per vault creati da questa versione in poi (sblocco più rapido).
pub fn derive_key_argon2id(
    password: &[u8],
    salt: &[u8],
    vault_kdf_preset: Option<&str>,
) -> anyhow::Result<Zeroizing<[u8; 32]>> {
    let params = match vault_kdf_preset {
        Some("balanced") => {
            Params::new(19456, 2, 2, Some(32)).map_err(|e| anyhow!("argon2 params: {e}"))?
        }
        _ => Params::new(65536, 3, 4, Some(32)).map_err(|e| anyhow!("argon2 params: {e}"))?,
    };
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut out = Zeroizing::new([0u8; 32]);
    argon2
        .hash_password_into(password, salt, out.as_mut())
        .map_err(|e| anyhow!("argon2 derive: {e}"))?;
    Ok(out)
}

pub fn encrypt_aes256_gcm(key: &[u8], plaintext: &str) -> anyhow::Result<String> {
    if key.len() != 32 {
        return Err(anyhow!("key len"));
    }
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|_| anyhow!("chiave AES non valida (lunghezza)"))?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|_| anyhow!("encrypt"))?;
    let mut packed = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);
    Ok(STANDARD.encode(packed))
}

pub fn decrypt_aes256_gcm(key: &[u8], blob_b64: &str) -> anyhow::Result<String> {
    if key.len() != 32 {
        return Err(anyhow!("key len"));
    }
    let packed = STANDARD.decode(blob_b64).map_err(|_| anyhow!("b64"))?;
    if packed.len() <= NONCE_LEN {
        return Err(anyhow!("short blob"));
    }
    let (n, ct) = packed.split_at(NONCE_LEN);
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|_| anyhow!("chiave AES non valida (lunghezza)"))?;
    let nonce = Nonce::from_slice(n);
    let plain = cipher
        .decrypt(nonce, ct.as_ref())
        .map_err(|_| anyhow!("decrypt"))?;
    String::from_utf8(plain).map_err(|_| anyhow!("utf8"))
}

pub fn generate_kdf_salt_b64() -> anyhow::Result<String> {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    Ok(STANDARD.encode(salt))
}

pub fn backup_derive_key(password: &[u8], salt: &[u8]) -> anyhow::Result<Zeroizing<[u8; 32]>> {
    derive_key_argon2id(password, salt, None)
}

pub fn zeroize_vec(v: &mut Vec<u8>) {
    v.zeroize();
}
