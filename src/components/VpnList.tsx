import type { Client, VpnConnection } from "@/types";

import { Copy, ExternalLink, KeyRound, Pencil, Shield, Trash2, User } from "lucide-react";

import * as api from "@/lib/api";

import { toast } from "sonner";

import { formatErr } from "@/lib/api";

import { copyTextWithClear } from "@/lib/utils";



type Props = {

  items: VpnConnection[];

  clients: Client[];

  onEdit: (id: string) => void;

  onDelete: (id: string) => void;

  /** Blocca solo la copia della password cifrata. */

  secretsLocked?: boolean;

  showClientColumn?: boolean;

  /** `compact`: schede verticali strette (es. scheda cliente). Default: tabella orizzontale. */

  variant?: "table" | "compact";

};



function endpointLabel(v: VpnConnection) {

  const t = v.type.toLowerCase();

  if (t.includes("windows")) {

    const p = v.configPath?.trim();

    return p || v.server?.trim() || "—";

  }

  return v.server?.trim() || "—";

}



function VpnActionsBar({

  vpnId,

  secretsLocked,

  endpointText,

  username,

  onEdit,

  onDelete,

  justify = "end",

}: {

  vpnId: string;

  secretsLocked?: boolean;

  endpointText: string;

  username: string | null;

  onEdit: () => void;

  onDelete: () => void;

  justify?: "end" | "start";

}) {

  const launch = async () => {

    try {

      await api.launchVpn(vpnId);

      toast.success("Comando VPN inviato");

    } catch (e) {

      toast.error(formatErr(e));

    }

  };



  return (

    <div

      className={`flex flex-wrap gap-1 ${justify === "end" ? "justify-end" : "justify-start"}`}

    >

      <button

        type="button"

        onClick={() => launch()}

        className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-1.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"

      >

        <ExternalLink size={12} /> Avvia

      </button>

      <button

        type="button"

        onClick={async () => {

          try {

            await copyTextWithClear(endpointText);

            toast.success("Copiato");

          } catch (e) {

            toast.error(formatErr(e));

          }

        }}

        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-1 text-[11px] dark:border-slate-700"

      >

        <Copy size={12} />

      </button>

      <button

        type="button"

        onClick={async () => {

          try {

            await copyTextWithClear(username ?? "");

            toast.success("Utente copiato");

          } catch (e) {

            toast.error(formatErr(e));

          }

        }}

        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-1 text-[11px] dark:border-slate-700"

      >

        <User size={12} />

      </button>

      <button

        type="button"

        disabled={secretsLocked}

        title={

          secretsLocked

            ? "Sblocca la protezione credenziali per copiare la password"

            : undefined

        }

        onClick={async () => {

          try {

            await api.copyVpnField(vpnId, "password");

            toast.success("Password copiata");

          } catch (e) {

            toast.error(formatErr(e));

          }

        }}

        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-1 text-[11px] dark:border-slate-700"

      >

        <KeyRound size={12} />

      </button>

      <button

        type="button"

        onClick={onEdit}

        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-1 text-[11px] dark:border-slate-700"

      >

        <Pencil size={12} />

      </button>

      <button

        type="button"

        onClick={onDelete}

        className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-1.5 py-1 text-[11px] text-rose-600 dark:border-rose-900 dark:text-rose-400"

      >

        <Trash2 size={12} />

      </button>

    </div>

  );

}



export function VpnList({

  items,

  clients,

  onEdit,

  onDelete,

  secretsLocked,

  showClientColumn = true,

  variant = "table",

}: Props) {

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "Cliente";



  if (items.length === 0) return null;



  if (variant === "compact") {

    return (

      <div className="min-w-0 space-y-1.5">

        {items.map((v) => {

          const ep = endpointLabel(v);

          return (

            <div

              key={v.id}

              className="rounded-md border border-sky-200/90 bg-white/90 px-2.5 py-2 shadow-sm dark:border-sky-800/60 dark:bg-slate-900/60"

            >

              {showClientColumn ? (

                <p className="mb-2 border-b border-slate-100 pb-1 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">

                  {clientName(v.clientId)}

                </p>

              ) : null}

              <div className="space-y-1">

                <div className="flex items-start gap-1.5">

                  <Shield size={13} className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-400" />

                  <span className="text-xs font-semibold leading-snug text-slate-900 dark:text-slate-50">

                    {v.name}

                  </span>

                </div>

                <div>

                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">

                    Tipo

                  </div>

                  <div className="text-xs text-slate-700 dark:text-slate-300">{v.type}</div>

                </div>

                <div>

                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">

                    Server / profilo

                  </div>

                  <div className="break-all font-mono text-[11px] leading-snug text-slate-800 dark:text-slate-200">

                    {ep}

                  </div>

                </div>

                <div>

                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">

                    Utente

                  </div>

                  <div className="text-xs text-slate-700 dark:text-slate-300">{v.username ?? "—"}</div>

                </div>

              </div>

              <div className="mt-1.5 border-t border-slate-100 pt-1.5 dark:border-slate-800">

                <VpnActionsBar

                  vpnId={v.id}

                  secretsLocked={secretsLocked}

                  endpointText={ep}

                  username={v.username ?? null}

                  onEdit={() => onEdit(v.id)}

                  onDelete={() => onDelete(v.id)}

                  justify="start"

                />

              </div>

            </div>

          );

        })}

      </div>

    );

  }



  return (

    <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">

      <table className="w-full min-w-[640px] border-collapse text-left text-xs">

        <thead>

          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">

            {showClientColumn ? <th className="px-2 py-1.5">Cliente</th> : null}

            <th className="px-2 py-1.5">Nome</th>

            <th className="px-2 py-1.5">Tipo</th>

            <th className="px-2 py-1.5">Server / profilo</th>

            <th className="px-2 py-1.5">Utente</th>

            <th className="px-2 py-1.5 text-right">Azioni</th>

          </tr>

        </thead>

        <tbody>

          {items.map((v) => {

            const ep = endpointLabel(v);

            return (

              <tr

                key={v.id}

                className="border-b border-slate-100 last:border-0 dark:border-slate-800/80"

              >

                {showClientColumn ? (

                  <td className="px-2 py-1.5 align-middle text-slate-700 dark:text-slate-300">

                    {clientName(v.clientId)}

                  </td>

                ) : null}

                <td className="px-2 py-1.5 align-middle font-medium text-slate-900 dark:text-slate-50">

                  <span className="inline-flex items-center gap-2">

                    <Shield size={14} className="shrink-0 text-sky-600 dark:text-sky-400" />

                    {v.name}

                  </span>

                </td>

                <td className="px-2 py-1.5 align-middle text-xs text-slate-600 dark:text-slate-400">

                  {v.type}

                </td>

                <td className="px-2 py-1.5 align-middle font-mono text-xs break-all text-slate-800 dark:text-slate-200">

                  {ep}

                </td>

                <td className="px-2 py-1.5 align-middle text-xs text-slate-600 dark:text-slate-400">

                  {v.username ?? "—"}

                </td>

                <td className="px-2 py-1.5 align-middle">

                  <VpnActionsBar

                    vpnId={v.id}

                    secretsLocked={secretsLocked}

                    endpointText={ep}

                    username={v.username ?? null}

                    onEdit={() => onEdit(v.id)}

                    onDelete={() => onDelete(v.id)}

                    justify="end"

                  />

                </td>

              </tr>

            );

          })}

        </tbody>

      </table>

    </div>

  );

}

