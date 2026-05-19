import type { Scratch } from "@/components/PlanningActivityEditorModal";
import { planningFieldIsActive } from "@/lib/presetCatalog";
import { coerceToDatePart, isoToDatetimeLocalValue } from "@/lib/planningDateUtils";
import { optionsForPlanningCatalogRef, type PlanningCatalogBundle } from "@/lib/planningCatalogOptions";
import type {
  PlanningActivityPayload,
  PlanningActivityTypeDef,
  PlanningFieldDef,
  PlanningStateDef,
} from "@/types";

export type PlanningPasteColumn = { key: string; label: string };

export function planningFieldPasteLabel(f: PlanningFieldDef): string {
  return (f.label || "").trim() || "Campo";
}

/** Stessa ordinamento colonne lista / modulo (campi poi metadati). */
export function buildPlanningPasteColumns(t: PlanningActivityTypeDef): PlanningPasteColumn[] {
  const cols: PlanningPasteColumn[] = [];
  for (const f of t.fields) {
    if (!planningFieldIsActive(f)) continue;
    cols.push({ key: `field:${f.id}`, label: planningFieldPasteLabel(f) });
  }
  if (t.showStatus) cols.push({ key: "__statusId", label: "Stato" });
  if (t.showStartDate) cols.push({ key: "__startDate", label: "Data inizio" });
  if (t.showEndDate) cols.push({ key: "__endDate", label: "Data fine" });
  if (t.showReminder) cols.push({ key: "__reminderAt", label: "Promemoria" });
  return cols;
}

/** Separatore colonne scelto dall’utente nell’inserimento massivo. */
export type PlanningBulkColumnSeparator = "tab" | "semicolon" | "comma" | "pipe";

export const PLANNING_BULK_SEPARATOR_OPTIONS: readonly {
  value: PlanningBulkColumnSeparator;
  label: string;
}[] = [
  { value: "tab", label: "Tab" },
  { value: "semicolon", label: "Punto e virgola (;)" },
  { value: "comma", label: "Virgola (,)" },
  { value: "pipe", label: "Pipe (|)" },
];

function splitCsvLineRespectingQuotes(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/** Suddivide il testo in righe e celle usando il separatore indicato. */
export function splitPastedLines(text: string, separator: PlanningBulkColumnSeparator = "tab"): string[][] {
  const delimChar =
    separator === "tab"
      ? "\t"
      : separator === "semicolon"
        ? ";"
        : separator === "comma"
          ? ","
          : "|";

  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[][] = [];
  for (const line of lines) {
    const t = line.trimEnd();
    if (!t.trim()) continue;
    if (separator === "comma") {
      out.push(splitCsvLineRespectingQuotes(t));
    } else {
      out.push(t.split(delimChar).map((c) => c.trim()));
    }
  }
  return out;
}

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveCatalogValue(
  ref: NonNullable<PlanningFieldDef["catalogRef"]>,
  raw: string,
  bundle: PlanningCatalogBundle,
): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const opts = optionsForPlanningCatalogRef(ref, bundle);
  const byId = opts.find((o) => o.id === t);
  if (byId) return byId.id;
  const n = normKey(t);
  const exact = opts.find((o) => normKey(o.label) === n);
  if (exact) return exact.id;
  const partial = opts.find((o) => normKey(o.label).includes(n) || n.includes(normKey(o.label)));
  return partial?.id;
}

function resolveStateId(raw: string, states: PlanningStateDef[]): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const byId = states.find((s) => s.id === t);
  if (byId) return byId.id;
  const n = normKey(t);
  const ex = states.find((s) => normKey(s.name) === n);
  if (ex) return ex.id;
  const pr = states.find((s) => normKey(s.name).includes(n) || n.includes(normKey(s.name)));
  return pr?.id;
}

function parseIsoOrItalianDate(cell: string): string | undefined {
  const s = cell.trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})$/.exec(s);
  if (!m) return undefined;
  const d = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10);
  let y = Number.parseInt(m[3], 10);
  if (y < 100) y += 2000;
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return undefined;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  return `${String(y)}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Data e ora per promemoria: ISO completo oppure combinazione data + ora nella stessa cella (it o ISO date + time). */
function parseReminderCell(cell: string): string | undefined {
  const s = cell.trim();
  if (!s) return undefined;
  const isoTry = new Date(s);
  if (!Number.isNaN(isoTry.getTime())) return isoTry.toISOString();
  const m = /^(.+?)\s+(\d{1,2})[.:](\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) {
    const dp = parseIsoOrItalianDate(m[1]!.trim()) ?? coerceToDatePart(m[1]!.trim());
    if (!dp) return undefined;
    const hh = Math.min(23, Math.max(0, Number.parseInt(m[2]!, 10)));
    const mm = Math.min(59, Math.max(0, Number.parseInt(m[3]!, 10)));
    const local = `${dp}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    const d = new Date(local);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const dateOnly = parseIsoOrItalianDate(s) ?? coerceToDatePart(s);
  if (!dateOnly) return undefined;
  const d = new Date(`${dateOnly}T09:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function parseBool(cell: string): boolean {
  const n = normKey(cell);
  if (["si", "sì", "vero", "true", "1", "yes", "v", "x"].includes(n)) return true;
  return false;
}

function parseDatetimeLocalCell(cell: string): string | undefined {
  const s = cell.trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
  const mWithTime = /^(.+?)\s+(\d{1,2})[.:](\d{2})$/.exec(s);
  if (mWithTime) {
    const dp = parseIsoOrItalianDate(mWithTime[1]!.trim());
    if (!dp) return undefined;
    const hh = Math.min(23, Math.max(0, Number.parseInt(mWithTime[2]!, 10)));
    const mm = Math.min(59, Math.max(0, Number.parseInt(mWithTime[3]!, 10)));
    return `${dp}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  const dpOnly = parseIsoOrItalianDate(s);
  return dpOnly ? `${dpOnly}T09:00` : undefined;
}

