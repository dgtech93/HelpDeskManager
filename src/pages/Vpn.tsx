import { useEffect, useMemo, useState } from "react";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import type { Client, VpnConnection } from "@/types";
import { VpnList } from "@/components/VpnList";
import { Search, Shield } from "lucide-react";
import { AppPageHeader, AppPageSection, AppPageShell } from "@/components/layout/AppPageChrome";
import { useAppStore } from "@/store/appStore";
import { clientsSortedByName, groupByClient } from "@/lib/groupConnections";

export function VpnPage() {
  const vaultOk = useAppStore((s) => s.vaultUnlocked);
  const [vpns, setVpns] = useState<VpnConnection[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientFilter, setClientFilter] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [v, c] = await Promise.all([
          api.getVpnConnections(),
          api.getClients(),
        ]);
        setVpns(v);
        setClients(c);
      } catch (e) {
        toast.error(formatErr(e));
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    return vpns.filter((v) => {
      const okClient = !clientFilter || v.clientId === clientFilter;
      const s = `${v.name} ${v.server ?? ""} ${v.type}`.toLowerCase();
      const okQ = !q || s.includes(q.toLowerCase());
      return okClient && okQ;
    });
  }, [vpns, clientFilter, q]);

  const orderedClients = useMemo(
    () => clientsSortedByName(clients),
    [clients],
  );
  const grouped = useMemo(() => {
    const g = groupByClient(filtered, orderedClients);
    return g.map(({ client, items }) => ({
      client,
      items: [...items].sort((a, b) =>
        a.name.localeCompare(b.name, "it"),
      ),
    }));
  }, [filtered, orderedClients]);

  return (
    <AppPageShell>
      <AppPageHeader
        icon={Shield}
        accent="sky"
        title="VPN"
        description="Profili per cliente (lista)."
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
          <p className="text-sm text-slate-500">Nessuna VPN.</p>
        ) : (
          <div className="space-y-8">
            {grouped.map(({ client, items }) => (
              <section
                key={client.id}
                className="rounded-2xl border border-sky-200/85 bg-sky-50/65 p-4 shadow-sm dark:border-sky-400/45 dark:bg-slate-900 dark:ring-1 dark:ring-sky-500/20 space-y-3"
              >
                <h2 className="border-b border-sky-300/45 pb-2 text-base font-semibold tracking-tight text-sky-950 dark:border-sky-500/30 dark:text-sky-200">
                  {client.name}
                </h2>
                <VpnList
                  items={items}
                  clients={clients}
                  secretsLocked={!vaultOk}
                  showClientColumn={false}
                  onEdit={() => toast.message("Modifica dalla pagina Clienti")}
                  onDelete={() => toast.message("Elimina il cliente da Impostazioni → Clienti")}
                />
              </section>
            ))}
          </div>
        )}
      </AppPageSection>
    </AppPageShell>
  );
}
