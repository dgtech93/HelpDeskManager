import { Calendar } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Valore formato `yyyy-MM-dd` come per `<input type="date">`. */
export type IsoDateString = string;

function parseYm(iso: string): { y: number; m0: number } | null {
  const t = iso.trim();
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return null;
  return { y, m0: mo - 1 };
}

/** Giorni nel mese (m0 = 0..11). */
function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function weekLabels(): string[] {
  return ["L", "M", "M", "G", "V", "S", "D"];
}

/** Calendario a comparsa + campo data manuale. */
export function FriendlyDateInput({
  value,
  onChange,
  className,
  inputClassName,
  disabled,
}: {
  value: string;
  onChange: (isoDate: IsoDateString) => void;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const cursor = parseYm(value || "");
  const today = useMemo(() => new Date(), []);
  const [viewY, setViewY] = useState(cursor?.y ?? today.getFullYear());
  const [viewM0, setViewM0] = useState(cursor?.m0 ?? today.getMonth());

  useEffect(() => {
    const p = parseYm(value || "");
    if (p) {
      setViewY(p.y);
      setViewM0(p.m0);
    }
  }, [value]);

  const monthTitle = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(
        new Date(viewY, viewM0, 1),
      );
    } catch {
      return `${viewY}-${pad2(viewM0 + 1)}`;
    }
  }, [viewY, viewM0]);

  const trimmed = value.trim();
  const selDay = /^(\d{4})-(\d{2})-(\d{2})$/.test(trimmed) === true ? Number(trimmed.slice(8, 10)) : null;

  const grid = useMemo(() => {
    const firstWeekdayMon0 = ((new Date(viewY, viewM0, 1).getDay() + 6) % 7) as number; // Lun=0 … Dom=6
    const total = daysInMonth(viewY, viewM0);
    const cells: { day: number | null }[] = [];
    for (let i = 0; i < firstWeekdayMon0; i++) cells.push({ day: null });
    for (let d = 1; d <= total; d++) cells.push({ day: d });
    while (cells.length % 7 !== 0) cells.push({ day: null });
    return cells;
  }, [viewY, viewM0]);

  const pickDay = useCallback(
    (d: number) => {
      onChange(`${viewY}-${pad2(viewM0 + 1)}-${pad2(d)}`);
      setOpen(false);
    },
    [onChange, viewM0, viewY],
  );

  const goMonth = useCallback((delta: number) => {
    setViewM0((m0) => {
      const next = m0 + delta;
      const yAdj = Math.floor(next / 12);
      const mNorm = ((next % 12) + 12) % 12;
      setViewY((yy) => yy + yAdj);
      return mNorm;
    });
  }, []);

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <div className="flex gap-2">
        <input
          type="date"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClassName}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-label="Apri calendario"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900"
        >
          <Calendar size={18} />
        </button>
      </div>
      {open ? (
        <div
          className="absolute z-40 mt-2 w-[min(100vw-2rem,20rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-950"
          role="dialog"
          aria-label="Seleziona data"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              className="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              ‹
            </button>
            <span className="min-w-0 flex-1 text-center text-sm font-semibold capitalize text-slate-800 dark:text-slate-100">
              {monthTitle}
            </span>
            <button
              type="button"
              onClick={() => goMonth(1)}
              className="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase text-slate-400">
            {weekLabels().map((w, i) => (
              <div key={`${w}-${i}`} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 text-sm">
            {grid.map((c, idx) => {
              if (c.day === null) return <span key={`e-${idx}`} />;
              const d = c.day;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => pickDay(d)}
                  className={`h-9 rounded-lg hover:bg-emerald-100 hover:text-emerald-900 dark:hover:bg-emerald-950 dark:hover:text-emerald-50 ${
                    selDay === d
                      ? "bg-emerald-600 font-semibold text-white hover:bg-emerald-700 hover:text-white"
                      : "text-slate-800 dark:text-slate-200"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
