import type {
  ClientCardLayoutCell,
  ClientCardLayoutRow,
  ClientCardModuleSettings,
  ClientCardPanelId,
  ClientCardRowHeightMode,
} from "@/types";

export const CLIENT_CARD_PANEL_IDS: readonly ClientCardPanelId[] = [
  "map",
  "vpn",
  "rdp",
  "web",
  "planning",
] as const;

const FALLBACK_VERTICAL_ORDER = [...CLIENT_CARD_PANEL_IDS];

function newSlotId(prefix: string): string {
  try {
    return `${prefix}_${crypto.randomUUID()}`;
  } catch {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

/** Id stabile per nuove righe/celle nel layout editor. */
export function newClientCardLayoutId(prefix: string): string {
  return newSlotId(prefix);
}

/** Una riga per pannello (compatibile con vecchio panelOrder salvato sul DB). */
export function migratePanelOrderToLayoutRows(panelOrder: ClientCardPanelId[]): ClientCardLayoutRow[] {
  return panelOrder.map((panelId) => ({
    id: newSlotId("row"),
    heightMode: "auto" as ClientCardRowHeightMode,
    heightPx: null,
    cells: [{ id: newSlotId("cell"), panelId, span: 1 }],
  }));
}

/** Layout di default (5 righe x 1 colonna). */
export function defaultClientCardLayoutRows(): ClientCardLayoutRow[] {
  return migratePanelOrderToLayoutRows(FALLBACK_VERTICAL_ORDER as ClientCardPanelId[]);
}

/** Tre moduli sulla prima riga, due sulla seconda (es. mappa/VPN/RDP sopra). */
export function presetClientCardLayoutTop3Bottom2(): ClientCardLayoutRow[] {
  return [
    {
      id: newSlotId("row"),
      heightMode: "auto",
      heightPx: null,
      cells: [
        { id: newSlotId("cell"), panelId: "map", span: 1 },
        { id: newSlotId("cell"), panelId: "vpn", span: 1 },
        { id: newSlotId("cell"), panelId: "rdp", span: 1 },
      ],
    },
    {
      id: newSlotId("row"),
      heightMode: "auto",
      heightPx: null,
      cells: [
        { id: newSlotId("cell"), panelId: "web", span: 1 },
        { id: newSlotId("cell"), panelId: "planning", span: 1 },
      ],
    },
  ];
}

/** Due moduli sopra, tre sotto. */
export function presetClientCardLayoutTwoThree(): ClientCardLayoutRow[] {
  return [
    {
      id: newSlotId("row"),
      heightMode: "auto",
      heightPx: null,
      cells: [
        { id: newSlotId("cell"), panelId: "map", span: 1 },
        { id: newSlotId("cell"), panelId: "vpn", span: 1 },
      ],
    },
    {
      id: newSlotId("row"),
      heightMode: "auto",
      heightPx: null,
      cells: [
        { id: newSlotId("cell"), panelId: "rdp", span: 1 },
        { id: newSlotId("cell"), panelId: "web", span: 1 },
        { id: newSlotId("cell"), panelId: "planning", span: 1 },
      ],
    },
  ];
}

export const DEFAULT_CLIENT_CARD_MODULES: ClientCardModuleSettings = {
  showMap: true,
  showVpn: true,
  showRdp: true,
  showWeb: true,
  showPlanning: true,
  layoutRows: defaultClientCardLayoutRows(),
};

export function clientCardPanelVisible(m: ClientCardModuleSettings, id: ClientCardPanelId): boolean {
  switch (id) {
    case "map":
      return m.showMap;
    case "vpn":
      return m.showVpn;
    case "rdp":
      return m.showRdp;
    case "web":
      return m.showWeb;
    case "planning":
      return m.showPlanning;
    default:
      return false;
  }
}

function isPanelId(v: string): v is ClientCardPanelId {
  return (CLIENT_CARD_PANEL_IDS as readonly string[]).includes(v);
}

export function parseClientCardPanelId(raw: string): ClientCardPanelId | null {
  return isPanelId(raw) ? raw : null;
}

function normalizeLegacyPanelOrder(raw: unknown): ClientCardPanelId[] {
  if (!Array.isArray(raw)) return [...FALLBACK_VERTICAL_ORDER] as ClientCardPanelId[];
  const picked: ClientCardPanelId[] = [];
  const seen = new Set<ClientCardPanelId>();
  for (const x of raw) {
    if (typeof x !== "string") continue;
    if (!isPanelId(x)) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    picked.push(x);
  }
  for (const id of FALLBACK_VERTICAL_ORDER as ClientCardPanelId[]) {
    if (!seen.has(id)) picked.push(id);
  }
  return picked;
}

function coerceHeightMode(v: unknown): ClientCardRowHeightMode {
  if (v === "stretch" || v === "pixels" || v === "auto") return v;
  return "auto";
}

function coerceSpan(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(48, Math.round(n));
}

function normalizeLayoutCell(raw: unknown): ClientCardLayoutCell | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const panelRaw = typeof o.panelId === "string" ? o.panelId : "";
  if (!isPanelId(panelRaw)) return null;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : newSlotId("cell");
  return {
    id,
    panelId: panelRaw,
    span: coerceSpan(o.span),
  };
}

function normalizeLayoutRow(raw: unknown): ClientCardLayoutRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : newSlotId("row");
  const heightMode = coerceHeightMode(o.heightMode ?? o.height_mode);
  const heightPxRaw = o.heightPx ?? o.height_px;
  const parsedPx =
    heightPxRaw != null && heightPxRaw !== ""
      ? (typeof heightPxRaw === "number" ? heightPxRaw : Number.parseFloat(String(heightPxRaw)))
      : NaN;

  let heightPx: number | null = null;
  if (heightMode === "pixels") {
    heightPx = Number.isFinite(parsedPx) ? Math.max(190, Math.round(parsedPx)) : 280;
  }

  let cellsUnknown: unknown[] = [];
  if (Array.isArray(o.cells)) cellsUnknown = o.cells;

  const cells = cellsUnknown.map(normalizeLayoutCell).filter((c): c is ClientCardLayoutCell => c !== null);
  if (cells.length === 0) return null;
  return {
    id,
    heightMode,
    heightPx,
    cells,
  };
}

