import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import {
  CollaboratorEditorOverlay,
  CollaboratorPageCardPreview,
  CollaboratorQuickContactButtons,
} from "@/components/collaborators/CollaboratorsBook";
import { AppPageHeader } from "@/components/layout/AppPageChrome";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Client, Collaborator, CollaboratorCompetencyDef, CollaboratorRole } from "@/types";
import { Users } from "lucide-react";

export function CollaboratoreSchedaPage() {
  const rawId = useParams().id ?? "";
  const collaboratorId = useMemo(() => decodeURIComponent(rawId), [rawId]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const detached = searchParams.get("detached") === "1";

  const [clients, setClients] = useState<Client[]>([]);
  const [competencyCatalog, setCompetencyCatalog] = useState<CollaboratorCompetencyDef[]>([]);
  const [roles, setRoles] = useState<CollaboratorRole[]>([]);
  const [rows, setRows] = useState<Collaborator[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);

  const reloadCompetencyCatalog = useCallback(async () => {
    const settings = await api.getSettings();
    setCompetencyCatalog(settings.collaboratorCompetencies ?? []);
  }, []);

  const load = useCallback(async () => {
    if (!api.isTauriRuntime()) return;
    setBusy(true);
    try {
      const [c, settings, rl, collab] = await Promise.all([
        api.getClients(),
        api.getSettings(),
        api.getCollaboratorRoles(),
        api.getCollaborators(),
      ]);
      setClients(c);
      setCompetencyCatalog(settings.collaboratorCompetencies ?? []);
      setRoles(rl);
      setRows(collab);
    } catch (e) {
      toast.error(formatErr(e));
    } finally {
      setBusy(false);
      setLoadedOnce(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const row = rows.find((r) => r.id === collaboratorId) ?? null;

  const missingAfterLoad =
    loadedOnce &&
    api.isTauriRuntime() &&
    !busy &&
    collaboratorId.trim() !== "" &&
    !row;

  const leaveSheet = useCallback(async () => {
    if (detached && api.isTauriRuntime()) {
      try {
        await api.closeCurrentDetachedSheetWindow();
      } catch (e) {
        toast.error(formatErr(e));
      }
      return;
    }
    navigate("/collaboratori");
  }, [detached, navigate]);

  const handleSaved = async () => {
    await load();
    setEditorOpen(false);
  };

  const sheetShell = detached
    ? "rounded-xl border border-teal-200/95 bg-teal-50 px-3 py-3 shadow-md ring-1 ring-slate-200/70 dark:border-teal-900 dark:bg-slate-900 dark:ring-slate-800/70"
    : "rounded-2xl border border-teal-200/80 bg-teal-50/40 p-4 shadow-sm dark:border-teal-900/55 dark:bg-slate-950/60";

  return (
    <div
      className={
        detached
          ? "mx-auto flex w-full max-w-[23rem] flex-col gap-2 px-4 py-3 pb-8"
          : "flex w-full min-w-0 flex-col gap-4"
      }
    >
      {!detached ? (
        <>
          <nav className="text-sm">
            <Link
              to="/collaboratori"
              className="font-medium text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-200"
            >
              ← Torna ai collaboratori
            </Link>
          </nav>

          <AppPageHeader
            icon={Users}
            accent="teal"
            title="Scheda collaboratore"
            description="Contatti rapidi qui sotto. Modifica ed elimina agiscono su questa anagrafica."
          />
        </>
      ) : null}

      {!api.isTauriRuntime() ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Collaboratori disponibili solo nell&apos;app desktop Tauri.
        </p>
      ) : busy && !loadedOnce ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">Caricamento…</p>
      ) : collaboratorId.trim() === "" ? (
        <p className="text-sm text-rose-700 dark:text-rose-400">Identificativo scheda non valido.</p>
      ) : missingAfterLoad ? (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-amber-900 dark:text-amber-100">
            Questo collaboratore non esiste più o non è stato trovato.
          </p>
          <button
            type="button"
            onClick={() => void leaveSheet()}
            className="font-semibold text-teal-700 dark:text-teal-400 hover:underline"
          >
            Torna all&apos;elenco
          </button>
        </div>
      ) : row ? (
        <section className={sheetShell}>
          <div className="flex flex-wrap items-center gap-2 pb-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditorOpen(true)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-45 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900"
            >
              Modifica
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDelConfirm(true)}
              className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-45 dark:border-rose-900 dark:bg-slate-950 dark:text-rose-300"
            >
              Elimina
            </button>
          </div>

          <div className="mx-auto w-full max-w-[22rem]">
            <CollaboratorPageCardPreview
              row={row}
              competencyCatalog={competencyCatalog}
              clients={clients}
            />
          </div>
          <CollaboratorQuickContactButtons row={row} disabled={busy} />
        </section>
      ) : null}

      {row ? (
        <CollaboratorEditorOverlay
          open={editorOpen}
          clients={clients}
          competencyCatalog={competencyCatalog}
          reloadCompetencyCatalog={reloadCompetencyCatalog}
          roles={roles}
          fixedClientId={null}
          initial={row}
          onClose={() => setEditorOpen(false)}
          onSaved={handleSaved}
        />
      ) : null}

      <ConfirmDialog
        open={delConfirm && Boolean(row)}
        danger
        title="Eliminare il collaboratore?"
        description="Il profilo verrà rimosso dall’anagrafica interna."
        confirmLabel="Elimina"
        onCancel={() => setDelConfirm(false)}
        onConfirm={() => {
          if (!row) return;
          setDelConfirm(false);
          void (async () => {
            try {
              await api.deleteCollaborator(row.id);
              toast.success("Collaboratore eliminato");
              await leaveSheet();
            } catch (e) {
              toast.error(formatErr(e));
            }
          })();
        }}
      />
    </div>
  );
}
