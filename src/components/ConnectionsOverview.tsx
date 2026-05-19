import type {
  AppSettings,
  Client,
  ConnectionNamePreset,
  DashboardLayoutSettings,
  RdpConnection,
  WebAccess,
} from "@/types";
import { formatConnectionMatrixLine } from "@/lib/presetCatalog";
import { isMatrixPresetVisible, normalizeDashboardLayout } from "@/lib/dashboardLayout";
import { cn } from "@/lib/utils";
import { Flag, Globe, Monitor, X } from "lucide-react";

function normName(s: string): string {
  return s.trim().toLocaleLowerCase("it");
}

function namesMatch(a: string, b: string): boolean {
  return normName(a) === normName(b);
}

function normalizePresets(presets: ConnectionNamePreset[]): ConnectionNamePreset[] {
  return presets
    .map((p) => ({
      id: p.id,
      name: p.name.trim(),
      kind: p.kind,
      environmentIds: p.environmentIds ?? [],
    }))
    .filter((p) => p.name.length > 0);
}

type MatrixCatalog = Pick<AppSettings, "environments" | "versionOptions" | "releaseOptions">;

function stableStringIndex(key: string, modulus: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  }
  return modulus > 0 ? Math.abs(h) % modulus : 0;
}

/** Indicatore ambiente: stesso indice ⇒ pallino + testo riga coordinati. */
const ENVIRONMENT_DOT_CLASSES = [
  "bg-violet-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-cyan-500",
  "bg-fuchsia-500",
  "bg-blue-500",
  "bg-lime-500",
] as const;

const ENVIRONMENT_TEXT_CLASSES = [
  "text-violet-700 dark:text-violet-300",
  "text-sky-700 dark:text-sky-300",
  "text-emerald-700 dark:text-emerald-300",
  "text-amber-800 dark:text-amber-300",
  "text-rose-700 dark:text-rose-300",
  "text-indigo-700 dark:text-indigo-300",
  "text-teal-700 dark:text-teal-300",
  "text-orange-700 dark:text-orange-300",
  "text-cyan-700 dark:text-cyan-300",
  "text-fuchsia-700 dark:text-fuchsia-300",
  "text-blue-800 dark:text-blue-300",
  "text-lime-800 dark:text-lime-300",
] as const;

function environmentDotClass(environmentId: string): string {
  if (!environmentId) return "bg-slate-400 dark:bg-slate-500";
  const i = stableStringIndex(environmentId, ENVIRONMENT_DOT_CLASSES.length);
  return ENVIRONMENT_DOT_CLASSES[i]!;
}

/** Testo riga Panoramica servizi: stesso schema cromatico del pallino ambiente. */
function environmentRowTextClass(environmentId: string): string {
  if (!environmentId.trim()) return "text-slate-600 dark:text-slate-400";
  const i = stableStringIndex(environmentId, ENVIRONMENT_TEXT_CLASSES.length);
  return ENVIRONMENT_TEXT_CLASSES[i]!;
}

function environmentTitle(environmentId: string, catalog: MatrixCatalog): string {
  if (!environmentId.trim()) return "Ambiente non assegnato";
  const name = catalog.environments.find((e) => e.id === environmentId)?.name?.trim();
  return name || "Ambiente";
}

function isWebAccess(c: RdpConnection | WebAccess): c is WebAccess {
  return "url" in c && typeof (c as WebAccess).url === "string";
}

function matrixEnvPrimaryId(c: RdpConnection | WebAccess): string {
  if (isWebAccess(c)) return (c.environmentId ?? "").trim();
  const deps = c.environmentDeployments?.filter((d) => (d.environmentId ?? "").trim()) ?? [];
  if (deps.length > 0) return deps[0]!.environmentId!.trim();
  return (c.environmentId ?? "").trim();
}

function matrixEnvDotTitle(c: RdpConnection | WebAccess, catalog: MatrixCatalog): string {
  const primary = matrixEnvPrimaryId(c);
  if (!isWebAccess(c)) {
    const deps = c.environmentDeployments?.filter((d) => (d.environmentId ?? "").trim()) ?? [];
    if (deps.length > 1) {
      return deps.map((d) => environmentTitle((d.environmentId ?? "").trim(), catalog)).join(", ");
    }
  }
  return environmentTitle(primary, catalog);
}

/** Una riga visiva nella cella (stessa RDP può generare più righe = un pallino colore per ambiente). */
type MatrixRenderedRow = {
  connectionId: string;
  envId: string;
  releaseOptionId: string;
  line: string;
};

