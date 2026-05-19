import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import * as api from "@/lib/api";
import { formatErr, isTauriRuntime } from "@/lib/api";
import { toast } from "sonner";
import type {
  Client,
  Collaborator,
  CollaboratorCompetencyDef,
  CollaboratorRole,
  CreateCollaboratorInput,
  UpdateCollaboratorInput,
} from "@/types";
import { BulkCollaboratorsPasteDialog } from "@/components/BulkCollaboratorsPasteDialog";
import { CatalogCreationModal } from "@/components/CatalogCreationModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  AppPageHeader,
  AppPageSection,
  AppPageShell,
  AppPageStatPill,
} from "@/components/layout/AppPageChrome";
import { cn, normalizeWebsiteUrl } from "@/lib/utils";
import {
  CONTACT_CALL_BUTTON_MD_CLASS,
  CONTACT_MAIL_BUTTON_MD_CLASS,
  CONTACT_CALL_BUTTON_QUICK_STRIP_CLASS,
  CONTACT_MAIL_BUTTON_QUICK_STRIP_CLASS,
} from "@/lib/contactQuickActionButtonClasses";
import { useAppStore } from "@/store/appStore";
import { collaboratorCardName } from "./CollaboratorsByClient";
import {
  Building2,
  Globe,
  Info,
  Linkedin,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim();
}

const fieldInputCls =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-teal-500 dark:focus:ring-teal-500/25";

const checklistBoxCls =
  "max-h-36 overflow-auto rounded-xl border border-slate-200/90 bg-slate-50/50 p-2.5 text-sm shadow-inner dark:border-slate-600 dark:bg-slate-950/40";

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; row: Collaborator };

type Props = {
  clients: Client[];
  competencyCatalog: CollaboratorCompetencyDef[];
  /** Dopo salvataggi da modale nuova competenza o import. */
  reloadCompetencyCatalog?: () => Promise<void>;
  lockedClientId?: string | null;
  variant: "modal" | "page";
  /** Nel modale da Clienti: griglia card grandi affiancate con foto più evidente (stessa toolbar della tabella). */
  cardGrid?: boolean;
  onClose?: () => void;
};

function clientLabels(clients: Client[], ids: string[]): string {
  const names = ids
    .map((id) => clients.find((c) => c.id === id)?.name?.trim())
    .filter(Boolean) as string[];
  return names.length ? names.join(", ") : "—";
}

function competencyLabels(rows: CollaboratorCompetencyDef[], ids: string[]): string {
  const names = ids
    .map((id) => rows.find((p) => p.id === id)?.name?.trim())
    .filter(Boolean) as string[];
  return names.length ? names.join(", ") : "—";
}

function clientsForIds(allClients: Client[], ids: string[]): Client[] {
  const map = new Map(allClients.map((c) => [c.id, c]));
  const out: Client[] = [];
  for (const id of ids) {
    const c = map.get(id);
    if (c) out.push(c);
  }
  return out;
}

