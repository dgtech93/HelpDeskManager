import { useMemo, useState } from "react";

import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { parseCollaboratorPasteGrid, type ParsedCollaboratorPasteRow } from "@/lib/bulkPasteCollaborators";
import {
  COLUMN_DELIMITER_OPTIONS,
  type ColumnDelimiterId,
} from "@/lib/pasteGrid";
import type {
  Client,
  CollaboratorCompetencyDef,
  CollaboratorRole,
  CreateCollaboratorInput,
} from "@/types";
import { useAppStore } from "@/store/appStore";
import { toast } from "sonner";
import { X } from "lucide-react";

function clientNames(clients: Client[], ids: string[]): string {
  return ids
    .map((id) => clients.find((c) => c.id === id)?.name ?? id)
    .join("; ");
}

function competencyNames(rows: CollaboratorCompetencyDef[], ids: string[]): string {
  return ids
    .map((id) => rows.find((p) => p.id === id)?.name ?? id)
    .join("; ");
}

type Props = {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  roles: CollaboratorRole[];
  competencyCatalog: CollaboratorCompetencyDef[];
  onImported: () => void;
};

const COL_TITLES = [
  "Nome",
  "Cognome",
  "Incarico",
  "Clienti",
  "Competenze",
  "Email",
  "Telefono",
  "LinkedIn",
  "Foto URL",
];

