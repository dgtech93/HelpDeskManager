import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { Pencil, Plus, Trash2, CircleCheck, Inbox, CalendarDays, Undo2, Trash, ClipboardList } from "lucide-react";
import { AppPageHeader } from "@/components/layout/AppPageChrome";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import { newCatalogId, consolidatePlanningPayloadFieldMap, planningFieldIsActive, defaultPlanningStateId } from "@/lib/presetCatalog";
import { labelForPlanningPicklistValue, type PlanningCatalogBundle } from "@/lib/planningCatalogOptions";
import { getPlanningCellText } from "@/lib/planningCellText";
import { dispatchPlanningActivitiesChanged } from "@/lib/planningReminderPreAlert";
import {
  UNIVERSAL_FILTER_ANY,
  activityMatchesUniversalFilter,
  buildUniversalFieldFilterOptions,
  groupActivitiesByType,
} from "@/lib/planningUniversalFilter";
import { hueForActivityType } from "@/lib/agendaPlanning";
import { PlanningActivityEditorModal } from "@/components/PlanningActivityEditorModal";
import { PlanningActivityContactToolbar } from "@/components/planning/PlanningActivityContactToolbar";
import { PlanningBulkDeleteDialog } from "@/components/PlanningBulkDeleteDialog";
import { PlanningBulkInsertDialog } from "@/components/PlanningBulkInsertDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type {
  PlanningActivityPayload,
  PlanningActivityStored,
  PlanningActivityTypeDef,
  PlanningCustomFieldKind,
  PlanningFieldDef,
  PlanningStateButtonRole,
  PlanningStateDef,
} from "@/types";

/** Pulsanti stato rapido: solo icona; uso di title per tooltip al passaggio del cursore. */
const quickStatusIconBtn =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-sm transition hover:brightness-[1.06] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-35 dark:focus-visible:ring-offset-slate-950";

/** Voce fissa in sidebar: elenco attività con promemoria (data/ora) già passato. */
const PLANNING_EXPIRED_TAB_ID = "__planning_expired_reminders__";

function activityReminderAtMs(
  a: PlanningActivityStored,
  types: PlanningActivityTypeDef[],
): number | null {
  const t = types.find((x) => x.id === a.activityTypeId);
  if (!t?.showReminder) return null;
  const raw = typeof a.payload?.reminderAt === "string" ? a.payload.reminderAt.trim() : "";
  if (!raw) return null;
  const rem = new Date(raw);
  if (Number.isNaN(rem.getTime())) return null;
  return rem.getTime();
}

/** Promemoria con data/ora nel passato (escluso se tipo senza promemoria). */
function isActivityReminderExpired(a: PlanningActivityStored, types: PlanningActivityTypeDef[], nowMs: number): boolean {
  const ms = activityReminderAtMs(a, types);
  if (ms == null) return false;
  return nowMs > ms;
}

/** Pulsanti stato rapidi (solo se il tipo espone flag e catalogo stato ha ruoli). */
function PlanningQuickStatusToolbar(props: {
  activityId: string;
  activityType: PlanningActivityTypeDef | undefined;
  planningStates: PlanningStateDef[];
  patchActivityPayload: (
    activityId: string,
    updater: (p: PlanningActivityPayload) => PlanningActivityPayload,
  ) => void | Promise<void>;
}) {
  const { activityId, activityType, planningStates, patchActivityPayload } = props;
  const hasAnyQuick =
    activityType?.showBtnCompleted ||
    activityType?.showBtnTodo ||
    activityType?.showBtnPlanned ||
    activityType?.showBtnRestoreStatus;
  if (!hasAnyQuick) return null;

  return (
    <div className="flex min-w-0 max-w-full flex-col items-end gap-2">
      <span className="text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
        Stato rapido · tooltip sulle icone
      </span>
      <div
        className="flex min-w-0 flex-wrap items-center justify-end gap-2 rounded-2xl border border-slate-200/95 bg-white/95 p-2 shadow-sm ring-1 ring-slate-900/[0.04] dark:border-slate-600/90 dark:bg-slate-950/60 dark:ring-white/[0.05]"
        role="group"
        aria-label="Stato rapido"
      >
      {activityType?.showBtnCompleted && findPlanningStateButton(planningStates, "completed") ? (
        <button
          type="button"
          aria-label="Segna come completato"
          title="Segna come completato — applica lo stato «completato» del catalogo"
          className={`${quickStatusIconBtn} border-emerald-200/95 bg-emerald-50/95 text-emerald-700 dark:border-emerald-800/80 dark:bg-emerald-950/55 dark:text-emerald-300`}
          onClick={() => {
            const tgt = findPlanningStateButton(planningStates, "completed");
            if (!tgt) return;
            void patchActivityPayload(activityId, (p) => ({ ...p, statusId: tgt.id }));
          }}
        >
          <CircleCheck size={20} strokeWidth={1.85} aria-hidden />
        </button>
      ) : null}
      {activityType?.showBtnTodo && findPlanningStateButton(planningStates, "todo") ? (
        <button
          type="button"
          aria-label="Segna come da fare"
          title="Segna come da fare — applica lo stato «da fare» del catalogo"
          className={`${quickStatusIconBtn} border-amber-200/95 bg-amber-50/95 text-amber-800 dark:border-amber-800/75 dark:bg-amber-950/45 dark:text-amber-200`}
          onClick={() => {
            const tgt = findPlanningStateButton(planningStates, "todo");
            if (!tgt) return;
            void patchActivityPayload(activityId, (p) => ({ ...p, statusId: tgt.id }));
          }}
        >
          <Inbox size={20} strokeWidth={1.85} aria-hidden />
        </button>
      ) : null}
      {activityType?.showBtnPlanned && findPlanningStateButton(planningStates, "planned") ? (
        <button
          type="button"
          aria-label="Segna come pianificato"
          title="Segna come pianificato — applica lo stato «pianificato» del catalogo"
          className={`${quickStatusIconBtn} border-sky-200/95 bg-sky-50/95 text-sky-800 dark:border-sky-800/75 dark:bg-sky-950/50 dark:text-sky-300`}
          onClick={() => {
            const tgt = findPlanningStateButton(planningStates, "planned");
            if (!tgt) return;
            void patchActivityPayload(activityId, (p) => ({ ...p, statusId: tgt.id }));
          }}
        >
          <CalendarDays size={20} strokeWidth={1.85} aria-hidden />
        </button>
      ) : null}
      {activityType?.showBtnRestoreStatus ? (
        <button
          type="button"
          aria-label="Ripristina stato"
          title="Ripristina stato — riallinea allo stato predefinito del tipo attività"
          className={`${quickStatusIconBtn} border-slate-200/95 bg-slate-100/95 text-slate-700 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200`}
          onClick={() => {
            void patchActivityPayload(activityId, (p) => {
              const tgt = findPlanningStateButton(planningStates, "restore");
              const n = { ...p };
              if (tgt) n.statusId = tgt.id;
              else delete n.statusId;
              return n;
            });
          }}
        >
          <Undo2 size={20} strokeWidth={1.85} aria-hidden />
        </button>
      ) : null}
      </div>
    </div>
  );
}

