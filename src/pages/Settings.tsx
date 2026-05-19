import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { save, open } from "@tauri-apps/plugin-dialog";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import { useAppStore } from "@/store/appStore";
import type {
  AppSettings,
  AuditLogEntry,
  Client,
  CollaboratorRole,
  ConnectionNamePreset,
  ConnectionPresetKind,
  CollaboratorCompetencyDef,
  ClientCardModuleSettings,
  ContractTypeDef,
  CrmModuleDef,
  DashboardLayoutSettings,
  EnvironmentDef,
  PlanningActivityTypeDef,
  PlanningStateDef,
  ReleaseOptionDef,
  VersionOptionDef,
  AgendaSettings,
} from "@/types";
import {
  environmentRowTemplate,
  newCatalogId,
  presetRowTemplate,
  releaseOptionRowTemplate,
  versionOptionRowTemplate,
  contractTypeRowTemplate,
  crmModuleRowTemplate,
  collaboratorCompetencyRowTemplate,
  planningActivityTypeRowTemplate,
  normalizePlanningActivityTypeRows,
  normalizePlanningActivityType,
  normalizePlanningFieldDef,
  digestPlanningStates,
  normalizePlanningState,
  normalizePlanningStateRows,
  planningStatesDuplicateButtonRoleError,
} from "@/lib/presetCatalog";
import type { PlanningCatalogBundle } from "@/lib/planningCatalogOptions";
import { validatePlanningTypeUseContactsRules } from "@/lib/planningUseContacts";
import {
  COMMERCIAL_OVERVIEW_COLUMN_OPTIONS,
  isCommercialColumnVisible,
  isClientIncludedInDashboardOverviews,
  normalizeDashboardLayout,
  toggleOverviewClientInclusion,
} from "@/lib/dashboardLayout";
import {
  normalizeClientCardModules,
  digestClientCardModules,
  CLIENT_CARD_PANEL_LABELS,
  CLIENT_CARD_VISIBILITY_KEY,
  CLIENT_CARD_PANEL_IDS,
} from "@/lib/clientCardModules";
import { ClientCardLayoutEditor } from "@/components/ClientCardLayoutEditor";
import { BulkClientsPasteDialog } from "@/components/BulkClientsPasteDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PlanningTypeEditorDialog, clonePlanningActivityType } from "@/components/PlanningTypeEditorDialog";
import { PlanningStatesEditorDialog } from "@/components/PlanningStatesEditorDialog";
import {
  baselineFingerprintsFromAppSettings,
  collaboratorDraftsDirty,
  digestCompetencies,
  digestContractTypes,
  digestCrmModules,
  digestDashboard,
  digestPlanningTypes,
  digestPresetsBlock,
  type SettingsCatalogFingerprints,
} from "@/lib/settingsBaseline";
import { digestAgendaSettings, sanitizeAgendaSettings } from "@/lib/agendaSettings";
import {
  PLANNING_REMINDER_PRE_ALERT_SETTINGS_CHANGED,
  digestPlanningReminderPreAlertMinutes,
  sanitizePlanningReminderPreAlertMinutes,
} from "@/lib/planningReminderPreAlert";
import { PlanningAgendaSetupSection, cloneAgendaDraft } from "@/components/PlanningAgendaSetupSection";
import { PlanningReminderPreAlertSetupSection } from "@/components/PlanningReminderPreAlertSetupSection";
import { AppPageHeader, AppPageShell } from "@/components/layout/AppPageChrome";
import { Plus, Settings, Trash2, ArrowDown, ArrowUp } from "lucide-react";
import { SettingsAboutSection } from "@/components/settings/SettingsAboutSection";

const RESET_CONFIRM_PHRASE = "RESETTA";

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

