use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Client {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    /// Cliente nascosto dall'interfaccia (liste clienti e connessioni collegate).
    #[serde(default)]
    pub obsolete: bool,
    /// Nascosto dalla pagina «Clienti» (sidebar/lista); resta nella Dashboard e nei form delle connessioni.
    #[serde(default)]
    pub hidden_from_clients_nav: bool,
    /// VPN predefinita per tutte le RDP e il contesto accessi web del cliente.
    #[serde(default)]
    pub default_vpn_id: Option<String>,
    /// Sito istituzionale (HTTPS consigliato), per scheda cliente e anteprima.
    #[serde(default)]
    pub website_url: Option<String>,
    /// Località / sede (testo libero).
    #[serde(default)]
    pub location: Option<String>,
    /// ID voce catalogo «Contratti» (Impostazioni).
    #[serde(default)]
    pub contract_type_id: Option<String>,
    /// Numero aggiornamenti (es. per dashboard commerciale).
    #[serde(default)]
    pub update_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Ambiente sulla stessa RDP/host: una release catalogo opzionale per ambiente; la versione prodotto resta sulla riga.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RdpEnvironmentDeployment {
    pub environment_id: String,
    pub release_option_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RdpConnection {
    pub id: String,
    pub client_id: String,
    pub name: String,
    pub host: String,
    pub port: i64,
    pub username: Option<String>,
    pub password_encrypted: Option<String>,
    pub domain: Option<String>,
    pub resolution_width: i64,
    pub resolution_height: i64,
    pub color_depth: i64,
    pub use_fullscreen: i64,
    pub use_clipboard: i64,
    pub ignore_certificate: i64,
    pub gateway_host: Option<String>,
    pub vpn_id: Option<String>,
    pub notes: Option<String>,
    /// Percorso assoluto di un file `.rdp` fornito dal cliente (avvio con `mstsc` / FreeRDP).
    #[serde(default)]
    pub rdp_file_path: Option<String>,
    /// Versione testuale legacy (prima del catalogo); se usi catalogo preferire `version_option_id`.
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub environment_id: Option<String>,
    #[serde(default)]
    pub version_option_id: Option<String>,
    #[serde(default)]
    pub release_option_id: Option<String>,
    /// Tutti gli ambienti sullo stesso host/IP con release eventualmente diverse (versione comune sulla riga).
    #[serde(default)]
    pub environment_deployments: Vec<RdpEnvironmentDeployment>,
    #[serde(default)]
    pub billing: bool,
    #[serde(default)]
    pub finance: bool,
    #[serde(default)]
    pub gw_credit: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VpnConnection {
    pub id: String,
    pub client_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub server: Option<String>,
    pub username: Option<String>,
    pub password_encrypted: Option<String>,
    pub config_path: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebAccess {
    pub id: String,
    pub client_id: String,
    pub name: String,
    pub url: String,
    pub username: Option<String>,
    #[serde(default)]
    pub domain: Option<String>,
    pub password_encrypted: Option<String>,
    pub notes: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub environment_id: Option<String>,
    #[serde(default)]
    pub version_option_id: Option<String>,
    #[serde(default)]
    pub release_option_id: Option<String>,
    /// Moduli CRM collegati (catalogo Impostazioni → Moduli).
    #[serde(default)]
    pub crm_module_ids: Vec<String>,
    /// Compat backup: singolo `crmModuleId` legacy; non serializzato in uscita.
    #[serde(default, skip_serializing, rename = "crmModuleId")]
    pub(crate) crm_module_id: Option<String>,
    #[serde(default)]
    pub sportello: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionPresetKind {
    #[default]
    Rdp,
    Web,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentRow {
    pub id: String,
    pub name: String,
    /// Deprecato: le versioni/release si legano ai preset, non all'ambiente (ignorato in persistenza).
    #[serde(default)]
    pub version_option_ids: Vec<String>,
    /// Deprecato: come `version_option_ids`.
    #[serde(default)]
    pub release_option_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionOptionRow {
    pub id: String,
    pub value: String,
    #[serde(default)]
    pub preset_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseOptionRow {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub preset_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractTypeRow {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrmModuleRow {
    pub id: String,
    pub name: String,
}

/// Voce catalogo «Competenze» (collaboratori), distinta dai servizi RDP/Web.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CollaboratorCompetencyRow {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DashboardLayoutSettings {
    #[serde(default)]
    pub commercial_column_visibility: std::collections::HashMap<String, bool>,
    #[serde(default)]
    pub matrix_hidden_preset_ids: Vec<String>,
    /// `None` = tutti i clienti; `Some([])` = nessuno; `Some(vec)` = solo questi id.
    #[serde(default)]
    pub overview_included_client_ids: Option<Vec<String>>,
}

/// Cataloghi collegati a campi tipo combobox / selezione lista.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum PlanningCatalogRef {
    Clients,
    /// Servizi RDP/Web (preset connessione).
    ConnectionPresets,
    Environments,
    VersionOptions,
    ReleaseOptions,
    Collaborators,
    /// Rubrica contatti (tutti i clienti).
    Contacts,
    ContractTypes,
    CrmModules,
    CollaboratorRoles,
    Competencies,
}

/// Tipo campo nelle definizioni pianificazione.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
pub enum PlanningCustomFieldKind {
    #[default]
    #[serde(rename = "none")]
    None,
    #[serde(rename = "string")]
    String,
    /// Testo su più righe (note / descrizioni), stesso payload JSON di `String`.
    #[serde(rename = "longText")]
    LongText,
    #[serde(rename = "integer")]
    Integer,
    #[serde(rename = "date")]
    Date,
    #[serde(rename = "time")]
    Time,
    #[serde(rename = "datetime")]
    DateTime,
    #[serde(rename = "boolean")]
    Boolean,
    /// Scelta singola da un catalogo (vedi [`PlanningCatalogRef`]).
    #[serde(rename = "comboBox")]
    ComboBox,
    /// Scelta multipla da un catalogo (`Vec<String>` id in JSON).
    #[serde(rename = "selectList")]
    SelectList,
}

/// Definizione di un campo custom sul tipo di attività.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanningFieldDef {
    #[serde(default)]
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub kind: PlanningCustomFieldKind,
    /// Obbligatorio per `ComboBox` e `SelectList`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub catalog_ref: Option<PlanningCatalogRef>,
    /// Testo del campo mostrato nella riga alert promemoria sidebar.
    #[serde(default)]
    pub visible_in_reminder_sidebar: bool,
}

/// Ruoli opzionali degli stati per i pulsanti rapidi sulla lista Pianificazione.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PlanningStateButtonRole {
    Completed,
    Todo,
    Restore,
    Planned,
}

/// Catalogo stati configurabile (Impostazioni → Setup pianificazione).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanningStateRow {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default)]
    pub associate_button: bool,
    #[serde(default)]
    pub button_role: Option<PlanningStateButtonRole>,
}

/// Modello tipo attività (nome in selezione + campi e flag sul form creazione).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanningActivityTypeRow {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub fields: Vec<PlanningFieldDef>,
    /// Colonna stato sulla lista pianificazione.
    #[serde(default)]
    pub show_status: bool,
    #[serde(default)]
    pub show_start_date: bool,
    #[serde(default)]
    pub show_end_date: bool,
    #[serde(default)]
    pub show_reminder: bool,
    #[serde(default)]
    pub show_btn_completed: bool,
    #[serde(default)]
    pub show_btn_todo: bool,
    #[serde(default)]
    pub show_btn_restore_status: bool,
    #[serde(default)]
    pub show_btn_planned: bool,
    /// Toolbar chiamata/email in lista pianificazione (con campi cliente + rubrica/collaboratori).
    #[serde(default)]
    pub use_contacts: bool,
}

impl Default for PlanningActivityTypeRow {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            fields: Vec::new(),
            show_status: false,
            show_start_date: false,
            show_end_date: false,
            show_reminder: false,
            show_btn_completed: false,
            show_btn_todo: false,
            show_btn_restore_status: false,
            show_btn_planned: false,
            use_contacts: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PlanningActivityPayload {
    /// Chiave = [`PlanningFieldDef::id`] o id legacy migrato.
    #[serde(default)]
    pub field_values: std::collections::BTreeMap<String, serde_json::Value>,
    /// Compat: attività salvate prima di `fieldValues`.
    #[serde(default)]
    pub field1: Option<serde_json::Value>,
    #[serde(default)]
    pub field2: Option<serde_json::Value>,
    #[serde(default)]
    pub field3: Option<serde_json::Value>,
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub end_date: Option<String>,
    #[serde(default)]
    pub reminder_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanningActivityRow {
    pub id: String,
    pub activity_type_id: String,
    #[serde(default)]
    pub payload: PlanningActivityPayload,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionNamePreset {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub kind: ConnectionPresetKind,
    /// Deprecato: tutti gli ambienti sono sempre disponibili per ogni preset (non più usato in UI).
    #[serde(default)]
    pub environment_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientCardLayoutCell {
    pub id: String,
    pub panel_id: String,
    #[serde(default = "default_span_one_i32")]
    pub span: i32,
    #[serde(default)]
    pub height_px: Option<i32>,
}

fn default_span_one_i32() -> i32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientCardLayoutRow {
    pub id: String,
    pub height_mode: String,
    #[serde(default)]
    pub height_px: Option<i32>,
    #[serde(default)]
    pub cells: Vec<ClientCardLayoutCell>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientCardModulesSettings {
    #[serde(default = "default_bool_true")]
    pub show_map: bool,
    #[serde(default = "default_bool_true")]
    pub show_vpn: bool,
    #[serde(default = "default_bool_true")]
    pub show_rdp: bool,
    #[serde(default = "default_bool_true")]
    pub show_web: bool,
    #[serde(default = "default_bool_true")]
    pub show_planning: bool,
    #[serde(default = "default_client_card_panel_order")]
    pub panel_order: Vec<String>,
    #[serde(default)]
    pub layout_rows: Vec<ClientCardLayoutRow>,
}

fn default_client_card_panel_order() -> Vec<String> {
    vec![
        "map".into(),
        "vpn".into(),
        "rdp".into(),
        "web".into(),
        "planning".into(),
    ]
}

fn default_bool_true() -> bool {
    true
}

impl Default for ClientCardModulesSettings {
    fn default() -> Self {
        Self {
            show_map: true,
            show_vpn: true,
            show_rdp: true,
            show_web: true,
            show_planning: true,
            panel_order: default_client_card_panel_order(),
            layout_rows: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgendaWorkTimeSegmentDto {
    pub start: String,
    pub end: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgendaHolidayEntryDto {
    pub id: String,
    pub label: String,
    /// `fixed` | `easterMonday`. Omesso in JSON legacy → migrazione lato frontend.
    #[serde(default)]
    pub kind: Option<String>,
    /// Solo `fixed`: `MM-DD`.
    #[serde(default)]
    pub month_day: Option<String>,
    /// Solo migrazione da vecchio formato (`YYYY-MM-DD`).
    #[serde(default)]
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgendaSettingsDto {
    #[serde(default)]
    pub work_weekday_indices: Vec<i64>,
    #[serde(default)]
    pub work_segments: Vec<AgendaWorkTimeSegmentDto>,
    #[serde(default = "AgendaSettingsDto::highlight_holidays_true")]
    pub highlight_holidays_in_agenda: bool,
    #[serde(default = "AgendaSettingsDto::highlight_off_true")]
    pub highlight_non_working_days_in_agenda: bool,
    #[serde(default)]
    pub holidays: Vec<AgendaHolidayEntryDto>,
    #[serde(default)]
    pub block_reminder_on_holidays: bool,
    #[serde(default)]
    pub block_reminder_on_non_working_days: bool,
}

impl AgendaSettingsDto {
    #[inline]
    fn highlight_holidays_true() -> bool {
        true
    }

    #[inline]
    fn highlight_off_true() -> bool {
        true
    }
}

#[inline]
fn default_planning_reminder_pre_alert_minutes() -> Vec<i64> {
    vec![
        7 * 24 * 60,
        2 * 24 * 60,
        24 * 60,
        60,
        30,
        5,
        1,
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsDto {
    pub theme: String,
    pub favorite_rdp_ids: Vec<String>,
    #[serde(default)]
    pub connection_name_presets: Vec<ConnectionNamePreset>,
    #[serde(default)]
    pub environments: Vec<EnvironmentRow>,
    #[serde(default)]
    pub version_options: Vec<VersionOptionRow>,
    #[serde(default)]
    pub release_options: Vec<ReleaseOptionRow>,
    #[serde(default)]
    pub contract_types: Vec<ContractTypeRow>,
    #[serde(default)]
    pub crm_modules: Vec<CrmModuleRow>,
    #[serde(default)]
    pub collaborator_competencies: Vec<CollaboratorCompetencyRow>,
    #[serde(default)]
    pub dashboard_layout: DashboardLayoutSettings,
    #[serde(default)]
    pub planning_states: Vec<PlanningStateRow>,
    #[serde(default)]
    pub planning_activity_types: Vec<PlanningActivityTypeRow>,
    #[serde(default)]
    pub planning_activities: Vec<PlanningActivityRow>,
    #[serde(default)]
    pub client_card_modules: ClientCardModulesSettings,
    /// Assente sul DB storico → il frontend usa i propri default agenda.
    #[serde(default)]
    pub agenda_settings: Option<AgendaSettingsDto>,
    /// Minuti prima di `reminder_at` per avviso in sidebar (soglie multiple). Vuoto/non valido → default.
    #[serde(default = "default_planning_reminder_pre_alert_minutes")]
    pub planning_reminder_pre_alert_minutes_before: Vec<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateClientInput {
    pub name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub website_url: Option<String>,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub contract_type_id: Option<String>,
    #[serde(default)]
    pub update_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateClientInput {
    pub name: Option<String>,
    pub description: Option<String>,
    /// Assente = non modificare; `true`/`false` = imposta stato obsoleto.
    #[serde(default)]
    pub obsolete: Option<bool>,
    /// Nascondere dalla lista pagina Clienti (non dalla Dashboard).
    #[serde(default)]
    pub hidden_from_clients_nav: Option<bool>,
    /// Assente = non modificare; `null` = rimuovi predefinito; stringa = imposta.
    #[serde(default)]
    pub default_vpn_id: Option<Option<String>>,
    #[serde(default)]
    pub website_url: Option<String>,
    #[serde(default)]
    pub location: Option<String>,
    /// Omesso = non modificare; `null` = senza tipo contratto.
    #[serde(default)]
    pub contract_type_id: Option<Option<String>>,
    #[serde(default)]
    pub update_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRdpInput {
    pub client_id: String,
    pub name: String,
    pub host: String,
    pub port: Option<i64>,
    pub username: Option<String>,
    pub password_plain: Option<String>,
    pub domain: Option<String>,
    pub resolution_width: Option<i64>,
    pub resolution_height: Option<i64>,
    pub color_depth: Option<i64>,
    pub use_fullscreen: Option<bool>,
    pub use_clipboard: Option<bool>,
    pub ignore_certificate: Option<bool>,
    pub gateway_host: Option<String>,
    pub vpn_id: Option<String>,
    pub notes: Option<String>,
    #[serde(default)]
    pub rdp_file_path: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub environment_id: Option<String>,
    #[serde(default)]
    pub version_option_id: Option<String>,
    #[serde(default)]
    pub release_option_id: Option<String>,
    #[serde(default)]
    pub environment_deployments: Option<Vec<RdpEnvironmentDeployment>>,
    #[serde(default)]
    pub billing: Option<bool>,
    #[serde(default)]
    pub finance: Option<bool>,
    #[serde(default)]
    pub gw_credit: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRdpInput {
    pub client_id: Option<String>,
    pub name: Option<String>,
    pub host: Option<String>,
    pub port: Option<i64>,
    pub username: Option<String>,
    pub password_plain: Option<String>,
    pub clear_password: Option<bool>,
    pub domain: Option<String>,
    pub resolution_width: Option<i64>,
    pub resolution_height: Option<i64>,
    pub color_depth: Option<i64>,
    pub use_fullscreen: Option<bool>,
    pub use_clipboard: Option<bool>,
    pub ignore_certificate: Option<bool>,
    pub gateway_host: Option<String>,
    pub vpn_id: Option<String>,
    pub notes: Option<String>,
    #[serde(default)]
    pub rdp_file_path: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub environment_id: Option<String>,
    #[serde(default)]
    pub version_option_id: Option<String>,
    #[serde(default)]
    pub release_option_id: Option<String>,
    #[serde(default)]
    pub environment_deployments: Option<Vec<RdpEnvironmentDeployment>>,
    #[serde(default)]
    pub billing: Option<bool>,
    #[serde(default)]
    pub finance: Option<bool>,
    #[serde(default)]
    pub gw_credit: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVpnInput {
    pub client_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub server: Option<String>,
    pub username: Option<String>,
    pub password_plain: Option<String>,
    pub config_path: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateVpnInput {
    pub client_id: Option<String>,
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub type_: Option<String>,
    pub server: Option<String>,
    pub username: Option<String>,
    pub password_plain: Option<String>,
    pub clear_password: Option<bool>,
    pub config_path: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWebAccessInput {
    pub client_id: String,
    pub name: String,
    pub url: String,
    pub username: Option<String>,
    #[serde(default)]
    pub domain: Option<String>,
    pub password_plain: Option<String>,
    pub notes: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub environment_id: Option<String>,
    #[serde(default)]
    pub version_option_id: Option<String>,
    #[serde(default)]
    pub release_option_id: Option<String>,
    #[serde(default)]
    pub crm_module_ids: Option<Vec<String>>,
    /// Compat: se `crm_module_ids` assente o vuoto, si usa il singolo id.
    #[serde(default)]
    pub crm_module_id: Option<String>,
    #[serde(default)]
    pub sportello: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWebAccessInput {
    pub client_id: Option<String>,
    pub name: Option<String>,
    pub url: Option<String>,
    pub username: Option<String>,
    #[serde(default)]
    pub domain: Option<String>,
    pub password_plain: Option<String>,
    pub clear_password: Option<bool>,
    pub notes: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub environment_id: Option<String>,
    #[serde(default)]
    pub version_option_id: Option<String>,
    #[serde(default)]
    pub release_option_id: Option<String>,
    #[serde(default)]
    pub crm_module_ids: Option<Vec<String>>,
    #[serde(default)]
    pub crm_module_id: Option<String>,
    #[serde(default)]
    pub sportello: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettingsInput {
    pub theme: Option<String>,
    pub favorite_rdp_ids: Option<Vec<String>>,
    #[serde(default)]
    pub connection_name_presets: Option<Vec<ConnectionNamePreset>>,
    #[serde(default)]
    pub environments: Option<Vec<EnvironmentRow>>,
    #[serde(default)]
    pub version_options: Option<Vec<VersionOptionRow>>,
    #[serde(default)]
    pub release_options: Option<Vec<ReleaseOptionRow>>,
    #[serde(default)]
    pub contract_types: Option<Vec<ContractTypeRow>>,
    #[serde(default)]
    pub crm_modules: Option<Vec<CrmModuleRow>>,
    #[serde(default)]
    pub collaborator_competencies: Option<Vec<CollaboratorCompetencyRow>>,
    #[serde(default)]
    pub dashboard_layout: Option<DashboardLayoutSettings>,
    #[serde(default)]
    pub planning_states: Option<Vec<PlanningStateRow>>,
    #[serde(default)]
    pub planning_activity_types: Option<Vec<PlanningActivityTypeRow>>,
    #[serde(default)]
    pub planning_activities: Option<Vec<PlanningActivityRow>>,
    #[serde(default)]
    pub client_card_modules: Option<ClientCardModulesSettings>,
    #[serde(default)]
    pub agenda_settings: Option<AgendaSettingsDto>,
    #[serde(default)]
    pub planning_reminder_pre_alert_minutes_before: Option<Vec<i64>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub total_clients: i64,
    pub total_rdp: i64,
    pub total_vpn: i64,
    pub total_web: i64,
    pub recent_audit: Vec<AuditLogEntry>,
    pub favorite_rdp_ids: Vec<String>,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogEntry {
    pub id: String,
    pub action: String,
    pub entity_type: String,
    pub entity_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub configured: bool,
    pub unlocked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientContact {
    pub id: String,
    pub client_id: String,
    pub first_name: String,
    pub last_name: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub mobile: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateClientContactInput {
    pub client_id: String,
    pub first_name: String,
    pub last_name: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub mobile: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateClientContactInput {
    #[serde(default)]
    pub client_id: Option<String>,
    #[serde(default)]
    pub first_name: Option<String>,
    #[serde(default)]
    pub last_name: Option<String>,
    /// Presenza del campo = aggiorna; stringa vuota = rimuovi valore sul DB.
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub mobile: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaboratorRole {
    pub id: String,
    pub label: String,
    pub sort_rank: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCollaboratorRoleInput {
    pub label: String,
    #[serde(default)]
    pub sort_rank: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCollaboratorRoleInput {
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub sort_rank: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collaborator {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    #[serde(default)]
    pub linkedin_url: Option<String>,
    #[serde(default)]
    pub photo_url: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    pub role_id: String,
    #[serde(default)]
    pub role_label: Option<String>,
    /// Ordine di importanza incarico (`collaborator_roles.sort_rank`; utile dopo raggruppamento UI).
    #[serde(default)]
    pub role_sort_rank: Option<i64>,
    #[serde(default)]
    pub client_ids: Vec<String>,
    #[serde(default)]
    pub competency_preset_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaboratorExport {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    #[serde(default)]
    pub linkedin_url: Option<String>,
    #[serde(default)]
    pub photo_url: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    pub role_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub client_ids: Vec<String>,
    pub competency_preset_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCollaboratorInput {
    pub first_name: String,
    pub last_name: String,
    #[serde(default)]
    pub linkedin_url: Option<String>,
    #[serde(default)]
    pub photo_url: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    pub role_id: String,
    pub client_ids: Vec<String>,
    pub competency_preset_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCollaboratorInput {
    #[serde(default)]
    pub first_name: Option<String>,
    #[serde(default)]
    pub last_name: Option<String>,
    #[serde(default)]
    pub linkedin_url: Option<String>,
    #[serde(default)]
    pub photo_url: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub role_id: Option<String>,
    #[serde(default)]
    pub client_ids: Option<Vec<String>>,
    #[serde(default)]
    pub competency_preset_ids: Option<Vec<String>>,
}
