import { createHashRouter, RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { Layout } from "@/components/Layout";
import { DashboardPage } from "@/pages/Dashboard";
import { ClientsPage } from "@/pages/Clients";
import { RdpPage } from "@/pages/Rdp";
import { VpnPage } from "@/pages/Vpn";
import { WebPage } from "@/pages/Web";
import { BackupPage } from "@/pages/Backup";
import { SettingsPage } from "@/pages/Settings";
import { PianificazionePage } from "@/pages/Pianificazione";
import { AgendaPage } from "@/pages/Agenda";
import { RubricaPage } from "@/pages/Rubrica";
import { CollaboratoriPage } from "@/pages/Collaboratori";
import { CollaboratoreSchedaPage } from "@/pages/CollaboratoreScheda";
import { ClientConnectionsDetachedPage } from "@/pages/ClientConnectionsDetachedPage";
import * as api from "@/lib/api";
import { AppBootSplash } from "@/components/AppBootSplash";

function DevBrowserBanner() {
  if (!import.meta.env.DEV || api.isTauriRuntime()) return null;
  return (
    <div
      role="alert"
      className="border-b border-amber-400 bg-amber-100 px-4 py-3 text-center text-sm text-amber-950 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-50"
    >
      <strong className="font-semibold">Anteprima browser:</strong> qui non c&apos;è il backend Tauri.{" "}
      Avvia <code className="rounded bg-amber-200/90 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900">npm run tauri dev</code>{" "}
      e lavora nella <strong>finestra dell&apos;app HelpDesk Manager</strong>, non in questa scheda.
    </div>
  );
}

/** Layout senza `path` + figli assoluti: evita mismatch di matching con createHashRouter (404 su alcune voci). */
const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <DashboardPage /> },
      { path: "/clients", element: <ClientsPage /> },
      { path: "/rubrica", element: <RubricaPage /> },
      { path: "/collaboratori", element: <CollaboratoriPage /> },
      { path: "/collaboratori/scheda/:id", element: <CollaboratoreSchedaPage /> },
      {
        path: "/finestra/cliente/:clientId/connessioni/:kind",
        element: <ClientConnectionsDetachedPage />,
      },
      { path: "/rdp", element: <RdpPage /> },
      { path: "/vpn", element: <VpnPage /> },
      { path: "/web", element: <WebPage /> },
      { path: "/accessi-web", element: <WebPage /> },
      { path: "/backup", element: <BackupPage /> },
      { path: "/pianificazione", element: <PianificazionePage /> },
      { path: "/agenda", element: <AgendaPage /> },
      { path: "/settings", element: <SettingsPage /> },
    ],
  },
]);

export default function App() {
  return (
    <>
      <DevBrowserBanner />
      <AppBootSplash />
      <RouterProvider router={router} />
      <Toaster richColors position="top-center" />
    </>
  );
}
