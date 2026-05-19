import type {
  Client,
  ClientContact,
  Collaborator,
  CollaboratorCompetencyDef,
  ContractTypeDef,
  CrmModuleDef,
  DashboardLayoutSettings,
  RdpConnection,
  WebAccess,
} from "@/types";
import { collaboratorMatchesBucket } from "@/lib/collaboratorRoleBuckets";
import { isCommercialColumnVisible } from "@/lib/dashboardLayout";
import { cn } from "@/lib/utils";
import {
  DashboardPersonDetailDialog,
  type DashboardPersonDetailSelection,
} from "@/components/DashboardPersonDetailDialog";
import { Flag, X } from "lucide-react";
import { useState } from "react";

function displayName(c: Collaborator): string {
  return `${c.firstName} ${c.lastName}`.trim() || "—";
}

function collaboratorCompetencyNamesText(collab: Collaborator, defs: CollaboratorCompetencyDef[]): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const pid of collab.competencyPresetIds ?? []) {
    const nm = defs.find((d) => d.id === pid)?.name?.trim();
    if (!nm || seen.has(nm)) continue;
    seen.add(nm);
    names.push(nm);
  }
  return names.sort((a, b) => a.localeCompare(b, "it")).join(", ");
}

function suiteLabelsForClient(
  clientId: string,
  rdp: RdpConnection[],
  web: WebAccess[],
): string {
  const set = new Set<string>();
  for (const r of rdp) {
    if (r.clientId === clientId && r.name.trim()) set.add(r.name.trim());
  }
  for (const w of web) {
    if (w.clientId === clientId && w.name.trim()) set.add(w.name.trim());
  }
  if (set.size === 0) return "—";
  return [...set].sort((a, b) => a.localeCompare(b, "it")).join("\n");
}

function collaboratorsForClient(clientId: string, all: Collaborator[]): Collaborator[] {
  return all.filter((c) => c.clientIds.includes(clientId));
}

function collaboratorsInBucket(
  clientId: string,
  all: Collaborator[],
  bucket: Parameters<typeof collaboratorMatchesBucket>[1],
): Collaborator[] {
  return collaboratorsForClient(clientId, all).filter((c) =>
    collaboratorMatchesBucket(c.roleLabel, bucket),
  );
}

function contactSortLabel(c: ClientContact): string {
  const name = `${c.firstName} ${c.lastName}`.trim() || "—";
  const role = c.role?.trim();
  return role ? `${name} ${role}` : name;
}

function contactsListForClient(clientId: string, all: ClientContact[]): ClientContact[] {
  const rows = all.filter((c) => c.clientId === clientId);
  return [...rows].sort((a, b) => contactSortLabel(a).localeCompare(contactSortLabel(b), "it"));
}

function collaboratorNameButtonClasses() {
  return cn(
    "max-w-full rounded-md px-1.5 py-0.5 text-left text-[11px] font-semibold leading-snug text-indigo-700",
    "transition-colors hover:bg-indigo-100 hover:text-indigo-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400",
    "dark:text-indigo-300 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-100",
  );
}

function contactLineButtonClasses() {
  return cn(
    "max-w-full rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium leading-snug text-teal-800",
    "transition-colors hover:bg-teal-100 hover:text-teal-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400",
    "dark:text-teal-300 dark:hover:bg-teal-950/50 dark:hover:text-teal-100",
  );
}

function contractTypeDisplay(contractTypeId: string | null | undefined, types: ContractTypeDef[]): string {
  const id = contractTypeId?.trim();
  if (!id) return "—";
  const row = types.find((t) => t.id === id);
  const name = row?.name?.trim();
  return name || "—";
}

function resolvedWebCrmModuleIds(w: WebAccess): string[] {
  const ids = [...(w.crmModuleIds ?? [])].map((x) => x.trim()).filter(Boolean);
  const uniq = [...new Set(ids)];
  if (uniq.length) return uniq;
  const legacy = w.crmModuleId?.trim();
  return legacy ? [legacy] : [];
}

function crmModulesTextForClient(clientId: string, webAll: WebAccess[], modules: CrmModuleDef[]): string {
  const labels = new Set<string>();
  for (const w of webAll) {
    if (w.clientId !== clientId) continue;
    for (const mid of resolvedWebCrmModuleIds(w)) {
      const row = modules.find((m) => m.id === mid);
      const nm = row?.name?.trim();
      if (nm) labels.add(nm);
    }
  }
  if (labels.size === 0) return "—";
  return [...labels].sort((a, b) => a.localeCompare(b, "it")).join("\n");
}

