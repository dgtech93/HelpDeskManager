import { useState } from "react";
import { CalendarDays } from "lucide-react";
import type { AgendaHolidayEntry, AgendaSettings, AgendaWorkTimeSegment } from "@/types";
import { AgendaHolidaysEditorDialog } from "@/components/AgendaHolidaysEditorDialog";
import { WEEKDAY_SHORT_IT, defaultItalianHolidaySeeds, sortHolidayEntries } from "@/lib/agendaSettings";

/** Ordine visualizzazione: lun … dom (indici JS `Date#getDay()`, dom=0). */
const WEEK_ROW_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function cloneAgendaDraft(s: AgendaSettings): AgendaSettings {
  return {
    ...s,
    workWeekdayIndices: [...s.workWeekdayIndices],
    workSegments: s.workSegments.map((x) => ({ ...x })),
    holidays: s.holidays.map((x) => ({ ...x })),
  };
}

function mergeHolidayPreset(existing: AgendaHolidayEntry[], preset: AgendaHolidayEntry[]): AgendaHolidayEntry[] {
  const keyOf = (h: AgendaHolidayEntry) => (h.kind === "easterMonday" ? "easterMonday" : `fixed:${h.monthDay}`);
  const map = new Map(existing.map((h) => [keyOf(h), { ...h }]));
  for (const h of preset) {
    const k = keyOf(h);
    if (!map.has(k)) map.set(k, { ...h });
  }
  return sortHolidayEntries([...map.values()]);
}

export type PlanningAgendaSetupSectionProps = {
  value: AgendaSettings;
  onChange: (next: AgendaSettings) => void;
  onSaveCatalog: () => void | Promise<void>;
  saving?: boolean;
};

