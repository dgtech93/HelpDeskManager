import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  Client,
  ClientContact,
  Collaborator,
  CollaboratorRole,
  CreateClientContactInput,
  CreateCollaboratorInput,
  CreateCollaboratorRoleInput,
  CreateClientInput,
  CreateRdpInput,
  CreateVpnInput,
  CreateWebAccessInput,
  DashboardStats,
  RdpConnection,
  UpdateClientContactInput,
  UpdateCollaboratorInput,
  UpdateCollaboratorRoleInput,
  UpdateClientInput,
  UpdateRdpInput,
  UpdateSettingsInput,
  UpdateVpnInput,
  UpdateWebAccessInput,
  VaultStatus,
  VpnConnection,
  WebAccess,
} from "@/types";
import { normalizeAppSettings } from "@/lib/presetCatalog";

type TauriGlobals = Window & {
  __TAURI_INTERNALS__?: {
    invoke?: (...args: unknown[]) => unknown;
  };
};

/** True solo dentro il webview Tauri (mai nel browser su localhost durante vite dev). */
export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const g = window as TauriGlobals;
  return typeof g.__TAURI_INTERNALS__?.invoke === "function";
}

const MISSING_TAURI_MSG =
  "Usa la finestra desktop «HelpDesk Manager», non il browser su localhost:1420. Avvia: npm run tauri dev (o npm run tauri:dev).";

function assertTauriIpc(): void {
  if (!isTauriRuntime()) {
    throw new Error(MISSING_TAURI_MSG);
  }
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  assertTauriIpc();
  return tauriInvoke(cmd, args ?? {}) as Promise<T>;
}
export async function getClients(): Promise<Client[]> {
  return invoke("get_clients");
}

export async function getClientsAll(): Promise<Client[]> {
  return invoke("get_clients_all");
}

export async function getClient(id: string): Promise<Client> {
  return invoke("get_client", { id });
}

export async function createClient(input: CreateClientInput): Promise<Client> {
  return invoke("create_client", { input });
}

export async function updateClient(id: string, input: UpdateClientInput): Promise<void> {
  return invoke("update_client", { id, input });
}

export async function deleteClient(id: string): Promise<void> {
  return invoke("delete_client", { id });
}

export async function getContactsByClient(clientId: string): Promise<ClientContact[]> {
  return invoke("get_contacts_by_client", { clientId });
}

export async function getAllContacts(): Promise<ClientContact[]> {
  return invoke("get_all_contacts");
}

export async function createContact(input: CreateClientContactInput): Promise<ClientContact> {
  return invoke("create_contact", { input });
}

export async function updateContact(id: string, input: UpdateClientContactInput): Promise<void> {
  return invoke("update_contact", { id, input });
}

export async function deleteContact(id: string): Promise<void> {
  return invoke("delete_contact", { id });
}

export async function dialPhoneNumber(number: string): Promise<void> {
  return invoke("dial_phone_number", { number });
}

export async function openContactMailto(email: string): Promise<void> {
  return invoke("open_contact_mailto", { email });
}

export async function openHttpsUrl(url: string): Promise<void> {
  return invoke("open_https_url", { url });
}

/** Prefisso etichetta webview delle schede collaboratore sganciate (Tauri). */
export const COLLAB_SHEET_WEBVIEW_LABEL_PREFIX = "collab-sheet-";

/** Prefissi finestre «connessioni cliente» sganciate: una per RDP e una per WEB. */
export const CLIENT_CONN_RDP_LABEL_PREFIX = "client-conn-rdp-";
export const CLIENT_CONN_WEB_LABEL_PREFIX = "client-conn-web-";

const DETACHED_SECONDARY_LABEL_PREFIXES: readonly string[] = [
  COLLAB_SHEET_WEBVIEW_LABEL_PREFIX,
  CLIENT_CONN_RDP_LABEL_PREFIX,
  CLIENT_CONN_WEB_LABEL_PREFIX,
];

