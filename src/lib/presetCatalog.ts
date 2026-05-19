import { sanitizeAgendaSettings } from "@/lib/agendaSettings";
import { sanitizePlanningReminderPreAlertMinutes } from "@/lib/planningReminderPreAlert";
import type {
  AppSettings,
  ConnectionNamePreset,
  ConnectionPresetKind,
  ContractTypeDef,
  CrmModuleDef,
  CollaboratorCompetencyDef,
  EnvironmentDef,
  PlanningActivityPayload,
  PlanningActivityStored,
  PlanningActivityTypeDef,
  PlanningCatalogRef,
  PlanningCustomFieldKind,
  PlanningFieldDef,
  PlanningStateButtonRole,
  PlanningStateDef,
  ReleaseOptionDef,
  VersionOptionDef,
} from "@/types";
import { normalizeDashboardLayout } from "@/lib/dashboardLayout";
import { normalizeClientCardModules } from "@/lib/clientCardModules";
import { PLANNING_CATALOG_REF_OPTIONS, planningCatalogTitle } from "@/lib/planningCatalogOptions";

const PLANNING_STATE_BUTTON_ROLES = ["completed", "todo", "restore", "planned"] as PlanningStateButtonRole[];

function coercePlanningStateButtonRole(v: unknown): PlanningStateButtonRole | null {
  return typeof v === "string" && (PLANNING_STATE_BUTTON_ROLES as readonly string[]).includes(v)
    ? (v as PlanningStateButtonRole)
    : null;
}

export function normalizePlanningState(raw: Partial<PlanningStateDef>): PlanningStateDef {
  const associate = Boolean(raw.associateButton);
  const role = coercePlanningStateButtonRole(raw.buttonRole);
  return {
    id: raw.id?.trim() ? raw.id.trim() : newCatalogId(),
    name: raw.name ?? "",
    isDefault: Boolean(raw.isDefault),
    associateButton: associate,
    buttonRole: associate ? role : null,
  };
}

/** Id dello stato contrassegnato «predefinito», se presente e unico dopo normalizzazione. */
export function defaultPlanningStateId(states: PlanningStateDef[]): string | undefined {
  const d = states.find((s) => s.isDefault);
  return d?.id.trim() || undefined;
}

/** Messaggio errore in italiano se più stati usano lo stesso ruolo pulsante. */
export function planningStatesDuplicateButtonRoleError(rows: PlanningStateDef[]): string | undefined {
  const roleIt: Record<PlanningStateButtonRole, string> = {
    completed: "Completato",
    todo: "Da fare",
    restore: "Ripristina stato",
    planned: "Pianificato",
  };
  const acc: Partial<Record<PlanningStateButtonRole, string[]>> = {};
  for (const r of rows) {
    if (!r.name.trim() || !r.associateButton || !r.buttonRole) continue;
    const k = r.buttonRole;
    const label = r.name.trim();
    if (!acc[k]) acc[k] = [];
    acc[k]!.push(label);
  }
  for (const role of PLANNING_STATE_BUTTON_ROLES) {
    const list = acc[role];
    if (list && list.length > 1) {
      return `Più stati hanno il pulsante «${roleIt[role]}»: ${list.join(", ")}. Lascia un solo stato per ruolo.`;
    }
  }
  return undefined;
}

export function normalizePlanningStateRows(rows: PlanningStateDef[]): PlanningStateDef[] {
  const normalized = rows.map((r) => normalizePlanningState(r)).filter((r) => r.name.trim().length > 0);
  let foundDefault = false;
  return normalized.map((r) => {
    if (!r.isDefault) return r;
    if (foundDefault) return { ...r, isDefault: false };
    foundDefault = true;
    return r;
  });
}

export function planningStateRowTemplate(): PlanningStateDef {
  return normalizePlanningState({
    id: newCatalogId(),
    name: "",
    isDefault: false,
    associateButton: false,
    buttonRole: null,
  });
}

export function newCatalogId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const PLANNING_FIELD_KINDS_ALL: readonly PlanningCustomFieldKind[] = [
  "none",
  "string",
  "longText",
  "integer",
  "date",
  "time",
  "datetime",
  "boolean",
  "comboBox",
  "selectList",
];

