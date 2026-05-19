import { useEffect, useMemo, useState } from "react";
import { Eraser, Filter, Plus, Sparkles, Trash2, X } from "lucide-react";
import { consolidatePlanningPayloadFieldMap, planningFieldIsActive } from "@/lib/presetCatalog";
import {
  labelForPlanningPicklistValue,
  type PlanningCatalogBundle,
} from "@/lib/planningCatalogOptions";
import type {
  PlanningActivityStored,
  PlanningActivityTypeDef,
  PlanningCustomFieldKind,
  PlanningStateButtonRole,
  PlanningStateDef,
} from "@/types";

const EMPTY_TOKEN = "__empty__";

const SELECT_CLASS =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm transition focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/25 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500/50";

/** Campi personalizzati per cui ha senso un filtro a valori (rest escluso). */
function customFieldSupportsFilters(kind: PlanningCustomFieldKind): boolean {
  return kind !== "none";
}

function findPlanningStateButton(
  states: PlanningStateDef[],
  role: PlanningStateButtonRole,
): PlanningStateDef | undefined {
  return states.find((s) => s.associateButton && s.buttonRole === role);
}

type RuleKey =
  | "__status"
  | "__startDate"
  | "__endDate"
  | "__reminderAt"
  | `field:${string}`;

type RuleState = {
  enabledKeys: Record<RuleKey, boolean>;
  valueKeys: Record<RuleKey, Set<string>>;
};

type FilterSlot = {
  /** Id stabile per React key durante riordini / rimozioni. */
  id: string;
  fieldKey: RuleKey | null;
  values: Set<string>;
};

function makeSlot(): FilterSlot {
  return {
    id: crypto.randomUUID(),
    fieldKey: null,
    values: new Set<string>(),
  };
}

