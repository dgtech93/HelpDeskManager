import type { ReactNode } from "react";

import { useCallback, useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import type { Client, ClientCardModuleSettings, ClientCardPanelId } from "@/types";

import * as api from "@/lib/api";

import { formatErr } from "@/lib/api";

import {

  cn,

  faviconUrlForHostname,

  normalizeWebsiteUrl,

  websiteHostname,

} from "@/lib/utils";

import { BookOpen, Building2, ExternalLink, MapPin, User } from "lucide-react";

import { LocationMapPreview } from "@/components/LocationMapPreview";

import { ClientConnectionsRdpPanel, ClientConnectionsWebPanel } from "@/components/ClientConnectionsSplit";



import {

  normalizeClientCardModules,

  clientCardPanelVisible,

} from "@/lib/clientCardModules";



type Props = {

  client: Client;

  onEdit: () => void;

  modules?: Partial<ClientCardModuleSettings>;

  /** Card VPN nel layout configurato tra i moduli della scheda. */

  vpnSideCard: ReactNode;

  onOpenContactsRubrica: () => void;

  onOpenCollaborators: () => void;

  /** Anteprima pianificazione (visibile solo se modulo attivo e presente nel layout). */

  planningPanel?: ReactNode;

};



export function ClientProfileCard({

  client,

  onEdit,

  modules: modulesProp,

  vpnSideCard,

  onOpenContactsRubrica,

  onOpenCollaborators,

  planningPanel,

}: Props) {

  const modules = normalizeClientCardModules(modulesProp);

  const hasAnyConn = modules.showRdp || modules.showWeb;



  const siteHref = useMemo(

    () => normalizeWebsiteUrl(client.websiteUrl ?? undefined),

    [client.websiteUrl],

  );

  const host = siteHref ? websiteHostname(siteHref) : null;

  const faviconFallback = host ? faviconUrlForHostname(host) : null;



  const [logoBroken, setLogoBroken] = useState(false);



  useEffect(() => {

    setLogoBroken(false);

  }, [client.id, faviconFallback]);



  const loc = client.location?.trim() ?? "";



  const openWebsite = useCallback(() => {

    if (!siteHref) return;

    if (api.isTauriRuntime()) {

      void api.openHttpsUrl(siteHref).catch((e) => toast.error(formatErr(e)));

      return;

    }

    window.open(siteHref, "_blank", "noopener,noreferrer");

  }, [siteHref]);



  const renderPanel = (id: ClientCardPanelId) => {

    if (!clientCardPanelVisible(modules, id)) return null;

    switch (id) {

      case "map":

        return (

          <div key={id} className="flex h-full min-h-0 min-w-0 shrink-0 flex-col">

            <LocationMapPreview query={loc} emptyPlaceholder fillParent />

          </div>

        );

      case "vpn":

        return (

          <div key={id} className="flex h-full min-h-0 min-w-0 shrink-0 flex-col">

            {vpnSideCard}

          </div>

        );

      case "rdp":

        return hasAnyConn ? <ClientConnectionsRdpPanel key={id} /> : null;

      case "web":

        return hasAnyConn ? <ClientConnectionsWebPanel key={id} /> : null;

      case "planning":

        return planningPanel ? <div key={id} className="flex h-full min-h-0 min-w-0 flex-col">{planningPanel}</div> : null;

      default:

        return null;

    }

  };



  const hasAnyVisibleLayoutCell = modules.layoutRows.some((row) =>
    row.cells.some((c) => clientCardPanelVisible(modules, c.panelId)),
  );

  const noBodyPanels = !hasAnyVisibleLayoutCell;

  return (

    <article className="flex min-w-0 flex-col rounded-xl border border-slate-200/90 bg-white shadow-md ring-1 ring-slate-900/[0.04] dark:border-slate-700 dark:bg-slate-900 dark:shadow-xl dark:ring-white/[0.06]">

      <div className="flex min-w-0 flex-col gap-5 p-5 md:p-6">

        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

          <div className="flex min-w-0 flex-1 gap-4">

            <div className="relative h-[4.25rem] w-[4.25rem] shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-inner dark:border-slate-600 dark:bg-slate-800">

              {faviconFallback && !logoBroken ? (

                <img

                  alt=""

                  src={faviconFallback}

                  className="h-full w-full object-contain p-1"

                  loading="lazy"

                  referrerPolicy="no-referrer"

                  onError={() => setLogoBroken(true)}

                />

              ) : (

                <div className="flex h-full w-full items-center justify-center text-slate-400 dark:text-slate-500">

                  <Building2 size={28} strokeWidth={1.5} />

                </div>

              )}

            </div>

            <div className="min-w-0 flex-1">

              <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 md:text-2xl">

                {client.name}

              </h2>

              {loc ? (

                <p className="mt-1 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">

                  <MapPin

                    size={18}

                    className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"

                  />

                  <span>{loc}</span>

                </p>

              ) : (

                <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">

                  Località non indicata — aggiungila in Modifica cliente

                </p>

              )}

            </div>

          </div>

          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">

            <button

              type="button"

              onClick={onEdit}

              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"

            >

              Modifica cliente

            </button>

          </div>

        </div>



        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-slate-100 pb-3 text-sm dark:border-slate-800">

          <button

            type="button"

            onClick={onOpenContactsRubrica}

            title="Rubrica referenti"

            aria-label="Rubrica referenti"

            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm transition hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/40"

          >

            <BookOpen size={20} aria-hidden />

          </button>

          <button

            type="button"

            onClick={onOpenCollaborators}

            title="Collaboratori"

            aria-label="Collaboratori"

            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 text-teal-800 shadow-sm transition hover:bg-teal-100 dark:border-teal-500/40 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-900/35"

          >

            <User size={20} aria-hidden />

          </button>

          {siteHref ? (

            <>

              <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:inline dark:bg-slate-600" aria-hidden />

              <button

                type="button"

                onClick={openWebsite}

                title={siteHref}

                className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/65 bg-emerald-600 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-600 dark:hover:bg-emerald-500"

              >

                <ExternalLink size={16} className="opacity-95" aria-hidden />

                Apri sito

              </button>

            </>

          ) : null}

        </div>



        <div

          className={cn(

            "min-w-0 gap-4 overflow-visible pr-0.5",

            "flex flex-col",

          )}

        >

          {noBodyPanels ? (

            <div className="flex min-h-[6rem] items-center justify-center rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">

              Nessun modulo abilitato in Impostazioni → Scheda cliente.

            </div>

          ) : (

            modules.layoutRows.map((row) => {
              const visibleCells = row.cells.filter((c) => clientCardPanelVisible(modules, c.panelId));
              if (visibleCells.length === 0) return null;
              const template = visibleCells.map((c) => `${Math.max(1, c.span)}fr`).join(" ");
              const isPixels = row.heightMode === "pixels" && row.heightPx != null;
              const px = isPixels ? Math.max(190, Math.round(row.heightPx!)) : undefined;
              const rowHasConnectionPanel = visibleCells.some((c) => c.panelId === "rdp" || c.panelId === "web");
              const rowHeightPx = px ?? (row.heightMode === "auto" && rowHasConnectionPanel ? 248 : undefined);
              const rowHasFixedHeight = rowHeightPx != null;
              const rowManagesCellHeight = rowHasFixedHeight || row.heightMode === "stretch";
              return (
                <div
                  key={row.id}
                  className={cn(
                    "min-w-0",
                    row.heightMode === "stretch" && !rowHasFixedHeight && "flex min-h-0 flex-1 flex-col",
                    !rowHasFixedHeight && row.heightMode === "auto" && "shrink-0",
                    rowHasFixedHeight && "flex shrink-0 flex-col",
                  )}
                  style={rowHasFixedHeight ? { height: rowHeightPx, minHeight: rowHeightPx } : undefined}
                >
                  <div
                    className={cn(
                      "grid min-w-0 gap-4",
                      row.heightMode === "stretch" && !rowHasFixedHeight && "min-h-0 flex-1",
                      rowHasFixedHeight && "h-full min-h-0",
                    )}
                    style={{ gridTemplateColumns: template }}
                  >
                    {visibleCells.map((cell) => (
                      (() => {
                        const hasInternalScroll =
                          cell.panelId === "rdp" ||
                          cell.panelId === "web" ||
                          cell.panelId === "vpn" ||
                          cell.panelId === "planning";
                        return (
                          <div
                            key={cell.id}
                            className={cn(
                              "min-w-0 min-h-0",
                              rowManagesCellHeight && "h-full",
                              hasInternalScroll && "overflow-visible",
                              !hasInternalScroll && rowManagesCellHeight && "scrollbar-violet-subtle overflow-y-auto overflow-x-hidden",
                              !hasInternalScroll && !rowManagesCellHeight && "overflow-visible",
                            )}
                          >
                            {renderPanel(cell.panelId)}
                          </div>
                        );
                      })()
                    ))}
                  </div>
                </div>
              );
            })

          )}

        </div>



        {client.description?.trim() ? (

          <p className="shrink-0 text-sm leading-relaxed text-slate-600 dark:text-slate-300">

            {client.description.trim()}

          </p>

        ) : null}

      </div>

    </article>

  );

}