export function SettingsPage() {
  const setThemeStore = useAppStore((s) => s.setTheme);
  const vaultConfigured = useAppStore((s) => s.vaultConfigured);
  const vaultUnlocked = useAppStore((s) => s.vaultUnlocked);
  const setVault = useAppStore((s) => s.setVault);

  const refreshVault = async () => {
    try {
      const st = await api.getVaultStatus();
      setVault(st.configured, st.unlocked);
    } catch {
      /* ignore */
    }
  };

  const [presetRows, setPresetRows] = useState<ConnectionNamePreset[]>([]);
  const [envRows, setEnvRows] = useState<EnvironmentDef[]>([]);
  const [versionOptionRows, setVersionOptionRows] = useState<VersionOptionDef[]>([]);
  const [releaseOptionRows, setReleaseOptionRows] = useState<ReleaseOptionDef[]>([]);
  const [contractTypeRows, setContractTypeRows] = useState<ContractTypeDef[]>([]);
  const [crmModuleRows, setCrmModuleRows] = useState<CrmModuleDef[]>([]);
  const [collaboratorCompetencyRows, setCollaboratorCompetencyRows] = useState<CollaboratorCompetencyDef[]>([]);
  const [planningActivityTypeRows, setPlanningActivityTypeRows] = useState<PlanningActivityTypeDef[]>([]);
  const [planningStateRows, setPlanningStateRows] = useState<PlanningStateDef[]>([]);
  const [planningStatesEditorOpen, setPlanningStatesEditorOpen] = useState(false);
  const [planningCatalogBundle, setPlanningCatalogBundle] = useState<PlanningCatalogBundle | null>(null);
  const [agendaSettingsDraft, setAgendaSettingsDraft] = useState<AgendaSettings>(() => sanitizeAgendaSettings(undefined));
  const [agendaSaveBusy, setAgendaSaveBusy] = useState(false);
  const [planningReminderPreAlertDraft, setPlanningReminderPreAlertDraft] = useState<number[]>(() =>
    sanitizePlanningReminderPreAlertMinutes(undefined),
  );
  const [planningReminderPreAlertSaveBusy, setPlanningReminderPreAlertSaveBusy] = useState(false);
  const [planningModalOpen, setPlanningModalOpen] = useState(false);
  const [planningModalDraft, setPlanningModalDraft] = useState<PlanningActivityTypeDef | null>(null);
  const [planningModalIndex, setPlanningModalIndex] = useState<number | null>(null);
  const [dashboardDraft, setDashboardDraft] = useState<DashboardLayoutSettings>(() =>
    normalizeDashboardLayout(undefined),
  );
  const [clientCardModulesDraft, setClientCardModulesDraft] = useState<ClientCardModuleSettings>(() =>
    normalizeClientCardModules(undefined),
  );

  type PresetsSubSection = "services_catalog" | "versions_releases";
  const [presetsSubSection, setPresetsSubSection] = useState<PresetsSubSection>("services_catalog");

  /** Servizio attivo per versione/release: lista a sinistra (master-detail), tabella singola checkbox a destra. */
  const [matrixFocusPresetId, setMatrixFocusPresetId] = useState<string>("");

  const [masterPwd, setMasterPwd] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);

  const [setupPwd, setSetupPwd] = useState("");
  const [setupPwd2, setSetupPwd2] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);

  const [changeCur, setChangeCur] = useState("");
  const [changeNew, setChangeNew] = useState("");
  const [changeNew2, setChangeNew2] = useState("");
  const [changeBusy, setChangeBusy] = useState(false);

  const [recExportPass, setRecExportPass] = useState("");
  const [recExportPass2, setRecExportPass2] = useState("");
  const [recExportBusy, setRecExportBusy] = useState(false);

  const [recImportPath, setRecImportPath] = useState("");
  const [recImportPass, setRecImportPass] = useState("");
  const [recImportNew, setRecImportNew] = useState("");
  const [recImportNew2, setRecImportNew2] = useState("");
  const [recImportBusy, setRecImportBusy] = useState(false);

  const [resetPhrase, setResetPhrase] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const [settingsSection, setSettingsSection] = useState<
    | "vault"
    | "presets"
    | "contracts"
    | "crm_modules"
    | "dashboard"
    | "client_card"
    | "collaborator_roles"
    | "clients"
    | "activity"
    | "planning_setup"
    | "about"
  >("vault");

  const [adminClients, setAdminClients] = useState<Client[]>([]);
  const [adminClientsBusy, setAdminClientsBusy] = useState(false);
  const [toggleClientId, setToggleClientId] = useState<string | null>(null);
  const [toggleNavClientId, setToggleNavClientId] = useState<string | null>(null);

  const [clientDeletionEnabled, setClientDeletionEnabled] = useState(false);
  const [deletionVaultPwd, setDeletionVaultPwd] = useState("");
  const [deletionUnlockBusy, setDeletionUnlockBusy] = useState(false);
  const [delConfirmClientId, setDelConfirmClientId] = useState<string | null>(null);

  const [bulkClientsOpen, setBulkClientsOpen] = useState(false);

  const hydrateSettingsCatalog = useCallback((settings: AppSettings) => {
    const presets = settings.connectionNamePresets ?? [];
    setPresetRows(
      presets.length > 0 ? presets.map((p) => ({ ...p })) : [presetRowTemplate("rdp")],
    );
    setEnvRows(
      settings.environments?.length
        ? settings.environments.map((e) => ({ ...e }))
        : [environmentRowTemplate()],
    );
    setVersionOptionRows(
      settings.versionOptions?.length
        ? settings.versionOptions.map((v) => ({ ...v }))
        : [versionOptionRowTemplate()],
    );
    setReleaseOptionRows(
      settings.releaseOptions?.length
        ? settings.releaseOptions.map((r) => ({ ...r }))
        : [releaseOptionRowTemplate()],
    );
    setContractTypeRows(
      settings.contractTypes?.length ? settings.contractTypes.map((c) => ({ ...c })) : [],
    );
    setCrmModuleRows(
      settings.crmModules?.length ? settings.crmModules.map((c) => ({ ...c })) : [],
    );
    setCollaboratorCompetencyRows(
      settings.collaboratorCompetencies?.length
        ? settings.collaboratorCompetencies.map((c) => ({ ...c }))
        : [],
    );
    setPlanningActivityTypeRows(
      settings.planningActivityTypes?.length ? settings.planningActivityTypes.map((r) => ({ ...r })) : [],
    );
    setPlanningStateRows((settings.planningStates ?? []).map((s) => normalizePlanningState(s)));
    setDashboardDraft(normalizeDashboardLayout(settings.dashboardLayout));
    setClientCardModulesDraft(normalizeClientCardModules(settings.clientCardModules));
    setAgendaSettingsDraft(cloneAgendaDraft(sanitizeAgendaSettings(settings.agendaSettings)));
    setPlanningReminderPreAlertDraft(sanitizePlanningReminderPreAlertMinutes(settings.planningReminderPreAlertMinutesBefore));
  }, []);

  useEffect(() => {
    const ids = presetRows.map((p) => p.id.trim()).filter(Boolean);
    setMatrixFocusPresetId((cur) => {
      if (ids.length === 0) return "";
      if (!cur || !ids.includes(cur)) return ids[0]!;
      return cur;
    });
  }, [presetRows]);

  const matrixSelectablePresets = useMemo(
    () =>
      [...presetRows]
        .filter((p) => p.id.trim())
        .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "it")),
    [presetRows],
  );

  const matrixFocusPreset = useMemo(
    () => presetRows.find((p) => p.id === matrixFocusPresetId) ?? null,
    [presetRows, matrixFocusPresetId],
  );

  const [activityAudit, setActivityAudit] = useState<AuditLogEntry[] | null>(null);
  const [activityBusy, setActivityBusy] = useState(false);

  const [collabRoles, setCollabRoles] = useState<CollaboratorRole[]>([]);
  const [collabRolesBusy, setCollabRolesBusy] = useState(false);
  const [collabRoleDrafts, setCollabRoleDrafts] = useState<
    Record<string, { label: string; sortRank: string }>
  >({});
  const [newCollabRoleLabel, setNewCollabRoleLabel] = useState("");
  const [delCollabRoleId, setDelCollabRoleId] = useState<string | null>(null);

  const [dashboardPickerClients, setDashboardPickerClients] = useState<Client[]>([]);
  const [dashboardPickerBusy, setDashboardPickerBusy] = useState(false);

  const dashboardPickerSorted = useMemo(
    () => [...dashboardPickerClients].sort((a, b) => a.name.localeCompare(b.name, "it")),
    [dashboardPickerClients],
  );
  const dashboardPickerAllIds = useMemo(() => dashboardPickerSorted.map((c) => c.id), [dashboardPickerSorted]);

  const settingsBaselineRef = useRef<SettingsCatalogFingerprints | null>(null);
  const [, bumpSettingsBaseline] = useReducer((n: number) => n + 1, 0);

  const liveCatalogFingerprints = useMemo(
    (): SettingsCatalogFingerprints => ({
      presetsBlock: digestPresetsBlock({
        presetRows,
        envRows,
        versionOptionRows,
        releaseOptionRows,
      }),
      contracts: digestContractTypes(contractTypeRows),
      crmModules: digestCrmModules(crmModuleRows),
      competencies: digestCompetencies(collaboratorCompetencyRows),
      planningTypes: digestPlanningTypes(planningActivityTypeRows),
      planningStates: digestPlanningStates(planningStateRows),
      dashboard: digestDashboard(dashboardDraft),
      clientCard: digestClientCardModules(clientCardModulesDraft),
      agenda: digestAgendaSettings(agendaSettingsDraft),
      planningReminderPreAlert: digestPlanningReminderPreAlertMinutes(planningReminderPreAlertDraft),
    }),
    [
      presetRows,
      envRows,
      versionOptionRows,
      releaseOptionRows,
      contractTypeRows,
      crmModuleRows,
      collaboratorCompetencyRows,
      planningActivityTypeRows,
      planningStateRows,
      dashboardDraft,
      clientCardModulesDraft,
      agendaSettingsDraft,
      planningReminderPreAlertDraft,
    ],
  );

  const collaboratorDraftsDirtyMemo = useMemo(
    () =>
      collaboratorDraftsDirty({
        collabRoles,
        collabRoleDrafts,
        newCollabRoleLabel,
      }),
    [collabRoles, collabRoleDrafts, newCollabRoleLabel],
  );

  const catalogsDirtyComparedToBaseline =
    api.isTauriRuntime() &&
    settingsBaselineRef.current !== null &&
    (liveCatalogFingerprints.presetsBlock !== settingsBaselineRef.current.presetsBlock ||
      liveCatalogFingerprints.contracts !== settingsBaselineRef.current.contracts ||
      liveCatalogFingerprints.crmModules !== settingsBaselineRef.current.crmModules ||
      liveCatalogFingerprints.competencies !== settingsBaselineRef.current.competencies ||
      liveCatalogFingerprints.planningTypes !== settingsBaselineRef.current.planningTypes ||
      liveCatalogFingerprints.planningStates !== settingsBaselineRef.current.planningStates ||
      liveCatalogFingerprints.dashboard !== settingsBaselineRef.current.dashboard ||
      liveCatalogFingerprints.clientCard !== settingsBaselineRef.current.clientCard ||
      liveCatalogFingerprints.agenda !== settingsBaselineRef.current.agenda ||
      liveCatalogFingerprints.planningReminderPreAlert !== settingsBaselineRef.current.planningReminderPreAlert);

  const settingsHasUnsavedChanges = catalogsDirtyComparedToBaseline || collaboratorDraftsDirtyMemo;

  useEffect(() => {
    if (settingsSection !== "dashboard" || !api.isTauriRuntime()) return;
    let cancelled = false;
    (async () => {
      setDashboardPickerBusy(true);
      try {
        const list = await api.getClients();
        if (!cancelled) setDashboardPickerClients(list);
      } catch {
        if (!cancelled) setDashboardPickerClients([]);
      } finally {
        if (!cancelled) setDashboardPickerBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsSection]);

  useEffect(() => {
    (async () => {
      try {
        const [settings, st] = await Promise.all([api.getSettings(), api.getVaultStatus()]);
        setVault(st.configured, st.unlocked);
        hydrateSettingsCatalog(settings);
        if (api.isTauriRuntime()) {
          settingsBaselineRef.current = baselineFingerprintsFromAppSettings(settings);
          bumpSettingsBaseline();
        }
        const mode = settings.theme === "dark" ? "dark" : "light";
        setThemeStore(mode);
        document.documentElement.classList.toggle("dark", mode === "dark");
      } catch (e) {
        toast.error(formatErr(e));
      }
    })();
  }, [hydrateSettingsCatalog, setThemeStore, setVault]);

  useEffect(() => {
    const sections = new Set([
      "presets",
      "contracts",
      "crm_modules",
      "dashboard",
      "client_card",
      "collaborator_roles",
      "planning_setup",
    ]);
    if (!api.isTauriRuntime() || !sections.has(settingsSection)) return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await api.getSettings();
        if (cancelled) return;
        hydrateSettingsCatalog(settings);
        settingsBaselineRef.current = baselineFingerprintsFromAppSettings(settings);
        bumpSettingsBaseline();
      } catch (e) {
        if (!cancelled) toast.error(formatErr(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateSettingsCatalog, settingsSection]);

  useEffect(() => {
    if (settingsSection !== "planning_setup" || !api.isTauriRuntime()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [settings, clients, collaborators, contacts, roles] = await Promise.all([
          api.getSettings(),
          api.getClientsAll(),
          api.getCollaborators(),
          api.getAllContacts(),
          api.getCollaboratorRoles(),
        ]);
        if (!cancelled) {
          setPlanningCatalogBundle({
            settings,
            clients,
            collaborators,
            contacts,
            roles,
          });
        }
      } catch {
        if (!cancelled) setPlanningCatalogBundle(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsSection]);

  useEffect(() => {
    if (settingsSection !== "clients" || !api.isTauriRuntime()) return;
    let cancelled = false;
    (async () => {
      setAdminClientsBusy(true);
      try {
        const list = await api.getClientsAll();
        if (!cancelled) setAdminClients(list);
      } catch (e) {
        if (!cancelled) toast.error(formatErr(e));
      } finally {
        if (!cancelled) setAdminClientsBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsSection]);

  useEffect(() => {
    if (settingsSection !== "activity" || !api.isTauriRuntime()) return;
    let cancelled = false;
    (async () => {
      setActivityAudit(null);
      setActivityBusy(true);
      try {
        const s = await api.getDashboardStats();
        if (!cancelled) setActivityAudit(s.recentAudit);
      } catch (e) {
        if (!cancelled) toast.error(formatErr(e));
      } finally {
        if (!cancelled) setActivityBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsSection]);

  useEffect(() => {
    if (settingsSection !== "collaborator_roles" || !api.isTauriRuntime()) return;
    let cancelled = false;
    (async () => {
      setCollabRolesBusy(true);
      try {
        const list = await api.getCollaboratorRoles();
        if (!cancelled) setCollabRoles(list);
      } catch (e) {
        if (!cancelled) toast.error(formatErr(e));
      } finally {
        if (!cancelled) setCollabRolesBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsSection]);

  useEffect(() => {
    setCollabRoleDrafts(
      Object.fromEntries(
        collabRoles.map((r) => [
          r.id,
          { label: r.label, sortRank: String(r.sortRank) },
        ]),
      ),
    );
  }, [collabRoles]);

  useEffect(() => {
    if (settingsSection !== "clients") {
      setClientDeletionEnabled(false);
      setDeletionVaultPwd("");
      setDelConfirmClientId(null);
    }
  }, [settingsSection]);

  const enableClientDeletion = async () => {
    const pwd = deletionVaultPwd.trim();
    if (!pwd) {
      toast.error("Inserisci la master password del vault");
      return;
    }
    setDeletionUnlockBusy(true);
    try {
      await api.verifyVaultMasterPassword(pwd);
      setDeletionVaultPwd("");
      setClientDeletionEnabled(true);
      toast.success("Eliminazione clienti abilitata per questa scheda");
    } catch (e) {
      toast.error(formatErr(e));
    } finally {
      setDeletionUnlockBusy(false);
    }
  };

  const saveConnectionPresets = async () => {
    try {
      const cleanedP = normalizePresetRows(presetRows);
      const cleanedE = normalizeEnvRows(envRows);
      const cleanedV = normalizeVersionOptionRows(versionOptionRows);
      const cleanedR = normalizeReleaseOptionRows(releaseOptionRows);
      await api.updateSettings({
        connectionNamePresets: cleanedP,
        environments: cleanedE,
        versionOptions: cleanedV,
        releaseOptions: cleanedR,
      });
      toast.success("Catalogo servizi salvato");
      setPresetRows(
        cleanedP.length > 0 ? cleanedP.map((p) => ({ ...p })) : [presetRowTemplate("rdp")],
      );
      setEnvRows(cleanedE.length > 0 ? cleanedE.map((e) => ({ ...e })) : [environmentRowTemplate()]);
      setVersionOptionRows(
        cleanedV.length > 0 ? cleanedV.map((v) => ({ ...v })) : [versionOptionRowTemplate()],
      );
      setReleaseOptionRows(
        cleanedR.length > 0 ? cleanedR.map((r) => ({ ...r })) : [releaseOptionRowTemplate()],
      );
      if (settingsBaselineRef.current) {
        settingsBaselineRef.current = {
          ...settingsBaselineRef.current,
          presetsBlock: digestPresetsBlock({
            presetRows: cleanedP.length > 0 ? cleanedP.map((p) => ({ ...p })) : [presetRowTemplate("rdp")],
            envRows: cleanedE.length > 0 ? cleanedE.map((e) => ({ ...e })) : [environmentRowTemplate()],
            versionOptionRows: cleanedV.length > 0 ? cleanedV.map((v) => ({ ...v })) : [versionOptionRowTemplate()],
            releaseOptionRows: cleanedR.length > 0 ? cleanedR.map((r) => ({ ...r })) : [releaseOptionRowTemplate()],
          }),
        };
        bumpSettingsBaseline();
      }
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const saveContractTypesCatalog = async () => {
    try {
      const cleaned = normalizeContractTypeRows(contractTypeRows);
      await api.updateSettings({ contractTypes: cleaned });
      toast.success("Catalogo contratti salvato");
      setContractTypeRows(cleaned.map((c) => ({ ...c })));
      if (settingsBaselineRef.current) {
        settingsBaselineRef.current = {
          ...settingsBaselineRef.current,
          contracts: digestContractTypes(cleaned),
        };
        bumpSettingsBaseline();
      }
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const saveCrmModulesCatalog = async () => {
    try {
      const cleaned = normalizeCrmModuleRows(crmModuleRows);
      await api.updateSettings({ crmModules: cleaned });
      toast.success("Catalogo moduli salvato");
      setCrmModuleRows(cleaned.map((c) => ({ ...c })));
      if (settingsBaselineRef.current) {
        settingsBaselineRef.current = {
          ...settingsBaselineRef.current,
          crmModules: digestCrmModules(cleaned),
        };
        bumpSettingsBaseline();
      }
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const saveCollaboratorCompetenciesCatalog = async () => {
    try {
      const cleaned = normalizeCollaboratorCompetencyRows(collaboratorCompetencyRows);
      await api.updateSettings({ collaboratorCompetencies: cleaned });
      toast.success("Catalogo competenze salvato");
      setCollaboratorCompetencyRows(cleaned.map((c) => ({ ...c })));
      if (settingsBaselineRef.current) {
        settingsBaselineRef.current = {
          ...settingsBaselineRef.current,
          competencies: digestCompetencies(cleaned),
        };
        bumpSettingsBaseline();
      }
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const savePlanningActivityTypesCatalog = async () => {
    try {
      const cleaned = normalizePlanningActivityTypeRows(planningActivityTypeRows);
      await api.updateSettings({ planningActivityTypes: cleaned });
      toast.success("Tipi di pianificazione salvati");
      setPlanningActivityTypeRows(cleaned.map((r) => ({ ...r })));
      if (settingsBaselineRef.current) {
        settingsBaselineRef.current = {
          ...settingsBaselineRef.current,
          planningTypes: digestPlanningTypes(cleaned),
        };
        bumpSettingsBaseline();
      }
      if (
        settingsBaselineRef.current &&
        digestPlanningReminderPreAlertMinutes(planningReminderPreAlertDraft) !==
          settingsBaselineRef.current.planningReminderPreAlert
      ) {
        await savePlanningReminderPreAlertCatalog();
      }
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const savePlanningStatesCatalog = async () => {
    try {
      const dup = planningStatesDuplicateButtonRoleError(planningStateRows.map((r) => normalizePlanningState(r)));
      if (dup) {
        toast.error(dup);
        return;
      }
      const cleaned = normalizePlanningStateRows(planningStateRows);
      await api.updateSettings({ planningStates: cleaned });
      toast.success("Stati pianificazione salvati");
      setPlanningStateRows(cleaned.map((r) => ({ ...r })));
      if (settingsBaselineRef.current) {
        settingsBaselineRef.current = {
          ...settingsBaselineRef.current,
          planningStates: digestPlanningStates(cleaned),
        };
        bumpSettingsBaseline();
      }
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const saveAgendaSettingsCatalog = async () => {
    try {
      setAgendaSaveBusy(true);
      const cleaned = sanitizeAgendaSettings(agendaSettingsDraft);
      await api.updateSettings({ agendaSettings: cleaned });
      setAgendaSettingsDraft(cloneAgendaDraft(cleaned));
      toast.success("Configurazione Agenda salvata");
      if (settingsBaselineRef.current) {
        settingsBaselineRef.current = {
          ...settingsBaselineRef.current,
          agenda: digestAgendaSettings(cleaned),
        };
        bumpSettingsBaseline();
      }
      if (settingsSection === "planning_setup") {
        const settings = await api.getSettings();
        setPlanningCatalogBundle((bb) => (bb ? { ...bb, settings } : bb));
      }
    } catch (e) {
      toast.error(formatErr(e));
    } finally {
      setAgendaSaveBusy(false);
    }
  };

  const savePlanningReminderPreAlertCatalog = async (minutesOverride?: number[]) => {
    try {
      setPlanningReminderPreAlertSaveBusy(true);
      const cleaned = sanitizePlanningReminderPreAlertMinutes(minutesOverride ?? planningReminderPreAlertDraft);
      await api.updateSettings({ planningReminderPreAlertMinutesBefore: cleaned });
      setPlanningReminderPreAlertDraft([...cleaned]);
      toast.success("Preavvisi promemoria salvati");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(PLANNING_REMINDER_PRE_ALERT_SETTINGS_CHANGED));
      }
      if (settingsBaselineRef.current) {
        settingsBaselineRef.current = {
          ...settingsBaselineRef.current,
          planningReminderPreAlert: digestPlanningReminderPreAlertMinutes(cleaned),
        };
        bumpSettingsBaseline();
      }
      if (settingsSection === "planning_setup") {
        const settings = await api.getSettings();
        setPlanningCatalogBundle((bb) => (bb ? { ...bb, settings } : bb));
      }
    } catch (e) {
      toast.error(formatErr(e));
    } finally {
      setPlanningReminderPreAlertSaveBusy(false);
    }
  };

  const openPlanningTypeModalCreate = () => {
    setPlanningModalDraft(clonePlanningActivityType(planningActivityTypeRowTemplate()));
    setPlanningModalIndex(null);
    setPlanningModalOpen(true);
  };

  const openPlanningTypeModalEdit = (index: number) => {
    const row = planningActivityTypeRows[index];
    if (!row) return;
    setPlanningModalDraft(clonePlanningActivityType(normalizePlanningActivityType(row)));
    setPlanningModalIndex(index);
    setPlanningModalOpen(true);
  };

  const applyPlanningTypeModal = () => {
    if (!planningModalDraft) return;
    const name = planningModalDraft.name.trim();
    if (!name) {
      toast.error("Indica il nome del tipo di attività");
      return;
    }
    const useContactsErr = validatePlanningTypeUseContactsRules(planningModalDraft);
    if (useContactsErr) {
      toast.error(useContactsErr);
      return;
    }
    const next = normalizePlanningActivityType({
      ...planningModalDraft,
      name,
      fields: planningModalDraft.fields.map((f) =>
        normalizePlanningFieldDef({
          ...f,
          label: (f.label ?? "").trim(),
        }),
      ),
    });
    if (planningModalIndex === null) {
      setPlanningActivityTypeRows((rows) => [...rows, next]);
    } else {
      setPlanningActivityTypeRows((rows) => rows.map((r, i) => (i === planningModalIndex ? next : r)));
    }
    setPlanningModalOpen(false);
    setPlanningModalDraft(null);
    setPlanningModalIndex(null);
  };

  const closePlanningTypeModal = () => {
    setPlanningModalOpen(false);
    setPlanningModalDraft(null);
    setPlanningModalIndex(null);
  };

  const saveClientCardModules = async () => {
    try {
      const next = normalizeClientCardModules(clientCardModulesDraft);
      await api.updateSettings({ clientCardModules: next });
      toast.success("Moduli scheda cliente salvati");
      setClientCardModulesDraft(next);
      if (settingsBaselineRef.current) {
        settingsBaselineRef.current = {
          ...settingsBaselineRef.current,
          clientCard: digestClientCardModules(next),
        };
        bumpSettingsBaseline();
      }
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const saveDashboardLayout = async () => {
    try {
      const next = normalizeDashboardLayout(dashboardDraft);
      await api.updateSettings({ dashboardLayout: next });
      toast.success("Layout Dashboard salvato");
      setDashboardDraft(next);
      if (settingsBaselineRef.current) {
        settingsBaselineRef.current = {
          ...settingsBaselineRef.current,
          dashboard: digestDashboard(next),
        };
        bumpSettingsBaseline();
      }
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const pendingDeleteClient =
    delConfirmClientId !== null ? adminClients.find((c) => c.id === delConfirmClientId) : undefined;

  const sortedCollabRoles = [...collabRoles].sort((a, b) => {
    if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
    return a.label.localeCompare(b.label, "it");
  });

  const moveCollabRole = async (id: string, dir: -1 | 1) => {
    const idx = sortedCollabRoles.findIndex((r) => r.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= sortedCollabRoles.length) return;
    const a = sortedCollabRoles[idx]!;
    const b = sortedCollabRoles[j]!;
    try {
      await Promise.all([
        api.updateCollaboratorRole(a.id, { sortRank: b.sortRank }),
        api.updateCollaboratorRole(b.id, { sortRank: a.sortRank }),
      ]);
      setCollabRoles(await api.getCollaboratorRoles());
      toast.success("Ordine incarichi aggiornato");
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const saveCollabRoleDraft = async (id: string) => {
    const d = collabRoleDrafts[id];
    if (!d) return;
    const label = d.label.trim();
    if (!label) {
      toast.error("Etichetta ruolo obbligatoria");
      return;
    }
    const rank = Number.parseInt(d.sortRank, 10);
    if (!Number.isFinite(rank)) {
      toast.error("Priorità non valida");
      return;
    }
    try {
      await api.updateCollaboratorRole(id, { label, sortRank: rank });
      setCollabRoles(await api.getCollaboratorRoles());
      toast.success("Ruolo salvato");
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const addCollabRole = async () => {
    const label = newCollabRoleLabel.trim();
    if (!label) {
      toast.error("Indica il nome del ruolo");
      return;
    }
    try {
      await api.createCollaboratorRole({ label });
      setNewCollabRoleLabel("");
      setCollabRoles(await api.getCollaboratorRoles());
      toast.success("Ruolo aggiunto");
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const removeCollabRoleConfirmed = async (id: string) => {
    try {
      await api.deleteCollaboratorRole(id);
      setCollabRoles(await api.getCollaboratorRoles());
      toast.success("Ruolo eliminato");
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const [navigationLeaveBusy, setNavigationLeaveBusy] = useState(false);

  const persistCollaboratorDraftsForExit = async () => {
    const pendingLabel = newCollabRoleLabel.trim();
    if (pendingLabel.length > 0) {
      toast.error("Completa o svuota il campo «nuovo ruolo» prima di salvare ed uscire.");
      throw new Error("pending-collab-role");
    }
    for (const r of collabRoles) {
      const d = collabRoleDrafts[r.id];
      if (!d) continue;
      const label = d.label.trim();
      const rank = Number.parseInt(d.sortRank, 10);
      if (!label || !Number.isFinite(rank)) {
        toast.error(`Ruolo incompleto («${r.label}»): etichetta e priorità numerica sono obbligatorie.`);
        throw new Error("invalid-collab-draft");
      }
      if (label === r.label.trim() && rank === r.sortRank) continue;
      await api.updateCollaboratorRole(r.id, { label, sortRank: rank });
    }
    setCollabRoles(await api.getCollaboratorRoles());
  };

  const navigationBlocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      api.isTauriRuntime() &&
      settingsHasUnsavedChanges &&
      nextLocation.pathname !== currentLocation.pathname,
  );

  const persistSettingsAndContinueNavigation = async () => {
    const b = settingsBaselineRef.current;
    const live = liveCatalogFingerprints;
    try {
      setNavigationLeaveBusy(true);
      if (b) {
        if (live.presetsBlock !== b.presetsBlock) await saveConnectionPresets();
        if (live.contracts !== b.contracts) await saveContractTypesCatalog();
        if (live.crmModules !== b.crmModules) await saveCrmModulesCatalog();
        if (live.competencies !== b.competencies) await saveCollaboratorCompetenciesCatalog();
        if (live.planningTypes !== b.planningTypes) await savePlanningActivityTypesCatalog();
        if (live.planningStates !== b.planningStates) await savePlanningStatesCatalog();
        if (live.dashboard !== b.dashboard) await saveDashboardLayout();
        if (live.clientCard !== b.clientCard) await saveClientCardModules();
        if (live.agenda !== b.agenda) await saveAgendaSettingsCatalog();
        if (live.planningReminderPreAlert !== b.planningReminderPreAlert) await savePlanningReminderPreAlertCatalog();
      }
      if (collaboratorDraftsDirtyMemo) await persistCollaboratorDraftsForExit();
      if (navigationBlocker.state === "blocked") navigationBlocker.proceed();
    } catch (e) {
      toast.error(formatErr(e));
    } finally {
      setNavigationLeaveBusy(false);
    }
  };

  return (
    <AppPageShell>
      <AppPageHeader
        icon={Settings}
        accent="slate"
        title="Impostazioni"
        description={
          <>
            Vault, servizi, contratti, moduli CRM, Dashboard, scheda cliente, pianificazione (setup), ruoli, clienti,
            registro attività e informazioni prodotto: scegli la scheda qui sotto.
          </>
        }
      />

      <section className="overflow-hidden rounded-2xl border border-slate-300/55 bg-neutral-50/95 shadow-sm shadow-slate-500/[0.05] ring-1 ring-slate-400/20 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none dark:ring-0">
        <div className="border-b border-slate-300/45 bg-slate-300/35 px-3 pt-3 dark:border-slate-700 dark:bg-slate-900/70">
          <nav className="flex flex-wrap gap-1" role="tablist" aria-label="Sezioni impostazioni">
            <button
              type="button"
              role="tab"
              aria-selected={settingsSection === "vault"}
              onClick={() => setSettingsSection("vault")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                settingsSection === "vault"
                  ? "bg-neutral-50 text-slate-900 shadow-[inset_0_-1px_0_0_rgb(249_247_246)] dark:bg-slate-950 dark:text-slate-50 dark:shadow-[inset_0_-1px_0_0_rgb(2_6_23)]"
                  : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
              }`}
            >
              Credenziali (vault)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsSection === "presets"}
              onClick={() => setSettingsSection("presets")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                settingsSection === "presets"
                  ? "bg-neutral-50 text-slate-900 shadow-[inset_0_-1px_0_0_rgb(249_247_246)] dark:bg-slate-950 dark:text-slate-50 dark:shadow-[inset_0_-1px_0_0_rgb(2_6_23)]"
                  : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
              }`}
            >
              Servizi
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsSection === "contracts"}
              onClick={() => setSettingsSection("contracts")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                settingsSection === "contracts"
                  ? "bg-neutral-50 text-slate-900 shadow-[inset_0_-1px_0_0_rgb(249_247_246)] dark:bg-slate-950 dark:text-slate-50 dark:shadow-[inset_0_-1px_0_0_rgb(2_6_23)]"
                  : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
              }`}
            >
              Contratti
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsSection === "crm_modules"}
              onClick={() => setSettingsSection("crm_modules")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                settingsSection === "crm_modules"
                  ? "bg-neutral-50 text-slate-900 shadow-[inset_0_-1px_0_0_rgb(249_247_246)] dark:bg-slate-950 dark:text-slate-50 dark:shadow-[inset_0_-1px_0_0_rgb(2_6_23)]"
                  : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
              }`}
            >
              Moduli
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsSection === "dashboard"}
              onClick={() => setSettingsSection("dashboard")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                settingsSection === "dashboard"
                  ? "bg-neutral-50 text-slate-900 shadow-[inset_0_-1px_0_0_rgb(249_247_246)] dark:bg-slate-950 dark:text-slate-50 dark:shadow-[inset_0_-1px_0_0_rgb(2_6_23)]"
                  : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
              }`}
            >
              Dashboard
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsSection === "client_card"}
              onClick={() => setSettingsSection("client_card")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                settingsSection === "client_card"
                  ? "bg-neutral-50 text-slate-900 shadow-[inset_0_-1px_0_0_rgb(249_247_246)] dark:bg-slate-950 dark:text-slate-50 dark:shadow-[inset_0_-1px_0_0_rgb(2_6_23)]"
                  : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
              }`}
            >
              Scheda cliente
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsSection === "planning_setup"}
              onClick={() => setSettingsSection("planning_setup")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                settingsSection === "planning_setup"
                  ? "bg-neutral-50 text-slate-900 shadow-[inset_0_-1px_0_0_rgb(249_247_246)] dark:bg-slate-950 dark:text-slate-50 dark:shadow-[inset_0_-1px_0_0_rgb(2_6_23)]"
                  : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
              }`}
            >
              Setup pianificazione
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsSection === "collaborator_roles"}
              onClick={() => setSettingsSection("collaborator_roles")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                settingsSection === "collaborator_roles"
                  ? "bg-neutral-50 text-slate-900 shadow-[inset_0_-1px_0_0_rgb(249_247_246)] dark:bg-slate-950 dark:text-slate-50 dark:shadow-[inset_0_-1px_0_0_rgb(2_6_23)]"
                  : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
              }`}
            >
              Ruoli e competenze
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsSection === "clients"}
              onClick={() => setSettingsSection("clients")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                settingsSection === "clients"
                  ? "bg-neutral-50 text-slate-900 shadow-[inset_0_-1px_0_0_rgb(249_247_246)] dark:bg-slate-950 dark:text-slate-50 dark:shadow-[inset_0_-1px_0_0_rgb(2_6_23)]"
                  : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
              }`}
            >
              Clienti
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsSection === "activity"}
              onClick={() => setSettingsSection("activity")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                settingsSection === "activity"
                  ? "bg-neutral-50 text-slate-900 shadow-[inset_0_-1px_0_0_rgb(249_247_246)] dark:bg-slate-950 dark:text-slate-50 dark:shadow-[inset_0_-1px_0_0_rgb(2_6_23)]"
                  : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
              }`}
            >
              Registro attività
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsSection === "about"}
              onClick={() => setSettingsSection("about")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                settingsSection === "about"
                  ? "bg-neutral-50 text-slate-900 shadow-[inset_0_-1px_0_0_rgb(249_247_246)] dark:bg-slate-950 dark:text-slate-50 dark:shadow-[inset_0_-1px_0_0_rgb(2_6_23)]"
                  : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
              }`}
            >
              Informazioni
            </button>
          </nav>
        </div>
        <div className="space-y-4 p-5">
          {settingsSection === "vault" ? (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Il programma resta sempre navigabile: solo salvataggio e uso delle password archiviate richiedono vault
                attivo e, di volta in volta, sessione sbloccata. Non viene più bloccata l&apos;intera finestra come in
                passato.
              </p>

              {!vaultConfigured ? (
          <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/80 p-4 dark:border-sky-900 dark:bg-sky-950/30">
            <p className="text-sm text-sky-950 dark:text-sky-100">
              Nessuna protezione locale configurata. Scegli una <strong>master password</strong> (minimo 8 caratteri):
              crittografa le password RDP, VPN e Web salvate nel database su questo computer.
            </p>
            <div className="grid max-w-md gap-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Master password</label>
              <input
                type="password"
                value={setupPwd}
                onChange={(e) => setSetupPwd(e.target.value)}
                autoComplete="new-password"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Ripeti master password</label>
              <input
                type="password"
                value={setupPwd2}
                onChange={(e) => setSetupPwd2(e.target.value)}
                autoComplete="new-password"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
              <button
                type="button"
                disabled={
                  setupBusy || setupPwd.length < 8 || setupPwd !== setupPwd2 || !api.isTauriRuntime()
                }
                onClick={async () => {
                  if (setupPwd !== setupPwd2) {
                    toast.error("Le password non coincidono");
                    return;
                  }
                  setSetupBusy(true);
                  try {
                    await api.setMasterPassword(setupPwd);
                    setSetupPwd("");
                    setSetupPwd2("");
                    await refreshVault();
                    toast.success("Protezione credenziali attivata");
                  } catch (e) {
                    toast.error(formatErr(e));
                  } finally {
                    setSetupBusy(false);
                  }
                }}
                className="mt-1 w-fit rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                Attiva protezione credenziali
              </button>
            </div>
            <p className="text-[11px] text-sky-900/85 dark:text-sky-200/90">
              Dopo l&apos;attivazione, crea un <strong>kit di recupero</strong> nella stessa scheda (con vault sbloccato) da
              custodire fuori dal PC: serve se dimentichi la master password.
            </p>
          </div>
        ) : null}

        {vaultConfigured && !vaultUnlocked ? (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900 dark:bg-amber-950/25">
            <p className="text-sm text-amber-950 dark:text-amber-100">
              Sessione vault chiusa su questo dispositivo. Inserisci la master password per salvare o leggere le password
              archiviate (la sessione può essere ricordata in locale dopo il primo sblocco).
            </p>
            <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Master password</label>
                <input
                  type="password"
                  value={masterPwd}
                  onChange={(e) => setMasterPwd(e.target.value)}
                  autoComplete="current-password"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
              </div>
              <button
                type="button"
                disabled={unlockBusy || !masterPwd}
                onClick={async () => {
                  setUnlockBusy(true);
                  try {
                    const st = await api.unlockVault(masterPwd);
                    setVault(st.configured, st.unlocked);
                    setMasterPwd("");
                    toast.success("Credenziali sbloccate");
                  } catch (e) {
                    toast.error(formatErr(e));
                  } finally {
                    setUnlockBusy(false);
                  }
                }}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                Sblocca
              </button>
            </div>
            <p className="text-[11px] text-amber-900/80 dark:text-amber-200/85">
              Hai perso la master password? Apri la scheda <strong>Credenziali</strong> e usa il ripristino da file oppure,
              come ultima ratio, il reset che cancella tutte le password salvate.
            </p>
          </div>
        ) : null}

        {vaultConfigured && vaultUnlocked ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/25">
              <p className="text-sm text-emerald-900 dark:text-emerald-100">
                Sessione vault <strong>attiva</strong>: puoi salvare e usare le password protette. Su questo PC la
                chiave di sessione può essere memorizzata nei dati applicativi dopo il primo sblocco.
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.lockVault();
                    await refreshVault();
                    toast.success("Sessione vault chiusa");
                  } catch (e) {
                    toast.error(formatErr(e));
                  }
                }}
                className="mt-3 rounded-lg border border-emerald-700/40 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-600 dark:text-emerald-100 dark:hover:bg-emerald-950/60"
              >
                Blocca sessione vault
              </button>
              <p className="mt-2 text-[11px] text-emerald-800/90 dark:text-emerald-200/85">
                Dopo un import backup potrebbe essere necessario inserire di nuovo la master password una volta.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cambia master password</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Tutte le password già salvate vengono ricifrate con la nuova chiave (serve la password attuale).
              </p>
              <div className="mt-3 grid max-w-md gap-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Password attuale</label>
                <input
                  type="password"
                  value={changeCur}
                  onChange={(e) => setChangeCur(e.target.value)}
                  autoComplete="current-password"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Nuova password (min 8)</label>
                <input
                  type="password"
                  value={changeNew}
                  onChange={(e) => setChangeNew(e.target.value)}
                  autoComplete="new-password"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Ripeti nuova password</label>
                <input
                  type="password"
                  value={changeNew2}
                  onChange={(e) => setChangeNew2(e.target.value)}
                  autoComplete="new-password"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
                <button
                  type="button"
                  disabled={
                    changeBusy ||
                    changeNew.length < 8 ||
                    changeNew !== changeNew2 ||
                    !changeCur.trim()
                  }
                  onClick={async () => {
                    if (changeNew !== changeNew2) {
                      toast.error("Le nuove password non coincidono");
                      return;
                    }
                    setChangeBusy(true);
                    try {
                      const st = await api.changeVaultMasterPassword(changeCur, changeNew);
                      setVault(st.configured, st.unlocked);
                      setChangeCur("");
                      setChangeNew("");
                      setChangeNew2("");
                      toast.success("Master password aggiornata");
                    } catch (e) {
                      toast.error(formatErr(e));
                    } finally {
                      setChangeBusy(false);
                    }
                  }}
                  className="mt-1 w-fit rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
                >
                  Aggiorna master password
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Kit di recupero (consigliato)</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Se dimentichi la master password, puoi impostarne una nuova <strong>solo</strong> con questo file e la sua{" "}
                <strong>passphrase di recupero</strong> (scegline una forte e conservala separatamente dal file).
              </p>
              <div className="mt-3 grid max-w-md gap-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Passphrase recupero (min 8 caratteri)
                </label>
                <input
                  type="password"
                  value={recExportPass}
                  onChange={(e) => setRecExportPass(e.target.value)}
                  autoComplete="new-password"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Ripeti passphrase</label>
                <input
                  type="password"
                  value={recExportPass2}
                  onChange={(e) => setRecExportPass2(e.target.value)}
                  autoComplete="new-password"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
                <button
                  type="button"
                  disabled={
                    recExportBusy ||
                    recExportPass.length < 8 ||
                    recExportPass !== recExportPass2 ||
                    !api.isTauriRuntime()
                  }
                  onClick={async () => {
                    if (recExportPass !== recExportPass2) {
                      toast.error("Le passphrase non coincidono");
                      return;
                    }
                    setRecExportBusy(true);
                    try {
                      const path = await save({
                        title: "Salva kit di recupero vault",
                        defaultPath: "rdpmanager-vault-recovery.json",
                        filters: [{ name: "JSON", extensions: ["json"] }],
                      });
                      if (!path) {
                        setRecExportBusy(false);
                        return;
                      }
                      await api.exportVaultRecoveryKit(path, recExportPass);
                      toast.success("Kit di recupero salvato");
                    } catch (e) {
                      toast.error(formatErr(e));
                    } finally {
                      setRecExportBusy(false);
                    }
                  }}
                  className="mt-1 w-fit rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Esporta file recupero…
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {vaultConfigured ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ripristino con file di recupero</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Usa il file creato mentre il vault era sbloccato (anche se ora non ricordi la master password). Imposti una{" "}
                <strong>nuova</strong> master password; clienti e password salvate restano nel database.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!api.isTauriRuntime()}
                  onClick={async () => {
                    try {
                      const path = await open({
                        title: "Seleziona kit di recupero",
                        filters: [{ name: "JSON", extensions: ["json"] }],
                        multiple: false,
                      });
                      const p = typeof path === "string" ? path : path?.[0];
                      if (p) setRecImportPath(p);
                    } catch (e) {
                      toast.error(formatErr(e));
                    }
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
                >
                  Scegli file…
                </button>
                {recImportPath ? (
                  <span className="self-center truncate text-xs text-slate-600 dark:text-slate-400">{recImportPath}</span>
                ) : null}
              </div>
              <div className="mt-3 grid max-w-md gap-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Passphrase di recupero</label>
                <input
                  type="password"
                  value={recImportPass}
                  onChange={(e) => setRecImportPass(e.target.value)}
                  autoComplete="current-password"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Nuova master password (min 8)</label>
                <input
                  type="password"
                  value={recImportNew}
                  onChange={(e) => setRecImportNew(e.target.value)}
                  autoComplete="new-password"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Ripeti nuova master password</label>
                <input
                  type="password"
                  value={recImportNew2}
                  onChange={(e) => setRecImportNew2(e.target.value)}
                  autoComplete="new-password"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
                <button
                  type="button"
                  disabled={
                    recImportBusy ||
                    !recImportPath.trim() ||
                    recImportPass.length < 8 ||
                    recImportNew.length < 8 ||
                    recImportNew !== recImportNew2
                  }
                  onClick={async () => {
                    if (recImportNew !== recImportNew2) {
                      toast.error("Le nuove password non coincidono");
                      return;
                    }
                    setRecImportBusy(true);
                    try {
                      const st = await api.recoverVaultWithRecoveryKit(
                        recImportPath.trim(),
                        recImportPass,
                        recImportNew,
                      );
                      setVault(st.configured, st.unlocked);
                      setRecImportPass("");
                      setRecImportNew("");
                      setRecImportNew2("");
                      toast.success("Vault recuperato con nuova master password");
                    } catch (e) {
                      toast.error(formatErr(e));
                    } finally {
                      setRecImportBusy(false);
                    }
                  }}
                  className="mt-1 w-fit rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Applica recupero
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-rose-300/80 bg-rose-50/50 p-4 dark:border-rose-900 dark:bg-rose-950/25">
              <h3 className="text-sm font-semibold text-rose-900 dark:text-rose-100">Senza file di recupero</h3>
              <p className="mt-1 text-xs text-rose-900/90 dark:text-rose-200/90">
                Non è possibile recuperare crittograficamente la master password senza kit di recupero o backup adeguato.
                Puoi solo <strong>azzerare</strong> il vault: restano clienti e connessioni (host, nomi, …), ma tutte le
                password salvate nel database vengono rimosse.
              </p>
              <label className="mt-3 block text-xs font-medium text-rose-900 dark:text-rose-200">
                Digita {RESET_CONFIRM_PHRASE} per confermare
              </label>
              <input
                type="text"
                value={resetPhrase}
                onChange={(e) => setResetPhrase(e.target.value)}
                autoComplete="off"
                className="mt-1 max-w-xs rounded-lg border border-rose-200 px-3 py-2 text-sm dark:border-rose-900 dark:bg-slate-900"
              />
              <button
                type="button"
                disabled={resetBusy || resetPhrase.trim() !== RESET_CONFIRM_PHRASE}
                onClick={async () => {
                  setResetBusy(true);
                  try {
                    await api.resetVaultWipeSecrets(resetPhrase.trim());
                    setResetPhrase("");
                    await refreshVault();
                    toast.success("Vault azzerato: password salvate rimosse");
                  } catch (e) {
                    toast.error(formatErr(e));
                  } finally {
                    setResetBusy(false);
                  }
                }}
                className="mt-3 block rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                Azzera vault e cancella password salvate
              </button>
            </div>
          </div>
        ) : null}
            </>
          ) : settingsSection === "presets" ? (
            <div className="flex w-full min-w-0 flex-col gap-3 md:h-[calc(100vh-14rem)] md:min-h-[22rem]">
              <nav
                className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-2xl border-2 border-indigo-200/70 bg-gradient-to-b from-white to-indigo-50/80 p-1.5 shadow-md shadow-indigo-900/10 ring-1 ring-indigo-100 dark:border-indigo-500/40 dark:from-slate-900 dark:to-indigo-950/50 dark:shadow-black/40 dark:ring-indigo-500/20"
                role="tablist"
                aria-label="Vista catalogo servizi"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={presetsSubSection === "services_catalog"}
                  onClick={() => setPresetsSubSection("services_catalog")}
                  className={`relative rounded-xl px-5 py-2.5 text-sm font-bold tracking-tight transition-all ${
                    presetsSubSection === "services_catalog"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/35 ring-2 ring-white/90 dark:bg-indigo-500 dark:text-white dark:shadow-indigo-950/60 dark:ring-indigo-200/40"
                      : "text-slate-600 hover:bg-white/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/90 dark:hover:text-white"
                  }`}
                >
                  Servizi
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={presetsSubSection === "versions_releases"}
                  onClick={() => setPresetsSubSection("versions_releases")}
                  className={`relative rounded-xl px-5 py-2.5 text-sm font-bold tracking-tight transition-all ${
                    presetsSubSection === "versions_releases"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/35 ring-2 ring-white/90 dark:bg-indigo-500 dark:text-white dark:shadow-indigo-950/60 dark:ring-indigo-200/40"
                      : "text-slate-600 hover:bg-white/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/90 dark:hover:text-white"
                  }`}
                >
                  Versioni e Release
                </button>
              </nav>

              {presetsSubSection === "services_catalog" ? (
                <>
                  <p className="shrink-0 text-xs text-slate-600 dark:text-slate-400">
                    <strong>Nomi servizio</strong> e <strong>ambienti</strong> affiancati: aggiungi o modifica qui, poi salva con il pulsante in
                    basso. Gli ambienti sono globali per tutti i clienti nei form connessioni.
                  </p>
                  <div className="flex min-h-[16rem] flex-1 flex-col gap-3 overflow-hidden md:min-h-0 xl:flex-row xl:gap-4">
                    <div className="flex min-h-[12rem] flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 shadow-sm md:min-h-0 dark:border-slate-700">
                      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/80">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Nomi servizio (RDP / WEB)</div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Etichette nei form e in Dashboard → Panoramica servizi.
                        </p>
                      </div>
                      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                        <table className="w-full min-w-[280px] border-collapse text-left text-sm">
                          <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                            <tr>
                              <th className="px-3 py-2">Nome servizio</th>
                              <th className="w-28 px-3 py-2">Tipo</th>
                              <th className="w-11 px-2 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {presetRows.map((row, i) => (
                              <tr key={row.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                                <td className="px-3 py-2 align-middle">
                                  <input
                                    type="text"
                                    value={row.name}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setPresetRows((rows) => rows.map((r, j) => (j === i ? { ...r, name: v } : r)));
                                    }}
                                    placeholder="es. CRM"
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                                  />
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <select
                                    value={row.kind}
                                    onChange={(e) => {
                                      const kind = e.target.value as ConnectionPresetKind;
                                      setPresetRows((rows) => rows.map((r, j) => (j === i ? { ...r, kind } : r)));
                                    }}
                                    className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                                  >
                                    <option value="rdp">RDP</option>
                                    <option value="web">WEB</option>
                                  </select>
                                </td>
                                <td className="px-2 py-2 align-middle">
                                  <button
                                    type="button"
                                    onClick={() => setPresetRows((rows) => rows.filter((_, j) => j !== i))}
                                    className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                                    aria-label="Rimuovi riga"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                        <button
                          type="button"
                          onClick={() => setPresetRows((rows) => [...rows, presetRowTemplate("rdp")])}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600"
                        >
                          <Plus size={16} /> Aggiungi servizio
                        </button>
                      </div>
                    </div>

                    <div className="flex min-h-[12rem] flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 shadow-sm md:min-h-0 dark:border-slate-700">
                      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/80">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ambienti</div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Ordinabili · usati nei form e nella Dashboard.
                        </p>
                      </div>
                      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                        <table className="w-full min-w-[260px] border-collapse text-left text-sm">
                          <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                            <tr>
                              <th className="px-3 py-2">Ambiente</th>
                              <th className="w-[88px] px-2 py-2 text-center">Ordina</th>
                              <th className="w-11 px-2 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {envRows.map((env, ei) => (
                              <tr key={env.id} className="border-b border-slate-100 dark:border-slate-800">
                                <td className="align-middle px-3 py-2">
                                  <input
                                    value={env.name}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setEnvRows((rows) => rows.map((r, j) => (j === ei ? { ...r, name: v } : r)));
                                    }}
                                    placeholder="es. PROD"
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                                  />
                                </td>
                                <td className="align-middle px-2 py-2">
                                  <div className="flex justify-center gap-0.5">
                                    <button
                                      type="button"
                                      aria-label={`Sposta ambiente sopra`}
                                      disabled={ei === 0}
                                      onClick={() =>
                                        setEnvRows((rows) => {
                                          if (ei <= 0) return rows;
                                          const copy = [...rows];
                                          const t = copy[ei - 1]!;
                                          copy[ei - 1] = copy[ei]!;
                                          copy[ei] = t;
                                          return copy;
                                        })
                                      }
                                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                    >
                                      <ArrowUp size={16} aria-hidden />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`Sposta ambiente sotto`}
                                      disabled={ei >= envRows.length - 1}
                                      onClick={() =>
                                        setEnvRows((rows) => {
                                          if (ei >= rows.length - 1) return rows;
                                          const copy = [...rows];
                                          const t = copy[ei + 1]!;
                                          copy[ei + 1] = copy[ei]!;
                                          copy[ei] = t;
                                          return copy;
                                        })
                                      }
                                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                    >
                                      <ArrowDown size={16} aria-hidden />
                                    </button>
                                  </div>
                                </td>
                                <td className="align-middle px-2 py-2">
                                  <button
                                    type="button"
                                    onClick={() => setEnvRows((rows) => rows.filter((_, j) => j !== ei))}
                                    className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                                    aria-label="Rimuovi ambiente"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                        <button
                          type="button"
                          onClick={() => setEnvRows((rows) => [...rows, environmentRowTemplate()])}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600"
                        >
                          <Plus size={16} /> Aggiungi ambiente
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={saveConnectionPresets}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Salva catalogo servizi
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="shrink-0 text-xs text-slate-600 dark:text-slate-400">
                    Scegli il servizio nella colonna più stretta · <strong>versione</strong> e <strong>release</strong> sono affiancate; la
                    colonna «Abilitato» vale solo per quel servizio. Premi «Salva catalogo servizi» in basso (stesso pulsante dopo le modifiche in entrambi i sottomenu).
                  </p>
                  <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden md:flex-row md:gap-4">
                    <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-indigo-200/85 bg-indigo-50/60 shadow-sm dark:border-indigo-900/55 dark:bg-indigo-950/30 md:w-[13.5rem] md:max-w-[14rem]">
                      <div className="shrink-0 px-3 pt-3">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Servizio attivo</div>
                        <p className="mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                          Clicca un nome · le colonne «Abilitato» lo rispettano.
                        </p>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2">
                        {matrixSelectablePresets.length === 0 ? (
                          <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                            Aggiungi almeno un servizio dalla sottovista «Servizi».
                          </p>
                        ) : (
                          <ul className="space-y-1 pr-0.5" role="listbox" aria-label="Servizi per versione e release">
                            {matrixSelectablePresets.map((p) => {
                              const selected = p.id === matrixFocusPresetId;
                              const nm = (p.name || "Senza nome").trim();
                              return (
                                <li key={p.id}>
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    onClick={() => setMatrixFocusPresetId(p.id)}
                                    className={`flex w-full flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors ${
                                      selected
                                        ? "border-indigo-400 bg-white shadow-sm ring-1 ring-indigo-300 dark:border-indigo-500 dark:bg-indigo-950/50 dark:ring-indigo-600"
                                        : "border-transparent bg-white/60 hover:bg-white dark:bg-slate-900/40 dark:hover:bg-slate-900/70"
                                    }`}
                                  >
                                    <span className="truncate font-medium text-slate-900 dark:text-slate-100">{nm}</span>
                                    <span
                                      className={`inline-flex w-fit rounded px-1 py-px text-[10px] font-semibold uppercase tracking-wide ${
                                        p.kind === "web"
                                          ? "bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300"
                                          : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300"
                                      }`}
                                    >
                                      {p.kind === "web" ? "Web" : "Rdp"}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </aside>

                    <div className="grid min-h-[12rem] flex-1 grid-cols-1 gap-3 overflow-hidden md:min-h-0 xl:grid-cols-2 xl:gap-4">
                      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-700">
                        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/80">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Versione prodotto</div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">Catalogo · abilitazione per servizio selezionato.</p>
                        </div>
                        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                          <table className="w-full min-w-[240px] border-collapse text-left text-sm">
                            <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                              <tr>
                                <th className="px-3 py-2">Valore</th>
                                <th className="w-[5.25rem] px-2 py-2 text-center">Abilitato</th>
                                <th className="w-11 px-2 py-2" />
                              </tr>
                            </thead>
                            <tbody>
                              {versionOptionRows.map((vo, vi) => (
                                <tr key={vo.id} className="border-b border-slate-100 dark:border-slate-800">
                                  <td className="align-top px-3 py-2">
                                    <input
                                      value={vo.value}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setVersionOptionRows((rows) => rows.map((r, j) => (j === vi ? { ...r, value: v } : r)));
                                      }}
                                      placeholder="es. 365"
                                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                                    />
                                  </td>
                                  <td className="align-middle px-2 py-2">
                                    <div className="flex justify-center">
                                      {matrixFocusPresetId ? (
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
                                          checked={vo.presetIds.includes(matrixFocusPresetId)}
                                          title={`Disponibile per ${(matrixFocusPreset?.name || "servizio").trim() || matrixFocusPresetId}`}
                                          aria-label={`Versione ${vo.value || "vuota"} per ${(matrixFocusPreset?.name || "servizio").trim() || matrixFocusPresetId}`}
                                          onChange={(e) => {
                                            const on = e.target.checked;
                                            setVersionOptionRows((rows) =>
                                              rows.map((r, j) =>
                                                j === vi
                                                  ? {
                                                      ...r,
                                                      presetIds: on
                                                        ? [...new Set([...r.presetIds, matrixFocusPresetId])]
                                                        : r.presetIds.filter((x) => x !== matrixFocusPresetId),
                                                    }
                                                  : r,
                                              ),
                                            );
                                          }}
                                        />
                                      ) : (
                                        <span className="text-slate-400">—</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="align-top px-2 py-2">
                                    <button
                                      type="button"
                                      onClick={() => setVersionOptionRows((rows) => rows.filter((_, j) => j !== vi))}
                                      className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                                      aria-label="Rimuovi versione prodotto"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                          <button
                            type="button"
                            onClick={() => setVersionOptionRows((rows) => [...rows, versionOptionRowTemplate()])}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600"
                          >
                            <Plus size={16} /> Aggiungi versione
                          </button>
                        </div>
                      </div>

                      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-700">
                        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/80">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Release</div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Catalogo · abilitazione per servizio selezionato.
                          </p>
                        </div>
                        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                          <table className="w-full min-w-[240px] border-collapse text-left text-sm">
                            <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                              <tr>
                                <th className="px-3 py-2">Nome</th>
                                <th className="w-[5.25rem] px-2 py-2 text-center">Abilitato</th>
                                <th className="w-11 px-2 py-2" />
                              </tr>
                            </thead>
                            <tbody>
                              {releaseOptionRows.map((ro, ri) => (
                                <tr key={ro.id} className="border-b border-slate-100 dark:border-slate-800">
                                  <td className="align-top px-3 py-2">
                                    <input
                                      value={ro.name}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setReleaseOptionRows((rows) => rows.map((r, j) => (j === ri ? { ...r, name: v } : r)));
                                      }}
                                      placeholder="es. 2024.3"
                                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                                    />
                                  </td>
                                  <td className="align-middle px-2 py-2">
                                    <div className="flex justify-center">
                                      {matrixFocusPresetId ? (
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
                                          checked={ro.presetIds.includes(matrixFocusPresetId)}
                                          title={`Disponibile per ${(matrixFocusPreset?.name || "servizio").trim() || matrixFocusPresetId}`}
                                          aria-label={`Release ${ro.name || "vuota"} per ${(matrixFocusPreset?.name || "servizio").trim() || matrixFocusPresetId}`}
                                          onChange={(e) => {
                                            const on = e.target.checked;
                                            setReleaseOptionRows((rows) =>
                                              rows.map((r, j) =>
                                                j === ri
                                                  ? {
                                                      ...r,
                                                      presetIds: on
                                                        ? [...new Set([...r.presetIds, matrixFocusPresetId])]
                                                        : r.presetIds.filter((x) => x !== matrixFocusPresetId),
                                                    }
                                                  : r,
                                              ),
                                            );
                                          }}
                                        />
                                      ) : (
                                        <span className="text-slate-400">—</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="align-top px-2 py-2">
                                    <button
                                      type="button"
                                      onClick={() => setReleaseOptionRows((rows) => rows.filter((_, j) => j !== ri))}
                                      className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                                      aria-label="Rimuovi release"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                          <button
                            type="button"
                            onClick={() => setReleaseOptionRows((rows) => [...rows, releaseOptionRowTemplate()])}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600"
                          >
                            <Plus size={16} /> Aggiungi release
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={saveConnectionPresets}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Salva catalogo servizi
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : settingsSection === "contracts" ? (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Definisci le <strong>tipologie di contratto</strong> disponibili nel menu a tendina del form cliente (Dati
                aggiuntivi). Le etichette compaiono nella Dashboard → Panoramica clienti.
              </p>
              {!api.isTauriRuntime() ? (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Disponibile solo nell&apos;app desktop Tauri.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full min-w-[360px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                          <th className="px-3 py-2">Tipo contratto</th>
                          <th className="w-12 px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {contractTypeRows.map((row, ri) => (
                          <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                            <td className="px-3 py-2">
                              <input
                                value={row.name}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setContractTypeRows((rows) =>
                                    rows.map((r, j) => (j === ri ? { ...r, name: v } : r)),
                                  );
                                }}
                                placeholder="Es. Full, Assistenza, Manutenzione"
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                              />
                            </td>
                            <td className="px-2 py-2 align-top">
                              <button
                                type="button"
                                aria-label="Elimina riga"
                                onClick={() => setContractTypeRows((rows) => rows.filter((_, j) => j !== ri))}
                                className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setContractTypeRows((rows) => [...rows, contractTypeRowTemplate()])}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
                    >
                      <Plus size={16} /> Aggiungi tipo
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveContractTypesCatalog()}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Salva catalogo contratti
                    </button>
                  </div>
                </>
              )}
            </>
          ) : settingsSection === "crm_modules" ? (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Definisci i <strong>moduli</strong> disponibili nel campo «Moduli» degli accessi WEB (Dati aggiuntivi).
                Le etichette compaiono nella Dashboard → Panoramica clienti quando la colonna è abilitata in «Dashboard».
              </p>
              {!api.isTauriRuntime() ? (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Disponibile solo nell&apos;app desktop Tauri.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full min-w-[360px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                          <th className="px-3 py-2">Modulo</th>
                          <th className="w-12 px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {crmModuleRows.map((row, ri) => (
                          <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                            <td className="px-3 py-2">
                              <input
                                value={row.name}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setCrmModuleRows((rows) =>
                                    rows.map((r, j) => (j === ri ? { ...r, name: v } : r)),
                                  );
                                }}
                                placeholder="Es. Fatture, CRM, Portale…"
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                              />
                            </td>
                            <td className="px-2 py-2 align-top">
                              <button
                                type="button"
                                aria-label="Elimina riga"
                                onClick={() => setCrmModuleRows((rows) => rows.filter((_, j) => j !== ri))}
                                className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCrmModuleRows((rows) => [...rows, crmModuleRowTemplate()])}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
                    >
                      <Plus size={16} /> Aggiungi modulo
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveCrmModulesCatalog()}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Salva catalogo moduli
                    </button>
                  </div>
                </>
              )}
            </>
          ) : settingsSection === "dashboard" ? (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Scegli quali <strong>clienti</strong> mostrare in <strong>Panoramica clienti</strong> e{" "}
                <strong>Panoramica servizi</strong>, quali <strong>colonne</strong> nella panoramica clienti e quali{" "}
                <strong>servizi</strong> come colonne nella panoramica servizi. La colonna Cliente resta sempre visibile
                nella panoramica clienti.
              </p>
              {!api.isTauriRuntime() ? (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Disponibile solo nell&apos;app desktop Tauri.
                </p>
              ) : (
                <>
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Clienti nelle due panoramiche
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Stesso insieme della pagina Clienti (clienti attivi). «Tutti» = nessun filtro.
                      «Nessuno» = tabelle vuote finché non spunti almeno un nome. Salva con il pulsante in fondo alla
                      pagina.
                    </p>
                    {dashboardPickerBusy ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Caricamento clienti…</p>
                    ) : dashboardPickerSorted.length === 0 ? (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Nessun cliente attivo. Aggiungine dalla pagina Clienti.
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setDashboardDraft((d) => ({
                                ...normalizeDashboardLayout(d),
                                overviewIncludedClientIds: null,
                              }))
                            }
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Tutti
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDashboardDraft((d) => ({
                                ...normalizeDashboardLayout(d),
                                overviewIncludedClientIds: [],
                              }))
                            }
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Nessuno
                          </button>
                        </div>
                        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-950">
                          <ul className="space-y-1">
                            {dashboardPickerSorted.map((c) => (
                              <li key={c.id}>
                                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
                                  <input
                                    type="checkbox"
                                    checked={isClientIncludedInDashboardOverviews(dashboardDraft, c.id)}
                                    onChange={() =>
                                      setDashboardDraft((d) =>
                                        toggleOverviewClientInclusion(d, dashboardPickerAllIds, c.id),
                                      )
                                    }
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                  />
                                  <span className="text-slate-800 dark:text-slate-100">{c.name}</span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Colonne panoramica clienti
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {COMMERCIAL_OVERVIEW_COLUMN_OPTIONS.map(({ id, label }) => {
                        const on = isCommercialColumnVisible(dashboardDraft, id);
                        return (
                          <label
                            key={id}
                            className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() =>
                                setDashboardDraft((d) => {
                                  const next = normalizeDashboardLayout(d);
                                  const vis = { ...next.commercialColumnVisibility };
                                  if (on) vis[id] = false;
                                  else delete vis[id];
                                  return { ...next, commercialColumnVisibility: vis };
                                })
                              }
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Colonne Panoramica servizi
                    </h3>
                    {normalizePresetRows(presetRows).length === 0 ? (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Nessun servizio con nome definito. Configurali nella scheda «Servizi».
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {normalizePresetRows(presetRows).map((p) => {
                          const matrixOn = !dashboardDraft.matrixHiddenPresetIds.includes(p.id);
                          return (
                            <li
                              key={p.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                            >
                              <span className="font-medium text-slate-800 dark:text-slate-100">{p.name}</span>
                              <label className="flex cursor-pointer items-center gap-2 text-slate-600 dark:text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={matrixOn}
                                  onChange={() =>
                                    setDashboardDraft((d) => {
                                      const next = normalizeDashboardLayout(d);
                                      const hidden = new Set(next.matrixHiddenPresetIds);
                                      if (matrixOn) hidden.add(p.id);
                                      else hidden.delete(p.id);
                                      return { ...next, matrixHiddenPresetIds: [...hidden] };
                                    })
                                  }
                                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                />
                                Mostra colonna in Panoramica servizi
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void saveDashboardLayout()}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Salva layout Dashboard
                    </button>
                  </div>
                </>
              )}
            </>
          ) : settingsSection === "client_card" ? (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Scegli quali <strong>moduli</strong> mostrare nella scheda cliente, poi componi le <strong>righe</strong>: più
                moduli sulla stessa riga restano affiancati (larghezze relative con «span»). I moduli <strong>disattivati</strong>{" "}
                non compaiono nella griglia sotto così il layout riflette solo ciò che è visibile nella pagina. Ordine delle
                righe con la <strong>presa verticale</strong>, riordino in riga con la <strong>presa sul modulo</strong>. Per
                ogni riga puoi impostare l&apos;altezza (contenuto, riempimento o pixel fissi). RDP e Web restano due pannelli
                distinti anche se condividono i dati di connessione.
              </p>
              {!api.isTauriRuntime() ? (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Disponibile solo nell&apos;app desktop Tauri.
                </p>
              ) : (
                <>
                  <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-2 dark:border-slate-700 dark:bg-slate-900/40">
                    {CLIENT_CARD_PANEL_IDS.map((panelId) => {
                      const vk = CLIENT_CARD_VISIBILITY_KEY[panelId];
                      const meta = CLIENT_CARD_PANEL_LABELS[panelId];
                      return (
                        <label
                          key={panelId}
                          className="flex cursor-pointer gap-3 rounded-lg border border-transparent bg-white/90 px-3 py-2 dark:bg-slate-950/65"
                        >
                          <input
                            type="checkbox"
                            checked={normalizeClientCardModules(clientCardModulesDraft)[vk]}
                            onChange={() =>
                              setClientCardModulesDraft((d) => {
                                const base = normalizeClientCardModules(d);
                                return normalizeClientCardModules({ ...base, [vk]: !base[vk] });
                              })
                            }
                            className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">
                              {meta.title}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-400">{meta.hint}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div
                    aria-label="Layout griglia scheda cliente"
                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40"
                  >
                    <p className="mb-3 text-xs font-medium text-slate-600 dark:text-slate-400">
                      Disposizione e altezza righe
                    </p>
                    <ClientCardLayoutEditor
                      modules={normalizeClientCardModules(clientCardModulesDraft)}
                      setModules={setClientCardModulesDraft}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void saveClientCardModules()}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Salva moduli scheda cliente
                    </button>
                  </div>
                </>
              )}
            </>
          ) : settingsSection === "collaborator_roles" ? (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Elenco degli <strong>incarichi interni</strong> (CEO, Direttore, PM…) con priorità numerica più bassa =
                più in alto nell&apos;ordine. Puoi modificare etichetta e rank, riordinare con le frecce, oppure creare nuovi ruoli.
                Eliminabile solo un ruolo non assegnato a nessun collaboratore.
              </p>
              {!api.isTauriRuntime() ? (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Disponibile solo nell&apos;app desktop Tauri.
                </p>
              ) : collabRolesBusy ? (
                <p className="text-sm text-slate-500">Caricamento ruoli…</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="min-w-[200px] flex-1">
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Nuovo ruolo
                      </label>
                      <input
                        value={newCollabRoleLabel}
                        onChange={(e) => setNewCollabRoleLabel(e.target.value)}
                        placeholder="Es. Capo progetto"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void addCollabRole()}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      <Plus size={16} className="mr-1 inline" /> Aggiungi
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                        <tr className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                          <th className="px-3 py-2">Ordine</th>
                          <th className="px-3 py-2">Etichetta</th>
                          <th className="px-3 py-2">Priorità (rank)</th>
                          <th className="px-3 py-2">Azioni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedCollabRoles.map((r, idx) => {
                          const draft = collabRoleDrafts[r.id] ?? {
                            label: r.label,
                            sortRank: String(r.sortRank),
                          };
                          return (
                            <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                              <td className="px-3 py-2 align-top">
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    aria-label="Sposta su"
                                    disabled={idx === 0}
                                    onClick={() => void moveCollabRole(r.id, -1)}
                                    className="rounded border border-slate-200 p-1 disabled:opacity-40 dark:border-slate-700"
                                  >
                                    <ArrowUp size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Sposta giù"
                                    disabled={idx === sortedCollabRoles.length - 1}
                                    onClick={() => void moveCollabRole(r.id, 1)}
                                    className="rounded border border-slate-200 p-1 disabled:opacity-40 dark:border-slate-700"
                                  >
                                    <ArrowDown size={14} />
                                  </button>
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <input
                                  value={draft.label}
                                  onChange={(e) =>
                                    setCollabRoleDrafts((prev) => ({
                                      ...prev,
                                      [r.id]: { ...draft, label: e.target.value },
                                    }))
                                  }
                                  className="w-full min-w-[10rem] rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                                />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <input
                                  value={draft.sortRank}
                                  onChange={(e) =>
                                    setCollabRoleDrafts((prev) => ({
                                      ...prev,
                                      [r.id]: { ...draft, sortRank: e.target.value },
                                    }))
                                  }
                                  className="w-24 rounded border border-slate-200 px-2 py-1 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
                                />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void saveCollabRoleDraft(r.id)}
                                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                                  >
                                    Salva
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDelCollabRoleId(r.id)}
                                    className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300"
                                  >
                                    <Trash2 size={14} className="mr-1 inline" /> Elimina
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-10 text-xs text-slate-600 dark:text-slate-400">
                    Le <strong>competenze</strong> sono le voci attribuibili ai collaboratori (insieme ai clienti
                    gestiti); non sono i servizi RDP/Web delle connessioni. Puoi aggiungere voci anche dal form di
                    modifica collaboratore.
                  </p>
                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full min-w-[360px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                          <th className="px-3 py-2">Competenza</th>
                          <th className="w-12 px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {collaboratorCompetencyRows.map((row, ri) => (
                          <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                            <td className="px-3 py-2">
                              <input
                                value={row.name}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setCollaboratorCompetencyRows((rows) =>
                                    rows.map((r, j) => (j === ri ? { ...r, name: v } : r)),
                                  );
                                }}
                                placeholder="Es. Payroll, Consulenza HR, Assistenza primo livello…"
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                              />
                            </td>
                            <td className="px-2 py-2 align-top">
                              <button
                                type="button"
                                aria-label="Elimina riga"
                                onClick={() =>
                                  setCollaboratorCompetencyRows((rows) => rows.filter((_, j) => j !== ri))
                                }
                                className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCollaboratorCompetencyRows((rows) => [
                          ...rows,
                          collaboratorCompetencyRowTemplate(),
                        ])
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
                    >
                      <Plus size={16} /> Aggiungi competenza
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveCollaboratorCompetenciesCatalog()}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Salva catalogo competenze
                    </button>
                  </div>
                </>
              )}
            </>
          ) : settingsSection === "clients" ? (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                I clienti <strong>obsoleti</strong> non compaiono nella pagina Clienti né nelle liste RDP, VPN e Web: le
                connessioni restano salvate e tornano visibili se riattivi il cliente. Usa{" "}
                <strong>Nascondi da lista Clienti</strong> solo per togliere un cliente attivo dall&apos;elenco laterale
                della pagina Clienti: resterà comunque in Dashboard e nei form nuova connessione.
              </p>
              {api.isTauriRuntime() ? (
                <button
                  type="button"
                  onClick={() => setBulkClientsOpen(true)}
                  className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:bg-sky-950/70"
                >
                  Inserimento multiplo
                </button>
              ) : null}
              {!api.isTauriRuntime() ? (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Disponibile solo nell&apos;app desktop Tauri.
                </p>
              ) : (
                <>
                  {!vaultConfigured ? (
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Configura prima il vault nello stesso schermo (scheda Credenziali): serve per abilitare in sicurezza
                      l&apos;eliminazione definitiva dei clienti.
                    </p>
                  ) : (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        L&apos;eliminazione è irreversibile. Conferma la <strong>master password del vault</strong> per
                        abilitare il pulsante Elimina nella tabella; uscendo da questa scheda o cambiando sezione le
                        eliminazioni si disattivano di nuovo (il vault non viene sbloccato).
                      </p>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[200px] flex-1">
                          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                            Master password vault
                          </label>
                          <input
                            type="password"
                            value={deletionVaultPwd}
                            onChange={(e) => setDeletionVaultPwd(e.target.value)}
                            disabled={clientDeletionEnabled || deletionUnlockBusy}
                            autoComplete="current-password"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={clientDeletionEnabled || deletionUnlockBusy}
                          onClick={enableClientDeletion}
                          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
                        >
                          {deletionUnlockBusy ? "Verifica…" : "Abilita eliminazione"}
                        </button>
                        {clientDeletionEnabled ? (
                          <button
                            type="button"
                            onClick={() => {
                              setClientDeletionEnabled(false);
                              setDeletionVaultPwd("");
                            }}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Revoca
                          </button>
                        ) : null}
                      </div>
                      {clientDeletionEnabled ? (
                        <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
                          Eliminazione abilitata: usa Elimina solo se sei sicuro.
                        </p>
                      ) : null}
                    </div>
                  )}
                  {adminClientsBusy ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Caricamento elenco…</p>
                  ) : adminClients.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Nessun cliente nel database.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                            <th className="px-3 py-2">Cliente</th>
                            <th className="w-48 px-3 py-2">Stato</th>
                            <th className="min-w-[320px] px-3 py-2">Azioni</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...adminClients]
                            .sort((a, b) => {
                              const ao = a.obsolete ? 1 : 0;
                              const bo = b.obsolete ? 1 : 0;
                              if (ao !== bo) return ao - bo;
                              const ah = a.hiddenFromClientsNav ? 1 : 0;
                              const bh = b.hiddenFromClientsNav ? 1 : 0;
                              if (ah !== bh) return ah - bh;
                              return a.name.localeCompare(b.name, "it");
                            })
                            .map((c) => {
                              const isObsolete = Boolean(c.obsolete);
                              const hiddenNav = Boolean(c.hiddenFromClientsNav);
                              return (
                                <tr
                                  key={c.id}
                                  className={
                                    isObsolete
                                      ? "border-b border-slate-100 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/50"
                                      : "border-b border-slate-100 dark:border-slate-800"
                                  }
                                >
                                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{c.name}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-col gap-1">
                                      {isObsolete ? (
                                        <span className="inline-flex w-fit rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                                          Obsoleto
                                        </span>
                                      ) : (
                                        <span className="inline-flex w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                                          Attivo
                                        </span>
                                      )}
                                      {!isObsolete && hiddenNav ? (
                                        <span className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-950 dark:bg-amber-950/60 dark:text-amber-200">
                                          Nascosto in Clienti
                                        </span>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        disabled={toggleClientId === c.id}
                                        onClick={async () => {
                                          setToggleClientId(c.id);
                                          try {
                                            await api.updateClient(c.id, { obsolete: !isObsolete });
                                            setAdminClients(await api.getClientsAll());
                                            toast.success(
                                              isObsolete ? "Cliente riattivato" : "Cliente segnato come obsoleto",
                                            );
                                          } catch (e) {
                                            toast.error(formatErr(e));
                                          } finally {
                                            setToggleClientId(null);
                                          }
                                        }}
                                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                                          isObsolete
                                            ? "border border-sky-300 bg-white text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:bg-slate-900 dark:text-sky-200 dark:hover:bg-sky-950/40"
                                            : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                        }`}
                                      >
                                        {isObsolete ? "Riattiva" : "Segna obsoleto"}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          isObsolete || toggleNavClientId === c.id || toggleClientId === c.id
                                        }
                                        title={
                                          isObsolete
                                            ? "I clienti obsoleti non compaiono già nella pagina Clienti."
                                            : hiddenNav
                                              ? "Mostra di nuovo questo cliente nell'elenco della pagina Clienti."
                                              : "Nasconde solo dalla lista nella pagina Clienti; resta visibile in Dashboard e nei form delle connessioni."
                                        }
                                        onClick={async () => {
                                          setToggleNavClientId(c.id);
                                          try {
                                            await api.updateClient(c.id, { hiddenFromClientsNav: !hiddenNav });
                                            setAdminClients(await api.getClientsAll());
                                            toast.success(
                                              hiddenNav
                                                ? "Cliente di nuovo nella lista Clienti"
                                                : "Cliente nascosto dalla lista Clienti",
                                            );
                                          } catch (e) {
                                            toast.error(formatErr(e));
                                          } finally {
                                            setToggleNavClientId(null);
                                          }
                                        }}
                                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                                          hiddenNav
                                            ? "border border-amber-400 bg-white text-amber-950 hover:bg-amber-50 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-100 dark:hover:bg-amber-950/40"
                                            : "border border-violet-300 bg-white text-violet-900 hover:bg-violet-50 dark:border-violet-700 dark:bg-slate-900 dark:text-violet-100 dark:hover:bg-violet-950/35"
                                        }`}
                                      >
                                        {hiddenNav ? "Mostra in lista Clienti" : "Nascondi da lista Clienti"}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!clientDeletionEnabled || toggleClientId === c.id || toggleNavClientId === c.id}
                                        title={
                                          clientDeletionEnabled
                                            ? "Elimina definitivamente questo cliente"
                                            : "Abilita eliminazione con la master password del vault"
                                        }
                                        onClick={() => setDelConfirmClientId(c.id)}
                                        className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/50"
                                      >
                                        Elimina
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </>
          ) : settingsSection === "activity" ? (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Elenco degli ultimi eventi (creazione, modifica, eliminazione) sul database locale. Coincide con le voci
                che prima comparivano nella Dashboard.
              </p>
              {!api.isTauriRuntime() ? (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Disponibile solo nell&apos;app desktop Tauri.
                </p>
              ) : activityBusy || activityAudit === null ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Caricamento registro…</p>
              ) : activityAudit.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Nessun evento registrato.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-300/55 bg-neutral-50/95 shadow-sm shadow-slate-500/[0.05] ring-1 ring-slate-400/20 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none dark:ring-0">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-2">Azione</th>
                        <th className="px-4 py-2">Tipo</th>
                        <th className="px-4 py-2">Quando</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityAudit.map((a) => (
                        <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-4 py-2">{a.action}</td>
                          <td className="px-4 py-2">{a.entityType}</td>
                          <td className="px-4 py-2 text-xs text-slate-500">{new Date(a.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : settingsSection === "planning_setup" ? (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Definisci i <strong>tipi di attività</strong> per la pagina <strong>Pianificazione</strong>: ogni tipo si
                configura in una finestra a più colonne (campi standard,{" "}
                <strong>combobox</strong> con scelta singola dai cataloghi, <strong>selezione lista</strong> con più voci da
                clienti, servizi, ambienti, versioni, release, collaboratori, rubrica, contratti, moduli, ruoli, competenze).
                Solo i campi validi entrano nella lista salvata quando premi «Salva».
              </p>
              {!api.isTauriRuntime() ? (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Disponibile solo nell&apos;app desktop Tauri.
                </p>
              ) : (
                <>
                  <div className="space-y-2 rounded-xl border border-slate-300/55 bg-neutral-50/98 shadow-sm ring-1 ring-slate-400/15 dark:border-slate-800 dark:bg-slate-950 dark:ring-0">
                    {planningActivityTypeRows.length === 0 ? (
                      <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
                        Nessun tipo definito. Crea il primo con «Nuovo tipo».
                      </p>
                    ) : (
                      planningActivityTypeRows.map((row, ri) => {
                        const nf = row.fields?.length ?? 0;
                        const flags = [
                          row.showStatus ? "Stato" : null,
                          row.showStartDate ? "Inizio" : null,
                          row.showEndDate ? "Fine" : null,
                          row.showReminder ? "Prom." : null,
                        ].filter(Boolean);
                        const qb = [
                          row.showBtnCompleted,
                          row.showBtnTodo,
                          row.showBtnRestoreStatus,
                          row.showBtnPlanned,
                        ].filter(Boolean).length;
                        return (
                          <div
                            key={row.id}
                            className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-800"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-slate-900 dark:text-slate-50">{row.name || "(Senza nome)"}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {nf} campi definiti
                                {(flags.length ? ` · ${flags.join(", ")}` : "") + (qb > 0 ? ` · ${qb} pulsanti lista` : "")}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => openPlanningTypeModalEdit(ri)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold dark:border-slate-700"
                            >
                              Modifica
                            </button>
                            <button
                              type="button"
                              aria-label="Elimina tipo"
                              onClick={() => setPlanningActivityTypeRows((rows) => rows.filter((_, j) => j !== ri))}
                              className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-950/40"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPlanningStatesEditorOpen(true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-100"
                    >
                      Stati
                    </button>
                    <button
                      type="button"
                      onClick={openPlanningTypeModalCreate}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
                    >
                      <Plus size={16} /> Nuovo tipo
                    </button>
                    <button
                      type="button"
                      onClick={() => void savePlanningActivityTypesCatalog()}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                      title="Salva anche preavvisi promemoria se modificati nella sezione qui sotto"
                    >
                      Salva tipi (e preavvisi modificati)
                    </button>
                  </div>

                  <PlanningReminderPreAlertSetupSection
                    value={planningReminderPreAlertDraft}
                    onChange={setPlanningReminderPreAlertDraft}
                    onSave={(final) => void savePlanningReminderPreAlertCatalog(final)}
                    saving={planningReminderPreAlertSaveBusy}
                  />

                  <PlanningAgendaSetupSection
                    value={agendaSettingsDraft}
                    onChange={setAgendaSettingsDraft}
                    onSaveCatalog={saveAgendaSettingsCatalog}
                    saving={agendaSaveBusy}
                  />
                </>
              )}
            </>
          ) : settingsSection === "about" ? (
            <SettingsAboutSection />
          ) : null}
        </div>
      </section>

      <PlanningStatesEditorDialog
        open={planningStatesEditorOpen}
        rows={planningStateRows}
        onClose={() => setPlanningStatesEditorOpen(false)}
        onSaved={(saved) => {
          const copy = saved.map((r) => ({ ...r }));
          setPlanningStateRows(copy);
          if (settingsBaselineRef.current) {
            settingsBaselineRef.current = {
              ...settingsBaselineRef.current,
              planningStates: digestPlanningStates(copy),
            };
            bumpSettingsBaseline();
          }
        }}
      />

      <PlanningTypeEditorDialog
        open={planningModalOpen}
        draft={planningModalDraft}
        onDraftChange={setPlanningModalDraft}
        catalogBundle={planningCatalogBundle}
        onClose={closePlanningTypeModal}
        onConfirm={() => void applyPlanningTypeModal()}
      />

      <BulkClientsPasteDialog
        open={bulkClientsOpen}
        onClose={() => setBulkClientsOpen(false)}
        contractTypes={contractTypeRows}
        onImported={async () => {
          try {
            setAdminClients(await api.getClientsAll());
          } catch {
            /* ignore refresh errors */
          }
        }}
      />

      <ConfirmDialog
        open={delConfirmClientId !== null}
        title="Eliminare il cliente?"
        description={
          pendingDeleteClient
            ? `Verranno rimosse anche le connessioni associate a «${pendingDeleteClient.name}». L’operazione non può essere annullata.`
            : undefined
        }
        danger
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        onCancel={() => setDelConfirmClientId(null)}
        onConfirm={() => {
          const id = delConfirmClientId;
          setDelConfirmClientId(null);
          if (!id) return;
          void (async () => {
            try {
              await api.deleteClient(id);
              setAdminClients(await api.getClientsAll());
              toast.success("Cliente eliminato");
            } catch (e) {
              toast.error(formatErr(e));
            }
          })();
        }}
      />
      <ConfirmDialog
        open={delCollabRoleId !== null}
        danger
        title="Eliminare questo ruolo?"
        description="Possibile solo se nessun collaboratore ha ancora questo incarico."
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        onCancel={() => setDelCollabRoleId(null)}
        onConfirm={() => {
          const id = delCollabRoleId;
          setDelCollabRoleId(null);
          if (!id) return;
          void removeCollabRoleConfirmed(id);
        }}
      />

      {navigationBlocker.state === "blocked" ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-950"
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Uscire dalle Impostazioni?</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Alcune modifiche ai cataloghi, alla dashboard, alla scheda cliente o ai ruoli non sono ancora state confermate sul server.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                disabled={navigationLeaveBusy}
                onClick={() => navigationBlocker.reset?.()}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
              >
                Continua modifiche
              </button>
              <button
                type="button"
                disabled={navigationLeaveBusy}
                onClick={() => navigationBlocker.proceed?.()}
                className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-950"
              >
                Esci senza salvare
              </button>
              <button
                type="button"
                disabled={navigationLeaveBusy}
                onClick={() => void persistSettingsAndContinueNavigation()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {navigationLeaveBusy ? "Salvataggio…" : "Salva ed esci"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppPageShell>
  );
}
