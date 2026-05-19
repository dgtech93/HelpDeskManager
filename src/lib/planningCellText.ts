import { consolidatePlanningPayloadFieldMap, planningFieldIsActive } from "@/lib/presetCatalog";
import { labelForPlanningPicklistValue, type PlanningCatalogBundle } from "@/lib/planningCatalogOptions";
import type {
  PlanningActivityStored,
  PlanningActivityTypeDef,
  PlanningCustomFieldKind,
  PlanningStateDef,
} from "@/types";

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

/** Testo cella come in lista (include Stato). */
export function getPlanningCellText(
  a: PlanningActivityStored,
  columnKey: string,
  types: PlanningActivityTypeDef[],
  bundle: PlanningCatalogBundle | null,
  planningStates: PlanningStateDef[],
): string {
  const t = types.find((x) => x.id === a.activityTypeId);
  const p = a.payload ?? {};
  const map = consolidatePlanningPayloadFieldMap(p);

  if (columnKey === "__statusId") {
    if (!t?.showStatus) return "—";
    const sid = typeof p.statusId === "string" ? p.statusId.trim() : "";
    if (!sid) return "—";
    const st = planningStates.find((s) => s.id === sid);
    return st ? `${st.name}${st.isDefault ? " ★" : ""}` : sid;
  }

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

  return "—";
}

/** Testo sidebar promemoria: campi con `visibleInReminderSidebar` (solo valore); con tipo «Usa contatti», combobox rubrica/collaboratori → prefisso «Contattare ». */
export function getVisibleReminderSidebarFieldsText(
  a: PlanningActivityStored,
  types: PlanningActivityTypeDef[],
  bundle: PlanningCatalogBundle | null,
  planningStates: PlanningStateDef[],
): string {
  const t = types.find((x) => x.id === a.activityTypeId);
  if (!t) return "";
  const parts: string[] = [];
  for (const f of t.fields) {
    if (!planningFieldIsActive(f)) continue;
    if (!f.visibleInReminderSidebar) continue;
    const rawTxt = getPlanningCellText(a, `field:${f.id}`, types, bundle, planningStates);
    const txt = rawTxt.trim();
    if (!txt || txt === "—") continue;
    const contactComboWithUseContacts =
      Boolean(t.useContacts) &&
      f.kind === "comboBox" &&
      (f.catalogRef === "contacts" || f.catalogRef === "collaborators");
    parts.push(contactComboWithUseContacts ? `Contattare ${txt}` : txt);
  }
  return parts.join(" · ");
}

export function getPlanningRowSearchBlob(
  a: PlanningActivityStored,
  types: PlanningActivityTypeDef[],
  bundle: PlanningCatalogBundle | null,
  planningStates: PlanningStateDef[],
): string {
  const t = types.find((x) => x.id === a.activityTypeId);
  if (!t) return "";
  const parts: string[] = [];
  for (const f of t.fields) {
    if (!planningFieldIsActive(f)) continue;
    parts.push(getPlanningCellText(a, `field:${f.id}`, types, bundle, planningStates));
  }
  if (t.showStatus) parts.push(getPlanningCellText(a, "__statusId", types, bundle, planningStates));
  if (t.showStartDate) parts.push(getPlanningCellText(a, "__startDate", types, bundle, planningStates));
  if (t.showEndDate) parts.push(getPlanningCellText(a, "__endDate", types, bundle, planningStates));
  if (t.showReminder) parts.push(getPlanningCellText(a, "__reminderAt", types, bundle, planningStates));
  return parts.join(" ").toLowerCase();
}
