import type { Client, VpnConnection } from "@/types";

/** VPN usata per tutte le RDP/accessi web del cliente: esplicita sul cliente o unica VPN configurata. */
export function effectiveClientVpnId(
  client: Client | undefined,
  vpnsForClient: VpnConnection[],
): string | null {
  if (!client) return null;
  if (client.defaultVpnId) return client.defaultVpnId;
  if (vpnsForClient.length === 1) return vpnsForClient[0].id;
  return null;
}
