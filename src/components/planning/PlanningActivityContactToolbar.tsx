import { consolidatePlanningPayloadFieldMap } from "@/lib/presetCatalog";
import type { PlanningCatalogBundle } from "@/lib/planningCatalogOptions";
import type { PlanningActivityStored, PlanningActivityTypeDef } from "@/types";
import { PlanningContactQuickActions } from "@/components/planning/PlanningContactQuickActions";

export function PlanningActivityContactToolbar(props: {
  activity: PlanningActivityStored;
  activityType: PlanningActivityTypeDef | undefined;
  bundle: PlanningCatalogBundle | null;
  toolbarPlacement?: "end" | "start";
}) {
  const { activity, activityType, bundle, toolbarPlacement } = props;
  const fv = consolidatePlanningPayloadFieldMap(activity.payload ?? {}) as Record<string, unknown>;
  return (
    <PlanningContactQuickActions
      activityType={activityType}
      bundle={bundle}
      fieldValues={fv}
      variant="toolbar"
      toolbarPlacement={toolbarPlacement ?? "end"}
    />
  );
}