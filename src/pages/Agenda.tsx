import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import { AppPageHeader } from "@/components/layout/AppPageChrome";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import type { PlanningActivityPayload, PlanningActivityStored, PlanningActivityTypeDef, PlanningStateDef, AgendaSettings } from "@/types";
import type { PlanningCatalogBundle } from "@/lib/planningCatalogOptions";
import { dispatchPlanningActivitiesChanged } from "@/lib/planningReminderPreAlert";
import { PlanningActivityEditorModal } from "@/components/PlanningActivityEditorModal";
import { cn } from "@/lib/utils";
import {
  addDays,
  buildAgendaCalendarEvents,
  eventsForLocalDay,
  hueForActivityType,
  isSameLocalDay,
  startOfLocalDay,
  endOfLocalDay,
  type AgendaCalendarEvent,
} from "@/lib/agendaPlanning";
import {
  AGENDA_DEFAULT_PX_PER_HOUR,
  agendaTimelineInitialScrollTopPx,
  iterateDisplayHours,
  shadeOffTimelinePx,
  timedAgendaEventsForDay,
  timedOverlapLayoutsForDay,
} from "@/lib/agendaGridLayout";
import { normalizeAgendaSettingsFromApp } from "@/lib/agendaSettings";
import { agendaCalendarTone, findHolidayOnDate } from "@/lib/agendaRules";

type AgendaViewMode = "day" | "week" | "month";

function startOfWeekMon(d: Date): Date {
  const day = (d.getDay() + 6) % 7;
  return addDays(startOfLocalDay(d), -day);
}

function endOfWeekMon(d: Date): Date {
  return endOfLocalDay(addDays(startOfWeekMon(d), 6));
}

function getMonthGridCells(anchorInMonth: Date): { date: Date; inMonth: boolean }[] {
  const y = anchorInMonth.getFullYear();
  const m = anchorInMonth.getMonth();
  const first = new Date(y, m, 1);
  const startDow = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -startDow);
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    cells.push({ date: d, inMonth: d.getMonth() === m });
  }
  return cells;
}