function coercePlanningFieldKind(v: unknown): PlanningCustomFieldKind {
  return typeof v === "string" && (PLANNING_FIELD_KINDS_ALL as readonly string[]).includes(v)
    ? (v as PlanningCustomFieldKind)
    : "none";
}

function coercePlanningCatalogRef(v: unknown): PlanningCatalogRef | undefined {
  if (typeof v !== "string") return undefined;
  const allowed = PLANNING_CATALOG_REF_OPTIONS.map((x) => x.value) as readonly string[];
  return allowed.includes(v) ? (v as PlanningCatalogRef) : undefined;
}

export function normalizePlanningFieldDef(raw: Partial<PlanningFieldDef>): PlanningFieldDef {
  let kind = coercePlanningFieldKind(raw.kind);
  let catalogRef = coercePlanningCatalogRef(raw.catalogRef);
  const id = raw.id?.trim() ? raw.id.trim() : newCatalogId();
  // No trim mentre si digita in input controllati (altrimenti lo spazio in coda scompare).
  let label = raw.label ?? "";

  if (kind === "comboBox" || kind === "selectList") {
    if (!catalogRef) {
      kind = "none";
    }
  }
  if (kind === "none") {
    catalogRef = undefined;
  }

  if ((kind === "comboBox" || kind === "selectList") && catalogRef) {
    label = planningCatalogTitle(catalogRef);
  }

  return {
    id,
    label,
    kind,
    catalogRef: catalogRef ?? undefined,
    required: raw.required !== undefined ? Boolean(raw.required) : undefined,
    visibleInReminderSidebar: raw.visibleInReminderSidebar !== undefined ? Boolean(raw.visibleInReminderSidebar) : false,
  };
}

/** Opzioni select tipo campo. */
export const PLANNING_CUSTOM_FIELD_KIND_UI: readonly { value: PlanningCustomFieldKind; label: string }[] = [
  { value: "none", label: "Nessuno" },
  { value: "string", label: "Stringa" },
  { value: "longText", label: "Testo lungo (note)" },
  { value: "integer", label: "Intero" },
  { value: "date", label: "Data" },
  { value: "time", label: "Ora" },
  { value: "datetime", label: "Data e ora" },
  { value: "boolean", label: "Sì / No (boolean)" },
  { value: "comboBox", label: "Combobox (una scelta)" },
  { value: "selectList", label: "Selezione lista (più scelte)" },
];

/** Campo visibile nel form nuova attività. */
export function planningFieldIsActive(f: PlanningFieldDef): boolean {
  if (!f || f.kind === "none") return false;
  if (f.kind === "comboBox" || f.kind === "selectList") return Boolean(coercePlanningCatalogRef(f.catalogRef));
  return f.label.trim().length > 0;
}

function planningFieldHeading(f: PlanningFieldDef): string {
  return (f.label || "").trim() || "Campo";
}

function planningLocalDayMs(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt.getTime();
}

