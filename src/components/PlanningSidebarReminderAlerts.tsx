import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import type { PlanningActivityStored, PlanningActivityTypeDef, PlanningStateDef } from "@/types";
import type { PlanningCatalogBundle } from "@/lib/planningCatalogOptions";
import {
  PLANNING_ACTIVITIES_CHANGED_EVENT,
  PLANNING_REMINDER_ALERT_DISMISSALS_LS,
  PLANNING_REMINDER_PRE_ALERT_SETTINGS_CHANGED,
  computeActiveReminderPreAlerts,
  parseDismissedReminderKeys,
  pruneExpiredReminderDismissKeys,
  sanitizePlanningReminderPreAlertMinutes,
  serializeDismissedReminderKeys,
  type ActiveReminderPreAlert,
} from "@/lib/planningReminderPreAlert";
import { hueForActivityType } from "@/lib/agendaPlanning";

const MAX_SIDEBAR_ALERTS = 5;

export function PlanningSidebarReminderAlerts() {
  const navigate = useNavigate();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(true);
  const [types, setTypes] = useState<PlanningActivityTypeDef[]>([]);
  const [activities, setActivities] = useState<PlanningActivityStored[]>([]);
  const [planningStates, setPlanningStates] = useState<PlanningStateDef[]>([]);
  const [bundle, setBundle] = useState<PlanningCatalogBundle | null>(null);
  const [beforeMinutes, setBeforeMinutes] = useState<number[]>(() => sanitizePlanningReminderPreAlertMinutes(undefined));
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    parseDismissedReminderKeys(localStorage.getItem(PLANNING_REMINDER_ALERT_DISMISSALS_LS)),
  );

  const refresh = useCallback(async () => {
    if (!api.isTauriRuntime()) {
      setBusy(false);
      return;
    }
    const tNow = Date.now();
    setNowMs(tNow);
    try {
      let rawDismiss = parseDismissedReminderKeys(localStorage.getItem(PLANNING_REMINDER_ALERT_DISMISSALS_LS));
      let prunedDismiss = pruneExpiredReminderDismissKeys(rawDismiss, tNow);
      localStorage.setItem(PLANNING_REMINDER_ALERT_DISMISSALS_LS, serializeDismissedReminderKeys(prunedDismiss));
      setDismissed(prunedDismiss);

      const [settings, clients, collaborators, contacts, roles] = await Promise.all([
        api.getSettings(),
        api.getClientsAll(),
        api.getCollaborators(),
        api.getAllContacts(),
        api.getCollaboratorRoles(),
      ]);
      const bb: PlanningCatalogBundle = { settings, clients, collaborators, contacts, roles };
      setBundle(bb);
      setTypes(settings.planningActivityTypes ?? []);
      setActivities(settings.planningActivities ?? []);
      setPlanningStates(settings.planningStates ?? []);
      setBeforeMinutes(sanitizePlanningReminderPreAlertMinutes(settings.planningReminderPreAlertMinutesBefore));

      rawDismiss = parseDismissedReminderKeys(localStorage.getItem(PLANNING_REMINDER_ALERT_DISMISSALS_LS));
      prunedDismiss = pruneExpiredReminderDismissKeys(rawDismiss, Date.now());
      setDismissed(prunedDismiss);
    } catch (e) {
      console.warn("[PlanningSidebarReminderAlerts]", formatErr(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const iv = window.setInterval(() => setNowMs(Date.now()), 1000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const onSettingsSaved = () => void refresh();
    const onActivitiesChanged = () => void refresh();
    window.addEventListener(PLANNING_REMINDER_PRE_ALERT_SETTINGS_CHANGED, onSettingsSaved);
    window.addEventListener(PLANNING_ACTIVITIES_CHANGED_EVENT, onActivitiesChanged);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(PLANNING_REMINDER_PRE_ALERT_SETTINGS_CHANGED, onSettingsSaved);
      window.removeEventListener(PLANNING_ACTIVITIES_CHANGED_EVENT, onActivitiesChanged);
    };
  }, [refresh]);

  const active = useMemo((): ActiveReminderPreAlert[] => {
    const dms = sanitizePlanningReminderPreAlertMinutes(beforeMinutes);
    const pruned = pruneExpiredReminderDismissKeys(dismissed, nowMs);
    return computeActiveReminderPreAlerts(nowMs, activities, types, dms, pruned, bundle, planningStates).slice(
      0,
      MAX_SIDEBAR_ALERTS,
    );
  }, [nowMs, activities, types, beforeMinutes, dismissed, bundle, planningStates]);

  const persistDismiss = (key: string) => {
    const next = new Set(dismissed);
    next.add(key);
    const pruned = pruneExpiredReminderDismissKeys(next, nowMs);
    setDismissed(pruned);
    localStorage.setItem(PLANNING_REMINDER_ALERT_DISMISSALS_LS, serializeDismissedReminderKeys(pruned));
  };

  const openActivity = (a: ActiveReminderPreAlert) => {
    navigate(`/pianificazione?activity=${encodeURIComponent(a.activityId)}`);
  };

  if (!api.isTauriRuntime()) return null;
  if (busy) return null;
  if (active.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-slate-200/90 p-2 dark:border-slate-800">
      <div className="flex flex-col gap-1.5">
        {active.map((a) => {
          const line = a.label;
          const h = hueForActivityType(a.activityTypeId);
          return (
            <div
              key={a.dismissKey}
              className="relative flex min-h-[2.25rem] items-stretch gap-1 rounded-lg border border-slate-200/90 bg-white/80 py-1 pl-0 pr-2 shadow-sm dark:border-slate-700/80 dark:bg-slate-950/60"
              style={{
                borderLeftWidth: 4,
                borderLeftStyle: "solid",
                borderLeftColor: `hsl(${h} 58% 46%)`,
              }}
            >
              <button
                type="button"
                onClick={() => openActivity(a)}
                className="min-w-0 flex-1 truncate py-1 pl-1.5 text-left text-[11px] font-semibold leading-tight text-slate-900 hover:underline dark:text-slate-100"
                title={a.label}
              >
                <span className="block truncate">{line}</span>
              </button>
              <button
                type="button"
                aria-label="Chiudi avviso"
                onClick={(e) => {
                  e.stopPropagation();
                  persistDismiss(a.dismissKey);
                }}
                className="shrink-0 self-center rounded-md p-0.5 text-slate-600/80 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
