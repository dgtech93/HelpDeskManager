import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import type { Client, CollaboratorCompetencyDef, Collaborator } from "@/types";
import { CONTACT_CALL_BUTTON_COMPACT_CLASS, CONTACT_MAIL_BUTTON_COMPACT_CLASS } from "@/lib/contactQuickActionButtonClasses";
import { ExternalLink, Mail, Phone } from "lucide-react";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim();
}

export function collaboratorCardName(c: Collaborator): string {
  const s = `${(c.firstName ?? "").trim()} ${(c.lastName ?? "").trim()}`.trim();
  return s || "(Senza nome)";
}

function sortCollaboratorsRows(list: Collaborator[]): Collaborator[] {
  return [...list].sort((a, b) => {
    const ra = a.roleSortRank ?? 9999;
    const rb = b.roleSortRank ?? 9999;
    if (ra !== rb) return ra - rb;
    return collaboratorCardName(a).localeCompare(collaboratorCardName(b), "it");
  });
}

export function CollaboratorsByClientPanel({
  clients,
  clientId,
  competencyCatalog,
  onClose,
}: {
  clients: Client[];
  clientId: string;
  competencyCatalog: CollaboratorCompetencyDef[];
  onClose: () => void;
}) {
  const clientName =
    norm(clients.find((c) => c.id === clientId)?.name) || "Cliente";

  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Collaborator[]>([]);

  const load = useCallback(async () => {
    if (!api.isTauriRuntime()) return;
    setBusy(true);
    try {
      const list = await api.getCollaboratorsForClient(clientId);
      setRows(list);
    } catch (e) {
      toast.error(formatErr(e));
    } finally {
      setBusy(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sections = useMemo(() => {
    const presetOrderIds = competencyCatalog.map((p) => p.id);
    const byPreset = new Map<string, Collaborator[]>();
    const others: Collaborator[] = [];

    for (const row of rows) {
      let placed = false;
      for (const pid of presetOrderIds) {
        if (row.competencyPresetIds.includes(pid)) {
          const cur = byPreset.get(pid) ?? [];
          cur.push(row);
          byPreset.set(pid, cur);
          placed = true;
        }
      }
      const unknown = row.competencyPresetIds.filter((id) => !presetOrderIds.includes(id));
      for (const u of unknown) {
        const orphanKey = `__orphan__${u}`;
        const cur = byPreset.get(orphanKey) ?? [];
        cur.push(row);
        byPreset.set(orphanKey, cur);
        placed = true;
      }
      if (!placed) others.push(row);
    }

    const out: { key: string; title: string; list: Collaborator[] }[] = [];
    for (const p of competencyCatalog) {
      const list = byPreset.get(p.id);
      if (!list?.length) continue;
      out.push({
        key: p.id,
        title: norm(p.name) || p.id,
        list: sortCollaboratorsRows(list),
      });
    }

    const orphanKeys = [...byPreset.keys()].filter((k) => k.startsWith("__orphan__"));
    orphanKeys.sort();
    for (const k of orphanKeys) {
      const rawId = k.replace("__orphan__", "");
      const list = byPreset.get(k) ?? [];
      if (!list.length) continue;
      out.push({
        key: k,
        title: `Competenza (catalogo mancante): ${rawId}`,
        list: sortCollaboratorsRows(list),
      });
    }

    if (others.length) {
      out.push({
        key: "__none__",
        title: "Senza competenza in catalogo",
        list: sortCollaboratorsRows(others),
      });
    }
    return out;
  }, [rows, competencyCatalog]);

  return (
    <div className="max-h-[min(560px,calc(100vh-12rem))] flex flex-col overflow-hidden rounded-2xl border border-teal-200/80 bg-teal-50/55 p-4 shadow-sm dark:border-teal-900/50 dark:bg-slate-900/75">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-teal-200/70 pb-2 dark:border-teal-900/55">
        <div>
          <h3 className="text-base font-semibold text-teal-950 dark:text-teal-200">
            Collaboratori — {clientName}
          </h3>
          <p className="mt-1 text-xs text-teal-900/85 dark:text-teal-300/90">
            Raggruppati per competenza (preset catalogo); in ogni gruppo ordinati per importanza
            dell&apos;incarico.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"
        >
          Chiudi
        </button>
      </div>

      {!api.isTauriRuntime() ? (
        <p className="mt-3 shrink-0 text-sm text-amber-800 dark:text-amber-200">
          Collaboratori disponibili solo nell&apos;app desktop Tauri.
        </p>
      ) : busy ? (
        <p className="mt-3 text-sm text-slate-500">Caricamento…</p>
      ) : sections.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Nessun collaboratore associato a questo cliente.
        </p>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-6 overflow-auto pr-1">
          {sections.map((sec) => (
            <div key={sec.key}>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-teal-900 dark:text-teal-400">
                {sec.title}
              </h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sec.list.map((row) => (
                  <CollaboratorCard key={`${sec.key}:${row.id}`} row={row} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CollaboratorCard({ row }: { row: Collaborator }) {
  const photo = norm(row.photoUrl);
  const li = norm(row.linkedinUrl);
  const em = norm(row.email);
  const ph = norm(row.phone);
  const role = norm(row.roleLabel);
  const initials = [norm(row.firstName).charAt(0), norm(row.lastName).charAt(0)]
    .join("")
    .toUpperCase();

  return (
    <div className="flex gap-3 rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        {photo ? (
          <img
            src={photo}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-400">
            {initials || "?"}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="truncate font-semibold text-slate-900 dark:text-slate-50">
          {collaboratorCardName(row)}
        </div>
        {role ? (
          <div className="text-[11px] font-medium uppercase text-slate-500 dark:text-slate-400">
            {role}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {li ? (
            <button
              type="button"
              title="LinkedIn"
              onClick={() => void api.openHttpsUrl(li)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold hover:bg-white dark:border-slate-700 dark:bg-slate-900"
            >
              <ExternalLink size={12} /> LinkedIn
            </button>
          ) : null}
          {ph ? (
            <button
              type="button"
              title="Chiama"
              onClick={() =>
                void api.dialPhoneNumber(ph).catch((e) => toast.error(formatErr(e)))
              }
              className={CONTACT_CALL_BUTTON_COMPACT_CLASS}
            >
              <Phone size={13} strokeWidth={2.25} /> Chiama
            </button>
          ) : null}
          {em ? (
            <button
              type="button"
              title="Email"
              onClick={() =>
                void api.openContactMailto(em).catch((e) => toast.error(formatErr(e)))
              }
              className={CONTACT_MAIL_BUTTON_COMPACT_CLASS}
            >
              <Mail size={13} strokeWidth={2.25} /> Email
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
