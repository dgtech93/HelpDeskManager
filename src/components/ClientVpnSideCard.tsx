import type { ReactNode } from "react";
import type { VpnConnection } from "@/types";
import { Copy, KeyRound, Pencil, Play, Plus, Shield, Trash2, User } from "lucide-react";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import { copyTextWithClear } from "@/lib/utils";

/** Testo “server” utile in connessione: host o profilo Windows, ecc. */
function serverDisplay(v: VpnConnection): string {
  const t = v.type.toLowerCase();
  if (t.includes("windows")) {
    const p = v.configPath?.trim();
    return (p || v.server?.trim() || "").trim() || "—";
  }
  return v.server?.trim() || "—";
}

function serverCopyText(v: VpnConnection): string {
  const disp = serverDisplay(v);
  return disp === "—" ? "" : disp;
}

function LaunchVpnToolbarButton({
  onClick,
  label = "Avvia VPN",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-emerald-400/70 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 px-3.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm shadow-emerald-600/30 outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400/40 active:scale-[0.98] dark:border-emerald-500/40 dark:from-emerald-600 dark:via-teal-600 dark:to-cyan-700 dark:shadow-emerald-900/35"
    >
      <Play size={15} className="fill-white text-white" aria-hidden />
      {label}
    </button>
  );
}

function launch(vpnId: string) {
  void api
    .launchVpn(vpnId)
    .then(() => toast.success("Comando VPN inviato"))
    .catch((e) => toast.error(formatErr(e)));
}

function CopyCell({
  title,
  onCopy,
  disabled,
  children,
}: {
  title: string;
  onCopy: () => Promise<void>;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={() =>
        void onCopy().catch((e) => {
          toast.error(formatErr(e));
        })
      }
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}

function FieldCopyRow({
  label,
  value,
  copyText,
  toastDone,
  hideCopyButton,
}: {
  label: string;
  value: ReactNode;
  copyText: string;
  toastDone: string;
  hideCopyButton?: boolean;
}) {
  const empty =
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "");

  const doCopy = async () => {
    await copyTextWithClear(copyText);
    toast.success(toastDone);
  };

  return (
    <div className="grid grid-cols-[1fr_2rem] items-start gap-x-2 border-b border-slate-100/90 py-1.5 last:border-b-0 dark:border-slate-700/70">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </div>
        <div className="break-words pt-0.5 font-mono text-[13px] leading-snug text-slate-800 dark:text-slate-200">
          {empty ? "—" : value}
        </div>
      </div>
      <div className="flex h-[calc(100%-0.125rem)] min-h-[2.25rem] w-9 shrink-0 items-center justify-end self-stretch">
        {!hideCopyButton ? (
          <CopyCell title={`Copia ${label}`} onCopy={doCopy}>
            <Copy size={15} aria-hidden />
          </CopyCell>
        ) : null}
      </div>
    </div>
  );
}

function PasswordFieldRow({
  vpnId,
  secretsLocked,
}: {
  vpnId: string;
  secretsLocked?: boolean;
}) {
  const copyPw = async () => {
    await api.copyVpnField(vpnId, "password");
    toast.success("Password copiata");
  };

  return (
    <div className="grid grid-cols-[1fr_2rem] items-start gap-x-2 border-b border-slate-100/90 py-1.5 last:border-b-0 dark:border-slate-700/70">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Password
        </div>
        <div className="break-words pt-0.5 font-mono text-[13px] leading-snug text-slate-800 dark:text-slate-200">
          ••••••••
        </div>
      </div>
      <div className="flex h-[calc(100%-0.125rem)] min-h-[2.25rem] w-9 shrink-0 items-center justify-end self-stretch">
        <CopyCell
          title={
            secretsLocked ? "Sblocca la protezione credenziali per copiare la password" : "Copia password"
          }
          disabled={secretsLocked}
          onCopy={copyPw}
        >
          <KeyRound size={15} aria-hidden />
        </CopyCell>
      </div>
    </div>
  );
}

function UsernameFieldRow({ username }: { username: string | null }) {
  const userT = username?.trim() ?? "";
  const empty = !userT;

  const doCopy = async () => {
    await copyTextWithClear(userT);
    toast.success("Username copiato");
  };

  return (
    <div className="grid grid-cols-[1fr_2rem] items-start gap-x-2 border-b border-slate-100/90 py-1.5 last:border-b-0 dark:border-slate-700/70">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Username
        </div>
        <div className="break-words pt-0.5 font-mono text-[13px] leading-snug text-slate-800 dark:text-slate-200">
          {empty ? "—" : userT}
        </div>
      </div>
      <div className="flex h-[calc(100%-0.125rem)] min-h-[2.25rem] w-9 shrink-0 items-center justify-end self-stretch">
        {!empty ? (
          <CopyCell title="Copia username" onCopy={doCopy}>
            <User size={15} aria-hidden />
          </CopyCell>
        ) : null}
      </div>
    </div>
  );
}

