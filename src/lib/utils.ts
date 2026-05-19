import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export async function copyTextWithClear(text: string, ms = 30_000): Promise<void> {
  await navigator.clipboard.writeText(text);
  window.setTimeout(async () => {
    try {
      const cur = await navigator.clipboard.readText();
      if (cur === text) {
        await navigator.clipboard.writeText("");
      }
    } catch {
      /* clipboard policy may block read */
    }
  }, ms);
}

/** Normalizza URL sito (aggiunge https:// se manca lo schema). */
export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  const t = raw?.trim() ?? "";
  if (!t) return null;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

export function websiteHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function faviconUrlForHostname(hostname: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`;
}