function sanitizeRowDimensions(rows: ClientCardLayoutRow[]): ClientCardLayoutRow[] {
  return rows.map((row) => {
    const hm: ClientCardRowHeightMode =
      row.heightMode === "stretch" ? "stretch" : row.heightMode === "pixels" ? "pixels" : "auto";
    let hp: number | null = null;
    if (hm === "pixels") {
      hp =
        row.heightPx != null && Number.isFinite(row.heightPx) ? Math.max(190, Math.round(row.heightPx)) : 280;
    }
    return {
      ...row,
      heightMode: hm,
      heightPx: hp,
      cells: row.cells.map((c) => ({
        ...c,
        span: coerceSpan(c.span),
        heightPx: null,
      })),
    };
  });
}

/** Struttura valida: cellule uniche, id pannello ammessi, al massimo un ingresso per pannello nell’intero layout. */
function sanitizeLayoutStructure(rows: ClientCardLayoutRow[]): ClientCardLayoutRow[] | null {
  const flat = rows.flatMap((r) => r.cells);
  const seen = new Set<ClientCardPanelId>();
  for (const c of flat) {
    if (!(CLIENT_CARD_PANEL_IDS as readonly string[]).includes(c.panelId)) return null;
    if (seen.has(c.panelId)) return null;
    seen.add(c.panelId);
  }
  if (flat.length > CLIENT_CARD_PANEL_IDS.length) return null;
  return sanitizeRowDimensions(rows);
}

/**
 * Elimina dallo schema i moduli disattivati e aggiunge in coda gli abilitati mancanti
 * (nuova cella in fondo all’ultima riga, oppure griglia impilata se non c’è ancora layout).
 */
