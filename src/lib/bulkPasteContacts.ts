import {
  splitPasteLines,
  splitRowColumns,
  type ColumnDelimiterId,
} from "@/lib/pasteGrid";
import type { Client, CreateClientContactInput } from "@/types";

function normCell(s: string | undefined): string {
  return (s ?? "").trim();
}

function normalizeLookup(s: string): string {
  return s.trim().toLocaleLowerCase("it");
}

function resolveClientId(nameRaw: string, clients: Client[]): { ok: string } | { err: string } {
  const want = normalizeLookup(nameRaw);
  if (!want) return { err: "Nome cliente vuoto" };
  const hits = clients.filter((c) => normalizeLookup(c.name) === want);
  if (hits.length === 0) return { err: `Cliente non trovato: «${nameRaw.trim()}»` };
  if (hits.length > 1) return { err: `Più clienti corrispondono a «${nameRaw.trim()}»` };
  return { ok: hits[0]!.id };
}

function cellsToPayload(
  cells: string[],
  clients: Client[],
  lockedClientId: string | null,
): { ok: true; payload: CreateClientContactInput } | { ok: false; message: string } {
  let ci = 0;
  let clientId: string;
  if (lockedClientId?.trim()) {
    clientId = lockedClientId.trim();
  } else {
    const ck = resolveClientId(cells[0] ?? "", clients);
    if ("err" in ck) return { ok: false, message: ck.err };
    clientId = ck.ok;
    ci = 1;
  }

  const firstName = normCell(cells[ci]);
  const lastName = normCell(cells[ci + 1]);
  if (!firstName && !lastName) {
    return { ok: false, message: "Indica almeno nome o cognome" };
  }

  const role = normCell(cells[ci + 2]);
  const email = normCell(cells[ci + 3]);
  const phone = normCell(cells[ci + 4]);
  const mobile = normCell(cells[ci + 5]);

  const payload: CreateClientContactInput = {
    clientId,
    firstName,
    lastName,
    email: email || null,
    phone: phone || null,
    mobile: mobile || null,
    role: role || null,
  };
  return { ok: true, payload };
}

export type ParsedContactPasteRow =
  | { kind: "empty"; sourceLine: number }
  | { kind: "ok"; sourceLine: number; payload: CreateClientContactInput }
  | { kind: "error"; sourceLine: number; message: string; cells: string[] };

export function parseContactPasteGrid(
  raw: string,
  delim: ColumnDelimiterId,
  clients: Client[],
  lockedClientId: string | null,
): ParsedContactPasteRow[] {
  const lines = splitPasteLines(raw);
  const out: ParsedContactPasteRow[] = [];
  let sourceLine = 0;
  for (const line of lines) {
    sourceLine++;
    if (!line.trim()) {
      out.push({ kind: "empty", sourceLine });
      continue;
    }
    const cells = splitRowColumns(line, delim);
    if (!cells.some((c) => c.trim().length > 0)) {
      out.push({ kind: "empty", sourceLine });
      continue;
    }

    const mapped = cellsToPayload(cells, clients, lockedClientId);
    if (mapped.ok) {
      out.push({ kind: "ok", sourceLine, payload: mapped.payload });
    } else {
      out.push({ kind: "error", sourceLine, message: mapped.message, cells });
    }
  }
  return out;
}
