# HelpDesk Manager — Istruzioni d’uso

**Versione documento:** allineata al programma (vedi *Impostazioni → Informazioni* nell’app).  
**Supporto:** [dgtech93@gmail.com](mailto:dgtech93@gmail.com)

---

## Cos’è HelpDesk Manager

Applicazione **desktop per Windows** per uso personale: anagrafica clienti, rubrica referenti, team interno (collaboratori), pianificazione attività, connessioni **RDP** e **VPN**, accessi web e **backup** dei dati locali.  
Tutti i dati restano sul **tuo PC** (database SQLite in cartella profilo Windows). Le password sensibili sono protette da un **vault** con master password.

> Questa applicazione non è destinata a fini commerciali: è pensata per **uso esclusivo personale**.

---

## Requisiti di sistema

- **Windows 10 o 11** a 64 bit  
- Connessione internet solo al **primo avvio** dell’installer (per WebView2, se mancante)  
- Per le connessioni **RDP**: client Desktop remoto Windows (`mstsc`) già incluso nel sistema  
- Per **OpenVPN / WireGuard / FortiClient**: il relativo software deve essere installato e configurato sul PC, se usi quel tipo di VPN  

Non serve installare Node.js, Rust o altri strumenti di sviluppo.

---

## Installazione

1. Scarica il file installer (es. `HelpDesk Manager_0.4.1_x64-setup.exe`).
2. Esegui il setup e segui il wizard (Avanti → Installa). Conferma il prompt **UAC** se richiesto.
3. Al termine trovi **HelpDesk Manager** nel menu Start.

### Aggiornamento a una versione più recente

Esegui di nuovo il file `*-setup.exe` sul PC dove l’app è già installata:

- vengono aggiornati **solo i file del programma** in Programmi;
- **non** vengono cancellati clienti, rubrica, pianificazione, impostazioni né il vault (dati in AppData).

### Disinstallazione

Da **Impostazioni Windows → App** (o *Programmi e funzionalità*).  
Durante la disinstallazione può comparire l’opzione per **eliminare anche i dati locali**: selezionala solo se vuoi rimuovere tutto dal PC.

---

## Primo avvio

1. Avvia **HelpDesk Manager** dal menu Start.
2. All’apertura compare la **master password del vault** (se non l’hai ancora configurata):
   - scegli una password robusta (minimo 8 caratteri);
   - servirà per **sbloccare** l’uso di password RDP/VPN/Web salvate e per operazioni sensibili (backup, import, ecc.).
3. Dopo il caricamento iniziale si apre la **Dashboard**.

> **Importante:** se dimentichi la master password **non** è possibile recuperare le password cifrate nel database. Conserva un **backup** (vedi sotto) e, se configurato, il kit di recupero vault dalle Impostazioni.

---

## Panoramica dell’interfaccia

Barra laterale sinistra:

| Voce | Descrizione |
|------|-------------|
| **Dashboard** | Riepilogo e panoramica commerciale/servizi |
| **Clienti** | Schede cliente, connessioni RDP/WEB/VPN, rubrica e team collegati al cliente |
| **Rubrica** | Tutti i referenti per cliente |
| **Collaboratori** | Team interno, ruoli e competenze |
| **Pianificazione** | Attività, stati, promemoria |
| **Agenda** | Vista calendario collegata alla pianificazione |
| **Backup** | Esportazione e ripristino dati |
| **Impostazioni** | Vault, cataloghi, layout, registro attività, **Informazioni** |

In alto a destra: **tema chiaro/scuro**.

---

## Vault (credenziali)

- Senza vault configurato puoi navigare l’app, ma **non** salvare né usare password cifrate.
- Con vault **bloccato** le password archiviate non sono visibili né copiabili finché non inserisci la master password.
- Il vault può **bloccarsi automaticamente** dopo un periodo di inattività (configurabile in Impostazioni).
- Le password RDP/VPN/Web nel database sono **cifrate**; non compaiono in chiaro nei file di backup senza la password corretta.

---

## Clienti

1. Apri **Clienti** e seleziona un cliente dall’elenco a sinistra (o creane uno nuovo).
2. Nella scheda centrale trovi dati anagrafici, mappa, panoramica servizi.
3. Icone rapide per aprire **Rubrica referenti** e **Collaboratori** filtrati su quel cliente.
4. Pannelli **RDP**, **Accessi WEB** e **VPN** del cliente: aggiungi, modifica, avvia connessioni o apri in finestra dedicata.

---

## Rubrica e Collaboratori

