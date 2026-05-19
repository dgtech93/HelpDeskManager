import { APP_AUTHOR, APP_SUPPORT_EMAIL, APP_VERSION } from "@/lib/appInfo";

export function SettingsAboutSection() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        <p className="font-semibold text-slate-900 dark:text-slate-50">
          Prodotto indipendente sviluppato da {APP_AUTHOR}:
        </p>
        <p>
          Contattare supporto alla mail{" "}
          <a
            href={`mailto:${APP_SUPPORT_EMAIL}`}
            className="font-medium text-sky-700 underline decoration-sky-700/30 underline-offset-2 hover:text-sky-800 dark:text-sky-400 dark:decoration-sky-400/40 dark:hover:text-sky-300"
          >
            {APP_SUPPORT_EMAIL}
          </a>
          .
        </p>
        <p>
          Questa applicazione non è utilizzata ai fini commerciali ma ad uso esclusivo personale.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200/90 bg-white/80 px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Versione prodotto:{" "}
          <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {APP_VERSION}
          </span>
        </p>
      </div>
    </div>
  );
}
