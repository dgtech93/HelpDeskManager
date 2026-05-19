import { planningFieldIsActive } from "@/lib/presetCatalog";
import type { PlanningActivityStored, PlanningActivityTypeDef } from "@/types";

export function planningActivityReferencesClient(
  activity: PlanningActivityStored,
  types: PlanningActivityTypeDef[],
  clientId: string,
): boolean {
  const t = types.find((x) => x.id === activity.activityTypeId);
  if (!t) return false;
  const map = (activity.payload?.fieldValues ?? {}) as Record<string, unknown>;
  for (const f of t.fields) {
    if (!planningFieldIsActive(f)) continue;
    if (f.catalogRef !== "clients") continue;
    const raw = map[f.id];
    if (f.kind === "comboBox" && typeof raw === "string" && raw.trim() === clientId) return true;
    if (f.kind === "selectList" && Array.isArray(raw) && raw.some((id) => id === clientId)) return true;
  }
  return false;
}

export function filterPlanningActivitiesForClient(
  activities: PlanningActivityStored[],
  types: PlanningActivityTypeDef[],
  clientId: string,
): PlanningActivityStored[] {
  return activities.filter((a) => planningActivityReferencesClient(a, types, clientId));
}