export type ParsedPlanningPasteRow =
  | { ok: true; rowIndex: number; scratch: Scratch }
  | { ok: false; rowIndex: number; error: string };

export function parsePlanningPasteRow(params: {
  rowIndex: number;
  cells: string[];
  cols: PlanningPasteColumn[];
  typeDef: PlanningActivityTypeDef;
  bundle: PlanningCatalogBundle;
  planningStates: PlanningStateDef[];
}): ParsedPlanningPasteRow {
  const { rowIndex, cells, cols, typeDef, bundle, planningStates } = params;
  const scratch = initPasteScratch(typeDef);

  try {
    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci];
      const cell = cells[ci]?.trim() ?? "";
      const key = col.key;

      if (key === "__statusId") {
        if (!cell) continue;
        const id = resolveStateId(cell, planningStates);
        if (!id) throw new Error(`Stato «${cell}» non trovato`);
        scratch.__statusId = id;
        continue;
      }
      if (key === "__startDate") {
        if (!cell) continue;
        const d = parseIsoOrItalianDate(cell) ?? coerceToDatePart(cell);
        if (!d) throw new Error(`Data inizio non valida: ${cell}`);
        scratch.__startDate = d;
        continue;
      }
      if (key === "__endDate") {
        if (!cell) continue;
        const d = parseIsoOrItalianDate(cell) ?? coerceToDatePart(cell);
        if (!d) throw new Error(`Data fine non valida: ${cell}`);
        scratch.__endDate = d;
        continue;
      }
      if (key === "__reminderAt") {
        if (!cell) continue;
        const iso = parseReminderCell(cell);
        if (!iso) throw new Error(`Promemoria non valida: ${cell}`);
        scratch.__reminderAt = isoToDatetimeLocalValue(iso);
        continue;
      }

      if (!key.startsWith("field:")) continue;
      const fid = key.slice("field:".length);
      const f = typeDef.fields.find((x) => x.id === fid && planningFieldIsActive(x));
      if (!f) continue;

      if (!cell) continue;

      if (f.kind === "comboBox" && f.catalogRef) {
        const id = resolveCatalogValue(f.catalogRef, cell, bundle);
        if (!id) throw new Error(`${planningFieldPasteLabel(f)}: valore «${cell}» non in elenco`);
        scratch[f.id] = id;
        continue;
      }
      if (f.kind === "selectList" && f.catalogRef) {
        const parts = cell.split(/[,;|]/).map((x) => x.trim()).filter(Boolean);
        const ids: string[] = [];
        for (const part of parts) {
          const id = resolveCatalogValue(f.catalogRef, part, bundle);
          if (!id) throw new Error(`${planningFieldPasteLabel(f)}: «${part}» non in elenco`);
          if (!ids.includes(id)) ids.push(id);
        }
        scratch[f.id] = ids;
        continue;
      }
      if (f.kind === "boolean") {
        scratch[f.id] = parseBool(cell);
        continue;
      }
      if (f.kind === "integer") {
        const n = Number.parseInt(cell.replace(/\s/g, ""), 10);
        if (!Number.isFinite(n)) throw new Error(`${planningFieldPasteLabel(f)}: numero intero non valido`);
        scratch[f.id] = String(n);
        continue;
      }
      if (f.kind === "string" || f.kind === "longText") {
        scratch[f.id] = cell;
        continue;
      }
      if (f.kind === "date") {
        const d = parseIsoOrItalianDate(cell) ?? coerceToDatePart(cell);
        if (!d) throw new Error(`${planningFieldPasteLabel(f)}: data non valida`);
        scratch[f.id] = d;
        continue;
      }
      if (f.kind === "time") {
        const m = /^(\d{1,2})[.:](\d{2})$/.exec(cell.trim());
        if (!m) throw new Error(`${planningFieldPasteLabel(f)}: usa HH:MM`);
        const hh = Math.min(23, Math.max(0, Number.parseInt(m[1]!, 10)));
        const mm = Math.min(59, Math.max(0, Number.parseInt(m[2]!, 10)));
        scratch[f.id] = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
        continue;
      }
      if (f.kind === "datetime") {
        const loc = parseDatetimeLocalCell(cell);
        if (!loc) throw new Error(`${planningFieldPasteLabel(f)}: data/ora non valida`);
        scratch[f.id] = loc;
        continue;
      }
    }

    return { ok: true, rowIndex, scratch };
  } catch (e) {
    return {
      ok: false,
      rowIndex,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function initPasteScratch(t: PlanningActivityTypeDef): Scratch {
  const s: Scratch = {};
  for (const f of t.fields) {
    if (!planningFieldIsActive(f)) continue;
    if (f.kind === "boolean") s[f.id] = false;
    else if (f.kind === "selectList") s[f.id] = [];
    else if (f.kind === "comboBox") s[f.id] = "";
    else s[f.id] = "";
  }
  if (t.showStartDate) s.__startDate = "";
  if (t.showEndDate) s.__endDate = "";
  if (t.showReminder) s.__reminderAt = "";
  s.__statusId = "";
  return s;
}

export function payloadsFromPasteScratchRows(
  typeDef: PlanningActivityTypeDef,
  rows: Scratch[],
  buildPayloadImpl: (t: PlanningActivityTypeDef, scratch: Scratch) => PlanningActivityPayload,
): PlanningActivityPayload[] {
  return rows.map((scratch) => buildPayloadImpl(typeDef, scratch));
}
