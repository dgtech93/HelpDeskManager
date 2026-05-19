import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, GripVertical, X } from "lucide-react";
import type {
  PlanningActivityTypeDef,
  PlanningCatalogRef,
  PlanningCustomFieldKind,
  PlanningFieldDef,
} from "@/types";
import {
  PLANNING_CUSTOM_FIELD_KIND_UI,
  normalizePlanningActivityType,
  newPlanningFieldTemplate,
  normalizePlanningFieldDef,
} from "@/lib/presetCatalog";
import {
  PLANNING_CATALOG_REF_OPTIONS,
  planningCatalogTitle,
  type PlanningCatalogBundle,
} from "@/lib/planningCatalogOptions";

export type PlanningTypeEditorDialogProps = {
  open: boolean;
  draft: PlanningActivityTypeDef | null;
  onDraftChange: (next: PlanningActivityTypeDef) => void;
  catalogBundle: PlanningCatalogBundle | null;
  onClose: () => void;
  onConfirm: () => void;
};

/** Copia profonda per aprire il modal senza aliasing. */
export function clonePlanningActivityType(t: PlanningActivityTypeDef): PlanningActivityTypeDef {
  try {
    return JSON.parse(JSON.stringify(t)) as PlanningActivityTypeDef;
  } catch {
    return normalizePlanningActivityType(t);
  }
}

/** Riordino con ultima bozza nota (evita stato «stale» durante il puntatore). */
function reorderFieldsInDraft(
  d: PlanningActivityTypeDef,
  from: number,
  to: number,
): PlanningActivityTypeDef {
  if (from === to || from < 0 || from >= d.fields.length || to < 0 || to >= d.fields.length) return d;
  const nextFields = [...d.fields];
  const [moved] = nextFields.splice(from, 1);
  if (!moved) return d;
  nextFields.splice(to, 0, moved);
  return normalizePlanningActivityType({ ...d, fields: nextFields });
}

