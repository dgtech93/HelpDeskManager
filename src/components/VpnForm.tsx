import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import React from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { Client, VpnConnection } from "@/types";
import * as api from "@/lib/api";
import { formatErr, isTauriRuntime } from "@/lib/api";
import { listVpnTemplatesFromOtherClients, vpnTemplateFieldValues } from "@/lib/vpnTemplates";
import { VaultUnlockBanner } from "@/components/VaultUnlockBanner";
import { useAppStore } from "@/store/appStore";

export const VPN_TYPES = [
  "Windows VPN",
  "OpenVPN",
  "WireGuard",
  "FortiClient",
  "Cisco AnyConnect",
  "Altro",
] as const;

export const VPN_TYPE_WINDOWS = "Windows VPN";

function vpnConfigFileFilters(vpnType: string): { name: string; extensions: string[] }[] {
  const t = vpnType.toLowerCase();
  if (t.includes("openvpn")) {
    return [{ name: "Profilo OpenVPN", extensions: ["ovpn"] }];
  }
  if (t.includes("wireguard")) {
    return [{ name: "Config WireGuard", extensions: ["conf"] }];
  }
  if (t.includes("forti")) {
    return [{ name: "FortiClient", extensions: ["exe"] }];
  }
  if (t.includes("anyconnect") || t.includes("cisco")) {
    return [{ name: "Cisco AnyConnect", extensions: ["exe"] }];
  }
  return [
    { name: "Configurazione", extensions: ["ovpn", "conf", "xml", "json", "ini"] },
    { name: "Programma", extensions: ["exe"] },
  ];
}

const schema = z
  .object({
    clientId: z.string().min(1),
    name: z.string().min(1),
    type: z.string().min(1),
    server: z.string().optional(),
    username: z.string().optional(),
    passwordPlain: z.string().optional(),
    configPath: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === VPN_TYPE_WINDOWS) {
      const p = data.configPath?.trim();
      if (!p) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Seleziona una connessione Windows configurata sul sistema",
          path: ["configPath"],
        });
      }
    }
  });

export type VpnFormValues = z.infer<typeof schema>;

type Props = {
  clients: Client[];
  /** Tutte le VPN del gestionale (per copiare configurazioni da altri clienti). */
  allVpns?: VpnConnection[];
  initial?: VpnConnection | null;
  /** Se si crea una nuova VPN (senza `initial`), pre-seleziona questo cliente. */
  defaultClientId?: string | null;
  onSubmit: (v: VpnFormValues & { clearPassword?: boolean }) => Promise<void>;
  onCancel: () => void;
};