/** Apre una seconda finestra con RDP o accessi web del cliente (`#/finestra/cliente/…/connessioni/rdp|web?detached=1`). */
export async function openClientConnectionsDetached(
  clientId: string,
  kind: "rdp" | "web",
): Promise<void> {
  assertTauriIpc();
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const id = clientId.trim();
  if (!id) return;

  const prefix =
    kind === "rdp" ? CLIENT_CONN_RDP_LABEL_PREFIX : CLIENT_CONN_WEB_LABEL_PREFIX;
  const label = `${prefix}${id}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }

  const seg = kind === "rdp" ? "rdp" : "web";
  const fragment = `#/finestra/cliente/${encodeURIComponent(id)}/connessioni/${seg}?detached=1`;
  const url = import.meta.env.DEV ? `http://localhost:1420/${fragment}` : `index.html${fragment}`;

  const title = kind === "rdp" ? "Connessioni RDP" : "Accessi web";
  const win = new WebviewWindow(label, {
    url,
    title,
    width: 920,
    height: 680,
    minWidth: 520,
    minHeight: 420,
    maxWidth: 1400,
    maxHeight: 1000,
    resizable: true,
    decorations: true,
    transparent: false,
    shadow: true,
    center: true,
    focus: true,
  });

  win.once("tauri://error", (e: { payload?: string }) => {
    console.error("Finestra connessioni cliente:", e.payload);
  });
}

/** Apre una seconda finestra Tauri trasparente, senza barra titolo, con la scheda collaboratore. */
export async function openCollaboratorDetachedSheet(collaboratorId: string): Promise<void> {
  assertTauriIpc();
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const id = collaboratorId.trim();
  if (!id) return;

  const label = `${COLLAB_SHEET_WEBVIEW_LABEL_PREFIX}${id}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }

  const fragment = `#/collaboratori/scheda/${encodeURIComponent(id)}?detached=1`;
  const url = import.meta.env.DEV ? `http://localhost:1420/${fragment}` : `index.html${fragment}`;

  const win = new WebviewWindow(label, {
    url,
    title: "Scheda collaboratore",
    width: 400,
    height: 640,
    minWidth: 340,
    minHeight: 480,
    maxWidth: 520,
    maxHeight: 900,
    resizable: true,
    decorations: true,
    transparent: false,
    shadow: true,
    center: true,
    focus: true,
  });

  win.once("tauri://error", (e: { payload?: string }) => {
    console.error("Scheda collaboratore (finestra):", e.payload);
  });
}

/**
 * Chiude la finestra corrente solo se è una finestra «secondaria» attesa (scheda collaboratore o pannelli cliente RDP/WEB).
 * Richiede `core:window:allow-close`; non deve mai fare fallback a `navigate` nella stessa finestra.
 */
export async function closeCurrentDetachedSheetWindow(): Promise<void> {
  assertTauriIpc();
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const cur = WebviewWindow.getCurrent();
  if (!DETACHED_SECONDARY_LABEL_PREFIXES.some((prefix) => cur.label.startsWith(prefix))) {
    throw new Error(`Questa non è una finestra secondaria sganciata (${cur.label}).`);
  }
  await cur.close();
}

export async function getCollaboratorRoles(): Promise<CollaboratorRole[]> {
  return invoke("get_collaborator_roles");
}

export async function createCollaboratorRole(
  input: CreateCollaboratorRoleInput,
): Promise<CollaboratorRole> {
  return invoke("create_collaborator_role", { input });
}

export async function updateCollaboratorRole(
  id: string,
  input: UpdateCollaboratorRoleInput,
): Promise<void> {
  return invoke("update_collaborator_role", { id, input });
}

export async function deleteCollaboratorRole(id: string): Promise<void> {
  return invoke("delete_collaborator_role", { id });
}

export async function getCollaborators(): Promise<Collaborator[]> {
  return invoke("get_collaborators");
}

export async function getCollaboratorsForClient(clientId: string): Promise<Collaborator[]> {
  return invoke("get_collaborators_for_client", { clientId });
}

export async function createCollaborator(input: CreateCollaboratorInput): Promise<Collaborator> {
  return invoke("create_collaborator", { input });
}

export async function updateCollaborator(
  id: string,
  input: UpdateCollaboratorInput,
): Promise<void> {
  return invoke("update_collaborator", { id, input });
}

export async function deleteCollaborator(id: string): Promise<void> {
  return invoke("delete_collaborator", { id });
}

