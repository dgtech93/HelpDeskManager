import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { AgendaHolidayEntry } from "@/types";
import { newCatalogId } from "@/lib/presetCatalog";
import {
  defaultAgendaSettings,
  normalizeMonthDay,
  sanitizeAgendaSettings,
  sortHolidayEntries,
} from "@/lib/agendaSettings";

const MONTHS_IT = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
] as const;

function parseMonthDayParts(monthDay: string): { month: number; day: number } | null {
  const n = normalizeMonthDay(monthDay);
  if (!n) return null;
  const [ma, da] = n.split("-").map(Number);
  if (!ma || !da) return null;
  return { month: ma, day: da };
}

function formatMonthDayIt(monthDay: string): string {
  const p = parseMonthDayParts(monthDay);
  if (!p) return monthDay;
  return `${p.day} ${MONTHS_IT[p.month - 1] ?? ""}`.trim();
}

export type AgendaHolidaysEditorDialogProps = {
  open: boolean;
  holidays: AgendaHolidayEntry[];
  onClose: () => void;
  onApply: (next: AgendaHolidayEntry[]) => void;
};

/** Dialog modifica elenco giorni festivi ricorrenti (giorno/mese + Pasquetta mobile). */
export function AgendaHolidaysEditorDialog({ open, holidays, onClose, onApply }: AgendaHolidaysEditorDialogProps) {
  const [draft, setDraft] = useState<AgendaHolidayEntry[]>([]);

  useEffect(() => {
    if (open) setDraft(holidays.map((h) => ({ ...h })));
  }, [open, holidays]);

  const dupFixed = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of draft) {
      if (h.kind !== "fixed") continue;
      const k = h.monthDay.trim();
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  }, [draft]);

  const dupEaster = useMemo(() => draft.filter((h) => h.kind === "easterMonday").length > 1, [draft]);

  const sortedDraft = useMemo(() => sortHolidayEntries(draft), [draft]);

  if (!open) return null;

  const hasBlockingErrors = dupFixed.length > 0 || dupEaster;

  const apply = () => {
    const cleanedRaw: AgendaHolidayEntry[] = [];
    for (const h of draft) {
      if (h.kind === "easterMonday") {
        cleanedRaw.push({
          id: h.id.trim() ? h.id.trim() : newCatalogId(),
          kind: "easterMonday",
          label: (h.label || "").trim() || "Lunedì dell'Angelo (Pasquetta)",
        });
        continue;
      }
      const md = normalizeMonthDay(h.monthDay);
      if (!md) continue;
      cleanedRaw.push({
        id: h.id.trim() ? h.id.trim() : newCatalogId(),
        kind: "fixed",
        monthDay: md,
        label: ((h.label || "").trim() || formatMonthDayIt(md)).trim(),
      });
    }
    const next = sanitizeAgendaSettings({
      ...defaultAgendaSettings(),
      holidays: cleanedRaw,
    }).holidays;
    onApply(next);
    onClose();
  };

  const addFixed = () => {
    const md = normalizeMonthDay("01-01")!;
    setDraft((xs) => [...xs, { id: newCatalogId(), kind: "fixed", monthDay: md, label: "" }]);
  };

  const addPasquetta = () => {
    if (draft.some((h) => h.kind === "easterMonday")) return;
    setDraft((xs) => [
      ...xs,
      {
        id: newCatalogId(),
        kind: "easterMonday",
        label: "Lunedì dell'Angelo (Pasquetta)",
      },
    ]);
  };

  return (
    <div className="fixed inset-0 z-[66] flex items-center justify-center bg-black/45 p-3 sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agenda-holidays-title"
        className="flex max-h-[min(90vh,760px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 id="agenda-holidays-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Giorni festivi nell&apos;agenda
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Inserisci solo <strong className="text-slate-700 dark:text-slate-200">giorno e mese</strong>: valgono per tutti gli anni. Per il
              lunedì dopo Pasqua usa la riga dedicata (data mobile). Le modifiche restano in bozza finché non premi «Salva configurazione Agenda»
              nella stessa sezione.
            </p>
          </div>
          <button
            type="button"
            aria-label="Chiudi"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-900"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 scrollbar-violet-subtle">
          {dupFixed.length ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
              Combinazioni giorno/mese duplicate: {dupFixed.map(formatMonthDayIt).join(", ")}
            </p>
          ) : null}
          {dupEaster ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
              Può esserci una sola voce «Pasquetta» (lunedì dopo Pasqua).
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2">Giorno e mese</th>
                  <th className="px-3 py-2">Etichetta</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {sortedDraft.map((row) =>
                  row.kind === "easterMonday" ? (
                    <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2 align-middle">
                        <div className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-2 text-xs font-medium text-violet-900 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-100">
                          Lunedì dopo Pasqua{" "}
                          <span className="block text-[10px] font-normal opacity-90">(calcolo automatico ogni anno)</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <input
                          value={row.label}
                          onChange={(e) =>
                            setDraft((xs) =>
                              xs.map((r) => (r.id === row.id && r.kind === "easterMonday" ? { ...r, label: e.target.value } : r)),
                            )
                          }
                          placeholder="Nome festivo"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
                        />
                      </td>
                      <td className="align-middle px-2 py-2">
                        <button
                          type="button"
                          aria-label="Elimina Pasquetta"
                          onClick={() => setDraft((xs) => xs.filter((r) => r.id !== row.id))}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-rose-50 dark:border-slate-600 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2 align-middle">
                        {(() => {
                          const parts = parseMonthDayParts(row.monthDay);
                          const month = parts?.month ?? 1;
                          const day = parts?.day ?? 1;
                          const setMd = (mo: number, da: number) => {
                            const lastDay = new Date(2024, mo, 0).getDate();
                            const d = Math.min(Math.max(1, da), lastDay);
                            const md = normalizeMonthDay(`${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
                            if (!md) return;
                            setDraft((xs) =>
                              xs.map((r) => (r.id === row.id && r.kind === "fixed" ? { ...r, monthDay: md } : r)),
                            );
                          };
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={month}
                                onChange={(e) => setMd(Number(e.target.value), day)}
                                className="min-w-[7rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
                              >
                                {MONTHS_IT.map((lab, i) => (
                                  <option key={lab} value={i + 1}>
                                    {lab}
                                  </option>
                                ))}
                              </select>
                              <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                                <span className="font-semibold">Giorno</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={31}
                                  value={day}
                                  onChange={(e) => {
                                    const n = Number(e.target.value);
                                    if (!Number.isFinite(n)) return;
                                    setMd(month, Math.min(31, Math.max(1, Math.round(n))));
                                  }}
                                  className="w-14 rounded-lg border border-slate-200 px-2 py-1 font-mono text-sm dark:border-slate-600 dark:bg-slate-950"
                                />
                              </label>
                              <span className="text-[10px] text-slate-500">({formatMonthDayIt(row.monthDay)})</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <input
                          value={row.label}
                          onChange={(e) =>
                            setDraft((xs) =>
                              xs.map((r) => (r.id === row.id && r.kind === "fixed" ? { ...r, label: e.target.value } : r)),
                            )
                          }
                          placeholder="Nome festivo"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
                        />
                      </td>
                      <td className="align-middle px-2 py-2">
                        <button
                          type="button"
                          aria-label="Elimina festivo"
                          onClick={() => setDraft((xs) => xs.filter((r) => r.id !== row.id))}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-rose-50 dark:border-slate-600 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addFixed}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-600 dark:bg-slate-900"
            >
              <Plus size={16} aria-hidden /> Aggiungi festivo (giorno/mese)
            </button>
            <button
              type="button"
              onClick={addPasquetta}
              disabled={draft.some((h) => h.kind === "easterMonday")}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-950 disabled:opacity-45 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100"
            >
              <Plus size={16} aria-hidden /> Aggiungi Pasquetta (mobile)
            </button>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50/90 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/70">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold dark:border-slate-600"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={hasBlockingErrors}
            onClick={apply}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-45"
          >
            Applica in bozza
          </button>
        </div>
      </div>
    </div>
  );
}