function fmtRangeTitle(mode: AgendaViewMode, cursor: Date): string {
  if (mode === "day") {
    return cursor.toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  if (mode === "week") {
    const a = startOfWeekMon(cursor);
    const b = addDays(a, 6);
    return `${a.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} — ${b.toLocaleDateString("it-IT", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  }
  return cursor.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

function navStep(cursor: Date, mode: AgendaViewMode, delta: -1 | 1): Date {
  if (mode === "day") return addDays(cursor, delta);
  if (mode === "week") return addDays(cursor, delta * 7);
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const start = new Date(y, m + delta, 1, 12, 0, 0);
  const day = cursor.getDate();
  const dim = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  start.setDate(Math.min(day, dim));
  return start;
}

function useDarkHtmlClass(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function useNowTicker(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function EventPill({
  ev,
  dark,
  compact,
  className,
  onOpen,
}: {
  ev: AgendaCalendarEvent;
  dark: boolean;
  compact?: boolean;
  /** Es. absolute nel layout ora. */
  className?: string;
  onOpen: () => void;
}) {
  const timeLabel = ev.allDay
    ? "Tutto il giorno"
    : ev.start.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const bg = dark ? `hsla(${ev.hue}, 52%, 36%, .42)` : `hsla(${ev.hue}, 78%, 90%, .98)`;
  const border = `hsl(${ev.hue} 65% ${dark ? 55 : 40}%)`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={ev.title}
      aria-label={`Apri modifica attività: ${ev.typeName}`}
      className={cn(
        "w-full rounded-md px-2 py-1 text-left text-[11px] font-medium leading-snug shadow-sm backdrop-blur-sm transition",
        compact && "line-clamp-2 min-h-0 text-[10px] py-px",
        "hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 dark:hover:brightness-110",
        className,
      )}
      style={{
        backgroundColor: bg,
        borderLeft: `3px solid ${border}`,
      }}
    >
      {!ev.allDay && (
        <span className="mr-1 font-bold tabular-nums text-slate-700 dark:text-slate-100">{timeLabel}</span>
      )}
      {ev.allDay && (
        <span className="mr-1 rounded bg-black/10 px-1 py-px text-[10px] font-bold uppercase tracking-wide dark:bg-white/10">
          {timeLabel}
        </span>
      )}
      <span className={cn(ev.allDay && "inline", "text-slate-900 dark:text-slate-50")}>{ev.title}</span>
    </button>
  );
}

function fractionOfNowInTimeline(now: Date): number {
  const cur = now.getHours() * 60 + now.getMinutes();
  return cur / (24 * 60);
}

function dayContainedInDisplayedWeek(day: Date, weekCursor: Date): boolean {
  const t = day.getTime();
  return t >= startOfWeekMon(weekCursor).getTime() && t <= endOfWeekMon(weekCursor).getTime();
}

function agendaToneCardClass(tone: ReturnType<typeof agendaCalendarTone>): string {
  if (tone === "holiday") {
    return "border-amber-200/90 bg-amber-50/60 dark:border-amber-800/70 dark:bg-amber-950/35";
  }
  if (tone === "off") {
    return "border-slate-200/90 bg-slate-100/85 dark:border-slate-700 dark:bg-slate-800/45";
  }
  return "border-slate-200 dark:border-slate-700";
}

function AgendaTimeGridBody({
  anchorDay,
  agenda,
  eventsAll,
  dark,
  clock,
  showNowLine,
  onOpenActivity,
}: {
  anchorDay: Date;
  agenda: AgendaSettings;
  eventsAll: AgendaCalendarEvent[];
  dark: boolean;
  clock: Date;
  showNowLine: boolean;
  onOpenActivity: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hours = iterateDisplayHours();
  const px = AGENDA_DEFAULT_PX_PER_HOUR;
  const totalPx = hours.length * px;
  const shadeRects = shadeOffTimelinePx(anchorDay, agenda, totalPx);
  const timed = useMemo(() => timedAgendaEventsForDay(eventsAll, anchorDay), [eventsAll, anchorDay]);
  const allDay = eventsForLocalDay(eventsAll, anchorDay).filter((e) => e.allDay);
  const nowFrac = showNowLine && isSameLocalDay(anchorDay, clock) ? fractionOfNowInTimeline(clock) : null;

  const overlapLayouts = useMemo(() => timedOverlapLayoutsForDay(timed, anchorDay), [timed, anchorDay]);
  const overlapById = useMemo(() => new Map(overlapLayouts.map((x) => [x.eventId, x])), [overlapLayouts]);

  const workSegmentsKey = useMemo(() => JSON.stringify(agenda.workSegments), [agenda.workSegments]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = agendaTimelineInitialScrollTopPx(agenda, px);
  }, [anchorDay.getTime(), workSegmentsKey, px]);

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      {allDay.length > 0 ? (
        <div className="border-b border-slate-200/70 bg-slate-50/70 px-1.5 py-1.5 dark:border-slate-700 dark:bg-slate-900/50">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tutto il giorno</div>
          <div className="mt-1 space-y-1">
            {allDay.map((ev) => (
              <EventPill
                key={ev.id}
                ev={ev}
                dark={dark}
                compact
                onOpen={() => onOpenActivity(ev.activityId)}
              />
            ))}
          </div>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className="relative max-h-[36rem] min-h-[14rem] overflow-y-auto overscroll-y-contain"
      >
        <div className="relative min-h-0 overflow-x-auto">
          <div className="flex min-w-0">
            <div className="sticky left-0 z-[6] w-11 shrink-0 border-r border-slate-200/90 bg-white/95 pb-0 pt-0 text-right dark:border-slate-700 dark:bg-slate-950/90">
              {hours.map((h) => (
                <div
                  key={h}
                  style={{ height: px }}
                  className="flex items-start justify-end pr-1 text-[10px] font-semibold tabular-nums text-slate-500 dark:text-slate-400"
                >
                  <span className="-translate-y-1">{h}</span>
                </div>
              ))}
            </div>
          <div
            className="relative isolate min-h-0 min-w-0 flex-1"
            style={{ height: totalPx }}
          >
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: px }}
                className="border-b border-slate-100/90 dark:border-slate-800/80"
              />
            ))}
            <div className="pointer-events-none absolute inset-0 z-[2]">
              {shadeRects.map((s, i) => (
                <div
                  key={i}
                  className="absolute inset-x-0 bg-slate-200/70 dark:bg-slate-800/70"
                  style={{ top: s.topPx, height: s.heightPx }}
                />
              ))}
              {nowFrac != null ? (
                <div className="absolute inset-x-0 z-10" aria-hidden style={{ top: `${nowFrac * 100}%` }}>
                  <div className="relative flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full bg-emerald-500 shadow-lg ring-2 ring-white dark:ring-slate-900" />
                    <div className="h-px flex-1 bg-emerald-500 shadow-sm" />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="absolute inset-0 z-[5] px-0.5">
              {timed.map((ev) => {
                const layout = overlapById.get(ev.id);
                if (!layout) return null;
                const hPct = Math.max(layout.heightPct, 3.25);
                return (
                  <div
                    key={ev.id}
                    className="absolute box-border px-0.5"
                    style={{
                      top: `${layout.topPct}%`,
                      height: `${hPct}%`,
                      minHeight: 26,
                      left: `${layout.leftPct}%`,
                      width: `${layout.widthPct}%`,
                    }}
                  >
                    <EventPill ev={ev} dark={dark} compact className="h-full min-h-[26px]" onOpen={() => onOpenActivity(ev.activityId)} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        </div>
        {timed.length === 0 && allDay.length === 0 ? (
          <p className="px-4 py-5 text-center text-[11px] text-slate-500 dark:text-slate-400">
            Nessuna attività oraria per questo giorno.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function AgendaPage() {
  const dark = useDarkHtmlClass();
  const [busy, setBusy] = useState(true);
  const [types, setTypes] = useState<PlanningActivityTypeDef[]>([]);
  const [activities, setActivities] = useState<PlanningActivityStored[]>([]);
  const [planningStates, setPlanningStates] = useState<PlanningStateDef[]>([]);
  const [bundle, setBundle] = useState<PlanningCatalogBundle | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<PlanningActivityStored | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const [view, setView] = useState<AgendaViewMode>("month");
  const [cursor, setCursor] = useState(() => new Date());

  const clock = useNowTicker(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!api.isTauriRuntime()) {
        setBusy(false);
        return;
      }
      setBusy(true);
      try {
        const [settings, clients, collaborators, contacts, roles] = await Promise.all([
          api.getSettings(),
          api.getClientsAll(),
          api.getCollaborators(),
          api.getAllContacts(),
          api.getCollaboratorRoles(),
        ]);
        if (cancelled) return;
        setTypes(settings.planningActivityTypes ?? []);
        setActivities(settings.planningActivities ?? []);
        setPlanningStates(settings.planningStates ?? []);
        setBundle({ settings, clients, collaborators, contacts, roles });
      } catch (e) {
        if (!cancelled) toast.error(formatErr(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const events = useMemo(
    () => buildAgendaCalendarEvents(activities, types, bundle, planningStates),
    [activities, types, bundle, planningStates],
  );

  const agenda = useMemo(() => normalizeAgendaSettingsFromApp(bundle?.settings ?? null), [bundle?.settings]);

  const dayTone = useMemo(() => agendaCalendarTone(cursor, agenda), [cursor, agenda]);

  const openActivityEditor = (activityId: string) => {
    const row = activities.find((a) => a.id === activityId);
    if (!row) {
      toast.error("Attività non trovata.");
      return;
    }
    if (!bundle) {
      toast.error("Dati non ancora caricati.");
      return;
    }
    setEditingActivity(row);
    setEditorOpen(true);
  };

  const persistActivities = async (next: PlanningActivityStored[], msg = "Aggiornato") => {
    try {
      await api.updateSettings({ planningActivities: next });
      const settings = await api.getSettings();
      setTypes(settings.planningActivityTypes ?? []);
      setActivities(settings.planningActivities ?? []);
      setPlanningStates(settings.planningStates ?? []);
      setBundle((bb) => (bb ? { ...bb, settings } : bb));
      toast.success(msg);
      dispatchPlanningActivitiesChanged();
    } catch (e) {
      toast.error(formatErr(e));
      throw e;
    }
  };

  const typeLegend = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of types) m.set(t.id, (t.name || "").trim() || "Senza nome");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "it"));
  }, [types]);

  const isViewingToday =
    view === "day"
      ? isSameLocalDay(cursor, clock)
      : view === "week"
        ? dayContainedInDisplayedWeek(clock, cursor)
        : clock.getFullYear() === cursor.getFullYear() && clock.getMonth() === cursor.getMonth();

  const goToday = () => setCursor(new Date());

  const weekDays = useMemo(() => {
    const s = startOfWeekMon(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [cursor]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-4 md:p-6">
      <AppPageHeader
        icon={CalendarRange}
        accent="teal"
        title="Agenda"
        description={
          <>
            Promemoria, campi <strong className="font-semibold text-slate-800 dark:text-slate-100">data</strong>/
            <strong className="font-semibold text-slate-800 dark:text-slate-100">data e ora</strong> nei tipi, e intervallo data
            inizio/fine sul payload. Colori diversi per tipo di attività.{" "}
            <span className="text-slate-500 dark:text-slate-500">Clicca un evento per aprirne il form.</span>
          </>
        }
        headerRight={
          <Link
            to="/pianificazione"
            className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900 shadow-sm hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-100 dark:hover:bg-violet-900/40"
          >
            <CalendarDays size={18} aria-hidden />
            Pianificazione
          </Link>
        }
      />

      {!api.isTauriRuntime() ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">Disponibile nell&apos;app desktop Tauri.</p>
      ) : busy ? (
        <p className="text-sm text-slate-500">Caricamento…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
            <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-600">
              {(
                [
                  ["day", "Giorno"],
                  ["week", "Settimana"],
                  ["month", "Mese"],
                ] as const
              ).map(([k, lab]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setView(k)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                    view === k
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                  )}
                >
                  {lab}
                </button>
              ))}
            </div>

            <div className="mx-1 hidden h-6 w-px bg-slate-200 sm:block dark:bg-slate-600" />

            <button
              type="button"
              onClick={() => setCursor((c) => navStep(c, view, -1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Periodo precedente"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100 dark:hover:bg-emerald-900/50"
            >
              Oggi
            </button>
            <button
              type="button"
              onClick={() => setCursor((c) => navStep(c, view, 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Periodo successivo"
            >
              <ChevronRight size={18} />
            </button>

            <div className="min-w-[12rem] flex-1 text-center sm:text-left">
              <span className="block text-base font-semibold capitalize text-slate-900 dark:text-slate-50">
                {fmtRangeTitle(view, cursor)}
              </span>
              {(view === "day" || view === "week") && (
                <span className="text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                  Ora corrente: {clock.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              {isViewingToday && (
                <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  · oggi evidenziato
                </span>
              )}
            </div>
          </div>

          {types.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Nessun tipo di attività: configuralo in Impostazioni → Setup pianificazione.
            </p>
          ) : null}

          {typeLegend.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-[11px] dark:border-slate-800 dark:bg-slate-900/50">
              <span className="font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tipi</span>
              {typeLegend.map(([tid, label]) => {
                const hue = hueForActivityType(tid);
                return (
                  <span
                    key={tid}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200/80 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950/80"
                  >
                    <span
                      className="h-2 w-2 rounded-full shadow-sm ring-1 ring-black/10"
                      style={{ background: `hsl(${hue} 70% 50%)` }}
                    />
                    <span>{label}</span>
                  </span>
                );
              })}
            </div>
          ) : null}

          {view === "month" && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
              <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px rounded-lg bg-slate-200 p-px dark:bg-slate-700">
                {getMonthGridCells(cursor).map(({ date, inMonth }) => {
                  const dayEvents = eventsForLocalDay(events, date);
                  const todayCell = isSameLocalDay(date, clock);
                  const tone = agendaCalendarTone(date, agenda);
                  const holLab = agenda.highlightHolidaysInAgenda ? findHolidayOnDate(date, agenda.holidays) : null;
                  return (
                    <div
                      key={date.toISOString()}
                      className={cn(
                        "relative min-h-[5.25rem] p-1.5",
                        !inMonth && "opacity-40",
                        tone === "holiday" || tone === "off" ? agendaToneCardClass(tone) : "bg-white dark:bg-slate-900",
                        todayCell && "ring-2 ring-emerald-500 ring-inset dark:ring-emerald-400",
                      )}
                    >
                      <div
                        className={cn(
                          "mb-0.5 text-right text-xs font-semibold tabular-nums",
                          todayCell ? "text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300",
                        )}
                      >
                        {date.getDate()}
                      </div>
                      {holLab ? (
                        <div
                          className="mb-0.5 truncate text-[9px] font-semibold leading-tight text-amber-950 dark:text-amber-100"
                          title={holLab.label}
                        >
                          {holLab.label}
                        </div>
                      ) : null}
                      <div className="flex max-h-[4rem] flex-col gap-1 overflow-hidden">
                        {dayEvents.slice(0, 4).map((ev) => (
                          <EventPill
                            key={ev.id}
                            ev={ev}
                            dark={dark}
                            compact
                            onOpen={() => openActivityEditor(ev.activityId)}
                          />
                        ))}
                        {dayEvents.length > 4 ? (
                          <span className="text-[10px] font-semibold text-slate-500">+{dayEvents.length - 4}</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === "week" && (
            <div
              className="overflow-x-scroll rounded-xl border border-slate-200 bg-white shadow-sm [scrollbar-width:thin] dark:border-slate-700 dark:bg-slate-900/75"
              style={{ scrollbarGutter: "stable" }}
            >
              <div className="grid min-w-[1200px] grid-cols-7 gap-px bg-slate-200 p-px dark:bg-slate-700">
                {weekDays.map((day) => {
                  const todayCell = isSameLocalDay(day, clock);
                  const tone = agendaCalendarTone(day, agenda);
                  const holLab = agenda.highlightHolidaysInAgenda ? findHolidayOnDate(day, agenda.holidays) : null;
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "flex min-w-0 flex-col bg-white dark:bg-slate-900",
                        tone === "holiday" || tone === "off" ? agendaToneCardClass(tone) : "",
                        todayCell && "ring-2 ring-emerald-500 ring-inset dark:ring-emerald-400",
                      )}
                    >
                      <div
                        className={cn(
                          "border-b px-2 py-2 text-center",
                          todayCell
                            ? "border-emerald-200 bg-emerald-50/90 dark:border-emerald-900 dark:bg-emerald-950/45"
                            : "border-slate-100 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/90",
                        )}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {day.toLocaleDateString("it-IT", { weekday: "short" })}
                        </div>
                        <div
                          className={cn(
                            "text-lg font-bold tabular-nums",
                            todayCell ? "text-emerald-800 dark:text-emerald-300" : "text-slate-900 dark:text-slate-50",
                          )}
                        >
                          {day.getDate()}
                        </div>
                        {holLab ? (
                          <div className="mt-0.5 truncate text-[9px] font-semibold text-amber-950 dark:text-amber-100" title={holLab.label}>
                            {holLab.label}
                          </div>
                        ) : null}
                        {todayCell ? (
                          <div className="mt-1 text-[11px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                            {clock.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex min-h-[14rem] min-w-0 flex-1 flex-col">
                        <AgendaTimeGridBody
                          anchorDay={day}
                          agenda={agenda}
                          eventsAll={events}
                          dark={dark}
                          clock={clock}
                          showNowLine
                          onOpenActivity={openActivityEditor}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === "day" && (
            <div
              className={cn(
                "relative w-full min-w-0 overflow-hidden rounded-xl border shadow-sm",
                dayTone !== "none"
                  ? agendaToneCardClass(dayTone)
                  : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/80",
              )}
            >
              <div
                className={cn(
                  "sticky top-0 z-20 border-b px-4 py-3 sm:px-6 lg:px-8",
                  isSameLocalDay(cursor, clock)
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
                    : "border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90",
                )}
              >
                <div className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {cursor.toLocaleDateString("it-IT", { weekday: "long" })}
                </div>
                <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                  {cursor.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
                </div>
                {agenda.highlightHolidaysInAgenda ? (
                  (() => {
                    const h = findHolidayOnDate(cursor, agenda.holidays);
                    return h ? (
                      <div className="mt-1 text-xs font-semibold text-amber-900 dark:text-amber-100">{h.label}</div>
                    ) : null;
                  })()
                ) : null}
                {isSameLocalDay(cursor, clock) ? (
                  <div className="mt-1 text-sm font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
                    Ora: {clock.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                ) : null}
              </div>
              <div className="bg-white dark:bg-slate-900">
                <div className="p-3 sm:p-5 lg:px-8 lg:py-5">
                  <AgendaTimeGridBody
                    anchorDay={cursor}
                    agenda={agenda}
                    eventsAll={events}
                    dark={dark}
                    clock={clock}
                    showNowLine
                    onOpenActivity={openActivityEditor}
                  />
                </div>
              </div>
            </div>
          )}

          {events.length === 0 && types.length > 0 ? (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              Nessun promemoria, campo data/datetime né intervallo date inizio/fine tra le attività. Aggiungili dalla pagina{" "}
              Pianificazione.
            </p>
          ) : null}
        </>
      )}

      {api.isTauriRuntime() && editorOpen && bundle && editingActivity ? (
        <PlanningActivityEditorModal
          key={editingActivity.id}
          open
          mode="edit"
          editing={editingActivity}
          types={types}
          bundle={bundle}
          saving={saveBusy}
          onClose={() => {
            setEditorOpen(false);
            setEditingActivity(null);
          }}
          onSaveCreate={async () => {}}
          onSaveEdit={async (id, payload) => {
            setSaveBusy(true);
            try {
              await persistActivities(
                activities.map((x) => (x.id === id ? { ...x, payload: payload as PlanningActivityPayload } : x)),
                "Attività aggiornata",
              );
            } finally {
              setSaveBusy(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