export async function getRdpConnections(): Promise<RdpConnection[]> {
  return invoke("get_rdp_connections");
}

export async function getRdpByClient(clientId: string): Promise<RdpConnection[]> {
  return invoke("get_rdp_by_client", { clientId });
}

export async function getRdp(id: string): Promise<RdpConnection> {
  return invoke("get_rdp", { id });
}

export type RdpFilePreview = {
  host: string;
  port: number;
  username: string | null;
  domain: string | null;
};

export async function previewRdpFile(path: string): Promise<RdpFilePreview> {
  return invoke("preview_rdp_file", { path });
}

export async function createRdp(input: CreateRdpInput): Promise<RdpConnection> {
  return invoke("create_rdp", { input });
}

export async function updateRdp(id: string, input: UpdateRdpInput): Promise<void> {
  return invoke("update_rdp", { id, input });
}

export async function deleteRdp(id: string): Promise<void> {
  return invoke("delete_rdp", { id });
}

export async function launchRdp(id: string): Promise<void> {
  return invoke("launch_rdp", { id });
}

export async function copyRdpField(id: string, field: "host" | "username" | "password"): Promise<void> {
  return invoke("copy_rdp_field", { id, field });
}

/** Password decifrata o `null` se non salvata. Richiede vault sbloccato. */
export async function revealRdpPassword(id: string): Promise<string | null> {
  return invoke<string | null>("reveal_rdp_password", { id });
}

export async function getVpnConnections(): Promise<VpnConnection[]> {
  return invoke("get_vpn_connections");
}

export async function getVpnByClient(clientId: string): Promise<VpnConnection[]> {
  return invoke("get_vpn_by_client", { clientId });
}

export async function getVpn(id: string): Promise<VpnConnection> {
  return invoke("get_vpn", { id });
}

export async function createVpn(input: CreateVpnInput): Promise<VpnConnection> {
  return invoke("create_vpn", { input });
}

export async function updateVpn(id: string, input: UpdateVpnInput): Promise<void> {
  return invoke("update_vpn", { id, input });
}

export async function deleteVpn(id: string): Promise<void> {
  return invoke("delete_vpn", { id });
}

export async function launchVpn(id: string): Promise<void> {
  return invoke("launch_vpn", { id });
}

export async function listWindowsVpnProfiles(): Promise<string[]> {
  return invoke("list_windows_vpn_profiles");
}

export async function copyVpnField(id: string, field: "server" | "username" | "password"): Promise<void> {
  return invoke("copy_vpn_field", { id, field });
}

export async function getWebConnections(): Promise<WebAccess[]> {
  return invoke("get_web_connections");
}

export async function getWebByClient(clientId: string): Promise<WebAccess[]> {
  return invoke("get_web_by_client", { clientId });
}

export async function getWebAccess(id: string): Promise<WebAccess> {
  return invoke("get_web_access", { id });
}

export async function createWebAccess(input: CreateWebAccessInput): Promise<WebAccess> {
  return invoke("create_web_access", { input });
}

export async function updateWebAccess(id: string, input: UpdateWebAccessInput): Promise<void> {
  return invoke("update_web_access", { id, input });
}

export async function deleteWebAccess(id: string): Promise<void> {
  return invoke("delete_web_access", { id });
}

export async function launchWebAccess(id: string): Promise<void> {
  return invoke("launch_web_access", { id });
}

export async function copyWebField(
  id: string,
  field: "url" | "username" | "domain" | "password",
): Promise<void> {
  return invoke("copy_web_field", { id, field });
}

/** Password decifrata o `null` se non salvata. Richiede vault sbloccato. */
export async function revealWebPassword(id: string): Promise<string | null> {
  return invoke<string | null>("reveal_web_password", { id });
}

export async function setMasterPassword(password: string): Promise<void> {
  return invoke("set_master_password", { password });
}

export async function unlockVault(password: string): Promise<VaultStatus> {
  return invoke<VaultStatus>("unlock_vault", { password });
}

/** Verifica la master password senza mantenere il vault sbloccato (uso gate azioni distruttive in UI). */
export async function verifyVaultMasterPassword(password: string): Promise<void> {
  return invoke("verify_vault_master_password", { password });
}

