import type { PlanningActivityStored, PlanningActivityTypeDef, PlanningStateDef } from "@/types";
import type { PlanningCatalogBundle } from "@/lib/planningCatalogOptions";
import { getPlanningRowSearchBlob, getVisibleReminderSidebarFieldsText } from "@/lib/planningCellText";

export const PLANNING_REMINDER_ALERT_DISMISSALS_LS = "rdp-manager:planning-reminder-alert-dismissals:v1";

/** Dopo il salvataggio impostazioni preavvisi, la sidebar può aggiornarsi subito. */
export const PLANNING_REMINDER_PRE_ALERT_SETTINGS_CHANGED = "rdp:planning-reminder-pre-alert-changed";

/** Dopo creazione/modifica attività di pianificazione (stesso DB che alimenta i promemoria). */
export const PLANNING_ACTIVITIES_CHANGED_EVENT = "rdp:planning-activities-changed";

export function dispatchPlanningActivitiesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PLANNING_ACTIVITIES_CHANGED_EVENT));
}

/** Soglie standard suggerite in UI (dalla più lontana alla più vicina). */
export const STANDARD_PLANNING_REMINDER_PRE_ALERT_MINUTES = [
  7 * 24 * 60, // 1 settimana
  2 * 24 * 60, // 2 giorni
  24 * 60, // 1 giorno
  60, // 1 ora
  30,
  5,
  1,
] as const;

/** Default applicato se non c’è nulla di valido in impostazioni. */
export const DEFAULT_PLANNING_REMINDER_PRE_ALERT_MINUTES = [...STANDARD_PLANNING_REMINDER_PRE_ALERT_MINUTES];

const MAX_BEFORE_MINUTES = 366 * 24 * 60;

export function sanitizePlanningReminderPreAlertMinutes(raw: unknown): number[] {
  const xs: number[] = [];
  const arr = Array.isArray(raw) ? raw : DEFAULT_PLANNING_REMINDER_PRE_ALERT_MINUTES.slice();
  for (const x of arr) {
    const n =
      typeof x === "number" && Number.isFinite(x)
        ? Math.round(x)
        : typeof x === "string"
          ? Math.round(Number(x.trim()))
          : NaN;
    if (!Number.isFinite(n) || n < 1 || n > MAX_BEFORE_MINUTES) continue;
    xs.push(n);
  }
  const uniq = [...new Set(xs)].sort((a, b) => b - a);
  return uniq.length ? uniq : [...DEFAULT_PLANNING_REMINDER_PRE_ALERT_MINUTES];
}

export function digestPlanningReminderPreAlertMinutes(rows: number[]): string {
  return JSON.stringify([...sanitizePlanningReminderPreAlertMinutes(rows)]);
}

/** Titolo riga compatto per la sidebar (tipo + anteprima). */
export function buildPlanningActivityReminderTitle(
  a: PlanningActivityStored,
  types: PlanningActivityTypeDef[],
  bundle: PlanningCatalogBundle | null,
  planningStates: PlanningStateDef[],
): string {
  const t = types.find((x) => x.id === a.activityTypeId);
  const name = (t?.name ?? "").trim() || "Attività";
  const blob = getPlanningRowSearchBlob(a, types, bundle, planningStates).trim();
  if (!blob) return name;
  const short = blob.length > 80 ? `${blob.slice(0, 77)}…` : blob;
  return `${name} — ${short}`;
}

export function reminderDismissKey(activityId: string, reminderAtMs: number, beforeMinutes: number): string {
  return `${activityId}|${reminderAtMs}|${beforeMinutes}`;
}

export function parseDismissedReminderKeys(raw: string | null): Set<string> {
  if (!raw) return new Set<string>();
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return new Set<string>();
    const keys = (o as { keys?: unknown }).keys;
    if (!Array.isArray(keys)) return new Set<string>();
    return new Set(keys.filter((k): k is string => typeof k === "string" && k.length > 0));
  } catch {
    return new Set<string>();
  }
}

export function serializeDismissedReminderKeys(keys: Set<string>): string {
  return JSON.stringify({ keys: [...keys] });
}

/** Elimina dall’insieme le chiavi il cui promemoria è già passato. */
export function pruneExpiredReminderDismissKeys(keys: Set<string>, nowMs: number): Set<string> {
  const out = new Set<string>();
  for (const k of keys) {
    const parts = k.split("|");
    if (parts.length !== 3) continue;
    const remMs = Number(parts[1]);
    if (!Number.isFinite(remMs) || nowMs >= remMs) continue;
    out.add(k);
  }
  return out;
}

export type ActiveReminderPreAlert = {
  dismissKey: string;
  activityId: string;
  activityTypeId: string;
  label: string;
  reminderAtMs: number;
  beforeMinutes: number;
};

/**
 * Al più un alert per attività: tra le soglie ancora valide, si usa la più “vicina” (minuti prima più piccoli),
 * così le finestre non si sovrappongono come righe duplicate. Ordine dismiss: chiudi il più interno,
 * poi rientra il successivo livello.
 */