/** Messaggi errore compilazione richiesti dal tipo (campi + metadati). */
export function validatePlanningScratchInputs(
  type: PlanningActivityTypeDef,
  scratch: Record<string, unknown>,
  /** Istante di riferimento per “promemoria nel futuro” (default: ora). */
  nowMs: number = Date.now(),
): string[] {
  const errs: string[] = [];
  const gs = (id: string) => (typeof scratch[id] === "string" ? scratch[id] : "") as string;
  const gaz = (id: string) =>
    Array.isArray(scratch[id]) ? (scratch[id] as unknown[]).filter((x): x is string => typeof x === "string") : [];

  if (type.showStatus && type.requireStatus && !gs("__statusId").trim()) errs.push("Stato obbligatorio.");
  if (type.showStartDate && type.requireStartDate && !gs("__startDate").trim()) errs.push("Data inizio obbligatoria.");
  if (type.showEndDate && type.requireEndDate && !gs("__endDate").trim()) errs.push("Data fine obbligatoria.");
  if (type.showReminder && type.requireReminder && !gs("__reminderAt").trim()) errs.push("Promemoria obbligatorio.");

  const startYmd = type.showStartDate ? gs("__startDate").trim() : "";
  const endYmd = type.showEndDate ? gs("__endDate").trim() : "";
  if (startYmd && endYmd) {
    const t0 = planningLocalDayMs(startYmd);
    const t1 = planningLocalDayMs(endYmd);
    if (t0 != null && t1 != null && t1 < t0) {
      errs.push("La data fine non può precedere la data inizio.");
    }
  }

  if (type.showReminder) {
    const rem = gs("__reminderAt").trim();
    if (rem) {
      const d = new Date(rem);
      if (Number.isNaN(d.getTime())) errs.push("Promemoria: data e ora non valide.");
      else if (d.getTime() <= nowMs) {
        errs.push("Il promemoria deve essere successivo all’ora attuale (non nello stesso istante).");
      }
    }
  }

  for (const f of type.fields) {
    if (!planningFieldIsActive(f)) continue;
    if (!f.required) continue;
    if (f.kind === "comboBox") {
      if (!gs(f.id).trim()) errs.push(`${planningFieldHeading(f)} obbligatorio.`);
    } else if (f.kind === "selectList") {
      if (gaz(f.id).length === 0) errs.push(`${planningFieldHeading(f)}: seleziona almeno un valore.`);
    } else if (f.kind === "boolean") {
      /* compilato sempre (sì/no) */
    } else if (f.kind === "integer") {
      if (!gs(f.id).trim()) errs.push(`${planningFieldHeading(f)} obbligatorio.`);
    } else if (
      f.kind === "string" ||
      f.kind === "longText" ||
      f.kind === "date" ||
      f.kind === "time" ||
      f.kind === "datetime"
    ) {
      if (!gs(f.id).trim()) errs.push(`${planningFieldHeading(f)} obbligatorio.`);
    }
  }

  return errs;
}

function migrateLegacyTripleFields(raw: Record<string, unknown>): PlanningFieldDef[] {
  const out: PlanningFieldDef[] = [];
  const append = (id: string, kindProp: string, labelProp: string) => {
    const label = String(raw[labelProp] ?? "").trim();
    const kind = coercePlanningFieldKind(raw[kindProp]);
    if (kind === "none" || kind === "comboBox" || kind === "selectList") return;
    if (!label) return;
    out.push(normalizePlanningFieldDef({ id, label, kind, catalogRef: undefined }));
  };
  append("legacy-field-1", "field1Kind", "field1Label");
  append("legacy-field-2", "field2Kind", "field2Label");
  append("legacy-field-3", "field3Kind", "field3Label");
  return out;
}

export function newPlanningFieldTemplate(): PlanningFieldDef {
  return normalizePlanningFieldDef({ label: "", kind: "string" });
}

export function consolidatePlanningPayloadFieldMap(p: PlanningActivityPayload): Record<string, unknown> {
  const m: Record<string, unknown> = { ...(p.fieldValues ?? {}) };
  if (p.field1 !== undefined) m["legacy-field-1"] = p.field1;
  if (p.field2 !== undefined) m["legacy-field-2"] = p.field2;
  if (p.field3 !== undefined) m["legacy-field-3"] = p.field3;
  return m;
}

