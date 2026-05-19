import { createContext, useCallback, useContext, useMemo, useState, type MouseEvent, type ReactNode } from "react";

import type { AppSettings, RdpConnection, WebAccess } from "@/types";

import { ExternalLink, Globe2, Monitor, Play } from "lucide-react";

import { cn } from "@/lib/utils";

import * as api from "@/lib/api";

import { formatErr } from "@/lib/api";

import { toast } from "sonner";

import { rdpDomainUserDisplay } from "@/lib/rdpDisplay";

import { ConnectionPasswordRevealCell } from "@/components/ConnectionPasswordRevealCell";

import {

  RdpConnectionDetailDialog,

  WebAccessDetailDialog,

} from "@/components/ConnectionDetailDialog";



type MatrixCatalog = Pick<AppSettings, "environments" | "versionOptions" | "releaseOptions">;



export type ConnectionsSplitSharedProps = {

  rdp: RdpConnection[];

  web: WebAccess[];

  /** Moduli scheda cliente: nascondere intera area RDP. */

  showRdpSection?: boolean;

  /** Moduli scheda cliente: nascondere intera area Web. */

  showWebSection?: boolean;

  secretsLocked?: boolean;

  onEditRdp: (id: string) => void;

  onDeleteRdp: (id: string) => void;

  onEditWeb: (id: string) => void;

  onDeleteWeb: (id: string) => void;

  onAddRdp: () => void;

  onAddWeb: () => void;

  connectionCatalog?: MatrixCatalog;

};



type ConnectionsCtx = ConnectionsSplitSharedProps & {

  rdpDetailId: string | null;

  setRdpDetailId: (id: string | null) => void;

  webDetailId: string | null;

  setWebDetailId: (id: string | null) => void;

  openRdpDetail: (id: string, e: MouseEvent) => void;

  openWebDetail: (id: string, e: MouseEvent) => void;

  launchRdp: (id: string) => void;

  launchWeb: (id: string) => void;

};



const ConnectionsSplitContext = createContext<ConnectionsCtx | null>(null);



function useConnectionsSplit(): ConnectionsCtx {

  const v = useContext(ConnectionsSplitContext);

  if (!v) throw new Error("ConnectionsSplit: usa ClientConnectionsSplitProvider sopra questo componente.");

  return v;

}



export function ClientConnectionsSplitProvider({

  children,

  ...props

}: ConnectionsSplitSharedProps & { children: ReactNode }) {

  const {

    rdp,

    web,

    showRdpSection = true,

    showWebSection = true,

    secretsLocked,

    connectionCatalog,

    onEditRdp,

    onDeleteRdp,

    onEditWeb,

    onDeleteWeb,

    onAddRdp,

    onAddWeb,

  } = props;



  const [rdpDetailId, setRdpDetailId] = useState<string | null>(null);

  const [webDetailId, setWebDetailId] = useState<string | null>(null);



  const rdpDetailRow = rdpDetailId ? rdp.find((x) => x.id === rdpDetailId) ?? null : null;

  const webDetailRow = webDetailId ? web.find((x) => x.id === webDetailId) ?? null : null;



  const openRdpDetail = useCallback((id: string, e: MouseEvent) => {

    if ((e.target as HTMLElement).closest("button")) return;

    setRdpDetailId(id);

  }, []);



  const openWebDetail = useCallback((id: string, e: MouseEvent) => {

    if ((e.target as HTMLElement).closest("button")) return;

    setWebDetailId(id);

  }, []);



  const launchRdp = useCallback((id: string) => {

    void api

      .launchRdp(id)

      .then(() => toast.success("Sessione RDP avviata"))

      .catch((e) => toast.error(formatErr(e)));

  }, []);



  const launchWeb = useCallback((id: string) => {

    void api

      .launchWebAccess(id)

      .then(() => toast.success("Browser avviato"))

      .catch((e) => toast.error(formatErr(e)));

  }, []);



  const ctx = useMemo(

    (): ConnectionsCtx => ({

      rdp,

      web,

      showRdpSection,

      showWebSection,

      secretsLocked,

      connectionCatalog,

      onEditRdp,

      onDeleteRdp,

      onEditWeb,

      onDeleteWeb,

      onAddRdp,

      onAddWeb,

      rdpDetailId,

      setRdpDetailId,

      webDetailId,

      setWebDetailId,

      openRdpDetail,

      openWebDetail,

      launchRdp,

      launchWeb,

    }),

    [

      rdp,

      web,

      showRdpSection,

      showWebSection,

      secretsLocked,

      connectionCatalog,

      onEditRdp,

      onDeleteRdp,

      onEditWeb,

      onDeleteWeb,

      onAddRdp,

      onAddWeb,

      rdpDetailId,

      webDetailId,

      openRdpDetail,

      openWebDetail,

      launchRdp,

      launchWeb,

    ],

  );



  return (

    <ConnectionsSplitContext.Provider value={ctx}>

      <RdpConnectionDetailDialog

        open={rdpDetailRow !== null}

        r={rdpDetailRow}

        catalog={connectionCatalog}

        secretsLocked={secretsLocked}

        onClose={() => setRdpDetailId(null)}

        onEdit={onEditRdp}

        onDelete={onDeleteRdp}

      />

      <WebAccessDetailDialog

        open={webDetailRow !== null}

        w={webDetailRow}

        secretsLocked={secretsLocked}

        onClose={() => setWebDetailId(null)}

        onEdit={onEditWeb}

        onDelete={onDeleteWeb}

      />

      {children}

    </ConnectionsSplitContext.Provider>

  );

}



