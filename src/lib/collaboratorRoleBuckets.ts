/**
 * Raggruppa i collaboratori per etichetta ruolo (Impostazioni → Ruoli incarico).
 * PM / Commerciali / Consulenti sono rilevati in base al testo del ruolo (case-insensitive).
 */
export type CollaboratorRoleBucket = "pm" | "commercial" | "consultant";

export function collaboratorMatchesBucket(
  roleLabel: string | null | undefined,
  bucket: CollaboratorRoleBucket,
): boolean {
  const t = (roleLabel ?? "").trim().toLowerCase();
  if (!t) return false;
  switch (bucket) {
    case "pm":
      return t === "pm" || /^pm\b/.test(t) || t.startsWith("project manager");
    case "commercial":
      return (
        t.includes("commerc") ||
        t.includes("sales") ||
        t.includes("vendit") ||
        t.includes("account")
      );
    case "consultant":
      return t.includes("consulent");
    default:
      return false;
  }
}