/** Normalizza un tipo salvato dal backend (includes migrazione field1–3). Non rimuove bozze di campi incompleti. */
export function normalizePlanningActivityType(raw: Partial<PlanningActivityTypeDef>): PlanningActivityTypeDef {
  const legacy = raw as Record<string, unknown>;
  let fields: PlanningFieldDef[] = [];

  if ("fields" in legacy && Array.isArray(legacy.fields)) {
    fields = (legacy.fields as unknown[]).map((x) => normalizePlanningFieldDef(x as Partial<PlanningFieldDef>));
  } else {
    fields = migrateLegacyTripleFields(legacy);
  }

  return {
    id: raw.id?.trim() ? raw.id.trim() : newCatalogId(),
    // Trim solo in salvataggio (planningTypeForPersist / apply modale).
    name: raw.name ?? "",
    fields,
    showStatus: raw.showStatus !== undefined ? Boolean(raw.showStatus) : false,
    showStartDate: Boolean(raw.showStartDate),
    showEndDate: Boolean(raw.showEndDate),
    showReminder: Boolean(raw.showReminder),
    showBtnCompleted: Boolean(raw.showBtnCompleted),
    showBtnTodo: Boolean(raw.showBtnTodo),
    showBtnRestoreStatus: Boolean(raw.showBtnRestoreStatus),
    showBtnPlanned: Boolean(raw.showBtnPlanned),
    requireStatus: Boolean(raw.requireStatus),
    requireStartDate: Boolean(raw.requireStartDate),
    requireEndDate: Boolean(raw.requireEndDate),
    requireReminder: Boolean(raw.requireReminder),
    useContacts: raw.useContacts !== undefined ? Boolean(raw.useContacts) : false,
  };
}

function planningTypeForPersist(t: PlanningActivityTypeDef): PlanningActivityTypeDef {
  const fields = t.fields
    .map((f) =>
      normalizePlanningFieldDef({
        ...f,
        label: (f.label ?? "").trim(),
      }),
    )
    .filter(planningFieldIsActive);
  return normalizePlanningActivityType({
    ...t,
    name: (t.name ?? "").trim(),
    fields,
  });
}

/** Da usare prima di salvare su DB: tipo con nome valido e solo campi attivi. */
export function normalizePlanningActivityTypeRows(rows: PlanningActivityTypeDef[]): PlanningActivityTypeDef[] {
  return rows
    .map((r) => planningTypeForPersist(normalizePlanningActivityType(r)))
    .filter((r) => r.name.length > 0);
}

function normalizePlanningActivityStored(raw: Partial<PlanningActivityStored>): PlanningActivityStored {
  const payload = raw.payload ?? {};
  const fv = consolidatePlanningPayloadFieldMap(payload as PlanningActivityPayload);
  const statusTrim =
    typeof (payload as PlanningActivityPayload).statusId === "string"
      ? (payload as PlanningActivityPayload).statusId!.trim()
      : "";
  const nextPayload: PlanningActivityPayload = {
    fieldValues: fv,
    startDate: payload.startDate,
    endDate: payload.endDate,
    reminderAt: payload.reminderAt,
  };
  if (statusTrim) nextPayload.statusId = statusTrim;
  return {
    id: raw.id?.trim() ? raw.id.trim() : newCatalogId(),
    activityTypeId: (raw.activityTypeId ?? "").trim(),
    payload: nextPayload,
    createdAt: (raw.createdAt ?? "").trim(),
  };
}

export function planningActivityTypeRowTemplate(): PlanningActivityTypeDef {
  return normalizePlanningActivityType({
    name: "",
    fields: [],
    showStatus: true,
    showStartDate: false,
    showEndDate: false,
    showReminder: false,
    showBtnCompleted: false,
    showBtnTodo: false,
    showBtnRestoreStatus: false,
    showBtnPlanned: false,
  });
}

/** @deprecated Usare planningFieldIsActive */
export function planningFieldActive(kind: PlanningCustomFieldKind, label: string): boolean {
  return kind !== "none" && label.trim().length > 0;
}

