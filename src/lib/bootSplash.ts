const PROGRESS_ID = "app-boot-splash-progress";
const BAR_ROLE = "progressbar";

export function setBootSplashProgress(percent: number): void {
  const pct = Math.min(100, Math.max(0, percent));
  const fill = document.getElementById(PROGRESS_ID);
  if (fill) fill.style.width = `${pct}%`;
  const bar = fill?.closest(`[role="${BAR_ROLE}"]`);
  if (bar) bar.setAttribute("aria-valuenow", String(Math.round(pct)));
}

/** Finestre secondarie (`?detached=1`): niente overlay splash. */
export function shouldSkipBootSplashRoute(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hash;
  const q = h.includes("?") ? h.slice(h.indexOf("?") + 1) : "";
  return new URLSearchParams(q).get("detached") === "1";
}
