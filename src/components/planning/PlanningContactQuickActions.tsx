import { useState } from "react";
import { Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import type { PlanningCatalogBundle } from "@/lib/planningCatalogOptions";
import {
  CONTACT_CALL_BUTTON_PLANNING_CLASS,
  CONTACT_MAIL_BUTTON_PLANNING_CLASS,
} from "@/lib/contactQuickActionButtonClasses";
import { firstPlanningClientsComboFieldId, resolvePlanningContactAction } from "@/lib/planningUseContacts";
import type { ClientContact, PlanningActivityTypeDef } from "@/types";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim();
}

type PhonePick = { desk: string; mobile: string };

export type PlanningContactQuickActionsProps = {
  activityType: PlanningActivityTypeDef | undefined;
  bundle: PlanningCatalogBundle | null;
  /** Valori campo come in payload o scratch (combobox = stringhe). */
  fieldValues: Record<string, unknown>;
  /** In lista: etichetta sopra i pulsanti; nel form più compatto. */
  variant?: "toolbar" | "form";
  /** Con `toolbar`: allineamento (default a destra, in Pianificazione a sinistra). */
  toolbarPlacement?: "end" | "start";
};

/**
 * Chiamata / email sul referente o collaboratore coerente con cliente + campo rubrica (tipi con useContacts).
 */
export function PlanningContactQuickActions({
  activityType,
  bundle,
  fieldValues,
  variant = "toolbar",
  toolbarPlacement = "end",
}: PlanningContactQuickActionsProps) {
  const [pickPhone, setPickPhone] = useState<PhonePick | null>(null);

  if (!activityType?.useContacts || !bundle) return null;

  const clientFieldId = firstPlanningClientsComboFieldId(activityType);
  if (!clientFieldId) return null;

  const clientId = typeof fieldValues[clientFieldId] === "string" ? fieldValues[clientFieldId]!.trim() : "";

  const resolved = resolvePlanningContactAction(
    activityType,
    fieldValues,
    clientId,
    bundle.contacts,
    bundle.collaborators,
  );

  const canCall =
    resolved != null &&
    (resolved.kind === "contact"
      ? !!(norm(resolved.contact.phone) || norm(resolved.contact.mobile))
      : !!norm(resolved.collaborator.phone));

  const canMail =
    resolved != null &&
    (resolved.kind === "contact" ? !!norm(resolved.contact.email) : !!norm(resolved.collaborator.email));

  const handleDialChoice = async (choice: PhonePick, useDesk: boolean) => {
    const raw = useDesk ? choice.desk : choice.mobile;
    setPickPhone(null);
    try {
      await api.dialPhoneNumber(raw.trim());
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const dialContact = (r: ClientContact) => {
    const p = norm(r.phone);
    const m = norm(r.mobile);
    if (!p && !m) {
      toast.error("Nessun numero impostato per questo contatto");
      return;
    }
    if (p && m) {
      setPickPhone({ desk: p, mobile: m });
      return;
    }
    void (async () => {
      try {
        await api.dialPhoneNumber(p || m);
      } catch (e) {
        toast.error(formatErr(e));
      }
    })();
  };

  const mailContact = (r: ClientContact) => {
    const e = norm(r.email);
    if (!e) {
      toast.error("Nessuna email impostata");
      return;
    }
    void api.openContactMailto(e).catch((err) => toast.error(formatErr(err)));
  };

  const onCall = () => {
    if (!resolved) {
      toast.error("Imposta cliente e un referente o collaboratore.");
      return;
    }
    if (resolved.kind === "contact") dialContact(resolved.contact);
    else {
      const ph = norm(resolved.collaborator.phone);
      if (!ph) {
        toast.error("Nessun numero impostato per questo collaboratore");
        return;
      }
      void api.dialPhoneNumber(ph).catch((e) => toast.error(formatErr(e)));
    }
  };

  const onMail = () => {
    if (!resolved) {
      toast.error("Imposta cliente e un referente o collaboratore.");
      return;
    }
    if (resolved.kind === "contact") mailContact(resolved.contact);
    else {
      const e = norm(resolved.collaborator.email);
      if (!e) {
        toast.error("Nessuna email impostata");
        return;
      }
      void api.openContactMailto(e).catch((err) => toast.error(formatErr(err)));
    }
  };

  const isForm = variant === "form";
  const toolStart = !isForm && toolbarPlacement === "start";

  return (
    <>
      <div
        className={
          isForm
            ? "flex min-w-0 flex-wrap items-center justify-end gap-2"
            : toolStart
              ? "flex min-w-0 max-w-full flex-col items-start gap-2"
              : "flex min-w-0 max-w-full flex-col items-end gap-2"
        }
      >
        {!isForm ? (
          <span
            className={
              toolStart
                ? "text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400"
                : "text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400"
            }
          >
            Contatto selezionato
          </span>
        ) : null}
        <div
          className={
            isForm
              ? "flex min-w-0 flex-wrap items-center justify-end gap-2"
              : `flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-slate-200/95 bg-white/95 p-2 shadow-sm ring-1 ring-slate-900/[0.04] dark:border-slate-600/90 dark:bg-slate-950/60 dark:ring-white/[0.05] ${toolStart ? "justify-start" : "justify-end"}`
          }
          role="group"
          aria-label="Chiamata ed email sul contatto"
        >
          <button
            type="button"
            disabled={!canCall}
            onClick={onCall}
            className={CONTACT_CALL_BUTTON_PLANNING_CLASS}
          >
            <Phone size={17} aria-hidden strokeWidth={2} /> Chiama
          </button>
          <button
            type="button"
            disabled={!canMail}
            onClick={onMail}
            className={CONTACT_MAIL_BUTTON_PLANNING_CLASS}
          >
            <Mail size={17} aria-hidden strokeWidth={2} /> Mail
          </button>
        </div>
      </div>

      {pickPhone ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-950 dark:ring-white/10">
            <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white px-5 py-4 dark:border-slate-800 dark:from-indigo-950/40 dark:to-slate-950">
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-50">
                <Phone size={18} className="text-indigo-600 dark:text-indigo-400" aria-hidden />
                Scegli il numero
              </h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Viene avviata l&apos;app predefinita per le chiamate sul dispositivo.
              </p>
            </div>
            <div className="flex flex-col gap-2 p-5">
              <button
                type="button"
                className="flex w-full flex-col items-start rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-left shadow-sm transition hover:border-indigo-200 hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500/40 dark:hover:bg-slate-800"
                onClick={() => void handleDialChoice(pickPhone, true)}
              >
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Ufficio
                </span>
                <span className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100">{pickPhone.desk}</span>
              </button>
              <button
                type="button"
                className="flex w-full flex-col items-start rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-left shadow-sm transition hover:border-indigo-200 hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500/40 dark:hover:bg-slate-800"
                onClick={() => void handleDialChoice(pickPhone, false)}
              >
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Cellulare
                </span>
                <span className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100">{pickPhone.mobile}</span>
              </button>
              <button
                type="button"
                onClick={() => setPickPhone(null)}
                className="mt-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