export function computeActiveReminderPreAlerts(
  nowMs: number,
  activities: PlanningActivityStored[],
  types: PlanningActivityTypeDef[],
  beforeMinutesSortedDesc: number[],
  dismissed: Set<string>,
  bundle: PlanningCatalogBundle | null,
  planningStates: PlanningStateDef[],
): ActiveReminderPreAlert[] {
  const out: ActiveReminderPreAlert[] = [];
  const typeById = new Map(types.map((t) => [t.id, t]));
  const sortedAsc = [...beforeMinutesSortedDesc].sort((a, b) => a - b);

  for (const a of activities) {
    const t = typeById.get(a.activityTypeId);
    if (!t?.showReminder) continue;
    const remRaw = typeof a.payload?.reminderAt === "string" ? a.payload.reminderAt.trim() : "";
    if (!remRaw) continue;
    const rem = new Date(remRaw);
    if (Number.isNaN(rem.getTime())) continue;
    const remMs = rem.getTime();

    // Scaduto: nessun alert
    if (nowMs >= remMs) continue;

    const label = buildPlanningSidebarReminderPreviewLine(a, types, bundle, planningStates, remMs, nowMs);

    for (const beforeMin of sortedAsc) {
      const startMs = remMs - beforeMin * 60_000;
      if (nowMs < startMs || nowMs >= remMs) continue;
      const dk = reminderDismissKey(a.id, remMs, beforeMin);
      if (dismissed.has(dk)) continue;
      out.push({
        dismissKey: dk,
        activityId: a.id,
        activityTypeId: a.activityTypeId,
        label,
        reminderAtMs: remMs,
        beforeMinutes: beforeMin,
      });
      break;
    }
  }

  out.sort((x, y) => x.reminderAtMs - y.reminderAtMs || x.beforeMinutes - y.beforeMinutes);
  return out;
}

/** Etichetta soglia configurata (solo lettura UI). */
export function formatReminderPreAlertBeforeIt(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % (7 * 24 * 60) === 0) {
    const w = minutes / (7 * 24 * 60);
    return w === 1 ? "1 settimana" : `${w} settimane`;
  }
  const h = minutes / 60;
  if (h < 24 && Number.isInteger(h)) return h === 1 ? "1 h" : `${h} h`;
  if (minutes % (24 * 60) === 0) {
    const d = minutes / (24 * 60);
    return d === 1 ? "1 giorno" : `${d} giorni`;
  }
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

/** Delta fino al promemoria (stringa leggibile italiana corta). */
export function formatTimeUntilReminderIt(remMs: number, nowMs: number): string {
  const d = Math.max(0, remMs - nowMs);
  const m = Math.floor(d / 60_000);
  if (m < 60) return m <= 1 ? "meno di 1 min" : `tra circa ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return h === 1 ? "tra circa 1 h" : `tra circa ${h} h`;
  const days = Math.floor(h / 24);
  return days === 1 ? "tra circa 1 giorno" : `tra circa ${days} giorni`;
}

/**
 * Countdown fino a `remMs`: parti `d-h-m-s` / `h-m-s` / `m-s` / `s` a seconda di quanto manca.
 */
export function formatReminderCountdown(remMs: number, nowMs: number): string {
  const d = Math.max(0, remMs - nowMs);
  const dayMs = 86_400_000;
  const hourMs = 3_600_000;
  const minuteMs = 60_000;

  if (d >= dayMs) {
    const days = Math.floor(d / dayMs);
    const h = Math.floor((d % dayMs) / hourMs);
    const m = Math.floor((d % hourMs) / minuteMs);
    const s = Math.floor((d % minuteMs) / 1000);
    return `${days}d - ${h}h - ${m}m - ${s}s`;
  }
  if (d >= hourMs) {
    const h = Math.floor(d / hourMs);
    const m = Math.floor((d % hourMs) / minuteMs);
    const s = Math.floor((d % minuteMs) / 1000);
    return `${h}h - ${m}m - ${s}s`;
  }
  if (d >= minuteMs) {
    const m = Math.floor(d / minuteMs);
    const s = Math.floor((d % minuteMs) / 1000);
    return `${m}m - ${s}s`;
  }
  const s = Math.floor(d / 1000);
  return `${s}s`;
}

/** Riga sidebar promemoria: countdown + solo campi con flag «Info visibile nel Promemoria». */
export function buildPlanningSidebarReminderPreviewLine(
  a: PlanningActivityStored,
  types: PlanningActivityTypeDef[],
  bundle: PlanningCatalogBundle | null,
  planningStates: PlanningStateDef[],
  reminderAtMs: number,
  nowMs: number,
): string {
  const countdown = formatReminderCountdown(reminderAtMs, nowMs);
  const fieldBlob = getVisibleReminderSidebarFieldsText(a, types, bundle, planningStates).trim();
  if (!fieldBlob) return countdown;
  return `${countdown} · ${fieldBlob}`;
}
