import { useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { AnalogClockTimeInput } from "@/components/planning/AnalogClockTimeInput";
import { FriendlyDateInput } from "@/components/planning/FriendlyDateInput";
import { FriendlyDateTimeFields } from "@/components/planning/FriendlyDateTimeFields";
import {
  consolidatePlanningPayloadFieldMap,
  planningFieldIsActive,
  validatePlanningScratchInputs,
} from "@/lib/presetCatalog";
import { coerceToDatePart, isoToDatetimeLocalValue } from "@/lib/planningDateUtils";
import {
  optionsForPlanningCatalogRefScoped,
  type PlanningCatalogBundle,
} from "@/lib/planningCatalogOptions";
import {
  firstPlanningClientsComboFieldId,
  planningContactScopedFieldIds,
  validatePlanningScratchUseContacts,
} from "@/lib/planningUseContacts";
import type {
  PlanningActivityPayload,
  PlanningActivityStored,
  PlanningActivityTypeDef,
  PlanningCustomFieldKind,
  PlanningFieldDef,
} from "@/types";
import { normalizeAgendaSettingsFromApp } from "@/lib/agendaSettings";
import { agendaViolationForDateTime } from "@/lib/agendaRules";
import { PlanningContactQuickActions } from "@/components/planning/PlanningContactQuickActions";

export type Scratch = Record<string, unknown>;

function datetimeLocalToIso(local: string): string | undefined {
  const t = local.trim();
  if (!t) return undefined;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function scratchGetString(s: Scratch, id: string): string {
  const v = s[id];
  return typeof v === "string" ? v : "";
}

function scratchGetBool(s: Scratch, id: string): boolean {
  const v = s[id];
  return typeof v === "boolean" ? v : false;
}

function scratchGetStringArray(s: Scratch, id: string): string[] {
  const v = s[id];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

function fieldHeader(f: PlanningFieldDef): string {
  const t = f.label?.trim();
  if (t) return t;
  return "—";
}

export function initScratchForType(t: PlanningActivityTypeDef | null): Scratch {
  if (!t) return {};
  const s: Scratch = {};
  for (const f of t.fields) {
    if (!planningFieldIsActive(f)) continue;
    if (f.kind === "boolean") s[f.id] = false;
    else if (f.kind === "selectList") s[f.id] = [];
    else if (f.kind === "comboBox") s[f.id] = "";
    else s[f.id] = "";
  }
  if (t.showStartDate) s.__startDate = "";
  if (t.showEndDate) s.__endDate = "";
  if (t.showReminder) s.__reminderAt = "";
  s.__statusId = "";
  return s;
}

function populateScratchFromPayload(t: PlanningActivityTypeDef | null, p: PlanningActivityPayload): Scratch {
  const s = initScratchForType(t);
  s.__statusId = typeof p.statusId === "string" ? p.statusId : "";
  if (!t) return s;
  const map = consolidatePlanningPayloadFieldMap(p);
  for (const f of t.fields) {
    if (!planningFieldIsActive(f)) continue;
    const raw = map[f.id];
    if (raw === undefined || raw === null) continue;
    if (f.kind === "boolean") s[f.id] = Boolean(raw);
    else if (f.kind === "selectList") s[f.id] = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
    else if (f.kind === "comboBox") s[f.id] = String(raw);
    else if (f.kind === "integer") s[f.id] = String(raw);
    else if (f.kind === "string") s[f.id] = String(raw);
    else if (f.kind === "longText") s[f.id] = String(raw);
    else if (f.kind === "date") s[f.id] = coerceToDatePart(raw);
    else if (f.kind === "time") s[f.id] = String(raw).trim().slice(0, 5);
    else if (f.kind === "datetime") s[f.id] = isoToDatetimeLocalValue(String(raw));
    else continue;
  }
  if (t.showStartDate) s.__startDate = coerceToDatePart(p.startDate);
  if (t.showEndDate) s.__endDate = coerceToDatePart(p.endDate);
  if (t.showReminder && typeof p.reminderAt === "string" && p.reminderAt.trim()) {
    s.__reminderAt = isoToDatetimeLocalValue(p.reminderAt);
  }
  return s;
}

type BuildableCustomKind = Exclude<
  PlanningCustomFieldKind,
  "none" | "comboBox" | "selectList"
>;

export function buildPayload(type: PlanningActivityTypeDef, scratch: Scratch): PlanningActivityPayload {
  const fieldValues: Record<string, unknown> = {};
  for (const f of type.fields) {
    if (!planningFieldIsActive(f)) continue;
    if (f.kind === "comboBox") {
      const sid = scratchGetString(scratch, f.id);
      if (sid) fieldValues[f.id] = sid;
    } else if (f.kind === "selectList") {
      const ids = scratchGetStringArray(scratch, f.id);
      if (ids.length) fieldValues[f.id] = ids;
    } else if (f.kind !== "none") {
      const v = buildCustomValue(
        f.kind as BuildableCustomKind,
        scratchGetString(scratch, f.id),
        scratchGetBool(scratch, f.id),
      );
      if (v !== undefined) fieldValues[f.id] = v;
    }
  }
  const out: PlanningActivityPayload = { fieldValues };
  if (type.showStartDate) out.startDate = scratchGetString(scratch, "__startDate").trim() || undefined;
  if (type.showEndDate) out.endDate = scratchGetString(scratch, "__endDate").trim() || undefined;
  if (type.showReminder && scratchGetString(scratch, "__reminderAt").trim())
    out.reminderAt = datetimeLocalToIso(scratchGetString(scratch, "__reminderAt")) ?? undefined;
  const st = scratchGetString(scratch, "__statusId").trim();
  if (st) out.statusId = st;
  return out;
}

function buildCustomValue(kind: BuildableCustomKind, text: string, bool: boolean): unknown | undefined {
  const tx = text.trim();
  switch (kind) {
    case "string":
    case "longText":
      return tx ? tx : undefined;
    case "integer":
      if (!tx) return undefined;
      const n = Number.parseInt(tx, 10);
      if (!Number.isFinite(n)) throw new Error("Inserisci un numero intero valido");
      return n;
    case "boolean":
      return bool;
    case "date":
    case "time":
      return tx || undefined;
    case "datetime": {
      if (!tx) return undefined;
      const iso = datetimeLocalToIso(tx);
      return iso ?? undefined;
    }
    default:
      return undefined;
  }
}

const FIELD_BASE_CLASS =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm transition focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/25 dark:border-slate-600 dark:bg-slate-950 dark:focus:border-violet-500/50";

/** Classi griglia per distribuire i campi su più colonne (riduce scroll verticale). */
function fieldCellClass(f: PlanningFieldDef): string {
  if (f.kind === "selectList") return "md:col-span-2 xl:col-span-3";
  if (f.kind === "longText") return "md:col-span-2 xl:col-span-3";
  if (f.kind === "datetime") return "md:col-span-2";
  return "";
}

function renderFieldEditor(
  f: PlanningFieldDef,
  bundle: PlanningCatalogBundle,
  scratch: Scratch,
  setScratch: Dispatch<SetStateAction<Scratch>>,
  wrapClassName: string,
  planningType: PlanningActivityTypeDef,
): ReactNode {
  if (!planningFieldIsActive(f)) return null;
  const lblRaw = fieldHeader(f);
  const lbl = f.required ? `${lblRaw} *` : lblRaw;
  const wrap = (inner: ReactNode) => (
    <label key={f.id} className={`flex flex-col gap-1.5 ${wrapClassName}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{lbl}</span>
      {inner}
    </label>
  );

  if (f.kind === "boolean") {
    return (
      <label
        key={f.id}
        className={`flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/50 ${wrapClassName}`}
      >
        <input
          type="checkbox"
          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
          checked={scratchGetBool(scratch, f.id)}
          onChange={(e) =>
            setScratch((s0) => ({
              ...s0,
              [f.id]: e.target.checked,
            }))
          }
        />
        <span className="font-medium text-slate-800 dark:text-slate-200">{lbl}</span>
      </label>
    );
  }

  if (f.kind === "comboBox" && f.catalogRef) {
    const scopeFilter = Boolean(planningType.useContacts);
    const clientFieldId = scopeFilter ? firstPlanningClientsComboFieldId(planningType) : undefined;
    const clientKey = clientFieldId ? scratchGetString(scratch, clientFieldId).trim() : "";
    const opts = optionsForPlanningCatalogRefScoped(f.catalogRef, bundle, clientKey, scopeFilter);
    const isClientField = f.catalogRef === "clients";
    return wrap(
      <select
        value={scratchGetString(scratch, f.id)}
        onChange={(e) => {
          const v = e.target.value;
          if (isClientField && planningType.useContacts) {
            setScratch((s0) => {
              const next: Scratch = { ...s0, [f.id]: v };
              for (const depId of planningContactScopedFieldIds(planningType)) {
                const depField = planningType.fields.find((x) => x.id === depId);
                if (!depField || !planningFieldIsActive(depField)) continue;
                if (depField.kind === "selectList") next[depId] = [];
                else next[depId] = "";
              }
              return next;
            });
          } else {
            setScratch((s0) => ({ ...s0, [f.id]: v }));
          }
        }}
        className={FIELD_BASE_CLASS}
      >
        <option value="">— Seleziona —</option>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>,
    );
  }

  if (f.kind === "selectList" && f.catalogRef) {
    const scopeFilter = Boolean(planningType.useContacts);
    const clientFieldId = scopeFilter ? firstPlanningClientsComboFieldId(planningType) : undefined;
    const clientKey = clientFieldId ? scratchGetString(scratch, clientFieldId).trim() : "";
    const opts = optionsForPlanningCatalogRefScoped(f.catalogRef, bundle, clientKey, scopeFilter);
    const sel = scratchGetStringArray(scratch, f.id);
    const toggle = (oid: string, on: boolean) => {
      setScratch((prev) => {
        const cur = new Set(scratchGetStringArray(prev, f.id));
        if (on) cur.add(oid);
        else cur.delete(oid);
        return { ...prev, [f.id]: [...cur] };
      });
    };
    return wrap(
      <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white/80 p-3 text-sm scrollbar-violet-subtle dark:border-slate-700 dark:bg-slate-950/50 sm:max-h-44">
        {opts.length === 0 ? (
          <span className="text-slate-500 dark:text-slate-400">Lista vuota in Impostazioni.</span>
        ) : (
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {opts.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800/80"
              >
                <input
                  type="checkbox"
                  checked={sel.includes(o.id)}
                  onChange={(e) => toggle(o.id, e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600"
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>,
    );
  }

  const st = scratchGetString(scratch, f.id);
  const setStr = (v: string) => setScratch((s0) => ({ ...s0, [f.id]: v }));

  switch (f.kind) {
    case "string":
      return wrap(<input type="text" value={st} onChange={(e) => setStr(e.target.value)} className={FIELD_BASE_CLASS} />);
    case "longText":
      return wrap(
        <textarea
          value={st}
          onChange={(e) => setStr(e.target.value)}
          rows={5}
          spellCheck
          className={`${FIELD_BASE_CLASS} min-h-[7.5rem] resize-y leading-relaxed`}
          placeholder="Note o testo lungo…"
        />,
      );
    case "integer":
      return wrap(<input type="number" step={1} value={st} onChange={(e) => setStr(e.target.value)} className={FIELD_BASE_CLASS} />);
    case "date":
      return wrap(
        <FriendlyDateInput value={st} onChange={setStr} inputClassName={FIELD_BASE_CLASS} />,
      );
    case "time":
      return wrap(
        <AnalogClockTimeInput value={st || "09:00"} onChange={(v2) => setStr(v2)} inputClassName={FIELD_BASE_CLASS} />,
      );
    case "datetime":
      return wrap(
        <FriendlyDateTimeFields value={st} onChange={setStr} dateInputClassName={FIELD_BASE_CLASS} />,
      );
    default:
      return null;
  }
}

function firstSortedTypeId(list: PlanningActivityTypeDef[]): string {
  const sorted = [...list].sort((a, b) => (a.name || "").localeCompare(b.name || "", "it"));
  return sorted[0]?.id ?? "";
}

export type PlanningActivityEditorModalProps = {
  open: boolean;
  mode: "create" | "edit";
  editing: PlanningActivityStored | null;
  types: PlanningActivityTypeDef[];
  bundle: PlanningCatalogBundle | null;
  saving: boolean;
  /** In creazione: id tipo pre-compilato (es. dalla vista Pianificazione). Ignorato se non è un tipo valido. */
  preferredCreateTypeId?: string | null;
  onClose: () => void;
  /** Il genitore assegna l'id salvato nell'elenco. */
  onSaveCreate: (activityTypeId: string, payload: PlanningActivityPayload) => Promise<void>;
  onSaveEdit: (id: string, payload: PlanningActivityPayload) => Promise<void>;
};

function pickInitialCreateTypeId(types: PlanningActivityTypeDef[], preferred: string | null | undefined): string {
  const p = preferred?.trim();
  if (p && types.some((x) => x.id === p)) return p;
  return firstSortedTypeId(types);
}

export function PlanningActivityEditorModal({
  open,
  mode,
  editing,
  types,
  bundle,
  saving,
  preferredCreateTypeId,
  onClose,
  onSaveCreate,
  onSaveEdit,
}: PlanningActivityEditorModalProps) {

  const [selectedTypeId, setSelectedTypeId] = useState(() =>
    mode === "edit" && editing
      ? editing.activityTypeId
      : pickInitialCreateTypeId(types, preferredCreateTypeId ?? null),
  );
  const [scratch, setScratch] = useState<Scratch>(() => {
    if (mode === "edit" && editing) {
      const t = types.find((x) => x.id === editing.activityTypeId) ?? null;
      return populateScratchFromPayload(t, editing.payload ?? {});
    }
    const initId = pickInitialCreateTypeId(types, preferredCreateTypeId ?? null);
    const tt = types.find((x) => x.id === initId) ?? null;
    return initScratchForType(tt);
  });

  useEffect(() => {
    if (mode === "edit" || types.length === 0) return;
    const t = types.find((x) => x.id === selectedTypeId) ?? null;
    setScratch(initScratchForType(t));
  }, [selectedTypeId, mode, types]);

  const effectiveSelectedType = useMemo(() => types.find((x) => x.id === selectedTypeId) ?? null, [types, selectedTypeId]);

  const clientScopedFieldId = useMemo(
    () => (effectiveSelectedType?.useContacts ? firstPlanningClientsComboFieldId(effectiveSelectedType) : undefined),
    [effectiveSelectedType],
  );
  const clientKeyForScope = clientScopedFieldId ? scratchGetString(scratch, clientScopedFieldId) : "";

  /** Allinea rubrica/collaboratori al cliente (es. apertura modifica o cambio cliente nei dati). */
  useEffect(() => {
    if (!open || !effectiveSelectedType?.useContacts || !bundle || !clientScopedFieldId) return;
    setScratch((s0) => {
      const cid = scratchGetString(s0, clientScopedFieldId).trim();
      let next = { ...s0 };
      let changed = false;
      for (const depId of planningContactScopedFieldIds(effectiveSelectedType)) {
        const depField = effectiveSelectedType.fields.find((x) => x.id === depId);
        if (!depField || !planningFieldIsActive(depField)) continue;
        if (depField.kind === "comboBox" && depField.catalogRef) {
          const val = scratchGetString(next, depId).trim();
          if (!val) continue;
          const opts = optionsForPlanningCatalogRefScoped(depField.catalogRef, bundle, cid, true);
          if (!opts.some((o) => o.id === val)) {
            next = { ...next, [depId]: "" };
            changed = true;
          }
        } else if (depField.kind === "selectList" && depField.catalogRef) {
          const sel = scratchGetStringArray(next, depId);
          if (sel.length === 0) continue;
          const opts = optionsForPlanningCatalogRefScoped(depField.catalogRef, bundle, cid, true);
          const allowed = new Set(opts.map((o) => o.id));
          const filtered = sel.filter((id) => allowed.has(id));
          if (filtered.length !== sel.length) {
            next = { ...next, [depId]: filtered };
            changed = true;
          }
        }
      }
      return changed ? next : s0;
    });
  }, [open, bundle, effectiveSelectedType, clientScopedFieldId, clientKeyForScope]);

  const submit = async () => {
    const t = effectiveSelectedType;
    if (!t || !bundle) return;
    const reqErrs = validatePlanningScratchInputs(t, scratch as Record<string, unknown>);
    const contactErrs = validatePlanningScratchUseContacts(t, scratch as Record<string, unknown>);
    const allErrs = [...reqErrs, ...contactErrs];
    if (allErrs.length > 0) {
      toast.error(allErrs.length === 1 ? allErrs[0]! : `Controlla: ${allErrs.join(" · ")}`);
      return;
    }
    try {
      const payload = buildPayload(t, scratch);
      const agenda = normalizeAgendaSettingsFromApp(bundle.settings);
      if (payload.reminderAt) {
        const av = agendaViolationForDateTime(payload.reminderAt, agenda);
        if (av) {
          toast.error(av);
          return;
        }
      }
      for (const f of t.fields) {
        if (!planningFieldIsActive(f) || f.kind !== "datetime") continue;
        const raw = typeof payload.fieldValues?.[f.id] === "string" ? payload.fieldValues![f.id] : "";
        if (typeof raw !== "string" || !raw.trim()) continue;
        const av = agendaViolationForDateTime(raw, agenda);
        if (av) {
          toast.error(`${fieldHeader(f)}: ${av}`);
          return;
        }
      }
      if (mode === "edit" && editing) await onSaveEdit(editing.id, payload);
      else await onSaveCreate(t.id, payload);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  if (!open) return null;

  const title = mode === "edit" ? "Modifica attività" : "Nuova attività";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="planning-act-title"
        className="flex max-h-[min(94vh,920px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-950 dark:shadow-black/40 dark:ring-white/5"
      >
        <div className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-violet-600/12 via-white to-emerald-600/10 px-6 py-4 dark:border-slate-800 dark:from-violet-500/20 dark:via-slate-950 dark:to-emerald-900/15">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="planning-act-title" className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {title}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {mode === "create"
                  ? "Scegli il tipo e compila i campi: layout su più colonne su schermi larghi."
                  : "Aggiorna i valori e conferma con Salva."}
              </p>
            </div>
            <button
              type="button"
              aria-label="Chiudi"
              onClick={onClose}
              disabled={saving}
              className="shrink-0 rounded-xl border border-slate-200 bg-white/80 p-2.5 text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-violet-subtle">
          {!bundle || types.length === 0 ? (
            <p className="text-sm text-slate-500">Carico i dati o nessun tipo definito.</p>
          ) : (
            <div className="flex flex-col gap-6">
              <label className="flex max-w-2xl flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Tipo di attività
                </span>
                {mode === "edit" && effectiveSelectedType ? (
                  <span className="rounded-xl border border-violet-200/80 bg-violet-50/80 px-4 py-3 text-sm font-semibold text-violet-950 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-100">
                    {(effectiveSelectedType.name || "").trim() || "(senza nome)"}
                  </span>
                ) : (
                  <select
                    value={selectedTypeId}
                    onChange={(e) => setSelectedTypeId(e.target.value)}
                    disabled={mode === "edit"}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-sm transition focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/25 dark:border-slate-600 dark:bg-slate-950"
                  >
                    <option value="">— Scegli un tipo —</option>
                    {[...types].sort((a, b) => (a.name || "").localeCompare(b.name || "", "it")).map((tp) => (
                      <option key={tp.id} value={tp.id}>
                        {(tp.name || "").trim() || "(senza nome)"}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              {!effectiveSelectedType ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                  Seleziona un tipo per vedere i campi del modulo.
                </p>
              ) : (
                <>
                  <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 shadow-inner dark:border-slate-800 dark:bg-slate-900/30 sm:p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3 dark:border-slate-700/80">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-6 w-1 shrink-0 rounded-full bg-gradient-to-b from-violet-500 to-emerald-500" aria-hidden />
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Dati attività</span>
                      </div>
                      {effectiveSelectedType.useContacts && bundle ? (
                        <PlanningContactQuickActions
                          activityType={effectiveSelectedType}
                          bundle={bundle}
                          fieldValues={scratch as Record<string, unknown>}
                          variant="form"
                        />
                      ) : null}
                    </div>
                    <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
                      {effectiveSelectedType.showStatus ? (
                        <label className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-3">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Stato{effectiveSelectedType.requireStatus ? " *" : ""}
                          </span>
                          <select
                            value={scratchGetString(scratch, "__statusId")}
                            onChange={(e) =>
                              setScratch((s0) => ({
                                ...s0,
                                __statusId: e.target.value.trim(),
                              }))
                            }
                            className={FIELD_BASE_CLASS}
                          >
                            <option value="">— Nessuno —</option>
                            {(bundle.settings.planningStates ?? [])
                              .slice()
                              .sort((a, b) => a.name.localeCompare(b.name, "it"))
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                  {s.isDefault ? " ★" : ""}
                                </option>
                              ))}
                          </select>
                        </label>
                      ) : null}
                      {effectiveSelectedType.fields.map((fi) =>
                        renderFieldEditor(fi, bundle, scratch, setScratch, fieldCellClass(fi), effectiveSelectedType),
                      )}
                    </div>
                  </div>

                  {effectiveSelectedType.showStartDate ||
                  effectiveSelectedType.showEndDate ||
                  effectiveSelectedType.showReminder ? (
                    <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 to-violet-50/30 p-4 dark:border-slate-800 dark:from-slate-900/60 dark:to-violet-950/20 sm:p-5">
                      <div className="mb-4 flex items-center gap-2 border-b border-slate-200/80 pb-3 dark:border-slate-700/80">
                        <span className="h-6 w-1 rounded-full bg-violet-400" aria-hidden />
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          Date e promemoria
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {effectiveSelectedType.showStartDate ? (
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Data inizio{effectiveSelectedType.requireStartDate ? " *" : ""}
                            </span>
                            <FriendlyDateInput
                              value={scratchGetString(scratch, "__startDate")}
                              onChange={(d) => setScratch((s0) => ({ ...s0, __startDate: d }))}
                              inputClassName={FIELD_BASE_CLASS}
                            />
                          </label>
                        ) : null}
                        {effectiveSelectedType.showEndDate ? (
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Data fine{effectiveSelectedType.requireEndDate ? " *" : ""}
                            </span>
                            <FriendlyDateInput
                              value={scratchGetString(scratch, "__endDate")}
                              onChange={(d) => setScratch((s0) => ({ ...s0, __endDate: d }))}
                              inputClassName={FIELD_BASE_CLASS}
                            />
                          </label>
                        ) : null}
                        {effectiveSelectedType.showReminder ? (
                          <div className="md:col-span-2 xl:col-span-3">
                            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Promemoria{effectiveSelectedType.requireReminder ? " *" : ""}
                            </span>
                            <FriendlyDateTimeFields
                              value={scratchGetString(scratch, "__reminderAt")}
                              onChange={(v) => setScratch((s0) => ({ ...s0, __reminderAt: v }))}
                              dateInputClassName={FIELD_BASE_CLASS}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50/90 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/80">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold shadow-sm dark:border-slate-600 dark:bg-slate-950"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={saving || !bundle || !effectiveSelectedType}
            onClick={() => void submit()}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}