export async function changeVaultMasterPassword(
  currentPassword: string,
  newPassword: string,
): Promise<VaultStatus> {
  return invoke<VaultStatus>("change_vault_master_password", {
    currentPassword,
    newPassword,
  });
}

export async function exportVaultRecoveryKit(path: string, recoveryPassphrase: string): Promise<void> {
  return invoke("export_vault_recovery_kit", { path, recoveryPassphrase });
}

export async function recoverVaultWithRecoveryKit(
  path: string,
  recoveryPassphrase: string,
  newMasterPassword: string,
): Promise<VaultStatus> {
  return invoke<VaultStatus>("recover_vault_with_recovery_kit", {
    path,
    recoveryPassphrase,
    newMasterPassword,
  });
}

export async function resetVaultWipeSecrets(confirmation: string): Promise<void> {
  return invoke("reset_vault_wipe_secrets", { confirmation });
}

export async function lockVault(): Promise<void> {
  return invoke("lock_vault");
}

export async function isVaultUnlocked(): Promise<boolean> {
  return invoke("is_vault_unlocked");
}

export async function getVaultStatus(): Promise<VaultStatus> {
  return invoke("get_vault_status");
}

export async function encryptSecret(value: string): Promise<string> {
  return invoke("encrypt_secret", { value });
}

export async function decryptSecret(value: string): Promise<string> {
  return invoke("decrypt_secret", { value });
}

export async function exportEncryptedBackup(path: string, password: string): Promise<void> {
  return invoke("export_encrypted_backup", { path, password });
}

export async function importEncryptedBackup(path: string, password: string, overwrite: boolean): Promise<void> {
  return invoke("import_encrypted_backup", { path, password, overwrite });
}

/** Reset completo locale: elimina tutti i dati (clienti, connessioni, impostazioni, vault). Richiede la master password Vault. */
export async function masterWipeApplicationData(vaultPassword: string): Promise<void> {
  return invoke("master_wipe_application_data", { vaultPassword });
}

export async function getSettings(): Promise<AppSettings> {
  const s = await invoke<AppSettings>("get_settings");
  return normalizeAppSettings({
    ...s,
    favoriteRdpIds: s.favoriteRdpIds ?? [],
    connectionNamePresets: s.connectionNamePresets ?? [],
    environments: s.environments ?? [],
    versionOptions: s.versionOptions ?? [],
    releaseOptions: s.releaseOptions ?? [],
    contractTypes: s.contractTypes ?? [],
    crmModules: s.crmModules ?? [],
    collaboratorCompetencies: s.collaboratorCompetencies ?? [],
    dashboardLayout: s.dashboardLayout ?? {},
    planningStates: s.planningStates ?? [],
    planningActivityTypes: s.planningActivityTypes ?? [],
    planningActivities: s.planningActivities ?? [],
  });
}

export async function updateSettings(input: UpdateSettingsInput): Promise<void> {
  return invoke("update_settings", { input });
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return invoke("get_dashboard_stats");
}

function pickNonEmpty(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string") {
      const t = c.trim();
      if (t) return t;
    }
  }
  return undefined;
}

export function formatErr(e: unknown): string {
  if (import.meta.env.DEV && e != null && e !== "") {
    console.warn("[rdp-manager]", e);
  }

  if (e == null || e === "") return "Errore sconosciuto";
  if (typeof e === "string") return e;
  if (typeof e === "number" || typeof e === "boolean") return String(e);

  if (e instanceof Error) {
    const m = e.message?.trim();
    return m || "Errore";
  }

  if (typeof e === "object") {
    const o = e as Record<string, unknown>;

    const direct = pickNonEmpty(o.message, o.msg, o.error);
    if (direct) return direct;

    const nestedPayload =
      o.payload != null && typeof o.payload === "object"
        ? (o.payload as Record<string, unknown>)
        : null;
    if (nestedPayload) {
      const nm = pickNonEmpty(nestedPayload.message, nestedPayload.error);
      if (nm) return nm;
    }

    try {
      const s = JSON.stringify(o);
      if (s && s !== "{}") return s;
    } catch {
      /* ignore */
    }
  }

  return "Errore sconosciuto";
}
