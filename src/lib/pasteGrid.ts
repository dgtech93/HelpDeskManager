import type { ContractTypeDef, CreateClientInput } from "@/types";

export type ColumnDelimiterId = "\t" | ";" | "," | "." | " " | "-" | "/" | "\\";

export const COLUMN_DELIMITER_OPTIONS: { id: ColumnDelimiterId; label: string }[] = [
  { id: "\t", label: "Tab (consigliato da Excel)" },
  { id: ";", label: "Punto e virgola (;)" },
  { id: ",", label: "Virgola (,)" },
  { id: ".", label: "Punto (.)" },
  { id: " ", label: "Spazio" },
  { id: "-", label: "Trattino (-)" },
  { id: "/", label: "Slash (/)" },
  { id: "\\", label: "Backslash (\\)" },
];

export function splitPasteLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/** Suddivide una riga in celle secondo il separatore scelto. */
export function splitRowColumns(row: string, delim: ColumnDelimiterId): string[] {
  const normalized = row.replace(/\u00a0/g, " ");
  if (delim === " ") {
    const t = normalized.trim();
    if (!t) return [];
    return t.split(/\s+/).map((c) => c.trim());
  }
  if (delim === "\t") {
    return normalized.split("\t").map((c) => c.trim());
  }
  return normalized.split(delim).map((c) => c.trim());
}

function normalizeContractLookup(s: string): string {
  return s.trim().toLocaleLowerCase("it");
}

function parseUpdateCount(raw: string): number | "" {
  const t = raw.trim();
  if (!t) return "";
  const n = Number.parseInt(t.replace(/\s/g, ""), 10);
  if (!Number.isFinite(n) || n < 0) return "";
  return n;
}

function matchContractTypeId(label: string, contractTypes: ContractTypeDef[]): string | null {
  const want = normalizeContractLookup(label);
  if (!want) return null;
  const hit = contractTypes.find((ct) => normalizeContractLookup(ct.name) === want);
  return hit ? hit.id : null;
}

/** Mappa una riga già suddivisa in celle nei campi CreateClientInput. */
export function cellsToCreateClientInput(
  cells: string[],
  contractTypes: ContractTypeDef[],
): { ok: true; payload: CreateClientInput } | { ok: false; message: string } {
  const name = (cells[0] ?? "").trim();
  if (!name) {
    return { ok: false, message: "Nome obbligatorio" };
  }

  const description = (cells[1] ?? "").trim() || null;
  const websiteUrl = (cells[2] ?? "").trim() || null;
  const location = (cells[3] ?? "").trim() || null;

  const ucRaw = cells[4] ?? "";
  let updateCount: number | undefined;
  const uc = parseUpdateCount(ucRaw);
  if (typeof uc !== "number") {
    if (ucRaw.trim()) {
      return { ok: false, message: `Numero aggiornamenti non valido: "${ucRaw.trim()}"` };
    }
  } else {
    updateCount = uc;
  }

  const contractRaw = (cells[5] ?? "").trim();
  let contractTypeId: string | null | undefined;
  if (contractRaw) {
    const id = matchContractTypeId(contractRaw, contractTypes);
    if (!id) {
      return {
        ok: false,
        message: `Tipo contratto non trovato nel catalogo: «${contractRaw}»`,
      };
    }
    contractTypeId = id;
  }

  const payload: CreateClientInput = {
    name,
    description,
    websiteUrl,
    location,
    contractTypeId,
    updateCount,
  };

  return { ok: true, payload };
}

export type ParsedClientPasteRow =
  | { kind: "empty"; sourceLine: number }
  | { kind: "ok"; sourceLine: number; payload: CreateClientInput }
  | { kind: "error"; sourceLine: number; message: string; cells: string[] };

/** Le righe del testo diventano righe della tabella: una nuova riga = nuovo cliente. */
export function parseClientPasteGrid(
  raw: string,
  delim: ColumnDelimiterId,
  contractTypes: ContractTypeDef[],
): ParsedClientPasteRow[] {
  const lines = splitPasteLines(raw);
  const out: ParsedClientPasteRow[] = [];
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
    const name = (cells[0] ?? "").trim();
    if (!name) {
      out.push({
        kind: "error",
        sourceLine,
        message: "Prima colonna (nome) vuota",
        cells,
      });
      continue;
    }
    const mapped = cellsToCreateClientInput(cells, contractTypes);
    if (mapped.ok) {
      out.push({ kind: "ok", sourceLine, payload: mapped.payload });
    } else {
      out.push({ kind: "error", sourceLine, message: mapped.message, cells });
    }
  }
  return out;
}
