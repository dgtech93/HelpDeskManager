import type { ReactNode } from "react";
import { useEffect } from "react";
import { Copy, ExternalLink, KeyRound, Pencil, Trash2, X } from "lucide-react";
import type { AppSettings, RdpConnection, WebAccess } from "@/types";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { formatConnectionMatrixLine } from "@/lib/presetCatalog";
import { toast } from "sonner";
import { copyTextWithClear } from "@/lib/utils";
import { rdpDomainUserDisplay } from "@/lib/rdpDisplay";

function DetailRow({
  label,
  value,
  mono,
  onCopy,
  copyDisabled,
  copyTitle,
  hideCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => Promise<void>;
  copyDisabled?: boolean;
  copyTitle?: string;
  hideCopy?: boolean;
}) {
  const empty = !value.trim();
  const display = empty ? "—" : value;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-slate-100 py-2 last:border-b-0 dark:border-slate-700/80">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </div>
        <div
          className={`break-words pt-0.5 text-sm leading-snug text-slate-900 dark:text-slate-100 ${mono ? "font-mono text-[13px]" : ""}`}
        >
          {display}
        </div>
      </div>
      {!hideCopy && onCopy ? (
        <button
          type="button"
          disabled={copyDisabled ?? empty}
          title={copyTitle ?? `Copia ${label}`}
          onClick={() =>
            void onCopy().catch((e) => {
              toast.error(formatErr(e));
            })
          }
          className="mt-5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Copy size={14} aria-hidden />
        </button>
      ) : (
        <div className="w-8 shrink-0" aria-hidden />
      )}
    </div>
  );
}

function PasswordDetailRow({
  recordId,
  secretsLocked,
  kind,
}: {
  recordId: string;
  secretsLocked?: boolean;
  kind: "rdp" | "web";
}) {
  const copyPw = async () => {
    if (kind === "rdp") await api.copyRdpField(recordId, "password");
    else await api.copyWebField(recordId, "password");
    toast.success("Password copiata");
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-slate-100 py-2 last:border-b-0 dark:border-slate-700/80">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Password
        </div>
        <div className="flex items-center gap-2 pt-0.5 font-mono text-sm text-slate-900 dark:text-slate-100">
          <KeyRound size={14} className="shrink-0 text-slate-400" aria-hidden />
          ••••••••
        </div>
      </div>
      <button
        type="button"
        disabled={secretsLocked}
        title={
          secretsLocked
            ? "Sblocca la protezione credenziali per copiare la password"
            : "Copia password"
        }
        onClick={() =>
          void copyPw().catch((e) => {
            toast.error(formatErr(e));
          })
        }
        className="mt-5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Copy size={14} aria-hidden />
      </button>
    </div>
  );
}

type ShellProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
};

function DialogShell({ open, title, subtitle, onClose, children, footer }: ShellProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-detail-title"
        className="max-h-[min(90vh,640px)] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-700/80">
          <div className="min-w-0">
            <h2 id="connection-detail-title" className="truncate text-lg font-semibold text-slate-900 dark:text-slate-50">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Chiudi"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="max-h-[min(60vh,420px)] overflow-y-auto px-4 py-2">{children}</div>
        <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-700/80">{footer}</div>
      </div>
    </div>
  );
}