export function ClientConnectionsRdpPanel() {

  const {

    rdp,

    showRdpSection,

    secretsLocked,

    onAddRdp,

    openRdpDetail,

    launchRdp,

    rdpDetailId,

  } = useConnectionsSplit();



  if (!showRdpSection) return null;



  return (

    <div className="flex min-h-[11rem] min-w-0 flex-1 shrink-0 flex-col overflow-hidden rounded-xl border border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-500/35 dark:bg-slate-900/90 lg:min-h-[10rem]">

      <div className="flex shrink-0 flex-wrap items-stretch gap-0 border-b border-emerald-200/60 bg-emerald-50/70 dark:border-emerald-500/25 dark:bg-emerald-950/40 sm:flex-nowrap">

        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-base font-semibold text-emerald-950 dark:text-emerald-100">

          <Monitor size={22} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />

          <span className="truncate">Connessioni RDP ({rdp.length})</span>

        </div>

        <button

          type="button"

          onClick={onAddRdp}

          className="shrink-0 border-t border-emerald-200/60 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100/80 dark:border-emerald-500/30 dark:text-emerald-200 dark:hover:bg-emerald-900/45 sm:border-l sm:border-t-0"

        >

          + Nuova RDP

        </button>

      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto border-emerald-200/40 px-3 pb-2 pt-2 dark:border-emerald-500/15">

        {rdp.length === 0 ? (

          <p className="py-3 text-sm text-slate-600 dark:text-slate-300">

            Nessuna connessione. Usa «+ Nuova RDP» qui sopra.

          </p>

        ) : (

          <table className="w-full min-w-[560px] border-collapse text-left text-sm">

            <thead>

              <tr className="sticky top-0 z-[1] border-b border-emerald-200/70 bg-emerald-50/95 text-[11px] font-semibold uppercase tracking-wide text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/95 dark:text-emerald-300">

                <th className="px-2 py-2">Host</th>

                <th className="min-w-[8rem] px-2 py-2">Dominio \ utente</th>

                <th className="min-w-[9rem] px-2 py-2">Password</th>

                <th className="w-[3.25rem] shrink-0 px-1 py-2 text-right" aria-hidden />

              </tr>

            </thead>

            <tbody>

              {rdp.map((r) => {

                const account = rdpDomainUserDisplay(r.domain, r.username);

                const fromFile = Boolean(r.rdpFilePath?.trim());

                return (

                  <tr

                    key={r.id}

                    onDoubleClick={(e) => openRdpDetail(r.id, e)}

                    className={cn(

                      "cursor-pointer border-b border-emerald-100/90 align-top last:border-0 dark:border-emerald-900/40",

                      rdpDetailId === r.id

                        ? "bg-emerald-100/80 dark:bg-emerald-950/50"

                        : "hover:bg-emerald-50/90 dark:hover:bg-emerald-950/35",

                    )}

                  >

                    <td className="max-w-[42%] px-2 py-2 align-middle font-mono text-[13px] leading-snug text-slate-800 dark:text-slate-200">

                      <span className="line-clamp-2 break-all" title={fromFile ? `${r.host} — da file .rdp` : r.host}>

                        {r.host}

                      </span>

                      {fromFile ? (

                        <span className="mt-1 inline-flex rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet-800 dark:bg-violet-950/90 dark:text-violet-300">

                          Da file

                        </span>

                      ) : null}

                    </td>

                    <td className="min-w-0 px-2 py-2 align-middle font-mono text-[13px] text-slate-600 dark:text-slate-400">

                      <span className="line-clamp-3" title={account || undefined}>

                        {account || "—"}

                      </span>

                    </td>

                    <td className="min-w-[8.5rem] max-w-[14rem] px-2 py-2 align-middle">

                      <ConnectionPasswordRevealCell

                        id={r.id}

                        kind="rdp"

                        hasPassword={Boolean(r.passwordEncrypted)}

                        secretsLocked={secretsLocked}

                      />

                    </td>

                    <td className="px-1 py-1.5 align-middle" onDoubleClick={(e) => e.stopPropagation()}>

                      <div className="flex justify-end">

                        <button

                          type="button"

                          onClick={() => launchRdp(r.id)}

                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"

                          aria-label="Avvia sessione RDP"

                          title="Avvia"

                        >

                          <Play size={20} aria-hidden />

                        </button>

                      </div>

                    </td>

                  </tr>

                );

              })}

            </tbody>

          </table>

        )}

      </div>

      <p className="shrink-0 border-t border-emerald-200/50 px-3 py-2 text-xs text-emerald-900/75 dark:border-emerald-500/25 dark:text-emerald-300/85">

        Doppio clic sulla riga: dettaglio e copia.

      </p>

    </div>

  );

}



