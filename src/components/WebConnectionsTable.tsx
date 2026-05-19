import { useState, type MouseEvent } from "react";
import type { Client, WebAccess } from "@/types";
import { ExternalLink, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import { WebAccessDetailDialog } from "@/components/ConnectionDetailDialog";
import { ConnectionPasswordRevealCell } from "@/components/ConnectionPasswordRevealCell";
import { rdpDomainUserDisplay } from "@/lib/rdpDisplay";

type Props = {
  items: WebAccess[];
  clients: Client[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  secretsLocked?: boolean;
  showClientColumn?: boolean;
};

export function WebConnectionsTable({
  items,
  clients,
  onEdit,
  onDelete,
  secretsLocked,
  showClientColumn = true,
}: Props) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailRow = detailId ? items.find((x) => x.id === detailId) ?? null : null;

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "Cliente";

  const openDetail = (id: string, e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setDetailId(id);
  };

  const launchBrowserRow = (id: string) => {
    void api
      .launchWebAccess(id)
      .then(() => toast.success("Browser avviato"))
      .catch((e) => toast.error(formatErr(e)));
  };

  if (items.length === 0) return null;

  return (
    <>
      <WebAccessDetailDialog
        open={detailRow !== null}
        w={detailRow}
        secretsLocked={secretsLocked}
        onClose={() => setDetailId(null)}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[900px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              {showClientColumn ? <th className="px-2 py-2">Cliente</th> : null}
              <th className="px-2 py-2">Nome</th>
              <th className="min-w-[10rem] px-2 py-2">URL</th>
              <th className="px-2 py-2">Dominio \ utente</th>
              <th className="min-w-[8rem] px-2 py-2">Password</th>
              <th className="min-w-[7rem] px-2 py-2">Note</th>
              <th className="whitespace-nowrap px-2 py-2 text-right">Browser</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => {
              const notesT = w.notes?.trim() ?? "";
              const account = rdpDomainUserDisplay(w.domain, w.username);
              return (
                <tr
                  key={w.id}
                  onDoubleClick={(e) => openDetail(w.id, e)}
                  className={cn(
                    "cursor-pointer border-b border-slate-100 transition last:border-0 dark:border-slate-800/80",
                    detailId === w.id
                      ? "bg-indigo-50/90 dark:bg-indigo-950/30"
                      : "hover:bg-slate-50/90 dark:hover:bg-slate-800/50",
                  )}
                >
                  {showClientColumn ? (
                    <td className="px-2 py-2 align-middle text-slate-700 dark:text-slate-300">
                      <span className="line-clamp-2">{clientName(w.clientId)}</span>
                    </td>
                  ) : null}
                  <td className="px-2 py-2 align-middle font-medium text-slate-900 dark:text-slate-50">
                    <span className="inline-flex items-center gap-2">
                      <Globe size={13} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <span className="line-clamp-2">{w.name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2 align-middle font-mono text-[11px] leading-snug">
                    <span className="break-all text-indigo-800 dark:text-indigo-300" title={w.url}>
                      {w.url}
                    </span>
                  </td>
                  <td className="max-w-[9rem] px-2 py-2 align-middle font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    <span className="line-clamp-2" title={account || undefined}>
                      {account || "—"}
                    </span>
                  </td>
                  <td className="max-w-[10rem] px-2 py-2 align-middle">
                    <ConnectionPasswordRevealCell
                      id={w.id}
                      kind="web"
                      hasPassword={Boolean(w.passwordEncrypted)}
                      secretsLocked={secretsLocked}
                      compact
                    />
                  </td>
                  <td className="max-w-[12rem] px-2 py-2 align-middle text-slate-500 dark:text-slate-400">
                    <span className="line-clamp-2 text-[11px] leading-snug" title={notesT || undefined}>
                      {notesT || "—"}
                    </span>
                  </td>
                  <td
                    className="px-2 py-2 align-middle"
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => launchBrowserRow(w.id)}
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm hover:bg-indigo-700"
                      >
                        <ExternalLink size={12} aria-hidden /> Browser
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
        Doppio clic sulla riga: dettaglio e copia. Usa Browser nella colonna o nel pannello.
      </p>
    </>
  );
}