function dedupeRowsByEnvRelease(rows: MatrixRenderedRow[]): MatrixRenderedRow[] {
  const seen = new Set<string>();
  const out: MatrixRenderedRow[] = [];
  for (const row of rows) {
    const k = `${row.envId.trim()}|${row.releaseOptionId.trim()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

function matrixRenderedRows(
  connections: (RdpConnection | WebAccess)[],
  catalog: MatrixCatalog,
): MatrixRenderedRow[] {
  const flat = [...connections]
    .flatMap((c): MatrixRenderedRow[] => {
      if (isWebAccess(c)) {
        const line = formatConnectionMatrixLine(c, catalog).trim();
        const envId = (c.environmentId ?? "").trim();
        const releaseOptionId = (c.releaseOptionId ?? "").trim();
        return [{ connectionId: c.id, envId, releaseOptionId, line }];
      }
      const r = c as RdpConnection;
      const deps =
        r.environmentDeployments?.filter((d) => (d.environmentId ?? "").trim()) ?? [];

      if (deps.length <= 1) {
        const envId =
          deps[0]?.environmentId?.trim() ?? (r.environmentId ?? "").trim();
        const releaseOptionId = (
          deps[0]?.releaseOptionId ??
          r.releaseOptionId ??
          ""
        ).trim();
        const line = formatConnectionMatrixLine(r, catalog).trim();
        return [{ connectionId: r.id, envId, releaseOptionId, line }];
      }

      const vo = r.versionOptionId
        ? catalog.versionOptions.find((v) => v.id === r.versionOptionId)
        : undefined;
      const verStr = (vo?.value ?? "").trim() || (r.version ?? "").trim() || "";

      return deps.map((d): MatrixRenderedRow => {
        const envId = d.environmentId!.trim();
        const releaseOptionId = (d.releaseOptionId ?? "").trim();
        const envName =
          catalog.environments.find((e) => e.id === envId)?.name?.trim() || "";
        const relId = releaseOptionId;
        const relName = relId
          ? catalog.releaseOptions?.find((ro) => ro.id === relId)?.name?.trim() || ""
          : "";
        const parts: string[] = [];
        parts.push(envName || envId);
        if (verStr.length > 0) parts.push(verStr);
        if (relName.length > 0) parts.push(relName);
        const line = parts.join(" - ");
        return { connectionId: r.id, envId, releaseOptionId, line };
      });
    })
    .sort((a, b) => {
      const byLine = (a.line || "").localeCompare(b.line || "", "it", {
        sensitivity: "base",
      });
      if (byLine !== 0) return byLine;
      return (
        a.connectionId.localeCompare(b.connectionId) ||
        a.envId.localeCompare(b.envId) ||
        a.releaseOptionId.localeCompare(b.releaseOptionId)
      );
    });

  return dedupeRowsByEnvRelease(flat);
}

type Props = {
  clients: Client[];
  presets: ConnectionNamePreset[];
  rdpAll: RdpConnection[];
  webAll: WebAccess[];
  /** Ambiente — versione prodotto — release; fallback sul campo versione testuale legacy. */
  catalog?: MatrixCatalog;
  /** Colonne servizio (Panoramica servizi) nascoste: Impostazioni → Dashboard. */
  dashboardLayout?: DashboardLayoutSettings | null;
  /** Se valorizzato e non ci sono righe cliente da mostrare, viene mostrato al posto del messaggio predefinito. */
  customEmptyClientsMessage?: string;
};

function MatrixCell({
  connections,
  catalog,
}: {
  connections: (RdpConnection | WebAccess)[];
  catalog: MatrixCatalog;
}) {
  if (connections.length === 0) {
    return (
      <span className="inline-flex items-center justify-center text-rose-600 dark:text-rose-400" title="Non presente">
        <X className="h-4 w-4" strokeWidth={2.75} aria-hidden />
      </span>
    );
  }

  const rows = matrixRenderedRows(connections, catalog);
  const hasAnyLine = rows.some((row) => row.line.trim().length > 0);

  if (!hasAnyLine) {
    const uniq = (() => {
      const seen = new Set<string>();
      return connections.filter((c) => {
        const pid = matrixEnvPrimaryId(c);
        const k = pid || "__none__";
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    })();
    return (
      <div className="flex flex-col items-center gap-1">
        {uniq.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1"
            title={`Presente · ${matrixEnvDotTitle(c, catalog)}`}
          >
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15",
                environmentDotClass(matrixEnvPrimaryId(c)),
              )}
              aria-hidden
            />
            <Flag
              className={cn("h-3.5 w-3.5", environmentRowTextClass(matrixEnvPrimaryId(c)))}
              strokeWidth={2.25}
              aria-hidden
            />
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[11rem] flex-col items-stretch gap-1 text-left">
      {rows.map((row, ix) =>
        row.line.trim() ? (
          <div
            key={`${row.connectionId}:${row.envId}:${row.releaseOptionId}:${String(ix)}`}
            className="flex items-start gap-1.5"
          >
            <span
              className={cn(
                "mt-1 h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15",
                environmentDotClass(row.envId),
              )}
              title={environmentTitle(row.envId, catalog)}
              aria-hidden
            />
            <span
              className={cn(
                "min-w-0 flex-1 text-[11px] font-semibold leading-snug break-words",
                environmentRowTextClass(row.envId),
              )}
              title={row.line}
            >
              {row.line}
            </span>
          </div>
        ) : (
          <div
            key={`${row.connectionId}:${row.envId}:${row.releaseOptionId}:${String(ix)}`}
            className="flex items-center gap-1.5 pl-0.5"
          >
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15", environmentDotClass(row.envId))}
              title={environmentTitle(row.envId, catalog)}
              aria-hidden
            />
            <Flag
              className={cn("h-3.5 w-3.5 shrink-0", environmentRowTextClass(row.envId))}
              strokeWidth={2.25}
              aria-hidden
            />
          </div>
        ),
      )}
    </div>
  );
}
export function ConnectionsOverview({
  clients,
  presets: rawPresets,
  rdpAll,
  webAll,
  catalog: rawCatalog,
  dashboardLayout,
  customEmptyClientsMessage,
}: Props) {
  const layout = normalizeDashboardLayout(dashboardLayout);
  const catalog: MatrixCatalog = {
    environments: rawCatalog?.environments ?? [],
    versionOptions: rawCatalog?.versionOptions ?? [],
    releaseOptions: rawCatalog?.releaseOptions ?? [],
  };

  const presetsAll = normalizePresets(rawPresets);
  const presets = presetsAll.filter((p) => isMatrixPresetVisible(layout, p.id));
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name, "it"));

  if (presets.length === 0 && presetsAll.length > 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        Tutte le colonne della <strong>Panoramica servizi</strong> risultano <strong>nascoste</strong> in Impostazioni →
        Dashboard: ripristina almeno un servizio visibile oppure rivedi la configurazione delle colonne.
      </div>
    );
  }

  if (presets.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        Nessun <strong>servizio</strong> configurato in Impostazioni → <strong>Servizi</strong>: aggiungi almeno una riga
        (tipo RDP o WEB) per vedere le colonne nella Panoramica servizi.
      </div>
    );
  }

  if (sorted.length === 0) {
    const fallback =
      customEmptyClientsMessage?.trim() ||
      "Nessun cliente attivo: aggiungine uno dalla pagina Clienti.";
    return <p className="text-sm text-slate-500 dark:text-slate-400">{fallback}</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-300/55 bg-neutral-50/95 shadow-sm shadow-slate-500/[0.05] ring-1 ring-slate-400/20 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none dark:ring-0">
      <div className="max-h-[24rem] overflow-auto">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide dark:border-slate-700">
              <th className="sticky left-0 top-0 z-30 min-w-[160px] border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-slate-600 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:shadow-[2px_0_8px_-2px_rgba(0,0,0,0.4)]">
                Cliente
              </th>
              {presets.map((p) => (
                <th
                  key={`${p.kind}-${p.name}`}
                  className="sticky top-0 z-20 min-w-[92px] max-w-[10rem] border-b border-l border-slate-200 bg-slate-50 px-2 py-2 align-bottom text-slate-600 dark:border-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                >
                  <div className="flex flex-col items-center gap-1 normal-case">
                    {p.kind === "rdp" ? (
                      <Monitor className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    ) : (
                      <Globe className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
                    )}
                    <span className="max-w-[9rem] text-center text-[11px] font-semibold leading-snug tracking-normal text-slate-800 dark:text-slate-200">
                      {p.name}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 text-left font-medium text-slate-900 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:shadow-[2px_0_8px_-2px_rgba(0,0,0,0.4)]">
                  {c.name}
                </td>
                {presets.map((p) => {
                  if (p.kind === "rdp") {
                    const matches = rdpAll.filter((r) => r.clientId === c.id && namesMatch(r.name, p.name));
                    return (
                      <td
                        key={`${c.id}-${p.kind}-${p.name}`}
                        className="border-l border-slate-100 px-1.5 py-2 align-middle dark:border-slate-800"
                      >
                        <div className="flex min-h-[2rem] items-center justify-center">
                          <MatrixCell connections={matches} catalog={catalog} />
                        </div>
                      </td>
                    );
                  }
                  const matches = webAll.filter((w) => w.clientId === c.id && namesMatch(w.name, p.name));
                  return (
                    <td
                      key={`${c.id}-${p.kind}-${p.name}`}
                      className="border-l border-slate-100 px-1.5 py-2 align-middle dark:border-slate-800"
                    >
                      <div className="flex min-h-[2rem] items-center justify-center">
                        <MatrixCell connections={matches} catalog={catalog} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