function reconcileLayoutWithModules(layoutRows: ClientCardLayoutRow[], m: ClientCardModuleSettings): ClientCardLayoutRow[] {
  const visibleIds = CLIENT_CARD_PANEL_IDS.filter((pid) => clientCardPanelVisible(m, pid));

  let rows = pruneEmptyRows(
    layoutRows.map((row) => ({
      ...row,
      cells: row.cells.filter((c) => clientCardPanelVisible(m, c.panelId)),
    })),
  );

  const seen = new Set<ClientCardPanelId>();
  rows = pruneEmptyRows(
    rows.map((row) => ({
      ...row,
      cells: row.cells.filter((c) => {
        if (seen.has(c.panelId)) return false;
        seen.add(c.panelId);
        return true;
      }),
    })),
  );

  if (visibleIds.length === 0) {
    return [];
  }

  const present = new Set(rows.flatMap((r) => r.cells.map((c) => c.panelId)));
  const missing = visibleIds.filter((id) => !present.has(id));

  if (rows.length === 0) {
    return migratePanelOrderToLayoutRows(missing);
  }

  if (missing.length > 0) {
    const lastRow = rows[rows.length - 1]!;
    for (const panelId of missing) {
      lastRow.cells.push({
        id: newSlotId("cell"),
        panelId,
        span: 1,
      });
    }
  }

  return sanitizeRowDimensions(pruneEmptyRows(rows));
}

function pruneEmptyRows(rows: ClientCardLayoutRow[]): ClientCardLayoutRow[] {
  return rows.filter((r) => r.cells.length > 0);
}

export function normalizeClientCardLayoutRows(
  layoutRowsRaw: unknown,
  panelOrderFallback: ClientCardPanelId[],
): ClientCardLayoutRow[] {
  const panelOrderFb = panelOrderFallback.length ? panelOrderFallback : (FALLBACK_VERTICAL_ORDER as ClientCardPanelId[]);

  let rows: ClientCardLayoutRow[] = Array.isArray(layoutRowsRaw)
    ? layoutRowsRaw.map(normalizeLayoutRow).filter((r): r is ClientCardLayoutRow => r !== null)
    : [];
  rows = rows.filter((r) => r.cells.length > 0);

  if (rows.length === 0) return migratePanelOrderToLayoutRows(panelOrderFb);

  const ok = sanitizeLayoutStructure(rows);
  if (ok === null) return migratePanelOrderToLayoutRows(panelOrderFb);

  return ok;
}

export function normalizeClientCardModules(
  raw: Partial<ClientCardModuleSettings> | null | undefined,
): ClientCardModuleSettings {
  const base = DEFAULT_CLIENT_CARD_MODULES;
  if (!raw || typeof raw !== "object") {
    return {
      ...base,
      layoutRows: reconcileLayoutWithModules(base.layoutRows, base),
    };
  }

  const legacy = raw as Record<string, unknown>;
  const fbOrder = normalizeLegacyPanelOrder(legacy.panelOrder);
  const showMap = raw.showMap !== false;
  const showVpn = raw.showVpn !== false;
  const showRdp = raw.showRdp !== false;
  const showWeb = raw.showWeb !== false;
  const showPlanning = raw.showPlanning !== false;

  const flagsForReconcile: ClientCardModuleSettings = {
    showMap,
    showVpn,
    showRdp,
    showWeb,
    showPlanning,
    layoutRows: [],
  };

  let layoutRows = normalizeClientCardLayoutRows(
    legacy.layoutRows,
    fbOrder.length ? fbOrder : (FALLBACK_VERTICAL_ORDER as ClientCardPanelId[]),
  );
  layoutRows = reconcileLayoutWithModules(layoutRows, flagsForReconcile);

  return {
    showMap,
    showVpn,
    showRdp,
    showWeb,
    showPlanning,
    layoutRows,
  };
}

export function digestClientCardModules(raw: Partial<ClientCardModuleSettings> | null | undefined): string {
  return JSON.stringify(normalizeClientCardModules(raw));
}

export const CLIENT_CARD_VISIBILITY_KEY: Record<
  ClientCardPanelId,
  "showMap" | "showVpn" | "showRdp" | "showWeb" | "showPlanning"
> = {
  map: "showMap",
  vpn: "showVpn",
  rdp: "showRdp",
  web: "showWeb",
  planning: "showPlanning",
};

export const CLIENT_CARD_PANEL_LABELS: Record<ClientCardPanelId, { title: string; hint: string }> = {
  map: { title: "Mappa sede", hint: "Anteprima mappa in base alla località del cliente" },
  vpn: { title: "Rete VPN", hint: "Elenco e gestione VPN del cliente" },
  rdp: { title: "Connessioni RDP", hint: "Tabella connessioni desktop" },
  web: { title: "Accessi Web / CRM", hint: "Tabella accessi HTTPS" },
  planning: {
    title: "Pianificazione (anteprima)",
    hint: "Riepilogo tramite campi catalogo Cliente",
  },
};
