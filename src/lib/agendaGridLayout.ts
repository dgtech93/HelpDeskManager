import { findHolidayOnDate } from "@/lib/agendaRules";
import type { AgendaSettings } from "@/types";
import { parseTimeToMinutes } from "@/lib/agendaSettings";
import type { AgendaCalendarEvent } from "@/lib/agendaPlanning";
import { eventsForLocalDay, isSameLocalDay } from "@/lib/agendaPlanning";

export const AGENDA_DEFAULT_PX_PER_HOUR = 56;

const DISPLAY_DAY_START_MIN = 0;
const DISPLAY_DAY_END_MIN = 24 * 60;

/** Offset verticale iniziale (px) verso la prima fascia lavorativa, con margine sopra (~2 ore). */
export function agendaTimelineInitialScrollTopPx(agenda: AgendaSettings, pxPerHour: number): number {
  let minStartMin: number | null = null;
  for (const s of agenda.workSegments) {
    const a = parseTimeToMinutes(s.start);
    if (a !== null && (minStartMin === null || a < minStartMin)) minStartMin = a;
  }
  const anchorMin = minStartMin ?? 9 * 60;
  const contextMarginHours = 2;
  return Math.max(0, (anchorMin / 60 - contextMarginHours) * pxPerHour);
}

/** Rettangoli verticali (%) sulla timeline 00–24 — ore fuori dalla `workSegments` o giorno del tutto non lavorativo. */
export function shadeOffTimelinePercents(day: Date, agenda: AgendaSettings): { topPct: number; heightPct: number }[] {
  const displayStartMin = DISPLAY_DAY_START_MIN;
  const displayEndMin = DISPLAY_DAY_END_MIN;
  const span = displayEndMin - displayStartMin;
  if (span <= 0) return [];

  const notWorkCalendarDay =
    !agenda.workWeekdayIndices.includes(day.getDay()) || findHolidayOnDate(day, agenda.holidays) !== null;

  const toPct = (t0: number, t1: number) => {
    const lo = Math.max(t0, displayStartMin);
    const hi = Math.min(t1, displayEndMin);
    if (hi <= lo) return null;
    return {
      topPct: ((lo - displayStartMin) / span) * 100,
      heightPct: ((hi - lo) / span) * 100,
    };
  };

  if (notWorkCalendarDay) {
    const p = toPct(displayStartMin, displayEndMin);
    return p ? [p] : [];
  }

  const clipped = agenda.workSegments
    .map((s) => {
      const a = parseTimeToMinutes(s.start);
      const b = parseTimeToMinutes(s.end);
      if (a === null || b === null || b <= a) return null;
      return {
        a: Math.max(a, displayStartMin),
        b: Math.min(b, displayEndMin),
      };
    })
    .filter((x): x is { a: number; b: number } => x !== null && x.b > x.a)
    .sort((x, y) => x.a - y.a);

  const merged: { a: number; b: number }[] = [];
  for (const seg of clipped) {
    const last = merged[merged.length - 1];
    if (!last) merged.push(seg);
    else if (seg.a <= last.b) last.b = Math.max(last.b, seg.b);
    else merged.push(seg);
  }

  const out: { topPct: number; heightPct: number }[] = [];
  let t = displayStartMin;
  for (const seg of merged) {
    const pGap = toPct(t, seg.a);
    if (pGap) out.push(pGap);
    t = Math.max(t, seg.b);
  }
  const pTail = toPct(t, displayEndMin);
  if (pTail) out.push(pTail);
  return out;
}

/** Stessa logica di {@link shadeOffTimelinePercents} ma in pixel (layout assoluto affidabile in WebView / flex). */
export function shadeOffTimelinePx(
  day: Date,
  agenda: AgendaSettings,
  totalTimelinePx: number,
): { topPx: number; heightPx: number }[] {
  if (totalTimelinePx <= 0) return [];
  return shadeOffTimelinePercents(day, agenda).map((s) => ({
    topPx: (s.topPct / 100) * totalTimelinePx,
    heightPx: Math.max(1, (s.heightPct / 100) * totalTimelinePx),
  }));
}

/** Eventi da disporre nella colonna tempo (promemoria e campi datetime), stesso giorno locale. */
export function timedAgendaEventsForDay(events: AgendaCalendarEvent[], day: Date): AgendaCalendarEvent[] {
  return eventsForLocalDay(events, day).filter((ev) => !ev.allDay);
}