export function CollaboratorEditorOverlay({
  open,
  clients,
  competencyCatalog,
  reloadCompetencyCatalog,
  roles,
  fixedClientId,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  clients: Client[];
  competencyCatalog: CollaboratorCompetencyDef[];
  reloadCompetencyCatalog?: () => Promise<void>;
  roles: CollaboratorRole[];
  fixedClientId?: string | null;
  initial: Collaborator | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [clientIdsSel, setClientIdsSel] = useState<Set<string>>(new Set());
  const [presetIdsSel, setPresetIdsSel] = useState<Set<string>>(new Set());
  const [roleId, setRoleId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [competencyModalOpen, setCompetencyModalOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const lock = fixedClientId?.trim() ?? "";
    if (initial) {
      setClientIdsSel(new Set(initial.clientIds));
      setPresetIdsSel(new Set(initial.competencyPresetIds));
      setRoleId(initial.roleId);
      setFirstName(initial.firstName ?? "");
      setLastName(initial.lastName ?? "");
      setLinkedinUrl(initial.linkedinUrl ?? "");
      setPhotoUrl(initial.photoUrl ?? "");
      setEmail(initial.email ?? "");
      setPhone(initial.phone ?? "");
    } else {
      const startClients = lock
        ? new Set<string>([lock])
        : new Set(clients[0]?.id ? [clients[0].id] : []);
      setClientIdsSel(startClients);
      setPresetIdsSel(
        competencyCatalog[0]?.id ? new Set([competencyCatalog[0].id]) : new Set(),
      );
      setRoleId(
        [...roles].sort((a, b) => a.sortRank - b.sortRank)[0]?.id ?? "",
      );
      setFirstName("");
      setLastName("");
      setLinkedinUrl("");
      setPhotoUrl("");
      setEmail("");
      setPhone("");
    }
  }, [open, initial, fixedClientId, clients, competencyCatalog, roles]);

  if (!open) return null;

  const lockClient = Boolean(fixedClientId?.trim());
  const rolesSorted = [...roles].sort((a, b) => a.sortRank - b.sortRank);

  const toggleInSet =
    (set: Set<string>, upd: (s: Set<string>) => void) => (id: string) => {
      const n = new Set(set);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      upd(n);
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fn = norm(firstName);
    const ln = norm(lastName);
    if (!fn && !ln) {
      toast.error("Indica almeno nome o cognome");
      return;
    }
    const cids = [...clientIdsSel].filter((x) => x.trim());
    if (!cids.length) {
      toast.error("Seleziona almeno un cliente gestito");
      return;
    }
    const pids = [...presetIdsSel].filter((x) => x.trim());
    if (!pids.length) {
      toast.error("Seleziona almeno una competenza dall’elenco Impostazioni → Ruoli e competenze.");
      return;
    }
    const rid = roleId.trim();
    if (!rid) {
      toast.error("Seleziona un incarico");
      return;
    }
    setBusy(true);
    try {
      if (!initial?.id) {
        const payload: CreateCollaboratorInput = {
          firstName: fn,
          lastName: ln,
          linkedinUrl: norm(linkedinUrl) || null,
          photoUrl: norm(photoUrl) || null,
          email: norm(email) || null,
          phone: norm(phone) || null,
          roleId: rid,
          clientIds: cids,
          competencyPresetIds: pids,
        };
        await api.createCollaborator(payload);
        toast.success("Collaboratore creato");
      } else {
        const payload: UpdateCollaboratorInput = {
          firstName: fn,
          lastName: ln,
          linkedinUrl: norm(linkedinUrl) || null,
          photoUrl: norm(photoUrl) || null,
          email: norm(email) || null,
          phone: norm(phone) || null,
          roleId: rid,
          clientIds: cids,
          competencyPresetIds: pids,
        };
        await api.updateCollaborator(initial.id, payload);
        toast.success("Collaboratore aggiornato");
      }
      await onSaved();
      onClose();
    } catch (err) {
      toast.error(formatErr(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
        <div
          className="relative max-h-[min(92vh,720px)] w-full max-w-xl overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-950 dark:ring-white/10"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collab-editor-title"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-teal-500/[0.12] via-emerald-500/[0.06] to-transparent dark:from-teal-400/10" />
        <div className="relative flex items-start gap-3 border-b border-slate-100 px-5 pb-4 pt-5 dark:border-slate-800">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-lg shadow-teal-600/25 dark:bg-teal-500 dark:shadow-teal-500/25">
            <Users size={23} strokeWidth={1.75} aria-hidden />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3
              id="collab-editor-title"
              className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50"
            >
              {initial ? "Modifica collaboratore" : "Nuovo collaboratore"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Collegamento a clienti seguiti, competenze e incarico definito nelle Impostazioni.
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
              Incarico
            </label>
            <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-500">
              Priorità e etichette da{" "}
              <span className="font-medium text-slate-600 dark:text-slate-400">
                Impostazioni → Ruoli e competenze
              </span>
            </p>
            <select
              value={roleId}
              disabled={busy || rolesSorted.length === 0}
              onChange={(e) => setRoleId(e.target.value)}
              className={cn(fieldInputCls, "cursor-pointer disabled:cursor-not-allowed")}
            >
              {rolesSorted.map((roleRow) => (
                <option key={roleRow.id} value={roleRow.id}>
                  {roleRow.label} (priorità {roleRow.sortRank})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Clienti gestiti
            </label>
            <div
              className={cn(
                checklistBoxCls,
                lockClient ? "opacity-85" : "",
                "mt-1",
              )}
            >
              {clients.length === 0 ? (
                <p className="text-xs text-slate-500">Nessun cliente</p>
              ) : (
                clients.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg py-1.5 hover:bg-white/70 dark:hover:bg-slate-900/50"
                  >
                    <input
                      type="checkbox"
                      disabled={busy || lockClient}
                      checked={
                        lockClient ? c.id === fixedClientId?.trim() : clientIdsSel.has(c.id)
                      }
                      onChange={() => toggleInSet(clientIdsSel, setClientIdsSel)(c.id)}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500/30 dark:border-slate-600"
                    />
                    <span className="text-sm">{c.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Competenze
              </label>
              {reloadCompetencyCatalog && isTauriRuntime() ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCompetencyModalOpen(true)}
                  className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
                >
                  + Nuova competenza…
                </button>
              ) : null}
            </div>
            <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-500">
              Catalogo in{" "}
              <span className="font-medium text-slate-600 dark:text-slate-400">
                Impostazioni → Ruoli e competenze
              </span>
              .
            </p>
            <div className={cn(checklistBoxCls, "mt-1")}>
              {competencyCatalog.length === 0 ? (
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                  Nessuna competenza in catalogo: aggiungine una con il pulsante sopra o da Impostazioni.
                </p>
              ) : (
                competencyCatalog.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg py-1.5 hover:bg-white/70 dark:hover:bg-slate-900/50"
                  >
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={presetIdsSel.has(p.id)}
                      onChange={() => toggleInSet(presetIdsSel, setPresetIdsSel)(p.id)}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500/30 dark:border-slate-600"
                    />
                    <span className="text-sm">{p.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              LinkedIn
            </label>
            <input
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/…"
              className={fieldInputCls}
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              URL foto pubblica
            </label>
            <input
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="HTTPS verso avatar o foto profilo"
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

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={busy || clients.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:opacity-50 dark:shadow-emerald-900/30"
            >
              {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
              Salva
            </button>
          </div>
        </form>
      </div>
    </div>

    {reloadCompetencyCatalog ? (
      <CatalogCreationModal
        open={competencyModalOpen}
        variant={competencyModalOpen ? "collaboratorCompetency" : null}
        presetKind="rdp"
        connectionNamePresets={[]}
        defaultPresetIds={[]}
        onClose={() => setCompetencyModalOpen(false)}
        onCatalogRefreshed={reloadCompetencyCatalog}
        onSaved={(id) => {
          setPresetIdsSel((prev) => new Set(prev).add(id));
          setCompetencyModalOpen(false);
        }}
      />
    ) : null}
    </>
  );
}

type RoleCardTheme = {
  cardBg: string;
  borderIdle: string;
  borderHover: string;
  blobTop: string;
  blobBottom: string;
  heroStrip: string;
  avatarRing: string;
  avatarGlow: string;
  initialsBg: string;
  initialsText: string;
  nameLabel: string;
  fieldLabel: string;
};

const ROLE_CARD_THEMES: RoleCardTheme[] = [
  {
    cardBg:
      "from-teal-50/95 via-white to-violet-50/80 dark:from-teal-950/50 dark:via-slate-950 dark:to-violet-950/40",
    borderIdle: "border-teal-200/80 dark:border-teal-900/60",
    borderHover: "hover:border-teal-400 dark:hover:border-teal-500",
    blobTop:
      "bg-teal-400/25 blur-2xl transition-all duration-500 group-hover:bg-violet-400/35 group-hover:blur-xl dark:bg-teal-500/20 dark:group-hover:bg-violet-500/25",
    blobBottom:
      "bg-violet-400/20 blur-2xl transition-all duration-500 group-hover:bg-cyan-400/25 dark:bg-violet-600/15",
    heroStrip:
      "from-teal-500 via-emerald-500 to-cyan-600 dark:from-teal-600 dark:via-emerald-600 dark:to-cyan-700",
    avatarRing:
      "from-teal-400 via-emerald-400 to-violet-500 shadow-teal-600/25 dark:shadow-teal-900/40",
    avatarGlow: "group-hover:shadow-teal-500/35 dark:group-hover:shadow-teal-600/40",
    initialsBg: "from-teal-100/90 to-violet-100/80 dark:from-teal-900/80 dark:to-violet-900/60",
    initialsText: "text-teal-800 dark:text-teal-200",
    nameLabel: "text-violet-600 dark:text-violet-400",
    fieldLabel: "text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400",
  },
  {
    cardBg:
      "from-rose-50/95 via-white to-amber-50/85 dark:from-rose-950/45 dark:via-slate-950 dark:to-amber-950/35",
    borderIdle: "border-rose-200/80 dark:border-rose-900/55",
    borderHover: "hover:border-rose-400 dark:hover:border-rose-500",
    blobTop:
      "bg-rose-400/25 blur-2xl transition-all duration-500 group-hover:bg-amber-400/35 group-hover:blur-xl dark:bg-rose-600/25",
    blobBottom:
      "bg-amber-400/20 blur-2xl transition-all duration-500 group-hover:bg-orange-400/30 dark:bg-amber-700/15",
    heroStrip:
      "from-rose-500 via-orange-400 to-amber-500 dark:from-rose-600 dark:via-orange-600 dark:to-amber-600",
    avatarRing:
      "from-rose-400 via-orange-400 to-amber-500 shadow-rose-500/30 dark:shadow-rose-950/45",
    avatarGlow: "group-hover:shadow-rose-500/40 dark:group-hover:shadow-rose-900/35",
    initialsBg: "from-rose-100/95 to-amber-100/85 dark:from-rose-900/85 dark:to-amber-950/70",
    initialsText: "text-rose-800 dark:text-rose-200",
    nameLabel: "text-rose-700 dark:text-rose-400",
    fieldLabel:
      "text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400",
  },
  {
    cardBg:
      "from-sky-50/95 via-white to-blue-50/85 dark:from-sky-950/40 dark:via-slate-950 dark:to-indigo-950/38",
    borderIdle: "border-sky-200/85 dark:border-sky-900/55",
    borderHover: "hover:border-sky-400 dark:hover:border-sky-500",
    blobTop:
      "bg-sky-400/25 blur-2xl transition-all duration-500 group-hover:bg-indigo-400/35 group-hover:blur-xl dark:bg-sky-600/22",
    blobBottom:
      "bg-indigo-400/22 blur-2xl transition-all duration-500 group-hover:bg-blue-400/25 dark:bg-indigo-800/18",
    heroStrip:
      "from-sky-500 via-blue-500 to-indigo-600 dark:from-sky-600 dark:via-blue-600 dark:to-indigo-700",
    avatarRing:
      "from-sky-400 via-blue-400 to-indigo-500 shadow-sky-500/35 dark:shadow-sky-950/40",
    avatarGlow: "group-hover:shadow-sky-500/40 dark:group-hover:shadow-indigo-900/35",
    initialsBg: "from-sky-100/92 to-blue-100/84 dark:from-sky-900/82 dark:to-indigo-950/65",
    initialsText: "text-sky-900 dark:text-sky-100",
    nameLabel: "text-indigo-700 dark:text-indigo-400",
    fieldLabel: "text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400",
  },
  {
    cardBg:
      "from-lime-50/92 via-white to-emerald-50/88 dark:from-lime-950/35 dark:via-slate-950 dark:to-emerald-950/38",
    borderIdle: "border-lime-200/85 dark:border-lime-900/45",
    borderHover: "hover:border-lime-400 dark:hover:border-lime-500",
    blobTop:
      "bg-lime-400/22 blur-2xl transition-all duration-500 group-hover:bg-emerald-400/32 dark:bg-lime-600/18",
    blobBottom:
      "bg-emerald-400/20 blur-2xl transition-all duration-500 group-hover:bg-green-400/28 dark:bg-emerald-800/14",
    heroStrip:
      "from-lime-500 via-emerald-500 to-green-600 dark:from-lime-600 dark:via-emerald-600 dark:to-green-700",
    avatarRing:
      "from-lime-400 via-emerald-400 to-green-500 shadow-lime-600/28 dark:shadow-lime-950/40",
    avatarGlow: "group-hover:shadow-emerald-500/35 dark:group-hover:shadow-lime-900/30",
    initialsBg: "from-lime-100/93 to-emerald-100/86 dark:from-lime-900/75 dark:to-emerald-950/65",
    initialsText: "text-emerald-900 dark:text-lime-200",
    nameLabel: "text-emerald-700 dark:text-emerald-400",
    fieldLabel:
      "text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400",
  },
  {
    cardBg:
      "from-fuchsia-50/95 via-white to-purple-50/82 dark:from-fuchsia-950/38 dark:via-slate-950 dark:to-purple-950/40",
    borderIdle: "border-fuchsia-200/80 dark:border-fuchsia-900/50",
    borderHover: "hover:border-fuchsia-400 dark:hover:border-fuchsia-500",
    blobTop:
      "bg-fuchsia-400/25 blur-2xl transition-all duration-500 group-hover:bg-purple-400/35 dark:bg-fuchsia-600/22",
    blobBottom:
      "bg-purple-400/22 blur-2xl transition-all duration-500 group-hover:bg-pink-400/28 dark:bg-purple-800/18",
    heroStrip:
      "from-fuchsia-500 via-purple-500 to-pink-500 dark:from-fuchsia-600 dark:via-purple-600 dark:to-pink-600",
    avatarRing:
      "from-fuchsia-400 via-purple-400 to-pink-500 shadow-fuchsia-500/35 dark:shadow-fuchsia-950/42",
    avatarGlow: "group-hover:shadow-purple-500/45 dark:group-hover:shadow-fuchsia-900/35",
    initialsBg: "from-fuchsia-100/93 to-purple-100/86 dark:from-fuchsia-900/78 dark:to-purple-950/65",
    initialsText: "text-fuchsia-900 dark:text-fuchsia-200",
    nameLabel: "text-purple-700 dark:text-purple-400",
    fieldLabel:
      "text-[10px] font-bold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-400",
  },
  {
    cardBg:
      "from-amber-50/93 via-white to-yellow-50/78 dark:from-amber-950/38 dark:via-slate-950 dark:to-yellow-950/32",
    borderIdle: "border-amber-200/85 dark:border-amber-900/50",
    borderHover: "hover:border-amber-400 dark:hover:border-amber-500",
    blobTop:
      "bg-amber-400/24 blur-2xl transition-all duration-500 group-hover:bg-yellow-400/32 dark:bg-amber-600/22",
    blobBottom:
      "bg-yellow-400/18 blur-2xl transition-all duration-500 group-hover:bg-lime-300/28 dark:bg-yellow-900/15",
    heroStrip:
      "from-amber-500 via-yellow-400 to-orange-500 dark:from-amber-600 dark:via-yellow-600 dark:to-orange-700",
    avatarRing:
      "from-amber-400 via-yellow-400 to-orange-400 shadow-amber-500/30 dark:shadow-amber-950/40",
    avatarGlow: "group-hover:shadow-amber-500/40 dark:group-hover:shadow-orange-900/30",
    initialsBg: "from-amber-100/93 to-orange-100/82 dark:from-amber-900/76 dark:to-orange-950/60",
    initialsText: "text-amber-900 dark:text-amber-200",
    nameLabel: "text-orange-800 dark:text-orange-400",
    fieldLabel:
      "text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400",
  },
];

function getRoleTheme(roleId: string): RoleCardTheme {
  const key = norm(roleId);
  if (!key) return ROLE_CARD_THEMES[0]!;
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  }
  return ROLE_CARD_THEMES[Math.abs(h) % ROLE_CARD_THEMES.length]!;
}

/** Stesso indice di `getRoleTheme`: tinte nella card compatta del modale clienti. */
type CollaboratorCompactShell = {
  topBar: string;
  surface: string;
  surfaceHover: string;
  roleLabelCls: string;
  competenzaCls: string;
  activeBorder: string;
  activeRing: string;
  footerDivider: string;
  detailBtnHover: string;
  clientsBtn: string;
  /** Modale Dettaglio: bordo/fondo/sfumature panel */
  detailOuter: string;
  detailHeaderBg: string;
  detailBodyBg: string;
  detailDlLabel: string;
  detailCloseHover: string;
  detailDivider: string;
  detailAvatarRing: string;
};

const COLLAB_COMPACT_SHELLS: CollaboratorCompactShell[] = [
  {
    topBar:
      "from-teal-500 via-emerald-500 to-cyan-600 dark:from-teal-500 dark:via-emerald-600 dark:to-cyan-700",
    surface:
      "border-teal-200/70 bg-gradient-to-b from-teal-50/35 via-white to-white dark:border-teal-800/45 dark:from-teal-950/28 dark:via-slate-900 dark:to-slate-950",
    surfaceHover: "hover:bg-teal-50/25 dark:hover:bg-teal-950/15",
    roleLabelCls: "text-teal-700 dark:text-teal-300",
    competenzaCls: "text-slate-600 dark:text-teal-100/82",
    activeBorder: "border-teal-500 dark:border-teal-400",
    activeRing: "shadow-[0_0_0_2px] shadow-teal-400/45 dark:shadow-teal-500/35",
    footerDivider: "border-teal-100/95 dark:border-teal-900/35",
    detailBtnHover: "hover:border-teal-300/70 hover:bg-teal-50/60 dark:hover:border-teal-700 dark:hover:bg-teal-950/35",
    clientsBtn:
      "border-teal-200/90 bg-teal-50 text-teal-900 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-50 dark:hover:bg-teal-900/50",
    detailOuter:
      "border-teal-200/85 bg-white bg-gradient-to-b from-white via-white to-slate-50/95 shadow-2xl shadow-slate-900/[0.09] ring-1 ring-teal-500/15 dark:border-teal-800/55 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-black/45 dark:ring-teal-400/12",
    detailHeaderBg:
      "bg-gradient-to-br from-teal-50/95 via-white to-white dark:from-teal-950/42 dark:via-slate-950 dark:to-slate-950",
    detailBodyBg: "bg-white/85 dark:bg-slate-950/40",
    detailDlLabel:
      "text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-400",
    detailCloseHover:
      "hover:bg-teal-100/70 hover:text-teal-900 dark:hover:bg-teal-950/55 dark:hover:text-teal-50",
    detailDivider: "border-teal-100/95 dark:border-teal-900/32",
    detailAvatarRing:
      "ring-2 ring-teal-300/85 ring-offset-2 ring-offset-white dark:ring-teal-600/55 dark:ring-offset-slate-950",
  },
  {
    topBar:
      "from-rose-500 via-orange-400 to-amber-500 dark:from-rose-600 dark:via-orange-600 dark:to-amber-600",
    surface:
      "border-rose-200/70 bg-gradient-to-b from-rose-50/40 via-white to-white dark:border-rose-900/45 dark:from-rose-950/25 dark:via-slate-900 dark:to-slate-950",
    surfaceHover: "hover:bg-rose-50/30 dark:hover:bg-rose-950/20",
    roleLabelCls: "text-rose-700 dark:text-rose-300",
    competenzaCls: "text-slate-600 dark:text-rose-100/78",
    activeBorder: "border-rose-500 dark:border-rose-400",
    activeRing: "shadow-[0_0_0_2px] shadow-rose-400/45 dark:shadow-rose-500/38",
    footerDivider: "border-rose-100/95 dark:border-rose-900/35",
    detailBtnHover: "hover:border-rose-300/70 hover:bg-rose-50/55 dark:hover:border-rose-700 dark:hover:bg-rose-950/35",
    clientsBtn:
      "border-rose-200/90 bg-rose-50 text-rose-900 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/55 dark:text-rose-50 dark:hover:bg-rose-900/50",
    detailOuter:
      "border-rose-200/85 bg-white bg-gradient-to-b from-white via-white to-slate-50/95 shadow-2xl shadow-slate-900/[0.09] ring-1 ring-rose-500/15 dark:border-rose-900/52 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-black/45 dark:ring-rose-400/12",
    detailHeaderBg:
      "bg-gradient-to-br from-rose-50/95 via-white to-white dark:from-rose-950/38 dark:via-slate-950 dark:to-slate-950",
    detailBodyBg: "bg-white/85 dark:bg-slate-950/40",
    detailDlLabel:
      "text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-700 dark:text-rose-400",
    detailCloseHover:
      "hover:bg-rose-100/70 hover:text-rose-900 dark:hover:bg-rose-950/52 dark:hover:text-rose-50",
    detailDivider: "border-rose-100/95 dark:border-rose-900/32",
    detailAvatarRing:
      "ring-2 ring-rose-300/85 ring-offset-2 ring-offset-white dark:ring-rose-600/55 dark:ring-offset-slate-950",
  },
  {
    topBar:
      "from-sky-500 via-blue-500 to-indigo-600 dark:from-sky-600 dark:via-blue-600 dark:to-indigo-700",
    surface:
      "border-sky-200/75 bg-gradient-to-b from-sky-50/35 via-white to-white dark:border-sky-800/45 dark:from-sky-950/25 dark:via-slate-900 dark:to-slate-950",
    surfaceHover: "hover:bg-sky-50/30 dark:hover:bg-sky-950/18",
    roleLabelCls: "text-sky-800 dark:text-sky-300",
    competenzaCls: "text-slate-600 dark:text-sky-100/82",
    activeBorder: "border-sky-500 dark:border-sky-400",
    activeRing: "shadow-[0_0_0_2px] shadow-sky-400/45 dark:shadow-sky-500/38",
    footerDivider: "border-sky-100/95 dark:border-sky-900/35",
    detailBtnHover: "hover:border-sky-300/70 hover:bg-sky-50/55 dark:hover:border-sky-700 dark:hover:bg-sky-950/35",
    clientsBtn:
      "border-sky-200/90 bg-sky-50 text-sky-900 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:bg-sky-900/45",
    detailOuter:
      "border-sky-200/75 bg-white bg-gradient-to-b from-white via-white to-slate-50/95 shadow-2xl shadow-slate-900/[0.09] ring-1 ring-sky-500/14 dark:border-sky-800/52 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-black/45 dark:ring-sky-400/12",
    detailHeaderBg:
      "bg-gradient-to-br from-sky-50/95 via-white to-white dark:from-sky-950/38 dark:via-slate-950 dark:to-slate-950",
    detailBodyBg: "bg-white/85 dark:bg-slate-950/40",
    detailDlLabel:
      "text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-400",
    detailCloseHover:
      "hover:bg-sky-100/70 hover:text-sky-900 dark:hover:bg-sky-950/52 dark:hover:text-sky-50",
    detailDivider: "border-sky-100/95 dark:border-sky-900/32",
    detailAvatarRing:
      "ring-2 ring-sky-300/85 ring-offset-2 ring-offset-white dark:ring-sky-600/55 dark:ring-offset-slate-950",
  },
  {
    topBar:
      "from-emerald-500 via-lime-500 to-green-600 dark:from-emerald-600 dark:via-lime-600 dark:to-green-700",
    surface:
      "border-emerald-200/70 bg-gradient-to-b from-emerald-50/35 via-white to-white dark:border-emerald-900/44 dark:from-emerald-950/24 dark:via-slate-900 dark:to-slate-950",
    surfaceHover: "hover:bg-emerald-50/28 dark:hover:bg-emerald-950/18",
    roleLabelCls: "text-emerald-800 dark:text-emerald-300",
    competenzaCls: "text-slate-600 dark:text-emerald-100/78",
    activeBorder: "border-emerald-500 dark:border-emerald-400",
    activeRing: "shadow-[0_0_0_2px] shadow-emerald-400/45 dark:shadow-emerald-500/38",
    footerDivider: "border-emerald-100/95 dark:border-emerald-900/35",
    detailBtnHover: "hover:border-emerald-300/70 hover:bg-emerald-50/55 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/35",
    clientsBtn:
      "border-emerald-200/90 bg-emerald-50 text-emerald-950 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/55 dark:text-emerald-50 dark:hover:bg-emerald-900/50",
    detailOuter:
      "border-emerald-200/80 bg-white bg-gradient-to-b from-white via-white to-slate-50/95 shadow-2xl shadow-slate-900/[0.09] ring-1 ring-emerald-500/15 dark:border-emerald-900/50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-black/45 dark:ring-emerald-400/12",
    detailHeaderBg:
      "bg-gradient-to-br from-emerald-50/95 via-white to-white dark:from-emerald-950/38 dark:via-slate-950 dark:to-slate-950",
    detailBodyBg: "bg-white/85 dark:bg-slate-950/40",
    detailDlLabel:
      "text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-400",
    detailCloseHover:
      "hover:bg-emerald-100/70 hover:text-emerald-950 dark:hover:bg-emerald-950/52 dark:hover:text-emerald-50",
    detailDivider: "border-emerald-100/95 dark:border-emerald-900/32",
    detailAvatarRing:
      "ring-2 ring-emerald-300/85 ring-offset-2 ring-offset-white dark:ring-emerald-600/55 dark:ring-offset-slate-950",
  },
  {
    topBar:
      "from-fuchsia-500 via-purple-500 to-pink-500 dark:from-fuchsia-600 dark:via-purple-600 dark:to-pink-600",
    surface:
      "border-fuchsia-200/70 bg-gradient-to-b from-fuchsia-50/38 via-white to-white dark:border-fuchsia-900/42 dark:from-fuchsia-950/22 dark:via-slate-900 dark:to-slate-950",
    surfaceHover: "hover:bg-fuchsia-50/28 dark:hover:bg-fuchsia-950/15",
    roleLabelCls: "text-purple-800 dark:text-fuchsia-300",
    competenzaCls: "text-slate-600 dark:text-fuchsia-100/78",
    activeBorder: "border-fuchsia-500 dark:border-fuchsia-400",
    activeRing: "shadow-[0_0_0_2px] shadow-fuchsia-400/42 dark:shadow-fuchsia-500/35",
    footerDivider: "border-fuchsia-100/95 dark:border-fuchsia-900/33",
    detailBtnHover: "hover:border-fuchsia-300/70 hover:bg-fuchsia-50/55 dark:hover:border-fuchsia-700 dark:hover:bg-fuchsia-950/32",
    clientsBtn:
      "border-fuchsia-200/90 bg-fuchsia-50 text-purple-950 hover:bg-fuchsia-100 dark:border-purple-900/60 dark:bg-fuchsia-950/45 dark:text-fuchsia-100 dark:hover:bg-fuchsia-900/42",
    detailOuter:
      "border-fuchsia-200/75 bg-white bg-gradient-to-b from-white via-white to-slate-50/95 shadow-2xl shadow-slate-900/[0.09] ring-1 ring-fuchsia-500/14 dark:border-fuchsia-900/48 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-black/45 dark:ring-fuchsia-400/11",
    detailHeaderBg:
      "bg-gradient-to-br from-fuchsia-50/95 via-white to-white dark:from-fuchsia-950/32 dark:via-slate-950 dark:to-slate-950",
    detailBodyBg: "bg-white/85 dark:bg-slate-950/40",
    detailDlLabel:
      "text-[10px] font-semibold uppercase tracking-[0.14em] text-purple-800 dark:text-fuchsia-400",
    detailCloseHover:
      "hover:bg-fuchsia-100/70 hover:text-purple-950 dark:hover:bg-fuchsia-950/45 dark:hover:text-fuchsia-50",
    detailDivider: "border-fuchsia-100/92 dark:border-fuchsia-900/30",
    detailAvatarRing:
      "ring-2 ring-fuchsia-300/85 ring-offset-2 ring-offset-white dark:ring-fuchsia-600/52 dark:ring-offset-slate-950",
  },
  {
    topBar:
      "from-amber-500 via-orange-400 to-yellow-500 dark:from-amber-600 dark:via-orange-600 dark:to-yellow-600",
    surface:
      "border-amber-200/72 bg-gradient-to-b from-amber-50/40 via-white to-white dark:border-amber-900/44 dark:from-amber-950/24 dark:via-slate-900 dark:to-slate-950",
    surfaceHover: "hover:bg-amber-50/30 dark:hover:bg-amber-950/14",
    roleLabelCls: "text-amber-900 dark:text-amber-300",
    competenzaCls: "text-slate-600 dark:text-amber-100/78",
    activeBorder: "border-amber-500 dark:border-amber-400",
    activeRing: "shadow-[0_0_0_2px] shadow-amber-400/42 dark:shadow-amber-500/35",
    footerDivider: "border-amber-100/95 dark:border-amber-900/34",
    detailBtnHover: "hover:border-amber-300/70 hover:bg-amber-50/58 dark:hover:border-amber-700 dark:hover:bg-amber-950/32",
    clientsBtn:
      "border-amber-200/90 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-900/65 dark:bg-amber-950/50 dark:text-amber-50 dark:hover:bg-amber-900/42",
    detailOuter:
      "border-amber-200/78 bg-white bg-gradient-to-b from-white via-white to-slate-50/95 shadow-2xl shadow-slate-900/[0.09] ring-1 ring-amber-500/14 dark:border-amber-900/52 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-black/45 dark:ring-amber-400/11",
    detailHeaderBg:
      "bg-gradient-to-br from-amber-50/95 via-white to-white dark:from-amber-950/35 dark:via-slate-950 dark:to-slate-950",
    detailBodyBg: "bg-white/85 dark:bg-slate-950/40",
    detailDlLabel:
      "text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-900 dark:text-amber-400",
    detailCloseHover:
      "hover:bg-amber-100/72 hover:text-amber-950 dark:hover:bg-amber-950/48 dark:hover:text-amber-50",
    detailDivider: "border-amber-100/95 dark:border-amber-900/32",
    detailAvatarRing:
      "ring-2 ring-amber-300/85 ring-offset-2 ring-offset-white dark:ring-amber-600/52 dark:ring-offset-slate-950",
  },
];

function collaboratorCompactShell(roleId: string): CollaboratorCompactShell {
  const key = norm(roleId);
  if (!key) return COLLAB_COMPACT_SHELLS[0]!;
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  }
  return COLLAB_COMPACT_SHELLS[Math.abs(h) % COLLAB_COMPACT_SHELLS.length]!;
}

function collaboratorInitials(r: Collaborator): string {
  const a = norm(r.firstName).charAt(0);
  const b = norm(r.lastName).charAt(0);
  return `${a}${b}`.toUpperCase() || "?";
}

function CollaboratorTableAvatar({ row: r }: { row: Collaborator }) {
  const [imgFailed, setImgFailed] = useState(false);
  const theme = useMemo(() => getRoleTheme(r.roleId), [r.roleId]);
  const photo = norm(r.photoUrl);
  const showImg = Boolean(photo) && !imgFailed;

  useEffect(() => setImgFailed(false), [r.id, r.photoUrl]);

  return (
    <div
      className="h-10 w-10 shrink-0 overflow-hidden rounded-xl ring-2 ring-white shadow-md dark:ring-slate-800"
      aria-hidden={showImg ? undefined : true}
    >
      {showImg ? (
        <img
          alt=""
          src={photo}
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center bg-gradient-to-br text-[11px] font-bold ${theme.initialsBg} ${theme.initialsText}`}
        >
          {collaboratorInitials(r)}
        </div>
      )}
    </div>
  );
}

function FieldRow({
  label,
  children,
  valueClass,
  labelClassName = "text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400",
}: {
  label: string;
  children: ReactNode;
  valueClass?: string;
  labelClassName?: string;
}) {
  return (
    <div className="space-y-0.5">
      <dt className={labelClassName}>{label}</dt>
      <dd
        className={
          valueClass ??
          "break-words text-[12px] font-medium leading-snug text-slate-800 dark:text-slate-100"
        }
      >
        {children}
      </dd>
    </div>
  );
}

function AssociatedClientsMiniDialog({
  open,
  onClose,
  title,
  resolvedClients,
  requestedIdCount,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  resolvedClients: Client[];
  /** Numero di ID richiesti (può superare i risolti). */
  requestedIdCount: number;
}) {
  if (!open) return null;

  const missing = Math.max(0, requestedIdCount - resolvedClients.length);

  const openSite = (c: Client) => {
    const href = normalizeWebsiteUrl(c.websiteUrl);
    if (!href) {
      toast.error("URL sito non disponibile");
      return;
    }
    void api.openHttpsUrl(href).catch((e) => toast.error(formatErr(e)));
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      aria-modal="true"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative max-h-[min(72vh,26rem)] w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950"
        role="dialog"
        aria-labelledby="associated-clients-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <h2
              id="associated-clients-title"
              className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-50"
            >
              {title}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Dati anagrafici essenziali
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Chiudi"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="max-h-[min(58vh,20rem)] space-y-2.5 overflow-y-auto p-4">
          {missing > 0 ? (
            <p className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-[11px] text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/30 dark:text-amber-100">
              {missing === 1
                ? "Un cliente collegato non risulta nell’anagrafica attuale."
                : `${missing} clienti collegati non risultano nell’anagrafica attuale.`}
            </p>
          ) : null}
          {resolvedClients.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Nessun cliente risolto in anagrafica.
            </p>
          ) : (
            resolvedClients.map((c) => {
              const href = normalizeWebsiteUrl(c.websiteUrl);
              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-slate-200/85 bg-slate-50/50 px-3.5 py-3 dark:border-slate-700 dark:bg-slate-900/55"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300">
                      <Building2 size={15} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{c.name}</p>
                      {norm(c.location) ? (
                        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                          <MapPin size={13} className="mt-0.5 shrink-0 opacity-75" aria-hidden />
                          <span>{norm(c.location)}</span>
                        </p>
                      ) : null}
                      {norm(c.description) ? (
                        <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                          {norm(c.description)}
                        </p>
                      ) : null}
                      {href ? (
                        <button
                          type="button"
                          onClick={() => openSite(c)}
                          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-2 py-1 text-[11px] font-semibold text-sky-700 shadow-sm hover:bg-sky-50 dark:border-slate-600 dark:bg-slate-800 dark:text-sky-400 dark:hover:bg-sky-950/40"
                        >
                          <Globe size={13} aria-hidden />
                          Apri sito
                        </button>
                      ) : (
                        <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                          Sito non indicato in anagrafica
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function ClientAssociationsTableCell({
  clientIds,
  allClients,
  onOpenList,
}: {
  clientIds: string[];
  allClients: Client[];
  onOpenList: (ids: string[]) => void;
}) {
  const rawIds = useMemo(() => clientIds.filter((id) => norm(id)), [clientIds]);
  const resolved = useMemo(() => clientsForIds(allClients, clientIds), [allClients, clientIds]);

  const nIds = rawIds.length;
  if (nIds === 0) return <span className="text-slate-400">—</span>;

  if (nIds === 1) {
    const name = resolved[0]?.name ?? null;
    if (name)
      return (
        <span
          className="line-clamp-2 font-medium text-slate-800 dark:text-slate-100"
          title={name}
        >
          {name}
        </span>
      );
    return (
      <span
        className="text-[11px] font-medium text-amber-800 dark:text-amber-200"
        title="Cliente non trovato in anagrafica"
      >
        Non in rubrica clienti
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenList(rawIds);
      }}
      title="Visualizza tutti i clienti associati"
      className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200/90 bg-teal-50 px-2.5 py-1 text-left text-[11px] font-semibold text-teal-900 shadow-sm transition hover:bg-teal-100 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-100 dark:hover:bg-teal-950/65"
    >
      <Building2 size={13} className="shrink-0 opacity-80" aria-hidden />
      <span>{nIds} clienti</span>
    </button>
  );
}

function CollaboratorCompactCard({
  row: r,
  active,
  onSelect,
  competencyCatalog,
  clients,
  onShowDetails,
  onShowClientList,
}: {
  row: Collaborator;
  active: boolean;
  onSelect: () => void;
  competencyCatalog: CollaboratorCompetencyDef[];
  clients: Client[];
  onShowDetails: (row: Collaborator) => void;
  onShowClientList: (ids: string[]) => void;
}) {
  const shell = useMemo(() => collaboratorCompactShell(r.roleId), [r.roleId]);
  const rawClientIds = useMemo(() => r.clientIds.filter((id) => norm(id)), [r.clientIds]);
  const resolvedClients = useMemo(() => clientsForIds(clients, r.clientIds), [clients, r.clientIds]);
  const clientBtnCount = rawClientIds.length;
  const competenze = competencyLabels(competencyCatalog, r.competencyPresetIds);
  const roleText = norm(r.roleLabel) || "—";
  const nameText = collaboratorCardName(r);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border shadow-md ring-offset-2 ring-offset-white transition-all dark:ring-offset-slate-950",
        shell.surface,
        active
          ? cn(shell.activeBorder, shell.activeRing)
          : "hover:shadow-[0_8px_30px_-8px_rgba(15,23,42,0.12)] dark:hover:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.45)]",
      )}
    >
      <div
        className={cn("pointer-events-none h-1 w-full shrink-0 bg-gradient-to-r", shell.topBar)}
        aria-hidden
      />
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full min-w-0 flex-1 gap-3 p-3.5 pb-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-slate-400/50",
          shell.surfaceHover,
        )}
      >
        <div className="pt-0.5">
          <CollaboratorTableAvatar row={r} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p
              className={cn(
                "line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight",
                shell.roleLabelCls,
              )}
              title={roleText}
            >
              {roleText}
            </p>
          </div>
          <div className="border-t border-slate-900/[0.05] pt-2 dark:border-white/[0.06]">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Competenze
            </span>
            <p
              className={cn("mt-1 line-clamp-2 text-[12px] leading-relaxed font-medium", shell.competenzaCls)}
              title={competenze !== "—" ? competenze : undefined}
            >
              {competenze}
            </p>
          </div>
          <div className="pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Nominativo
            </span>
            <p className="mt-1 line-clamp-1 text-sm font-semibold text-slate-800 dark:text-slate-50" title={nameText}>
              {nameText}
            </p>
          </div>
        </div>
      </button>

      <div
        className={cn(
          "flex flex-wrap gap-2 border-t bg-black/[0.02] px-3 py-2.5 backdrop-blur-[2px] dark:bg-white/[0.03]",
          shell.footerDivider,
        )}
      >
        <button
          type="button"
          onClick={() => onShowDetails(r)}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200/90 bg-white/90 px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 shadow-sm sm:flex-none dark:border-slate-600 dark:bg-slate-950/65 dark:text-slate-100",
            shell.detailBtnHover,
          )}
          title="Tutti i dati di contatto e collegamenti"
        >
          <Info size={13} aria-hidden />
          Dettagli
        </button>
        {clientBtnCount > 1 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShowClientList(rawClientIds);
            }}
            title={
              resolvedClients.length < clientBtnCount
                ? `${clientBtnCount} clienti (alcuni non risolti in anagrafica)`
                : `Elenco ${clientBtnCount} clienti`
            }
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold shadow-sm transition sm:flex-none",
              shell.clientsBtn,
            )}
          >
            <Building2 size={13} aria-hidden />
            {clientBtnCount} clienti
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CollaboratorCardInner({
  row: r,
  competencyCatalog,
  theme,
  animateAvatar = true,
  clientsLine,
}: {
  row: Collaborator;
  competencyCatalog: CollaboratorCompetencyDef[];
  theme: RoleCardTheme;
  animateAvatar?: boolean;
  clientsLine?: string | null;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const photo = norm(r.photoUrl);
  const showImg = Boolean(photo) && !imgFailed;
  const competenze = competencyLabels(competencyCatalog, r.competencyPresetIds);

  useEffect(() => {
    setImgFailed(false);
  }, [r.id, r.photoUrl]);

  const avatarMotion = animateAvatar
    ? "transition duration-500 ease-out will-change-transform group-hover:scale-[1.12] group-hover:rotate-[-2deg]"
    : "transition duration-300 ease-out group-hover:scale-[1.04]";

  const ringMotion = animateAvatar
    ? "transition-all duration-300 ease-out group-hover:scale-[1.06] group-hover:shadow-xl "
    : "transition-all duration-300 ";

  const lc = theme.fieldLabel;

  return (
    <>
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full ${theme.blobTop}`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute -bottom-6 left-0 h-20 w-20 rounded-full ${theme.blobBottom}`}
      />

      <div className={`relative h-20 shrink-0 overflow-hidden bg-gradient-to-r ${theme.heroStrip}`}>
        <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(255,255,255,.2)_0%,transparent_45%,transparent_55%,rgba(255,255,255,.08)_100%)] opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,.35),transparent_55%)]" />
      </div>

      <div className="relative flex flex-col items-center px-3.5 pb-4 pt-0">
        <div className="relative -mt-14 flex justify-center">
          <div
            className={`rounded-full bg-gradient-to-br p-[3px] shadow-lg ${ringMotion} ${theme.avatarGlow} ${theme.avatarRing}`}
          >
            <div className="rounded-full bg-white p-1 dark:bg-slate-950">
              <div className="relative h-[7.25rem] w-[7.25rem] overflow-hidden rounded-full bg-gradient-to-br from-slate-100 to-slate-200 ring-[3px] ring-white dark:from-slate-800 dark:to-slate-900 dark:ring-slate-950">
                {showImg ? (
                  <img
                    alt=""
                    src={photo}
                    className={`h-full w-full object-cover ${avatarMotion}`}
                    onError={() => setImgFailed(true)}
                  />
                ) : (
                  <div
                    className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${theme.initialsBg}`}
                  >
                    <span className={`text-4xl font-bold tracking-tight sm:text-[2.75rem] ${theme.initialsText}`}>
                      {collaboratorInitials(r)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex w-full min-w-0 flex-col gap-2.5 text-left">
          {/* Incarico come prima informazione, ben visibile */}
          <div className="w-full rounded-xl border border-white/60 bg-white/92 px-3 py-3 text-center shadow-[0_2px_12px_-2px_rgba(0,0,0,0.08)] dark:border-slate-700/80 dark:bg-slate-950/88">
            <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${theme.fieldLabel}`}>
              Ruolo
            </p>
            <p
              className={`mt-1.5 line-clamp-3 text-lg font-extrabold leading-[1.15] tracking-tight sm:text-xl ${theme.nameLabel}`}
              title={norm(r.roleLabel) || undefined}
            >
              {norm(r.roleLabel) ? (
                norm(r.roleLabel)
              ) : (
                <span className="font-bold text-slate-400 dark:text-slate-500">—</span>
              )}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Nome e cognome
            </p>
            <p className="mt-1 line-clamp-2 text-base font-semibold leading-tight tracking-tight text-slate-900 dark:text-white">
              {collaboratorCardName(r)}
            </p>
          </div>

          <dl className="space-y-2.5">
            <FieldRow label="Competenze" labelClassName={lc}>
              {competenze}
            </FieldRow>
            {clientsLine ? (
              <FieldRow label="Clienti gestiti" labelClassName={lc}>
                <span className="text-[12px] font-medium">{clientsLine}</span>
              </FieldRow>
            ) : null}
            <FieldRow
              label="Email"
              labelClassName={lc}
              valueClass="truncate text-[12px] font-medium text-emerald-700 dark:text-emerald-400"
            >
              {norm(r.email) ? (
                <span title={norm(r.email)}>{norm(r.email)}</span>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">—</span>
              )}
            </FieldRow>
            <FieldRow
              label="Telefono"
              labelClassName={lc}
              valueClass="truncate font-mono text-[12px] font-medium text-slate-800 dark:text-slate-200"
            >
              {norm(r.phone) ? (
                <span title={norm(r.phone)}>{norm(r.phone)}</span>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">—</span>
              )}
            </FieldRow>
            <FieldRow label="Profilo LinkedIn" labelClassName={lc}>
              {norm(r.linkedinUrl) ? (
                <span
                  className="break-all text-[12px] font-medium text-sky-700 dark:text-sky-400"
                  title={norm(r.linkedinUrl)}
                >
                  {norm(r.linkedinUrl)}
                </span>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">—</span>
              )}
            </FieldRow>
          </dl>
        </div>
      </div>
    </>
  );
}

export function CollaboratorQuickContactButtons({
  row,
  disabled = false,
  className,
}: {
  row: Collaborator;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto mt-5 flex w-full max-w-[22rem] flex-wrap justify-center gap-2.5",
        className,
      )}
    >
      <button
        type="button"
        disabled={disabled || !norm(row.phone)}
        onClick={() =>
          void api.dialPhoneNumber(norm(row.phone)).catch((e) => toast.error(formatErr(e)))
        }
        className={CONTACT_CALL_BUTTON_QUICK_STRIP_CLASS}
      >
        <Phone size={16} aria-hidden strokeWidth={2.25} /> Chiama
      </button>
      <button
        type="button"
        disabled={disabled || !norm(row.email)}
        onClick={() =>
          void api.openContactMailto(norm(row.email)).catch((e) =>
            toast.error(formatErr(e)),
          )
        }
        className={CONTACT_MAIL_BUTTON_QUICK_STRIP_CLASS}
      >
        <Mail size={16} aria-hidden strokeWidth={2.25} /> Mail
      </button>
      <button
        type="button"
        disabled={disabled || !norm(row.linkedinUrl)}
        onClick={() =>
          void api.openHttpsUrl(norm(row.linkedinUrl)).catch((e) =>
            toast.error(formatErr(e)),
          )
        }
        className="inline-flex min-w-[7rem] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold shadow-sm transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-45 dark:border-slate-600 dark:bg-slate-900 dark:hover:border-sky-600 dark:hover:bg-sky-950/40"
      >
        <Linkedin size={16} aria-hidden /> LinkedIn
      </button>
    </div>
  );
}

function CollaboratorDetailDialog({
  open,
  row,
  clients,
  competencyCatalog,
  onClose,
  onOpenClientList,
}: {
  open: boolean;
  row: Collaborator | null;
  clients: Client[];
  competencyCatalog: CollaboratorCompetencyDef[];
  onClose: () => void;
  onOpenClientList: (ids: string[]) => void;
}) {
  const [imgFail, setImgFail] = useState(false);

  useEffect(() => {
    setImgFail(false);
  }, [row?.id, row?.photoUrl]);

  if (!open || !row) return null;

  const shell = collaboratorCompactShell(row.roleId);
  const themeAvatar = getRoleTheme(row.roleId);
  const competenze = competencyLabels(competencyCatalog, row.competencyPresetIds);
  const rawClientIds = row.clientIds.filter((id) => norm(id));
  const resolvedForCollab = clientsForIds(clients, row.clientIds);

  const photo = norm(row.photoUrl);
  const showImg = Boolean(photo) && !imgFail;

  const fieldLabelCls = shell.detailDlLabel;
  const valueDefault = "text-[13px] font-medium leading-relaxed text-slate-800 dark:text-slate-100";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      onClick={onClose}
      aria-modal="true"
      role="presentation"
    >
      <div
        className={cn(
          "max-h-[min(90vh,40rem)] w-full max-w-md overflow-hidden rounded-2xl shadow-2xl",
          shell.detailOuter,
        )}
        role="dialog"
        aria-labelledby="collab-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            "pointer-events-none h-1.5 w-full shrink-0 bg-gradient-to-r",
            shell.topBar,
          )}
          aria-hidden
        />

        <div
          className={cn(
            "flex shrink-0 items-start justify-between gap-3 border-b px-5 pb-4 pt-4",
            shell.detailHeaderBg,
            shell.detailDivider,
          )}
        >
          <div className="flex min-w-0 flex-1 gap-4">
            <div
              className={cn(
                "h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-white shadow-inner",
                shell.detailAvatarRing,
              )}
            >
              {showImg ? (
                <img
                  alt=""
                  src={photo}
                  className="h-full w-full object-cover"
                  onError={() => setImgFail(true)}
                />
              ) : (
                <div
                  className={cn(
                    "flex h-full w-full items-center justify-center bg-gradient-to-br text-[15px] font-bold tracking-tight",
                    themeAvatar.initialsBg,
                    themeAvatar.initialsText,
                  )}
                >
                  {collaboratorInitials(row)}
                </div>
              )}
            </div>
            <div className="min-w-0 pt-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                Collaboratore interno
              </p>
              <h2
                id="collab-detail-title"
                className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-white"
              >
                {collaboratorCardName(row)}
              </h2>
              <p
                className={cn(
                  "mt-2 line-clamp-3 text-sm font-semibold leading-snug",
                  shell.roleLabelCls,
                )}
              >
                {norm(row.roleLabel) || "Senza incarico"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "shrink-0 rounded-xl p-2 text-slate-500 transition-colors dark:text-slate-400",
              shell.detailCloseHover,
            )}
            aria-label="Chiudi"
          >
            <X size={21} aria-hidden />
          </button>
        </div>

        <div className={cn("max-h-[min(74vh,calc(100%-11rem))] overflow-y-auto", shell.detailBodyBg)}>
          <div className="space-y-4 px-5 pb-5 pt-4">
            <section className="rounded-xl border border-slate-200/70 bg-white/75 p-4 shadow-sm backdrop-blur-[2px] dark:border-slate-700/65 dark:bg-slate-900/45">
              <dl className="space-y-4">
                <FieldRow label="Competenze" labelClassName={fieldLabelCls} valueClass={cn(valueDefault, shell.competenzaCls)}>
                  {competenze}
                </FieldRow>

                <div className="space-y-1.5 border-t border-slate-100 pt-4 dark:border-slate-700/65">
                  <dt className={fieldLabelCls}>Clienti associati</dt>
                  <dd className="flex flex-wrap items-center gap-2 pt-0.5">
                    {rawClientIds.length === 0 ? (
                      <span className={valueDefault}>—</span>
                    ) : rawClientIds.length === 1 && resolvedForCollab.length === 1 ? (
                      <span className={cn(valueDefault, "font-semibold text-slate-900 dark:text-slate-50")}>
                        {resolvedForCollab[0]!.name}
                      </span>
                    ) : rawClientIds.length === 1 && resolvedForCollab.length === 0 ? (
                      <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        Non presente in rubrica clienti
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenClientList(rawClientIds)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition",
                          shell.clientsBtn,
                        )}
                      >
                        <Building2 size={14} aria-hidden />
                        Apri elenco ({rawClientIds.length})
                      </button>
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-slate-200/70 bg-white/75 p-4 shadow-sm backdrop-blur-[2px] dark:border-slate-700/65 dark:bg-slate-900/45">
              <p className={cn(fieldLabelCls, "mb-3 tracking-[0.16em]")}>Contatti</p>
              <dl className="space-y-3.5">
                <FieldRow
                  label="Email"
                  labelClassName={fieldLabelCls}
                  valueClass={cn(valueDefault, "break-all text-emerald-800 dark:text-emerald-400")}
                >
                  {norm(row.email) ? norm(row.email) : "—"}
                </FieldRow>
                <FieldRow
                  label="Telefono"
                  labelClassName={fieldLabelCls}
                  valueClass={cn(valueDefault, "font-mono")}
                >
                  {norm(row.phone) ? norm(row.phone) : "—"}
                </FieldRow>
                <FieldRow
                  label="LinkedIn"
                  labelClassName={fieldLabelCls}
                  valueClass={cn(valueDefault, "break-all text-sky-700 dark:text-sky-400")}
                >
                  {norm(row.linkedinUrl) ? norm(row.linkedinUrl) : "—"}
                </FieldRow>
              </dl>
            </section>

            <section className="rounded-xl border border-slate-200/72 bg-white/80 px-4 py-3.5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/50">
              <CollaboratorQuickContactButtons
                row={row}
                className="mx-0 mt-0 max-w-none justify-center gap-2 sm:justify-between"
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CollaboratorPageCardPreview({
  row: r,
  competencyCatalog,
  clients,
}: {
  row: Collaborator;
  competencyCatalog: CollaboratorCompetencyDef[];
  clients: Client[];
}) {
  const theme = useMemo(() => getRoleTheme(r.roleId), [r.roleId]);
  const cl = clientLabels(clients, r.clientIds);
  const clientsLine = cl !== "—" ? cl : null;

  return (
    <div
      className={`group relative flex w-full flex-col overflow-hidden rounded-2xl border-2 bg-gradient-to-b shadow-lg transition-all duration-300 hover:shadow-xl ${theme.cardBg} ${theme.borderIdle}`}
    >
      <CollaboratorCardInner
        row={r}
        competencyCatalog={competencyCatalog}
        theme={theme}
        animateAvatar
        clientsLine={clientsLine}
      />
    </div>
  );
}

export function CollaboratorsBook({
  clients,
  competencyCatalog,
  reloadCompetencyCatalog,
  lockedClientId,
  variant,
  cardGrid = false,
  onClose,
}: Props) {
  const vaultConfigured = useAppStore((s) => s.vaultConfigured);
  const [rows, setRows] = useState<Collaborator[]>([]);
  const [roles, setRoles] = useState<CollaboratorRole[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [clientListDialogIds, setClientListDialogIds] = useState<string[] | null>(null);
  const [detailCollaborator, setDetailCollaborator] = useState<Collaborator | null>(null);
  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!api.isTauriRuntime()) return;
    setBusy(true);
    try {
      const [all, rl] = await Promise.all([
        lockedClientId?.trim()
          ? api.getCollaboratorsForClient(lockedClientId.trim())
          : api.getCollaborators(),
        api.getCollaboratorRoles(),
      ]);
      setRows(all);
      setRoles(rl);
      setSelectedId((cur) => (cur && all.some((r) => r.id === cur) ? cur : null));
    } catch (e) {
      toast.error(formatErr(e));
    } finally {
      setBusy(false);
    }
  }, [lockedClientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return rows;
    return rows.filter((r) => {
      const blob = [
        collaboratorCardName(r),
        norm(r.roleLabel),
        norm(r.email),
        norm(r.phone),
        norm(r.linkedinUrl),
        clientLabels(clients, r.clientIds),
        competencyLabels(competencyCatalog, r.competencyPresetIds),
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(ql);
    });
  }, [rows, q, clients, competencyCatalog]);

  const sel = filtered.find((r) => r.id === selectedId) ?? null;

  const lock = lockedClientId?.trim() ?? "";
  const lockedClientName = lock ? clients.find((c) => c.id === lock)?.name?.trim() || lock : null;

  const headerTitle =
    lockedClientName != null ? `Team · ${lockedClientName}` : "Collaboratori interni";

  const subtitle =
    lockedClientName != null
      ? "Persone interne collegate al cliente selezionato."
      : "Anagrafica team: incarichi, clienti seguiti e competenze (catalogo Impostazioni).";

  const useCardGrid = Boolean(cardGrid && variant === "modal");

  const shellCls =
    variant === "modal"
      ? useCardGrid
        ? "max-h-[min(85vh,calc(100vh-2.5rem))] min-h-[min(480px,55vh)] overflow-hidden flex flex-col"
        : "max-h-[min(85vh,calc(100vh-3rem))] min-h-[min(420px,50vh)] overflow-hidden flex flex-col"
      : "";

  const pageListChromeCls =
    variant === "page" ? "flex min-h-0 flex-1 flex-col gap-4" : "";

  const tableColSpan = lock ? 6 : 7;

  const body = (
    <>
      {!api.isTauriRuntime() ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-100">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <Users size={18} aria-hidden />
          </span>
          <div>
            <p className="font-semibold leading-tight">Collaboratori nell&apos;app desktop</p>
            <p className="mt-1 text-xs opacity-90">
              L&apos;anagrafica interna è disponibile nell&apos;applicazione Tauri installata sul PC.
            </p>
          </div>
        </div>
      ) : null}

      {api.isTauriRuntime() ? (
        <div className={cn(pageListChromeCls)}>
          <div className="flex shrink-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-[min(100%,14rem)] flex-1 lg:max-w-md">
              <label className="sr-only" htmlFor="collab-search">
                Cerca collaboratori
              </label>
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                aria-hidden
              />
              <input
                id="collab-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nome, email, incarico, competenze, clienti…"
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
                title="Nuovo collaboratore"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-45 dark:shadow-emerald-950/40"
              >
                <Plus size={16} aria-hidden /> Nuovo
              </button>
              {variant === "page" && api.isTauriRuntime() ? (
                <button
                  type="button"
                  disabled={busy || roles.length === 0}
                  title={
                    vaultConfigured
                      ? "Incolla più righe; serve la master password del vault per importare"
                      : "Configura il vault in Impostazioni → Credenziali"
                  }
                  onClick={() => setBulkPasteOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50/80 px-3.5 py-2 text-xs font-semibold text-teal-900 shadow-sm transition hover:bg-teal-100/90 disabled:pointer-events-none disabled:opacity-45 dark:border-teal-500/40 dark:bg-teal-950/40 dark:text-teal-100 dark:hover:bg-teal-950/60"
                >
                  Inserimento multiplo
                </button>
              ) : null}
              <button
                type="button"
                disabled={!sel || busy}
                onClick={() => sel && setEditor({ mode: "edit", row: sel })}
                title="Modifica collaboratore"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-45 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Pencil size={15} aria-hidden /> Modifica
              </button>
              <button
                type="button"
                disabled={!sel || busy}
                onClick={() => sel && setDelId(sel.id)}
                title="Elimina collaboratore"
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:pointer-events-none disabled:opacity-45 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/50"
              >
                <Trash2 size={15} aria-hidden /> Elimina
              </button>
              <span className="mx-1 hidden h-7 w-px bg-slate-200 sm:inline dark:bg-slate-600" aria-hidden />
              <button
                type="button"
                disabled={!sel || busy || !norm(sel.phone)}
                onClick={() =>
                  sel &&
                  void api.dialPhoneNumber(norm(sel.phone)).catch((e) => toast.error(formatErr(e)))
                }
                title="Componi numero"
                className={CONTACT_CALL_BUTTON_MD_CLASS}
              >
                <Phone size={15} aria-hidden strokeWidth={2} /> Chiama
              </button>
              <button
                type="button"
                disabled={!sel || busy || !norm(sel.email)}
                onClick={() =>
                  sel &&
                  void api.openContactMailto(norm(sel.email)).catch((e) =>
                    toast.error(formatErr(e)),
                  )
                }
                title="Apri cliente di posta"
                className={CONTACT_MAIL_BUTTON_MD_CLASS}
              >
                <Mail size={15} aria-hidden strokeWidth={2} /> Email
              </button>
              <button
                type="button"
                disabled={!sel || busy || !norm(sel.linkedinUrl)}
                onClick={() =>
                  sel &&
                  void api.openHttpsUrl(norm(sel.linkedinUrl)).catch((e) =>
                    toast.error(formatErr(e)),
                  )
                }
                title="Apri profilo LinkedIn"
                className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs font-semibold text-sky-900 shadow-sm transition hover:bg-sky-100 disabled:pointer-events-none disabled:opacity-45 dark:border-sky-600/50 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-950/60"
              >
                <Linkedin size={15} aria-hidden /> LinkedIn
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
                <Loader2 className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" aria-hidden />
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-auto p-0.5">
              {useCardGrid ? (
                filtered.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center text-slate-500 dark:text-slate-400">
                    <Users className="mb-3 h-12 w-12 text-slate-200 dark:text-slate-600" aria-hidden />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Nessun collaboratore per questo cliente
                    </p>
                    <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-500">
                      Usa <span className="font-medium">Nuovo</span> per aggiungere il primo profilo al team.
                    </p>
                  </div>
                ) : (
                  <div className="grid w-full gap-3 p-3 [grid-template-columns:repeat(auto-fill,minmax(14.5rem,1fr))]">
                    {filtered.map((r) => (
                      <CollaboratorCompactCard
                        key={r.id}
                        row={r}
                        active={selectedId === r.id}
                        competencyCatalog={competencyCatalog}
                        clients={clients}
                        onSelect={() => setSelectedId(r.id)}
                        onShowDetails={setDetailCollaborator}
                        onShowClientList={(ids) => setClientListDialogIds(ids)}
                      />
                    ))}
                  </div>
                )
              ) : (
                <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-[1] border-b border-slate-200/90 bg-gradient-to-r from-teal-50 via-slate-50 to-white text-[11px] font-bold uppercase tracking-wider text-slate-600 shadow-sm dark:border-slate-700 dark:from-teal-950/55 dark:via-slate-900 dark:to-slate-950 dark:text-slate-400">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3.5">Foto</th>
                      {!lock ? (
                        <th className="whitespace-nowrap px-4 py-3.5">
                          <span className="inline-flex items-center gap-1.5">
                            <Building2 size={14} className="opacity-70" aria-hidden />
                            Clienti
                          </span>
                        </th>
                      ) : null}
                      <th className="whitespace-nowrap px-4 py-3.5">Nome</th>
                      <th className="whitespace-nowrap px-4 py-3.5">Incarico</th>
                      <th className="whitespace-nowrap px-4 py-3.5">Competenze</th>
                      <th className="whitespace-nowrap px-4 py-3.5">Email</th>
                      <th className="whitespace-nowrap px-4 py-3.5">Tel.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filtered.length === 0 ? (
                      <tr>
                        <td
                          colSpan={tableColSpan}
                          className="px-6 py-16 text-center align-middle text-slate-500 dark:text-slate-400"
                        >
                          <Users className="mx-auto mb-3 h-12 w-12 text-slate-200 dark:text-slate-600" aria-hidden />
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {rows.length === 0
                              ? "Nessun collaboratore in anagrafica"
                              : "Nessun risultato per la ricerca"}
                          </p>
                          <p className="mt-1 max-w-sm mx-auto text-xs text-slate-500 dark:text-slate-500">
                            {rows.length === 0
                              ? "Usa «Nuovo» per creare il primo profilo interno."
                              : "Prova un altro termine o svuota il filtro di ricerca."}
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
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedId(r.id);
                              }
                            }}
                            className={cn(
                              "cursor-pointer transition-colors",
                              active
                                ? "bg-teal-50/90 dark:bg-teal-950/30"
                                : "hover:bg-slate-50/90 dark:hover:bg-slate-900/50",
                            )}
                          >
                            <td
                              className={cn(
                                "px-4 py-3 align-middle",
                                active
                                  ? "border-l-[3px] border-l-teal-600 dark:border-l-teal-400"
                                  : "border-l-[3px] border-l-transparent",
                              )}
                            >
                              <CollaboratorTableAvatar row={r} />
                            </td>
                            {!lock ? (
                              <td className="max-w-[12rem] px-4 py-3 align-middle">
                                <ClientAssociationsTableCell
                                  clientIds={r.clientIds}
                                  allClients={clients}
                                  onOpenList={(ids) => setClientListDialogIds(ids)}
                                />
                              </td>
                            ) : null}
                            <td className="px-4 py-3 align-middle font-semibold text-slate-900 dark:text-slate-50">
                              <span className="line-clamp-2">{collaboratorCardName(r)}</span>
                            </td>
                            <td className="max-w-[11rem] px-4 py-3 align-middle">
                              {norm(r.roleLabel) ? (
                                <span className="inline-flex max-w-full rounded-lg border border-teal-200/90 bg-teal-50/80 px-2 py-0.5 text-xs font-semibold text-teal-900 dark:border-teal-800/70 dark:bg-teal-950/50 dark:text-teal-100">
                                  <span className="truncate" title={norm(r.roleLabel)}>
                                    {norm(r.roleLabel)}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="max-w-[14rem] px-4 py-3 align-middle text-slate-600 dark:text-slate-400">
                              <span className="line-clamp-3 text-[13px] leading-snug">
                                {competencyLabels(competencyCatalog, r.competencyPresetIds)}
                              </span>
                            </td>
                            <td className="max-w-[14rem] px-4 py-3 align-middle">
                              {norm(r.email) ? (
                                <span className="line-clamp-2 break-all font-medium text-emerald-800 dark:text-emerald-400">
                                  {norm(r.email)}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="max-w-[9rem] px-4 py-3 align-middle font-mono text-xs text-slate-700 dark:text-slate-300">
                              <span className="line-clamp-2">{norm(r.phone) || "—"}</span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <p className="shrink-0 text-[11px] leading-snug text-slate-500 dark:text-slate-500">
            Clic sulla riga per selezionare · {filtered.length}{" "}
            {filtered.length === 1 ? "collaboratore" : "collaboratori"}
            {q.trim() ? ` (filtrati su ${rows.length})` : null}
          </p>
        </div>
      ) : null}

      <CollaboratorEditorOverlay
        open={editor !== null}
        clients={clients}
        competencyCatalog={competencyCatalog}
        reloadCompetencyCatalog={reloadCompetencyCatalog}
        roles={roles}
        fixedClientId={lockedClientId ?? null}
        initial={editor?.mode === "edit" ? editor.row : null}
        onClose={() => setEditor(null)}
        onSaved={async () => {
          await load();
        }}
      />

      <CollaboratorDetailDialog
        open={detailCollaborator !== null}
        row={detailCollaborator}
        clients={clients}
        competencyCatalog={competencyCatalog}
        onClose={() => setDetailCollaborator(null)}
        onOpenClientList={(ids) => setClientListDialogIds(ids)}
      />

      <AssociatedClientsMiniDialog
        open={clientListDialogIds !== null}
        onClose={() => setClientListDialogIds(null)}
        title="Clienti associati"
        resolvedClients={
          clientListDialogIds ? clientsForIds(clients, clientListDialogIds) : []
        }
        requestedIdCount={
          clientListDialogIds ? clientListDialogIds.filter((id) => norm(id)).length : 0
        }
      />

      <ConfirmDialog
        open={delId !== null}
        danger
        title="Eliminare il collaboratore?"
        description="Il profilo verrà rimosso dall’anagrafica interna."
        confirmLabel="Elimina"
        onCancel={() => setDelId(null)}
        onConfirm={() => {
          const id = delId;
          setDelId(null);
          if (!id) return;
          void (async () => {
            try {
              await api.deleteCollaborator(id);
              toast.success("Collaboratore eliminato");
              setSelectedId(null);
              await load();
            } catch (e) {
              toast.error(formatErr(e));
            }
          })();
        }}
      />

      {variant === "page" && api.isTauriRuntime() ? (
        <BulkCollaboratorsPasteDialog
          open={bulkPasteOpen}
          onClose={() => setBulkPasteOpen(false)}
          clients={clients}
          roles={roles}
          competencyCatalog={competencyCatalog}
          onImported={async () => {
            await load();
          }}
        />
      ) : null}
    </>
  );

  if (variant === "page") {
    return (
      <AppPageShell className="flex min-h-0 flex-1 flex-col gap-5">
        <AppPageHeader
          className="shrink-0"
          icon={Users}
          accent="teal"
          title="Collaboratori interni"
          description={
            <>
              Team tecnico legato ai clienti e alle competenze catalogate. Ruoli e priorità da{" "}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Impostazioni → Ruoli e competenze
              </span>
              .
            </>
          }
          headerRight={
            api.isTauriRuntime() ? (
              <AppPageStatPill label="In anagrafica" value={busy ? "…" : rows.length} />
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
        "flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/90 shadow-2xl ring-1 ring-teal-500/[0.1] dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 dark:ring-teal-400/10",
        shellCls,
      )}
    >
      <div className="flex shrink-0 items-start gap-3 border-b border-slate-200/80 bg-gradient-to-r from-teal-50/85 via-white to-white px-5 py-4 dark:border-slate-800 dark:from-teal-950/30 dark:via-slate-900 dark:to-slate-950">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-md shadow-teal-600/20 dark:bg-teal-500">
          <Users size={22} aria-hidden />
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
            aria-label="Chiudi elenco collaboratori"
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
