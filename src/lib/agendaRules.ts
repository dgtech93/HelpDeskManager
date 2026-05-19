import type { AgendaHolidayEntry, AgendaSettings } from "@/types";
import {
  addDaysLocal,
  computeEasterSunday,
  localDateKey,
  localMonthDayKey,
  parseTimeToMinutes,
} from "@/lib/agendaSettings";

export function findHolidayOnDate(date: Date, holidays: AgendaHolidayEntry[]): AgendaHolidayEntry | null {
  const y = date.getFullYear();
  const pasquetta = addDaysLocal(computeEasterSunday(y), 1);
  const pasqKey = localDateKey(pasquetta);
  const dayKey = localDateKey(date);
  const md = localMonthDayKey(date);

  for (const h of holidays) {
    if (h.kind === "fixed" && h.monthDay === md) return h;
    if (h.kind === "easterMonday" && dayKey === pasqKey) return h;
  }
  return null;
}
/** Giorno con orario tipo 9–18 nei giorni di settimana configurati escluso se festivo nell'elenco. */
export function isCalendarWorkingDay(date: Date, agenda: AgendaSettings): boolean {
  if (!agenda.workWeekdayIndices.includes(date.getDay())) return false;
  if (findHolidayOnDate(date, agenda.holidays)) return false;
  return true;
}

function minutesOverlapWorkSegments(day: Date, agenda: AgendaSettings): boolean {
  if (agenda.workSegments.length === 0) return true;
  const mins = day.getHours() * 60 + day.getMinutes();
  for (const s of agenda.workSegments) {
    const a = parseTimeToMinutes(s.start);
    const b = parseTimeToMinutes(s.end);
    if (a !== null && b !== null && mins >= a && mins < b) return true;
  }
  return false;
}

/**
 * Validazione data/ora per promemoria (e campi datetime simili).
 * blockReminderOnHolidays: blocca se la data è un festivo in elenco.
 * blockReminderOnNonWorkingDays: blocca se non è giorno lavorativo (settimana + festivi) o se l'ora è fuori dalle fasce.
 */
export function agendaViolationForDateTime(iso: string, agenda: AgendaSettings): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const hol = findHolidayOnDate(d, agenda.holidays);
  if (agenda.blockReminderOnHolidays && hol) {
    return `La data coincide con un giorno festivo (${hol.label}).`;
  }

  if (!agenda.blockReminderOnNonWorkingDays) return null;

  const weekdayOk = agenda.workWeekdayIndices.includes(d.getDay());
  if (!weekdayOk) {
    return "La data rientra in un giorno non lavorativo (settimana) secondo il setup Agenda.";
  }
  if (hol) {
    return `La data coincide con un giorno festivo configurato nell'agenda (${hol.label}).`;
  }
  if (!minutesOverlapWorkSegments(d, agenda)) {
    return "L'orario è fuori dalle fasce lavorative configurate nell'agenda.";
  }
  return null;
}

export type AgendaCalendarTone = "none" | "holiday" | "off";

/** Tinta per celle mese/settimana: priorità evidenziazione festivo, poi giorno non lavorativo. */
export function agendaCalendarTone(day: Date, agenda: AgendaSettings): AgendaCalendarTone {
  const holidayEntry = findHolidayOnDate(day, agenda.holidays);
  const isHolidayDate = holidayEntry !== null;
  const isWorkedDay = agenda.workWeekdayIndices.includes(day.getDay()) && !isHolidayDate;
  const nonWorked = !isWorkedDay;
  if (agenda.highlightHolidaysInAgenda && isHolidayDate) return "holiday";
  if (agenda.highlightNonWorkingDaysInAgenda && nonWorked) return "off";
  return "none";
}
