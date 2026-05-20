import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import { normalizeClientCardModules } from "@/lib/clientCardModules";
import type {
  AppSettings,
  Client,
  ClientContact,
  Collaborator,
  CollaboratorCompetencyDef,
  CollaboratorRole,
  ConnectionNamePreset,
  RdpConnection,
  VpnConnection,
  WebAccess,
} from "@/types";
import { ClientList } from "@/components/ClientList";
import { ClientForm } from "@/components/ClientForm";
import { ClientProfileCard } from "@/components/ClientProfileCard";
import { ClientVpnSideCard } from "@/components/ClientVpnSideCard";
import { ClientConnectionsSplitProvider } from "@/components/ClientConnectionsSplit";
import { ClientPlanningPreview } from "@/components/ClientPlanningPreview";
import { RdpForm, type RdpFormValues } from "@/components/RdpForm";
import { VpnForm } from "@/components/VpnForm";
import { WebForm } from "@/components/WebForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ContactsBook } from "@/components/contacts/ContactsBook";
import { CollaboratorsBook } from "@/components/collaborators/CollaboratorsBook";
import { AppPageHeader } from "@/components/layout/AppPageChrome";
import { Building2, Plus, Search } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { useEscapeWhen } from "@/hooks/useEscapeWhen";

export function ClientsPage() {
  const vaultOk = useAppStore((s) => s.vaultUnlocked);
  const setVault = useAppStore((s) => s.setVault);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [rdp, setRdp] = useState<RdpConnection[]>([]);
  const [vpn, setVpn] = useState<VpnConnection[]>([]);
  const [allVpns, setAllVpns] = useState<VpnConnection[]>([]);
  const [web, setWeb] = useState<WebAccess[]>([]);
  const [connectionNamePresets, setConnectionNamePresets] = useState<
    ConnectionNamePreset[]
  >([]);
  const [collaboratorCompetencies, setCollaboratorCompetencies] = useState<CollaboratorCompetencyDef[]>([]);
  const [catalogSettings, setCatalogSettings] = useState<AppSettings | null>(null);

  const [showClientForm, setShowClientForm] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);

  const [showVpnForm, setShowVpnForm] = useState(false);
  const [editVpn, setEditVpn] = useState<VpnConnection | null>(null);

  const [showRdpForm, setShowRdpForm] = useState(false);
  const [editRdp, setEditRdp] = useState<RdpConnection | null>(null);

  const [showWebForm, setShowWebForm] = useState(false);
  const [editWeb, setEditWeb] = useState<WebAccess | null>(null);

  const [delRdpId, setDelRdpId] = useState<string | null>(null);
  const [delVpnId, setDelVpnId] = useState<string | null>(null);
  const [delWebId, setDelWebId] = useState<string | null>(null);

  const [showContactsBook, setShowContactsBook] = useState(false);
  const [showCollaboratorsPanel, setShowCollaboratorsPanel] = useState(false);

  /** Dati aggiuntivi per etichette campi pianificazione nell'anteprima scheda cliente. */
  const [planningPicklistExtras, setPlanningPicklistExtras] = useState<{
    collaborators: Collaborator[];
    contacts: ClientContact[];
    roles: CollaboratorRole[];
  } | null>(null);

  const refreshClients = async () => {
    const [list, vpnAll, collabs, contacts, roles] = await Promise.all([
      api.getClients(),
      api.getVpnConnections(),
      api.getCollaborators(),
      api.getAllContacts(),
      api.getCollaboratorRoles(),
    ]);
    setClients(list);
    setAllVpns(vpnAll);
    setPlanningPicklistExtras({ collaborators: collabs, contacts, roles });
    const settings = await api.getSettings();
    setConnectionNamePresets(settings.connectionNamePresets ?? []);
    setCollaboratorCompetencies(settings.collaboratorCompetencies ?? []);
    setCatalogSettings(settings);
  };

  const refreshCatalogSettings = useCallback(async () => {
    const [settings, collabs, contacts, roles] = await Promise.all([
      api.getSettings(),
      api.getCollaborators(),
      api.getAllContacts(),
      api.getCollaboratorRoles(),
    ]);
    setPlanningPicklistExtras({ collaborators: collabs, contacts, roles });
    setConnectionNamePresets(settings.connectionNamePresets ?? []);
    setCollaboratorCompetencies(settings.collaboratorCompetencies ?? []);
    setCatalogSettings(settings);
  }, []);

  const reloadCollaboratorCompetenciesCatalog = useCallback(async () => {
    const settings = await api.getSettings();
    setCollaboratorCompetencies(settings.collaboratorCompetencies ?? []);
  }, []);

  useEffect(() => {
    refreshClients().catch((e) => toast.error(formatErr(e)));
  }, []);

  useEffect(() => {
    setShowContactsBook(false);
    setShowCollaboratorsPanel(false);
  }, [selectedId]);

  const overlayEscapeBlocked = Boolean(delVpnId || delRdpId || delWebId);

  useEscapeWhen(Boolean(showCollaboratorsPanel && selectedId && !overlayEscapeBlocked), () =>
    setShowCollaboratorsPanel(false),
  );
  useEscapeWhen(Boolean(showContactsBook && selectedId && !overlayEscapeBlocked), () =>
    setShowContactsBook(false),
  );
  useEscapeWhen(showClientForm && !overlayEscapeBlocked, () => setShowClientForm(false));
  useEscapeWhen(Boolean(showVpnForm && selectedId && !overlayEscapeBlocked), () => setShowVpnForm(false));
  useEscapeWhen(Boolean(showRdpForm && selectedId && !overlayEscapeBlocked), () => setShowRdpForm(false));
  useEscapeWhen(Boolean(showWebForm && selectedId && !overlayEscapeBlocked), () => setShowWebForm(false));

  useEffect(() => {
    if (!selectedId) {
      setRdp([]);
      setVpn([]);
      setWeb([]);
      return;
    }
    (async () => {
      try {
        const [a, b, w] = await Promise.all([
          api.getRdpByClient(selectedId),
          api.getVpnByClient(selectedId),
          api.getWebByClient(selectedId),
        ]);
        setRdp(a);
        setVpn(b);
        setWeb(w);
      } catch (e) {
        toast.error(formatErr(e));
      }
    })();
  }, [selectedId]);

  const visibleClients = useMemo(
    () => clients.filter((c) => !c.hiddenFromClientsNav),
    [clients],
  );

  const filtered = useMemo(
    () => visibleClients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())),
    [visibleClients, q],
  );

  useEffect(() => {
    if (selectedId && !visibleClients.some((c) => c.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, visibleClients]);

  const selectedClient = clients.find((c) => c.id === selectedId);

  const clientCardMods = normalizeClientCardModules(catalogSettings?.clientCardModules);

  const planningBundle = useMemo(() => {
    if (!catalogSettings) return null;
    const x = planningPicklistExtras ?? { collaborators: [], contacts: [], roles: [] };
    return {
      settings: catalogSettings,
      clients,
      collaborators: x.collaborators,
      contacts: x.contacts,
      roles: x.roles,
    };
  }, [catalogSettings, clients, planningPicklistExtras]);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      <AppPageHeader
        className="shrink-0"
        icon={Building2}
        accent="violet"
        title="Clienti"
        description="Gestisci clienti e relative connessioni."
        headerRight={
          <button
            type="button"
            onClick={() => {
              setEditClient(null);
              setShowClientForm(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700"
          >
            <Plus size={18} /> Nuovo cliente
          </button>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_1fr] gap-3 overflow-hidden lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:grid-rows-1">
        <div className="flex min-h-0 max-h-[min(40vh,22rem)] min-w-0 flex-col overflow-hidden rounded-2xl border border-violet-200/85 bg-gradient-to-b from-white via-violet-50/50 to-indigo-50/30 p-2 shadow-[0_1px_0_0_rgba(139,92,246,0.06)] backdrop-blur-sm dark:border-violet-500/40 dark:from-slate-900 dark:via-violet-950/20 dark:to-slate-900 dark:shadow-lg dark:ring-1 dark:ring-violet-500/20 lg:h-full lg:max-h-none">
          <h2 className="shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-800 dark:text-violet-200/95">
            Elenco clienti
          </h2>
          <div className="relative mt-2 shrink-0">
            <Search
              className="pointer-events-none absolute left-3 top-2.5 text-violet-500/85 dark:text-violet-400/90"
              size={17}
              strokeWidth={2.25}
              aria-hidden
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca cliente..."
              className="w-full rounded-xl border border-violet-200/90 bg-white/95 py-2 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-shadow focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/35 dark:border-violet-500/25 dark:bg-slate-950/90 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-violet-400 dark:focus:ring-violet-500/30"
            />
          </div>
          <div className="mt-1.5 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-1 scrollbar-violet-subtle">
            <ClientList
              clients={filtered}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
            />
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          {selectedClient ? (
            <>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <ClientConnectionsSplitProvider
                  rdp={rdp}
                  web={web}
                  showRdpSection={clientCardMods.showRdp}
                  showWebSection={clientCardMods.showWeb}
                  secretsLocked={!vaultOk}
                  onAddRdp={() => {
                    setEditRdp(null);
                    setShowRdpForm(true);
                  }}
                  onAddWeb={() => {
                    setEditWeb(null);
                    setShowWebForm(true);
                  }}
                  onEditRdp={(id) => {
                    const row = rdp.find((x) => x.id === id) ?? null;
                    setEditRdp(row);
                    setShowRdpForm(true);
                  }}
                  onDeleteRdp={(id) => setDelRdpId(id)}
                  onEditWeb={(id) => {
                    const row = web.find((x) => x.id === id) ?? null;
                    setEditWeb(row);
                    setShowWebForm(true);
                  }}
                  onDeleteWeb={(id) => setDelWebId(id)}
                  connectionCatalog={
                    catalogSettings
                      ? {
                          environments: catalogSettings.environments ?? [],
                          versionOptions: catalogSettings.versionOptions ?? [],
                          releaseOptions: catalogSettings.releaseOptions ?? [],
                        }
                      : undefined
                  }
                >
                  <ClientProfileCard
                    client={selectedClient}
                    modules={catalogSettings?.clientCardModules ?? undefined}
                    onEdit={() => {
                      setEditClient(selectedClient);
                      setShowClientForm(true);
                    }}
                    onOpenContactsRubrica={() => setShowContactsBook(true)}
                    onOpenCollaborators={() => setShowCollaboratorsPanel(true)}
                    vpnSideCard={
                      <ClientVpnSideCard
                        items={vpn}
                        secretsLocked={!vaultOk}
                        onAdd={() => {
                          setEditVpn(null);
                          setShowVpnForm(true);
                        }}
                        onEdit={(id) => {
                          const row = vpn.find((x) => x.id === id) ?? null;
                          setEditVpn(row);
                          setShowVpnForm(true);
                        }}
                        onDelete={(id) => setDelVpnId(id)}
                      />
                    }
                    planningPanel={
                      clientCardMods.showPlanning && catalogSettings ? (
                        <ClientPlanningPreview
                          clientId={selectedClient.id}
                          types={catalogSettings.planningActivityTypes ?? []}
                          activities={catalogSettings.planningActivities ?? []}
                          bundle={planningBundle}
                          planningStates={catalogSettings.planningStates ?? []}
                        />
                      ) : null
                    }
                  />
                </ClientConnectionsSplitProvider>
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 sm:p-10">
              Seleziona un cliente per vedere la scheda con sito, mappa sede e connessioni.
            </div>
          )}
        </div>
      </div>

      {showCollaboratorsPanel && selectedId ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <div className="mx-auto mt-6 w-full max-w-[min(100rem,calc(100vw-1rem))] pb-12">
            <CollaboratorsBook
              variant="modal"
              clients={clients}
              competencyCatalog={collaboratorCompetencies}
              reloadCompetencyCatalog={reloadCollaboratorCompetenciesCatalog}
              lockedClientId={selectedId}
              cardGrid
              onClose={() => setShowCollaboratorsPanel(false)}
            />
          </div>
        </div>
      ) : null}

      {showContactsBook && selectedId ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <div className="mx-auto mt-6 w-full max-w-[min(80rem,calc(100vw-1rem))] pb-12">
            <ContactsBook
              variant="modal"
              clients={clients}
              lockedClientId={selectedId}
              onClose={() => setShowContactsBook(false)}
            />
          </div>
        </div>
      ) : null}

      {showClientForm ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <div className="mx-auto mt-10 max-w-lg">
            <ClientForm
              initial={editClient}
              contractTypes={catalogSettings?.contractTypes ?? []}
              vpnsForClient={
                editClient ? allVpns.filter((v) => v.clientId === editClient.id) : []
              }
              onCancel={() => setShowClientForm(false)}
              onSubmit={async (v) => {
                try {
                  const tid = v.contractTypeId?.trim();
                  if (editClient) {
                    await api.updateClient(editClient.id, {
                      name: v.name,
                      description: v.description ?? null,
                      defaultVpnId: v.defaultVpnId?.trim() ? v.defaultVpnId.trim() : null,
                      websiteUrl: v.websiteUrl?.trim() ?? "",
                      location: v.location?.trim() ?? "",
                      contractTypeId: tid ? tid : null,
                      updateCount: v.updateCount,
                    });
                    toast.success("Cliente aggiornato");
                  } else {
                    await api.createClient({
                      name: v.name,
                      description: v.description ?? null,
                      websiteUrl: v.websiteUrl?.trim() ? v.websiteUrl.trim() : null,
                      location: v.location?.trim() ? v.location.trim() : null,
                      contractTypeId: tid ? tid : null,
                      updateCount: v.updateCount,
                    });
                    toast.success("Cliente creato");
                  }
                  setShowClientForm(false);
                  await refreshClients();
                } catch (e) {
                  toast.error(formatErr(e));
                }
              }}
            />
          </div>
        </div>
      ) : null}

      {showVpnForm && selectedId ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <div className="mx-auto mt-10 max-w-3xl pb-10">
            <VpnForm
              key={editVpn?.id ?? `new-vpn-${selectedId}`}
              clients={clients}
              initial={editVpn}
              defaultClientId={editVpn ? null : selectedId}
              onCancel={() => setShowVpnForm(false)}
              onSubmit={async (v) => {
                try {
                  const base = {
                    clientId: v.clientId,
                    name: v.name,
                    type: v.type,
                    server: v.server || null,
                    username: v.username || null,
                    configPath: v.configPath || null,
                    notes: v.notes || null,
                  };
                  if (editVpn) {
                    await api.updateVpn(editVpn.id, {
                      ...base,
                      passwordPlain: v.passwordPlain
                        ? v.passwordPlain
                        : undefined,
                      clearPassword: v.clearPassword ? true : undefined,
                    });
                    toast.success("VPN aggiornata");
                  } else {
                    await api.createVpn({
                      ...base,
                      passwordPlain: v.passwordPlain || null,
                    });
                    toast.success("VPN creata");
                  }
                  const st = await api.getVaultStatus();
                  setVault(st.configured, st.unlocked);
                  setShowVpnForm(false);
                  const b = await api.getVpnByClient(selectedId);
                  setVpn(b);
                  await refreshClients();
                } catch (e) {
                  toast.error(formatErr(e));
                }
              }}
            />
          </div>
        </div>
      ) : null}

      {showRdpForm && selectedId && catalogSettings ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <div className="mx-auto mt-6 max-w-3xl pb-10">
            <RdpForm
              key={editRdp?.id ?? `new-rdp-${selectedId}`}
              clients={clients.filter((c) => c.id === selectedId)}
              initial={editRdp}
              preferredClientId={selectedId}
              siblingRdps={rdp}
              connectionNamePresets={connectionNamePresets}
              catalog={catalogSettings}
              onCatalogRefreshed={refreshCatalogSettings}
              onCancel={() => setShowRdpForm(false)}
              onSubmit={async (
                v: RdpFormValues & {
                  clearPassword?: boolean;
                  environmentDeployments: { environmentId: string; releaseOptionId: string | null }[];
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
                    port:
                      v.port != null && Number.isFinite(v.port) ? v.port : 3389,
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
                    environmentId: v.environmentId?.trim()
                      ? v.environmentId.trim()
                      : null,
                    versionOptionId: v.versionOptionId?.trim()
                      ? v.versionOptionId.trim()
                      : null,
                    releaseOptionId: v.releaseOptionId?.trim()
                      ? v.releaseOptionId.trim()
                      : null,
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
                      passwordPlain: v.passwordPlain
                        ? v.passwordPlain
                        : undefined,
                      clearPassword: v.clearPassword ? true : undefined,
                      ...(rdpFilePathOut !== undefined
                        ? { rdpFilePath: rdpFilePathOut }
                        : {}),
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
                  setRdp(await api.getRdpByClient(selectedId));
                  await refreshClients();
                } catch (e) {
                  toast.error(formatErr(e));
                }
              }}
            />
          </div>
        </div>
      ) : null}

      {showWebForm && selectedId && catalogSettings ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <div className="mx-auto mt-10 max-w-3xl pb-10">
            <WebForm
              key={editWeb?.id ?? `new-web-${selectedId}`}
              clients={clients}
              vpns={allVpns}
              connectionNamePresets={connectionNamePresets}
              catalog={catalogSettings}
              onCatalogRefreshed={refreshCatalogSettings}
              crmModules={catalogSettings?.crmModules ?? []}
              initial={editWeb}
              preferredClientId={selectedId}
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
                    environmentId: v.environmentId?.trim()
                      ? v.environmentId.trim()
                      : null,
                    versionOptionId: v.versionOptionId?.trim()
                      ? v.versionOptionId.trim()
                      : null,
                    releaseOptionId: v.releaseOptionId?.trim()
                      ? v.releaseOptionId.trim()
                      : null,
                    crmModuleIds: (v.crmModuleIds ?? []).filter((id) => id.trim()),
                    sportello: v.sportello,
                  };
                  if (editWeb) {
                    await api.updateWebAccess(editWeb.id, {
                      ...base,
                      passwordPlain: v.passwordPlain
                        ? v.passwordPlain
                        : undefined,
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
                  setWeb(await api.getWebByClient(selectedId));
                } catch (e) {
                  toast.error(formatErr(e));
                }
              }}
            />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(delVpnId)}
        title="Eliminare la VPN?"
        danger
        onCancel={() => setDelVpnId(null)}
        onConfirm={async () => {
          if (!delVpnId || !selectedId) return;
          try {
            await api.deleteVpn(delVpnId);
            toast.success("VPN eliminata");
            setDelVpnId(null);
            setVpn(await api.getVpnByClient(selectedId));
            await refreshClients();
          } catch (e) {
            toast.error(formatErr(e));
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(delRdpId)}
        title="Eliminare la connessione RDP?"
        danger
        onCancel={() => setDelRdpId(null)}
        onConfirm={async () => {
          if (!delRdpId || !selectedId) return;
          try {
            await api.deleteRdp(delRdpId);
            toast.success("RDP eliminata");
            setDelRdpId(null);
            setRdp(await api.getRdpByClient(selectedId));
            await refreshClients();
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
          if (!delWebId || !selectedId) return;
          try {
            await api.deleteWebAccess(delWebId);
            toast.success("Accesso web eliminato");
            setDelWebId(null);
            setWeb(await api.getWebByClient(selectedId));
          } catch (e) {
            toast.error(formatErr(e));
          }
        }}
      />
    </div>
  );
}
