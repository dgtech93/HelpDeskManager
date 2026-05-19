import type { RdpConnection, WebAccess } from "@/types";

function presetNamesEq(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("it") === b.trim().toLocaleLowerCase("it");
}

/** Connessione RDP più recente stesso cliente + nome preset (per precompilare una nuova riga). */
export function pickNewRdpTemplate(
  siblings: RdpConnection[] | undefined | null,
  clientId: string,
  presetName: string,
  excludeConnectionId?: string | null,
): RdpConnection | null {
  if (!siblings?.length || !clientId.trim() || !presetName.trim()) return null;
  const rows = siblings.filter(
    (r) =>
      (!excludeConnectionId || r.id !== excludeConnectionId) &&
      r.clientId === clientId.trim() &&
      presetNamesEq(r.name, presetName),
  );
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return rows[0] ?? null;
}

/** Accesso web più recente stesso cliente + nome preset (es. CRM). */
export function pickNewWebTemplate(
  siblings: WebAccess[] | undefined | null,
  clientId: string,
  presetName: string,
  excludeAccessId?: string | null,
): WebAccess | null {
  if (!siblings?.length || !clientId.trim() || !presetName.trim()) return null;
  const rows = siblings.filter(
    (w) =>
      (!excludeAccessId || w.id !== excludeAccessId) &&
      w.clientId === clientId.trim() &&
      presetNamesEq(w.name, presetName),
  );
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return rows[0] ?? null;
}
