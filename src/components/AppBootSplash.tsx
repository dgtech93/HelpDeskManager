import { useEffect } from "react";
import * as api from "@/lib/api";
import { setBootSplashProgress, shouldSkipBootSplashRoute } from "@/lib/bootSplash";
import { useAppStore } from "@/store/appStore";

const BOOT_STATIC_ID = "app-boot-static";
const FADE_MS = 800;
/** Evita un lampo se il backend risponde istantaneamente. */
const MIN_SPLASH_MS = 400;

function removeSplash(): void {
  document.documentElement.classList.remove("app-boot");
  document.getElementById(BOOT_STATIC_ID)?.remove();
}

function fadeOutSplash(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      removeSplash();
      resolve();
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName !== "opacity") return;
      el.removeEventListener("transitionend", onEnd);
      done();
    };
    el.style.transition = `opacity ${FADE_MS}ms ease-out`;
    el.addEventListener("transitionend", onEnd);
    requestAnimationFrame(() => {
      el.style.opacity = "0";
    });
    window.setTimeout(done, FADE_MS + 120);
  });
}

/** Vault, impostazioni e un frame di paint dell’app sotto lo splash. */
async function waitUntilAppReady() {
  const loaded = await Promise.all([api.getVaultStatus(), api.getSettings()]);
  await new Promise<void>((r) => {
    requestAnimationFrame(() => requestAnimationFrame(() => r()));
  });
  return loaded;
}

export function AppBootSplash() {
  const setVault = useAppStore((s) => s.setVault);
  const setThemeStore = useAppStore((s) => s.setTheme);

  useEffect(() => {
    if (shouldSkipBootSplashRoute()) {
      removeSplash();
      return;
    }

    const splashEl = document.getElementById(BOOT_STATIC_ID);
    if (!splashEl) return;

    let cancelled = false;
    const started = performance.now();
    setBootSplashProgress(6);

    const progressTimer = window.setInterval(() => {
      const fill = document.getElementById("app-boot-splash-progress");
      if (!fill) return;
      const current = parseFloat(fill.style.width) || 6;
      if (current < 88) setBootSplashProgress(current + 4 + Math.random() * 6);
    }, 140);

    void (async () => {
      try {
        const [st, settings] = await waitUntilAppReady();
        if (cancelled) return;
        setVault(st.configured, st.unlocked);
        const mode = settings.theme === "dark" ? "dark" : "light";
        setThemeStore(mode);
        document.documentElement.classList.toggle("dark", mode === "dark");
      } catch {
        /* app utilizzabile comunque */
      } finally {
        window.clearInterval(progressTimer);
      }

      if (cancelled) return;

      setBootSplashProgress(100);

      const wait = Math.max(0, MIN_SPLASH_MS - (performance.now() - started));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (cancelled) return;

      await new Promise((r) => setTimeout(r, 180));
      if (cancelled) return;

      await fadeOutSplash(splashEl);
    })();

    return () => {
      cancelled = true;
      window.clearInterval(progressTimer);
    };
  }, [setThemeStore, setVault]);

  return null;
}
