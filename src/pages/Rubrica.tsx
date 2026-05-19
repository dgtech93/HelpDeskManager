import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import type { Client } from "@/types";
import { ContactsBook } from "@/components/contacts/ContactsBook";

export function RubricaPage() {
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const c = await api.getClients();
        setClients(c);
      } catch (e) {
        toast.error(formatErr(e));
      }
    })();
  }, []);

  return <ContactsBook variant="page" clients={clients} />;
}