function normalizeComboRaw(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function selectListStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

function scalarStringForDistinct(kind: PlanningCustomFieldKind, raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (kind === "boolean") return raw ? "true" : "false";
  if (kind === "integer") return String(raw);
  if (kind === "string" || kind === "longText" || kind === "date" || kind === "time")
    return String(raw).trim() || undefined;
  if (kind === "datetime") return String(raw).trim() || undefined;
  return undefined;
}

function activityMatchesSection(
  a: PlanningActivityStored,
  typeDef: PlanningActivityTypeDef,
  key: RuleKey,
  selected: Set<string>,
): boolean {
  if (selected.size === 0) return false;
  const p = a.payload ?? {};
  const map = consolidatePlanningPayloadFieldMap(p);

  if (key === "__status") {
    const sid = typeof p.statusId === "string" ? p.statusId.trim() : "";
    if (!sid && selected.has(EMPTY_TOKEN)) return true;
    return Boolean(sid && selected.has(sid));
  }
  if (key === "__startDate") {
    const v = typeof p.startDate === "string" ? p.startDate.trim() : "";
    if (!v && selected.has(EMPTY_TOKEN)) return true;
    return Boolean(v && selected.has(v));
  }
  if (key === "__endDate") {
    const v = typeof p.endDate === "string" ? p.endDate.trim() : "";
    if (!v && selected.has(EMPTY_TOKEN)) return true;
    return Boolean(v && selected.has(v));
  }
  if (key === "__reminderAt") {
    const v = typeof p.reminderAt === "string" ? p.reminderAt.trim() : "";
    if (!v && selected.has(EMPTY_TOKEN)) return true;
    return Boolean(v && selected.has(v));
  }
  if (!key.startsWith("field:")) return false;

  const fid = key.slice("field:".length);
  const f = typeDef.fields.find((ff) => ff.id === fid);
  if (!f || !planningFieldIsActive(f)) return false;
  const raw = map[fid];

  if (f.kind === "comboBox") {
    const s = normalizeComboRaw(raw);
    if (!s && selected.has(EMPTY_TOKEN)) return true;
    return Boolean(s && selected.has(s));
  }
  if (f.kind === "selectList") {
    const arr = selectListStrings(raw);
    if (arr.length === 0 && selected.has(EMPTY_TOKEN)) return true;
    return arr.some((id) => selected.has(id));
  }
  if (f.kind === "boolean") {
    const b = Boolean(raw);
    const token = b ? "true" : "false";
    return selected.has(token);
  }
  if (
    f.kind === "string" ||
    f.kind === "longText" ||
    f.kind === "integer" ||
    f.kind === "date" ||
    f.kind === "time" ||
    f.kind === "datetime"
  ) {
    const sc = scalarStringForDistinct(f.kind, raw);
    if (sc === undefined && selected.has(EMPTY_TOKEN)) return true;
    return Boolean(sc && selected.has(sc));
  }
  return false;
}

function eligibleBeforeSlot(
  slots: FilterSlot[],
  slotIndex: number,
  allRows: PlanningActivityStored[],
  typeDef: PlanningActivityTypeDef,
): PlanningActivityStored[] {
  let cur = allRows;
  for (let j = 0; j < slotIndex; j++) {
    const s = slots[j];
    if (!s.fieldKey || s.values.size === 0) continue;
    cur = cur.filter((a) => activityMatchesSection(a, typeDef, s.fieldKey!, s.values));
  }
  return cur;
}

function activityMatchesAllEnabled(
  a: PlanningActivityStored,
  typeDef: PlanningActivityTypeDef,
  rules: RuleState,
  allowedKeys: Set<RuleKey>,
): boolean {
  const keys = Object.keys(rules.enabledKeys).filter(
    (k) => rules.enabledKeys[k as RuleKey] && allowedKeys.has(k as RuleKey),
  ) as RuleKey[];
  if (keys.length === 0) return false;
  for (const key of keys) {
    const sel = rules.valueKeys[key];
    if (!sel || sel.size === 0) return false;
    if (!activityMatchesSection(a, typeDef, key, sel)) return false;
  }
  return true;
}

function gatherDistinct(
  rows: PlanningActivityStored[],
  typeDef: PlanningActivityTypeDef,
  key: RuleKey,
): string[] {
  const set = new Set<string>();
  const p0 = (a: PlanningActivityStored) => a.payload ?? {};
  if (key === "__status") {
    for (const a of rows) {
      const sid = typeof p0(a).statusId === "string" ? p0(a).statusId!.trim() : "";
      if (sid) set.add(sid);
      else set.add(EMPTY_TOKEN);
    }
    return [...set];
  }
  if (key === "__startDate") {
    for (const a of rows) {
      const v = typeof p0(a).startDate === "string" ? p0(a).startDate!.trim() : "";
      if (v) set.add(v);
      else set.add(EMPTY_TOKEN);
    }
    return [...set];
  }
  if (key === "__endDate") {
    for (const a of rows) {
      const v = typeof p0(a).endDate === "string" ? p0(a).endDate!.trim() : "";
      if (v) set.add(v);
      else set.add(EMPTY_TOKEN);
    }
    return [...set];
  }
  if (key === "__reminderAt") {
    for (const a of rows) {
      const v = typeof p0(a).reminderAt === "string" ? p0(a).reminderAt!.trim() : "";
      if (v) set.add(v);
      else set.add(EMPTY_TOKEN);
    }
    return [...set];
  }
  if (!key.startsWith("field:")) return [];
  const fid = key.slice("field:".length);
  const f = typeDef.fields.find((ff) => ff.id === fid);
  if (!f || !planningFieldIsActive(f)) return [];

  for (const a of rows) {
    const map = consolidatePlanningPayloadFieldMap(p0(a));
    const raw = map[fid];
    if (f.kind === "comboBox") {
      const s = normalizeComboRaw(raw);
      if (s) set.add(s);
      else set.add(EMPTY_TOKEN);
    } else if (f.kind === "selectList") {
      const arr = selectListStrings(raw);
      if (arr.length === 0) set.add(EMPTY_TOKEN);
      else for (const id of arr) set.add(id);
    } else if (f.kind === "boolean") {
      set.add(raw ? "true" : "false");
    } else if (
      f.kind === "string" ||
      f.kind === "longText" ||
      f.kind === "integer" ||
      f.kind === "date" ||
      f.kind === "time" ||
      f.kind === "datetime"
    ) {
      const sc = scalarStringForDistinct(f.kind, raw);
      if (sc === undefined) set.add(EMPTY_TOKEN);
      else set.add(sc);
    }
  }
  return [...set];
}

/** Rimuove valori selezionati impossibili dopo i filtri sopra (cascata per slot visivi). */
function sanitizeSlots(
  allRows: PlanningActivityStored[],
  typeDef: PlanningActivityTypeDef,
  slots: FilterSlot[],
): FilterSlot[] {
  const copy = slots.map((s) => ({
    ...s,
    values: new Set(s.values),
  }));
  for (let i = 0; i < copy.length; i++) {
    const slot = copy[i];
    if (!slot.fieldKey) continue;
    const eligible = eligibleBeforeSlot(copy, i, allRows, typeDef);
    const distinct = gatherDistinct(eligible, typeDef, slot.fieldKey);
    const valid = new Set(distinct);
    for (const v of [...slot.values]) {
      if (!valid.has(v)) slot.values.delete(v);
    }
  }
  return copy;
}

function buildRuleStateFromSlots(slots: FilterSlot[]): RuleState {
  const enabledKeys = {} as Record<RuleKey, boolean>;
  const valueKeys = {} as Record<RuleKey, Set<string>>;
  for (const s of slots) {
    if (!s.fieldKey || s.values.size === 0) continue;
    enabledKeys[s.fieldKey] = true;
    valueKeys[s.fieldKey] = new Set(s.values);
  }
  return { enabledKeys, valueKeys };
}

function keysUsedInOtherSlots(slots: FilterSlot[], exceptIndex: number): Set<RuleKey> {
  const used = new Set<RuleKey>();
  slots.forEach((sl, idx) => {
    if (idx === exceptIndex || !sl.fieldKey) return;
    used.add(sl.fieldKey);
  });
  return used;
}

function formatOptionLabel(
  key: RuleKey,
  value: string,
  typeDef: PlanningActivityTypeDef,
  planningStates: PlanningStateDef[],
  bundle: PlanningCatalogBundle | null,
): string {
  if (value === EMPTY_TOKEN) return "(Vuoto)";
  if (key === "__status") {
    const st = planningStates.find((s) => s.id === value);
    return st ? `${st.name}${st.isDefault ? " ★" : ""}` : value.slice(0, 8) + "…";
  }
  if (key === "__reminderAt") {
    try {
      return new Date(value).toLocaleString("it-IT");
    } catch {
      return value;
    }
  }
  if (key.startsWith("field:")) {
    const fid = key.slice("field:".length);
    const f = typeDef.fields.find((ff) => ff.id === fid);
    if (f?.catalogRef && bundle && (f.kind === "comboBox" || f.kind === "selectList")) {
      return labelForPlanningPicklistValue(f.catalogRef, value, bundle);
    }
    if (f?.kind === "boolean") return value === "true" ? "Sì" : "No";
  }
  return value;
}

type Props = {
  open: boolean;
  onClose: () => void;
  typeDef: PlanningActivityTypeDef;
  rows: PlanningActivityStored[];
  planningStates: PlanningStateDef[];
  bundle: PlanningCatalogBundle | null;
  busy?: boolean;
  onConfirmDelete: (ids: string[]) => Promise<void>;
};

export function PlanningBulkDeleteDialog({
  open,
  onClose,
  typeDef,
  rows,
  planningStates,
  bundle,
  busy,
  onConfirmDelete,
}: Props) {
  const [slots, setSlots] = useState<FilterSlot[]>(() => [makeSlot()]);

  useEffect(() => {
    if (open) setSlots([makeSlot()]);
  }, [open, typeDef.id]);

  const ruleDescriptors = useMemo((): { key: RuleKey; label: string }[] => {
    const out: { key: RuleKey; label: string }[] = [];
    if (typeDef.showStatus) out.push({ key: "__status", label: "Stato" });
    if (typeDef.showStartDate) out.push({ key: "__startDate", label: "Data inizio" });
    if (typeDef.showEndDate) out.push({ key: "__endDate", label: "Data fine" });
    if (typeDef.showReminder) out.push({ key: "__reminderAt", label: "Promemoria" });
    for (const f of typeDef.fields) {
      if (!planningFieldIsActive(f)) continue;
      if (!customFieldSupportsFilters(f.kind)) continue;
      out.push({ key: `field:${f.id}` as RuleKey, label: (f.label || "").trim() || "Campo" });
    }
    return out;
  }, [typeDef]);

  const allowedKeys = useMemo(() => new Set(ruleDescriptors.map((r) => r.key)), [ruleDescriptors]);

  const updateSlots = (updater: (prev: FilterSlot[]) => FilterSlot[]) => {
    setSlots((prev) => sanitizeSlots(rows, typeDef, updater(prev)));
  };

  const rules = useMemo(() => buildRuleStateFromSlots(slots), [slots]);

  const matchingIds = useMemo(() => {
    if (!open) return [];
    return rows
      .filter((a) => activityMatchesAllEnabled(a, typeDef, rules, allowedKeys))
      .map((a) => a.id);
  }, [open, rows, typeDef, rules, allowedKeys]);

  const activeRuleCount = useMemo(() => slots.filter((s) => s.fieldKey && s.values.size > 0).length, [slots]);

  const rulesValid = useMemo(() => {
    const anyComplete = slots.some((s) => s.fieldKey && s.values.size > 0);
    const noPartial = slots.every((s) => !(s.fieldKey && s.values.size === 0));
    return anyComplete && noPartial;
  }, [slots]);

  const hasEmptyFieldRow = slots.some((s) => !s.fieldKey);
  const hasPartialRow = slots.some((s) => Boolean(s.fieldKey) && s.values.size === 0);
  const hasAtLeastOneCompleteFilter = slots.some((s) => s.fieldKey && s.values.size > 0);

  const canAddFilter =
    ruleDescriptors.length > 0 &&
    slots.length < ruleDescriptors.length &&
    !hasPartialRow &&
    !hasEmptyFieldRow &&
    hasAtLeastOneCompleteFilter;

  const applyPresetCompleted = () => {
    const st = findPlanningStateButton(planningStates, "completed");
    if (!st) return;
    setSlots(
      sanitizeSlots(rows, typeDef, [
        {
          id: crypto.randomUUID(),
          fieldKey: "__status",
          values: new Set([st.id]),
        },
      ]),
    );
  };

  const clearAllFilters = () => {
    setSlots([makeSlot()]);
  };

  const submit = async () => {
    if (!rulesValid || matchingIds.length === 0) return;
    try {
      await onConfirmDelete(matchingIds);
      onClose();
    } catch {
      /* errore gestito dal genitore */
    }
  };

  if (!open) return null;

  const completedState = findPlanningStateButton(planningStates, "completed");
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[3px] sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-del-title"
        className="flex max-h-[min(93vh,900px)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/30 bg-[linear-gradient(145deg,rgba(255,255,255,.99),rgba(249,251,254,.93))] shadow-[0_25px_80px_-15px_rgba(15,23,42,0.45)] ring-[3px] ring-violet-200/55 dark:border-slate-600/35 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 dark:ring-violet-500/15 md:rounded-[1.65rem]"
      >

        {/* Header */}
        <div className="relative shrink-0 overflow-hidden px-6 pb-4 pt-5 dark:bg-gradient-to-br dark:from-violet-950/60 dark:via-slate-900/95 dark:to-slate-950">
          <div className="relative flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-lg shadow-rose-600/30">
              <Trash2 size={23} strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="bulk-del-title" className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Eliminazione massiva
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Tipo{' '}
                <span className="font-semibold text-violet-700 dark:text-violet-300">
                  {(typeDef.name || "").trim() || "—"}
                </span>
                . Scegli un criterio e i valori; con «Aggiungi filtro» restringi ancora usando solo i dati compatibili
                con quanto sopra (AND tra righe).
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 shadow-sm dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
                  <Filter size={12} strokeWidth={2.5} aria-hidden /> And tra filtri
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100/90 px-2.5 py-1 text-[11px] font-medium tabular-nums text-slate-600 dark:bg-slate-800/70 dark:text-slate-400">
                  {rows.length} attività nel tipo
                </span>
              </div>
            </div>
            <button
              type="button"
              aria-label="Chiudi"
              onClick={onClose}
              disabled={busy}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/95 bg-white/95 text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/95 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <X size={19} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200/85 bg-white/70 px-5 py-2.5 backdrop-blur-sm dark:border-slate-700/85 dark:bg-slate-950/55">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => clearAllFilters()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300/95 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50/80 disabled:pointer-events-none disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-violet-600 dark:hover:bg-violet-950/40"
            >
              <Eraser size={15} aria-hidden /> Cancella filtri
            </button>
            {typeDef.showStatus && completedState ? (
              <button
                type="button"
                disabled={busy}
                onClick={applyPresetCompleted}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/95 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm shadow-emerald-600/15 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100 dark:hover:bg-emerald-900/55"
              >
                <Sparkles size={14} aria-hidden /> Stato «Completato»
              </button>
            ) : null}
          </div>
        </div>

        {/* Body */}
        <div className="scrollbar-violet-subtle relative min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-transparent to-slate-50/95 px-5 pb-5 pt-4 dark:from-transparent dark:to-slate-950/80">
          {rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/90 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
              Nessuna attività da filtrare per questo tipo.
            </p>
          ) : ruleDescriptors.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/90 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
              Per questo tipo non ci sono colonne configurabili come filtro (nessun campo attivo diverso da «nessuno» e
              nessuna data/stato sulla lista).
            </p>
          ) : (
            <div className="space-y-3">
              {slots.map((slot, slotIndex) => {
                const excluded = keysUsedInOtherSlots(slots, slotIndex);
                const fieldOptions = ruleDescriptors.filter((d) => !excluded.has(d.key) || d.key === slot.fieldKey);
                const eligible = eligibleBeforeSlot(slots, slotIndex, rows, typeDef);
                const narrowed = eligible.length !== rows.length;
                const distinct = slot.fieldKey
                  ? gatherDistinct(eligible, typeDef, slot.fieldKey).sort((a, b) =>
                      formatOptionLabel(slot.fieldKey!, a, typeDef, planningStates, bundle).localeCompare(
                        formatOptionLabel(slot.fieldKey!, b, typeDef, planningStates, bundle),
                        "it",
                      ),
                    )
                  : [];
                const multiselectSize = Math.min(Math.max(distinct.length, 3), 8);

                const rowLabel = slotIndex === 0 ? "Filtra per" : "E inoltre";

                return (
                  <article
                    key={slot.id}
                    className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 dark:border-slate-700 dark:bg-slate-900/50"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                      <div className="flex shrink-0 items-center sm:w-[7.25rem]">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{rowLabel}</span>
                      </div>

                      <div className="min-w-0 flex-1 space-y-2">
                        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Campo
                        </label>
                        <select
                          disabled={busy}
                          aria-label={`${rowLabel}: campo`}
                          value={slot.fieldKey ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const nextKey = raw === "" ? null : (raw as RuleKey);
                            updateSlots((prev) =>
                              prev.map((s, j) =>
                                j === slotIndex ? { ...s, fieldKey: nextKey, values: new Set<string>() } : s,
                              ),
                            );
                          }}
                          className={SELECT_CLASS}
                        >
                          <option value="">— Scegli un campo —</option>
                          {fieldOptions.map((d) => (
                            <option key={d.key} value={d.key}>
                              {d.label}
                            </option>
                          ))}
                        </select>

                        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Valori <span className="font-normal lowercase text-slate-400">(uno o più · OR tra loro)</span>
                        </label>
                        {!slot.fieldKey ? (
                          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-500">
                            Scegli prima un campo.
                          </p>
                        ) : distinct.length === 0 ? (
                          <p className="rounded-xl border border-dashed border-amber-200/90 bg-amber-50/50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/55 dark:bg-amber-950/40 dark:text-amber-100">
                            Nessun valore disponibile con i filtri sopra
                            {!narrowed && slotIndex > 0 ? "." : narrowed ? `: ${eligible.length} righe candidate.` : "."}
                          </p>
                        ) : (
                          <>
                            <select
                              multiple
                              disabled={busy}
                              aria-label={`${rowLabel}: valori`}
                              size={multiselectSize}
                              value={[...slot.values]}
                              onChange={(e) => {
                                const next = new Set<string>();
                                for (let oi = 0; oi < e.target.selectedOptions.length; oi++) {
                                  next.add(e.target.selectedOptions[oi]!.value);
                                }
                                updateSlots((prev) =>
                                  prev.map((s, j) => (j === slotIndex ? { ...s, values: next } : s)),
                                );
                              }}
                              className={`${SELECT_CLASS} scrollbar-violet-subtle min-h-[6.5rem] py-2 font-normal`}
                            >
                              {distinct.map((v) => (
                                <option key={v} value={v}>
                                  {formatOptionLabel(slot.fieldKey!, v, typeDef, planningStates, bundle)}
                                </option>
                              ))}
                            </select>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Tieni premuto Ctrl (Windows) o Cmd (Mac) per selezionare più righe nell&apos;elenco.
                            </p>
                          </>
                        )}
                        {slotIndex > 0 && slot.fieldKey && distinct.length > 0 ? (
                          <p className="text-[11px] font-medium text-violet-700 dark:text-violet-400">
                            Valori riferiti alle {eligible.length} attività che rispettano i filtri precedenti.
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-row gap-2 sm:flex-col sm:items-end">
                        {slotIndex > 0 ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => updateSlots((prev) => prev.filter((_, j) => j !== slotIndex))}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-300/95 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:opacity-45 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-rose-700 dark:hover:bg-rose-950/55 dark:hover:text-rose-100 sm:flex-none"
                          >
                            Rimuovi
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}

              {canAddFilter ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => updateSlots((prev) => [...prev, makeSlot()])}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-300/95 bg-violet-50/50 px-4 py-3 text-sm font-semibold text-violet-800 shadow-inner transition hover:border-violet-500 hover:bg-violet-100/80 disabled:pointer-events-none disabled:opacity-40 dark:border-violet-700/80 dark:bg-violet-950/45 dark:text-violet-100 dark:hover:bg-violet-950/85"
                >
                  <Plus size={18} strokeWidth={2.25} aria-hidden /> Aggiungi filtro
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200/90 bg-gradient-to-r from-slate-50/98 via-white to-rose-50/40 px-6 py-4 dark:border-slate-700 dark:from-slate-950 dark:via-slate-950 dark:to-rose-950/30">
          <div className="min-w-[12rem] max-w-xl">
            <p className="text-sm leading-snug text-slate-700 dark:text-slate-300">
              {rulesValid && matchingIds.length > 0 ? (
                <>
                  Confermare la rimozione di{' '}
                  <strong className="tabular-nums text-xl text-rose-600 dark:text-rose-400">{matchingIds.length}</strong>{' '}
                  attività.
                  {activeRuleCount > 1 ? (
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-500">
                      {activeRuleCount} filtri attivi (tutti insieme)
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-slate-500 dark:text-slate-500">
                  Imposta il primo filtro (campo e almeno un valore); aggiungi altri solo dopo aver completato quello
                  sopra.
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-xl border border-slate-300/95 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={busy || !rulesValid || matchingIds.length === 0 || rows.length === 0}
              onClick={() => void submit()}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/35 transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-45 dark:shadow-rose-900/40"
            >
              Elimina ora
              <Trash2 size={17} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
