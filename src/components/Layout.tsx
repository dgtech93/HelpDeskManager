import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Vista scheda collaboratore aperta in seconda finestra Tauri (URL con ?detached=1). */
function useDetachedCollaboratorSheetRoute(): boolean {
  const loc = useLocation();
  const sp = new URLSearchParams(loc.search);
  if (sp.get("detached") !== "1") return false;
  return /^\/collaboratori\/scheda\/[^/]+$/.test(loc.pathname);
}

/** Pannello RDP / WEB cliente in seconda finestra (stesso pattern `?detached=1`). */
function useDetachedClientConnectionsRoute(): boolean {
  const loc = useLocation();
  const sp = new URLSearchParams(loc.search);
  if (sp.get("detached") !== "1") return false;
  return /^\/finestra\/cliente\/[^/]+\/connessioni\/(rdp|web)$/.test(loc.pathname);
}

export function Layout() {
  const detached =
    useDetachedCollaboratorSheetRoute() || useDetachedClientConnectionsRoute();
  const { pathname } = useLocation();
  /** Pagine con toolbar fissa e scroll solo sull’elenco (clienti, rubrica, collaboratori). */
  const directoryBookPageFit =
    pathname === "/clients" ||
    pathname === "/rubrica" ||
    pathname === "/collaboratori";

  if (detached) {
    return (
      <div className="min-h-[100dvh] min-h-[100vh] overflow-y-auto bg-[rgb(var(--surface-muted))] text-slate-900 dark:bg-slate-950 dark:text-slate-50">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[rgb(var(--surface-muted))] text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-slate-400/35 bg-[rgb(var(--surface))] px-4 py-2.5 shadow-[inset_0_-1px_0_0_rgba(148,163,184,0.12)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-none">
          <ThemeToggle />
        </header>
        <main
          className={`flex min-h-0 flex-1 flex-col px-3 py-4 sm:px-4 ${
            directoryBookPageFit ? "overflow-hidden" : "overflow-y-auto"
          }`}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
