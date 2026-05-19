import type { Client } from "@/types";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

type Props = {
  clients: Client[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function ClientList({ clients, selectedId, onSelect }: Props) {
  if (clients.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-violet-300/60 bg-white/40 px-2 py-3 text-center text-xs text-slate-500 dark:border-violet-500/30 dark:bg-slate-950/25 dark:text-slate-400">
        Nessun cliente corrispondente alla ricerca.
      </div>
    );
  }

  return (
    <ul className="flex min-w-0 flex-col gap-0.5" role="list">
      {clients.map((c) => {
        const selected = selectedId === c.id;

        return (
          <li key={c.id} className="min-w-0">
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                "group flex w-full min-w-0 max-w-full items-start gap-1.5 rounded-lg border border-transparent px-1 py-1 text-left text-sm outline-none ring-offset-2 transition-[margin,background-color,color,padding] duration-200 ease-out focus-visible:z-[1] focus-visible:ring-2 focus-visible:ring-violet-500/50 dark:ring-offset-slate-950 dark:focus-visible:ring-violet-400/60",
                selected
                  ? "ml-2.5 bg-violet-200/95 py-1.5 pl-2 pr-1.5 text-violet-950 shadow-sm dark:bg-violet-600/55 dark:text-violet-50 dark:shadow-black/25"
                  : "hover:bg-white/65 dark:hover:bg-white/5",
              )}
              aria-current={selected ? "true" : undefined}
            >
              <div className="min-w-0 flex-1 leading-snug">
                <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0">
                  <span
                    className={cn(
                      "min-w-0 break-words font-medium text-slate-900 dark:text-slate-100",
                      selected &&
                        !c.obsolete &&
                        "font-semibold text-violet-900 dark:text-violet-50",
                      selected &&
                        c.obsolete &&
                        "text-violet-800 line-through decoration-violet-500/65 dark:text-violet-100 dark:decoration-violet-300/50",
                      !selected &&
                        c.obsolete &&
                        "text-slate-500 line-through decoration-slate-400 dark:text-slate-400 dark:decoration-slate-500",
                    )}
                  >
                    {c.name}
                  </span>
                  {c.obsolete ? (
                    <span className="inline-flex shrink-0 rounded bg-slate-200/90 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-600/80 dark:text-slate-400">
                      Obs.
                    </span>
                  ) : null}
                </div>
              </div>
              <ChevronRight
                size={14}
                strokeWidth={2.25}
                className={cn(
                  "mt-0.5 shrink-0 transition-[transform,opacity,color]",
                  selected
                    ? "text-violet-600 opacity-90 dark:text-violet-300"
                    : "text-slate-400 opacity-50 group-hover:translate-x-0.5 group-hover:opacity-80 dark:text-slate-500",
                )}
                aria-hidden
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