- **Rubrica:** contatti (nome, ruolo, email, telefoni). Cerca, chiama, invia email. *Inserimento multiplo* da incolla tabellare (richiede vault sbloccato).
- **Collaboratori:** persone interne legate a uno o più clienti, con ruolo e competenze da catalogo Impostazioni.

Seleziona una riga e usa i pulsanti **Modifica**, **Elimina**, **Chiama**, **Email** (e **LinkedIn** per i collaboratori).

---

## Connessioni RDP

- Da **Clienti** (pannello RDP) o dalle voci di menu dedicate se presenti: elenco connessioni per cliente.
- **Nuova connessione:** nome, host, utente; password opzionale (salvata nel vault se sbloccato).
- Puoi associare un **file .rdp** (pulsante **Sfoglia**) o compilare i campi a mano.
- **Avvia:** apre il Desktop remoto Windows; le credenziali possono essere richieste da Windows se non memorizzate nella sessione RDP.

---

## Connessioni VPN

Tipi supportati (es. Windows VPN, OpenVPN, WireGuard, FortiClient, altro).

- **Windows VPN:** scegli il profilo dall’elenco aggiornato da Windows (*Aggiorna elenco*).
- **Altri tipi:** indica il **percorso file** di configurazione (`.ovpn`, `.conf`, ecc.) manualmente o con **Sfoglia**.
- **Avvia VPN** tenta l’avvio secondo il tipo; per alcuni clienti serve software esterno già installato.

---

## Pianificazione e Agenda

- **Pianificazione:** griglia attività per cliente/tipo; filtri, stati, promemoria. I tipi di attività e i cataloghi si configurano in **Impostazioni → Setup pianificazione**.
- **Agenda:** vista calendario; festività e regole in Impostazioni.

I promemoria possono comparire anche nella barra laterale quando in scadenza.

---

## Backup e ripristino

Menu **Backup**:

1. **Esporta backup** — crea un file `.rdpmanagerbackup` cifrato. Serve la **master password del vault** e una **password dedicata al backup** (da ricordare per il ripristino).
2. **Importa backup** — ripristina dati da file; il vault viene **bloccato** dopo l’import: reinserisci la master password.
3. **Kit di recupero vault** — configurabile da Impostazioni se hai perso la master password ma possiedi un kit creato in precedenza.

Conserva i backup su disco esterno o rete personale. Senza password di backup il file non è leggibile.

---

## Impostazioni (sintesi)

| Scheda | Contenuto |
|--------|-----------|
| **Credenziali (vault)** | Crea/cambia master password, autolock, kit recupero |
| **Servizi / Contratti / Moduli** | Cataloghi usati in clienti e pianificazione |
| **Dashboard / Scheda cliente** | Layout e moduli visibili |
| **Setup pianificazione** | Tipi attività, stati, agenda, preavvisi |
| **Ruoli e competenze** | Catalogo collaboratori |
| **Clienti** | Opzioni amministrative (es. eliminazione protetta) |
| **Registro attività** | Log operazioni recenti |
| **Informazioni** | Versione prodotto, autore, supporto |

---

## Dove sono salvati i dati

Sul PC Windows, in cartella profilo utente (AppData), non nella cartella di installazione in Programmi.  
Il database locale si chiama `rdp-manager.sqlite`.  
**Non copiare** quel file mentre l’app è aperta; preferisci la funzione **Backup** integrata.

---

## Risoluzione problemi

| Problema | Suggerimento |
|----------|----------------|
| L’app non si apre dopo l’installazione | Reinstalla lo setup; verifica che WebView2 sia installato (Windows Update). |
| Non vedo le password | Sblocca il vault con la master password (banner in alto). |
| RDP non parte | Controlla host, firewall, credenziali; prova da `mstsc` manualmente. |
| VPN non parte | Verifica percorso config, profilo Windows o client OpenVPN/WireGuard installato. |
| Dopo aggiornamento mancano i dati | Probabilmente disinstallazione con “elimina dati” o profilo utente diverso; ripristina da backup. |
| Backup non si importa | Password backup errata o file corrotto; verifica di usare un file `.rdpmanagerbackup` esportato da questa app. |

Per assistenza: **dgtech93@gmail.com** (indica versione da *Impostazioni → Informazioni* e descrizione del problema).

---

## Note sulla sicurezza

- Non conmotionare la master password né i file di backup su canali non protetti.
- Il PC deve essere protetto a tua cura (account Windows, antivirus, accesso fisico).
- Le password copiate negli appunti possono essere svuotate automaticamente dopo un breve intervallo, ma evita di incollarle in app non fidate.

---

*HelpDesk Manager — prodotto indipendente sviluppato da Diego Giotta.*
