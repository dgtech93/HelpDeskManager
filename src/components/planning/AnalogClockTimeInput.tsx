import { useMemo, useState } from "react";

function parseHm(t: string): { h: number; m: number } {
  const s = t.trim();
  if (!s) return { h: 0, m: 0 };
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return { h: 9, m: 0 };
  let hh = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mi)) return { h: 9, m: 0 };
  hh = (((hh % 24) + 24) % 24) | 0;
  const mins = (((mi % 60) + 60) % 60) | 0;
  return { h: hh, m: mins };
}

function formatHm(h: number, mi: number): string {
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

const QUICK_TIMES = ["08:00", "09:00", "12:00", "12:30", "13:30", "17:00", "18:00"];

type Props = {
  value: string;
  onChange: (hhmm: string) => void;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
};

/** Ora 24h: campo nativo + digitazione rapida HH.MM + scorciatoie. */
export function AnalogClockTimeInput({ value, onChange, disabled, className, inputClassName }: Props) {
  const { h: hour24, m: minute } = useMemo(() => parseHm(value), [value]);
  const display = formatHm(hour24, minute);
  const [typeText, setTypeText] = useState("");

  const applyTypedTime = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const m = /^(\d{1,2})[.:](\d{2})$/.exec(t);
    if (m) {
      let hh = Number(m[1]);
      const mi = Number(m[2]);
      if (!Number.isFinite(hh) || !Number.isFinite(mi)) return;
      hh = Math.min(23, Math.max(0, hh));
      const mins = Math.min(59, Math.max(0, mi));
      onChange(formatHm(hh, mins));
      setTypeText("");
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[8.5rem] flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Orario
          </span>
          <input
            type="time"
            step={60}
            disabled={disabled}
            value={display}
            onChange={(ev) => onChange(ev.target.value)}
            className={inputClassName}
          />
        </label>
        <label className="flex min-w-[6.5rem] flex-1 flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Digita (es. 14.30)
          </span>
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            placeholder="14:30"
            value={typeText}
            onChange={(e) => setTypeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyTypedTime(typeText);
              }
            }}
            onBlur={() => applyTypedTime(typeText)}
            className={inputClassName}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_TIMES.map((t) => (
          <button
            key={t}
            type="button"
            disabled={disabled}
            onClick={() => onChange(t)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold tabular-nums transition ${
              display === t
                ? "border-violet-500 bg-violet-600/15 text-violet-950 dark:bg-violet-950/55 dark:text-violet-50"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
