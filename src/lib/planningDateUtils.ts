/** Converte ISO 8601 (`Date`) in stringa compatibile con `input[type="datetime-local"]` (timezone locale). */
export function isoToDatetimeLocalValue(isoLike: string): string {
  const s = isoLike.trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Riduce ISO o testo lungo alla parte data `yyyy-mm-dd`. */
export function coerceToDatePart(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return isoToDatetimeLocalValue(s).slice(0, 10);
}
