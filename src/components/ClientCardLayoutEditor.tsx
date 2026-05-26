import type { Dispatch, SetStateAction } from "react";

import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import type {
  ClientCardLayoutCell,
  ClientCardLayoutRow,
  ClientCardModuleSettings,
  ClientCardRowHeightMode,
} from "@/types";

import {
  CLIENT_CARD_PANEL_LABELS,
  defaultClientCardLayoutRows,
  newClientCardLayoutId,
  normalizeClientCardModules,
  presetClientCardLayoutTop3Bottom2,
  presetClientCardLayoutTwoThree,
} from "@/lib/clientCardModules";

import { cn } from "@/lib/utils";

const ROWS_CONTAINER_ID = "client-card-layout-rows";

const tailDropId = (rowId: string) => `client-card-tail:${rowId}`;

const cellContainerId = (rowId: string) => `client-card-row:${rowId}`;

function cloneRows(rows: ClientCardLayoutRow[]): ClientCardLayoutRow[] {
  return rows.map((r) => ({
    ...r,
    cells: r.cells.map((c) => ({ ...c })),
  }));
}

function locateCell(rows: ClientCardLayoutRow[], cellId: string): { ri: number; ci: number } | null {
  for (let ri = 0; ri < rows.length; ri++) {
    const ci = rows[ri]!.cells.findIndex((c) => c.id === cellId);
    if (ci >= 0) return { ri, ci };
  }
  return null;
}

function pruneEmptyRows(rows: ClientCardLayoutRow[]): ClientCardLayoutRow[] {
  return rows.filter((r) => r.cells.length > 0);
}

function moveCellToRowAppend(rows: ClientCardLayoutRow[], cellId: string, destRowId: string): ClientCardLayoutRow[] {
  const next = pruneEmptyRows(cloneRows(rows));
  const src = locateCell(next, cellId);
  if (!src) return next;
  const destRi = next.findIndex((r) => r.id === destRowId);
  if (destRi < 0) return next;
  const cell = next[src.ri]!.cells[src.ci]!;
  next[src.ri]!.cells.splice(src.ci, 1);
  next[destRi]!.cells.push(cell);
  return pruneEmptyRows(next);
}

function moveCellBefore(
  rows: ClientCardLayoutRow[],
  cellId: string,
  destRowId: string,
  beforeCellId: string | null,
): ClientCardLayoutRow[] {
  const next = pruneEmptyRows(cloneRows(rows));
  const src = locateCell(next, cellId);
  if (!src) return next;
  const cell = next[src.ri]!.cells[src.ci]!;
  next[src.ri]!.cells.splice(src.ci, 1);

  const destRi = next.findIndex((r) => r.id === destRowId);
  if (destRi < 0) {
    next[src.ri]!.cells.splice(src.ci, 0, cell);
    return pruneEmptyRows(next);
  }

  const destCells = next[destRi]!.cells;
  let insertIdx = destCells.length;
  if (beforeCellId) {
    const j = destCells.findIndex((c) => c.id === beforeCellId);
    if (j >= 0) insertIdx = j;
  }
  destCells.splice(insertIdx, 0, cell);
  return pruneEmptyRows(next);
}

function mergeRowsDown(rows: ClientCardLayoutRow[], rowIndex: number): ClientCardLayoutRow[] | null {
  if (rowIndex < 0 || rowIndex >= rows.length - 1) return null;
  const next = cloneRows(rows);
  const bottom = next[rowIndex + 1]!;
  next[rowIndex]!.cells.push(...bottom.cells);
  next.splice(rowIndex + 1, 1);
  return pruneEmptyRows(next);
}

function splitRowAfterCell(rows: ClientCardLayoutRow[], rowIndex: number, cellIndex: number): ClientCardLayoutRow[] | null {
  const row = rows[rowIndex];
  if (!row) return null;
  if (row.cells.length < 2) return null;
  if (cellIndex < 0 || cellIndex >= row.cells.length - 1) return null;
  const next = cloneRows(rows);
  const r = next[rowIndex]!;
  const moved = r.cells.splice(cellIndex + 1);
  const newRow: ClientCardLayoutRow = {
    id: newClientCardLayoutId("row"),
    heightMode: "auto",
    heightPx: null,
    cells: moved,
  };
  next.splice(rowIndex + 1, 0, newRow);
  return pruneEmptyRows(next);
}

type LayoutPresetKey = "column" | "top3bottom2" | "twoThree";

function applyPresetRows(key: LayoutPresetKey): ClientCardLayoutRow[] {
  switch (key) {
    case "column":
      return defaultClientCardLayoutRows();
    case "top3bottom2":
      return presetClientCardLayoutTop3Bottom2();
    case "twoThree":
      return presetClientCardLayoutTwoThree();
    default:
      return defaultClientCardLayoutRows();
  }
}

function coerceSpanInput(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const rounded = Math.round(n);
  return Math.min(48, Math.max(1, rounded));
}