function fieldHeader(f: PlanningFieldDef): string {
  const t = f.label?.trim();
  if (t) return t;
  return "—";
}

function fmtScalar(kind: Exclude<PlanningCustomFieldKind, "comboBox" | "selectList">, raw: unknown): string {
  if (raw === null || raw === undefined) return "—";
  if (kind === "boolean") return raw ? "Sì" : "No";
  if (kind === "longText") {
    const s = String(raw).replace(/\r\n/g, "\n").trim();
    if (!s) return "—";
    const oneLine = s.replace(/\n/g, " ").replace(/\s{2,}/g, " ");
    return oneLine.length > 160 ? `${oneLine.slice(0, 157)}…` : oneLine;
  }
  return String(raw);
}

type PlanningTableColumn = { key: string; label: string };

function buildPlanningTableColumns(t: PlanningActivityTypeDef): PlanningTableColumn[] {
  const cols: PlanningTableColumn[] = [];
  for (const f of t.fields) {
    if (!planningFieldIsActive(f)) continue;
    cols.push({ key: `field:${f.id}`, label: fieldHeader(f) });
  }
  if (t.showStatus) cols.push({ key: "__statusId", label: "Stato" });
  if (t.showStartDate) cols.push({ key: "__startDate", label: "Data inizio" });
  if (t.showEndDate) cols.push({ key: "__endDate", label: "Data fine" });
  if (t.showReminder) cols.push({ key: "__reminderAt", label: "Promemoria" });
  return cols;
}

function findPlanningStateButton(
  states: PlanningStateDef[],
  role: PlanningStateButtonRole,
): PlanningStateDef | undefined {
  return states.find((s) => s.associateButton && s.buttonRole === role);
}

function cellForPlanningColumn(
  a: PlanningActivityStored,
  columnKey: string,
  types: PlanningActivityTypeDef[],
  bundle: PlanningCatalogBundle | null,
): string {
  const t = types.find((x) => x.id === a.activityTypeId);
  const p = a.payload ?? {};
  const map = consolidatePlanningPayloadFieldMap(p);

  if (columnKey.startsWith("field:")) {
    const fid = columnKey.slice("field:".length);
    if (!t || !fid) return "—";
    const f = t.fields.find((x) => x.id === fid);
    if (!f || !planningFieldIsActive(f)) return "—";
    const raw = map[f.id];
    if (raw === undefined || raw === null) return "—";
    if ((f.kind === "comboBox" || f.kind === "selectList") && f.catalogRef && bundle) {
      return labelForPlanningPicklistValue(f.catalogRef, raw, bundle);
    }
    if (f.kind !== "comboBox" && f.kind !== "selectList" && f.kind !== "none") {
      return fmtScalar(f.kind, raw);
    }
    return "—";
  }

  if (columnKey === "__startDate") {
    const v = typeof p.startDate === "string" ? p.startDate.trim() : "";
    return v || "—";
  }
  if (columnKey === "__endDate") {
    const v = typeof p.endDate === "string" ? p.endDate.trim() : "";
    return v || "—";
  }
  if (columnKey === "__reminderAt") {
    const v = typeof p.reminderAt === "string" ? p.reminderAt.trim() : "";
    if (!v) return "—";
    try {
      return new Date(v).toLocaleString("it-IT");
    } catch {
      return v;
    }
  }

  if (columnKey === "__fallback") {
    const { lines } = describeActivity(a, types, bundle);
    return lines.length ? lines.join(" · ") : "—";
  }

  return "—";
}

function describeActivity(
  a: PlanningActivityStored,
  types: PlanningActivityTypeDef[],
  bundle: PlanningCatalogBundle | null,
): { typeName: string; lines: string[] } {
  const t = types.find((x) => x.id === a.activityTypeId);
  const title = t?.name ?? "Tipo sconosciuto";
  const lines: string[] = [];
  const p = a.payload ?? {};
  const map = consolidatePlanningPayloadFieldMap(p);
  if (!t) {
    for (const [k, v] of Object.entries(map)) lines.push(`${k}: ${String(v)}`);
    return { typeName: title, lines };
  }
  for (const f of t.fields) {
    if (!planningFieldIsActive(f)) continue;
    const raw = map[f.id];
    if (raw === undefined || raw === null) continue;
    const head = fieldHeader(f);
    const reminderOnlyVal = Boolean(f.visibleInReminderSidebar);
    if ((f.kind === "comboBox" || f.kind === "selectList") && f.catalogRef && bundle) {
      const val = labelForPlanningPicklistValue(f.catalogRef, raw, bundle);
      lines.push(reminderOnlyVal ? val : `${head}: ${val}`);
    } else if (f.kind !== "comboBox" && f.kind !== "selectList" && f.kind !== "none") {
      const val = fmtScalar(f.kind, raw);
      lines.push(reminderOnlyVal ? val : `${head}: ${val}`);
    }
  }
  if (t.showStartDate && typeof p.startDate === "string" && p.startDate.trim()) {
    lines.push(`Data inizio: ${p.startDate}`);
  }
  if (t.showEndDate && typeof p.endDate === "string" && p.endDate.trim()) {
    lines.push(`Data fine: ${p.endDate}`);
  }
  if (t.showReminder && typeof p.reminderAt === "string" && p.reminderAt.trim()) {
    lines.push(`Promemoria: ${new Date(p.reminderAt).toLocaleString()}`);
  }
  return { typeName: title, lines };
}

