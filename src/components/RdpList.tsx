import { useState, type MouseEvent } from "react";
import type { AppSettings, Client, RdpConnection } from "@/types";
import { ExternalLink, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import { rdpDomainUserDisplay } from "@/lib/rdpDisplay";
import { RdpConnectionDetailDialog } from "@/components/ConnectionDetailDialog";
import { ConnectionPasswordRevealCell } from "@/components/ConnectionPasswordRevealCell";

type CatalogSlice = Pick<AppSettings, "environments" | "versionOptions" | "releaseOptions">;

type Props = {
  items: RdpConnection[];
  clients: Client[];
  favorites: string[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  secretsLocked?: boolean;
  showClientColumn?: boolean;
  /** Per etichette catalogo nel dettaglio (ambienti/versioni/release). */
  connectionCatalog?: CatalogSlice;
};

export function RdpList({
  items,
  clients,
  favorites,
  onEdit,
  onDelete,
  onToggleFavorite,
  secretsLocked,
  showClientColumn = true,
  connectionCatalog,
}: Props) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailRow = detailId ? items.find((x) => x.id === detailId) ?? null : null;

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "Cliente";

  const openDetail = (id: string, e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setDetailId(id);
  };

  const launchRdpRow = (id: string) => {
    void api
      .launchRdp(id)
      .then(() => toast.success("Sessione RDP avviata"))
      .catch((e) => toast.error(formatErr(e)));
  };

  if (items.length === 0) return null;

  return (
    <>
      <RdpConnectionDetailDialog
        open={detailRow !== null}
        r={detailRow}
        catalog={connectionCatalog}
        secretsLocked={secretsLocked}
        onClose={() => setDetailId(null)}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table
          className="w-full min-w-[780px] border-collapse text-left text-xs"
          title="Doppio clic sulla riga per il dettaglio, copie e azioni."
        >
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <th className="w-9 px-1 py-2"> </th>
              {showClientColumn ? <th className="px-2 py-2">Cliente</th> : null}
              <th className="px-2 py-2">Nome</th>
              <th className="min-w-[8rem] px-2 py-2">Host</th>
              <th className="whitespace-nowrap px-2 py-2">Porta</th>
              <th className="min-w-[7rem] px-2 py-2">Dominio \ utente</th>
              <th className="min-w-[8rem] px-2 py-2">Password</th>
              <th className="whitespace-nowrap px-2 py-2 text-right">Apri</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => {
              const fav = favorites.includes(r.id);
              const account = rdpDomainUserDisplay(r.domain, r.username);
              return (
                <tr
                  key={r.id}
                  onDoubleClick={(e) => openDetail(r.id, e)}
                  className={cn(
                    "cursor-pointer border-b border-slate-100 transition last:border-0 dark:border-slate-800/80",
                    detailId === r.id
                      ? "bg-emerald-50/90 dark:bg-emerald-950/35"
                      : "hover:bg-slate-50/90 dark:hover:bg-slate-800/50",
                  )}
                >
                  <td className="px-1 py-2 align-middle">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(r.id);
                      }}
                      className={cn(
                        "rounded p-1 transition",
                        fav ? "text-amber-500" : "text-slate-300 hover:text-amber-400",
                      )}
                      aria-label="Preferito"
                    >
                      <Star size={16} fill={fav ? "currentColor" : "none"} />
                    </button>
                  </td>
                  {showClientColumn ? (
                    <td className="px-2 py-2 align-middle text-slate-700 dark:text-slate-300">
                      <span className="line-clamp-2">{clientName(r.clientId)}</span>
                    </td>
                  ) : null}
                  <td className="px-2 py-2 align-middle font-medium text-slate-900 dark:text-slate-50">
                    <span className="line-clamp-2">{r.name}</span>
                  </td>
                  <td className="px-2 py-2 align-middle font-mono text-[11px] leading-snug">
                    <span className="break-all text-slate-800 dark:text-slate-200" title={r.host}>
                      {r.host}
                    </span>
                    {r.rdpFilePath ? (
                      <span className="mt-0.5 inline-flex rounded bg-violet-100 px-1 py-0.5 text-[9px] font-sans font-bold uppercase text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                        file
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 align-middle font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    {r.port}
                  </td>
                  <td className="max-w-[12rem] px-2 py-2 align-middle font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    <span className="line-clamp-2" title={account || undefined}>
                      {account || "—"}
                    </span>
                  </td>
                  <td className="max-w-[10rem] px-2 py-2 align-middle">
                    <ConnectionPasswordRevealCell
                      id={r.id}
                      kind="rdp"
                      hasPassword={Boolean(r.passwordEncrypted)}
                      secretsLocked={secretsLocked}
                      compact
                    />
                  </td>
                  <td
                    className="px-2 py-2 align-middle"
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-nowrap items-center justify-end">
                      <button
                        type="button"
                        onClick={() => launchRdpRow(r.id)}
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm hover:bg-emerald-700"
                      >
                        <ExternalLink size={12} aria-hidden /> Apri
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
        Doppio clic sulla riga: dettaglio e copia. La VPN è impostata a livello cliente.
      </p>
    </>
  );
}