export function BulkCollaboratorsPasteDialog({
  open,
  onClose,
  clients,
  roles,
  competencyCatalog,
  onImported,
}: Props) {
  const vaultConfigured = useAppStore((s) => s.vaultConfigured);
  const [delimiter, setDelimiter] = useState<ColumnDelimiterId>("\t");
  const [raw, setRaw] = useState("");
  const [masterPwd, setMasterPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = useMemo<ParsedCollaboratorPasteRow[]>(
    () =>
      open
        ? parseCollaboratorPasteGrid(raw, delimiter, roles, competencyCatalog, clients)
        : [],
    [open, raw, delimiter, roles, competencyCatalog, clients],
  );

  const rowsForPreview = useMemo(() => parsed.filter((r) => r.kind !== "empty"), [parsed]);
  const okCount = useMemo(() => parsed.filter((r) => r.kind === "ok").length, [parsed]);
  const errCount = useMemo(() => parsed.filter((r) => r.kind === "error").length, [parsed]);
  const emptyLines = parsed.filter((r) => r.kind === "empty").length;

  const maxCols = useMemo(() => {
    let m = COL_TITLES.length;
    for (const r of rowsForPreview) {
      if (r.kind === "error") m = Math.max(m, r.cells.length);
    }
    return m;
  }, [rowsForPreview]);

  if (!open) return null;

  const verifyAndImport = async () => {
    const toCreate = parsed.filter(
      (r): r is { kind: "ok"; sourceLine: number; payload: CreateCollaboratorInput } => r.kind === "ok",
    );
    if (toCreate.length === 0) {
      toast.error("Nessuna riga valida da importare");
      return;
    }
    if (vaultConfigured) {
      const p = masterPwd.trim();
      if (!p) {
        toast.error("Inserisci la master password del vault");
        return;
      }
    }
    setBusy(true);
    try {
      if (vaultConfigured) {
        await api.verifyVaultMasterPassword(masterPwd.trim());
      }
      let ok = 0;
      for (const row of toCreate) {
        await api.createCollaborator(row.payload);
        ok++;
      }
      const msg = `${ok === 1 ? "1 collaboratore creato" : `${ok} collaboratori creati`}${
        errCount > 0
          ? `. ${errCount} ${errCount === 1 ? "riga ignorata per errori" : "righe ignorate per errori"}.`
          : ""
      }${emptyLines > 0 && errCount === 0 ? ` ${emptyLines} righe vuote saltate.` : ""}`;
      toast.success(msg.trim());
      setRaw("");
      setMasterPwd("");
      onImported();
      onClose();
    } catch (e) {
      toast.error(formatErr(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/45 p-4 backdrop-blur-sm">
      <div className="mx-auto mt-6 flex max-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Inserimento multiplo collaboratori</h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Ogni <strong>riga</strong>: obbligatori solo <strong>Nome</strong> e <strong>Cognome</strong> (almeno uno dei
              due). Campi opzionali: <strong>Incarico</strong> (se vuoto: primo ruolo dalla lista Impostazioni),{" "}
              <strong>Clienti</strong> (nomi separati da <strong>;</strong>; se vuoto li aggiungi dopo in modifica),
              <strong>Competenze</strong> (nomi dal catalogo Impostazioni → Ruoli e competenze, separati da{" "}
              <strong>;</strong>), Email, Telefono, LinkedIn, URL
              foto.
            </p>
          </div>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-shrink-0 space-y-3 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Separatore tra colonne
          </label>
          <select
            value={delimiter}
            disabled={busy}
            onChange={(e) => setDelimiter(e.target.value as ColumnDelimiterId)}
            className="max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            {COLUMN_DELIMITER_OPTIONS.map((o) => (
              <option key={o.label} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 dark:text-slate-500">
            I nomi multipli in una cella usano sempre <strong>;</strong> come separatore interno, non il separatore colonne
            scelto sopra.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-5 py-3">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Incolla qui</label>
          <textarea
            value={raw}
            disabled={busy}
            onChange={(e) => setRaw(e.target.value)}
            spellCheck={false}
            placeholder={`Mario\tRossi\tPM\tAcme SpA;Beta SpA\tConnessione X;Connessione Y\t...\n`}
            className="h-36 w-full resize-y rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900/80"
          />
          <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
            <span>
              Righe valide: <strong className="text-emerald-700 dark:text-emerald-400">{okCount}</strong>
            </span>
            <span>
              Con errori: <strong className="text-rose-700 dark:text-rose-400">{errCount}</strong>
            </span>
            {emptyLines > 0 ? (
              <span>
                Righe vuote: <strong className="text-slate-500">{emptyLines}</strong>
              </span>
            ) : null}
          </div>
          {!vaultConfigured ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Importazione bloccata: configura prima la protezione credenziali in Impostazioni → Credenziali (vault).
            </p>
          ) : null}
          {rowsForPreview.length > 0 ? (
            <div className="max-h-[min(20rem,calc(100vh-22rem))] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-100 font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <tr>
                    <th className="sticky left-0 z-[2] min-w-[2.5rem] border-r border-slate-200 bg-slate-100 px-2 py-2 dark:border-slate-700 dark:bg-slate-900">
                      #
                    </th>
                    <th className="min-w-[3.5rem] border-r border-slate-200 px-2 py-2 dark:border-slate-700">Esito</th>
                    {Array.from({ length: maxCols }, (_, i) => (
                      <th
                        key={i}
                        className="min-w-[5.5rem] border-r border-slate-200 px-2 py-2 last:border-r-0 dark:border-slate-700"
                      >
                        {COL_TITLES[i] ?? `Col ${i + 1}`}
                      </th>
                    ))}
                    <th className="min-w-[8rem] px-2 py-2">Messaggio</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsForPreview.map((r, idx) => {
                    let displayCells: string[] = [];
                    let statusCell: React.ReactNode;
                    let msgCell: React.ReactNode = null;

                    if (r.kind === "ok") {
                      const p = r.payload;
                      const roleLbl = roles.find((x) => x.id === p.roleId)?.label ?? p.roleId;
                      displayCells = [
                        p.firstName,
                        p.lastName,
                        roleLbl,
                        clientNames(clients, p.clientIds),
                        competencyNames(competencyCatalog, p.competencyPresetIds),
                        p.email ?? "",
                        p.phone ?? "",
                        p.linkedinUrl ?? "",
                        p.photoUrl ?? "",
                      ];
                      statusCell = (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-100">
                          OK
                        </span>
                      );
                    } else {
                      statusCell = (
                        <span className="rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                          Err
                        </span>
                      );
                      msgCell = <span className="text-rose-800 dark:text-rose-300">{r.message}</span>;
                      displayCells = [...r.cells];
                    }

                    while (displayCells.length < maxCols) displayCells.push("");
                    if (displayCells.length > maxCols) displayCells = displayCells.slice(0, maxCols);

                    return (
                      <tr key={`${r.kind}-${idx}-${r.sourceLine}`} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="sticky left-0 border-r border-slate-100 bg-white px-2 py-1 font-mono text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                          {r.sourceLine}
                        </td>
                        <td className="border-r border-slate-100 px-2 py-1 align-top dark:border-slate-800">{statusCell}</td>
                        {displayCells.map((cell, ci) => (
                          <td
                            key={ci}
                            className="max-w-[14rem] truncate border-r border-slate-100 px-2 py-1 align-top text-slate-800 dark:border-slate-800 dark:text-slate-200"
                            title={cell}
                          >
                            {cell || "—"}
                          </td>
                        ))}
                        <td className="px-2 py-1 align-top">{msgCell}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-500">Incolla del testo per vedere l&apos;anteprima.</p>
          )}
        </div>

        {vaultConfigured ? (
          <div className="border-t border-slate-200 px-5 py-3 dark:border-slate-700">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Master password vault (solo per questo import — non rimane la sessione sbloccata)
            </label>
            <input
              type="password"
              autoComplete="off"
              disabled={busy}
              value={masterPwd}
              onChange={(e) => setMasterPwd(e.target.value)}
              className="max-w-md w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </div>
        ) : null}

        <div className="flex flex-shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <button
            type="button"
            disabled={busy}
            onClick={() => onClose()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={
              busy ||
              okCount === 0 ||
              !vaultConfigured ||
              (vaultConfigured && !masterPwd.trim())
            }
            onClick={() => void verifyAndImport()}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Importazione…" : "Verifica password e importa"}
          </button>
        </div>
      </div>
    </div>
  );
}
