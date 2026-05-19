import { useRef } from "react";
import { AlarmClock } from "lucide-react";
import * as api from "@/lib/api";
import {
  STANDARD_PLANNING_REMINDER_PRE_ALERT_MINUTES,
  formatReminderPreAlertBeforeIt,
  sanitizePlanningReminderPreAlertMinutes,
} from "@/lib/planningReminderPreAlert";

const QUICK_PRESETS: { label: string; minutes: number }[] = [
  { label: "+ 1 settimana", minutes: STANDARD_PLANNING_REMINDER_PRE_ALERT_MINUTES[0]! },
  { label: "+ 2 giorni", minutes: STANDARD_PLANNING_REMINDER_PRE_ALERT_MINUTES[1]! },
  { label: "+ 1 giorno", minutes: STANDARD_PLANNING_REMINDER_PRE_ALERT_MINUTES[2]! },
  { label: "+ 1 ora", minutes: STANDARD_PLANNING_REMINDER_PRE_ALERT_MINUTES[3]! },
  { label: "+ 30 min", minutes: STANDARD_PLANNING_REMINDER_PRE_ALERT_MINUTES[4]! },
  { label: "+ 5 min", minutes: STANDARD_PLANNING_REMINDER_PRE_ALERT_MINUTES[5]! },
  { label: "+ 1 min", minutes: STANDARD_PLANNING_REMINDER_PRE_ALERT_MINUTES[6]! },
];

export type PlanningReminderPreAlertSetupSectionProps = {
  value: number[];
  onChange: (next: number[]) => void;
  /** `finalMinutes` include eventuali «Altri min» ancora nell’input al momento del salvataggio. */
  onSave: (finalMinutes: number[]) => void | Promise<void>;
  saving?: boolean;
};

export function PlanningReminderPreAlertSetupSection({
  value,
  onChange,
  onSave,
  saving = false,
}: PlanningReminderPreAlertSetupSectionProps) {
  const list = sanitizePlanningReminderPreAlertMinutes(value);
  const customMinutesRef = useRef<HTMLInputElement>(null);

  const addMinutes = (m: number) => {
    if (!Number.isFinite(m) || m < 1 || m > 527040) return;
    const next = sanitizePlanningReminderPreAlertMinutes([...list, m]);
    onChange(next);
  };

  const mergeCustomDraft = (): number[] => {
    const el = customMinutesRef.current;
    const raw = el?.value.trim() ?? "";
    if (!raw) return sanitizePlanningReminderPreAlertMinutes(list);
    const v = Math.round(Number(raw.replace(",", ".")));
    if (!Number.isFinite(v) || v < 1 || v > 527040) return sanitizePlanningReminderPreAlertMinutes(list);
    const merged = sanitizePlanningReminderPreAlertMinutes([...list, v]);
    if (el) el.value = "";
    onChange(merged);
    return merged;
  };

  const handleSave = () => void onSave(mergeCustomDraft());

  return (
    <div className="mt-8 space-y-4 rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50/50 via-white to-white p-4 shadow-inner dark:border-amber-900/50 dark:from-amber-950/20 dark:via-slate-950 dark:to-slate-900/70 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <AlarmClock size={20} className="text-amber-600 dark:text-amber-400" aria-hidden />
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Preavvisi promemoria (sidebar)</h3>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Prima della data/ora del <strong className="text-slate-800 dark:text-slate-100">promemoria</strong> dell&apos;
        attività compare un&apos;anteprima in una riga in basso nel menu (clic per aprire il form dell&apos;
        attività). Puoi impostare <strong>più soglie</strong> successive. Chiudi manualmente gli avvisi o lasciali
        scomparire allo scadere del promemoria.{' '}
        <span className="font-medium text-slate-700 dark:text-slate-300">
          Valori nella casella «Altri min» inclusi quando premi Salva.
        </span>
      </p>

      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Minuti prima del promemoria
        </span>
        <ul className="space-y-2">
          {list.map((m, i) => (
            <li key={`${m}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950/80">
              <span className="min-w-0 flex-1 font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">
                {formatReminderPreAlertBeforeIt(m)} <span className="font-sans font-normal text-slate-500">({m} min)</span>
              </span>
              <button
                type="button"
                disabled={list.length <= 1}
                onClick={() => onChange(sanitizePlanningReminderPreAlertMinutes(list.filter((_, j) => j !== i)))}
                className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40 dark:border-slate-600 dark:text-rose-300 dark:hover:bg-rose-950/40"
              >
                Rimuovi
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_PRESETS.map((p) => (
          <button
            key={p.minutes}
            type="button"
            onClick={() => addMinutes(p.minutes)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {p.label}
          </button>
        ))}
        <label className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-600">
          <span className="text-slate-500">Altri min</span>
          <input
            ref={customMinutesRef}
            type="number"
            min={1}
            max={527040}
            placeholder="es. 120"
            className="w-24 rounded-md border border-slate-200 px-2 py-1 font-mono text-xs dark:border-slate-600 dark:bg-slate-950"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              addMinutes(Number((e.target as HTMLInputElement).value));
              (e.target as HTMLInputElement).value = "";
            }}
          />
          <button
            type="button"
            onClick={() => addMinutes(Number(customMinutesRef.current?.value))}
            className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/40"
          >
            Aggiungi
          </button>
        </label>
      </div>

      <button
        type="button"
        disabled={saving || !api.isTauriRuntime()}
        onClick={() => void handleSave()}
        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {saving ? "Salvataggio…" : "Salva preavvisi"}
      </button>
    </div>
  );
}
