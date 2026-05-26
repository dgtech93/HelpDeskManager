export interface Client {
  id: string;
  name: string;
  description: string | null;
  /** Se true, il cliente non compare nelle liste operative (connessioni RDP/VPN/Web incluse). */
  obsolete?: boolean;
  /** Se true, non compare nell'elenco laterale della pagina Clienti; resta nella Dashboard e nei menu dei form connessioni. */
  hiddenFromClientsNav?: boolean;
  /** VPN predefinita per RDP e contesto accessi web (stesso cliente). */
  defaultVpnId: string | null;
  /** URL pubblico del sito (per logo/anteprima nella scheda). */
  websiteUrl: string | null;
  /** Località o sede (testo libero). */
  location: string | null;
  /** Catalogo «Contratti» (Impostazioni). */
  contractTypeId?: string | null;
  /** Numero aggiornamenti (dashboard commerciale). */
  updateCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClientContact {
  id: string;
  clientId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  role: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateClientContactInput = {
  clientId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  role?: string | null;
};

/** Campi opzionali: omessi = non modificare sul server. */
export type UpdateClientContactInput = {
  clientId?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  role?: string | null;
};

export interface CollaboratorRole {
  id: string;
  label: string;
  sortRank: number;
  createdAt: string;
  updatedAt: string;
}

export type CreateCollaboratorRoleInput = {
  label: string;
  sortRank?: number | null;
};

export type UpdateCollaboratorRoleInput = {
  label?: string | null;
  sortRank?: number | null;
};

export interface Collaborator {
  id: string;
  firstName: string;
  lastName: string;
  linkedinUrl?: string | null;
  photoUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  roleId: string;
  roleLabel?: string | null;
  roleSortRank?: number | null;
  clientIds: string[];
  competencyPresetIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type CreateCollaboratorInput = {
  firstName: string;
  lastName: string;
  linkedinUrl?: string | null;
  photoUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  roleId: string;
  clientIds: string[];
  competencyPresetIds: string[];
};

export type UpdateCollaboratorInput = {
  firstName?: string | null;
  lastName?: string | null;
  linkedinUrl?: string | null;
  photoUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  roleId?: string | null;
  clientIds?: string[] | null;
  competencyPresetIds?: string[] | null;
};

export type RdpEnvironmentDeployment = {
  environmentId: string;
  releaseOptionId: string | null;
};

export interface RdpConnection {
  id: string;
  clientId: string;
  name: string;
  host: string;
  port: number;
  username: string | null;
  passwordEncrypted: string | null;
  domain: string | null;
  resolutionWidth: number;
  resolutionHeight: number;
  colorDepth: number;
  useFullscreen: number;
  useClipboard: number;
  ignoreCertificate: number;
  gatewayHost: string | null;
  vpnId: string | null;
  notes: string | null;
  /** Percorso file .rdp fornito dal cliente */
  rdpFilePath: string | null;
  /** Versione testuale legacy se non usi catalogo ambiente/versione. */
  version: string | null;
  environmentId: string | null;
  versionOptionId: string | null;
  releaseOptionId: string | null;
  /** Stesso host/IP: più ambienti con release eventualmente distinte; versione prodotto sulla riga. */
  environmentDeployments: RdpEnvironmentDeployment[];
  /** Dashboard commerciale: flag da «Dati aggiuntivi» RDP. */
  billing?: boolean;
  finance?: boolean;
  gwCredit?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VpnConnection {
  id: string;
  clientId: string;
  name: string;
  type: string;
  server: string | null;
  username: string | null;
  passwordEncrypted: string | null;
  /** OpenVPN/WireGuard/Forti: percorso file. «Windows VPN»: nome connessione del profilo Windows (rasdial). */
  configPath: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebAccess {
  id: string;
  clientId: string;
  name: string;
  url: string;
  username: string | null;
  /** Dominio Windows (es. per login CRM), distinto dall'utente. */
  domain: string | null;
  passwordEncrypted: string | null;
  notes: string | null;
  version: string | null;
  environmentId: string | null;
  versionOptionId: string | null;
  releaseOptionId: string | null;
  /** Catalogo Moduli (Impostazioni); più voci per accesso. */
  crmModuleIds?: string[];
  /** Compat: vecchio singolo modulo (backup / sessioni cache). */
  crmModuleId?: string | null;
  /** CRM Sportello (dashboard). */
  sportello?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ConnectionPresetKind = "rdp" | "web";

/** Ambiente (DEV / PROD / …): etichetta globale nel catalogo, uguale per tutti i servizi (ex preset connessione). */
export interface EnvironmentDef {
  id: string;
  name: string;
}

/** Versione prodotto nel catalogo: valore e servizi associabili. */
export interface VersionOptionDef {
  id: string;
  value: string;
  /** ID servizio (`ConnectionNamePreset.id`) per cui questa versione è selezionabile. */
  presetIds: string[];
}

/** Release nel catalogo: nome e servizi associabili. */
export interface ReleaseOptionDef {
  id: string;
  name: string;
  presetIds: string[];
}

export interface ContractTypeDef {
  id: string;
  name: string;
}

/** Voci catalogo «Moduli» (accessi web). */
export interface CrmModuleDef {
  id: string;
  name: string;
}

/** Voci catalogo «Competenze» (collaboratori) in Impostazioni. */
export interface CollaboratorCompetencyDef {
  id: string;
  name: string;
}

/** Colonne configurabili della tabella «Panoramica clienti» (esclusa la colonna Cliente, sempre visibile). */
export type CommercialOverviewColumnKey =
  | "pm"
  | "commercials"
  | "consultants"
  | "contacts"
  | "contractType"
  | "updateCount"
  | "suite"
  | "crmModules"
  | "crmSportello"
  | "billing"
  | "finance"
  | "gwCredit"
  | "lab";

export type DashboardLayoutSettings = {
  commercialColumnVisibility: Partial<Record<CommercialOverviewColumnKey, boolean>>;
  /** ID servizio (`ConnectionNamePreset.id`) nascosti nella Panoramica servizi (Dashboard). */
  matrixHiddenPresetIds: string[];
  /**
   * Clienti inclusi in Panoramica clienti e Panoramica servizi (Dashboard).
   * `null` o assente = tutti i clienti operativi; `[]` = nessuno; altrimenti solo gli id elencati.
   */
  overviewIncludedClientIds: string[] | null;
};

/** Servizio di connessione (tipologia RDP o accesso web); in UI: «Servizi» in Impostazioni. */
export interface ConnectionNamePreset {
  id: string;
  name: string;
  kind: ConnectionPresetKind;
  /** Deprecato: tutti gli ambienti sono sempre disponibili; mantenuto per compatibilità serde. */
  environmentIds: string[];
}

/** Cataloghi collegabili a combobox / selezione lista. */
export type PlanningCatalogRef =
  | "clients"
  | "connectionPresets"
  | "environments"
  | "versionOptions"
  | "releaseOptions"
  | "collaborators"
  | "contacts"
  | "contractTypes"
  | "crmModules"
  | "collaboratorRoles"
  | "competencies";

/** Tipo campo (setup pianificazione). */
export type PlanningCustomFieldKind =
  | "none"
  | "string"
  /** Testo lungo su più righe (note, descrizioni). */
  | "longText"
  | "integer"
  | "date"
  | "time"
  | "datetime"
  | "boolean"
  | "comboBox"
  | "selectList";

export interface PlanningFieldDef {
  id: string;
  label: string;
  kind: PlanningCustomFieldKind;
  /** Obbligatorio per `comboBox` e `selectList`. */
  catalogRef?: PlanningCatalogRef | null;
  /** Se vero: obbligatorio in modifica attività e inserimento massivo. */
  required?: boolean;
  /** Se vero: valore del campo incluso nella riga promemoria in sidebar (con countdown alla scadenza). */
  visibleInReminderSidebar?: boolean;
}

/** Definizione «tipo di attività»: nome nella select + campi e flag sul form Nuova attività. */
export interface PlanningActivityTypeDef {
  id: string;
  name: string;
  fields: PlanningFieldDef[];
  /** Colonna stato e combobox sulla lista pianificazione (default true solo per tipo appena creato in UI). */
  showStatus: boolean;
  showStartDate: boolean;
  showEndDate: boolean;
  showReminder: boolean;
  /** Azioni solo sulla lista pianificazione: richiedono uno stato catalogato con `associateButton` e ruolo corrispondente. */
  showBtnCompleted: boolean;
  showBtnTodo: boolean;
  showBtnRestoreStatus: boolean;
  showBtnPlanned: boolean;
  /** Obbligatorietà nei form (solo se la colonna corrispondente è mostrata). */
  requireStatus?: boolean;
  requireStartDate?: boolean;
  requireEndDate?: boolean;
  requireReminder?: boolean;
  /** Se vero: in Pianificazione compaiono chiamata/email sul contatto scelto (richiede campo Clienti + Rubrica/Collaboratori in definizione campo). */
  useContacts?: boolean;
}

/** Ruolo opzionale per collegare uno stato ai pulsanti rapidi sulla lista. */
export type PlanningStateButtonRole = "completed" | "todo" | "restore" | "planned";

/** Stati configurabili (Impostazioni → Setup pianificazione → Stati). */
export interface PlanningStateDef {
  id: string;
  name: string;
  /** Un solo stato nel catalogo può essere predefinito (nuova attività con colonna stato). */
  isDefault?: boolean;
  associateButton: boolean;
  /** Selezionabile dai pulsanti rapidi solo se `associateButton` è vero (un solo stato per ruolo). */
  buttonRole: PlanningStateButtonRole | null;
}

/** Valori compilati dall’utente nel form pianificazione (serializzati come JSON lato Rust). */
export type PlanningActivityPayload = {
  /** Chiavi = [`PlanningFieldDef.id`]. */
  fieldValues?: Record<string, unknown>;
  /** Compat: tre campi fissi pre-mappa. */
  field1?: unknown;
  field2?: unknown;
  field3?: unknown;
  startDate?: string | null;
  endDate?: string | null;
  reminderAt?: string | null;
  /** Id di [`PlanningStateDef`] per la lista / combobox stato. */
  statusId?: string | null;
};

export interface PlanningActivityStored {
  id: string;
  activityTypeId: string;
  payload: PlanningActivityPayload;
  createdAt: string;
}

/** Fascia HH:mm inclusiva start, esclusiva end (stesso giorno). */
export type AgendaWorkTimeSegment = {
  start: string;
  end: string;
};

/** Festività ancorata a giorno/mese (ogni anno) oppure Pasquetta (lunedì dopo Pasqua). */
export type AgendaHolidayKind = "fixed" | "easterMonday";

export type AgendaHolidayEntry =
  | {
      id: string;
      label: string;
      kind: "fixed";
      /** Ripetuto ogni anno: mese-giorno `MM-DD`. */
      monthDay: string;
    }
  | {
      id: string;
      label: string;
      kind: "easterMonday";
    };

/** Impostazioni calendario / vincoli promemoria (Impostazioni → Setup pianificazione). */
export interface AgendaSettings {
  /** Giorni lavorativi: 0=dom … 6=sab (come `Date.getDay()`). */
  workWeekdayIndices: number[];
  workSegments: AgendaWorkTimeSegment[];
  highlightHolidaysInAgenda: boolean;
  highlightNonWorkingDaysInAgenda: boolean;
  holidays: AgendaHolidayEntry[];
  blockReminderOnHolidays: boolean;
  blockReminderOnNonWorkingDays: boolean;
}

export interface AppSettings {
  theme: string;
  favoriteRdpIds: string[];
  connectionNamePresets: ConnectionNamePreset[];
  environments: EnvironmentDef[];
  versionOptions: VersionOptionDef[];
  releaseOptions: ReleaseOptionDef[];
  contractTypes: ContractTypeDef[];
  crmModules: CrmModuleDef[];
  collaboratorCompetencies: CollaboratorCompetencyDef[];
  dashboardLayout: DashboardLayoutSettings;
  planningStates: PlanningStateDef[];
  planningActivityTypes: PlanningActivityTypeDef[];
  planningActivities: PlanningActivityStored[];
  /** Preavvisi promemoria in sidebar: minuti prima di `reminderAt` (soglie ripetute). Assente dall’API = default lato frontend. */
  planningReminderPreAlertMinutesBefore?: number[] | null;
  /** Moduli scheda cliente (pagina Clienti): mappa, VPN, RDP, Web, anteprima pianificazione. */
  clientCardModules?: ClientCardModuleSettings | null;
  /** Fascia oraria agenda, festivi e vincoli su promemoria / datetime. Assente nell’API = default lato frontend. */
  agendaSettings?: AgendaSettings | null;
}

/** Blocchi della scheda cliente. */
export type ClientCardPanelId = "map" | "vpn" | "rdp" | "web" | "planning";

/** Altezza riga nel layout della scheda. */
export type ClientCardRowHeightMode = "auto" | "stretch" | "pixels";

export interface ClientCardLayoutCell {
  id: string;
  panelId: ClientCardPanelId;
  /** Larghezza relativa nella riga (somma span → proporzioni, min 1). */
  span: number;
  /** @deprecated L'altezza si gestisce sulla riga intera, non sulla singola sezione. */
  heightPx?: number | null;
}

export interface ClientCardLayoutRow {
  id: string;
  heightMode: ClientCardRowHeightMode;
  /** Con heightMode «pixels»: altezza fissa dell’area riga (px). */
  heightPx?: number | null;
  cells: ClientCardLayoutCell[];
}

export interface ClientCardModuleSettings {
  showMap: boolean;
  showVpn: boolean;
  showRdp: boolean;
  showWeb: boolean;
  showPlanning: boolean;
  /** Griglia della scheda: righe da sinistra a destra, più righe sono impilate verticalmente. */
  layoutRows: ClientCardLayoutRow[];
}

export interface VaultStatus {
  configured: boolean;
  unlocked: boolean;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalClients: number;
  totalRdp: number;
  totalVpn: number;
  totalWeb: number;
  recentAudit: AuditLogEntry[];
  favoriteRdpIds: string[];
}

export type CreateClientInput = {
  name: string;
  description?: string | null;
  websiteUrl?: string | null;
  location?: string | null;
  contractTypeId?: string | null;
  updateCount?: number | null;
};

export type UpdateClientInput = {
  name?: string | null;
  description?: string | null;
  /** Imposta cliente obsoleto (nascosto ovunque tranne qui). Omesso = non modificare. */
  obsolete?: boolean;
  /** Nascosto dalla pagina Clienti; omesso = non modificare. */
  hiddenFromClientsNav?: boolean;
  /** Omesso = non modificare; null = rimuovi VPN predefinita sul cliente. */
  defaultVpnId?: string | null;
  websiteUrl?: string | null;
  location?: string | null;
  /** Omesso = non modificare; null = nessun tipo contratto. */
  contractTypeId?: string | null;
  /** Omesso = non modificare. */
  updateCount?: number | null;
};

export type CreateRdpInput = {
  clientId: string;
  name: string;
  host: string;
  port?: number | null;
  username?: string | null;
  passwordPlain?: string | null;
  domain?: string | null;
  resolutionWidth?: number | null;
  resolutionHeight?: number | null;
  colorDepth?: number | null;
  useFullscreen?: boolean | null;
  useClipboard?: boolean | null;
  ignoreCertificate?: boolean | null;
  gatewayHost?: string | null;
  vpnId?: string | null;
  notes?: string | null;
  /** Percorso assoluto al file `.rdp` scaricato dal cliente. */
  rdpFilePath?: string | null;
  version?: string | null;
  environmentId?: string | null;
  versionOptionId?: string | null;
  releaseOptionId?: string | null;
  environmentDeployments?: RdpEnvironmentDeployment[] | null;
  billing?: boolean | null;
  finance?: boolean | null;
  gwCredit?: boolean | null;
};

export type UpdateRdpInput = {
  clientId?: string | null;
  name?: string | null;
  host?: string | null;
  port?: number | null;
  username?: string | null;
  passwordPlain?: string | null;
  clearPassword?: boolean | null;
  domain?: string | null;
  resolutionWidth?: number | null;
  resolutionHeight?: number | null;
  colorDepth?: number | null;
  useFullscreen?: boolean | null;
  useClipboard?: boolean | null;
  ignoreCertificate?: boolean | null;
  gatewayHost?: string | null;
  vpnId?: string | null;
  notes?: string | null;
  /** Invia stringa vuota per rimuovere il file `.rdp` associato. */
  rdpFilePath?: string | null;
  version?: string | null;
  environmentId?: string | null;
  versionOptionId?: string | null;
  releaseOptionId?: string | null;
  environmentDeployments?: RdpEnvironmentDeployment[] | null;
  billing?: boolean | null;
  finance?: boolean | null;
  gwCredit?: boolean | null;
};

export type CreateVpnInput = {
  clientId: string;
  name: string;
  type: string;
  server?: string | null;
  username?: string | null;
  passwordPlain?: string | null;
  configPath?: string | null;
  notes?: string | null;
};

export type UpdateVpnInput = {
  clientId?: string | null;
  name?: string | null;
  type?: string | null;
  server?: string | null;
  username?: string | null;
  passwordPlain?: string | null;
  clearPassword?: boolean | null;
  configPath?: string | null;
  notes?: string | null;
};

export type UpdateSettingsInput = {
  theme?: string | null;
  favoriteRdpIds?: string[] | null;
  connectionNamePresets?: ConnectionNamePreset[] | null;
  environments?: EnvironmentDef[] | null;
  versionOptions?: VersionOptionDef[] | null;
  releaseOptions?: ReleaseOptionDef[] | null;
  contractTypes?: ContractTypeDef[] | null;
  crmModules?: CrmModuleDef[] | null;
  collaboratorCompetencies?: CollaboratorCompetencyDef[] | null;
  dashboardLayout?: DashboardLayoutSettings | null;
  planningStates?: PlanningStateDef[] | null;
  planningActivityTypes?: PlanningActivityTypeDef[] | null;
  planningActivities?: PlanningActivityStored[] | null;
  /** Minuti prima del promemoria per avviso sidebar (lista ripetibile). */
  planningReminderPreAlertMinutesBefore?: number[] | null;
  clientCardModules?: ClientCardModuleSettings | null;
  agendaSettings?: AgendaSettings | null;
};

export type CreateWebAccessInput = {
  clientId: string;
  name: string;
  url: string;
  username?: string | null;
  domain?: string | null;
  passwordPlain?: string | null;
  notes?: string | null;
  version?: string | null;
  environmentId?: string | null;
  versionOptionId?: string | null;
  releaseOptionId?: string | null;
  crmModuleIds?: string[] | null;
  sportello?: boolean | null;
};

export type UpdateWebAccessInput = {
  clientId?: string | null;
  name?: string | null;
  url?: string | null;
  username?: string | null;
  domain?: string | null;
  passwordPlain?: string | null;
  clearPassword?: boolean | null;
  notes?: string | null;
  version?: string | null;
  environmentId?: string | null;
  versionOptionId?: string | null;
  releaseOptionId?: string | null;
  crmModuleIds?: string[] | null;
  sportello?: boolean | null;
};
