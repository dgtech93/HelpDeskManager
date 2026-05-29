import type { Client, VpnConnection } from "@/types";
import { vpnEndpointDisplay } from "@/lib/vpnDisplay";

export type VpnTemplateOption = {
  /** VPN sorgente (per decifrare la password). */
  sourceId: string;
  label: string;
  vpn: VpnConnection;
};

function vpnTemplateKey(v: VpnConnection): string {
  return [
    v.type.trim().toLowerCase(),
    (v.server ?? "").trim().toLowerCase(),
    (v.username ?? "").trim().toLowerCase(),
    (v.configPath ?? "").trim().toLowerCase(),
  ].join("\0");
}

function pickRepresentative(group: VpnConnection[]): VpnConnection {
  const withPwd = group.filter((g) => g.passwordEncrypted);
  const pool = withPwd.length > 0 ? withPwd : group;
  const sorted = [...pool].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return sorted[0]!;
}

/** Opzioni per copiare una VPN già configurata su altri clienti (deduplicate per impostazioni tecniche). */
export function listVpnTemplatesFromOtherClients(
  allVpns: VpnConnection[],
  clients: Client[],
  targetClientId: string,
): VpnTemplateOption[] {
  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));
  const others = allVpns.filter((v) => v.clientId !== targetClientId.trim());
  if (others.length === 0) return [];

  const groups = new Map<string, VpnConnection[]>();
  for (const v of others) {
    const key = vpnTemplateKey(v);
    const list = groups.get(key) ?? [];
    list.push(v);
    groups.set(key, list);
  }

  const options: VpnTemplateOption[] = [];
  for (const group of groups.values()) {
    const vpn = pickRepresentative(group);
    const clientNames = [
      ...new Set(
        group
          .map((g) => clientNameById.get(g.clientId) ?? "Cliente")
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "it"));
    const endpoint = vpnEndpointDisplay(vpn);
    const endpointPart = endpoint ? ` · ${endpoint}` : "";
    const clientsPart =
      clientNames.length <= 2
        ? clientNames.join(", ")
        : `${clientNames.slice(0, 2).join(", ")} +${clientNames.length - 2}`;
    options.push({
      sourceId: vpn.id,
      label: `${vpn.name} (${vpn.type}${endpointPart}) — ${clientsPart}`,
      vpn,
    });
  }

  options.sort((a, b) => a.label.localeCompare(b.label, "it"));
  return options;
}

export type VpnTemplateFieldValues = {
  name: string;
  type: string;
  server: string;
  username: string;
  configPath: string;
  notes: string;
};

export function vpnTemplateFieldValues(v: VpnConnection): VpnTemplateFieldValues {
  return {
    name: v.name,
    type: v.type,
    server: v.server ?? "",
    username: v.username ?? "",
    configPath: v.configPath ?? "",
    notes: v.notes ?? "",
  };
}