export function PlanningTypeEditorDialog({
  open,
  draft,
  onDraftChange,
  catalogBundle,
  onClose,
  onConfirm,
}: PlanningTypeEditorDialogProps) {
  const draftRef = useRef<PlanningActivityTypeDef | null>(null);
  const dragFromRef = useRef<number | null>(null);
  const dragHoverRef = useRef<number | null>(null);
  const tearDownPointerDragRef = useRef<(() => void) | null>(null);

  const [pointerDragActive, setPointerDragActive] = useState(false);
  const [pointerDragOverIndex, setPointerDragOverIndex] = useState<number | null>(null);

  draftRef.current = draft;

  useEffect(() => {
    if (!open) {
      tearDownPointerDragRef.current?.();
      tearDownPointerDragRef.current = null;
      dragFromRef.current = null;
      dragHoverRef.current = null;
      setPointerDragActive(false);
      setPointerDragOverIndex(null);
    }
  }, [open]);

  useEffect(
    () => () => {
      tearDownPointerDragRef.current?.();
      tearDownPointerDragRef.current = null;
    },
    [],
  );

  if (!open || !draft) return null;

  const patchDraft = (patch: Partial<PlanningActivityTypeDef>) => {
    onDraftChange(normalizePlanningActivityType({ ...draft, ...patch }));
  };

  const patchField = (index: number, patch: Partial<PlanningFieldDef>) => {
    const fields = [...draft.fields];
    const cur = fields[index];
    if (!cur) return;
    fields[index] = normalizePlanningFieldDef({ ...cur, ...patch });
    patchDraft({ fields });
  };

  const removeField = (index: number) => {
    patchDraft({ fields: draft.fields.filter((_, j) => j !== index) });
  };

  const startFieldReorderPointer = (fromIndex: number, ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    tearDownPointerDragRef.current?.();
    dragFromRef.current = fromIndex;
    dragHoverRef.current = fromIndex;
    setPointerDragActive(true);
    setPointerDragOverIndex(fromIndex);

    const readHoverIndex = (clientX: number, clientY: number): number | null => {
      const el = document.elementFromPoint(clientX, clientY);
      const card = el?.closest("[data-planning-field-card]");
      if (!card) return null;
      const raw = card.getAttribute("data-field-index");
      if (raw === null) return null;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) ? n : null;
    };

    const onMove = (e: PointerEvent) => {
      const hi = readHoverIndex(e.clientX, e.clientY);
      if (hi !== null) {
        dragHoverRef.current = hi;
        setPointerDragOverIndex(hi);
      }
    };

    const onUp = () => {
      tearDownPointerDragRef.current?.();
      tearDownPointerDragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      const from = dragFromRef.current;
      const to = dragHoverRef.current;
      dragFromRef.current = null;
      dragHoverRef.current = null;
      setPointerDragActive(false);
      setPointerDragOverIndex(null);

      const current = draftRef.current;
      if (current === null || from === null || to === null || from === to) return;
      onDraftChange(reorderFieldsInDraft(current, from, to));
    };

    tearDownPointerDragRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Tipo di pianificazione</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Nome in elenco; aggiungi campi con più colonne. Combobox = una voce dalla lista gestionale; selezione lista = più voci.
            </p>
          </div>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <label className="flex flex-col gap-1 lg:col-span-5">
              <span className="text-xs font-semibold uppercase text-slate-500">Nome (compare nella scelta)</span>
              <input
                value={draft.name}
                onChange={(e) => patchDraft({ name: e.target.value })}
                placeholder="Es. Manutenzione, Scadenza…"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <div className="flex flex-col gap-2 lg:col-span-7 lg:items-end lg:pt-6">
              <div className="flex flex-wrap justify-end gap-x-4 gap-y-2 border-b border-slate-100 pb-3 dark:border-slate-800 lg:w-full lg:justify-end">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={draft.showStatus}
                    onChange={(e) => {
                      const on = e.target.checked;
                      patchDraft(on ? { showStatus: true } : { showStatus: false, requireStatus: false });
                    }}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  Mostra stato (lista)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.showStartDate}
                    onChange={(e) => {
                      const on = e.target.checked;
                      patchDraft(on ? { showStartDate: true } : { showStartDate: false, requireStartDate: false });
                    }}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  Data inizio
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.showEndDate}
                    onChange={(e) => {
                      const on = e.target.checked;
                      patchDraft(on ? { showEndDate: true } : { showEndDate: false, requireEndDate: false });
                    }}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  Data fine
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.showReminder}
                    onChange={(e) => {
                      const on = e.target.checked;
                      patchDraft(on ? { showReminder: true } : { showReminder: false, requireReminder: false });
                    }}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  Promemoria
                </label>
              </div>
              <div className="flex w-full flex-wrap justify-end gap-x-3 gap-y-1.5 border-b border-slate-100 pb-2 text-[11px] dark:border-slate-800 lg:justify-end">
                <span className="w-full text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 lg:w-auto">
                  Obbligatori in modulo / incolla
                </span>
                <label
                  className={`flex cursor-pointer items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 ${
                    !draft.showStatus ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!draft.showStatus}
                    checked={Boolean(draft.requireStatus)}
                    onChange={(e) => patchDraft({ requireStatus: e.target.checked })}
                    className="rounded border-slate-300 text-amber-600"
                  />
                  Stato
                </label>
                <label
                  className={`flex cursor-pointer items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 ${
                    !draft.showStartDate ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!draft.showStartDate}
                    checked={Boolean(draft.requireStartDate)}
                    onChange={(e) => patchDraft({ requireStartDate: e.target.checked })}
                    className="rounded border-slate-300 text-amber-600"
                  />
                  Data inizio
                </label>
                <label
                  className={`flex cursor-pointer items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 ${
                    !draft.showEndDate ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!draft.showEndDate}
                    checked={Boolean(draft.requireEndDate)}
                    onChange={(e) => patchDraft({ requireEndDate: e.target.checked })}
                    className="rounded border-slate-300 text-amber-600"
                  />
                  Data fine
                </label>
                <label
                  className={`flex cursor-pointer items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 ${
                    !draft.showReminder ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!draft.showReminder}
                    checked={Boolean(draft.requireReminder)}
                    onChange={(e) => patchDraft({ requireReminder: e.target.checked })}
                    className="rounded border-slate-300 text-amber-600"
                  />
                  Promemoria
                </label>
              </div>
              <div className="flex w-full flex-wrap justify-end gap-x-4 gap-y-2">
                <span className="w-full text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 lg:w-auto">
                  Pulsanti lista
                </span>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.showBtnCompleted}
                    onChange={(e) => patchDraft({ showBtnCompleted: e.target.checked })}
                    className="rounded border-slate-300 text-violet-600"
                  />
                  Completato
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.showBtnTodo}
                    onChange={(e) => patchDraft({ showBtnTodo: e.target.checked })}
                    className="rounded border-slate-300 text-violet-600"
                  />
                  Da fare
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.showBtnRestoreStatus}
                    onChange={(e) => patchDraft({ showBtnRestoreStatus: e.target.checked })}
                    className="rounded border-slate-300 text-violet-600"
                  />
                  Ripristina stato
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.showBtnPlanned}
                    onChange={(e) => patchDraft({ showBtnPlanned: e.target.checked })}
                    className="rounded border-slate-300 text-violet-600"
                  />
                  Pianificato
                </label>
              </div>
              <div className="flex w-full flex-wrap justify-end gap-x-4 gap-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.useContacts)}
                    onChange={(e) => patchDraft({ useContacts: e.target.checked })}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  Usa contatti (chiamata / email in lista)
                </label>
              </div>
            </div>
          </div>

          {!catalogBundle ? (
            <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
              Caricamento cataloghi (clienti, rubrica, servizi…)…
            </p>
          ) : null}

          <div className="mt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Campi</span>
              <button
                type="button"
                onClick={() => patchDraft({ fields: [...draft.fields, newPlanningFieldTemplate()] })}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
              >
                <Plus size={16} /> Aggiungi campo
              </button>
            </div>

            {draft.fields.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Nessun campo definito.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {draft.fields.map((field, fi) => (
                  <div
                    key={field.id}
                    data-planning-field-card
                    data-field-index={fi}
                    className={`relative flex flex-col gap-2 rounded-xl border bg-slate-50/80 p-3 transition-colors dark:bg-slate-900/50 ${
                      pointerDragActive && pointerDragOverIndex === fi
                        ? "border-emerald-500 ring-2 ring-emerald-500/40"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        role="presentation"
                        tabIndex={-1}
                        className="inline-flex touch-none cursor-grab select-none items-center gap-1 rounded border border-transparent px-1 text-xs font-semibold uppercase text-slate-500 hover:border-slate-300 hover:bg-white active:cursor-grabbing dark:hover:border-slate-600 dark:hover:bg-slate-950"
                        title="Tenere premuto e trascinare sopra un altro campo per riordinare"
                        onPointerDown={(e) => startFieldReorderPointer(fi, e)}
                      >
                        <GripVertical size={16} aria-hidden /> Campo {fi + 1}
                      </div>
                      <button
                        type="button"
                        aria-label="Rimuovi campo"
                        onClick={() => removeField(fi)}
                        className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-rose-50 dark:border-slate-600 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Tipo</span>
                      <select
                        value={field.kind}
                        onChange={(e) => {
                          const kind = e.target.value as PlanningCustomFieldKind;
                          const next: Partial<PlanningFieldDef> = { kind };
                          if (kind === "comboBox" || kind === "selectList") {
                            next.catalogRef = field.catalogRef ?? "clients";
                          } else {
                            next.catalogRef = undefined;
                          }
                          patchField(fi, next);
                        }}
                        className="rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                      >
                        {PLANNING_CUSTOM_FIELD_KIND_UI.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {field.kind === "comboBox" || field.kind === "selectList" ? (
                      <>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            Lista gestionale (etichette nel menu come in archivio)
                          </span>
                          <select
                            value={field.catalogRef ?? ""}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              patchField(fi, {
                                catalogRef: v ? (v as PlanningCatalogRef) : undefined,
                              });
                            }}
                            disabled={!catalogBundle}
                            className="rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950"
                          >
                            <option value="">— Scegli —</option>
                            {PLANNING_CATALOG_REF_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="rounded-lg border border-slate-200/90 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950/80">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Etichetta nel form e in lista
                          </span>
                          <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {field.catalogRef
                              ? planningCatalogTitle(field.catalogRef)
                              : "— scegli un archivio —"}
                          </p>
                          <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-500">
                            Per combobox e lista è sempre il nome dell&apos;oggetto da cui si attingono i valori
                            (es. Clienti, Collaboratori…).
                          </p>
                        </div>
                      </>
                    ) : (
                      field.kind !== "none" && (
                        <label className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            Etichetta sul form
                          </span>
                          <input
                            value={field.label}
                            onChange={(e) => patchField(fi, { label: e.target.value })}
                            className="rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                          />
                        </label>
                      )
                    )}
                    {field.kind !== "none" ? (
                      <>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-200/95 px-2 py-2 text-[11px] font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-amber-600"
                            checked={Boolean(field.required)}
                            onChange={(e) => patchField(fi, { required: e.target.checked })}
                          />
                          Obbligatorio in modulo / inserimento massivo
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-violet-200/90 px-2 py-2 text-[11px] font-semibold text-slate-700 dark:border-violet-800/60 dark:text-slate-300">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-violet-600"
                            checked={Boolean(field.visibleInReminderSidebar)}
                            onChange={(e) => patchField(fi, { visibleInReminderSidebar: e.target.checked })}
                          />
                          Info visibile nel Promemoria (sidebar)
                        </label>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold dark:border-slate-700"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Applica
          </button>
        </div>
      </div>
    </div>
  );
}
