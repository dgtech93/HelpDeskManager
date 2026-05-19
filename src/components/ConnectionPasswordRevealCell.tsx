import { useCallback, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";

type Kind = "rdp" | "web";

export function ConnectionPasswordRevealCell({
  id,
  kind,
  hasPassword,
  secretsLocked,
  compact,
}: {
  id: string;
  kind: Kind;
  hasPassword: boolean;
  secretsLocked?: boolean;
  compact?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const [plain, setPlain] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPlain = useCallback(async () => {
    if (kind === "rdp") return api.revealRdpPassword(id);
    return api.revealWebPassword(id);
  }, [id, kind]);

  const onToggle = async () => {
    if (!hasPassword) return;
    if (secretsLocked) {
      toast.error("Sblocca la protezione credenziali per visualizzare la password");
      return;
    }
    if (shown) {
      setShown(false);
      return;
    }
    if (plain !== null) {
      setShown(true);
      return;
    }
    setLoading(true);
    try {
      const p = await fetchPlain();
      if (p == null || p === "") {
        toast.message("Nessuna password salvata");
        setPlain("");
      } else {
        setPlain(p);
        setShown(true);
      }
    } catch (e) {
      toast.error(formatErr(e));
    } finally {
      setLoading(false);
    }
  };

  if (!hasPassword) {
    return <span className="font-mono text-slate-500 dark:text-slate-400">—</span>;
  }

  const display = loading ? "…" : shown && plain ? plain : "••••••••";

  const iconSize = compact ? 14 : 16;

  return (
    <div
      className="flex min-w-0 items-center gap-1"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <span
        className={cn(
          "min-w-0 flex-1 font-mono text-[12px] text-slate-700 dark:text-slate-300",
          shown && plain ? "break-all pr-1" : "truncate",
        )}
        title={shown && plain ? plain : undefined}
      >
        {display}
      </span>
      <button
        type="button"
        disabled={loading}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 disabled:opacity-70 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800",
          compact ? "h-8 w-8" : "h-9 w-9",
          secretsLocked && "opacity-50",
        )}
        aria-label={shown ? "Nascondi password" : "Mostra password"}
        title="Mostra / nascondi password"
        onClick={() => void onToggle()}
      >
        {loading ? (
          <Loader2 size={iconSize} className="animate-spin" aria-hidden />
        ) : shown ? (
          <EyeOff size={iconSize} aria-hidden />
        ) : (
          <Eye size={iconSize} aria-hidden />
        )}
      </button>
    </div>
  );
}
