import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Globe2, Monitor, X } from "lucide-react";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import type {
  AppSettings,
  Client,
  ConnectionNamePreset,
  RdpConnection,
  VpnConnection,
  WebAccess,
} from "@/types";
import { RdpList } from "@/components/RdpList";
import { WebConnectionsTable } from "@/components/WebConnectionsTable";
import { RdpForm, type RdpFormValues } from "@/components/RdpForm";
import { WebForm } from "@/components/WebForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AppPageHeader, AppPageShell } from "@/components/layout/AppPageChrome";
import { useAppStore } from "@/store/appStore";

export function ClientConnectionsDetachedPage() {
  const rawClientId = useParams().clientId ?? "";
  const rawKind = useParams().kind ?? "";
  const clientId = useMemo(() => decodeURIComponent(rawClientId), [rawClientId]);
  const kind = rawKind === "rdp" || rawKind === "web" ? rawKind : null;

  const [searchParams] = useSearchParams();
  const detached = searchParams.get("detached") === "1";
  const navigate = useNavigate();
  const vaultOk = useAppStore((s) => s.vaultUnlocked);

  const [clients, setClients] = useState<Client[]>([]);
  const [allVpns, setAllVpns] = useState<VpnConnection[]>([]);
  const [rdp, setRdp] = useState<RdpConnection[]>([]);
  const [web, setWeb] = useState<WebAccess[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [connectionNamePresets, setConnectionNamePresets] = useState<ConnectionNamePreset[]>([]);
  const [catalogSettings, setCatalogSettings] = useState<AppSettings | null>(null);

  const [showRdpForm, setShowRdpForm] = useState(false);
  const [editRdp, setEditRdp] = useState<RdpConnection | null>(null);
  const [showWebForm, setShowWebForm] = useState(false);
  const [editWeb, setEditWeb] = useState<WebAccess | null>(null);
  const [delRdpId, setDelRdpId] = useState<string | null>(null);
  const [delWebId, setDelWebId] = useState<string | null>(null);

  const loadBase = useCallback(async () => {
    if (!api.isTauriRuntime()) return;
    try {
      const [cList, vpnAll, settings] = await Promise.all([
        api.getClients(),
        api.getVpnConnections(),
        api.getSettings(),
      ]);
      setClients(cList);
      setAllVpns(vpnAll);
      setFavorites(settings.favoriteRdpIds);
      setConnectionNamePresets(settings.connectionNamePresets ?? []);
      setCatalogSettings(settings);
    } catch (e) {
      toast.error(formatErr(e));
    }
  }, []);

  const loadLists = useCallback(async () => {
    if (!api.isTauriRuntime() || !clientId.trim()) return;
    try {
      const [a, w] = await Promise.all([
        api.getRdpByClient(clientId),
        api.getWebByClient(clientId),
      ]);
      setRdp(a);
      setWeb(w);
    } catch (e) {
      toast.error(formatErr(e));
    }
  }, [clientId]);

  const refreshCatalogOnly = useCallback(async () => {
    if (!api.isTauriRuntime()) return;
    try {
      const settings = await api.getSettings();
      setFavorites(settings.favoriteRdpIds);
      setConnectionNamePresets(settings.connectionNamePresets ?? []);
      setCatalogSettings(settings);
    } catch (e) {
      toast.error(formatErr(e));
    }
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  const client = clients.find((c) => c.id === clientId) ?? null;
  const clientsForForms = useMemo(
    () => clients.filter((c) => c.id === clientId),
    [clients, clientId],
  );

  const leave = useCallback(async () => {
    if (detached && api.isTauriRuntime()) {
      try {
        await api.closeCurrentDetachedSheetWindow();
      } catch (e) {
        toast.error(formatErr(e));
      }
      return;
    }
    navigate("/clients");
  }, [detached, navigate]);

  const toggleFavorite = async (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id];
    setFavorites(next);
    try {
      await api.updateSettings({ favoriteRdpIds: next });
      toast.success("Preferiti aggiornati");
    } catch (e) {
      toast.error(formatErr(e));
      setFavorites(favorites);
    }
  };

  if (!kind) {
    return (
      <div className="p-6 text-sm text-slate-700 dark:text-slate-300">
        Tipo pannello non valido.{" "}
        <Link to="/clients" className="font-medium text-emerald-700 underline dark:text-emerald-400">
          Torna ai clienti
        </Link>
      </div>
    );
  }

  if (!clientId.trim()) {
    return (
      <div className="p-6 text-sm text-slate-700 dark:text-slate-300">
        Cliente mancante.{" "}
        <Link to="/clients" className="font-medium text-emerald-700 underline dark:text-emerald-400">
          Torna ai clienti
        </Link>
      </div>
    );
  }

  const tauriMissing = !api.isTauriRuntime();

  return (
    <AppPageShell className="mx-auto max-w-5xl gap-4 p-4">
      <AppPageHeader
        icon={kind === "rdp" ? Monitor : Globe2}
        accent={kind === "rdp" ? "emerald" : "indigo"}
        title={client?.name ?? "Cliente…"}
        description={
          kind === "rdp"
            ? "Connessioni RDP — finestra sganciata dal profilo cliente"
            : "Accessi web / CRM — finestra sganciata dal profilo cliente"
        }
        headerRight={
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void leave()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <X size={14} aria-hidden />
              Chiudi
            </button>
            {kind === "rdp" ? (
              <button
                type="button"
                onClick={() => {
                  setEditRdp(null);
                  setShowRdpForm(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-700"
              >
                + Nuova RDP
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditWeb(null);
                  setShowWebForm(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-indigo-700"
              >
                + Nuovo accesso web
              </button>
            )}
          </div>
        }
      />
      {tauriMissing ? (
        <p className="max-w-xl text-xs text-amber-800 dark:text-amber-200">
          Apri questa vista dall&apos;app desktop (Tauri) per caricare i dati e usare le finestre sganciate.
        </p>
      ) : null}

      {kind === "rdp" ? (
        <section className="space-y-2 rounded-xl border border-emerald-200/85 bg-emerald-50/65 p-3 shadow-sm dark:border-emerald-500/45 dark:bg-slate-900 dark:ring-1 dark:ring-emerald-500/20">
          <div className="flex items-center gap-2 border-b border-emerald-300/45 pb-1.5 dark:border-emerald-500/30">
            <Monitor className="shrink-0 text-emerald-600 dark:text-emerald-400" size={16} strokeWidth={2} aria-hidden />
            <h2 className="text-sm font-semibold text-emerald-950 dark:text-emerald-200">Elenco</h2>
          </div>
          {!tauriMissing && rdp.length === 0 ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">Nessuna connessione.</p>
          ) : null}
          {!tauriMissing && rdp.length > 0 ? (
            <RdpList
              items={rdp}
              clients={clients}
              favorites={favorites}
              secretsLocked={!vaultOk}
              showClientColumn={false}
              connectionCatalog={
                catalogSettings
                  ? {
                      environments: catalogSettings.environments ?? [],
                      versionOptions: catalogSettings.versionOptions ?? [],
                      releaseOptions: catalogSettings.releaseOptions ?? [],
                    }
                  : undefined
              }
              onToggleFavorite={toggleFavorite}
              onEdit={(id) => {
                const row = rdp.find((x) => x.id === id) ?? null;
                setEditRdp(row);
                setShowRdpForm(true);
              }}
              onDelete={(id) => setDelRdpId(id)}
            />
          ) : null}
        </section>
      ) : (
        <section className="space-y-2 rounded-xl border border-indigo-200/85 bg-indigo-50/65 p-3 shadow-sm dark:border-indigo-400/45 dark:bg-slate-900 dark:ring-1 dark:ring-indigo-500/20">
          <div className="flex items-center gap-2 border-b border-indigo-300/45 pb-1.5 dark:border-indigo-500/30">
            <Globe2 className="shrink-0 text-indigo-600 dark:text-indigo-400" size={16} strokeWidth={2} aria-hidden />
            <h2 className="text-sm font-semibold text-indigo-950 dark:text-indigo-200">Elenco</h2>
          </div>
          {!tauriMissing && web.length === 0 ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">Nessun accesso web.</p>
          ) : null}
          {!tauriMissing && web.length > 0 ? (
            <WebConnectionsTable
              items={web}
              clients={clients}
              secretsLocked={!vaultOk}
              showClientColumn={false}
              onEdit={(id) => {
                const row = web.find((x) => x.id === id) ?? null;
                setEditWeb(row);
                setShowWebForm(true);
              }}
              onDelete={(id) => setDelWebId(id)}
            />
          ) : null}
        </section>
      )}

      {showRdpForm && catalogSettings ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <div className="mx-auto mt-6 max-w-3xl pb-10">
            <RdpForm
              key={editRdp?.id ?? `new-rdp-${clientId}`}
              clients={clientsForForms.length ? clientsForForms : clients}
              initial={editRdp}
              preferredClientId={clientId}
              siblingRdps={rdp}
              connectionNamePresets={connectionNamePresets}
              catalog={catalogSettings}
              onCatalogRefreshed={refreshCatalogOnly}
              onCancel={() => setShowRdpForm(false)}
              onSubmit={async (
                v: RdpFormValues & {
                  clearPassword?: boolean;
                  environmentDeployments: {
                    environmentId: string;
                    releaseOptionId: string | null;
                  }[];
                  environmentId: string;
                  releaseOptionId: string;
                },
              ) => {
                try {
                  const includeEnvDeployments = (v.environmentDeployments?.length ?? 0) > 0;
                  const base = {
                    clientId: v.clientId,
                    name: v.name,
                    host: v.host ?? "",
                    port: v.port != null && Number.isFinite(v.port) ? v.port : 3389,
                    username: v.username || null,
                    domain: v.domain || null,
                    resolutionWidth: v.resolutionWidth ?? null,
                    resolutionHeight: v.resolutionHeight ?? null,
                    colorDepth: v.colorDepth ?? null,
                    useFullscreen: v.useFullscreen,
                    useClipboard: v.useClipboard,
                    ignoreCertificate: v.ignoreCertificate,
                    gatewayHost: v.gatewayHost || null,
                    vpnId: null,
                    notes: v.notes || null,
                    version: v.version?.trim() ? v.version.trim() : null,
                    environmentId: v.environmentId?.trim() ? v.environmentId.trim() : null,
                    versionOptionId: v.versionOptionId?.trim() ? v.versionOptionId.trim() : null,
                    releaseOptionId: v.releaseOptionId?.trim() ? v.releaseOptionId.trim() : null,
                    billing: v.billing,
                    finance: v.finance,
                    gwCredit: v.gwCredit,
                    ...(includeEnvDeployments
                      ? { environmentDeployments: v.environmentDeployments ?? [] }
                      : {}),
                  };
                  let rdpFilePathOut: string | undefined;
                  if (v.entryMode === "file") {
                    const p = v.rdpFilePath?.trim();
                    if (p) rdpFilePathOut = p;
                  } else if (editRdp?.rdpFilePath) {
                    rdpFilePathOut = "";
                  }

                  if (editRdp) {
                    await api.updateRdp(editRdp.id, {
                      ...base,
                      passwordPlain: v.passwordPlain ? v.passwordPlain : undefined,
                      clearPassword: v.clearPassword ? true : undefined,
                      ...(rdpFilePathOut !== undefined ? { rdpFilePath: rdpFilePathOut } : {}),
                    });
                    toast.success("RDP aggiornata");
                  } else {
                    await api.createRdp({
                      ...base,
                      passwordPlain: v.passwordPlain || null,
                      ...(v.entryMode === "file"
                        ? { rdpFilePath: v.rdpFilePath?.trim() || undefined }
                        : {}),
                    });
                    toast.success("RDP creata");
                  }
                  setShowRdpForm(false);
                  await loadLists();
                  await loadBase();
                } catch (e) {
                  toast.error(formatErr(e));
                }
              }}
            />
          </div>
        </div>
      ) : null}

      {showWebForm && catalogSettings ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <div className="mx-auto mt-10 max-w-3xl pb-10">
            <WebForm
              key={editWeb?.id ?? `new-${clientId}`}
              clients={clientsForForms.length ? clientsForForms : clients}
              vpns={allVpns}
              connectionNamePresets={connectionNamePresets}
              catalog={catalogSettings}
              onCatalogRefreshed={refreshCatalogOnly}
              crmModules={catalogSettings?.crmModules ?? []}
              initial={editWeb}
              preferredClientId={clientId}
              siblingWebAccesses={web}
              onCancel={() => setShowWebForm(false)}
              onSubmit={async (v) => {
                try {
                  const base = {
                    clientId: v.clientId,
                    name: v.name,
                    url: v.url,
                    domain: (v.domain ?? "").trim(),
                    username: v.username || null,
                    notes: v.notes || null,
                    version: v.version?.trim() ? v.version.trim() : null,
                    environmentId: v.environmentId?.trim() ? v.environmentId.trim() : null,
                    versionOptionId: v.versionOptionId?.trim() ? v.versionOptionId.trim() : null,
                    releaseOptionId: v.releaseOptionId?.trim() ? v.releaseOptionId.trim() : null,
                    crmModuleIds: (v.crmModuleIds ?? []).filter((id) => id.trim()),
                    sportello: v.sportello,
                  };
                  if (editWeb) {
                    await api.updateWebAccess(editWeb.id, {
                      ...base,
                      passwordPlain: v.passwordPlain ? v.passwordPlain : undefined,
                      clearPassword: v.clearPassword ? true : undefined,
                    });
                    toast.success("Accesso web aggiornato");
                  } else {
                    await api.createWebAccess({
                      ...base,
                      passwordPlain: v.passwordPlain || null,
                    });
                    toast.success("Accesso web creato");
                  }
                  setShowWebForm(false);
                  setWeb(await api.getWebByClient(clientId));
                } catch (e) {
                  toast.error(formatErr(e));
                }
              }}
            />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(delRdpId)}
        title="Eliminare la connessione RDP?"
        danger
        onCancel={() => setDelRdpId(null)}
        onConfirm={async () => {
          if (!delRdpId) return;
          try {
            await api.deleteRdp(delRdpId);
            toast.success("RDP eliminata");
            setDelRdpId(null);
            await loadLists();
          } catch (e) {
            toast.error(formatErr(e));
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(delWebId)}
        title="Eliminare l'accesso web?"
        danger
        onCancel={() => setDelWebId(null)}
        onConfirm={async () => {
          if (!delWebId) return;
          try {
            await api.deleteWebAccess(delWebId);
            toast.success("Accesso web eliminato");
            setDelWebId(null);
            await loadLists();
          } catch (e) {
            toast.error(formatErr(e));
          }
        }}
      />
    </AppPageShell>
  );
}