/** normalizza gli array pianificazione da `get_settings`. */
export function normalizeAppSettings(raw: AppSettings): AppSettings {
  const connectionNamePresets: ConnectionNamePreset[] = (raw.connectionNamePresets ?? []).map(
    (p): ConnectionNamePreset => ({
      id: p.id?.trim() ? p.id.trim() : newCatalogId(),
      name: p.name?.trim() ?? "",
      kind: p.kind === "web" ? "web" : "rdp",
      environmentIds: [],
    }),
  );
  const environments = (raw.environments ?? []).map((e) => ({
    id: e.id?.trim() ? e.id.trim() : newCatalogId(),
    name: e.name?.trim() ?? "",
  }));
  const versionOptions = (raw.versionOptions ?? []).map((v) => ({
    id: v.id?.trim() ? v.id.trim() : newCatalogId(),
    value: v.value?.trim() ?? "",
    presetIds: v.presetIds ?? [],
  }));
  const releaseOptions = (raw.releaseOptions ?? []).map((r) => ({
    id: r.id?.trim() ? r.id.trim() : newCatalogId(),
    name: r.name?.trim() ?? "",
    presetIds: r.presetIds ?? [],
  }));
  const contractTypes = (raw.contractTypes ?? []).map(
    (c): ContractTypeDef => ({
      id: c.id?.trim() ? c.id.trim() : newCatalogId(),
      name: c.name?.trim() ?? "",
    }),
  );
  const crmModules = (raw.crmModules ?? []).map(
    (c): CrmModuleDef => ({
      id: c.id?.trim() ? c.id.trim() : newCatalogId(),
      name: c.name?.trim() ?? "",
    }),
  );
  const collaboratorCompetencies = (raw.collaboratorCompetencies ?? []).map(
    (c): CollaboratorCompetencyDef => ({
      id: c.id?.trim() ? c.id.trim() : newCatalogId(),
      name: c.name?.trim() ?? "",
    }),
  );
  const dashboardLayout = normalizeDashboardLayout(raw.dashboardLayout);
  const planningStates = (raw.planningStates ?? []).map((r) =>
    normalizePlanningState(r as Partial<PlanningStateDef>),
  );
  const planningActivityTypes = (raw.planningActivityTypes ?? []).map((r) =>
    normalizePlanningActivityType(r as Partial<PlanningActivityTypeDef>),
  );
  const planningActivities = (raw.planningActivities ?? []).map((a) =>
    normalizePlanningActivityStored(a as Partial<PlanningActivityStored>),
  );
  return {
    ...raw,
    favoriteRdpIds: raw.favoriteRdpIds ?? [],
    connectionNamePresets,
    environments,
    versionOptions,
    releaseOptions,
    contractTypes,
    crmModules,
    collaboratorCompetencies,
    dashboardLayout,
    planningStates,
    planningActivityTypes,
    planningActivities,
    planningReminderPreAlertMinutesBefore: sanitizePlanningReminderPreAlertMinutes(raw.planningReminderPreAlertMinutesBefore),
    clientCardModules: normalizeClientCardModules(raw.clientCardModules),
    agendaSettings: sanitizeAgendaSettings(raw.agendaSettings ?? undefined),
  };
}

export function digestPlanningStates(rows: PlanningStateDef[]): string {
  return JSON.stringify(rows.map((r) => normalizePlanningState(r)));
}

export function collaboratorCompetencyRowTemplate(): CollaboratorCompetencyDef {
  return { id: newCatalogId(), name: "" };
}

export function crmModuleRowTemplate(): CrmModuleDef {
  return { id: newCatalogId(), name: "" };
}

export function contractTypeRowTemplate(): ContractTypeDef {
  return { id: newCatalogId(), name: "" };
}

export function findPresetByNameKind(
  presets: ConnectionNamePreset[],
  name: string,
  kind: ConnectionPresetKind,
): ConnectionNamePreset | undefined {
  const n = name.trim().toLocaleLowerCase("it");
  return presets.find((p) => p.kind === kind && p.name.trim().toLocaleLowerCase("it") === n);
}

/** Tutti gli ambienti del catalogo sono sempre disponibili per ogni preset. */
export function environmentsForPreset(
  preset: ConnectionNamePreset | undefined,
  all: EnvironmentDef[],
): EnvironmentDef[] {
  if (!preset?.name?.trim()) return [];
  return all;
}

/** Versione prodotto ammessa per il preset (`presetIds` sulle righe del catalogo in Impostazioni). */
export function versionOptionsForPresetId(
  presetId: string | undefined,
  versionOptions: VersionOptionDef[],
): VersionOptionDef[] {
  const pid = presetId?.trim();
  if (!pid) return [];
  const list = versionOptions.filter((vo) => vo.presetIds.includes(pid));
  return [...list].sort((a, b) =>
    (a.value || "").localeCompare(b.value || "", "it", { sensitivity: "base" }),
  );
}

