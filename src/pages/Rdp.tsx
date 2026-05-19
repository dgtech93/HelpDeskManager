import { useEffect, useMemo, useState } from "react";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import type { AppSettings, Client, RdpConnection } from "@/types";
import { RdpList } from "@/components/RdpList";
import { Monitor, Search } from "lucide-react";
import { AppPageHeader, AppPageSection, AppPageShell } from "@/components/layout/AppPageChrome";
import { useAppStore } from "@/store/appStore";
import {
  clientsSortedByName,
  groupRdpByClientThenConnectionName,
} from "@/lib/groupConnections";

export function RdpPage() {
  const vaultOk = useAppStore((s) => s.vaultUnlocked);
  const [rdps, setRdps] = useState<RdpConnection[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string>("");
  const [q, setQ] = useState("");

  const [matrixCatalog, setMatrixCatalog] = useState<
    Pick<AppSettings, "environments" | "versionOptions" | "releaseOptions">
  >({
    environments: [],
    versionOptions: [],
    releaseOptions: [],
  });

  const reload = async () => {
    const [r, c, st] = await Promise.all([
      api.getRdpConnections(),
      api.getClients(),
      api.getSettings(),
    ]);
    setRdps(r);
    setClients(c);
    setFavorites(st.favoriteRdpIds);
    setMatrixCatalog({
      environments: st.environments ?? [],
      versionOptions: st.versionOptions ?? [],
      releaseOptions: st.releaseOptions ?? [],
    });
  };

  useEffect(() => {
    reload().catch((e) => toast.error(formatErr(e)));
  }, []);

  const filtered = useMemo(() => {
    return rdps.filter((r) => {
      const okClient = !clientFilter || r.clientId === clientFilter;
      const s = `${r.name} ${r.host}`.toLowerCase();
      const okQ = !q || s.includes(q.toLowerCase());
      return okClient && okQ;
    });
  }, [rdps, clientFilter, q]);

  const orderedClients = useMemo(
    () => clientsSortedByName(clients),
    [clients],
  );

  const grouped = useMemo(
    () => groupRdpByClientThenConnectionName(filtered, orderedClients),
    [filtered, orderedClients],
  );

  const toggleFavorite = async (id: string) => {
    const next = favorites.includes(id)
      ? favorites.filter((x) => x !== id)
      : [...favorites, id];
    setFavorites(next);
    try {
      await api.updateSettings({ favoriteRdpIds: next });
      toast.success("Preferiti aggiornati");
    } catch (e) {
      toast.error(formatErr(e));
      setFavorites(favorites);
    }
  };

  return (
    <AppPageShell>
      <AppPageHeader
        icon={Monitor}
        accent="emerald"
        title="Connessioni RDP"
        description="Raggruppate per cliente e nome connessione."
      />

      <AppPageSection className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm dark:border-slate-800 dark:bg-slate-950"
          />
        </div>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
        >
          <option value="">Tutti i clienti</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">Nessuna connessione.</p>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ client, groups }) => (
            <section
              key={client.id}
              className="rounded-2xl border border-emerald-200/85 bg-emerald-50/65 p-4 shadow-sm dark:border-emerald-500/45 dark:bg-slate-900 dark:ring-1 dark:ring-emerald-500/20 space-y-4"
            >
              <h2 className="border-b border-emerald-300/50 pb-2 text-lg font-semibold tracking-tight text-emerald-950 dark:border-emerald-500/30 dark:text-emerald-200">
                {client.name}
              </h2>
              <div className="space-y-5">
                {groups.map(({ connectionName, items }, gi) => (
                  <div
                    key={`${client.id}-${connectionName}`}
                    className={`space-y-2 rounded-xl border p-3 shadow-sm ${
                      gi % 2 === 0
                        ? "border-emerald-200/55 bg-white/90 dark:border-emerald-500/25 dark:bg-slate-800/90 dark:ring-1 dark:ring-emerald-500/10"
                        : "border-teal-200/60 bg-teal-50/60 dark:border-teal-500/25 dark:bg-slate-800/80 dark:ring-1 dark:ring-teal-500/10"
                    }`}
                  >
                    <h3 className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                      {connectionName}
                    </h3>
                    <RdpList
                      items={items}
                      clients={clients}
                      favorites={favorites}
                      secretsLocked={!vaultOk}
                      showClientColumn={false}
                      connectionCatalog={matrixCatalog}
                      onToggleFavorite={toggleFavorite}
                      onEdit={() =>
                        toast.message("Modifica dalla pagina Clienti")
                      }
                      onDelete={() =>
                        toast.message("Elimina il cliente da Impostazioni → Clienti")
                      }
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      </AppPageSection>
    </AppPageShell>
  );
}
