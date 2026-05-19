import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import { useAppStore } from "@/store/appStore";
import { LockKeyhole } from "lucide-react";

/** Avviso nelle modali VPN/RDP/Web: setup vault, sblocco sessione o messaggio verso Impostazioni. */
export function VaultUnlockBanner() {
  const vaultConfigured = useAppStore((s) => s.vaultConfigured);
  const vaultUnlocked = useAppStore((s) => s.vaultUnlocked);
  const setVault = useAppStore((s) => s.setVault);
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api.isTauriRuntime()) return;
    (async () => {
      try {
        const st = await api.getVaultStatus();
        setVault(st.configured, st.unlocked);
      } catch {
        /* ignore */
      }
    })();
  }, [setVault]);

  if (!vaultUnlocked && vaultConfigured) {
    return (
      <div className="rounded-xl border border-amber-400/80 bg-amber-50 px-3 py-3 dark:border-amber-600/60 dark:bg-amber-950/35">
        <div className="flex gap-2">
          <LockKeyhole size={18} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs font-medium text-amber-950 dark:text-amber-100">
              Per salvare password crittografate serve la master password di protezione (una volta per sessione su questo
              PC).
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[160px] flex-1">
                <label className="text-[11px] font-medium text-amber-900/90 dark:text-amber-200/90">
                  Master password
                </label>
                <input
                  type="password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  autoComplete="current-password"
                  className="mt-1 w-full rounded-lg border border-amber-300/80 bg-white px-3 py-2 text-sm dark:border-amber-700 dark:bg-slate-900"
                />
              </div>
              <button
                type="button"
                disabled={busy || !pwd.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const st = await api.unlockVault(pwd);
                    setVault(st.configured, st.unlocked);
                    setPwd("");
                    toast.success("Protezione credenziali attiva: puoi salvare.");
                  } catch (e) {
                    toast.error(formatErr(e));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                Sblocca
              </button>
            </div>
            <p className="text-[10px] text-amber-900/75 dark:text-amber-300/80">
              Dopo il primo sblocco riuscito l&apos;app ricorda la sessione sul computer. Puoi gestire tutto anche da{" "}
              <span className="font-medium">Impostazioni → Credenziali</span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!vaultConfigured) {
    return (
      <div className="rounded-xl border border-sky-400/70 bg-sky-50 px-3 py-3 dark:border-sky-700/60 dark:bg-sky-950/40">
        <p className="text-xs font-medium text-sky-950 dark:text-sky-100">
          La protezione credenziali non è ancora attiva. Apri{" "}
          <span className="font-semibold">Impostazioni</span> e scegli una master password nella sezione Credenziali,
          poi torna qui per salvare le password.
        </p>
      </div>
    );
  }

  return null;
}