function sportelloMode(clientId: string, webAll: WebAccess[]): "none" | "yes" | "no" {
  const rows = webAll.filter((w) => w.clientId === clientId);
  if (rows.length === 0) return "none";
  if (rows.some((w) => w.sportello === true)) return "yes";
  return "no";
}

function rdpYesNoAggregate(
  clientId: string,
  rdpAll: RdpConnection[],
  key: "billing" | "finance" | "gwCredit",
): "none" | "yes" | "no" {
  const rows = rdpAll.filter((r) => r.clientId === clientId);
  if (rows.length === 0) return "none";
  if (rows.some((r) => r[key] === true)) return "yes";
  return "no";
}

function SpotelloIcon({ mode }: { mode: "none" | "yes" | "no" }) {
  if (mode === "none") {
    return <span className="text-slate-400">—</span>;
  }
  if (mode === "yes") {
    return (
      <span className="inline-flex text-emerald-600 dark:text-emerald-400" title="Sì">
        <Flag className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </span>
    );
  }
  return (
    <span className="inline-flex text-rose-600 dark:text-rose-400" title="No">
      <X className="h-4 w-4" strokeWidth={2.75} aria-hidden />
    </span>
  );
}

function CollaboratorNameList({
  list,
  competencyDefs,
  showCompetencies,
  onOpen,
}: {
  list: Collaborator[];
  competencyDefs: CollaboratorCompetencyDef[];
  showCompetencies: boolean;
  onOpen: (c: Collaborator) => void;
}) {
  if (list.length === 0) {
    return <span className="text-slate-400">—</span>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {list.map((c) => {
        const compText =
          showCompetencies ? collaboratorCompetencyNamesText(c, competencyDefs).trim() : "";
        const titleTip = compText ? `${displayName(c)} · ${compText}` : "Apri scheda: email e telefono";
        return (
          <li key={c.id}>
            <button
              type="button"
              className={collaboratorNameButtonClasses()}
              title={titleTip}
              onClick={() => onOpen(c)}
            >
              <span className="block text-left">
                <span>{displayName(c)}</span>
                {compText ? (
                  <>
                    {" "}
                    <span className="font-normal text-slate-500 dark:text-slate-400">· {compText}</span>
                  </>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ContactNameList({
  list,
  onOpen,
}: {
  list: ClientContact[];
  onOpen: (c: ClientContact) => void;
}) {
  if (list.length === 0) {
    return <span className="text-slate-400">—</span>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {list.map((c) => {
        const nameStr = `${c.firstName} ${c.lastName}`.trim();
        const nameLine = nameStr || "—";
        const roleT = c.role?.trim();
        const titleTip =
          roleT && nameStr ? `${nameStr} · ${roleT}` : "Apri scheda: email e telefono";
        return (
          <li key={c.id}>
            <button
              type="button"
              className={contactLineButtonClasses()}
              title={titleTip}
              onClick={() => onOpen(c)}
            >
              <span className="block text-left">
                <span>{nameLine}</span>
                {roleT ? (
                  <>
                    {" "}
                    <span className="font-normal text-teal-600/90 dark:text-teal-400/90">· {roleT}</span>
                  </>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PlaceholderCell({ title }: { title: string }) {
  return (
    <span className="text-slate-400 italic dark:text-slate-500" title={title}>
      —
    </span>
  );
}

const hdr =
  "whitespace-nowrap border-b border-slate-900/25 bg-gradient-to-br from-slate-800 via-slate-800 to-indigo-900 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-white/95 shadow-sm dark:border-white/10 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950";

const cellPad = "px-3 py-2.5";
const rowTone = "border-b border-slate-100 transition-colors duration-150 hover:bg-indigo-50/45 dark:border-slate-800/80 dark:hover:bg-slate-800/35";

const stickyClientShadow =
  "shadow-[inset_-6px_0_8px_-4px_rgba(15,23,42,0.07)] dark:shadow-[inset_-6px_0_12px_-4px_rgba(0,0,0,0.35)]";

/** Area tabella (~5 righe clienti): scroll verticale/ orizzontale, header sempre visibile. */
const tableScrollViewportClass = "max-h-[24rem] overflow-auto";

type Props = {
  clients: Client[];
  collaborators: Collaborator[];
  collaboratorCompetencies: CollaboratorCompetencyDef[];
  contacts: ClientContact[];
  rdpAll: RdpConnection[];
  webAll: WebAccess[];
  contractTypes: ContractTypeDef[];
  crmModules: CrmModuleDef[];
  dashboardLayout: DashboardLayoutSettings;
};

export function ClientCommercialOverviewTable({
  clients,
  collaborators,
  collaboratorCompetencies,
  contacts,
  rdpAll,
  webAll,
  contractTypes,
  crmModules,
  dashboardLayout,
}: Props) {
  const [detail, setDetail] = useState<DashboardPersonDetailSelection | null>(null);
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name, "it"));
  const vis = (k: Parameters<typeof isCommercialColumnVisible>[1]) =>
    isCommercialColumnVisible(dashboardLayout, k);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md ring-1 ring-slate-900/[0.04] dark:border-slate-700/90 dark:bg-slate-950 dark:ring-white/[0.05]">
        <div className={tableScrollViewportClass}>
          <table className="w-max min-w-full border-collapse text-left text-xs">
            <thead>
              <tr>
                <th
                  className={cn(
                    hdr,
                    "sticky left-0 top-0 z-[45] min-w-[148px] border-r border-white/15",
                    stickyClientShadow,
                  )}
                >
                  Cliente
                </th>
              {vis("pm") ? (
                <th className={cn(hdr, "sticky top-0 z-30 min-w-[100px]")}>PM</th>
              ) : null}
              {vis("commercials") ? (
                <th className={cn(hdr, "sticky top-0 z-30 min-w-[140px] max-w-[240px]")}>Commerciali</th>
              ) : null}
              {vis("consultants") ? (
                <th className={cn(hdr, "sticky top-0 z-30 min-w-[140px] max-w-[240px]")}>Consulenti</th>
              ) : null}
              {vis("contacts") ? (
                <th className={cn(hdr, "sticky top-0 z-30 min-w-[160px] max-w-[220px]")}>Riferimenti</th>
              ) : null}
              {vis("contractType") ? (
                <th className={cn(hdr, "sticky top-0 z-30 min-w-[88px]")}>Tipo contratto</th>
              ) : null}
              {vis("updateCount") ? (
                <th className={cn(hdr, "sticky top-0 z-30 min-w-[72px] text-center")}>N° agg.</th>
              ) : null}
              {vis("suite") ? (
                <th className={cn(hdr, "sticky top-0 z-30 min-w-[120px] max-w-[180px]")}>Suite</th>
              ) : null}
              {vis("crmModules") ? (
                <th className={cn(hdr, "sticky top-0 z-30 min-w-[120px] max-w-[200px]")}>Moduli CRM</th>
              ) : null}
              {vis("crmSportello") ? (
                <th className={cn(hdr, "sticky top-0 z-30 min-w-[88px] text-center")}>CRM Sportello</th>
              ) : null}
              {vis("billing") ? (
                <th className={cn(hdr, "sticky top-0 z-30 min-w-[72px] text-center")}>Billing</th>
              ) : null}
              {vis("finance") ? (
                <th className={cn(hdr, "sticky top-0 z-30 min-w-[72px] text-center")}>Finance</th>
              ) : null}
              {vis("gwCredit") ? (
                <th className={cn(hdr, "sticky top-0 z-30 min-w-[100px] text-center")}>GW Credit</th>
              ) : null}
              {vis("lab") ? (
                <th className={cn(hdr, "sticky top-0 z-30 min-w-[56px]")}>LAB</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {sorted.map((cl, i) => (
              <tr
                key={cl.id}
                className={cn(
                  "group",
                  rowTone,
                  i % 2 === 0 ? "bg-white dark:bg-slate-950" : "bg-slate-50/85 dark:bg-slate-900/65",
                )}
              >
                <td
                  className={cn(
                    cellPad,
                    "sticky left-0 z-10 max-w-[220px] border-r border-slate-200/95 font-semibold tracking-tight text-slate-900 dark:border-slate-700 dark:text-slate-100",
                    stickyClientShadow,
                    i % 2 === 0 ? "bg-white dark:bg-slate-950" : "bg-slate-50/90 dark:bg-slate-900/70",
                    "group-hover:bg-indigo-50/55 dark:group-hover:bg-slate-800/50",
                  )}
                >
                  <span className="line-clamp-3">{cl.name}</span>
                </td>
                {vis("pm") ? (
                  <td className={cn(cellPad, "max-w-[152px] align-top text-[11px] text-slate-800 dark:text-slate-200")}>
                    <CollaboratorNameList
                      list={collaboratorsInBucket(cl.id, collaborators, "pm")}
                      competencyDefs={collaboratorCompetencies}
                      showCompetencies={false}
                      onOpen={(c) => setDetail({ kind: "collaborator", person: c })}
                    />
                  </td>
                ) : null}
                {vis("commercials") ? (
                  <td className={cn(cellPad, "max-w-[240px] align-top text-[11px] text-slate-800 dark:text-slate-200")}>
                    <CollaboratorNameList
                      list={collaboratorsInBucket(cl.id, collaborators, "commercial")}
                      competencyDefs={collaboratorCompetencies}
                      showCompetencies
                      onOpen={(c) => setDetail({ kind: "collaborator", person: c })}
                    />
                  </td>
                ) : null}
                {vis("consultants") ? (
                  <td className={cn(cellPad, "max-w-[240px] align-top text-[11px] text-slate-800 dark:text-slate-200")}>
                    <CollaboratorNameList
                      list={collaboratorsInBucket(cl.id, collaborators, "consultant")}
                      competencyDefs={collaboratorCompetencies}
                      showCompetencies
                      onOpen={(c) => setDetail({ kind: "collaborator", person: c })}
                    />
                  </td>
                ) : null}
                {vis("contacts") ? (
                  <td className={cn(cellPad, "max-w-[228px] align-top text-[11px] text-slate-700 dark:text-slate-300")}>
                    <ContactNameList
                      list={contactsListForClient(cl.id, contacts)}
                      onOpen={(c) => setDetail({ kind: "contact", person: c })}
                    />
                  </td>
                ) : null}
                {vis("contractType") ? (
                  <td className={cn(cellPad, "align-top text-[11px] text-slate-800 dark:text-slate-200")}>
                    {contractTypeDisplay(cl.contractTypeId ?? null, contractTypes)}
                  </td>
                ) : null}
                {vis("updateCount") ? (
                  <td className={cn(cellPad, "align-top text-center text-[11px] font-medium tabular-nums text-slate-800 dark:text-slate-200")}>
                    {typeof cl.updateCount === "number" ? cl.updateCount : 0}
                  </td>
                ) : null}
                {vis("suite") ? (
                  <td className={cn(cellPad, "max-w-[188px] whitespace-pre-line align-top text-[11px] text-slate-800 dark:text-slate-200")}>
                    {suiteLabelsForClient(cl.id, rdpAll, webAll)}
                  </td>
                ) : null}
                {vis("crmModules") ? (
                  <td className={cn(cellPad, "max-w-[212px] whitespace-pre-line align-top text-[11px] text-slate-800 dark:text-slate-200")}>
                    {crmModulesTextForClient(cl.id, webAll, crmModules)}
                  </td>
                ) : null}
                {vis("crmSportello") ? (
                  <td className={cn(cellPad, "align-top text-center")}>
                    <SpotelloIcon mode={sportelloMode(cl.id, webAll)} />
                  </td>
                ) : null}
                {vis("billing") ? (
                  <td className={cn(cellPad, "align-top text-center")}>
                    <SpotelloIcon mode={rdpYesNoAggregate(cl.id, rdpAll, "billing")} />
                  </td>
                ) : null}
                {vis("finance") ? (
                  <td className={cn(cellPad, "align-top text-center")}>
                    <SpotelloIcon mode={rdpYesNoAggregate(cl.id, rdpAll, "finance")} />
                  </td>
                ) : null}
                {vis("gwCredit") ? (
                  <td className={cn(cellPad, "align-top text-center")}>
                    <SpotelloIcon mode={rdpYesNoAggregate(cl.id, rdpAll, "gwCredit")} />
                  </td>
                ) : null}
                {vis("lab") ? (
                  <td className={cn(cellPad, "align-top")}>
                    <PlaceholderCell title="Dato non ancora collegato" />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      <DashboardPersonDetailDialog detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
