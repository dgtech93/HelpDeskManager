import type { VpnConnection } from "@/types";

/** Host o profilo Windows: stessa logica della card VPN lato client. */
export function vpnEndpointDisplay(v: VpnConnection): string {
  const t = v.type.toLowerCase();
  if (t.includes("windows")) {
    const p = v.configPath?.trim();
    return (p || v.server?.trim() || "").trim();
  }
  return v.server?.trim() ?? "";
}
