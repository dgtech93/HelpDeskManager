import type {
  AppSettings,
  Client,
  ClientContact,
  Collaborator,
  CollaboratorRole,
  PlanningCatalogRef,
} from "@/types";

export const PLANNING_CATALOG_REF_OPTIONS: readonly { value: PlanningCatalogRef; label: string }[] = [
  { value: "clients", label: "Clienti" },
  { value: "connectionPresets", label: "Servizi (RDP / Web)" },
  { value: "environments", label: "Ambienti" },
  { value: "versionOptions", label: "Versioni prodotto" },
  { value: "releaseOptions", label: "Release" },
  { value: "collaborators", label: "Collaboratori" },
  { value: "contacts", label: "Rubrica contatti" },
  { value: "contractTypes", label: "Contratti" },
  { value: "crmModules", label: "Moduli CRM" },
  { value: "collaboratorRoles", label: "Ruoli collaboratori" },
  { value: "competencies", label: "Competenze" },
];

/** Titolo dell'archivio (stesso nome del menu gestionale): usato come etichetta del campo combobox/lista. */
export function planningCatalogTitle(ref: PlanningCatalogRef): string {
  return PLANNING_CATALOG_REF_OPTIONS.find((o) => o.value === ref)?.label ?? ref;
}

export type PlanningCatalogBundle = {
  settings: AppSettings;
  clients: Client[];
  collaborators: Collaborator[];
  contacts: ClientContact[];
  roles: CollaboratorRole[];
};

function sortPicklist(opts: { id: string; label: string }[]) {
  return [...opts].sort((a, b) =>
    (a.label || "").localeCompare(b.label || "", "it", { sensitivity: "base" }),
  );
}

export function optionsForPlanningCatalogRef(
  ref: PlanningCatalogRef,
  bundle: PlanningCatalogBundle,
): { id: string; label: string }[] {
  const { settings, clients, collaborators, contacts, roles } = bundle;
  switch (ref) {
    case "clients":
      return sortPicklist(
        clients.map((c) => ({ id: c.id, label: c.name.trim() || c.id })),
      );
    case "connectionPresets":
      return sortPicklist(
        (settings.connectionNamePresets ?? []).map((p) => ({
          id: p.id,
          label:
            `${p.name.trim()} (${p.kind === "web" ? "Web" : "RDP"})`.trim() || p.id,
        })),
      );
    case "environments":
      return sortPicklist(
        (settings.environments ?? []).map((e) => ({ id: e.id, label: e.name.trim() || e.id })),
      );
    case "versionOptions":
      return sortPicklist(
        (settings.versionOptions ?? []).map((v) => ({ id: v.id, label: v.value.trim() || v.id })),
      );
    case "releaseOptions":
      return sortPicklist(
        (settings.releaseOptions ?? []).map((r) => ({ id: r.id, label: r.name.trim() || r.id })),
      );
    case "collaborators":
      return sortPicklist(
        collaborators.map((cl) => {
          const nm = `${cl.firstName ?? ""} ${cl.lastName ?? ""}`.trim();
          return { id: cl.id, label: nm || cl.email?.trim() || cl.id };
        }),
      );
    case "contacts":
      return sortPicklist(
        contacts.map((co) => {
          const nm = `${co.firstName ?? ""} ${co.lastName ?? ""}`.trim();
          const fallback = co.email ?? co.phone ?? co.mobile ?? co.id;
          return { id: co.id, label: nm || fallback };
        }),
      );
    case "contractTypes":
      return sortPicklist(
        (settings.contractTypes ?? []).map((c) => ({ id: c.id, label: c.name.trim() || c.id })),
      );
    case "crmModules":
      return sortPicklist(
        (settings.crmModules ?? []).map((m) => ({ id: m.id, label: m.name.trim() || m.id })),
      );
    case "collaboratorRoles":
      return sortPicklist(
        roles.map((r) => ({ id: r.id, label: r.label.trim() || r.id })),
      );
    case "competencies":
      return sortPicklist(
        (settings.collaboratorCompetencies ?? []).map((c) => ({
          id: c.id,
          label: c.name.trim() || c.id,
        })),
      );
    default:
      return [];
  }
}

/**
 * Opzioni combobox/lista con rubrica e collaboratori filtrati sul cliente (tipi con «Usa contatti»).
 * Senza `clientId` effettivo le liste rubrica/collaboratori risultano vuote.
 */
export function optionsForPlanningCatalogRefScoped(
  ref: PlanningCatalogRef,
  bundle: PlanningCatalogBundle,
  clientId: string | undefined,
  /** Se vero e catalogo è rubrica/collaboratori, applica il filtro su `clientId`. */
  scopeByClient: boolean,
): { id: string; label: string }[] {
  const cid = clientId?.trim() ?? "";
  if (!scopeByClient || (ref !== "contacts" && ref !== "collaborators")) {
    return optionsForPlanningCatalogRef(ref, bundle);
  }
  if (!cid) return [];
  const { contacts, collaborators } = bundle;
  if (ref === "contacts") {
    const filtered = contacts.filter((co) => co.clientId === cid);
    return sortPicklist(
      filtered.map((co) => {
        const nm = `${co.firstName ?? ""} ${co.lastName ?? ""}`.trim();
        const fallback = co.email ?? co.phone ?? co.mobile ?? co.id;
        return { id: co.id, label: nm || fallback };
      }),
    );
  }
  const filtered = collaborators.filter((cl) => cl.clientIds.includes(cid));
  return sortPicklist(
    filtered.map((cl) => {
      const nm = `${cl.firstName ?? ""} ${cl.lastName ?? ""}`.trim();
      return { id: cl.id, label: nm || cl.email?.trim() || cl.id };
    }),
  );
}

export function labelForPlanningPicklistValue(
  ref: PlanningCatalogRef,
  value: unknown,
  bundle: PlanningCatalogBundle,
): string {
  const opts = optionsForPlanningCatalogRef(ref, bundle);
  const m = new Map(opts.map((o) => [o.id, o.label]));
  if (Array.isArray(value)) {
    return value.map((id) => (typeof id === "string" ? m.get(id) ?? id : String(id))).join(", ");
  }
  if (typeof value === "string") return m.get(value) ?? value;
  if (value == null || value === "") return "—";
  return String(value);
}
