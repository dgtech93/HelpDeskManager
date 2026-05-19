import type { Client, RdpConnection } from "@/types";

export function clientsSortedByName(clients: Client[]): Client[] {
  return [...clients].sort((a, b) => a.name.localeCompare(b.name, "it"));
}

/** Raggruppa righe per cliente nell’ordine alfabetico dei clienti (solo clienti con almeno una riga). */
export function groupByClient<T extends { clientId: string }>(
  items: T[],
  clientsOrdered: Client[],
): { client: Client; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const arr = map.get(item.clientId) ?? [];
    arr.push(item);
    map.set(item.clientId, arr);
  }
  const out: { client: Client; items: T[] }[] = [];
  for (const c of clientsOrdered) {
    const row = map.get(c.id);
    if (row?.length) out.push({ client: c, items: row });
  }
  return out;
}

/** Per pagina RDP: cliente → sottogruppi per nome connessione (ordinati). */
export function groupRdpByClientThenConnectionName(
  rdps: RdpConnection[],
  clientsOrdered: Client[],
): { client: Client; groups: { connectionName: string; items: RdpConnection[] }[] }[] {
  const byClient = groupByClient(rdps, clientsOrdered);
  return byClient.map(({ client, items }) => {
    const byName = new Map<string, RdpConnection[]>();
    for (const r of items) {
      const arr = byName.get(r.name) ?? [];
      arr.push(r);
      byName.set(r.name, arr);
    }
    const names = [...byName.keys()].sort((a, b) =>
      a.localeCompare(b, "it"),
    );
    return {
      client,
      groups: names.map((connectionName) => ({
        connectionName,
        items: [...byName.get(connectionName)!].sort((a, b) =>
          `${a.host}:${a.port}`.localeCompare(`${b.host}:${b.port}`, "it"),
        ),
      })),
    };
  });
}
