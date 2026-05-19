import { planningFieldIsActive } from "@/lib/presetCatalog";
import type { ClientContact, Collaborator, PlanningActivityTypeDef } from "@/types";

/** Primo combobox «Clienti» attivo (ordine campi). */
export function firstPlanningClientsComboFieldId(type: PlanningActivityTypeDef): string | undefined {
  for (const f of type.fields) {
    if (!planningFieldIsActive(f)) continue;
    if (f.kind === "comboBox" && f.catalogRef === "clients") return f.id;
  }
  return undefined;
}

export function planningTypeHasContactOrCollaboratorCombo(type: PlanningActivityTypeDef): boolean {
  for (const f of type.fields) {
    if (!planningFieldIsActive(f)) continue;
    if (f.kind === "comboBox" && (f.catalogRef === "contacts" || f.catalogRef === "collaborators")) {
      return true;
    }
  }
  return false;
}

/** Validazione definizione tipo quando «Usa contatti» è attivo. */
export function validatePlanningTypeUseContactsRules(type: PlanningActivityTypeDef): string | null {
  if (!type.useContacts) return null;
  if (!firstPlanningClientsComboFieldId(type)) {
    return "Con «Usa contatti» aggiungi un campo combobox col catalogo Clienti.";
  }
  if (!planningTypeHasContactOrCollaboratorCombo(type)) {
    return "Con «Usa contatti» serve almeno un combobox su Rubrica contatti o Collaboratori.";
  }
  return null;
}

/** Id dei campi rubrica/collaboratori da azzerare al cambio cliente. */
export function planningContactScopedFieldIds(type: PlanningActivityTypeDef): string[] {
  const ids: string[] = [];
  for (const f of type.fields) {
    if (!planningFieldIsActive(f)) continue;
    if (f.catalogRef === "contacts" || f.catalogRef === "collaborators") ids.push(f.id);
  }
  return ids;
}

function scratchGetString(s: Record<string, unknown>, id: string): string {
  const v = s[id];
  return typeof v === "string" ? v : "";
}

/** Vincoli aggiuntivi sul modulo attività quando il tipo usa i contatti. */
export function validatePlanningScratchUseContacts(
  type: PlanningActivityTypeDef,
  scratch: Record<string, unknown>,
): string[] {
  const errs: string[] = [];
  if (!type.useContacts) return errs;
  const cid = firstPlanningClientsComboFieldId(type);
  if (cid && !scratchGetString(scratch, cid).trim()) {
    errs.push("Cliente obbligatorio per selezionare referenti o collaboratori.");
  }
  return errs;
}

export type PlanningResolvedContactAction =
  | { kind: "contact"; contact: ClientContact }
  | { kind: "collaborator"; collaborator: Collaborator };

/**
 * Risolve il primo valore utile tra campi rubrica/collaboratori (ordine definizione campi),
 * verificando coerenza con il cliente selezionato.
 */
export function resolvePlanningContactAction(
  type: PlanningActivityTypeDef,
  fieldValues: Record<string, unknown>,
  clientId: string,
  contacts: ClientContact[],
  collaborators: Collaborator[],
): PlanningResolvedContactAction | null {
  const cId = clientId.trim();
  if (!cId) return null;

  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const collabById = new Map(collaborators.map((c) => [c.id, c]));

  for (const f of type.fields) {
    if (!planningFieldIsActive(f)) continue;
    if (f.kind !== "comboBox") continue;
    const raw = fieldValues[f.id];
    const rid = typeof raw === "string" ? raw.trim() : "";
    if (!rid) continue;

    if (f.catalogRef === "contacts") {
      const co = contactById.get(rid);
      if (co && co.clientId === cId) return { kind: "contact", contact: co };
    } else if (f.catalogRef === "collaborators") {
      const cl = collabById.get(rid);
      if (cl && cl.clientIds.includes(cId)) return { kind: "collaborator", collaborator: cl };
    }
  }

  return null;
}
