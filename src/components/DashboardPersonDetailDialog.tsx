import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { CONTACT_CALL_BUTTON_DETAIL_DIALOG_CLASS, CONTACT_MAIL_BUTTON_DETAIL_DIALOG_CLASS } from "@/lib/contactQuickActionButtonClasses";
import type { ClientContact, Collaborator } from "@/types";
import { ExternalLink, Mail, Phone, User, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";

export type DashboardPersonDetailSelection =
  | { kind: "collaborator"; person: Collaborator }
  | { kind: "contact"; person: ClientContact };

type Props = {
  detail: DashboardPersonDetailSelection | null;
  onClose: () => void;
};

function fullName(collab: Collaborator): string {
  return `${collab.firstName} ${collab.lastName}`.trim() || "—";
}

function fullNameContact(c: ClientContact): string {
  return `${c.firstName} ${c.lastName}`.trim() || "—";
}

async function openMail(email: string) {
  const e = email.trim();
  if (!e) return;
  try {
    if (api.isTauriRuntime()) await api.openContactMailto(e);
    else window.location.href = `mailto:${encodeURIComponent(e)}`;
  } catch (err) {
    toast.error(formatErr(err));
  }
}

async function dialNumber(number: string) {
  const n = number.trim();
  if (!n) return;
  try {
    if (api.isTauriRuntime()) await api.dialPhoneNumber(n);
    else window.location.href = `tel:${n.replace(/\s+/g, "")}`;
  } catch (err) {
    toast.error(formatErr(err));
  }
}

async function openLink(url: string) {
  const u = url.trim();
  if (!u) return;
  try {
    if (api.isTauriRuntime()) await api.openHttpsUrl(u);
    else window.open(u.includes("://") ? u : `https://${u}`, "_blank", "noopener,noreferrer");
  } catch (err) {
    toast.error(formatErr(err));
  }
}

function ActionRow({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: typeof Mail;
  label: string;
  value: string | null | undefined;
  children: ReactNode;
}) {
  const v = value?.trim();
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </div>
          {v ? (
            <div className="mt-0.5 break-all font-mono text-sm text-slate-800 dark:text-slate-100">{v}</div>
          ) : (
            <div className="mt-0.5 text-sm text-slate-400 dark:text-slate-500">Non indicato</div>
          )}
        </div>
      </div>
      {children ? <div className="mt-3 flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export function DashboardPersonDetailDialog({ detail, onClose }: Props) {
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, onClose]);

  if (!detail) return null;

  const isCollab = detail.kind === "collaborator";
  const name = isCollab ? fullName(detail.person) : fullNameContact(detail.person);
  const subtitle = isCollab
    ? detail.person.roleLabel?.trim() || "Collaboratore interno"
    : detail.person.role?.trim() || "Riferimento cliente";

  const email = isCollab ? detail.person.email : detail.person.email;
  const phone = isCollab ? detail.person.phone : detail.person.phone;
  const mobile = isCollab ? null : detail.person.mobile;
  const linkedin = isCollab ? detail.person.linkedinUrl?.trim() || null : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 pb-8 backdrop-blur-sm sm:items-center sm:pb-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-labelledby="dashboard-person-detail-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          aria-label="Chiudi"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="border-b border-slate-100 bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 px-6 pb-5 pt-6 text-white dark:from-indigo-800 dark:via-indigo-800 dark:to-violet-900">
          <div className="flex items-start gap-3 pr-10">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
              <User className="h-6 w-6 text-white/95" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h2 id="dashboard-person-detail-title" className="text-lg font-bold leading-snug tracking-tight">
                {name}
              </h2>
              <p className="mt-1 text-sm font-medium text-indigo-100/95">{subtitle}</p>
              <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-indigo-200/80">
                {isCollab ? "Team interno" : "Contatto sul cliente"}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-5">
          <ActionRow icon={Mail} label="Email" value={email ?? null}>
            <button
              type="button"
              disabled={!email?.trim()}
              onClick={() => void openMail(email ?? "")}
              className={CONTACT_MAIL_BUTTON_DETAIL_DIALOG_CLASS}
            >
              <Mail className="h-5 w-5" strokeWidth={2.25} />
              Invia mail
            </button>
          </ActionRow>

          <ActionRow icon={Phone} label="Telefono" value={phone ?? null}>
            <button
              type="button"
              disabled={!phone?.trim()}
              onClick={() => void dialNumber(phone ?? "")}
              className={CONTACT_CALL_BUTTON_DETAIL_DIALOG_CLASS}
            >
              <Phone className="h-5 w-5" strokeWidth={2.25} />
              Chiama
            </button>
          </ActionRow>

          {!isCollab && mobile?.trim() ? (
            <ActionRow icon={Phone} label="Cellulare" value={mobile}>
              <button
                type="button"
                onClick={() => void dialNumber(mobile)}
                className={CONTACT_CALL_BUTTON_DETAIL_DIALOG_CLASS}
              >
                <Phone className="h-5 w-5" strokeWidth={2.25} />
                Chiama
              </button>
            </ActionRow>
          ) : null}

          {linkedin ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => void openLink(linkedin)}
                className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                <ExternalLink className="h-4 w-4" />
                Profilo LinkedIn
              </button>
            </div>
          ) : null}
        </div>

        {!api.isTauriRuntime() ? (
          <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            In anteprima browser alcune azioni sono limitate. Usa l&apos;app desktop per integrazione completa con email e telefono.
          </p>
        ) : null}
      </div>
    </div>
  );
}
