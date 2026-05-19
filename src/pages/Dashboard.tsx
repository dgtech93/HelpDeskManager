import { useEffect, useMemo, useState } from "react";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import type {
  AppSettings,
  Client,
  ClientContact,
  Collaborator,
  CollaboratorCompetencyDef,
  ConnectionNamePreset,
  ContractTypeDef,
  CrmModuleDef,
  DashboardLayoutSettings,
  DashboardStats,
  RdpConnection,
  WebAccess,
} from "@/types";
import { Globe, LayoutDashboard, Monitor, Shield, Users } from "lucide-react";
import { AppPageHeader, AppPageSection, AppPageShell } from "@/components/layout/AppPageChrome";
import { ConnectionsOverview } from "@/components/ConnectionsOverview";
import { ClientCommercialOverviewTable } from "@/components/ClientCommercialOverviewTable";
import { RdpList } from "@/components/RdpList";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/appStore";
import {
  clientsEligibleForDashboardOverviews,
  normalizeDashboardLayout,
} from "@/lib/dashboardLayout";

export function DashboardPage() {
  const navigate = useNavigate();
  const vaultOk = useAppStore((s) => s.vaultUnlocked);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [rdpAll, setRdpAll] = useState<RdpConnection[]>([]);
  const [webAll, setWebAll] = useState<WebAccess[]>([]);
  const [connectionPresets, setConnectionPresets] = useState<ConnectionNamePreset[]>([]);
  const [matrixCatalog, setMatrixCatalog] = useState<
    Pick<AppSettings, "environments" | "versionOptions" | "releaseOptions">
  >({
    environments: [],
    versionOptions: [],
    releaseOptions: [],
  });
  const [contractTypes, setContractTypes] = useState<ContractTypeDef[]>([]);
  const [crmModules, setCrmModules] = useState<CrmModuleDef[]>([]);
  const [collaboratorCompetencies, setCollaboratorCompetencies] = useState<CollaboratorCompetencyDef[]>([]);
  const [dashboardLayout, setDashboardLayout] = useState<DashboardLayoutSettings>(() =>
    normalizeDashboardLayout(undefined),
  );

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [allContacts, setAllContacts] = useState<ClientContact[]>([]);
  /** Filtro condiviso tra Panoramica clienti e Panoramica servizi (stringa vuota = tutti). */
  const [overviewClientFilterId, setOverviewClientFilterId] = useState("");

  const clientsSorted = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name, "it")),
    [clients],
  );

  const clientsForOverviewTables = useMemo(
    () => clientsEligibleForDashboardOverviews(dashboardLayout, clientsSorted),
    [dashboardLayout, clientsSorted],
  );

  const overviewClients = useMemo(() => {
    const id = overviewClientFilterId.trim();
    if (!id) return clientsForOverviewTables;
    return clientsForOverviewTables.filter((c) => c.id === id);
  }, [clientsForOverviewTables, overviewClientFilterId]);

  const panoramicheSenzaClientiPerFiltroImpostazioni =
    clientsSorted.length > 0 && clientsForOverviewTables.length === 0;

  useEffect(() => {
    (async () => {
      try {
        const [s, c, r, w, settings, collab, contactsList] = await Promise.all([
          api.getDashboardStats(),
          api.getClients(),
          api.getRdpConnections(),
          api.getWebConnections(),
          api.getSettings(),
          api.getCollaborators(),
          api.getAllContacts(),
        ]);
        setStats(s);
        setClients(c);
        setRdpAll(r);
        setWebAll(w);
        setConnectionPresets(settings.connectionNamePresets ?? []);
        setMatrixCatalog({
          environments: settings.environments ?? [],
          versionOptions: settings.versionOptions ?? [],
          releaseOptions: settings.releaseOptions ?? [],
        });
        setContractTypes(settings.contractTypes ?? []);
        setCrmModules(settings.crmModules ?? []);
        setCollaboratorCompetencies(settings.collaboratorCompetencies ?? []);
        setDashboardLayout(normalizeDashboardLayout(settings.dashboardLayout));
        setCollaborators(collab);
        setAllContacts(contactsList);
      } catch (e) {
        toast.error(formatErr(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!overviewClientFilterId.trim()) return;
    if (!clientsForOverviewTables.some((c) => c.id === overviewClientFilterId)) {
      setOverviewClientFilterId("");
    }
  }, [clientsForOverviewTables, overviewClientFilterId]);

  const favRdps = rdpAll.filter((r) => stats?.favoriteRdpIds.includes(r.id)) ?? [];

  const toggleFavorite = async (id: string) => {
    if (!stats) return;
    const favorites = stats.favoriteRdpIds;
    const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id];
    try {
      await api.updateSettings({ favoriteRdpIds: next });
      setStats({ ...stats, favoriteRdpIds: next });
      toast.success("Preferiti aggiornati");
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  if (!stats) {
    return <div className="text-sm text-slate-500">Caricamento...</div>;
  }

  return (
    <AppPageShell>
      <AppPageHeader
        icon={LayoutDashboard}
        accent="violet"
        title="Dashboard"
        description="Panoramica clienti, servizi e collegamenti rapidi alle RDP contrassegnate come preferite."
      />

      <AppPageSection className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-300/55 bg-neutral-50/95 p-5 shadow-md shadow-slate-500/[0.07] ring-1 ring-slate-400/25 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none dark:ring-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
              <Users size={20} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Clienti</div>
              <div className="text-2xl font-bold">{stats.totalClients}</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-300/55 bg-neutral-50/95 p-5 shadow-md shadow-slate-500/[0.07] ring-1 ring-slate-400/25 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none dark:ring-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
              <Monitor size={20} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">RDP</div>
              <div className="text-2xl font-bold">{stats.totalRdp}</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-300/55 bg-neutral-50/95 p-5 shadow-md shadow-slate-500/[0.07] ring-1 ring-slate-400/25 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none dark:ring-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600/10 text-sky-700 dark:text-sky-400">
              <Shield size={20} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">VPN</div>
              <div className="text-2xl font-bold">{stats.totalVpn}</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-300/55 bg-neutral-50/95 p-5 shadow-md shadow-slate-500/[0.07] ring-1 ring-slate-400/25 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none dark:ring-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/10 text-violet-700 dark:text-violet-400">
              <Globe size={20} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Accessi web</div>
              <div className="text-2xl font-bold">{stats.totalWeb}</div>
            </div>
          </div>
        </div>
      </div>

      {panoramicheSenzaClientiPerFiltroImpostazioni ? (
        <p className="max-w-xl text-sm text-amber-900 dark:text-amber-200">
          Nessun cliente è incluso nelle panoramiche: apri Impostazioni → Dashboard e scegli almeno un cliente oppure usa
          «Tutti».
        </p>
      ) : null}

      {clientsForOverviewTables.length > 0 ? (
        <div className="max-w-md">
          <label htmlFor="dashboard-overview-client-filter" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Filtra per cliente
          </label>
          <select
            id="dashboard-overview-client-filter"
            value={overviewClientFilterId}
            onChange={(e) => setOverviewClientFilterId(e.target.value)}
            className="w-full rounded-lg border border-slate-400/35 bg-neutral-50/98 px-3 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Tutti i clienti (in panoramica)</option>
            {clientsForOverviewTables.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Panoramica clienti</h2>
        {clients.length === 0 ? (
          <p className="text-sm text-slate-500">Nessun cliente.</p>
        ) : clientsForOverviewTables.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Nessun cliente disponibile nella panoramica con la configurazione attuale.
          </p>
        ) : (
          <ClientCommercialOverviewTable
            clients={overviewClients}
            collaborators={collaborators}
            collaboratorCompetencies={collaboratorCompetencies}
            contacts={allContacts}
            rdpAll={rdpAll}
            webAll={webAll}
            contractTypes={contractTypes}
            crmModules={crmModules}
            dashboardLayout={dashboardLayout}
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Panoramica servizi</h2>
        <ConnectionsOverview
          clients={overviewClients}
          presets={connectionPresets}
          rdpAll={rdpAll}
          webAll={webAll}
          catalog={matrixCatalog}
          dashboardLayout={dashboardLayout}
          customEmptyClientsMessage={
            panoramicheSenzaClientiPerFiltroImpostazioni
              ? "Nessun cliente incluso nelle panoramiche: scegli i clienti in Impostazioni → Dashboard (oppure «Tutti»)."
              : undefined
          }
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">RDP preferite</h2>
          <button
            type="button"
            onClick={() => navigate("/clients")}
            className="text-xs font-semibold text-emerald-600 hover:underline"
          >
            Apri Clienti
          </button>
        </div>
        {favRdps.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aggiungi stelle alle RDP che usi spesso dalla scheda di ogni cliente (pagina Clienti).
          </p>
        ) : (
          <RdpList
            items={favRdps}
            clients={clients}
            favorites={stats.favoriteRdpIds}
            secretsLocked={!vaultOk}
            connectionCatalog={matrixCatalog}
            onToggleFavorite={toggleFavorite}
            onEdit={(_id) => navigate("/clients")}
            onDelete={(_id) => navigate("/clients")}
          />
        )}
      </section>
      </AppPageSection>
    </AppPageShell>
  );
}