export function VpnForm({ clients, allVpns = [], initial, defaultClientId, onSubmit, onCancel }: Props) {
  const vaultUnlocked = useAppStore((s) => s.vaultUnlocked);
  const pwdSet = Boolean(initial?.passwordEncrypted);
  const [removePwd, setRemovePwd] = React.useState(false);
  const [winProfiles, setWinProfiles] = React.useState<string[]>([]);
  /** True dopo il primo caricamento esplicito (pulsante), mai all’apertura modale. */
  const [winProfilesFetched, setWinProfilesFetched] = React.useState(false);
  const [loadingWin, setLoadingWin] = React.useState(false);
  const [templateSourceId, setTemplateSourceId] = React.useState("");
  const [loadingTemplate, setLoadingTemplate] = React.useState(false);

  const preferredNewClientId =
    (defaultClientId?.trim() && clients.some((c) => c.id === defaultClientId.trim())
      ? defaultClientId.trim()
      : undefined) ?? clients[0]?.id ?? "";

  const form = useForm<VpnFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId: initial?.clientId ?? preferredNewClientId,
      name: initial?.name ?? "",
      type: initial?.type ?? VPN_TYPES[0],
      server: initial?.server ?? "",
      username: initial?.username ?? "",
      passwordPlain: "",
      configPath: initial?.configPath ?? "",
      notes: initial?.notes ?? "",
    },
  });

  const clientIdWatch = form.watch("clientId");
  const typeWatch = form.watch("type");
  const configPathWatch = form.watch("configPath");
  const isWindowsVpn = typeWatch === VPN_TYPE_WINDOWS;

  const templateOptions = React.useMemo(
    () =>
      initial
        ? []
        : listVpnTemplatesFromOtherClients(allVpns, clients, clientIdWatch || preferredNewClientId),
    [allVpns, clients, clientIdWatch, initial, preferredNewClientId],
  );

  React.useEffect(() => {
    setTemplateSourceId("");
  }, [clientIdWatch, initial]);

  const applyVpnTemplate = React.useCallback(
    async (sourceId: string) => {
      const opt = templateOptions.find((o) => o.sourceId === sourceId);
      if (!opt) return;
      setLoadingTemplate(true);
      try {
        const fields = vpnTemplateFieldValues(opt.vpn);
        form.setValue("name", fields.name, { shouldValidate: true });
        form.setValue("type", fields.type, { shouldValidate: true });
        form.setValue("server", fields.server, { shouldValidate: true });
        form.setValue("username", fields.username, { shouldValidate: true });
        form.setValue("configPath", fields.configPath, { shouldValidate: true });
        form.setValue("notes", fields.notes, { shouldValidate: true });
        if (opt.vpn.passwordEncrypted) {
          if (!vaultUnlocked) {
            toast.message("Sblocca il vault per copiare anche la password salvata.");
            form.setValue("passwordPlain", "");
          } else {
            const pw = await api.revealVpnPassword(opt.vpn.id);
            form.setValue("passwordPlain", pw ?? "");
          }
        } else {
          form.setValue("passwordPlain", "");
        }
        toast.success("Configurazione VPN copiata da un altro cliente.");
      } catch (e) {
        toast.error(formatErr(e));
        setTemplateSourceId("");
      } finally {
        setLoadingTemplate(false);
      }
    },
    [form, templateOptions, vaultUnlocked],
  );

  const loadWinProfiles = React.useCallback(async () => {
    if (!isTauriRuntime()) {
      toast.message("Elenco VPN Windows disponibile solo nell’app desktop.");
      return;
    }
    setLoadingWin(true);
    try {
      const list = await api.listWindowsVpnProfiles();
      setWinProfiles(list);
      setWinProfilesFetched(true);
      if (list.length === 0) {
        toast.message(
          "Nessuna VPN in elenco: verifica Impostazioni di Windows → Rete e Internet → VPN.",
        );
      }
    } catch (e) {
      toast.error(formatErr(e));
    } finally {
      setLoadingWin(false);
    }
  }, []);

  const initialWinPath = initial?.configPath?.trim() ?? "";
  const formWinPath = configPathWatch?.trim() ?? "";
  const savedWinPath = initial ? initialWinPath : formWinPath;

  /** Modifica senza aver ancora caricato l’elenco: mostra il profilo salvato senza chiamare PowerShell. */
  const showSavedPendingOption =
    Boolean(savedWinPath) && !winProfilesFetched && isWindowsVpn;

  /** Dopo refresh: profilo salvato non trovato nel sistema. */
  const showOrphanOption =
    Boolean(savedWinPath) &&
    winProfilesFetched &&
    !winProfiles.includes(savedWinPath) &&
    isWindowsVpn;

  const pickVpnConfigFile = React.useCallback(async () => {
    if (!isTauriRuntime()) {
      toast.error("Sfoglia file disponibile solo nell'app desktop.");
      return;
    }
    try {
      const selected = await open({
        title: "Seleziona file di configurazione VPN",
        multiple: false,
        filters: vpnConfigFileFilters(typeWatch),
      });
      if (selected === null || Array.isArray(selected)) return;
      form.setValue("configPath", selected, { shouldValidate: true });
    } catch (e) {
      toast.error(formatErr(e));
    }
  }, [form, typeWatch]);

  return (
    <form
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
      onSubmit={form.handleSubmit(async (v) => {
        await onSubmit({
          ...v,
          clearPassword: initial ? removePwd : false,
        });
      })}
    >
      <VaultUnlockBanner />
      {!initial && templateOptions.length > 0 ? (
        <div className="rounded-xl border border-sky-200/90 bg-sky-50/70 p-3 dark:border-sky-500/35 dark:bg-sky-950/30">
          <label className="text-xs font-medium text-sky-950 dark:text-sky-100">
            Copia configurazione da altro cliente
          </label>
          <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
            Stesso server, credenziali e profilo usati su un altro cliente. Il cliente attuale resta quello selezionato
            sotto.
          </p>
          <select
            value={templateSourceId}
            disabled={loadingTemplate}
            onChange={(e) => {
              const id = e.target.value;
              setTemplateSourceId(id);
              if (id) void applyVpnTemplate(id);
            }}
            className="mt-2 w-full rounded-lg border border-sky-200/90 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-sky-700 dark:bg-slate-900"
          >
            <option value="">— Inserimento manuale —</option>
            {templateOptions.map((o) => (
              <option key={o.sourceId} value={o.sourceId}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="text-xs font-medium">Cliente</label>
          <select
            {...form.register("clientId")}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium">Nome VPN</label>
          <input
            {...form.register("name")}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Etichetta nel gestionale (può differire dal nome in Windows).
          </p>
        </div>
        <div>
          <label className="text-xs font-medium">Tipo</label>
          <select
            {...form.register("type")}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {VPN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {!isWindowsVpn ? (
          <div>
            <label className="text-xs font-medium">Server</label>
            <input
              {...form.register("server")}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        ) : null}
        <div>
          <label className="text-xs font-medium">Username</label>
          <input
            {...form.register("username")}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          {isWindowsVpn ? (
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Opzionale: usa solo se la VPN richiede credenziali a `rasdial`.
            </p>
          ) : null}
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium">Password {pwdSet ? "(opzionale)" : ""}</label>
          <input
            type="password"
            {...form.register("passwordPlain")}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          {initial && pwdSet ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <input type="checkbox" checked={removePwd} onChange={(e) => setRemovePwd(e.target.checked)} />
              Rimuovi password salvata
            </label>
          ) : null}
        </div>
        {isWindowsVpn ? (
          <div className="md:col-span-2 space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <label className="text-xs font-medium">Connessione Windows</label>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Profilo Windows (<span className="font-mono">Get-VpnConnection</span>). Avvio con{" "}
                  <span className="font-mono">rasdial</span>. L’elenco si carica solo con il pulsante, così la
                  finestra non si blocca all’apertura.
                </p>
                <select
                  {...form.register("configPath")}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  {!savedWinPath || winProfilesFetched ? (
                    <option value="">
                      {winProfilesFetched
                        ? "— Seleziona connessione —"
                        : "— Clicca «Aggiorna elenco» per caricare le VPN —"}
                    </option>
                  ) : null}
                  {showSavedPendingOption ? (
                    <option value={savedWinPath}>
                      {savedWinPath}
                      {initial ? " (salvata nel gestionale)" : " (da configurazione copiata)"}
                    </option>
                  ) : null}
                  {showOrphanOption ? (
                    <option value={savedWinPath}>
                      {savedWinPath} (non più rilevata in Windows)
                    </option>
                  ) : null}
                  {winProfiles.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                {form.formState.errors.configPath ? (
                  <p className="text-xs text-rose-600">{form.formState.errors.configPath.message}</p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={loadingWin}
                onClick={() => void loadWinProfiles()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loadingWin ? "animate-spin" : ""} />
                Aggiorna elenco
              </button>
            </div>
          </div>
        ) : (
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-medium">Percorso file config</label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Puoi digitare il percorso o sceglierlo con Esplora file. Su Windows, se indichi un file{" "}
              <span className="font-mono">.exe</span> (client VPN tipo FortiClient, NetExtender, ecc.), verrà avviato
              direttamente; per OpenVPN/WireGuard usa il profilo previsto (.ovpn / .conf). Per FortiClient ufficiale
              conviene comunque il tipo <strong>FortiClient</strong>.
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <input
                {...form.register("configPath")}
                placeholder={
                  typeWatch.toLowerCase().includes("openvpn")
                    ? "C:\\Percorso\\profilo.ovpn"
                    : typeWatch.toLowerCase().includes("wireguard")
                      ? "C:\\Percorso\\tunnel.conf"
                      : typeWatch.toLowerCase().includes("forti")
                        ? "C:\\Program Files\\Fortinet\\FortiClient\\FortiClient.exe"
                        : "C:\\Percorso\\file di configurazione"
                }
                className="min-w-[200px] flex-1 rounded-lg border px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => void pickVpnConfigFile()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700"
              >
                <FolderOpen size={16} aria-hidden />
                Sfoglia
              </button>
            </div>
          </div>
        )}
        <div className="md:col-span-2">
          <label className="text-xs font-medium">Note</label>
          <textarea
            {...form.register("notes")}
            rows={2}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm dark:border-slate-700">
          Annulla
        </button>
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Salva
        </button>
      </div>
    </form>
  );
}
