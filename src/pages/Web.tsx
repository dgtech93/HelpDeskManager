import { useEffect, useMemo, useState } from "react";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import type { Client, WebAccess } from "@/types";
import { WebConnectionsTable } from "@/components/WebConnectionsTable";
import { Globe, Search } from "lucide-react";
import { AppPageHeader, AppPageSection, AppPageShell } from "@/components/layout/AppPageChrome";
import { useAppStore } from "@/store/appStore";
import { clientsSortedByName, groupByClient } from "@/lib/groupConnections";

export function WebPage() {
  const vaultOk = useAppStore((s) => s.vaultUnlocked);
  const [rows, setRows] = useState<WebAccess[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientFilter, setClientFilter] = useState("");
  const [q, setQ] = useState("");

  const reload = async () => {
    const [w, c] = await Promise.all([
      api.getWebConnections(),
      api.getClients(),
    ]);
    setRows(w);
    setClients(c);
  };

  useEffect(() => {
    reload().catch((e) => toast.error(formatErr(e)));
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((w) => {
      const okClient = !clientFilter || w.clientId === clientFilter;
      const s = `${w.name} ${w.url} ${w.username ?? ""}`.toLowerCase();
      const okQ = !q || s.includes(q.toLowerCase());
      return okClient && okQ;
    });
  }, [rows, clientFilter, q]);

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
        icon={Globe}
        accent="violet"
        title="Accessi web / CRM"
        description="URL e credenziali: apri nel browser o copia dal punto sicuro dell&apos;app."
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
        <p className="text-sm text-slate-500">Nessun accesso web.</p>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ client, items }) => (
            <section
              key={client.id}
              className="rounded-2xl border border-indigo-200/85 bg-indigo-50/65 p-4 shadow-sm dark:border-indigo-400/45 dark:bg-slate-900 dark:ring-1 dark:ring-indigo-500/20 space-y-3"
            >
              <h2 className="border-b border-indigo-300/45 pb-2 text-base font-semibold tracking-tight text-indigo-950 dark:border-indigo-500/30 dark:text-indigo-200">
                {client.name}
              </h2>
              <WebConnectionsTable
                items={items}
                clients={clients}
                secretsLocked={!vaultOk}
                showClientColumn={false}
                onEdit={() =>
                  toast.message("Modifica dalla pagina Clienti")
                }
                onDelete={() =>
                  toast.message("Elimina il cliente da Impostazioni → Clienti")
                }
              />
            </section>
          ))}
        </div>
      )}
      </AppPageSection>
    </AppPageShell>
  );
}
