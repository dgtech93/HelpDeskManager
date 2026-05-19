import { useState } from "react";
import { FolderOpen, HardDrive, OctagonAlert, Save } from "lucide-react";
import { save, open } from "@tauri-apps/plugin-dialog";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import { useAppStore } from "@/store/appStore";
import { AppPageHeader, AppPageSection, AppPageShell } from "@/components/layout/AppPageChrome";

const BACKUP_FILTERS: { name: string; extensions: string[] }[] = [
  { name: "Backup HelpDesk Manager", extensions: ["rdpmanagerbackup"] },
];

export function BackupPage() {
  const setVault = useAppStore((s) => s.setVault);
  const vaultConfigured = useAppStore((s) => s.vaultConfigured);
  const [exportPath, setExportPath] = useState("");
  const [exportPwd, setExportPwd] = useState("");
  const [importPath, setImportPath] = useState("");
  const [importPwd, setImportPwd] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeVaultPwd, setWipeVaultPwd] = useState("");
  const [wipeBusy, setWipeBusy] = useState(false);

  const pickExportPath = async () => {
    if (!api.isTauriRuntime()) {
      toast.message("Sfoglia file disponibile solo nell'app desktop Tauri.");
      return;
    }
    try {
      const path = await save({
        title: "Salva backup cifrato",
        defaultPath: "backup.rdpmanagerbackup",
        filters: BACKUP_FILTERS,
      });
      if (path) setExportPath(path);
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const pickImportPath = async () => {
    if (!api.isTauriRuntime()) {
      toast.message("Sfoglia file disponibile solo nell'app desktop Tauri.");
      return;
    }
    try {
      const selected = await open({
        title: "Seleziona file di backup",
        filters: BACKUP_FILTERS,
        multiple: false,
      });
      const p = typeof selected === "string" ? selected : Array.isArray(selected) ? selected[0] : null;
      if (p) setImportPath(p);
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const runExport = async () => {
    if (!exportPath.trim()) {
      toast.error("Scegli dove salvare il file di backup");
      return;
    }
    try {
      await api.exportEncryptedBackup(exportPath.trim(), exportPwd);
      toast.success("Backup esportato");
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const runImport = async () => {
    try {
      await api.importEncryptedBackup(importPath.trim(), importPwd, true);
      const st = await api.getVaultStatus();
      setVault(st.configured, st.unlocked);
      toast.success("Backup importato correttamente");
      setConfirmOpen(false);
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const runMasterWipe = async () => {
    if (!wipeVaultPwd.trim()) {
      toast.error("Inserisci la master password Vault");
      return;
    }
    setWipeBusy(true);
    try {
      await api.masterWipeApplicationData(wipeVaultPwd.trim());
      setWipeVaultPwd("");
      setWipeOpen(false);
      setVault(false, false);
      toast.success("Database azzerato: l'app viene ricaricata");
      window.setTimeout(() => {
        window.location.reload();
      }, 400);
    } catch (e) {
      toast.error(formatErr(e));
    } finally {
      setWipeBusy(false);
    }
  };

  const pathBoxClass =
    "min-h-[2.5rem] flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-200";

  const pickBtnClass =
    "inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900";

  return (
    <AppPageShell className="mx-auto max-w-3xl">
      <AppPageHeader
        icon={HardDrive}
        accent="amber"
        title="Backup cifrato"
        description="Esporta/importa un file .rdpmanagerbackup (JSON cifrato AES-GCM con password dedicata)."
      />

      <AppPageSection className="space-y-3">
        <h2 className="font-semibold">Esporta</h2>
        {api.isTauriRuntime() ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <button type="button" onClick={() => void pickExportPath()} className={pickBtnClass}>
              <Save size={17} aria-hidden />
              Scegli dove salvare…
            </button>
            <div
              className={pathBoxClass}
              title={exportPath || undefined}
            >
              {exportPath ? (
                <span className="block truncate">{exportPath}</span>
              ) : (
                <span className="text-slate-500 dark:text-slate-400">Nessun percorso — usa il pulsante qui accanto</span>
              )}
            </div>
          </div>
        ) : (
          <input
            placeholder="Percorso completo file (solo app desktop: usa Sfoglia lì)"
            value={exportPath}
            onChange={(e) => setExportPath(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        )}
        <input
          type="password"
          placeholder="Password backup (min 8 caratteri)"
          value={exportPwd}
          onChange={(e) => setExportPwd(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <button type="button" onClick={runExport} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
          Esporta ora
        </button>
      </AppPageSection>

      <AppPageSection className="space-y-3">
        <h2 className="font-semibold">Importa</h2>
        {api.isTauriRuntime() ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <button type="button" onClick={() => void pickImportPath()} className={pickBtnClass}>
              <FolderOpen size={17} aria-hidden />
              Seleziona file backup…
            </button>
            <div
              className={pathBoxClass}
              title={importPath || undefined}
            >
              {importPath ? (
                <span className="block truncate">{importPath}</span>
              ) : (
                <span className="text-slate-500 dark:text-slate-400">Nessun file — usa il pulsante qui accanto</span>
              )}
            </div>
          </div>
        ) : (
          <input
            placeholder="Percorso file backup"
            value={importPath}
            onChange={(e) => setImportPath(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        )}
        <input
          type="password"
          placeholder="Password backup"
          value={importPwd}
          onChange={(e) => setImportPwd(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="button"
          onClick={() => {
            if (!importPath.trim()) {
              toast.error("Seleziona prima il file di backup");
              return;
            }
            setConfirmOpen(true);
          }}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Importa (sovrascrive tutto)
        </button>
      </AppPageSection>

      <AppPageSection className="space-y-3 border border-rose-200/90 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20">
        <div className="flex flex-wrap items-center gap-2">
          <OctagonAlert className="size-5 text-rose-700 dark:text-rose-400" aria-hidden />
          <h2 className="font-semibold text-rose-950 dark:text-rose-100">Pulizia master database</h2>
          <span className="rounded bg-rose-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-rose-600">
            MASTER
          </span>
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Cancella tutti i dati locali (clienti, rubrica, pianificazione, cataloghi, impostazioni e configurazione Vault) come se fosse una
          nuova installazione. L&apos;operazione è <strong className="text-rose-800 dark:text-rose-200">definitiva</strong>: fai un backup
          cifrato prima se ti serve conservare qualcosa.
        </p>
        {!api.isTauriRuntime() ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">Disponibile solo nell&apos;app desktop Tauri.</p>
        ) : !vaultConfigured ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Configura prima la Vault in <strong className="font-medium">Impostazioni</strong> per poter usare questa conferma tramite master
            password.
          </p>
        ) : null}
        <button
          type="button"
          disabled={!api.isTauriRuntime() || !vaultConfigured}
          onClick={() => {
            setWipeVaultPwd("");
            setWipeOpen(true);
          }}
          className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50 dark:bg-rose-600 dark:hover:bg-rose-500"
        >
          Azzera tutto il database…
        </button>
      </AppPageSection>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md rounded-2xl bg-white p-6 dark:bg-slate-950">
            <h3 className="text-lg font-semibold">Confermi la sovrascrittura?</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Tutti i dati locali saranno sostituiti dal backup. Dovrai reinserire la password di protezione per usare le credenziali salvate.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-4 py-2 text-sm dark:border-slate-700" onClick={() => setConfirmOpen(false)}>
                Annulla
              </button>
              <button type="button" className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white" onClick={runImport}>
                Sovrascrivi
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {wipeOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-950">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Conferma pulizia master</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Eliminerò ogni contenuto sul database locale. Digita la <strong className="font-medium text-slate-800 dark:text-slate-200">master password Vault</strong> per
              proseguire: senza una password corretta non procedo.
            </p>
            <label className="mt-4 block text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor="wipe-master-pwd">
              Master password Vault
            </label>
            <input
              id="wipe-master-pwd"
              type="password"
              autoComplete="current-password"
              value={wipeVaultPwd}
              onChange={(e) => setWipeVaultPwd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              placeholder="Password Vault…"
              disabled={wipeBusy}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={wipeBusy}
                className="rounded-lg border px-4 py-2 text-sm dark:border-slate-700"
                onClick={() => {
                  setWipeOpen(false);
                  setWipeVaultPwd("");
                }}
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={wipeBusy || wipeVaultPwd.trim().length === 0}
                className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-rose-600"
                onClick={() => void runMasterWipe()}
              >
                {wipeBusy ? "Eliminazione…" : "Esegui azzeramento"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppPageShell>
  );
}
