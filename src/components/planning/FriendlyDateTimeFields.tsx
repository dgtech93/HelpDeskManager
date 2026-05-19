import { AnalogClockTimeInput } from "@/components/planning/AnalogClockTimeInput";
import { FriendlyDateInput } from "@/components/planning/FriendlyDateInput";

function splitDateTimeLocal(v: string): { date: string; time: string } {
  const t = v.trim();
  if (!t) return { date: "", time: "" };
  const i = t.indexOf("T");
  if (i < 0) return { date: t.slice(0, 10), time: "" };
  const date = t.slice(0, 10);
  const timeRaw = t.slice(i + 1);
  const m = /^(\d{2}):(\d{2})/.exec(timeRaw);
  return { date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "", time: m ? `${m[1]}:${m[2]}` : "" };
}

function mergeDateTimeLocal(date: string, time: string): string {
  const d = date.trim();
  const tm = time.trim();
  if (!d && !tm) return "";
  if (!d) return "";
  if (!tm) return d;
  return `${d}T${tm}`;
}

/** Data (calendario) + ora con inserimento rapido (campo nativo e scorciatoie). */
export function FriendlyDateTimeFields({
  value,
  onChange,
  disabled,
  dateLabel,
  dateInputClassName,
}: {
  value: string;
  onChange: (datetimeLocal: string) => void;
  disabled?: boolean;
  dateLabel?: string;
  dateInputClassName?: string;
}) {
  const { date, time } = splitDateTimeLocal(value);
  const base =
    dateInputClassName ??
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800">
      <label className="flex flex-col gap-1">
        {dateLabel ? (
          <span className="text-xs font-semibold uppercase text-slate-500">{dateLabel}</span>
        ) : null}
        <FriendlyDateInput
          value={date}
          disabled={disabled}
          onChange={(d) => onChange(mergeDateTimeLocal(d, time || "00:00"))}
          inputClassName={base}
        />
      </label>
      <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
        <span className="mb-2 block text-xs font-semibold uppercase text-slate-500">Ora</span>
        <AnalogClockTimeInput
          value={time || "00:00"}
          disabled={disabled}
          inputClassName={base}
          onChange={(tm) => onChange(mergeDateTimeLocal(date, tm))}
        />
      </div>
      <p className="text-[10px] text-slate-500 dark:text-slate-500">
        Opzionale: modifica avanzata come unica riga (formato tecnico).
      </p>
      <input
        aria-label="Campo data e ora (manuale, formato tecnico)"
        type="datetime-local"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-lg border border-dashed border-slate-300 bg-transparent px-2 py-1.5 text-[11px] text-slate-500 dark:border-slate-600 ${disabled ? "opacity-50" : ""}`}
      />
    </div>
  );
}
