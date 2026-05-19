/**
 * Antepone ~/.cargo/bin al PATH prima di eseguire un comando.
 * Utile su Windows quando Cursor/PowerShell non ha ancora il PATH aggiornato dopo rustup.
 *
 * Uso (da package.json): node scripts/with-cargo-path.cjs npx --yes tauri dev
 */
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const cargoDir = path.join(os.homedir(), ".cargo", "bin");
const cargoName = process.platform === "win32" ? "cargo.exe" : "cargo";
const cargoExe = path.join(cargoDir, cargoName);

if (!fs.existsSync(cargoExe)) {
  console.error("");
  console.error("[rdp-manager] Cargo non trovato in:", cargoDir);
  console.error("Installa Rust: https://rustup.rs");
  console.error("Oppure (Windows): winget install Rustlang.Rustup");
  console.error("Poi chiudi e riapri Cursor / il terminale.");
  console.error("");
  process.exit(127);
}

const sep = path.delimiter;
process.env.PATH = cargoDir + sep + (process.env.PATH || "");

/** Tauri generate_context!() richiede che ../dist esista anche durante cargo check senza npm build */
function ensureFrontendDistPlaceholder() {
  const distDir = path.join(__dirname, "..", "dist");
  const indexPath = path.join(distDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(
      indexPath,
      "<!DOCTYPE html><html lang=\"it\"><head><meta charset=\"utf-8\"><title>placeholder</title></head>" +
        "<body><p>Esegui <code>npm run build</code> per gli asset di produzione.</p></body></html>\n",
      "utf8",
    );
  }
}

ensureFrontendDistPlaceholder();

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("[rdp-manager] Nessun comando da eseguire dopo with-cargo-path.cjs");
  process.exit(1);
}

const cmd = argv[0];
const args = argv.slice(1);
const result = spawnSync(cmd, args, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

process.exit(result.status === null ? 1 : result.status);
