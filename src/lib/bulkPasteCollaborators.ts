import {
  splitPasteLines,
  splitRowColumns,
  type ColumnDelimiterId,
} from "@/lib/pasteGrid";
import type {
  Client,
  CollaboratorCompetencyDef,
  CollaboratorRole,
  CreateCollaboratorInput,
} from "@/types";

function normCell(s: string | undefined): string {
  return (s ?? "").trim();
}

function normalizeLookup(s: string): string {
  return s.trim().toLocaleLowerCase("it");
}

function splitSemicolonList(raw: string): string[] {
  return raw
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
}

function resolveRoleId(raw: string, roles: CollaboratorRole[]): string | null {
  const want = normalizeLookup(raw);
  if (!want) return null;
  const hit = roles.find((r) => normalizeLookup(r.label) === want);
  return hit?.id ?? null;
}

function defaultRoleId(roles: CollaboratorRole[]): string | null {
  const sorted = [...roles].sort((a, b) => a.sortRank - b.sortRank);
  return sorted[0]?.id ?? null;
}

function resolveClientIds(namesCell: string, clients: Client[]): { ok: string[] } | { err: string } {
  const t = namesCell.trim();
  if (!t) return { ok: [] };
  const parts = splitSemicolonList(namesCell);
  if (parts.length === 0) return { ok: [] };
  const ids: string[] = [];
  for (const p of parts) {
    const want = normalizeLookup(p);
    const hits = clients.filter((c) => normalizeLookup(c.name) === want);
    if (hits.length === 0) return { err: `Cliente non trovato: «${p}»` };
    if (hits.length > 1) return { err: `Più clienti corrispondono a «${p}»` };
    ids.push(hits[0]!.id);
  }
  return { ok: [...new Set(ids)] };
}

function resolveCompetencyIds(
  namesCell: string,
  competencies: CollaboratorCompetencyDef[],
): { ok: string[] } | { err: string } {
  const t = namesCell.trim();
  if (!t) return { ok: [] };
  const parts = splitSemicolonList(namesCell);
  if (parts.length === 0) return { ok: [] };
  const ids: string[] = [];
  for (const p of parts) {
    const want = normalizeLookup(p);
    const hit = competencies.find((pr) => normCell(pr.name) && normalizeLookup(pr.name) === want);
    if (!hit) return { err: `Competenza non trovata: «${p}»` };
    ids.push(hit.id);
  }
  return { ok: [...new Set(ids)] };
}

function cellsToPayload(
  cells: string[],
  roles: CollaboratorRole[],
  competencies: CollaboratorCompetencyDef[],
  allClients: Client[],
): { ok: true; payload: CreateCollaboratorInput } | { ok: false; message: string } {
  const firstName = normCell(cells[0]);
  const lastName = normCell(cells[1]);
  if (!firstName && !lastName) {
    return { ok: false, message: "Indica almeno nome o cognome" };
  }

  const roleLabel = cells[2] ?? "";
  let roleId = resolveRoleId(roleLabel, roles);
  if (!roleId) {
    roleId = defaultRoleId(roles);
  }
  if (!roleId) {
    return { ok: false, message: "Nessun incarico disponibile: crea un ruolo in Impostazioni" };
  }

  const clientsCell = cells[3] ?? "";
  const cRes = resolveClientIds(clientsCell, allClients);
  if ("err" in cRes) return { ok: false, message: cRes.err };

  const compCell = cells[4] ?? "";
  const pRes = resolveCompetencyIds(compCell, competencies);
  if ("err" in pRes) return { ok: false, message: pRes.err };

  const email = normCell(cells[5]);
  const phone = normCell(cells[6]);
  const linkedinUrl = normCell(cells[7]);
  const photoUrl = normCell(cells[8]);

  const payload: CreateCollaboratorInput = {
    firstName,
    lastName,
    roleId,
    clientIds: cRes.ok,
    competencyPresetIds: pRes.ok,
    email: email || null,
    phone: phone || null,
    linkedinUrl: linkedinUrl || null,
    photoUrl: photoUrl || null,
  };

  return { ok: true, payload };
}

export type ParsedCollaboratorPasteRow =
  | { kind: "empty"; sourceLine: number }
  | { kind: "ok"; sourceLine: number; payload: CreateCollaboratorInput }
  | { kind: "error"; sourceLine: number; message: string; cells: string[] };

export function parseCollaboratorPasteGrid(
  raw: string,
  delim: ColumnDelimiterId,
  roles: CollaboratorRole[],
  competencies: CollaboratorCompetencyDef[],
  allClients: Client[],
): ParsedCollaboratorPasteRow[] {
  const lines = splitPasteLines(raw);
  const out: ParsedCollaboratorPasteRow[] = [];
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
    const mapped = cellsToPayload(cells, roles, competencies, allClients);
    if (mapped.ok) {
      out.push({ kind: "ok", sourceLine, payload: mapped.payload });
    } else {
      out.push({ kind: "error", sourceLine, message: mapped.message, cells });
    }
  }
  return out;
}