export function ClientConnectionsWebPanel() {

  const {

    web,

    showWebSection,

    secretsLocked,

    onAddWeb,

    openWebDetail,

    launchWeb,

    webDetailId,

  } = useConnectionsSplit();



  if (!showWebSection) return null;



  return (

    <div className="flex min-h-[11rem] min-w-0 flex-1 shrink-0 flex-col overflow-hidden rounded-xl border border-indigo-200/80 bg-indigo-50/40 dark:border-indigo-400/40 dark:bg-slate-900/90 lg:min-h-[10rem]">

      <div className="flex shrink-0 flex-wrap items-stretch gap-0 border-b border-indigo-200/60 bg-indigo-50/70 dark:border-indigo-400/35 dark:bg-indigo-950/35 sm:flex-nowrap">

        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-base font-semibold text-indigo-950 dark:text-indigo-100">

          <Globe2 size={22} className="shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />

          <span className="truncate">Accessi web / CRM ({web.length})</span>

        </div>

        <button

          type="button"

          onClick={onAddWeb}

          className="shrink-0 border-t border-indigo-200/60 px-4 py-2.5 text-sm font-semibold text-indigo-800 hover:bg-indigo-100/80 dark:border-indigo-500/30 dark:text-indigo-200 dark:hover:bg-indigo-900/40 sm:border-l sm:border-t-0"

        >

          + Nuovo accesso

        </button>

      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto border-indigo-200/40 px-3 pb-2 pt-2 dark:border-indigo-500/15">

        {web.length === 0 ? (

          <p className="py-3 text-sm text-slate-600 dark:text-slate-300">

            Nessun accesso web. Usa «+ Nuovo accesso» qui sopra.

          </p>

        ) : (

          <table className="w-full min-w-[640px] border-collapse text-left text-sm">

            <thead>

              <tr className="sticky top-0 z-[1] border-b border-indigo-200/70 bg-indigo-50/95 text-[11px] font-semibold uppercase tracking-wide text-indigo-950 dark:border-indigo-500/30 dark:bg-indigo-950/95 dark:text-indigo-300">

                <th className="px-2 py-2">URL</th>

                <th className="min-w-[5rem] px-2 py-2">Nome</th>

                <th className="min-w-[8rem] px-2 py-2">Dominio \ utente</th>

                <th className="min-w-[9rem] px-2 py-2">Password</th>

                <th className="w-[3.25rem] shrink-0 px-1 py-2 text-right" aria-hidden />

              </tr>

            </thead>

            <tbody>

              {web.map((wRow) => {

                const account = rdpDomainUserDisplay(wRow.domain, wRow.username);

                return (

                  <tr

                    key={wRow.id}

                    onDoubleClick={(e) => openWebDetail(wRow.id, e)}

                    className={cn(

                      "cursor-pointer border-b border-indigo-100/90 align-top last:border-0 dark:border-indigo-900/40",

                      webDetailId === wRow.id

                        ? "bg-indigo-100/80 dark:bg-indigo-950/50"

                        : "hover:bg-indigo-50/90 dark:hover:bg-indigo-950/35",

                    )}

                  >

                    <td className="max-w-[40%] px-2 py-2 align-middle font-mono text-[13px] leading-snug">

                      <span

                        className="line-clamp-2 break-all text-indigo-900 dark:text-indigo-300"

                        title={wRow.url}

                      >

                        {wRow.url}

                      </span>

                    </td>

                    <td className="min-w-0 px-2 py-2 align-middle font-medium text-[13px] leading-snug text-slate-900 dark:text-slate-50">

                      <span className="line-clamp-3" title={wRow.name}>

                        {wRow.name}

                      </span>

                    </td>

                    <td className="min-w-0 px-2 py-2 align-middle font-mono text-[13px] leading-snug text-slate-700 dark:text-slate-300">

                      <span className="line-clamp-4" title={account || undefined}>

                        {account || "—"}

                      </span>

                    </td>

                    <td className="min-w-[8.5rem] max-w-[14rem] px-2 py-2 align-middle">

                      <ConnectionPasswordRevealCell

                        id={wRow.id}

                        kind="web"

                        hasPassword={Boolean(wRow.passwordEncrypted)}

                        secretsLocked={secretsLocked}

                      />

                    </td>

                    <td className="px-1 py-1.5 align-middle" onDoubleClick={(e) => e.stopPropagation()}>

                      <div className="flex justify-end">

                        <button

                          type="button"

                          onClick={() => launchWeb(wRow.id)}

                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm hover:bg-indigo-700"

                          aria-label="Apri nel browser"

                          title="Browser"

                        >

                          <ExternalLink size={20} aria-hidden />

                        </button>

                      </div>

                    </td>

                  </tr>

                );

              })}

            </tbody>

          </table>

        )}

      </div>

      <p className="shrink-0 border-t border-indigo-200/50 px-3 py-2 text-xs text-indigo-950/80 dark:border-indigo-500/25 dark:text-indigo-300/90">

        Doppio clic sulla riga: dettaglio e copia.

      </p>

    </div>

  );

}



/** Layout classico: RDP e Web impilati (un solo provider condiviso con i pannelli singoli). */

export function ClientConnectionsSplit(props: ConnectionsSplitSharedProps) {

  return (

    <ClientConnectionsSplitProvider {...props}>

      {props.showRdpSection || props.showWebSection ? (

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">

          <ClientConnectionsRdpPanel />

          <ClientConnectionsWebPanel />

        </div>

      ) : null}

    </ClientConnectionsSplitProvider>

  );

}

