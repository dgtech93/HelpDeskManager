import type { Client, CommercialOverviewColumnKey, DashboardLayoutSettings } from "@/types";

/** Opzioni colonne «Panoramica clienti» (la colonna Cliente resta sempre visibile). */
export const COMMERCIAL_OVERVIEW_COLUMN_OPTIONS: { id: CommercialOverviewColumnKey; label: string }[] = [
  { id: "pm", label: "PM" },
  { id: "commercials", label: "Commerciali" },
  { id: "consultants", label: "Consulenti" },
  { id: "contacts", label: "Riferimenti" },
  { id: "contractType", label: "Tipo contratto" },
  { id: "updateCount", label: "N° agg." },
  { id: "suite", label: "Suite" },
  { id: "crmModules", label: "Moduli CRM" },
  { id: "crmSportello", label: "CRM Sportello" },
  { id: "billing", label: "Billing" },
  { id: "finance", label: "Finance" },
  { id: "gwCredit", label: "GW Credit" },
  { id: "lab", label: "LAB" },
];

export function normalizeDashboardLayout(
  raw: Partial<DashboardLayoutSettings> | null | undefined,
): DashboardLayoutSettings {
  const ov = raw?.overviewIncludedClientIds;
  let overviewIncludedClientIds: string[] | null;
  if (ov === undefined) {
    overviewIncludedClientIds = null;
  } else if (ov === null) {
    overviewIncludedClientIds = null;
  } else {
    overviewIncludedClientIds = [...ov].map((x) => x.trim()).filter(Boolean);
  }
  return {
    commercialColumnVisibility: { ...(raw?.commercialColumnVisibility ?? {}) },
    matrixHiddenPresetIds: [...(raw?.matrixHiddenPresetIds ?? [])].filter((x) => Boolean(x?.trim())),
    overviewIncludedClientIds,
  };
}

export function isCommercialColumnVisible(
  layout: DashboardLayoutSettings,
  key: CommercialOverviewColumnKey,
): boolean {
  return layout.commercialColumnVisibility[key] !== false;
}

export function isMatrixPresetVisible(layout: DashboardLayoutSettings, presetId: string): boolean {
  const id = presetId.trim();
  if (!id) return true;
  return !layout.matrixHiddenPresetIds.includes(id);
}

export function clientsEligibleForDashboardOverviews(layout: DashboardLayoutSettings, clients: Client[]): Client[] {
  const L = normalizeDashboardLayout(layout);
  const cur = L.overviewIncludedClientIds;
  if (cur === null) return clients;
  if (cur.length === 0) return [];
  const set = new Set(cur);
  return clients.filter((c) => set.has(c.id));
}

/** Checkbox «incluso» per un cliente nella scheda Impostazioni. */
export function isClientIncludedInDashboardOverviews(
  layout: DashboardLayoutSettings,
  clientId: string,
): boolean {
  const cur = normalizeDashboardLayout(layout).overviewIncludedClientIds;
  if (cur === null) return true;
  return cur.includes(clientId);
}

export function toggleOverviewClientInclusion(
  layout: DashboardLayoutSettings,
  allClientIds: string[],
  clientId: string,
): DashboardLayoutSettings {
  const base = normalizeDashboardLayout(layout);
  if (!allClientIds.includes(clientId)) return base;
  const cur = base.overviewIncludedClientIds;
  const wasVisible = cur === null || cur.includes(clientId);

  let next: string[] | null;
  if (wasVisible) {
    if (cur === null) {
      next = allClientIds.filter((id) => id !== clientId);
    } else {
      next = cur.filter((id) => id !== clientId);
    }
  } else {
    next = [...(cur ?? []), clientId];
  }

  if (
    next !== null &&
    next.length > 0 &&
    next.length === allClientIds.length &&
    allClientIds.every((id) => next!.includes(id))
  ) {
    next = null;
  }

  return { ...base, overviewIncludedClientIds: next };
}
