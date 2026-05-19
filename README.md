# HelpDesk Manager

Applicazione desktop cross-platform (Windows, Linux, macOS) per gestire clienti, help desk, connessioni **RDP** e **VPN**, con password protette da **Argon2id** + **AES-256-GCM** e database locale **SQLite**.

Stack: **Tauri 2**, **Rust**, **React 18**, **TypeScript**, **TailwindCSS**, **Zustand**, **React Hook Form**, **Zod**, **Lucide**.

## Funzionalità principali

- CRUD clienti, connessioni RDP e VPN (SQLite)
- Vault con master password (derivazione Argon2id, sale persistente, verifier cifrato)
- Cifratura per campo delle password (nonce AES-GCM univoco per segreto)
- Avvio RDP: **Windows** `mstsc.exe` + file `.rdp` temporaneo senza password nel file; **Linux/macOS** `xfreerdp`
- VPN: avvio best-effort (OpenVPN, WireGuard, Windows rasphone, ecc.)
- Copia negli appunti con tentativo di svuotamento dopo ~30s (`arboard` lato Rust dove usato)
- Autolock vault dopo inattività (secondi configurabili)
- Backup / ripristino JSON cifrato con password dedicata (file `.rdpmanagerbackup`)
- Tema chiaro/scuro salvato in `settings`

## Repository GitHub

Il progetto è sotto Git (branch `main`). Per pubblicarlo sul tuo account:

1. Accedi a GitHub CLI (una tantum): `gh auth login` (GitHub.com, HTTPS, login nel browser).
2. Crea il repo e carica il codice:
   ```powershell
   cd C:\Users\d.giotta\Desktop\RDPGestione
   gh repo create helpdesk-manager --private --source=. --remote=origin --push
   ```
   Usa `--public` al posto di `--private` se vuoi un repository pubblico.

In alternativa: crea un repo vuoto su [github.com/new](https://github.com/new), poi `git remote add origin https://github.com/TUO_UTENTE/helpdesk-manager.git` e `git push -u origin main`.

Non vengono versionati `node_modules`, build (`dist`, `target`), file `.sqlite` né `.env` (vedi `.gitignore`).

## Prerequisiti

1. **Node.js** LTS (consigliato 20+): [https://nodejs.org](https://nodejs.org)
2. **Rust** stabile + `rustup`: [https://rustup.rs](https://rustup.rs)
3. **Tauri CLI** (via npm, incluso come devDependency) oppure `cargo install tauri-cli`

### FreeRDP (Linux / macOS)

- **Debian/Ubuntu**: `sudo apt install freerdp2-x11`
- **macOS (Homebrew)**: `brew install freerdp`

Su Windows si usa **mstsc.exe** già presente nel sistema.

## Installazione dipendenze

```bash
cd RDPGestione
npm install
```

## Icone applicazione (consigliato prima della build)

Genera `ico` / `icns` da un PNG 1024×1024:

```bash
npm run tauri icon path/al/logo.png
```

Aggiorna `src-tauri/tauri.conf.json` → `bundle.icon` se necessario.

## Sviluppo

```bash
npm run tauri dev
```

Su **Windows**, se compare `cargo metadata ... program not found` dopo aver installato Rust, il terminale non ha ancora `%USERPROFILE%\.cargo\bin` nel `PATH`. Gli script `tauri` / `tauri:dev` nel `package.json` usano `scripts/with-cargo-path.cjs` per aggiungere quella cartella automaticamente.

In alternativa puoi usare:

```bash
npm run tauri:dev
```

O chiudere e riaprire il terminale / Cursor dopo `rustup`.

Equivalente esplicito: `npm run tauri -- dev`

## Build release e installer Windows

### Prerequisiti (solo sulla macchina che compila)

- **Node.js** LTS, **Rust** (`rustup`), toolchain MSVC (Visual Studio Build Tools con “Sviluppo di applicazioni desktop con C++”)
- Connessione internet la prima volta (scarica WebView2 bootstrapper e strumenti NSIS usati da Tauri)

### Creare l’installer (.exe guidato)

Su **Windows**, dalla cartella del progetto:

```bash
npm run build:installer
```

Equivalente a `npm run tauri:build`. Al termine trovi l’installer in:

`src-tauri/target/release/bundle/nsis/`

File tipico: **`HelpDesk Manager_0.1.0_x64-setup.exe`** (nome legato a versione in `tauri.conf.json`).

### Cosa fa l’installer

- Wizard NSIS in italiano (Avanti / Indietro / Installa), come i programmi Windows classici
- Installazione in **Programmi** (richiede conferma amministratore UAC)
- Installa **WebView2** se mancante (motore dell’interfaccia)
- Voce in **Impostazioni → App** e disinstallazione da **Programmi e funzionalità**
- Dati applicazione in cartella profilo utente (`AppData`, database SQLite locale)
- **Aggiornamento:** se il programma è già installato, rieseguire lo stesso `*-setup.exe` sostituisce solo i file in Programmi; **database, vault e impostazioni in AppData non vengono cancellati** (template NSIS personalizzato in `src-tauri/windows/nsis/installer.nsi`). Prima installazione = wizard completo come nuovo prodotto.

### Distribuzione

Copia il file `*-setup.exe` su chiavetta, rete o intranet: l’utente lo esegue e segue il wizard. Non serve installare Node o Rust sul PC di destinazione.

### Altre piattaforme

Senza `tauri.windows.conf.json` attivo, `npm run tauri:build` produce anche bundle macOS/Linux se compili su quei sistemi. Su Windows viene generato principalmente l’installer NSIS.

## Sicurezza (note operative)

- Le password RDP/VPN non sono mai memorizzate in chiaro nel database; sono blob **AES-256-GCM** derivati dalla master password (**Argon2id** + sale salvato in `settings`).
- Il file `.rdp` generato su Windows **non** include la password; di solito comparirà il prompt credenziali RDP.
- Su Linux/macOS la password può comparire nella **riga di comando** del processo `xfreerdp` (limite noto dei client RDP da CLI).
- Dopo import backup il vault viene **bloccato**: serve reinserire la master password.
- Non sono loggati segreti né master password; evitare screenshot della schermata di sblocco in ambienti non fidati.

## Architettura (panoramica)

- **Frontend**: pagine React (`src/pages`), componenti (`src/components`), stato globale Zustand (`src/store`), chiamate `invoke` via `src/lib/api.ts`.
- **Backend**: comandi Tauri in `src-tauri/src/main.rs`, DB `db.rs`, crittografia `crypto.rs`, launcher `rdp.rs` / `vpn.rs`, backup `backup.rs`, errori `errors.rs`.
- **DB**: file `rdp-manager.sqlite` nella directory dati applicazione del sistema operativo.

## TODO / miglioramenti futuri

- Integrazione **keyring** OS per memorizzare chunk di vault o backup recovery key
- Plugin dialog nativi per scelta file backup (cartelle utente)
- Avvio RDP senza password in CLI (pipe/stdin, helper dedicato) per ridurre esposizione su Unix
- Ricerca full-text e tag multipli per clienti
- Import backup incrementale / merge selettivo
- Test automatici (Rust + Vitest) e CI build matrix
- Wizard primo avvio e rotazione master password

## Licenza

Uso interno / progetto dimostrativo: aggiungi una licenza se pubblichi il codice.
