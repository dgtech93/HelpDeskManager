/**
 * Stile evidente (gradiente/bordo/ombra) ma dimensioni allineate ai pulsanti dello stesso contesto.
 */

const ringFocus = "outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950";
const disabled = "disabled:pointer-events-none disabled:opacity-45";

const callGlow =
  "border-2 border-teal-400/95 bg-gradient-to-b from-teal-500 via-teal-600 to-teal-800 text-white shadow-[0_3px_12px_-2px_rgba(13,148,136,0.5)] transition hover:via-teal-500 hover:to-teal-700 hover:shadow-[0_5px_16px_-2px_rgba(13,148,136,0.52)] active:translate-y-[0.5px] focus-visible:ring-teal-400 dark:border-teal-400/80 dark:from-teal-500 dark:via-teal-600 dark:to-teal-900 dark:hover:to-teal-800";

const mailGlow =
  "border-2 border-emerald-400/95 bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-800 text-white shadow-[0_3px_12px_-2px_rgba(5,150,105,0.5)] transition hover:via-emerald-500 hover:to-emerald-700 hover:shadow-[0_5px_16px_-2px_rgba(5,150,105,0.52)] active:translate-y-[0.5px] focus-visible:ring-emerald-400 dark:border-emerald-400/80 dark:from-emerald-500 dark:via-emerald-600 dark:to-emerald-900 dark:hover:to-emerald-800";

/**
 * Rubrica/Collaboratori — barra con Modifica/Elimina (`px-3 py-2 text-xs font-semibold`).
 */
export const CONTACT_CALL_BUTTON_MD_CLASS = [
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl",
  "px-3 py-2 text-xs font-semibold",
  callGlow,
  ringFocus,
  disabled,
].join(" ");

export const CONTACT_MAIL_BUTTON_MD_CLASS = [
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl",
  "px-3 py-2 text-xs font-semibold",
  mailGlow,
  ringFocus,
  disabled,
].join(" ");

/**
 * Riga pulsanti nella scheda persona (CollaboratorQuickContact…) — come LinkedIn: `py-2.5 text-sm min-w-[7rem]`.
 */
export const CONTACT_CALL_BUTTON_QUICK_STRIP_CLASS = [
  "inline-flex min-w-[7rem] items-center justify-center gap-2 rounded-xl",
  "px-4 py-2.5 text-sm font-semibold",
  callGlow,
  ringFocus,
  disabled,
].join(" ");

export const CONTACT_MAIL_BUTTON_QUICK_STRIP_CLASS = [
  "inline-flex min-w-[7rem] items-center justify-center gap-2 rounded-xl",
  "px-4 py-2.5 text-sm font-semibold",
  mailGlow,
  ringFocus,
  disabled,
].join(" ");

/**
 * Pianificazione — come Eliminazione massiva / Nuova attività (`min-h-[2.5rem] px-3.5 py-2 text-[13px]`).
 */
export const CONTACT_CALL_BUTTON_PLANNING_CLASS = [
  "inline-flex min-h-[2.5rem] shrink-0 items-center justify-center gap-2 rounded-xl",
  "px-3.5 py-2 text-[13px] font-semibold",
  callGlow,
  ringFocus,
  disabled,
].join(" ");

export const CONTACT_MAIL_BUTTON_PLANNING_CLASS = [
  "inline-flex min-h-[2.5rem] shrink-0 items-center justify-center gap-2 rounded-xl",
  "px-3.5 py-2 text-[13px] font-semibold",
  mailGlow,
  ringFocus,
  disabled,
].join(" ");

/**
 * Dashboard dettaglio persona — come la precedente riga azioni (`rounded-lg px-4 py-2 text-sm`).
 */
export const CONTACT_CALL_BUTTON_DETAIL_DIALOG_CLASS = [
  "inline-flex items-center gap-2 rounded-lg",
  "px-4 py-2 text-sm font-semibold",
  callGlow,
  ringFocus,
  disabled,
].join(" ");

export const CONTACT_MAIL_BUTTON_DETAIL_DIALOG_CLASS = [
  "inline-flex items-center gap-2 rounded-lg",
  "px-4 py-2 text-sm font-semibold",
  mailGlow,
  ringFocus,
  disabled,
].join(" ");

/**
 * Card compatte scheda cliente — come LinkedIn sulla stessa riga (`px-2 py-1 text-[11px]`).
 */
export const CONTACT_CALL_BUTTON_COMPACT_CLASS = [
  "inline-flex items-center justify-center gap-1 rounded-md",
  "border-2 border-teal-400/90 bg-gradient-to-b from-teal-500 to-teal-800 px-2 py-1",
  "text-[11px] font-semibold text-white shadow-sm shadow-teal-900/25 transition hover:to-teal-700 active:translate-y-[0.5px]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950",
  "dark:border-teal-400/70 dark:to-teal-900",
  disabled,
].join(" ");

export const CONTACT_MAIL_BUTTON_COMPACT_CLASS = [
  "inline-flex items-center justify-center gap-1 rounded-md",
  "border-2 border-emerald-400/90 bg-gradient-to-b from-emerald-500 to-emerald-800 px-2 py-1",
  "text-[11px] font-semibold text-white shadow-sm shadow-emerald-900/25 transition hover:to-emerald-700 active:translate-y-[0.5px]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950",
  "dark:border-emerald-400/70 dark:to-emerald-900",
  disabled,
].join(" ");