function RowTailDropZone({ rowId }: { rowId: string }) {
  const id = tailDropId(rowId);
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { kind: "row-tail", rowId },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[52px] min-w-[18px] shrink-0 rounded-lg border border-dashed transition-colors",
        isOver
          ? "border-emerald-500/80 bg-emerald-500/15"
          : "border-transparent bg-slate-100/40 hover:border-slate-300/70 dark:bg-slate-950/35 dark:hover:border-slate-600/80",
      )}
      title="Rilascia qui per aggiungere il modulo in coda alla riga"
    />
  );
}

function SortableCellCard(props: {
  cell: ClientCardLayoutCell;
  row: ClientCardLayoutRow;
  rowIndex: number;
  cellIndex: number;
  rows: ClientCardLayoutRow[];
  setLayoutRows: (rows: ClientCardLayoutRow[]) => void;
}) {
  const { cell, row, rowIndex, cellIndex, rows, setLayoutRows } = props;
  const meta = CLIENT_CARD_PANEL_LABELS[cell.panelId];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cell.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const patchRows = (next: ClientCardLayoutRow[]) => setLayoutRows(pruneEmptyRows(cloneRows(next)));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex min-w-[180px] flex-1 flex-col gap-2 rounded-xl border bg-white/95 px-3 py-2.5 shadow-sm dark:bg-slate-950/80",
        isDragging
          ? "border-violet-400/90 opacity-90 ring-2 ring-violet-400/50 dark:border-violet-600"
          : "border-slate-200 dark:border-slate-600",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 flex shrink-0 cursor-grab touch-none flex-col justify-center rounded border border-transparent px-0.5 text-slate-400 hover:text-slate-600 active:cursor-grabbing dark:text-slate-500 dark:hover:text-slate-300"
          title="Trascina per spostare nella riga o su un’altra riga"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={18} strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{meta.title}</div>
          <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{meta.hint}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Larghezza (span)
          <input
            type="number"
            min={1}
            max={48}
            value={cell.span}
            onChange={(e) => {
              const span = coerceSpanInput(Number.parseInt(e.target.value, 10));
              patchRows(
                rows.map((r, i) =>
                  i === rowIndex
                    ? {
                        ...r,
                        cells: r.cells.map((c) => (c.id === cell.id ? { ...c, span } : c)),
                      }
                    : r,
                ),
              );
            }}
            className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
        </label>

        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Sposta su riga
          <select
            className="min-w-[9rem] rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
            value=""
            onChange={(e) => {
              const destId = e.target.value;
              e.target.value = "";
              if (!destId || destId === row.id) return;
              patchRows(moveCellToRowAppend(rows, cell.id, destId));
            }}
          >
            <option value="">—</option>
            {rows.map((r, i) => (
              <option key={r.id} value={r.id}>
                Riga {i + 1}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex flex-wrap gap-1">
          <button
            type="button"
            title="Sposta a sinistra nella riga"
            disabled={cellIndex <= 0}
            onClick={() => {
              if (cellIndex <= 0) return;
              patchRows(
                rows.map((r, i) =>
                  i === rowIndex ? { ...r, cells: arrayMove(r.cells, cellIndex, cellIndex - 1) } : r,
                ),
              );
            }}
            className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            ←
          </button>
          <button
            type="button"
            title="Sposta a destra nella riga"
            disabled={cellIndex >= row.cells.length - 1}
            onClick={() => {
              if (cellIndex >= row.cells.length - 1) return;
              patchRows(
                rows.map((r, i) =>
                  i === rowIndex ? { ...r, cells: arrayMove(r.cells, cellIndex, cellIndex + 1) } : r,
                ),
              );
            }}
            className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            →
          </button>
          <button
            type="button"
            title="Nuova riga sotto a partire dai moduli a destra"
            disabled={row.cells.length < 2 || cellIndex >= row.cells.length - 1}
            onClick={() => {
              const next = splitRowAfterCell(rows, rowIndex, cellIndex);
              if (next) patchRows(next);
            }}
            className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Dividi riga
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableLayoutRow(props: {
  row: ClientCardLayoutRow;
  rowIndex: number;
  rows: ClientCardLayoutRow[];
  setLayoutRows: (rows: ClientCardLayoutRow[]) => void;
}) {
  const { row, rowIndex, rows, setLayoutRows } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const patchRows = (next: ClientCardLayoutRow[]) => props.setLayoutRows(pruneEmptyRows(cloneRows(next)));

  const moveRow = (dir: -1 | 1) => {
    const j = rowIndex + dir;
    if (j < 0 || j >= rows.length) return;
    patchRows(arrayMove(rows, rowIndex, j));
  };

  const onHeightMode = (heightMode: ClientCardRowHeightMode) => {
    patchRows(
      rows.map((r, i) => {
        if (i !== rowIndex) return r;
        if (heightMode === "pixels") {
          const px = r.heightPx != null && Number.isFinite(r.heightPx) ? Math.max(190, Math.round(r.heightPx)) : 280;
          return { ...r, heightMode, heightPx: px };
        }
        return { ...r, heightMode, heightPx: null };
      }),
    );
  };

  const onHeightPx = (raw: string) => {
    const n = Number.parseInt(raw, 10);
    const px = Number.isFinite(n) ? Math.max(190, n) : 280;
    patchRows(
      rows.map((r, i) => (i === rowIndex ? { ...r, heightMode: "pixels" as const, heightPx: px } : r)),
    );
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/40",
        isDragging && "opacity-90 ring-2 ring-violet-400/50",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="flex cursor-grab touch-none items-center gap-1 rounded border border-transparent px-1 text-slate-400 hover:text-slate-600 active:cursor-grabbing dark:text-slate-500"
          title="Trascina per riordinare le righe"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={20} strokeWidth={2} />
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Riga {rowIndex + 1}</span>
        </button>

        <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
          Altezza
          <select
            value={row.heightMode}
            onChange={(e) => onHeightMode(e.target.value as ClientCardRowHeightMode)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="auto">Contenuto</option>
            <option value="stretch">Riempi spazio verticale</option>
            <option value="pixels">Fissa (px)</option>
          </select>
        </label>

        {row.heightMode === "pixels" ? (
          <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
            px
            <input
              type="number"
              min={190}
              step={10}
              value={row.heightPx ?? 280}
              onChange={(e) => onHeightPx(e.target.value)}
              className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
        ) : null}

        <div className="ml-auto flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => moveRow(-1)}
            disabled={rowIndex <= 0}
            className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Riga su
          </button>
          <button
            type="button"
            onClick={() => moveRow(1)}
            disabled={rowIndex >= rows.length - 1}
            className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Riga giù
          </button>
          <button
            type="button"
            title="Unisci la riga successiva in questa riga"
            disabled={rowIndex >= rows.length - 1}
            onClick={() => {
              const next = mergeRowsDown(rows, rowIndex);
              if (next) patchRows(next);
            }}
            className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Unisci sotto
          </button>
        </div>
      </div>

      <div className="flex min-h-[56px] flex-wrap items-stretch gap-2">
        <SortableContext id={cellContainerId(row.id)} items={row.cells.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
          {row.cells.map((cell, ci) => (
            <SortableCellCard
              key={cell.id}
              cell={cell}
              row={row}
              rowIndex={rowIndex}
              cellIndex={ci}
              rows={rows}
              setLayoutRows={setLayoutRows}
            />
          ))}
        </SortableContext>
        <RowTailDropZone rowId={row.id} />
      </div>
    </div>
  );
}

type Props = {
  modules: ClientCardModuleSettings;
  setModules: Dispatch<SetStateAction<ClientCardModuleSettings>>;
};

export function ClientCardLayoutEditor({ modules, setModules }: Props) {
  const base = normalizeClientCardModules(modules);
  const rows = base.layoutRows;

  const setLayoutRows = (layoutRows: ClientCardLayoutRow[]) => {
    setModules((prev) =>
      normalizeClientCardModules({
        ...normalizeClientCardModules(prev),
        layoutRows,
      }),
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const rowIds = rows.map((r) => r.id);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const aid = String(active.id);
    const oid = String(over.id);

    const activeContainer = active.data.current?.sortable?.containerId as string | undefined;

    if (activeContainer === ROWS_CONTAINER_ID || rowIds.includes(aid)) {
      const oldIndex = rows.findIndex((r) => r.id === aid);
      const newIndex = rows.findIndex((r) => r.id === oid);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      setLayoutRows(arrayMove(rows, oldIndex, newIndex));
      return;
    }

    const src = locateCell(rows, aid);
    if (!src) return;

    if (oid.startsWith("client-card-tail:")) {
      const destRowId = oid.slice("client-card-tail:".length);
      setLayoutRows(moveCellToRowAppend(rows, aid, destRowId));
      return;
    }

    const dest = locateCell(rows, oid);
    if (!dest) return;

    if (src.ri === dest.ri) {
      const oldIndex = src.ci;
      const newIndex = dest.ci;
      if (oldIndex === newIndex) return;
      setLayoutRows(
        rows.map((row, i) =>
          i === src.ri ? { ...row, cells: arrayMove(row.cells, oldIndex, newIndex) } : row,
        ),
      );
      return;
    }

    setLayoutRows(moveCellBefore(rows, aid, rows[dest.ri]!.id, oid));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Modello</label>
        <select
          className="min-w-[14rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          value=""
          onChange={(e) => {
            const v = e.target.value as LayoutPresetKey | "";
            e.target.value = "";
            if (!v) return;
            setLayoutRows(applyPresetRows(v));
          }}
        >
          <option value="">Applica modello…</option>
          <option value="column">Colonna (uno sotto l&apos;altro)</option>
          <option value="top3bottom2">3 moduli sopra — 2 sotto</option>
          <option value="twoThree">2 sopra — 3 sotto</option>
        </select>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
            Abilita almeno un modulo sopra per comporre la griglia della scheda cliente.
          </p>
        ) : (
          <SortableContext id={ROWS_CONTAINER_ID} items={rowIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {rows.map((row, ri) => (
                <SortableLayoutRow
                  key={row.id}
                  row={row}
                  rowIndex={ri}
                  rows={rows}
                  setLayoutRows={setLayoutRows}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </DndContext>
    </div>
  );
}
