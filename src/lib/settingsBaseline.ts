import {
  normalizePlanningActivityTypeRows,
  digestPlanningStates,
  newCatalogId,
} from "@/lib/presetCatalog";
import { normalizeDashboardLayout } from "@/lib/dashboardLayout";
import { digestClientCardModules } from "@/lib/clientCardModules";
import { digestAgendaSettings } from "@/lib/agendaSettings";
import { digestPlanningReminderPreAlertMinutes } from "@/lib/planningReminderPreAlert";
import type {
  AppSettings,
  CollaboratorCompetencyDef,
  CollaboratorRole,
  ConnectionNamePreset,
  ContractTypeDef,
  CrmModuleDef,
  DashboardLayoutSettings,
  EnvironmentDef,
  PlanningActivityTypeDef,
  ReleaseOptionDef,
  VersionOptionDef,
} from "@/types";

function normalizePresetRows(rows: ConnectionNamePreset[]): ConnectionNamePreset[] {
  return rows
    .map(
      (r): ConnectionNamePreset => ({
        id: r.id?.trim() ? r.id.trim() : newCatalogId(),
        name: r.name.trim(),
        kind: r.kind === "web" ? "web" : "rdp",
        environmentIds: [],
      }),
    )
    .filter((r) => r.name.length > 0);
}

function normalizeEnvRows(rows: EnvironmentDef[]): EnvironmentDef[] {
  return rows
    .map((r) => ({
      id: r.id?.trim() ? r.id.trim() : newCatalogId(),
      name: r.name.trim(),
    }))
    .filter((r) => r.name.length > 0);
}

function normalizeVersionOptionRows(rows: VersionOptionDef[]): VersionOptionDef[] {
  return rows
    .map((r) => ({
      id: r.id?.trim() ? r.id.trim() : newCatalogId(),
      value: r.value.trim(),
      presetIds: r.presetIds ?? [],
    }))
    .filter((r) => r.value.length > 0);
}

function normalizeReleaseOptionRows(rows: ReleaseOptionDef[]): ReleaseOptionDef[] {
  return rows
    .map((r) => ({
      id: r.id?.trim() ? r.id.trim() : newCatalogId(),
      name: r.name.trim(),
      presetIds: r.presetIds ?? [],
    }))
    .filter((r) => r.name.length > 0);
}

function normalizeContractTypeRows(rows: ContractTypeDef[]): ContractTypeDef[] {
  return rows
    .map((r) => ({
      id: r.id?.trim() ? r.id.trim() : newCatalogId(),
      name: r.name.trim(),
    }))
    .filter((r) => r.name.length > 0);
}

function normalizeCrmModuleRows(rows: CrmModuleDef[]): CrmModuleDef[] {
  return rows
    .map((r) => ({
      id: r.id?.trim() ? r.id.trim() : newCatalogId(),
      name: r.name.trim(),
    }))
    .filter((r) => r.name.length > 0);
}

function normalizeCollaboratorCompetencyRows(rows: CollaboratorCompetencyDef[]): CollaboratorCompetencyDef[] {
  return rows
    .map((r) => ({
      id: r.id?.trim() ? r.id.trim() : newCatalogId(),
      name: r.name.trim(),
    }))
    .filter((r) => r.name.length > 0);
}

export function digestPresetsBlock(params: {
  presetRows: ConnectionNamePreset[];
  envRows: EnvironmentDef[];
  versionOptionRows: VersionOptionDef[];
  releaseOptionRows: ReleaseOptionDef[];
}): string {
  const cleanedP = normalizePresetRows(params.presetRows);
  const cleanedE = normalizeEnvRows(params.envRows);
  const cleanedV = normalizeVersionOptionRows(params.versionOptionRows);
  const cleanedR = normalizeReleaseOptionRows(params.releaseOptionRows);
  return JSON.stringify({ cleanedP, cleanedE, cleanedV, cleanedR });
}

export function digestContractTypes(rows: ContractTypeDef[]): string {
  return JSON.stringify(normalizeContractTypeRows(rows));
}

export function digestCrmModules(rows: CrmModuleDef[]): string {
  return JSON.stringify(normalizeCrmModuleRows(rows));
}

export function digestCompetencies(rows: CollaboratorCompetencyDef[]): string {
  return JSON.stringify(normalizeCollaboratorCompetencyRows(rows));
}

export function digestPlanningTypes(rows: PlanningActivityTypeDef[]): string {
  return JSON.stringify(normalizePlanningActivityTypeRows(rows));
}

export function digestDashboard(d: DashboardLayoutSettings): string {
  return JSON.stringify(normalizeDashboardLayout(d));
}

export function collaboratorDraftsDirty(params: {
  collabRoles: CollaboratorRole[];
  collabRoleDrafts: Record<string, { label: string; sortRank: string }>;
  newCollabRoleLabel: string;
}): boolean {
  if (params.newCollabRoleLabel.trim().length > 0) return true;
  for (const r of params.collabRoles) {
    const d = params.collabRoleDrafts[r.id];
    if (!d) continue;
    const labelDraft = d.label.trim();
    const rankRaw = Number.parseInt(d.sortRank, 10);
    if (!Number.isFinite(rankRaw)) return true;
    if (labelDraft !== r.label.trim() || rankRaw !== r.sortRank) return true;
  }
  return false;
}

export type SettingsCatalogFingerprints = {
  presetsBlock: string;
  contracts: string;
  crmModules: string;
  competencies: string;
  planningTypes: string;
  planningStates: string;
  dashboard: string;
  clientCard: string;
  agenda: string;
  planningReminderPreAlert: string;
};

export function baselineFingerprintsFromAppSettings(settings: AppSettings): SettingsCatalogFingerprints {
  return {
    presetsBlock: digestPresetsBlock({
      presetRows: settings.connectionNamePresets ?? [],
      envRows: settings.environments ?? [],
      versionOptionRows: settings.versionOptions ?? [],
      releaseOptionRows: settings.releaseOptions ?? [],
    }),
    contracts: digestContractTypes(settings.contractTypes ?? []),
    crmModules: digestCrmModules(settings.crmModules ?? []),
    competencies: digestCompetencies(settings.collaboratorCompetencies ?? []),
    planningTypes: digestPlanningTypes(settings.planningActivityTypes ?? []),
    planningStates: digestPlanningStates(settings.planningStates ?? []),
    dashboard: digestDashboard(normalizeDashboardLayout(settings.dashboardLayout)),
    clientCard: digestClientCardModules(settings.clientCardModules),
    agenda: digestAgendaSettings(settings.agendaSettings ?? undefined),
    planningReminderPreAlert: digestPlanningReminderPreAlertMinutes(settings.planningReminderPreAlertMinutesBefore ?? []),
  };
}