export function RdpConnectionDetailDialog({
  open,
  r,
  catalog,
  secretsLocked,
  onClose,
  onEdit,
  onDelete,
}: {
  open: boolean;
  r: RdpConnection | null;
  catalog?: Pick<AppSettings, "environments" | "versionOptions" | "releaseOptions"> | null;
  secretsLocked?: boolean;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!r) return null;

  const catalogSlice = catalog ?? null;

  const accountDisplay = rdpDomainUserDisplay(r.domain, r.username);
  const showPortRow = r.port !== 3389;

  const deps =
    catalogSlice != null
      ? (r.environmentDeployments ?? []).filter((d) => (d.environmentId ?? "").trim())
      : [];
  const voMeta =
    catalogSlice && r.versionOptionId
      ? catalogSlice.versionOptions.find((v) => v.id === r.versionOptionId)
      : undefined;
  const versionProductLabel =
    (voMeta?.value ?? "").trim() || (r.version ?? "").trim() || "";

  const matrixSummary = catalogSlice
    ? formatConnectionMatrixLine(
        {
          environmentId: r.environmentId,
          environmentDeployments: r.environmentDeployments ?? [],
          versionOptionId: r.versionOptionId,
          releaseOptionId: r.releaseOptionId,
          version: r.version,
        },
        catalogSlice,
      ).trim()
    : "";

  const showCatalogSection =
    Boolean(catalogSlice) &&
    (matrixSummary.length > 0 ||
      deps.length > 0 ||
      (r.environmentId ?? "").trim().length > 0 ||
      versionProductLabel.length > 0);

  const launch = async () => {
    try {
      await api.launchRdp(r.id);
      toast.success("Sessione RDP avviata");
      onClose();
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  return (
    <DialogShell
      open={open}
      title={r.name}
      subtitle="Connessione RDP"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={launch}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-emerald-700"
          >
            <ExternalLink size={14} aria-hidden /> Apri
          </button>
          <button
            type="button"
            onClick={() => {
              onEdit(r.id);
              onClose();
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            <Pencil size={14} aria-hidden /> Modifica
          </button>
          <button
            type="button"
            onClick={() => {
              onDelete(r.id);
              onClose();
            }}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
          >
            <Trash2 size={14} aria-hidden /> Elimina
          </button>
        </div>
      }
    >
      <DetailRow
        label="Host"
        value={r.host}
        mono
        onCopy={async () => {
          await copyTextWithClear(r.host);
          toast.success("Host copiato");
        }}
      />
      {showPortRow ? (
        <DetailRow
          label="Porta"
          value={String(r.port)}
          mono
          onCopy={async () => {
            await copyTextWithClear(String(r.port));
            toast.success("Porta copiata");
          }}
        />
      ) : null}
      <DetailRow
        label="Dominio \\ utente"
        value={accountDisplay}
        mono
        hideCopy={!accountDisplay}
        onCopy={async () => {
          await copyTextWithClear(accountDisplay);
          toast.success("Account copiato");
        }}
      />
      <PasswordDetailRow recordId={r.id} secretsLocked={secretsLocked} kind="rdp" />
      {catalogSlice && showCatalogSection ? (
        deps.length > 1 ? (
          <div className="border-b border-slate-100 py-3 last:border-b-0 dark:border-slate-700/80">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Stesso host · ambienti
            </div>
            {versionProductLabel ? (
              <p className="mt-1.5 text-xs leading-snug text-slate-700 dark:text-slate-200">
                Versione prodotto (uguale per tutti):{" "}
                <span className="font-semibold">{versionProductLabel}</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Nessuna versione catalogo sulla riga
              </p>
            )}
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[260px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400">
                    <th className="px-2 py-1.5 text-left font-semibold">Ambiente</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Release</th>
                  </tr>
                </thead>
                <tbody>
                  {deps.map((d, i) => {
                    const eid = (d.environmentId ?? "").trim();
                    const envLabel =
                      catalogSlice.environments.find((e) => e.id === eid)?.name?.trim() ||
                      eid ||
                      "—";
                    const rid = (d.releaseOptionId ?? "").trim();
                    const relLabel =
                      rid && catalogSlice.releaseOptions
                        ? catalogSlice.releaseOptions.find((ro) => ro.id === rid)?.name?.trim() ||
                          rid
                        : "";
                    return (
                      <tr
                        key={`${eid}-${rid}-${String(i)}`}
                        className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                      >
                        <td className="px-2 py-1.5 text-slate-900 dark:text-slate-100">{envLabel}</td>
                        <td className="px-2 py-1.5 text-slate-800 dark:text-slate-200">
                          {relLabel || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : matrixSummary ? (
          <DetailRow
            label="Ambiente · versione · release"
            value={matrixSummary}
            onCopy={async () => {
              await copyTextWithClear(matrixSummary);
              toast.success("Riga catalogo copiata");
            }}
          />
        ) : null
      ) : null}
    </DialogShell>
  );
}

export function WebAccessDetailDialog({
  open,
  w,
  secretsLocked,
  onClose,
  onEdit,
  onDelete,
}: {
  open: boolean;
  w: WebAccess | null;
  secretsLocked?: boolean;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!w) return null;

  const accountDisplay = rdpDomainUserDisplay(w.domain, w.username);

  const openBrowser = async () => {
    try {
      await api.launchWebAccess(w.id);
      toast.success("Browser avviato");
      onClose();
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  return (
    <DialogShell
      open={open}
      title={w.name}
      subtitle="Accesso web / CRM"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openBrowser}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-indigo-700"
          >
            <ExternalLink size={14} aria-hidden /> Browser
          </button>
          <button
            type="button"
            onClick={() => {
              onEdit(w.id);
              onClose();
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            <Pencil size={14} aria-hidden /> Modifica
          </button>
          <button
            type="button"
            onClick={() => {
              onDelete(w.id);
              onClose();
            }}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
          >
            <Trash2 size={14} aria-hidden /> Elimina
          </button>
        </div>
      }
    >
      <DetailRow
        label="URL"
        value={w.url}
        mono
        onCopy={async () => {
          await api.copyWebField(w.id, "url");
          toast.success("URL copiato");
        }}
      />
      <DetailRow
        label="Dominio \\ utente"
        value={accountDisplay}
        mono
        hideCopy={!accountDisplay}
        onCopy={async () => {
          await copyTextWithClear(accountDisplay);
          toast.success("Account copiato");
        }}
      />
      <PasswordDetailRow recordId={w.id} secretsLocked={secretsLocked} kind="web" />
      {w.notes?.trim() ? (
        <DetailRow
          label="Note"
          value={w.notes.trim()}
          onCopy={async () => {
            await copyTextWithClear(w.notes ?? "");
            toast.success("Note copiate");
          }}
        />
      ) : null}
    </DialogShell>
  );
}
