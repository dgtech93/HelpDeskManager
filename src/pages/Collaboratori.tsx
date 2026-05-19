import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import type { Client, CollaboratorCompetencyDef } from "@/types";
import { CollaboratorsBook } from "@/components/collaborators/CollaboratorsBook";

export function CollaboratoriPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [competencyCatalog, setCompetencyCatalog] = useState<CollaboratorCompetencyDef[]>([]);

  const reloadCompetencyCatalog = useCallback(async () => {
    const settings = await api.getSettings();
    setCompetencyCatalog(settings.collaboratorCompetencies ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [c, settings] = await Promise.all([api.getClients(), api.getSettings()]);
        setClients(c);
        setCompetencyCatalog(settings.collaboratorCompetencies ?? []);
      } catch (e) {
        toast.error(formatErr(e));
      }
    })();
  }, []);

  return (
    <CollaboratorsBook
      variant="page"
      clients={clients}
      competencyCatalog={competencyCatalog}
      reloadCompetencyCatalog={reloadCompetencyCatalog}
    />
  );
}
