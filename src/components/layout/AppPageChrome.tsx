import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AppPageAccent =
  | "teal"
  | "indigo"
  | "violet"
  | "emerald"
  | "sky"
  | "slate"
  | "amber"
  | "rose";

const ACCENT_ICON_BOX: Record<AppPageAccent, string> = {
  teal: "bg-gradient-to-br from-teal-600 to-emerald-600 shadow-lg shadow-teal-600/25 dark:shadow-teal-900/40",
  indigo: "bg-gradient-to-br from-indigo-600 to-violet-600 shadow-lg shadow-indigo-600/25 dark:shadow-indigo-900/40",
  violet: "bg-gradient-to-br from-violet-600 to-purple-600 shadow-lg shadow-violet-600/25 dark:shadow-violet-900/40",
  emerald: "bg-gradient-to-br from-emerald-600 to-teal-600 shadow-lg shadow-emerald-600/25 dark:shadow-emerald-900/40",
  sky: "bg-gradient-to-br from-sky-600 to-blue-600 shadow-lg shadow-sky-600/25 dark:shadow-sky-900/40",
  slate: "bg-gradient-to-br from-slate-600 to-slate-700 shadow-lg shadow-slate-600/25 dark:shadow-slate-900/40",
  amber: "bg-gradient-to-br from-amber-600 to-orange-600 shadow-lg shadow-amber-600/25 dark:shadow-amber-900/40",
  rose: "bg-gradient-to-br from-rose-600 to-orange-600 shadow-lg shadow-rose-600/25 dark:shadow-rose-900/40",
};

export function AppPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-8", className)}>
      {children}
    </div>
  );
}

export function AppPageHeader(props: {
  icon: LucideIcon;
  iconSize?: number;
  strokeWidth?: number;
  accent?: AppPageAccent;
  title: string;
  description?: ReactNode;
  headerRight?: ReactNode;
  className?: string;
}) {
  const {
    icon: Icon,
    iconSize = 28,
    strokeWidth = 1.75,
    accent = "teal",
    title,
    description,
    headerRight,
    className,
  } = props;

  return (
    <div className={cn("flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex min-w-0 flex-1 gap-4">
        <div
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white",
            ACCENT_ICON_BOX[accent],
          )}
        >
          <Icon size={iconSize} strokeWidth={strokeWidth} aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 md:text-3xl">
            {title}
          </h1>
          {description != null ? (
            <div className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {description}
            </div>
          ) : null}
        </div>
      </div>
      {headerRight != null ? <div className="flex shrink-0 flex-wrap gap-2">{headerRight}</div> : null}
    </div>
  );
}

export function AppPageSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-300/55 bg-neutral-50/95 p-5 shadow-md shadow-slate-500/[0.08] ring-1 ring-slate-400/25 dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-xl dark:ring-white/[0.06] md:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Stat pill usata negli header tipo Collaboratori / Rubrica (conteggi in alto a destra). */
export function AppPageStatPill(props: { label: string; value: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-300/55 bg-neutral-50/98 px-4 py-2.5 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/80",
        props.className,
      )}
    >
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {props.label}
      </div>
      <div className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
        {props.value}
      </div>
    </div>
  );
}