/** Release ammesse per il preset (stesso modello della versione prodotto). */
export function releaseOptionsForPresetId(
  presetId: string | undefined,
  releaseOptions: ReleaseOptionDef[],
): ReleaseOptionDef[] {
  const pid = presetId?.trim();
  if (!pid) return [];
  const list = releaseOptions.filter((ro) => ro.presetIds.includes(pid));
  return [...list].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "it", { sensitivity: "base" }),
  );
}

export function formatConnectionMatrixLine(
  conn: {
    environmentId?: string | null | undefined;
    environmentDeployments?: { environmentId?: string | null; releaseOptionId?: string | null }[] | null | undefined;
    versionOptionId?: string | null | undefined;
    releaseOptionId?: string | null | undefined;
    version?: string | null | undefined;
  },
  catalog: Pick<AppSettings, "environments" | "versionOptions" | "releaseOptions">,
): string {
  const vo = conn.versionOptionId
    ? catalog.versionOptions.find((v) => v.id === conn.versionOptionId)
    : undefined;
  const ver = vo?.value?.trim() || conn.version?.trim() || "";

  const rawDeps = (conn.environmentDeployments ?? []).filter((d) =>
    (d.environmentId ?? "").trim(),
  );
  const deps =
    rawDeps.length > 0
      ? rawDeps
      : (conn.environmentId ?? "").trim()
        ? [
            {
              environmentId: conn.environmentId!.trim(),
              releaseOptionId: conn.releaseOptionId ?? null,
            },
          ]
        : [];

  if (deps.length > 1) {
    const envRelParts = deps.map((d) => {
      const envName =
        catalog.environments.find((e) => e.id === (d.environmentId ?? "").trim())?.name?.trim() ||
        "";
      const relId = (d.releaseOptionId ?? "").trim();
      const relName = relId
        ? catalog.releaseOptions?.find((r) => r.id === relId)?.name?.trim() || ""
        : "";
      if (envName && relName) return `${envName} (${relName})`;
      if (envName) return envName;
      if (relName) return relName;
      return "";
    });
    const parts = [...envRelParts.filter(Boolean), ver].filter(Boolean);
    return parts.join(" · ");
  }

  if (deps.length === 1) {
    const d0 = deps[0]!;
    const envName =
      catalog.environments.find((e) => e.id === (d0.environmentId ?? "").trim())?.name?.trim() ||
      undefined;
    const relId = (d0.releaseOptionId ?? "").trim();
    const rel = relId ? catalog.releaseOptions?.find((r) => r.id === relId) : undefined;
    const relName = rel?.name?.trim() || "";
    const parts: string[] = [];
    if (envName) parts.push(envName);
    if (ver) parts.push(ver);
    if (relName) parts.push(relName);
    return parts.join(" — ");
  }

  const envName = conn.environmentId
    ? catalog.environments.find((e) => e.id === conn.environmentId)?.name?.trim()
    : undefined;
  const rel = conn.releaseOptionId
    ? catalog.releaseOptions?.find((r) => r.id === conn.releaseOptionId)
    : undefined;
  const relName = rel?.name?.trim() || "";
  const parts: string[] = [];
  if (envName) parts.push(envName);
  if (ver) parts.push(ver);
  if (relName) parts.push(relName);
  return parts.join(" — ");
}

/** @deprecated Usare formatConnectionMatrixLine */
export const formatConnectionEnvVersionLine = formatConnectionMatrixLine;

export function presetRowTemplate(kind: ConnectionPresetKind): ConnectionNamePreset {
  return { id: newCatalogId(), name: "", kind, environmentIds: [] };
}

export function environmentRowTemplate(): EnvironmentDef {
  return { id: newCatalogId(), name: "" };
}

export function versionOptionRowTemplate(): VersionOptionDef {
  return { id: newCatalogId(), value: "", presetIds: [] };
}

export function releaseOptionRowTemplate(): ReleaseOptionDef {
  return { id: newCatalogId(), name: "", presetIds: [] };
}
