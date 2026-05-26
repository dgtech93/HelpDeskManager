import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import type { PlanningActivityStored, PlanningActivityTypeDef, PlanningStateDef } from "@/types";
import type { PlanningCatalogBundle } from "@/lib/planningCatalogOptions";
import { filterPlanningActivitiesForClient } from "@/lib/clientPlanningClientLink";
import { groupActivitiesByType } from "@/lib/planningUniversalFilter";
import { getPlanningCellText } from "@/lib/planningCellText";

type Props = {
  clientId: string;
  types: PlanningActivityTypeDef[];
  activities: PlanningActivityStored[];
  bundle: PlanningCatalogBundle | null;
  planningStates: PlanningStateDef[];
};

function previewSummary(
  a: PlanningActivityStored,
  types: PlanningActivityTypeDef[],
  bundle: PlanningCatalogBundle | null,
  planningStates: PlanningStateDef[],
): string {
  const t = types.find((x) => x.id === a.activityTypeId);
  if (!t) return "—";
  const chunks: string[] = [];
  for (const f of t.fields) {
    const txt = getPlanningCellText(a, `field:${f.id}`, types, bundle, planningStates);
    if (txt && txt !== "—") chunks.push(txt);
    if (chunks.length >= 4) break;
  }
  if (t.showStatus) {
    const st = getPlanningCellText(a, "__statusId", types, bundle, planningStates);
    if (st && st !== "—") chunks.push(st);
  }
  return chunks.length ? chunks.join(" · ") : "—";
}

export function ClientPlanningPreview({
  clientId,
  types,
  activities,
  bundle,
  planningStates,
}: Props) {
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");

  const forClient = useMemo(
    () => filterPlanningActivitiesForClient(activities, types, clientId),
    [activities, types, clientId],
  );

  const groupedAll = useMemo(() => groupActivitiesByType(forClient, types), [forClient, types]);

  const typeOptions = useMemo(
    () =>
      groupedAll.map((g) => ({
        id: g.type.id,
        label: (g.type.name || "").trim() || "Senza nome",
        count: g.activities.length,
      })),
    [groupedAll],
  );

  const groupedVisible = useMemo(() => {
    if (selectedTypeFilter === "all") return groupedAll;
    return groupedAll.filter((g) => g.type.id === selectedTypeFilter);
  }, [groupedAll, selectedTypeFilter]);

  if (!types.length) {
    return (
      <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
        Nessun tipo di pianificazione definito (Impostazioni → Setup pianificazione).
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/40 via-white to-slate-50/40 shadow-[0_22px_55px_-22px_rgba(109,40,217,0.72)] ring-1 ring-violet-300/70 dark:border-violet-800/50 dark:from-violet-950/20 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_22px_58px_-20px_rgba(139,92,246,0.9)] dark:ring-violet-400/55">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-200/60 px-3 py-2 dark:border-violet-800/40">
        <div className="flex items-center gap-2">
          <CalendarClock size={18} className="text-violet-600 dark:text-violet-400" aria-hidden />
          <span className="text-sm font-semibold text-violet-950 dark:text-violet-50">Pianificazione</span>
          <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-violet-800 shadow-sm dark:bg-slate-900 dark:text-violet-200">
            {forClient.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-violet-800/85 dark:text-violet-200/85">
            Tipo
          </label>
          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            className="max-w-[12rem] rounded-lg border border-violet-200/90 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 dark:border-violet-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="all">Tutti ({forClient.length})</option>
            {typeOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} ({o.count})
              </option>
            ))}
          </select>
          <Link
            to="/pianificazione"
            className="rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-500 dark:bg-violet-700 dark:hover:bg-violet-600"
          >
            Apri pianificazione
          </Link>
        </div>
      </div>

      <div className="scrollbar-violet-subtle min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {forClient.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
            Nessuna attività collegata a questo cliente nei campi catalogo Cliente (combo / lista multipla).
          </p>
        ) : groupedVisible.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
            Nessun risultato per il filtro tipo scelto.
          </p>
        ) : (
          <div className="flex flex-col gap-4 pt-1">
            {groupedVisible.map(({ type: tdef, activities: rows }) => (
              <div key={tdef.id} className="rounded-lg border border-slate-200/90 bg-white/90 dark:border-slate-700 dark:bg-slate-900/70">
                <div className="border-b border-slate-100 bg-slate-50/90 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900/90">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {(tdef.name || "").trim() || "Senza nome"}
                  </span>
                  <span className="ml-2 rounded bg-violet-100 px-1 py-px text-[10px] font-semibold tabular-nums text-violet-900 dark:bg-violet-950/70 dark:text-violet-100">
                    {rows.length}
                  </span>
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((a) => (
                      <li key={a.id} className="px-2 py-2 text-xs leading-snug text-slate-700 dark:text-slate-200">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-slate-900 dark:text-slate-50">
                              {previewSummary(a, types, bundle, planningStates)}
                            </span>
                          </div>
                          <Link
                            to="/pianificazione"
                            className="shrink-0 rounded border border-violet-200 px-2 py-0.5 text-[11px] font-semibold text-violet-800 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-200 dark:hover:bg-violet-950/40"
                          >
                            Lista
                          </Link>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
