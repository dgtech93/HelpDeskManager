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


type EnvironmentBadge = {
  id: string;
  label: string;
};


const ENVIRONMENT_BADGE_CLASSES = [
  "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/45 dark:bg-violet-950/55 dark:text-violet-200",
  "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/45 dark:bg-sky-950/55 dark:text-sky-200",
  "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/45 dark:bg-emerald-950/55 dark:text-emerald-200",
  "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/45 dark:bg-amber-950/55 dark:text-amber-200",
  "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/45 dark:bg-rose-950/55 dark:text-rose-200",
  "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-500/45 dark:bg-indigo-950/55 dark:text-indigo-200",
] as const;


function stableStringIndex(key: string, modulus: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  }
  return modulus > 0 ? Math.abs(h) % modulus : 0;
}


function environmentBadgeClass(environmentId: string): string {
  if (!environmentId.trim()) return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
  return ENVIRONMENT_BADGE_CLASSES[
    stableStringIndex(environmentId, ENVIRONMENT_BADGE_CLASSES.length)
  ]!;
}


function environmentName(environmentId: string, catalog: MatrixCatalog): string {
  return (
    catalog.environments.find((env) => env.id === environmentId)?.name?.trim() ||
    environmentId
  );
}


function rdpEnvironmentBadges(r: RdpConnection, catalog?: MatrixCatalog): EnvironmentBadge[] {
  if (!catalog) return [];
  const rawIds =
    r.environmentDeployments
      ?.map((d) => (d.environmentId ?? "").trim())
      .filter(Boolean) ?? [];
  const ids = rawIds.length > 0 ? rawIds : [(r.environmentId ?? "").trim()].filter(Boolean);
  return [...new Set(ids)].map((id) => ({ id, label: environmentName(id, catalog) }));
}


function webEnvironmentBadges(w: WebAccess, catalog?: MatrixCatalog): EnvironmentBadge[] {
  if (!catalog) return [];
  const id = (w.environmentId ?? "").trim();
  return id ? [{ id, label: environmentName(id, catalog) }] : [];
}


