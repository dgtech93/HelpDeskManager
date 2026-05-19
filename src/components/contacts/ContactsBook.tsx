import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import type {
  Client,
  ClientContact,
  CreateClientContactInput,
  UpdateClientContactInput,
} from "@/types";
import { BulkContactsPasteDialog } from "@/components/BulkContactsPasteDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  AppPageHeader,
  AppPageSection,
  AppPageShell,
  AppPageStatPill,
} from "@/components/layout/AppPageChrome";
import { useAppStore } from "@/store/appStore";
import { cn } from "@/lib/utils";
import { CONTACT_CALL_BUTTON_MD_CLASS, CONTACT_MAIL_BUTTON_MD_CLASS } from "@/lib/contactQuickActionButtonClasses";
import {
  BookUser,
  Building2,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

export function contactDisplayName(c: ClientContact): string {
  const s = `${(c.firstName ?? "").trim()} ${(c.lastName ?? "").trim()}`.trim();
  return s || "(Senza nome)";
}

function clientLabel(clients: Client[], id: string): string {
  return clients.find((x) => x.id === id)?.name ?? id;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function contactInitials(c: ClientContact): string {
  const f = (c.firstName ?? "").trim().charAt(0);
  const l = (c.lastName ?? "").trim().charAt(0);
  if (f && l) return (f + l).toUpperCase();
  if (f) return f.toUpperCase();
  if (l) return l.toUpperCase();
  return "?";
}

function avatarPaletteClass(id: string): string {
  const tones = [
    "bg-indigo-600 text-white shadow-indigo-600/30 dark:bg-indigo-500",
    "bg-emerald-600 text-white shadow-emerald-600/30 dark:bg-emerald-500",
    "bg-violet-600 text-white shadow-violet-600/30 dark:bg-violet-500",
    "bg-sky-600 text-white shadow-sky-600/30 dark:bg-sky-500",
    "bg-amber-600 text-white shadow-amber-600/30 dark:bg-amber-600",
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return tones[h % tones.length];
}

type PhonePick = {
  desk: string;
  mobile: string;
};

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; row: ClientContact };

type ContactsBookInnerProps = {
  clients: Client[];
  lockedClientId?: string | null;
  variant: "modal" | "page";
  onClose?: () => void;
};

const fieldInputCls =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-0 transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/25";

function ContactEditorOverlay({
  open,
  clients,
  fixedClientId,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  clients: Client[];
  fixedClientId?: string | null;
  initial: ClientContact | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    if (!open) return;
    setClientId(
      fixedClientId?.trim() ?? initial?.clientId ?? clients[0]?.id ?? "",
    );
    setFirstName(initial?.firstName ?? "");
    setLastName(initial?.lastName ?? "");
    setEmail(initial?.email ?? "");
    setPhone(initial?.phone ?? "");
    setMobile(initial?.mobile ?? "");
    setRole(initial?.role ?? "");
  }, [open, initial, fixedClientId, clients]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!norm(firstName) && !norm(lastName)) {
      toast.error("Indica almeno nome o cognome");
      return;
    }
    const cid = clientId.trim();
    if (!cid) {
      toast.error("Seleziona un cliente");
      return;
    }
    setBusy(true);
    try {
      if (!initial?.id) {
        const payload: CreateClientContactInput = {
          clientId: cid,
          firstName: norm(firstName),
          lastName: norm(lastName),
          email: norm(email) || null,
          phone: norm(phone) || null,
          mobile: norm(mobile) || null,
          role: norm(role) || null,
        };
        await api.createContact(payload);
        toast.success("Contatto creato");
      } else {
        const payload: UpdateClientContactInput = {
          clientId: cid,
          firstName: norm(firstName),
          lastName: norm(lastName),
          email: norm(email) || null,
          phone: norm(phone) || null,
          mobile: norm(mobile) || null,
          role: norm(role) || null,
        };
        await api.updateContact(initial.id, payload);
        toast.success("Contatto aggiornato");
      }
      await onSaved();
      onClose();
    } catch (err) {
      toast.error(formatErr(err));
    } finally {
      setBusy(false);
    }
  };

  const lockClient = Boolean(fixedClientId?.trim());

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-950 dark:ring-white/10"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-editor-title"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-indigo-500/[0.12] via-violet-500/[0.06] to-transparent dark:from-indigo-400/10" />
        <div className="relative flex items-start gap-3 border-b border-slate-100 px-5 pb-4 pt-5 dark:border-slate-800">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 dark:bg-indigo-500 dark:shadow-indigo-500/30">
            <UserRound size={24} strokeWidth={1.75} aria-hidden />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3
              id="contact-editor-title"
              className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50"
            >
              {initial ? "Modifica contatto" : "Nuovo contatto"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Referente aziendale: coordina nome, ruolo e canali di contatto.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="shrink-0 rounded-xl border border-transparent p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Chiudi"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="relative space-y-4 px-5 py-5">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Cliente
            </label>
            <select
              value={clientId}
              disabled={lockClient || busy}
              onChange={(e) => setClientId(e.target.value)}
              required
              className={cn(fieldInputCls, "cursor-pointer disabled:cursor-not-allowed")}
            >
              {clients.length === 0 ? (
                <option value="">Nessun cliente</option>
              ) : (
                clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Nome
              </label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={fieldInputCls}
                autoComplete="given-name"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Cognome
              </label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={fieldInputCls}
                autoComplete="family-name"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Ruolo
            </label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="es. Responsabile IT"
              className={fieldInputCls}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldInputCls}
              autoComplete="email"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Telefono
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className={cn(fieldInputCls, "font-mono")}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Cellulare
              </label>
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                inputMode="tel"
                className={cn(fieldInputCls, "font-mono")}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={busy || clients.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:opacity-45 dark:shadow-emerald-900/40"
            >
              {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
              Salva
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ContactsBook(props: ContactsBookInnerProps) {
  const { clients, lockedClientId, variant, onClose } = props;
  const vaultConfigured = useAppStore((s) => s.vaultConfigured);
  const [rows, setRows] = useState<ClientContact[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [pickPhone, setPickPhone] = useState<PhonePick | null>(null);
  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);

  const lock = lockedClientId?.trim() ?? "";
  const lockedClientName = lock ? clientLabel(clients, lock) : null;

  const load = useCallback(async () => {
    if (!api.isTauriRuntime()) return;
    setBusy(true);
    try {
      const list = lock ? await api.getContactsByClient(lock) : await api.getAllContacts();
      setRows(list);
      setSelectedId((cur) => (cur && list.some((r) => r.id === cur) ? cur : null));
    } catch (e) {
      toast.error(formatErr(e));
    } finally {
      setBusy(false);
    }
  }, [lock]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return rows;
    return rows.filter((r) => {
      const blob = [
        contactDisplayName(r),
        norm(r.role),
        norm(r.email),
        norm(r.phone),
        norm(r.mobile),
        lock ? "" : clientLabel(clients, r.clientId),
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(ql);
    });
  }, [rows, q, clients, lock]);

  const sel = filtered.find((r) => r.id === selectedId) ?? null;

  const handleDialChoice = async (choice: PhonePick, useDesk: boolean) => {
    const raw = useDesk ? choice.desk : choice.mobile;
    setPickPhone(null);
    try {
      await api.dialPhoneNumber(raw.trim());
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const handleDialContact = async (r: ClientContact) => {
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
    try {
      await api.dialPhoneNumber(p || m);
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  const handleMail = async (r: ClientContact) => {
    const e = norm(r.email);
    if (!e) {
      toast.error("Nessuna email impostata");
      return;
    }
    try {
      await api.openContactMailto(e);
    } catch (err) {
      toast.error(formatErr(err));
    }
  };

  const headerTitle =
    lockedClientName != null ? `Referenti · ${lockedClientName}` : "Rubrica contatti";

  const subtitle =
    lockedClientName != null
      ? "Contatti dedicati al cliente selezionato."
      : "Panoramica di tutti i referenti organizzati per cliente.";

  const shellCls =
    variant === "modal"
      ? "max-h-[min(85vh,calc(100vh-3rem))] min-h-[min(420px,55vh)] overflow-hidden flex flex-col"
      : "";

  const pageListChromeCls =
    variant === "page" ? "flex min-h-0 flex-1 flex-col gap-4" : "";

  const tableColSpan = lock ? 5 : 6;

  const body = (
    <>
      {!api.isTauriRuntime() ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-100">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <BookUser size={18} aria-hidden />
          </span>
          <div>
            <p className="font-semibold leading-tight">Rubrica nell&apos;app desktop</p>
            <p className="mt-1 text-xs opacity-90">
              Gestione contatti disponibile nell&apos;applicazione Tauri installata sul PC.
            </p>
          </div>
        </div>
      ) : null}

      {api.isTauriRuntime() ? (
        <div className={cn(pageListChromeCls)}>
          <div className="flex shrink-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-[min(100%,14rem)] flex-1 lg:max-w-md">
              <label className="sr-only" htmlFor="rubrica-search">
                Cerca in rubrica
              </label>
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                aria-hidden
              />
              <input
                id="rubrica-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cerca per nome, email, ruolo, telefono…"
                className={cn(
                  fieldInputCls,
                  "mt-0 pl-10 font-normal shadow-sm dark:bg-slate-950/80",
                )}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy || clients.length === 0}
                onClick={() => setEditor({ mode: "create" })}
                title="Nuovo contatto"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-45 dark:shadow-emerald-950/40"
              >
                <Plus size={16} aria-hidden /> Nuovo
              </button>
              {variant === "page" && api.isTauriRuntime() ? (
                <button
                  type="button"
                  disabled={busy || clients.length === 0}
                  title={
                    vaultConfigured
                      ? "Incolla più righe; serve la master password del vault per importare"
                      : "Configura il vault in Impostazioni → Credenziali"
                  }
                  onClick={() => setBulkPasteOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/80 px-3.5 py-2 text-xs font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-100/90 disabled:pointer-events-none disabled:opacity-45 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-100 dark:hover:bg-indigo-950/60"
                >
                  Inserimento multiplo
                </button>
              ) : null}
              <button
                type="button"
                disabled={!sel || busy}
                onClick={() => sel && setEditor({ mode: "edit", row: sel })}
                title="Modifica contatto"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-45 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Pencil size={15} aria-hidden /> Modifica
              </button>
              <button
                type="button"
                disabled={!sel || busy}
                onClick={() => sel && setDelId(sel.id)}
                title="Elimina contatto"
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:pointer-events-none disabled:opacity-45 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/50"
              >
                <Trash2 size={15} aria-hidden /> Elimina
              </button>
              <span className="mx-1 hidden h-7 w-px bg-slate-200 sm:inline dark:bg-slate-600" aria-hidden />
              <button
                type="button"
                disabled={!sel || busy}
                onClick={() => sel && void handleDialContact(sel)}
                title="Componi numero"
                className={CONTACT_CALL_BUTTON_MD_CLASS}
              >
                <Phone size={15} aria-hidden strokeWidth={2} /> Chiama
              </button>
              <button
                type="button"
                disabled={!sel || busy}
                onClick={() => sel && void handleMail(sel)}
                title="Apri cliente di posta"
                className={CONTACT_MAIL_BUTTON_MD_CLASS}
              >
                <Mail size={15} aria-hidden strokeWidth={2} /> Email
              </button>
            </div>
          </div>

          <div
            className={cn(
              "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-inner dark:border-slate-700 dark:bg-slate-950/40",
              busy && "opacity-70",
            )}
          >
            {busy ? (
              <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-white/40 dark:bg-slate-950/40">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden />
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-[1] border-b border-slate-200/90 bg-gradient-to-r from-indigo-50 via-slate-50 to-white text-[11px] font-bold uppercase tracking-wider text-slate-600 shadow-sm dark:border-slate-700 dark:from-indigo-950/55 dark:via-slate-900 dark:to-slate-950 dark:text-slate-400">
                  <tr>
                    {!lock ? (
                      <th className="whitespace-nowrap px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 size={14} className="opacity-70" aria-hidden />
                          Cliente
                        </span>
                      </th>
                    ) : null}
                    <th className="whitespace-nowrap px-4 py-3.5">Referente</th>
                    <th className="whitespace-nowrap px-4 py-3.5">Ruolo</th>
                    <th className="whitespace-nowrap px-4 py-3.5">Email</th>
                    <th className="whitespace-nowrap px-4 py-3.5">Telefono</th>
                    <th className="whitespace-nowrap px-4 py-3.5">Cellulare</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={tableColSpan}
                        className="px-6 py-16 text-center align-middle text-slate-500 dark:text-slate-400"
                      >
                        <BookUser className="mx-auto mb-3 h-12 w-12 text-slate-200 dark:text-slate-600" aria-hidden />
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          {rows.length === 0
                            ? "Nessun contatto in rubrica"
                            : "Nessun risultato per la ricerca"}
                        </p>
                        <p className="mt-1 max-w-sm mx-auto text-xs text-slate-500 dark:text-slate-500">
                          {rows.length === 0
                            ? "Usa «Nuovo» per aggiungere il primo referente."
                            : "Prova un altro termine o reimposta il filtro."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r) => {
                      const active = selectedId === r.id;
                      return (
                        <tr
                          key={r.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedId(r.id)}
                          onDoubleClick={() => setEditor({ mode: "edit", row: r })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") setSelectedId(r.id);
                          }}
                          className={cn(
                            "cursor-pointer transition-colors",
                            active
                              ? "bg-indigo-50/90 dark:bg-indigo-950/35"
                              : "hover:bg-slate-50/90 dark:hover:bg-slate-900/50",
                          )}
                        >
                          {!lock ? (
                            <td
                              className={cn(
                                "max-w-[12rem] px-4 py-3",
                                active
                                  ? "border-l-[3px] border-l-indigo-600 dark:border-l-indigo-400"
                                  : "border-l-[3px] border-l-transparent",
                              )}
                            >
                              <span className="line-clamp-2 font-medium text-slate-800 dark:text-slate-100">
                                {clientLabel(clients, r.clientId)}
                              </span>
                            </td>
                          ) : null}
                          <td
                            className={cn(
                              "px-4 py-3",
                              lock
                                ? active
                                  ? "border-l-[3px] border-l-indigo-600 dark:border-l-indigo-400"
                                  : "border-l-[3px] border-l-transparent"
                                : null,
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={cn(
                                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-md",
                                  avatarPaletteClass(r.id),
                                )}
                              >
                                {contactInitials(r)}
                              </span>
                              <span className="min-w-0 font-semibold text-slate-900 dark:text-slate-50">
                                {contactDisplayName(r)}
                              </span>
                            </div>
                          </td>
                          <td className="max-w-[10rem] px-4 py-3">
                            {norm(r.role) ? (
                              <span className="inline-flex max-w-full rounded-lg border border-slate-200/90 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200">
                                <span className="truncate" title={norm(r.role)}>
                                  {norm(r.role)}
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="max-w-[14rem] px-4 py-3">
                            {norm(r.email) ? (
                              <span className="line-clamp-2 break-all font-medium text-emerald-800 dark:text-emerald-400">
                                {norm(r.email)}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="max-w-[9rem] px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                            <span className="line-clamp-2">{norm(r.phone) || "—"}</span>
                          </td>
                          <td className="max-w-[9rem] px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                            <span className="line-clamp-2">{norm(r.mobile) || "—"}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="shrink-0 text-[11px] text-slate-500 dark:text-slate-500">
            Clic per selezionare · doppio clic per modificare · {filtered.length}{" "}
            {filtered.length === 1 ? "contatto" : "contatti"}
            {q.trim() ? ` (filtrati su ${rows.length})` : null}
          </p>
        </div>
      ) : null}

      <ContactEditorOverlay
        open={editor !== null}
        clients={clients}
        fixedClientId={lockedClientId ?? null}
        initial={editor?.mode === "edit" ? editor.row : null}
        onClose={() => setEditor(null)}
        onSaved={async () => {
          await load();
        }}
      />

      <ConfirmDialog
        open={delId !== null}
        danger
        title="Eliminare il contatto?"
        description="Il contatto verrà rimosso dalla rubrica."
        confirmLabel="Elimina"
        onCancel={() => setDelId(null)}
        onConfirm={() => {
          const id = delId;
          setDelId(null);
          if (!id) return;
          void (async () => {
            try {
              await api.deleteContact(id);
              toast.success("Contatto eliminato");
              setSelectedId(null);
              await load();
            } catch (e) {
              toast.error(formatErr(e));
            }
          })();
        }}
      />

      {variant === "page" && api.isTauriRuntime() ? (
        <BulkContactsPasteDialog
          open={bulkPasteOpen}
          onClose={() => setBulkPasteOpen(false)}
          clients={clients}
          lockedClientId={lock ? lock : null}
          onImported={async () => {
            await load();
          }}
        />
      ) : null}

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
                onClick={() => handleDialChoice(pickPhone, true)}
              >
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Ufficio
                </span>
                <span className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                  {pickPhone.desk}
                </span>
              </button>
              <button
                type="button"
                className="flex w-full flex-col items-start rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-left shadow-sm transition hover:border-indigo-200 hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500/40 dark:hover:bg-slate-800"
                onClick={() => handleDialChoice(pickPhone, false)}
              >
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Cellulare
                </span>
                <span className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                  {pickPhone.mobile}
                </span>
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

  if (variant === "page") {
    return (
      <AppPageShell className="flex min-h-0 flex-1 flex-col gap-5">
        <AppPageHeader
          className="shrink-0"
          icon={BookUser}
          accent="indigo"
          title="Rubrica referenti"
          description={
            <>
              Anagrafica centralizzata dei contatti per cliente. Cerca, chiama o invia email in pochi clic — i nuovi
              referenti si associano al cliente scelto in anagrafica.
            </>
          }
          headerRight={
            api.isTauriRuntime() ? (
              <AppPageStatPill label="Totale rubrica" value={busy ? "…" : rows.length} />
            ) : null
          }
        />
        <AppPageSection className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {body}
        </AppPageSection>
      </AppPageShell>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/90 shadow-2xl ring-1 ring-indigo-500/[0.08] dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 dark:ring-indigo-400/10",
        shellCls,
      )}
    >
      <div className="flex shrink-0 items-start gap-3 border-b border-slate-200/80 bg-gradient-to-r from-indigo-50/80 via-white to-white px-5 py-4 dark:border-slate-800 dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-950">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20 dark:bg-indigo-500">
          <BookUser size={22} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50 md:text-lg">
            {headerTitle}
          </h3>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{subtitle}</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-slate-200/90 bg-white/90 p-2 text-slate-600 shadow-sm transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            aria-label="Chiudi rubrica"
            title="Chiudi"
          >
            <X size={20} aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0 px-4 pb-4 pt-4 md:px-5">{body}</div>
    </div>
  );
}