/** Minuti [start,end) nel giorno locale, stessa logica della colonna oraria. */
export function timedSegmentMinutesOnDay(ev: AgendaCalendarEvent, dayAnchor: Date): { start: number; end: number } | null {
  if (!isSameLocalDay(ev.start, dayAnchor) || ev.allDay) return null;

  const displayStartMin = DISPLAY_DAY_START_MIN;
  const displayEndMin = DISPLAY_DAY_END_MIN;
  const span = displayEndMin - displayStartMin;
  if (span <= 0) return null;

  const evStartMin = ev.start.getHours() * 60 + ev.start.getMinutes();
  const maxEndSameDayMin = Math.min(displayEndMin, 24 * 60);
  const rawEndMs = Math.max(ev.end.getTime(), ev.start.getTime() + 60000);
  const evEndDay = new Date(rawEndMs);
  const clipEndSameDay =
    isSameLocalDay(evEndDay, dayAnchor)
      ? evEndDay.getHours() * 60 + evEndDay.getMinutes()
      : maxEndSameDayMin;

  const segStart = Math.max(evStartMin, displayStartMin);
  const segEnd = Math.min(Math.max(segStart + 15, clipEndSameDay), displayEndMin);
  if (segEnd <= segStart) return null;
  return { start: segStart, end: segEnd };
}

function segmentsOverlapMinutes(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

type SegWithEv = {
  ev: AgendaCalendarEvent;
  seg: { start: number; end: number };
};

export type TimedOverlapLayout = {
  eventId: string;
  topPct: number;
  heightPct: number;
  leftPct: number;
  widthPct: number;
};

/** Layout per eventi orari nello stesso giorno: colonne affiancate quando si sovrappongono nel tempo. */
export function timedOverlapLayoutsForDay(timedEvents: AgendaCalendarEvent[], anchorDay: Date): TimedOverlapLayout[] {
  const displayStartMin = DISPLAY_DAY_START_MIN;
  const displayEndMin = DISPLAY_DAY_END_MIN;
  const span = displayEndMin - displayStartMin;
  if (span <= 0) return [];

  const segs: SegWithEv[] = [];
  for (const ev of timedEvents) {
    const seg = timedSegmentMinutesOnDay(ev, anchorDay);
    if (seg) segs.push({ ev, seg });
  }
  if (segs.length === 0) return [];

  const n = segs.length;
  const parent = segs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (segmentsOverlapMinutes(segs[i].seg, segs[j].seg)) union(i, j);
    }
  }

  const roots = new Map<number, SegWithEv[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const list = roots.get(r);
    if (list) list.push(segs[i]);
    else roots.set(r, [segs[i]]);
  }

  const byId = new Map<string, TimedOverlapLayout>();

  for (const group of roots.values()) {
    const sorted = [...group].sort((a, b) => {
      const ds = a.seg.start - b.seg.start;
      if (ds !== 0) return ds;
      return b.seg.end - a.seg.end;
    });

    const laneEndMs: number[] = [];
    const colForIndex: number[] = [];

    for (let gi = 0; gi < sorted.length; gi++) {
      const { seg } = sorted[gi];
      let col = laneEndMs.findIndex((end) => end <= seg.start);
      if (col === -1) {
        laneEndMs.push(seg.end);
        col = laneEndMs.length - 1;
      } else {
        laneEndMs[col] = seg.end;
      }
      colForIndex[gi] = col;
    }

    const numLanes = laneEndMs.length;

    for (let gi = 0; gi < sorted.length; gi++) {
      const { ev, seg } = sorted[gi];
      const c = colForIndex[gi];
      const topPct = ((seg.start - displayStartMin) / span) * 100;
      const heightPct = Math.max(((seg.end - seg.start) / span) * 100, 1);
      byId.set(ev.id, {
        eventId: ev.id,
        topPct,
        heightPct,
        leftPct: (100 * c) / numLanes,
        widthPct: 100 / numLanes,
      });
    }
  }

  return timedEvents
    .map((ev) => byId.get(ev.id))
    .filter((x): x is TimedOverlapLayout => x !== undefined);
}

/** Posizionamento verticale nell’asse timeline 00–24; eventi lunghi sono tagliati alla mezzanotte locale. */
export function timedEventTimelineLayout(ev: AgendaCalendarEvent, dayAnchor: Date): {
  topPct: number;
  heightPct: number;
} | null {
  const seg = timedSegmentMinutesOnDay(ev, dayAnchor);
  if (!seg) return null;

  const displayStartMin = DISPLAY_DAY_START_MIN;
  const displayEndMin = DISPLAY_DAY_END_MIN;
  const span = displayEndMin - displayStartMin;
  if (span <= 0) return null;

  const topPct = ((seg.start - displayStartMin) / span) * 100;
  const heightPct = Math.max(((seg.end - seg.start) / span) * 100, 1);
  return { topPct, heightPct };
}

export function iterateDisplayHours(): number[] {
  const out: number[] = [];
  for (let h = 0; h < 24; h++) out.push(h);
  return out;
}