function EnvironmentBadges({ badges }: { badges: EnvironmentBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <>
      {badges.slice(0, 3).map((badge) => (
        <span
          key={badge.id}
          title={badge.label}
          className={cn(
            "inline-flex max-w-[6.75rem] shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide",
            environmentBadgeClass(badge.id),
          )}
        >
          <span className="truncate">{badge.label}</span>
        </span>
      ))}
      {badges.length > 3 ? (
        <span className="inline-flex shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold leading-none text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          +{badges.length - 3}
        </span>
      ) : null}
    </>
  );
}



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

    connectionCatalog,

  } = useConnectionsSplit();



  if (!showRdpSection) return null;



  return (

    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-emerald-200/80 bg-emerald-50/40 shadow-[0_18px_42px_-24px_rgba(6,95,70,0.55)] ring-1 ring-emerald-300/55 dark:border-emerald-500/35 dark:bg-slate-900/90 dark:shadow-[0_18px_46px_-22px_rgba(16,185,129,0.72)] dark:ring-emerald-400/45">

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

      <div className="scrollbar-context-emerald min-h-0 flex-1 overflow-y-auto overflow-x-auto border-emerald-200/40 px-3 pb-2 pt-2 dark:border-emerald-500/15">

        {rdp.length === 0 ? (

          <p className="py-3 text-sm text-slate-600 dark:text-slate-300">

            Nessuna connessione. Usa «+ Nuova RDP» qui sopra.

          </p>

        ) : (

          <table className="w-full min-w-[760px] border-collapse text-left text-sm">

            <thead>

              <tr className="sticky top-0 z-[1] border-b border-emerald-200/70 bg-emerald-50/95 text-[11px] font-semibold uppercase tracking-wide text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/95 dark:text-emerald-300">

                <th className="min-w-[6rem] max-w-[11rem] px-2 py-2">Nome</th>

                <th className="min-w-0 px-2 py-2">Host</th>

                <th className="min-w-[8rem] px-2 py-2">Dominio \ utente</th>

                <th className="sticky right-[3.25rem] z-[4] w-[9.75rem] min-w-[9.75rem] bg-emerald-50/95 px-2 py-2 shadow-[-10px_0_16px_-16px_rgba(15,23,42,0.65)] dark:bg-emerald-950/95">Password</th>

                <th className="sticky right-0 z-[5] w-[3.25rem] min-w-[3.25rem] shrink-0 bg-emerald-50/95 px-1 py-2 text-right dark:bg-emerald-950/95" aria-hidden />

              </tr>

            </thead>

            <tbody>

              {rdp.map((r) => {

                const account = rdpDomainUserDisplay(r.domain, r.username);

                const fromFile = Boolean(r.rdpFilePath?.trim());
                const envBadges = rdpEnvironmentBadges(r, connectionCatalog);
                const rowSelected = rdpDetailId === r.id;

                return (

                  <tr

                    key={r.id}

                    onDoubleClick={(e) => openRdpDetail(r.id, e)}

                    className={cn(

                      "group cursor-pointer border-b border-emerald-100/90 align-top last:border-0 dark:border-emerald-900/40",

                      rowSelected

                        ? "bg-emerald-100/80 dark:bg-emerald-950/50"

                        : "hover:bg-emerald-50/90 dark:hover:bg-emerald-950/35",

                    )}

                  >

                    <td className="min-w-0 max-w-[12rem] px-2 py-2 align-middle text-[13px] font-medium leading-snug text-slate-900 dark:text-slate-50">

                      <div className="flex flex-wrap items-center gap-1.5">

                        <span className="min-w-0 max-w-full truncate" title={r.name}>

                          {r.name}

                        </span>

                        <EnvironmentBadges badges={envBadges} />

                      </div>

                    </td>

                    <td className="max-w-[36%] min-w-0 px-2 py-2 align-middle font-mono text-[13px] leading-snug text-slate-800 dark:text-slate-200">

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

                    <td
                      className={cn(
                        "sticky right-[3.25rem] z-[2] w-[9.75rem] min-w-[9.75rem] max-w-[9.75rem] px-2 py-2 align-middle shadow-[-10px_0_16px_-16px_rgba(15,23,42,0.65)]",
                        rowSelected
                          ? "bg-emerald-100/95 dark:bg-emerald-950/95"
                          : "bg-emerald-50/95 group-hover:bg-emerald-50/95 dark:bg-slate-900/95 dark:group-hover:bg-emerald-950/90",
                      )}
                    >

                      <ConnectionPasswordRevealCell

                        id={r.id}

                        kind="rdp"

                        hasPassword={Boolean(r.passwordEncrypted)}

                        secretsLocked={secretsLocked}

                      />

                    </td>

                    <td
                      className={cn(
                        "sticky right-0 z-[3] w-[3.25rem] min-w-[3.25rem] px-1 py-1.5 align-middle",
                        rowSelected
                          ? "bg-emerald-100/95 dark:bg-emerald-950/95"
                          : "bg-emerald-50/95 group-hover:bg-emerald-50/95 dark:bg-slate-900/95 dark:group-hover:bg-emerald-950/90",
                      )}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >

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

    connectionCatalog,

  } = useConnectionsSplit();



  if (!showWebSection) return null;



  return (

    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-indigo-200/80 bg-indigo-50/40 shadow-[0_18px_42px_-24px_rgba(67,56,202,0.5)] ring-1 ring-indigo-300/55 dark:border-indigo-400/40 dark:bg-slate-900/90 dark:shadow-[0_18px_46px_-22px_rgba(99,102,241,0.72)] dark:ring-indigo-400/45">

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

      <div className="scrollbar-context-indigo min-h-0 flex-1 overflow-y-auto overflow-x-auto border-indigo-200/40 px-3 pb-2 pt-2 dark:border-indigo-500/15">

        {web.length === 0 ? (

          <p className="py-3 text-sm text-slate-600 dark:text-slate-300">

            Nessun accesso web. Usa «+ Nuovo accesso» qui sopra.

          </p>

        ) : (

          <table className="w-full min-w-[760px] border-collapse text-left text-sm">

            <thead>

              <tr className="sticky top-0 z-[1] border-b border-indigo-200/70 bg-indigo-50/95 text-[11px] font-semibold uppercase tracking-wide text-indigo-950 dark:border-indigo-500/30 dark:bg-indigo-950/95 dark:text-indigo-300">

                <th className="min-w-[6rem] max-w-[11rem] px-2 py-2">Nome</th>

                <th className="min-w-0 px-2 py-2">URL</th>

                <th className="min-w-[8rem] px-2 py-2">Dominio \ utente</th>

                <th className="sticky right-[3.25rem] z-[4] w-[9.75rem] min-w-[9.75rem] bg-indigo-50/95 px-2 py-2 shadow-[-10px_0_16px_-16px_rgba(15,23,42,0.65)] dark:bg-indigo-950/95">Password</th>

                <th className="sticky right-0 z-[5] w-[3.25rem] min-w-[3.25rem] shrink-0 bg-indigo-50/95 px-1 py-2 text-right dark:bg-indigo-950/95" aria-hidden />

              </tr>

            </thead>

            <tbody>

              {web.map((wRow) => {

                const account = rdpDomainUserDisplay(wRow.domain, wRow.username);
                const envBadges = webEnvironmentBadges(wRow, connectionCatalog);
                const rowSelected = webDetailId === wRow.id;

                return (

                  <tr

                    key={wRow.id}

                    onDoubleClick={(e) => openWebDetail(wRow.id, e)}

                    className={cn(

                      "group cursor-pointer border-b border-indigo-100/90 align-top last:border-0 dark:border-indigo-900/40",

                      rowSelected

                        ? "bg-indigo-100/80 dark:bg-indigo-950/50"

                        : "hover:bg-indigo-50/90 dark:hover:bg-indigo-950/35",

                    )}

                  >

                    <td className="min-w-0 max-w-[12rem] px-2 py-2 align-middle text-[13px] font-medium leading-snug text-slate-900 dark:text-slate-50">

                      <div className="flex flex-wrap items-center gap-1.5">

                        <span className="min-w-0 max-w-full truncate" title={wRow.name}>

                          {wRow.name}

                        </span>

                        <EnvironmentBadges badges={envBadges} />

                      </div>

                    </td>

                    <td className="max-w-[36%] min-w-0 px-2 py-2 align-middle font-mono text-[13px] leading-snug">

                      <span

                        className="line-clamp-2 break-all text-indigo-900 dark:text-indigo-300"

                        title={wRow.url}

                      >

                        {wRow.url}

                      </span>

                    </td>

                    <td className="min-w-0 px-2 py-2 align-middle font-mono text-[13px] leading-snug text-slate-700 dark:text-slate-300">

                      <span className="line-clamp-4" title={account || undefined}>

                        {account || "—"}

                      </span>

                    </td>

                    <td
                      className={cn(
                        "sticky right-[3.25rem] z-[2] w-[9.75rem] min-w-[9.75rem] max-w-[9.75rem] px-2 py-2 align-middle shadow-[-10px_0_16px_-16px_rgba(15,23,42,0.65)]",
                        rowSelected
                          ? "bg-indigo-100/95 dark:bg-indigo-950/95"
                          : "bg-indigo-50/95 group-hover:bg-indigo-50/95 dark:bg-slate-900/95 dark:group-hover:bg-indigo-950/90",
                      )}
                    >

                      <ConnectionPasswordRevealCell

                        id={wRow.id}

                        kind="web"

                        hasPassword={Boolean(wRow.passwordEncrypted)}

                        secretsLocked={secretsLocked}

                      />

                    </td>

                    <td
                      className={cn(
                        "sticky right-0 z-[3] w-[3.25rem] min-w-[3.25rem] px-1 py-1.5 align-middle",
                        rowSelected
                          ? "bg-indigo-100/95 dark:bg-indigo-950/95"
                          : "bg-indigo-50/95 group-hover:bg-indigo-50/95 dark:bg-slate-900/95 dark:group-hover:bg-indigo-950/90",
                      )}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >

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

