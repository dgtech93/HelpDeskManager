import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";
import * as api from "@/lib/api";
import { toast } from "sonner";
import { formatErr } from "@/lib/api";

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useAppStore((s) => s.theme);
  const setThemeStore = useAppStore((s) => s.setTheme);

  const toggle = async () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    setThemeStore(next);
    try {
      await api.updateSettings({ theme: next });
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300/50 bg-neutral-50 text-slate-700 shadow-sm transition hover:bg-neutral-100/95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
        className,
      )}
      aria-label="Tema"
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
