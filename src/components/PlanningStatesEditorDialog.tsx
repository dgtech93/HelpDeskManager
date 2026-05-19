import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import { normalizePlanningState, normalizePlanningStateRows, planningStateRowTemplate, planningStatesDuplicateButtonRoleError } from "@/lib/presetCatalog";
import type { PlanningStateButtonRole, PlanningStateDef } from "@/types";

const ROLE_OPTIONS: readonly { value: PlanningStateButtonRole; label: string }[] = [
  { value: "completed", label: "Completato" },
  { value: "todo", label: "Da fare" },
  { value: "restore", label: "Ripristina stato" },
  { value: "planned", label: "Pianificato" },
];

export type PlanningStatesEditorDialogProps = {
  open: boolean;
  rows: PlanningStateDef[];
  onClose: () => void;
  onSaved?: (saved: PlanningStateDef[]) => void;
};

export function PlanningStatesEditorDialog({ open, rows, onClose, onSaved }: PlanningStatesEditorDialogProps) {
  const [draft, setDraft] = useState<PlanningStateDef[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(rows.map((r) => normalizePlanningState(r)));
  }, [open, rows]);

  if (!open) return null;

  const persist = async () => {
    setSaving(true);
    try {
      const normalizedDraft = draft.map((r) => normalizePlanningState(r));
      const dup = planningStatesDuplicateButtonRoleError(normalizedDraft);
      if (dup) {
        toast.error(dup);
        return;
      }
      const cleaned = normalizePlanningStateRows(normalizedDraft);
      await api.updateSettings({ planningStates: cleaned });
      toast.success("Stati salvati");
      onSaved?.(cleaned.map((r) => ({ ...r })));
      onClose();
    } catch (e) {
      toast.error(formatErr(e));
    } finally {
      setSaving(false);
    }
  };

  const patchAt = (i: number, patch: Partial<PlanningStateDef>) => {
    setDraft((xs) => xs.map((row, j) => (j === i ? normalizePlanningState({ ...row, ...patch }) : row)));
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/45 p-3 sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="planning-states-title"
        className="flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 id="planning-states-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Stati pianificazione
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Un solo stato può essere <strong className="text-slate-600 dark:text-slate-300">predefinito</strong> (valore iniziale per le
              nuove attività con colonna stato). Per i pulsanti: attiva «Associa bottone», scegli un ruolo —{" "}
              <strong className="text-slate-600 dark:text-slate-300">non ripetere lo stesso ruolo</strong> su più stati.
            </p>
          </div>
          <button
            type="button"
            aria-label="Chiudi"
            disabled={saving}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-900"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4 scrollbar-violet-subtle">
          {draft.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Nessuno stato ancora. Aggiungine uno con il pulsante sotto e premi Salva per memorizzarlo.
            </p>
          ) : (
            <ul className="space-y-2">
              {draft.map((row, ri) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/50"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <label className="min-w-0 flex-1 flex flex-col gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Nome
                      </span>
                      <input
                        value={row.name}
                        onChange={(e) => patchAt(ri, { name: e.target.value })}
                        placeholder="Es. Fatto, In corso…"
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                      />
                    </label>
                    <button
                      type="button"
                      aria-label="Elimina stato"
                      onClick={() => setDraft((xs) => xs.filter((_, j) => j !== ri))}
                      className="self-end rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-rose-50 dark:border-slate-600 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4 gap-y-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        className="rounded border-violet-300 text-violet-600"
                        checked={row.isDefault ?? false}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setDraft((xs) =>
                              xs.map((prev, j) => normalizePlanningState({ ...prev, isDefault: j === ri })),
                            );
                          } else {
                            patchAt(ri, { isDefault: false });
                          }
                        }}
                      />
                      Predefinito
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-emerald-600"
                        checked={row.associateButton}
                        onChange={(e) => patchAt(ri, { associateButton: e.target.checked })}
                      />
                      Associa bottone
                    </label>
                    <label className="flex flex-col gap-1 text-xs sm:min-w-[12rem]">
                      <span className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Ruolo pulsante lista
                      </span>
                      <select
                        value={row.buttonRole ?? ""}
                        disabled={!row.associateButton}
                        onChange={(e) => {
                          const v = e.target.value;
                          patchAt(ri, {
                            buttonRole: v === "" ? null : (v as PlanningStateButtonRole),
                          });
                        }}
                        className="rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950"
                      >
                        <option value="">— Nessuno —</option>
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
            onClick={() => setDraft((xs) => [...xs, normalizePlanningState(planningStateRowTemplate())])}
          >
            <Plus size={16} /> Aggiungi stato
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <button
            type="button"
            disabled={saving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold dark:border-slate-700"
            onClick={onClose}
          >
            Chiudi senza salvare
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            onClick={() => void persist()}
          >
            {saving ? "Salvataggio…" : "Salva stati"}
          </button>
        </div>
      </div>
    </div>
  );
}