/** Blocco Agenda nel setup pianificazione (solo bozza locale finché non premi Salva). */
export function PlanningAgendaSetupSection({
  value,
  onChange,
  onSaveCatalog,
  saving = false,
}: PlanningAgendaSetupSectionProps) {
  const [holidaysOpen, setHolidaysOpen] = useState(false);

  const toggleDay = (dow: number) => {
    onChange({
      ...value,
      workWeekdayIndices: value.workWeekdayIndices.includes(dow)
        ? value.workWeekdayIndices.filter((x) => x !== dow).sort((a, b) => a - b)
        : [...value.workWeekdayIndices, dow].sort((a, b) => a - b),
    });
  };

  const patchSegment = (i: number, patch: Partial<AgendaWorkTimeSegment>) => {
    onChange({
      ...value,
      workSegments: value.workSegments.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    });
  };

  const addSegment = () => {
    onChange({
      ...value,
      workSegments: [...value.workSegments, { start: "13:00", end: "14:00" }],
    });
  };

  const removeSegment = (i: number) => {
    onChange({ ...value, workSegments: value.workSegments.filter((_, j) => j !== i) });
  };

  return (
    <div className="mt-8 space-y-4 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/40 via-white to-slate-50/80 p-4 shadow-inner dark:border-emerald-900/60 dark:from-emerald-950/20 dark:via-slate-950 dark:to-slate-900/70 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays size={22} className="text-emerald-600 dark:text-emerald-400" aria-hidden />
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Agenda — calendario lavorativo</h3>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Controlla fasce e festivi anche nelle viste giorno/settimana/mese. I blocchi su promemoria e campi{" "}
        <strong className="text-slate-800 dark:text-slate-100">data e ora</strong> si applicano al salvataggio
        dall&apos;app Pianificazione o Agenda.
      </p>

      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Giorni lavorativi</span>
        <div className="flex flex-wrap gap-2">
          {WEEK_ROW_ORDER.map((d) => (
            <label
              key={d}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm dark:border-slate-600 dark:bg-slate-950"
            >
              <input
                type="checkbox"
                className="rounded border-slate-300 text-emerald-600"
                checked={value.workWeekdayIndices.includes(d)}
                onChange={() => toggleDay(d)}
              />
              <span>{WEEKDAY_SHORT_IT[d]}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Fasce orarie nel giorno
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            Una fascia continua (es. 9–18 senza pausa) o più fasce separate (pausa pranzo).
          </span>
        </div>
        <div className="space-y-2">
          {value.workSegments.map((seg, si) => (
            <div
              key={`${seg.start}-${seg.end}-${si}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 dark:border-slate-600 dark:bg-slate-950/80"
            >
              <label className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500">Da</span>
                <input
                  type="time"
                  step={300}
                  value={seg.start}
                  onChange={(e) => patchSegment(si, { start: e.target.value })}
                  className="rounded-md border border-slate-200 px-2 py-1 font-mono text-sm dark:border-slate-600 dark:bg-slate-950"
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500">A</span>
                <input
                  type="time"
                  step={300}
                  value={seg.end}
                  onChange={(e) => patchSegment(si, { end: e.target.value })}
                  className="rounded-md border border-slate-200 px-2 py-1 font-mono text-sm dark:border-slate-600 dark:bg-slate-950"
                />
              </label>
              {value.workSegments.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeSegment(si)}
                  className="ml-auto rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-slate-600 dark:text-rose-300 dark:hover:bg-rose-950/40"
                >
                  Rimuovi
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={addSegment}
            className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-white dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            + Aggiungi fascia oraria
          </button>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-3 dark:border-slate-700 dark:bg-slate-950/70">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-slate-300 text-emerald-600"
          checked={value.highlightHolidaysInAgenda}
          onChange={(e) => onChange({ ...value, highlightHolidaysInAgenda: e.target.checked })}
        />
        <span className="text-sm text-slate-800 dark:text-slate-100">
          <strong>Evidenzia festivi</strong> nei calendari quando sono definiti nell&apos;elenco.
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-3 dark:border-slate-700 dark:bg-slate-950/70">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-slate-300 text-emerald-600"
          checked={value.highlightNonWorkingDaysInAgenda}
          onChange={(e) => onChange({ ...value, highlightNonWorkingDaysInAgenda: e.target.checked })}
        />
        <span className="text-sm text-slate-800 dark:text-slate-100">
          <strong>Evidenzia giorni non lavorativi</strong> (giorni fuori dalla settimana selezionata e/o giorni nell&apos;elenco
          festivi).
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-3 dark:border-rose-900/50 dark:bg-rose-950/30">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-slate-300 text-rose-600"
          checked={value.blockReminderOnHolidays}
          onChange={(e) => onChange({ ...value, blockReminderOnHolidays: e.target.checked })}
        />
        <span className="text-sm text-slate-800 dark:text-slate-100">
          <strong>Non permettere pianificazione nei giorni festivi</strong>: promemoria e campi <em>data e ora</em> bloccati se la
          data coincide con il calendario festività.
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-3 dark:border-rose-900/50 dark:bg-rose-950/30">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-slate-300 text-rose-600"
          checked={value.blockReminderOnNonWorkingDays}
          onChange={(e) => onChange({ ...value, blockReminderOnNonWorkingDays: e.target.checked })}
        />
        <span className="text-sm text-slate-800 dark:text-slate-100">
          <strong>Non permettere pianificazione nei giorni non lavorativi</strong>: giorni fuori settimana, festivi configurati ed
          orari fuori fasce.
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setHolidaysOpen(true)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          Gestisci giorni festivi…
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, holidays: mergeHolidayPreset(value.holidays, defaultItalianHolidaySeeds()) })}
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-50 dark:hover:bg-amber-900/40"
        >
          Aggiungi festività Italia (preset)
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void onSaveCatalog()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          Salva configurazione Agenda
        </button>
      </div>

      <AgendaHolidaysEditorDialog
        open={holidaysOpen}
        holidays={value.holidays}
        onClose={() => setHolidaysOpen(false)}
        onApply={(next) => onChange({ ...value, holidays: next })}
      />
    </div>
  );
}
