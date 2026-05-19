import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { ClipboardList, X } from "lucide-react";
import { toast } from "sonner";
import { buildPayload, type Scratch } from "@/components/PlanningActivityEditorModal";
import type { PlanningCatalogBundle } from "@/lib/planningCatalogOptions";
import { validatePlanningScratchInputs } from "@/lib/presetCatalog";
import {
  buildPlanningPasteColumns,
  parsePlanningPasteRow,
  payloadsFromPasteScratchRows,
  splitPastedLines,
  PLANNING_BULK_SEPARATOR_OPTIONS,
  type PlanningBulkColumnSeparator,
} from "@/lib/planningBulkPaste";
import type {
  PlanningActivityPayload,
  PlanningActivityTypeDef,
  PlanningStateDef,
} from "@/types";

type Props = {
  open: boolean;
  onClose: () => void;
  typeDef: PlanningActivityTypeDef;
  bundle: PlanningCatalogBundle;
  planningStates: PlanningStateDef[];
  busy?: boolean;
  onInsert: (payloads: PlanningActivityPayload[]) => Promise<void>;
};

export function PlanningBulkInsertDialog({
  open,
  onClose,
  typeDef,
  bundle,
  planningStates,
  busy,
  onInsert,
}: Props) {
  const [text, setText] = useState("");
  const [skipHeader, setSkipHeader] = useState(false);
  const [columnSeparator, setColumnSeparator] = useState<PlanningBulkColumnSeparator>("tab");

  const cols = useMemo(() => buildPlanningPasteColumns(typeDef), [typeDef]);

  const parsed = useMemo(() => {
    if (!open || !text.trim()) return [] as ReturnType<typeof parsePlanningPasteRow>[];
    let grid = splitPastedLines(text, columnSeparator);
    if (skipHeader && grid.length > 1) grid = grid.slice(1);
    else if (skipHeader && grid.length === 1) grid = [];

    return grid.map((cells, i) =>
      parsePlanningPasteRow({
        rowIndex: i + 1,
        cells,
        cols,
        typeDef,
        bundle,
        planningStates,
      }),
    );
  }, [open, text, skipHeader, columnSeparator, cols, typeDef, bundle, planningStates]);

  const goodRows = useMemo(
    () => parsed.filter((r): r is Extract<(typeof parsed)[number], { ok: true }> => r.ok),
    [parsed],
  );
  const badRows = useMemo(() => parsed.filter((r) => !r.ok) as { ok: false; rowIndex: number; error: string }[], [parsed]);

  const requirementErrors = useMemo(() => {
    const out: { row: number; errs: string[] }[] = [];
    for (const r of goodRows) {
      const errs = validatePlanningScratchInputs(typeDef, r.scratch as Record<string, unknown>);
      if (errs.length) out.push({ row: r.rowIndex, errs });
    }
    return out;
  }, [goodRows, typeDef]);

  const readyPayloads = useMemo(() => {
    const skipped = new Set(requirementErrors.map((e) => e.row));
    const okScratches = goodRows.filter((r) => !skipped.has(r.rowIndex)).map((r) => r.scratch as Scratch);
    return payloadsFromPasteScratchRows(typeDef, okScratches, buildPayload);
  }, [goodRows, requirementErrors, typeDef]);

  const blockedByRequirements = requirementErrors.length;

  if (!open) return null;

  const separatorHint =
    PLANNING_BULK_SEPARATOR_OPTIONS.find((o) => o.value === columnSeparator)?.label ?? "Tab";

  const hint =
    cols.length === 0
      ? "Questo tipo non ha colonne incollabili (configura i campi in Impostazioni)."
      : `Ordine colonne (${cols.length}), separate da «${separatorHint}»: ${cols.map((c) => c.label).join(" → ")}`;

  const submit = async () => {
    if (!text.trim()) {
      toast.error("Incolla prima i dati.");
      return;
    }
    if (badRows.length > 0) {
      toast.error(`Correggi ${badRows.length} riga/e con errore prima di continuare.`);
      return;
    }
    if (blockedByRequirements > 0) {
      toast.error(
        `${blockedByRequirements} riga/e non rispettano i campi obbligatori del tipo (vedi evidenziazione).`,
      );
      return;
    }
    if (readyPayloads.length === 0) {
      toast.error("Nessuna riga valida da importare.");
      return;
    }
    try {
      await onInsert(readyPayloads);
      setText("");
      onClose();
    } catch {
      /* toast dal genitore */
    }
  };

  return (
    <div className="fixed inset-0 z-[58] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[2px] sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-ins-title"
        className="flex max-h-[min(92vh,880px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-700 dark:text-emerald-300">
                <ClipboardList size={22} aria-hidden />
              </span>
              <div>
                <h2 id="bulk-ins-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  Inserimento massivo
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Tipo «{(typeDef.name || "").trim() || "—"}». Incolla righe (es. da Excel) e scegli il separatore delle colonne.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={() => {
              if (!busy) onClose();
            }}
            disabled={busy}
            className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{hint}</p>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <label className="flex min-w-[12rem] max-w-xs flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                Separatore colonne
              </span>
              <select
                value={columnSeparator}
                disabled={busy}
                onChange={(e) => setColumnSeparator(e.target.value as PlanningBulkColumnSeparator)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-900"
              >
                {PLANNING_BULK_SEPARATOR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 sm:pb-2">
              Nel riquadro sotto il tasto <kbd className="rounded border border-slate-300 bg-slate-100 px-1 font-mono text-[10px] dark:border-slate-600 dark:bg-slate-800">Tab</kbd> inserisce
              una tabulazione (&quot;passa alla colonna&quot;); non porta il fuoco ai pulsanti.
            </p>
          </div>
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              className="rounded border-slate-300 text-emerald-600"
              checked={skipHeader}
              onChange={(e) => setSkipHeader(e.target.checked)}
            />
            Salta prima riga (intestazioni)
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              e.preventDefault();
              const ta = e.currentTarget;
              const start = ta.selectionStart ?? 0;
              const end = ta.selectionEnd ?? 0;

              if (e.shiftKey) {
                if (start !== end || start < 1 || text.slice(start - 1, start) !== "\t") return;
                const next = text.slice(0, start - 1) + text.slice(start);
                flushSync(() => setText(next));
                ta.setSelectionRange(start - 1, start - 1);
                return;
              }

              const next = text.slice(0, start) + "\t" + text.slice(end);
              flushSync(() => setText(next));
              const pos = start + 1;
              ta.setSelectionRange(pos, pos);
            }}
            spellCheck={false}
            disabled={busy}
            placeholder={`Incolla qui (Cmd/Ctrl+V)…`}
            rows={10}
            className="scrollbar-violet-subtle mb-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 shadow-inner focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />

          <div className="grid gap-2 text-xs">
            <p className="font-semibold text-slate-800 dark:text-slate-200">Anteprima righe</p>
            <p className="text-slate-500 dark:text-slate-400">
              {parsed.length === 0
                ? "Nessuna riga nel testo."
                : `${goodRows.length} parsate ok · ${badRows.length} errore/i · ${blockedByRequirements} con requisiti mancanti · ${readyPayloads.length} pronte da importare`}
            </p>
            {badRows.slice(0, 8).map((br) => (
              <div
                key={br.rowIndex}
                className="rounded-lg border border-rose-200/90 bg-rose-50 px-3 py-2 text-rose-900 dark:border-rose-900/55 dark:bg-rose-950/40 dark:text-rose-100"
              >
                Riga {br.rowIndex}: {br.error}
              </div>
            ))}
            {requirementErrors.slice(0, 8).map((re) => (
              <div
                key={re.row}
                className="rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-900/55 dark:bg-amber-950/45 dark:text-amber-50"
              >
                Riga {re.row}: {re.errs.join(" · ")}
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!busy) onClose();
            }}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={busy || cols.length === 0 || readyPayloads.length === 0 || badRows.length > 0 || blockedByRequirements > 0}
            onClick={() => void submit()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-45"
          >
            {busy ? "Importazione…" : `Importa ${readyPayloads.length} attività`}
          </button>
        </div>
      </div>
    </div>
  );
}