/** Una riga per la colonna «Campi» nelle tabelle raggruppate (ricerca / scadute). */
function activityGroupedTablePreviewLine(
  a: PlanningActivityStored,
  types: PlanningActivityTypeDef[],
  bundle: PlanningCatalogBundle | null,
  planningStates: PlanningStateDef[],
): string {
  const { lines } = describeActivity(a, types, bundle);
  const td = types.find((x) => x.id === a.activityTypeId);
  const statusLine =
    td?.showStatus && bundle
      ? getPlanningCellText(a, "__statusId", types, bundle, planningStates)
      : null;
  const parts: string[] = [];
  if (statusLine && statusLine !== "—") parts.push(`Stato: ${statusLine}`);
  parts.push(...lines);
  return parts.length ? parts.join(" · ") : "—";
}

function formatCreatedAt(createdAt: string): { full: string; short: string } {
  try {
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return { full: createdAt, short: createdAt };
    return {
      full: d.toLocaleString("it-IT"),
      short: d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  } catch {
    return { full: createdAt, short: createdAt };
  }
}

export function PianificazionePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [busy, setBusy] = useState(true);
  const [types, setTypes] = useState<PlanningActivityTypeDef[]>([]);
  const [activities, setActivities] = useState<PlanningActivityStored[]>([]);
  const [planningStates, setPlanningStates] = useState<PlanningStateDef[]>([]);
  const [bundle, setBundle] = useState<PlanningCatalogBundle | null>(null);

  const sortedPlanningStates = useMemo(() => [...planningStates].sort((a, b) => a.name.localeCompare(b.name, "it")), [
    planningStates,
  ]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingActivity, setEditingActivity] = useState<PlanningActivityStored | null>(null);
  const [modalInstance, setModalInstance] = useState(0);

  const [saveBusy, setSaveBusy] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkInsertOpen, setBulkInsertOpen] = useState(false);
  const [bulkInsertBusy, setBulkInsertBusy] = useState(false);

  const [universalFilterFieldKey, setUniversalFilterFieldKey] = useState(UNIVERSAL_FILTER_ANY);
  const [universalFilterNeedle, setUniversalFilterNeedle] = useState("");

  const [planningNowMs, setPlanningNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setPlanningNowMs(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const reload = async () => {
    const settings = await api.getSettings();
    setTypes(settings.planningActivityTypes ?? []);
    setActivities(settings.planningActivities ?? []);
    setPlanningStates(settings.planningStates ?? []);
    return settings;
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!api.isTauriRuntime()) {
        setBusy(false);
        return;
      }
      setBusy(true);
      try {
        const [settings, clients, collaborators, contacts, roles] = await Promise.all([
          reload(),
          api.getClientsAll(),
          api.getCollaborators(),
          api.getAllContacts(),
          api.getCollaboratorRoles(),
        ]);
        if (!cancelled) setBundle({ settings, clients, collaborators, contacts, roles });
      } catch (e) {
        if (!cancelled) toast.error(formatErr(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedActivities = useMemo(() => [...activities].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), [
    activities,
  ]);

  const activityCountByTypeId = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of activities) {
      const k = a.activityTypeId;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [activities]);

  const expiredCount = useMemo(
    () => activities.reduce((n, a) => n + (isActivityReminderExpired(a, types, planningNowMs) ? 1 : 0), 0),
    [activities, types, planningNowMs],
  );

  const typeIdsWithExpiredReminders = useMemo(() => {
    const s = new Set<string>();
    for (const a of activities) {
      if (isActivityReminderExpired(a, types, planningNowMs)) s.add(a.activityTypeId);
    }
    return s;
  }, [activities, types, planningNowMs]);

  const expiredActivitiesGrouped = useMemo(() => {
    const list = activities.filter((a) => isActivityReminderExpired(a, types, planningNowMs));
    const grouped = groupActivitiesByType(list, types);
    return grouped.map((g) => ({
      ...g,
      activities: [...g.activities].sort((a, b) => {
        const ma = activityReminderAtMs(a, types) ?? 0;
        const mb = activityReminderAtMs(b, types) ?? 0;
        return ma - mb;
      }),
    }));
  }, [activities, types, planningNowMs]);

  const sortedTypesAlphabetical = useMemo(
    () => [...types].sort((a, b) => (a.name || "").localeCompare(b.name || "", "it")),
    [types],
  );

  const universalFieldOptions = useMemo(() => buildUniversalFieldFilterOptions(types), [types]);
  const universalFieldOptionGroups = useMemo(
    () => [...new Set(universalFieldOptions.map((o) => o.group))],
    [universalFieldOptions],
  );

  const searchNeedleTrimmed = universalFilterNeedle.trim();
  const searchFilterActive = searchNeedleTrimmed.length > 0;

  const universalSearchMatches = useMemo(() => {
    if (!searchFilterActive || !bundle) return null;
    return activities.filter((a) =>
      activityMatchesUniversalFilter({
        activity: a,
        types,
        bundle,
        planningStates,
        filterKey: universalFilterFieldKey,
        needle: searchNeedleTrimmed,
      }),
    );
  }, [
    searchFilterActive,
    bundle,
    activities,
    types,
    planningStates,
    universalFilterFieldKey,
    searchNeedleTrimmed,
  ]);

  const universalSearchGrouped = useMemo(() => {
    if (!universalSearchMatches) return null;
    return groupActivitiesByType(universalSearchMatches, types);
  }, [universalSearchMatches, types]);

  const [selectedPlanningTypeId, setSelectedPlanningTypeId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPlanningTypeId((prev) => {
      if (prev === PLANNING_EXPIRED_TAB_ID) return prev;
      if (prev && types.some((t) => t.id === prev)) return prev;
      const preferred = sortedTypesAlphabetical.find((t) => activities.some((a) => a.activityTypeId === t.id));
      return preferred?.id ?? sortedTypesAlphabetical[0]?.id ?? null;
    });
  }, [types, activities, sortedTypesAlphabetical]);

  const [focusedActivityId, setFocusedActivityId] = useState<string | null>(null);

  const rowsForSelectedType = useMemo(
    () => sortedActivities.filter((a) => a.activityTypeId === selectedPlanningTypeId),
    [sortedActivities, selectedPlanningTypeId],
  );

  const resolvedFocusActivityId = useMemo(() => {
    if (!rowsForSelectedType.length) return null;
    if (focusedActivityId && rowsForSelectedType.some((r) => r.id === focusedActivityId))
      return focusedActivityId;
    return rowsForSelectedType[0].id;
  }, [rowsForSelectedType, focusedActivityId]);

  const resolvedFocusActivity = useMemo(() => {
    if (!resolvedFocusActivityId) return null;
    return activities.find((a) => a.id === resolvedFocusActivityId) ?? null;
  }, [activities, resolvedFocusActivityId]);

  const selectedTypeDef = selectedPlanningTypeId
    ? selectedPlanningTypeId === PLANNING_EXPIRED_TAB_ID
      ? undefined
      : (types.find((x) => x.id === selectedPlanningTypeId) ?? undefined)
    : undefined;

  const persistActivities = async (next: PlanningActivityStored[], successToast?: string) => {
    await api.updateSettings({ planningActivities: next });
    const s = await reload();
    setBundle((bb) => (bb ? { ...bb, settings: s } : bb));
    toast.success(successToast ?? "Elenco pianificazioni aggiornato");
    dispatchPlanningActivitiesChanged();
  };

  const patchActivityPayload = async (
    activityId: string,
    updater: (p: PlanningActivityPayload) => PlanningActivityPayload,
  ) => {
    await persistActivities(
      activities.map((x) => {
        if (x.id !== activityId) return x;
        const base: PlanningActivityPayload = {
          ...(x.payload ?? {}),
          fieldValues: { ...(x.payload?.fieldValues ?? {}) },
        };
        return { ...x, payload: updater(base) };
      }),
    );
  };

  const removeConfirmed = async (id: string) => {
    try {
      await persistActivities(activities.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const openEdit = useCallback((row: PlanningActivityStored) => {
    setEditingActivity(row);
    setModalMode("edit");
    setModalInstance((n) => n + 1);
    setModalOpen(true);
  }, []);

  const activityIdFromUrl = searchParams.get("activity")?.trim() ?? "";

  useEffect(() => {
    if (busy || !bundle || types.length === 0 || !activityIdFromUrl) return;
    const row = activities.find((a) => a.id === activityIdFromUrl);
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete("activity");
        return n;
      },
      { replace: true },
    );
    if (!row) return;
    setUniversalFilterNeedle("");
    setSelectedPlanningTypeId(row.activityTypeId);
    setFocusedActivityId(row.id);
    openEdit(row);
  }, [busy, bundle, types.length, activities, activityIdFromUrl, setSearchParams, openEdit]);

  const openCreate = () => {
    setEditingActivity(null);
    setModalMode("create");
    setModalInstance((n) => n + 1);
    setModalOpen(true);
  };

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-5 overflow-hidden">
      <AppPageHeader
        className="shrink-0"
        icon={ClipboardList}
        accent="violet"
        title="Pianificazione"
        description="Elenco attività per tipo, con filtri e modifica rapida."
      />

      {!api.isTauriRuntime() ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Avvia l&apos;app desktop Tauri (<code className="rounded bg-slate-100 px-1 dark:bg-slate-800">npm run tauri dev</code>
          ).
        </p>
      ) : busy ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Caricamento…</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          {!bundle || types.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">Nessun tipo definito in Impostazioni.</p>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden lg:flex-row lg:gap-5">
              <aside className="flex max-h-[40vh] w-full shrink-0 flex-col gap-3 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-950/85 dark:ring-white/5 lg:max-h-none lg:w-[13.5rem] lg:flex-none xl:w-[15rem]">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Tipo di attività
                </h3>
                <nav
                  aria-label="Seleziona tipo di attività"
                  className="scrollbar-violet-subtle flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5"
                >
                  {sortedTypesAlphabetical.map((t) => {
                    const c = activityCountByTypeId.get(t.id) ?? 0;
                    const active = t.id === selectedPlanningTypeId;
                    const hasExpired = typeIdsWithExpiredReminders.has(t.id);
                    const hue = hueForActivityType(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        title={hasExpired ? "Contiene attività con promemoria scaduto" : undefined}
                        onClick={() => {
                          setSelectedPlanningTypeId(t.id);
                          setFocusedActivityId(null);
                        }}
                        className={`relative flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition ${
                          active
                            ? "z-[1] -translate-y-1.5 border-slate-300/95 bg-white text-slate-900 shadow-[0_12px_28px_-8px_rgba(0,0,0,0.2),0_4px_12px_-4px_rgba(0,0,0,0.12),inset_0_1px_0_0_rgba(255,255,255,0.9)] ring-2 ring-offset-2 ring-offset-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50 dark:shadow-[0_14px_36px_-10px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.06)] dark:ring-offset-slate-950"
                            : "border-slate-200/85 bg-slate-50/90 text-slate-800 hover:brightness-[0.98] dark:border-slate-700/80 dark:bg-slate-900/55 dark:text-slate-100 dark:hover:bg-slate-800/85"
                        }`}
                        style={
                          {
                            borderLeftWidth: 5,
                            borderLeftStyle: "solid",
                            borderLeftColor: `hsl(${hue} 58% 46%)`,
                            ...(active
                              ? {
                                  boxShadow: `0 10px 26px -10px hsla(${hue}, 55%, 38%, 0.45), 0 4px 14px -6px hsla(${hue}, 50%, 30%, 0.25), inset 0 1px 0 0 rgba(255,255,255,0.65)`,
                                  ["--tw-ring-color" as string]: `hsl(${hue} 50% 52%)`,
                                }
                              : {}),
                          } as CSSProperties
                        }
                      >
                        {hasExpired ? (
                          <span
                            className="shrink-0 rounded-full bg-rose-500 shadow-sm ring-2 ring-white dark:ring-slate-900"
                            style={{ width: 7, height: 7 }}
                            aria-hidden
                          />
                        ) : (
                          <span className="w-1.5 shrink-0" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {(t.name || "").trim() || "(Senza nome)"}
                        </span>
                        <span
                          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums shadow-sm ${
                            hasExpired
                              ? "bg-rose-100 text-rose-900 ring-1 ring-rose-300/80 dark:bg-rose-950/80 dark:text-rose-100 dark:ring-rose-700/60"
                              : "bg-white/95 text-slate-700 dark:bg-slate-950/65 dark:text-slate-300"
                          }`}
                        >
                          {c}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectedPlanningTypeId === PLANNING_EXPIRED_TAB_ID}
                    onClick={() => {
                      setSelectedPlanningTypeId(PLANNING_EXPIRED_TAB_ID);
                      setFocusedActivityId(null);
                    }}
                    className={`relative mt-2 flex w-full items-center gap-2 rounded-xl border-2 px-3 py-3 text-left font-semibold transition ${
                      selectedPlanningTypeId === PLANNING_EXPIRED_TAB_ID
                        ? "z-[2] -translate-y-2 border-rose-600 bg-gradient-to-br from-rose-100 via-amber-50 to-orange-50 text-rose-950 shadow-[0_16px_40px_-12px_rgba(225,29,72,0.55),0_6px_18px_-8px_rgba(234,88,12,0.35),inset_0_2px_0_0_rgba(255,255,255,0.85)] ring-4 ring-rose-400/45 ring-offset-2 ring-offset-white dark:border-rose-500 dark:from-rose-950/90 dark:via-amber-950/50 dark:to-orange-950/40 dark:text-rose-50 dark:shadow-[0_18px_44px_-12px_rgba(225,29,72,0.65)] dark:ring-rose-400/50 dark:ring-offset-slate-950"
                        : expiredCount > 0
                          ? "border-rose-500/90 bg-gradient-to-r from-rose-50 via-amber-50/90 to-orange-50/70 text-rose-950 shadow-lg shadow-rose-200/40 ring-2 ring-rose-300/50 hover:shadow-xl hover:ring-rose-400/55 dark:border-rose-700 dark:from-rose-950/55 dark:via-amber-950/35 dark:to-orange-950/25 dark:text-rose-100 dark:shadow-black/40 dark:ring-rose-800/50"
                          : "border-dashed border-amber-300/80 bg-gradient-to-br from-amber-50/80 to-slate-50/50 text-amber-950 shadow-sm hover:border-amber-400 hover:from-amber-50 hover:to-slate-50 dark:border-amber-800/70 dark:from-amber-950/30 dark:to-slate-900/50 dark:text-amber-100 dark:hover:border-amber-600"
                    } `}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight">
                      Attività scadute
                    </span>
                    <span className="shrink-0 rounded-lg bg-white/95 px-2 py-0.5 text-[11px] font-bold tabular-nums text-rose-700 shadow-inner ring-1 ring-rose-200 dark:bg-rose-950/90 dark:text-rose-200 dark:ring-rose-800/80">
                      {expiredCount}
                    </span>
                  </button>
                </nav>
              </aside>

              <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-950/80 dark:ring-white/5">
                <div className="shrink-0 space-y-2 border-b border-slate-200/80 bg-slate-50/90 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/55">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[min(100%,16rem)] flex-1">
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                        Campo
                      </label>
                      <select
                        value={universalFilterFieldKey}
                        onChange={(e) => setUniversalFilterFieldKey(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                      >
                        {universalFieldOptionGroups.map((g) => {
                          const opts = universalFieldOptions.filter((o) => o.group === g);
                          return (
                            <optgroup key={g} label={g}>
                              {opts.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                    </div>
                    <div className="min-w-[min(100%,14rem)] flex-[2]">
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                        Cerca
                      </label>
                      <input
                        value={universalFilterNeedle}
                        onChange={(e) => setUniversalFilterNeedle(e.target.value)}
                        placeholder="Testo da trovare nel campo scelto…"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-950"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!universalFilterNeedle.trim()}
                      onClick={() => setUniversalFilterNeedle("")}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                    >
                      Pulisci
                    </button>
                  </div>
                  {searchFilterActive ? (
                    <p className="text-xs text-violet-800 dark:text-violet-200/95">
                      Ricerca universale · risultati raggruppati per tipo ({universalSearchMatches?.length ?? 0}). La tabella standard del tipo selezionato è nascosta finché il testo è valorizzato.
                    </p>
                  ) : null}
                </div>
                <header className="shrink-0 border-b border-slate-200/85 bg-gradient-to-b from-slate-50/98 via-slate-50/90 to-white px-4 py-3.5 dark:border-slate-800 dark:from-slate-900/75 dark:via-slate-900/65 dark:to-slate-950/90">
                  <div className="flex flex-col items-stretch gap-3">
                    <div className="flex flex-wrap items-center gap-2.5 gap-y-3">
                      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 empty:hidden">
                        {!searchFilterActive && resolvedFocusActivity && bundle ? (
                          <PlanningActivityContactToolbar
                            activity={resolvedFocusActivity}
                            activityType={types.find((x) => x.id === resolvedFocusActivity.activityTypeId)}
                            bundle={bundle}
                            toolbarPlacement="start"
                          />
                        ) : null}
                      </div>
                      <div className="flex min-w-[min(100%,12rem)] flex-1 flex-wrap items-center justify-end gap-2.5">
                      <button
                        type="button"
                        disabled={
                          searchFilterActive ||
                          !bundle ||
                          !selectedTypeDef ||
                          rowsForSelectedType.length === 0 ||
                          selectedPlanningTypeId === PLANNING_EXPIRED_TAB_ID
                        }
                        onClick={() => setBulkOpen(true)}
                        className="inline-flex min-h-[2.5rem] shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-200/90 bg-white px-3.5 py-2 text-[13px] font-medium text-rose-800 shadow-sm transition hover:border-rose-300 hover:bg-rose-50/90 disabled:pointer-events-none disabled:opacity-45 dark:border-rose-900/55 dark:bg-slate-950 dark:text-rose-200 dark:hover:bg-rose-950/40"
                      >
                        <Trash size={16} strokeWidth={2.1} aria-hidden /> Eliminazione massiva
                      </button>
                      <button
                        type="button"
                        disabled={searchFilterActive || !bundle || !selectedTypeDef}
                        onClick={() => setBulkInsertOpen(true)}
                        className="inline-flex min-h-[2.5rem] shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200/95 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-800 shadow-sm transition hover:border-emerald-300/80 hover:bg-emerald-50/70 disabled:pointer-events-none disabled:opacity-45 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/35"
                      >
                        <ClipboardList size={16} strokeWidth={2.1} aria-hidden /> Inserimento massivo
                      </button>
                      <button
                        type="button"
                        disabled={!bundle || !selectedPlanningTypeId || selectedPlanningTypeId === PLANNING_EXPIRED_TAB_ID}
                        onClick={openCreate}
                        className="inline-flex min-h-[2.5rem] w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-[13px] font-semibold text-white shadow-md shadow-emerald-700/20 transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-45 dark:shadow-emerald-950/30 dark:focus-visible:ring-offset-slate-950 sm:w-auto sm:min-w-[11.5rem]"
                      >
                        <Plus size={17} strokeWidth={2.25} /> Nuova attività
                      </button>
                      </div>
                    </div>

                    <div className="flex w-full flex-col items-end gap-3 border-t border-slate-200/70 pt-3 dark:border-slate-700">
                      {!searchFilterActive && resolvedFocusActivityId && selectedTypeDef ? (
                        <PlanningQuickStatusToolbar
                          activityId={resolvedFocusActivityId}
                          activityType={selectedTypeDef}
                          planningStates={planningStates}
                          patchActivityPayload={patchActivityPayload}
                        />
                      ) : (
                        <p className="max-w-xl text-right text-[13px] leading-snug text-slate-500 dark:text-slate-400">
                          {searchFilterActive
                            ? "Durante la ricerca universale gli aggiornamenti di stato rapido non sono disponibili."
                            : "Seleziona una riga nella tabella per usare i pulsanti di stato rapido."}
                        </p>
                      )}
                    </div>
                  </div>
                </header>
                {searchFilterActive && bundle ? (
                  !universalSearchGrouped || universalSearchGrouped.length === 0 ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center p-10">
                      <p className="max-w-lg text-center text-sm text-slate-500 dark:text-slate-400">
                        Nessuna attività corrisponde alla ricerca nei tipi configurati.
                      </p>
                    </div>
                  ) : (
                    <div className="scrollbar-violet-subtle flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-3">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                        Risultati per tipo
                      </h3>
                      {universalSearchGrouped.map(({ type: gtype, activities: grow }) => (
                        <div
                          key={gtype.id}
                          className="overflow-hidden rounded-xl border border-violet-200/70 bg-white dark:border-violet-800/55 dark:bg-slate-900/85"
                        >
                          <div className="flex items-center gap-2 border-b border-violet-100 bg-violet-50/95 px-3 py-2 dark:border-violet-900/70 dark:bg-violet-950/40">
                            <span className="text-sm font-bold text-violet-950 dark:text-violet-50">
                              {(gtype.name || "").trim() || "Senza nome"}
                            </span>
                            <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-semibold tabular-nums shadow-sm dark:bg-slate-950">
                              {grow.length}
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[520px] table-fixed border-collapse text-left text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/95 text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-950/95 dark:text-slate-400">
                                  <th className="px-3 py-2">Campi</th>
                                  <th className="whitespace-nowrap px-3 py-2 text-right">Creazione</th>
                                  <th className="w-px px-3 py-2 text-right">Azioni</th>
                                </tr>
                              </thead>
                              <tbody>
                                {grow.map((a) => {
                                  const preview = activityGroupedTablePreviewLine(a, types, bundle, planningStates);
                                  const when = formatCreatedAt(a.createdAt);
                                  return (
                                    <tr key={a.id} className="border-b border-slate-100 dark:border-slate-800/90">
                                      <td className="max-w-0 min-w-[8rem] px-3 py-2 align-middle text-slate-800 dark:text-slate-100">
                                        <p className="truncate text-[13px] leading-snug" title={preview}>
                                          {preview}
                                        </p>
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2 align-middle text-right text-xs tabular-nums text-slate-700 dark:text-slate-300">
                                        <time dateTime={a.createdAt} title={when.full}>
                                          {when.short}
                                        </time>
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2 align-middle text-right">
                                        <div
                                          className="inline-flex items-center gap-0.5 rounded-full border border-slate-200/85 bg-slate-50/95 p-0.5 shadow-sm dark:border-slate-600 dark:bg-slate-800/70"
                                          role="group"
                                          aria-label="Azioni riga"
                                        >
                                          <button
                                            type="button"
                                            aria-label="Modifica attività"
                                            onClick={() => openEdit(a)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition hover:bg-white hover:text-slate-900 hover:shadow-sm dark:hover:bg-slate-700 dark:hover:text-slate-100"
                                          >
                                            <Pencil size={15} />
                                          </button>
                                          <button
                                            type="button"
                                            aria-label="Elimina attività"
                                            onClick={() => setDelId(a.id)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950/60 dark:hover:text-rose-300"
                                          >
                                            <Trash2 size={15} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : selectedPlanningTypeId === PLANNING_EXPIRED_TAB_ID && bundle ? (
                  expiredActivitiesGrouped.length === 0 ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center p-10">
                      <p className="max-w-lg text-center text-sm text-slate-500 dark:text-slate-400">
                        Nessuna attività con promemoria scaduto.
                      </p>
                    </div>
                  ) : (
                    <div className="scrollbar-violet-subtle flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-3">
                      <p className="text-xs text-rose-800 dark:text-rose-200/90">
                        Promemoria con <strong>data e ora</strong> già passate, raggruppate per tipologia.
                      </p>
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                        Per tipologia
                      </h3>
                      {expiredActivitiesGrouped.map(({ type: gtype, activities: grow }) => (
                        <div
                          key={gtype.id}
                          className="overflow-hidden rounded-xl border border-rose-200/75 bg-white dark:border-rose-900/55 dark:bg-slate-900/85"
                        >
                          <div className="flex items-center gap-2 border-b border-rose-100 bg-rose-50/95 px-3 py-2 dark:border-rose-900/70 dark:bg-rose-950/35">
                            <span className="text-sm font-bold text-rose-950 dark:text-rose-100">
                              {(gtype.name || "").trim() || "Senza nome"}
                            </span>
                            <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-rose-900 shadow-sm dark:bg-slate-950 dark:text-rose-200">
                              {grow.length}
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[520px] table-fixed border-collapse text-left text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/95 text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-950/95 dark:text-slate-400">
                                  <th className="px-3 py-2">Campi</th>
                                  <th className="whitespace-nowrap px-3 py-2 text-right">Creazione</th>
                                  <th className="w-px px-3 py-2 text-right">Azioni</th>
                                </tr>
                              </thead>
                              <tbody>
                                {grow.map((a) => {
                                  const preview = activityGroupedTablePreviewLine(a, types, bundle, planningStates);
                                  const when = formatCreatedAt(a.createdAt);
                                  return (
                                    <tr key={a.id} className="border-b border-slate-100 dark:border-slate-800/90">
                                      <td className="max-w-0 min-w-[8rem] px-3 py-2 align-middle text-slate-800 dark:text-slate-100">
                                        <p className="truncate text-[13px] leading-snug" title={preview}>
                                          {preview}
                                        </p>
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2 align-middle text-right text-xs tabular-nums text-slate-700 dark:text-slate-300">
                                        <time dateTime={a.createdAt} title={when.full}>
                                          {when.short}
                                        </time>
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2 align-middle text-right">
                                        <div
                                          className="inline-flex items-center gap-0.5 rounded-full border border-slate-200/85 bg-slate-50/95 p-0.5 shadow-sm dark:border-slate-600 dark:bg-slate-800/70"
                                          role="group"
                                          aria-label="Azioni riga"
                                        >
                                          <button
                                            type="button"
                                            aria-label="Modifica attività"
                                            onClick={() => openEdit(a)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition hover:bg-white hover:text-slate-900 hover:shadow-sm dark:hover:bg-slate-700 dark:hover:text-slate-100"
                                          >
                                            <Pencil size={15} />
                                          </button>
                                          <button
                                            type="button"
                                            aria-label="Elimina attività"
                                            onClick={() => setDelId(a.id)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950/60 dark:hover:text-rose-300"
                                          >
                                            <Trash2 size={15} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : !selectedTypeDef ? (
                  <div className="flex min-h-0 flex-1 items-center justify-center p-10">
                    <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                      Nessun tipo selezionabile.
                    </p>
                  </div>
                ) : rowsForSelectedType.length === 0 ? (
                  <div className="flex min-h-0 flex-1 items-center justify-center p-10">
                    <p className="max-w-md text-center text-sm text-slate-500 dark:text-slate-400">Nessuna attività.</p>
                  </div>
                ) : (
                  (() => {
                    const groupType = selectedTypeDef!;
                    const dataColumns = buildPlanningTableColumns(groupType);
                    return (
                      <div className="scrollbar-violet-subtle min-h-0 flex-1 overflow-x-auto overflow-y-auto pr-1">
                        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-100/95 dark:border-slate-700 dark:bg-slate-900/90">
                              {dataColumns.map((col) => (
                                <th
                                  key={col.key}
                                  className="whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400"
                                >
                                  {col.label}
                                </th>
                              ))}
                              <th className="whitespace-nowrap px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                                Creazione
                              </th>
                              <th className="w-px whitespace-nowrap px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                                Azioni
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rowsForSelectedType.map((a) => {
                              const statusVal =
                                typeof a.payload?.statusId === "string" ? a.payload.statusId.trim() : "";
                              const when = formatCreatedAt(a.createdAt);
                              const rowFocused = resolvedFocusActivityId === a.id;
                              return (
                                <tr
                                  key={a.id}
                                  aria-selected={rowFocused}
                                  onClick={() => setFocusedActivityId(a.id)}
                                  className={`group cursor-pointer border-b border-slate-100 transition-colors dark:border-slate-800/90 ${
                                    rowFocused
                                      ? "bg-violet-100/75 ring-2 ring-inset ring-violet-500/35 hover:bg-violet-100/90 dark:bg-violet-950/45 dark:ring-violet-400/30 dark:hover:bg-violet-950/55"
                                      : "hover:bg-violet-50/45 dark:hover:bg-violet-950/25"
                                  }`}
                                >
                                  {dataColumns.map((col) => {
                                    if (col.key === "__statusId") {
                                      return (
                                        <td
                                          key={col.key}
                                          className="min-w-[10rem] max-w-[14rem] px-3 py-2.5 align-middle text-slate-800 dark:text-slate-100"
                                        >
                                          <select
                                            value={statusVal}
                                            onChange={(e) => {
                                              const v = e.target.value.trim();
                                              void patchActivityPayload(a.id, (p) => {
                                                const n = { ...p };
                                                if (v) n.statusId = v;
                                                else delete n.statusId;
                                                return n;
                                              });
                                            }}
                                            className="w-full max-w-[12rem] rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px] dark:border-slate-600 dark:bg-slate-950"
                                          >
                                            <option value="">— Nessuno —</option>
                                            {statusVal && !sortedPlanningStates.some((ss) => ss.id === statusVal) ? (
                                              <option value={statusVal}>
                                                Stato sconosciuto ({statusVal.slice(0, 8)}…)
                                              </option>
                                            ) : null}
                                            {sortedPlanningStates.map((s) => (
                                              <option key={s.id} value={s.id}>
                                                {s.name}
                                                {s.isDefault ? " ★" : ""}
                                              </option>
                                            ))}
                                          </select>
                                        </td>
                                      );
                                    }
                                    const raw = cellForPlanningColumn(a, col.key, types, bundle);
                                    return (
                                      <td
                                        key={col.key}
                                        className="max-w-[14rem] px-3 py-2.5 text-slate-800 dark:text-slate-100"
                                        title={raw.length > 40 ? raw : undefined}
                                      >
                                        <span className="line-clamp-2 break-words text-[13px] leading-snug">{raw}</span>
                                      </td>
                                    );
                                  })}
                                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">
                                    <time dateTime={a.createdAt} title={when.full}>
                                      {when.short}
                                    </time>
                                  </td>
                                  <td className="max-w-fit whitespace-nowrap px-3 py-2 align-middle text-right">
                                    <div
                                      className="inline-flex shrink-0 items-center justify-end"
                                      onClick={(e) => e.stopPropagation()}
                                      role="presentation"
                                    >
                                      <div
                                        className="inline-flex items-center gap-0.5 rounded-full border border-slate-200/85 bg-slate-50/95 p-0.5 shadow-sm dark:border-slate-600 dark:bg-slate-800/70"
                                        role="group"
                                        aria-label="Azioni riga"
                                      >
                                        <button
                                          type="button"
                                          aria-label="Modifica attività"
                                          onClick={() => openEdit(a)}
                                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-600 opacity-90 transition hover:bg-white hover:text-slate-900 hover:shadow-sm group-hover:opacity-100 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                                        >
                                          <Pencil size={15} />
                                        </button>
                                        <button
                                          type="button"
                                          aria-label="Elimina attività"
                                          onClick={() => setDelId(a.id)}
                                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950/60 dark:hover:text-rose-300"
                                        >
                                          <Trash2 size={15} />
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()
                )}
              </section>
            </div>
          )}
        </div>
      )}

      {modalOpen && bundle ? (
        <PlanningActivityEditorModal
          key={`${modalMode}-${editingActivity?.id ?? `new-${modalInstance}`}`}
          open
          mode={modalMode}
          editing={editingActivity}
          types={types}
          bundle={bundle}
          preferredCreateTypeId={
            modalMode === "create"
              ? selectedPlanningTypeId && selectedPlanningTypeId !== PLANNING_EXPIRED_TAB_ID
                ? selectedPlanningTypeId
                : sortedTypesAlphabetical[0]?.id ?? null
              : null
          }
          saving={saveBusy}
          onClose={() => {
            setModalOpen(false);
            setEditingActivity(null);
          }}
          onSaveCreate={async (activityTypeId, payload) => {
            setSaveBusy(true);
            try {
              const t = types.find((x) => x.id === activityTypeId);
              const def = defaultPlanningStateId(planningStates);
              let nextPayload = { ...payload } as PlanningActivityPayload;
              if (t?.showStatus && def && !(typeof nextPayload.statusId === "string" && nextPayload.statusId.trim())) {
                nextPayload = { ...nextPayload, statusId: def };
              }
              await persistActivities([
                ...activities,
                {
                  id: newCatalogId(),
                  activityTypeId,
                  payload: nextPayload,
                  createdAt: new Date().toISOString(),
                },
              ]);
            } finally {
              setSaveBusy(false);
            }
          }}
          onSaveEdit={async (id, payload) => {
            setSaveBusy(true);
            try {
              await persistActivities(
                activities.map((x) => (x.id === id ? { ...x, payload: payload as PlanningActivityPayload } : x)),
              );
            } finally {
              setSaveBusy(false);
            }
          }}
        />
      ) : null}

      {bulkInsertOpen && selectedTypeDef && bundle ? (
        <PlanningBulkInsertDialog
          open
          busy={bulkInsertBusy}
          typeDef={selectedTypeDef}
          bundle={bundle}
          planningStates={sortedPlanningStates}
          onClose={() => {
            if (!bulkInsertBusy) setBulkInsertOpen(false);
          }}
          onInsert={async (payloads) => {
            setBulkInsertBusy(true);
            try {
              const t = selectedTypeDef;
              const def = defaultPlanningStateId(planningStates);
              const appended = payloads.map((payload) => {
                let p = { ...payload } as PlanningActivityPayload;
                if (t.showStatus && def && !(typeof p.statusId === "string" && p.statusId.trim())) {
                  p = { ...p, statusId: def };
                }
                return {
                  id: newCatalogId(),
                  activityTypeId: t.id,
                  payload: p,
                  createdAt: new Date().toISOString(),
                };
              });
              await persistActivities([...activities, ...appended], `Inserite ${payloads.length} attività`);
            } catch (e) {
              toast.error(formatErr(e));
              throw e;
            } finally {
              setBulkInsertBusy(false);
            }
          }}
        />
      ) : null}

      {bulkOpen && selectedTypeDef && bundle ? (
        <PlanningBulkDeleteDialog
          open
          busy={bulkBusy}
          onClose={() => {
            if (!bulkBusy) setBulkOpen(false);
          }}
          typeDef={selectedTypeDef}
          rows={rowsForSelectedType}
          planningStates={planningStates}
          bundle={bundle}
          onConfirmDelete={async (ids: string[]) => {
            setBulkBusy(true);
            try {
              const next = activities.filter((a) => !ids.includes(a.id));
              await persistActivities(next, `Eliminate ${ids.length} attività`);
            } catch (e) {
              toast.error(formatErr(e));
              throw e;
            } finally {
              setBulkBusy(false);
            }
          }}
        />
      ) : null}

      <ConfirmDialog
        open={delId !== null}
        danger
        title="Eliminare questa attività?"
        description="Il record viene rimosso dall&apos;elenco locale."
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        onCancel={() => setDelId(null)}
        onConfirm={() => {
          const id = delId;
          setDelId(null);
          if (id) void removeConfirmed(id);
        }}
      />
    </div>
  );
}