type Props = {
  items: VpnConnection[];
  secretsLocked?: boolean;
  className?: string;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
};

export function ClientVpnSideCard({
  items,
  secretsLocked,
  className = "",
  onAdd,
  onEdit,
  onDelete,
}: Props) {
  const solo = items.length === 1;
  const only = solo ? items[0] : null;

  return (
    <div
      className={`relative flex w-full flex-col overflow-hidden rounded-2xl shadow-lg shadow-sky-900/[0.08] ring-1 ring-sky-300/55 dark:shadow-black/40 dark:ring-sky-500/35 ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_10%_-20%,rgba(56,189,248,0.22),transparent),radial-gradient(90%_60%_at_100%_50%,rgba(99,102,241,0.12),transparent)] dark:bg-[radial-gradient(120%_80%_at_10%_-20%,rgba(56,189,248,0.15),transparent),radial-gradient(90%_60%_at_100%_40%,rgba(99,102,241,0.1),transparent)]"
        aria-hidden
      />
      <div className="relative flex flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/93 backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-950/92">
        <div className="shrink-0 border-b border-slate-100/90 px-3 py-2 dark:border-slate-700/80">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 basis-[8rem] items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-600/25">
                <Shield size={18} strokeWidth={2.2} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-sky-700 dark:text-sky-300">
                  Connessioni VPN
                </p>
                <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-50">
                  {items.length === 0
                    ? "—"
                    : items.length === 1
                      ? items[0].name
                      : `${items.length} profili`}
                </p>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
              {solo && only ? (
                <LaunchVpnToolbarButton onClick={() => launch(only.id)} />
              ) : null}
              {items.length === 0 ? (
                <button
                  type="button"
                  onClick={onAdd}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-600 px-3 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400"
                >
                  <Plus size={14} strokeWidth={2.5} aria-hidden />
                  Nuova
                </button>
              ) : null}
              {solo && only ? (
                <>
                  <button
                    type="button"
                    title="Modifica"
                    onClick={() => onEdit(only.id)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Pencil size={17} aria-hidden />
                  </button>
                  <button
                    type="button"
                    title="Elimina"
                    onClick={() => onDelete(only.id)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 size={17} aria-hidden />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div
          className={
            items.length > 1
              ? "max-h-[min(40vh,280px)] space-y-2 overflow-y-auto px-3 py-2 pb-2"
              : "space-y-2 px-3 py-2 pb-2"
          }
        >
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-sky-200/80 bg-sky-50/50 px-3 py-4 text-center text-xs leading-relaxed text-slate-600 dark:border-sky-800/60 dark:bg-sky-950/25 dark:text-slate-400">
              Aggiungi una VPN con «Nuova».
            </p>
          ) : (
            items.map((v) => {
              const srv = serverDisplay(v);
              const srvCopy = serverCopyText(v);
              const notesT = v.notes?.trim() ?? "";

              return (
                <div
                  key={v.id}
                  className={`rounded-xl border border-slate-200/90 bg-slate-50/90 px-2 py-2 dark:border-slate-700 dark:bg-slate-900/65 ${solo ? "" : "ring-1 ring-slate-200/40 dark:ring-slate-700/50"}`}
                >
                  {!solo ? (
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2 dark:border-slate-700/70">
                      <span className="min-w-0 truncate text-[13px] font-bold text-slate-900 dark:text-slate-100">
                        {v.name}
                      </span>
                      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                        <LaunchVpnToolbarButton onClick={() => launch(v.id)} />
                        <button
                          type="button"
                          title="Modifica"
                          onClick={() => onEdit(v.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Pencil size={16} aria-hidden />
                        </button>
                        <button
                          type="button"
                          title="Elimina"
                          onClick={() => onDelete(v.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <FieldCopyRow label="Server" value={srv} copyText={srvCopy} toastDone="Server copiato" hideCopyButton={srv === "—"} />
                  <UsernameFieldRow username={v.username} />
                  <PasswordFieldRow vpnId={v.id} secretsLocked={secretsLocked} />
                  {notesT ? (
                    <FieldCopyRow label="Note" value={notesT} copyText={notesT} toastDone="Note copiate" />
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
