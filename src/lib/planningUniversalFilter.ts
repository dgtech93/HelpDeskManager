import { planningFieldIsActive } from "@/lib/presetCatalog";
import { labelForPlanningPicklistValue, PLANNING_CATALOG_REF_OPTIONS, type PlanningCatalogBundle } from "@/lib/planningCatalogOptions";
import { getPlanningCellText, getPlanningRowSearchBlob } from "@/lib/planningCellText";
import type { PlanningActivityStored, PlanningActivityTypeDef, PlanningCatalogRef, PlanningStateDef } from "@/types";

export const UNIVERSAL_FILTER_ANY = "any";

export function encodeColumnFilterKey(typeId: string, columnKey: string): string {
  return `col::${typeId}::${columnKey}`;
}

export function decodeColumnFilterKey(raw: string): { typeId: string; columnKey: string } | null {
  if (!raw.startsWith("col::")) return null;
  const rest = raw.slice(5);
  const i = rest.indexOf("::");
  if (i <= 0) return null;
  return { typeId: rest.slice(0, i), columnKey: rest.slice(i + 2) };
}

export function catalogFilterKey(ref: PlanningCatalogRef): string {
  return `catalog::${ref}`;
}

export function decodeCatalogFilterKey(raw: string): PlanningCatalogRef | null {
  if (!raw.startsWith("catalog::")) return null;
  const ref = raw.slice(9) as PlanningCatalogRef;
  return PLANNING_CATALOG_REF_OPTIONS.some((o) => o.value === ref) ? ref : null;
}

export type UniversalFieldOption = { value: string; label: string; group: string };

export function buildUniversalFieldFilterOptions(types: PlanningActivityTypeDef[]): UniversalFieldOption[] {
  const out: UniversalFieldOption[] = [
    { value: UNIVERSAL_FILTER_ANY, label: "Tutti i campi (testo libero)", group: "Generale" },
  ];
  for (const o of PLANNING_CATALOG_REF_OPTIONS) {
    const hasField = types.some((t) =>
      t.fields.some((f) => planningFieldIsActive(f) && f.catalogRef === o.value),
    );
    if (hasField) {
      out.push({
        value: catalogFilterKey(o.value),
        label: `Campo «${o.label}» (in ogni tipo)`,
        group: "Cataloghi",
      });
    }
  }
  const sortedTypes = [...types].sort((a, b) => (a.name || "").localeCompare(b.name || "", "it"));
  for (const t of sortedTypes) {
    const tname = (t.name || "").trim() || "Senza nome";
    for (const f of t.fields) {
      if (!planningFieldIsActive(f)) continue;
      out.push({
        value: encodeColumnFilterKey(t.id, `field:${f.id}`),
        label: `${tname} › ${(f.label || "").trim() || "Campo"}`,
        group: "Per tipo",
      });
    }
    if (t.showStatus) {
      out.push({
        value: encodeColumnFilterKey(t.id, "__statusId"),
        label: `${tname} › Stato`,
        group: "Per tipo",
      });
    }
    if (t.showStartDate) {
      out.push({
        value: encodeColumnFilterKey(t.id, "__startDate"),
        label: `${tname} › Data inizio`,
        group: "Per tipo",
      });
    }
    if (t.showEndDate) {
      out.push({
        value: encodeColumnFilterKey(t.id, "__endDate"),
        label: `${tname} › Data fine`,
        group: "Per tipo",
      });
    }
    if (t.showReminder) {
      out.push({
        value: encodeColumnFilterKey(t.id, "__reminderAt"),
        label: `${tname} › Promemoria`,
        group: "Per tipo",
      });
    }
  }
  return out;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function cellMatchesNeedle(cell: string, needle: string): boolean {
  if (!needle.trim()) return true;
  return norm(cell).includes(norm(needle));
}

export function activityMatchesUniversalFilter(params: {
  activity: PlanningActivityStored;
  types: PlanningActivityTypeDef[];
  bundle: PlanningCatalogBundle | null;
  planningStates: PlanningStateDef[];
  filterKey: string;
  needle: string;
}): boolean {
  const { activity, types, bundle, planningStates, filterKey, needle } = params;
  const n = needle.trim();
  if (!n) return true;

  const t = types.find((x) => x.id === activity.activityTypeId);
  if (!t) return false;

  if (filterKey === UNIVERSAL_FILTER_ANY) {
    const blob = getPlanningRowSearchBlob(activity, types, bundle, planningStates);
    return blob.includes(norm(n));
  }

  const cat = decodeCatalogFilterKey(filterKey);
  if (cat && bundle) {
    for (const f of t.fields) {
      if (!planningFieldIsActive(f)) continue;
      if (f.catalogRef !== cat) continue;
      const cell = getPlanningCellText(activity, `field:${f.id}`, types, bundle, planningStates);
      if (cellMatchesNeedle(cell, n)) return true;
      const map = (activity.payload?.fieldValues ?? {}) as Record<string, unknown>;
      const raw = map[f.id];
      if (f.kind === "comboBox" && typeof raw === "string" && norm(raw).includes(norm(n))) return true;
      if (f.kind === "selectList" && Array.isArray(raw)) {
        for (const id of raw) {
          if (typeof id !== "string") continue;
          const lbl = labelForPlanningPicklistValue(cat, id, bundle);
          if (cellMatchesNeedle(lbl, n) || norm(id).includes(norm(n))) return true;
        }
      }
    }
    return false;
  }

  const decoded = decodeColumnFilterKey(filterKey);
  if (decoded) {
    if (activity.activityTypeId !== decoded.typeId) return false;
    const cell = getPlanningCellText(activity, decoded.columnKey, types, bundle, planningStates);
    return cellMatchesNeedle(cell, n);
  }

  return false;
}

export function groupActivitiesByType(
  rows: PlanningActivityStored[],
  types: PlanningActivityTypeDef[],
): { type: PlanningActivityTypeDef; activities: PlanningActivityStored[] }[] {
  const order = new Map(types.map((t, i) => [t.id, i]));
  const byId = new Map(types.map((t) => [t.id, t]));
  const buckets = new Map<string, PlanningActivityStored[]>();
  for (const a of rows) {
    const k = a.activityTypeId;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(a);
  }
  return [...buckets.entries()]
    .map(([tid, activities]) => {
      const type = byId.get(tid);
      return type ? { type, activities } : null;
    })
    .filter((x): x is { type: PlanningActivityTypeDef; activities: PlanningActivityStored[] } => x !== null)
    .sort((a, b) => {
      const ia = order.get(a.type.id) ?? 999;
      const ib = order.get(b.type.id) ?? 999;
      if (ia !== ib) return ia - ib;
      return (a.type.name || "").localeCompare(b.type.name || "", "it");
    });
}
