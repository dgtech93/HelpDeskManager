/** Account Windows in visualizzazione: dominio e utente compilati separati nel form. */
export function rdpDomainUserDisplay(
  domain: string | null | undefined,
  username: string | null | undefined,
): string {
  const d = domain?.trim() ?? "";
  const u = username?.trim() ?? "";
  if (d && u) return `${d}\\${u}`;
  if (u) return u;
  if (d) return `${d}\\`;
  return "";
}
