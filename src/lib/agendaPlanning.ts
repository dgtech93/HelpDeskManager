import { getPlanningRowSearchBlob } from "@/lib/planningCellText";
import { consolidatePlanningPayloadFieldMap, planningFieldIsActive } from "@/lib/presetCatalog";
import type { PlanningActivityStored, PlanningActivityTypeDef, PlanningStateDef } from "@/types";
import type { PlanningCatalogBundle } from "@/lib/planningCatalogOptions";

export type AgendaEventSource = "reminder" | "range" | "field";

export type AgendaCalendarEvent = {
  id: string;
  activityId: string;
  /** Tipo attività (colore distintivo). */
  activityTypeId: string;
  typeName: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  source: AgendaEventSource;
  /** Colore bordo HSL (tonalità). */
  hue: number;
};

const REMINDER_BLOCK_MS = 60 * 60 * 1000;

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** Parse data/ora come salvata in pianificazione (ISO o solo `YYYY-MM-DD` in locale). */
export function parsePlanningDateTime(raw: string): Date | null {
  const t = raw.trim();
  if (!t) return null;
  const iso = new Date(t);
  if (!Number.isNaN(iso.getTime())) return iso;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const day = Number(m[3]);
    const d = new Date(y, mo, day, 0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function hueForActivityType(typeId: string): number {
  let h = 216;
  for (let i = 0; i < typeId.length; i++) h = (h * 31 + typeId.charCodeAt(i)) >>> 0;
  return h % 360;
}

function buildTitle(
  a: PlanningActivityStored,
  types: PlanningActivityTypeDef[],
  bundle: PlanningCatalogBundle | null,
  planningStates: PlanningStateDef[],
): string {
  const t = types.find((x) => x.id === a.activityTypeId);
  const name = (t?.name ?? "").trim() || "Attività";
  const blob = getPlanningRowSearchBlob(a, types, bundle, planningStates).trim();
  if (!blob) return name;
  const short = blob.length > 90 ? `${blob.slice(0, 87)}…` : blob;
  return `${name} — ${short}`;
}

/**
 * Genera segmenti calendario: campi data/datetime sul tipo, promemoria (`reminderAt`), intervallo `startDate`–`endDate`.
 */
export function buildAgendaCalendarEvents(
  activities: PlanningActivityStored[],
  types: PlanningActivityTypeDef[],
  bundle: PlanningCatalogBundle | null,
  planningStates: PlanningStateDef[],
): AgendaCalendarEvent[] {
  const out: AgendaCalendarEvent[] = [];

  for (const a of activities) {
    const t = types.find((x) => x.id === a.activityTypeId);
    if (!t) continue;

    const p = a.payload ?? {};
    const hue = hueForActivityType(t.id);
    const title = buildTitle(a, types, bundle, planningStates);
    const typeName = (t.name ?? "").trim() || "Senza nome";

    const fieldMap = consolidatePlanningPayloadFieldMap(p);
    for (const f of t.fields) {
      if (!planningFieldIsActive(f)) continue;
      if (f.kind === "datetime") {
        const raw = fieldMap[f.id];
        const ts = typeof raw === "string" ? raw.trim() : "";
        if (!ts) continue;
        const start = new Date(ts);
        if (Number.isNaN(start.getTime())) continue;
        const end = new Date(start.getTime() + REMINDER_BLOCK_MS);
        out.push({
          id: `${a.id}::field:${f.id}`,
          activityId: a.id,
          activityTypeId: t.id,
          typeName,
          title,
          start,
          end,
          allDay: false,
          source: "field",
          hue,
        });
        continue;
      }
      if (f.kind === "date") {
        const raw = fieldMap[f.id];
        const ds = typeof raw === "string" ? raw.trim() : "";
        if (!ds) continue;
        const d0 = parsePlanningDateTime(ds);
        if (!d0) continue;
        const rangeStart = startOfLocalDay(d0);
        const rangeEnd = endOfLocalDay(d0);
        out.push({
          id: `${a.id}::field:${f.id}`,
          activityId: a.id,
          activityTypeId: t.id,
          typeName,
          title,
          start: rangeStart,
          end: rangeEnd,
          allDay: true,
          source: "field",
          hue,
        });
      }
    }

    const rem = typeof p.reminderAt === "string" ? p.reminderAt.trim() : "";
    if (rem) {
      const start = new Date(rem);
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start.getTime() + REMINDER_BLOCK_MS);
        out.push({
          id: `${a.id}::reminder`,
          activityId: a.id,
          activityTypeId: t.id,
          typeName,
          title,
          start,
          end,
          allDay: false,
          source: "reminder",
          hue,
        });
      }
    }

    const sd = typeof p.startDate === "string" ? p.startDate.trim() : "";
    const ed = typeof p.endDate === "string" ? p.endDate.trim() : "";
    const dStart = sd ? parsePlanningDateTime(sd) : null;
    if (dStart) {
      const dEndRaw = ed ? parsePlanningDateTime(ed) : null;
      const rangeStart = startOfLocalDay(dStart);
      const rangeEnd = endOfLocalDay(dEndRaw ?? dStart);
      if (rangeEnd.getTime() >= rangeStart.getTime()) {
        out.push({
          id: `${a.id}::range`,
          activityId: a.id,
          activityTypeId: t.id,
          typeName,
          title,
          start: rangeStart,
          end: rangeEnd,
          allDay: true,
          source: "range",
          hue,
        });
      }
    }
  }

  return out.sort((x, y) => x.start.getTime() - y.start.getTime());
}

/** Evento visibile in un intervallo [rangeStart, rangeEnd] (inclusi). */
export function eventIntersectsRange(ev: AgendaCalendarEvent, rangeStart: Date, rangeEnd: Date): boolean {
  return ev.start.getTime() <= rangeEnd.getTime() && ev.end.getTime() >= rangeStart.getTime();
}

export function eventsForLocalDay(events: AgendaCalendarEvent[], day: Date): AgendaCalendarEvent[] {
  const a = startOfLocalDay(day);
  const b = endOfLocalDay(day);
  return events.filter((ev) => eventIntersectsRange(ev, a, b));
}
