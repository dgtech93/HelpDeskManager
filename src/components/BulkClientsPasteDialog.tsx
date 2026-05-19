import { useMemo, useState } from "react";

import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import {
  COLUMN_DELIMITER_OPTIONS,
  parseClientPasteGrid,
  type ColumnDelimiterId,
} from "@/lib/pasteGrid";
import type { ContractTypeDef, CreateClientInput } from "@/types";
import { toast } from "sonner";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  contractTypes: ContractTypeDef[];
  onImported: () => void;
};

export function BulkClientsPasteDialog({ open, onClose, contractTypes, onImported }: Props) {
  const [delimiter, setDelimiter] = useState<ColumnDelimiterId>("\t");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(
    () => (open ? parseClientPasteGrid(raw, delimiter, contractTypes) : []),
    [open, raw, delimiter, contractTypes],
  );

  const rowsForPreview = useMemo(() => parsed.filter((r) => r.kind !== "empty"), [parsed]);
  const okCount = useMemo(() => parsed.filter((r) => r.kind === "ok").length, [parsed]);
  const errCount = useMemo(() => parsed.filter((r) => r.kind === "error").length, [parsed]);
  const emptyLines = parsed.filter((r) => r.kind === "empty").length;

  const maxCols = useMemo(() => {
    let m = 6;
    for (const r of rowsForPreview) {
      if (r.kind === "error") m = Math.max(m, r.cells.length);
    }
    return m;
  }, [rowsForPreview]);

  if (!open) return null;

  const importClients = async () => {
    const toCreate = parsed.filter(
      (r): r is { kind: "ok"; sourceLine: number; payload: CreateClientInput } => r.kind === "ok",
    );
    if (toCreate.length === 0) {
      toast.error("Nessuna riga valida da importare");
      return;
    }
    setBusy(true);
    let ok = 0;
    try {
      for (const row of toCreate) {
        await api.createClient(row.payload);
        ok++;
      }
      const msg = `${ok === 1 ? "1 cliente creato" : `${ok} clienti creati`}${
        errCount > 0
          ? `. ${errCount} ${errCount === 1 ? "riga ignorata per errori" : "righe ignorate per errori"}.`
          : ""
      }${emptyLines > 0 && errCount === 0 ? ` ${emptyLines} righe vuote saltate.` : ""}`;
      toast.success(msg.trim());
      setRaw("");
      onImported();
      onClose();
    } catch (e) {
      toast.error(formatErr(e));
    } finally {
      setBusy(false);
    }
  };

  const columnTitles = ["Nome", "Descrizione", "Sito web", "Sede", "Aggiornamenti", "Contratto"];

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/45 p-4 backdrop-blur-sm">
      <div className="mx-auto mt-6 flex max-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Inserimento multiplo clienti</h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Incolla da Excel o da un editor: ogni <strong>riga</strong> è un cliente. Ordine colonne:{" "}
              <strong>Nome</strong> (obbligatorio), <strong>Descrizione</strong>, <strong>Sito web</strong>,{" "}
              <strong>Sede</strong>, numero <strong>Aggiornamenti</strong>, <strong>Tipo contratto</strong> (
              nome esatto come in Impostazioni → Contratti). Colonne successive possono essere omesse.
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
            Le righe sono sempre separate da a capo. Con «Spazio» o «Trattino» i nomi che contengono quello stesso
            carattere si spezzano: controlla l&apos;anteprima prima di importare.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-5 py-3">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Incolla qui</label>
          <textarea
            value={raw}
            disabled={busy}
            onChange={(e) => setRaw(e.target.value)}
            spellCheck={false}
            placeholder={"Es. con Tab:\nAcme Srl\tNote\thttps://…\nBeta SpA"}
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
          {rowsForPreview.length > 0 ? (
            <div className="max-h-[min(22rem,calc(100vh-20rem))] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-100 font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <tr>
                    <th className="sticky left-0 z-[2] min-w-[3rem] border-r border-slate-200 bg-slate-100 px-2 py-2 dark:border-slate-700 dark:bg-slate-900">
                      #
                    </th>
                    <th className="min-w-[4rem] border-r border-slate-200 px-2 py-2 dark:border-slate-700">Esito</th>
                    {Array.from({ length: maxCols }, (_, i) => (
                      <th key={i} className="min-w-[8rem] border-r border-slate-200 px-2 py-2 last:border-r-0 dark:border-slate-700">
                        {columnTitles[i] ?? `Extra ${i + 1}`}
                      </th>
                    ))}
                    <th className="min-w-[10rem] px-2 py-2">Messaggio</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsForPreview.map((r, idx) => {
                    let cells: string[] = [];
                    let statusCell: React.ReactNode;
                    let msgCell: React.ReactNode = null;

                    if (r.kind === "ok") {
                      const p = r.payload;
                      cells = [
                        p.name,
                        p.description ?? "",
                        p.websiteUrl ?? "",
                        p.location ?? "",
                        p.updateCount !== undefined ? String(p.updateCount) : "",
                        p.contractTypeId
                          ? (contractTypes.find((c) => c.id === p.contractTypeId)?.name ?? p.contractTypeId)
                          : "",
                      ];
                      statusCell = (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-100">
                          OK
                        </span>
                      );
                    } else {
                      cells = [...r.cells];
                      statusCell = (
                        <span className="rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                          Err
                        </span>
                      );
                      msgCell = (
                        <span className="text-rose-800 dark:text-rose-300" title={r.message}>
                          {r.message}
                        </span>
                      );
                    }

                    while (cells.length < maxCols) cells.push("");
                    if (cells.length > maxCols) cells = cells.slice(0, maxCols);

                    return (
                      <tr
                        key={`${r.kind}-${idx}-${r.sourceLine}`}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="sticky left-0 border-r border-slate-100 bg-white px-2 py-1 font-mono text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                          {r.sourceLine}
                        </td>
                        <td className="border-r border-slate-100 px-2 py-1 align-top dark:border-slate-800">
                          {statusCell}
                        </td>
                        {cells.map((c, ci) => (
                          <td
                            key={ci}
                            className="border-r border-slate-100 px-2 py-1 align-top text-slate-800 dark:border-slate-800 dark:text-slate-200"
                          >
                            {c || "—"}
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
            disabled={busy || okCount === 0}
            onClick={() => void importClients()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Importazione…" : `Importa ${okCount === 1 ? "1 cliente" : `${okCount} clienti`}`}
          </button>
        </div>
      </div>
    </div>
  );
}
