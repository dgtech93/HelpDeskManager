import type { AgendaHolidayEntry, AgendaSettings, AgendaWorkTimeSegment, AppSettings } from "@/types";
import { newCatalogId } from "@/lib/presetCatalog";

const WD_MON = 1;
const WD_TUE = 2;
const WD_WED = 3;
const WD_THU = 4;
const WD_FRI = 5;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Domenica=0 … Sabato=6 (JavaScript). */
export const WEEKDAY_SHORT_IT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"] as const;

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Chiave ricorrente `MM-DD` (fuso locale). */
export function localMonthDayKey(d: Date): string {
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Normalizza `MM-DD` con zeri e validazione calendario (anno bisestile 2024). */
export function normalizeMonthDay(raw: string): string | null {
  const t = raw.trim();
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(t);
  if (!m) return null;
  const mo = Number(m[1]);
  const day = Number(m[2]);
  if (!Number.isFinite(mo) || !Number.isFinite(day) || mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  const test = new Date(2024, mo - 1, day);
  if (test.getMonth() !== mo - 1 || test.getDate() !== day) return null;
  return `${pad2(mo)}-${pad2(day)}`;
}

function holidaySortKey(h: AgendaHolidayEntry): string {
  if (h.kind === "easterMonday") return "99-99";
  return h.monthDay;
}

export function sortHolidayEntries(list: AgendaHolidayEntry[]): AgendaHolidayEntry[] {
  return [...list].sort((a, b) => holidaySortKey(a).localeCompare(holidaySortKey(b)));
}

export function parseTimeToMinutes(raw: string): number | null {
  const t = raw.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/** Domenica di Pasqua (gregoriano). */
export function computeEasterSunday(y: number): Date {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

export function addDaysLocal(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

/** Preset festività Italia: date fisse ricorrenti (MM-DD) + Pasquetta (mobile). */
export function defaultItalianHolidaySeeds(): AgendaHolidayEntry[] {
  const fixed: { m: number; d: number; label: string }[] = [
    { m: 1, d: 1, label: "Capodanno" },
    { m: 1, d: 6, label: "Epifania" },
    { m: 4, d: 25, label: "Festa della Liberazione" },
    { m: 5, d: 1, label: "Festa dei Lavoratori" },
    { m: 6, d: 2, label: "Festa della Repubblica" },
    { m: 8, d: 15, label: "Ferragosto" },
    { m: 11, d: 1, label: "Ognissanti" },
    { m: 12, d: 8, label: "Immacolata Concezione" },
    { m: 12, d: 25, label: "Natale" },
    { m: 12, d: 26, label: "Santo Stefano" },
  ];
  const out: AgendaHolidayEntry[] = fixed.map((fx) => ({
    id: newCatalogId(),
    kind: "fixed" as const,
    monthDay: `${pad2(fx.m)}-${pad2(fx.d)}`,
    label: fx.label,
  }));
  out.push({
    id: newCatalogId(),
    kind: "easterMonday",
    label: "Lunedì dell'Angelo (Pasquetta)",
  });
  return sortHolidayEntries(out);
}

function migrateOneHoliday(x: unknown): AgendaHolidayEntry | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : newCatalogId();
  const label = typeof o.label === "string" ? o.label.trim() : "";

  if (o.kind === "easterMonday") {
    return {
      id,
      kind: "easterMonday",
      label: label || "Lunedì dell'Angelo (Pasquetta)",
    };
  }
  if (o.kind === "fixed" && typeof o.monthDay === "string") {
    const md = normalizeMonthDay(o.monthDay);
    if (!md) return null;
    return { id, kind: "fixed", monthDay: md, label: label || md };
  }

  const legacyDate = typeof o.date === "string" ? o.date.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(legacyDate)) {
    const md = normalizeMonthDay(legacyDate.slice(5));
    if (!md) return null;
    if (/\bpasquetta\b|luned[iì].*angelo/i.test(label)) {
      return {
        id,
        kind: "easterMonday",
        label: label || "Lunedì dell'Angelo (Pasquetta)",
      };
    }
    return { id, kind: "fixed", monthDay: md, label: label || md };
  }
  return null;
}

export function defaultAgendaSettings(): AgendaSettings {
  return {
    workWeekdayIndices: [WD_MON, WD_TUE, WD_WED, WD_THU, WD_FRI],
    workSegments: [{ start: "09:00", end: "18:00" }],
    highlightHolidaysInAgenda: true,
    highlightNonWorkingDaysInAgenda: true,
    holidays: defaultItalianHolidaySeeds(),
    blockReminderOnHolidays: false,
    blockReminderOnNonWorkingDays: false,
  };
}

export function sanitizeWorkSegments(segments: AgendaWorkTimeSegment[]): AgendaWorkTimeSegment[] {
  const cleaned = segments
    .map((s) => ({
      start: typeof s.start === "string" ? s.start.trim() : "",
      end: typeof s.end === "string" ? s.end.trim() : "",
    }))
    .map((s) => {
      const a = parseTimeToMinutes(s.start);
      const b = parseTimeToMinutes(s.end);
      if (a === null || b === null || b <= a) return null;
      return { start: `${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`, end: `${pad2(Math.floor(b / 60))}:${pad2(b % 60)}` };
    })
    .filter((x): x is AgendaWorkTimeSegment => x !== null)
    .sort((x, y) => parseTimeToMinutes(x.start)! - parseTimeToMinutes(y.start)!);
  return cleaned.length ? cleaned : [{ start: "09:00", end: "18:00" }];
}

export function sanitizeAgendaSettings(raw: Partial<AgendaSettings> | null | undefined): AgendaSettings {
  const base = defaultAgendaSettings();
  if (!raw || typeof raw !== "object") return base;

  let workWeekdayIndices = Array.isArray(raw.workWeekdayIndices)
    ? raw.workWeekdayIndices.filter((x) => typeof x === "number" && x >= 0 && x <= 6)
    : base.workWeekdayIndices;
  workWeekdayIndices = [...new Set(workWeekdayIndices)].sort((a, b) => a - b);
  if (workWeekdayIndices.length === 0) workWeekdayIndices = base.workWeekdayIndices;

  const workSegments = sanitizeWorkSegments(Array.isArray(raw.workSegments) ? raw.workSegments : base.workSegments);

  let holidaysFinal: AgendaHolidayEntry[];
  if (Array.isArray(raw.holidays)) {
    const seenFixed = new Set<string>();
    let easterAdded = false;
    const holidays: AgendaHolidayEntry[] = [];
    for (const x of raw.holidays) {
      const m = migrateOneHoliday(x);
      if (!m) continue;
      if (m.kind === "easterMonday") {
        if (easterAdded) continue;
        easterAdded = true;
        holidays.push(m);
        continue;
      }
      if (seenFixed.has(m.monthDay)) continue;
      seenFixed.add(m.monthDay);
      holidays.push(m);
    }
    holidaysFinal = sortHolidayEntries(holidays);
  } else {
    holidaysFinal = base.holidays;
  }

  return {
    workWeekdayIndices,
    workSegments,
    highlightHolidaysInAgenda: raw.highlightHolidaysInAgenda !== false,
    highlightNonWorkingDaysInAgenda: raw.highlightNonWorkingDaysInAgenda !== false,
    holidays: holidaysFinal,
    blockReminderOnHolidays: raw.blockReminderOnHolidays === true,
    blockReminderOnNonWorkingDays: raw.blockReminderOnNonWorkingDays === true,
  };
}

export function digestAgendaSettings(raw: AgendaSettings | null | undefined): string {
  return JSON.stringify(sanitizeAgendaSettings(raw ?? undefined));
}

export function normalizeAgendaSettingsFromApp(raw: AppSettings | null | undefined): AgendaSettings {
  return sanitizeAgendaSettings(raw?.agendaSettings ?? undefined);
}
