import React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { ConnectionNamePreset, ConnectionPresetKind } from "@/types";

import * as api from "@/lib/api";

import { cn } from "@/lib/utils";

import { findPresetByNameKind, newCatalogId } from "@/lib/presetCatalog";

/** Valore sentinella nelle `<select>`: apre il form di creazione catalogo. */
export const CATALOG_ADD_NEW_SENTINEL = "__catalog_add_new__";

function normKey(s: string): string {
  return s.trim().toLocaleLowerCase("it");
}

export type CatalogCreationVariant =
  | "environment"
  | "version"
  | "release"
  | "crmModule"
  | "servicePreset"
  | "collaboratorCompetency";

type Props = {
  open: boolean;
  variant: CatalogCreationVariant | null;
  /** Filtro servizi (stesso della connessione RDP o WEB). */
  presetKind: ConnectionPresetKind;
  connectionNamePresets: ConnectionNamePreset[];
  /** Preset della connessione corrente: selezionato di default per versione/release. */
  defaultPresetIds: string[];
  onClose: () => void;
  onCatalogRefreshed: () => Promise<void>;
  /**
   * Identificativo salvato in catalogo (uuid) per ambienti / versioni / release / moduli / competenze.
   * Per `servicePreset` viene passato il **nome** del servizio (le select RDP/Web usano il nome come valore).
   */
  onSaved: (value: string) => void;
};

export function CatalogCreationModal({
  open,
  variant,
  presetKind,
  connectionNamePresets,
  defaultPresetIds,
  onClose,
  onCatalogRefreshed,
  onSaved,
}: Props) {
  const [envName, setEnvName] = React.useState("");
  const [versionValue, setVersionValue] = React.useState("");
  const [releaseName, setReleaseName] = React.useState("");
  const [moduleName, setModuleName] = React.useState("");
  const [serviceName, setServiceName] = React.useState("");
  const [presetPick, setPresetPick] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  const presetScope = React.useMemo(
    () => connectionNamePresets.filter((p) => p.kind === presetKind),
    [connectionNamePresets, presetKind],
  );

  React.useEffect(() => {
    if (!open || !variant) return;
    setEnvName("");
    setVersionValue("");
    setReleaseName("");
    setModuleName("");
    setServiceName("");
    setPresetPick(new Set(defaultPresetIds.filter((x) => x.trim())));
  }, [open, variant, defaultPresetIds]);

  const title =
    variant === "environment"
      ? "Nuovo ambiente"
      : variant === "version"
        ? "Nuova versione prodotto"
        : variant === "release"
          ? "Nuova release"
          : variant === "crmModule"
            ? "Nuovo modulo"
            : variant === "servicePreset"
              ? "Nuovo servizio (RDP / Web)"
              : variant === "collaboratorCompetency"
                ? "Nuova competenza"
                : "";

  const togglePreset = (id: string, on: boolean) => {
    setPresetPick((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!variant) return;
    setBusy(true);
    try {
      const fresh = await api.getSettings();

      if (variant === "servicePreset") {
        const name = serviceName.trim();
        if (!name) {
          toast.error("Inserisci il nome del servizio.");
          return;
        }
        const hit =
          findPresetByNameKind(fresh.connectionNamePresets, name, presetKind) ?? null;
        if (hit?.name?.trim()) {
          await onCatalogRefreshed();
          onSaved(hit.name.trim());
          toast.success("Servizio già presente nel catalogo — selezionato nel campo nome.");
          onClose();
          return;
        }
        const row: ConnectionNamePreset = {
          id: newCatalogId(),
          name,
          kind: presetKind,
          environmentIds: [],
        };
        await api.updateSettings({
          connectionNamePresets: [...fresh.connectionNamePresets, row],
        });
        await onCatalogRefreshed();
        onSaved(row.name.trim());
        toast.success("Servizio aggiunto in Impostazioni → Servizi.");
        onClose();
        return;
      }

      if (variant === "collaboratorCompetency") {
        const name = moduleName.trim();
        if (!name) {
          toast.error("Inserisci il nome della competenza.");
          return;
        }
        const list = fresh.collaboratorCompetencies ?? [];
        const hit = list.find((x) => normKey(x.name) === normKey(name)) ?? null;
        if (hit) {
          await onCatalogRefreshed();
          onSaved(hit.id);
          toast.success("Competenza già presente nel catalogo — selezionata.");
          onClose();
          return;
        }
        const row = { id: newCatalogId(), name };
        await api.updateSettings({ collaboratorCompetencies: [...list, row] });
        await onCatalogRefreshed();
        onSaved(row.id);
        toast.success("Competenza aggiunta in Impostazioni → Ruoli e competenze.");
        onClose();
        return;
      }

      if (variant === "environment") {
        const name = envName.trim();
        if (!name) {
          toast.error("Inserisci il nome dell’ambiente.");
          return;
        }
        const hit = fresh.environments.find((e) => normKey(e.name) === normKey(name)) ?? null;
        if (hit) {
          await onCatalogRefreshed();
          onSaved(hit.id);
          toast.success("Ambiente già presente nel catalogo — selezionato.");
          onClose();
          return;
        }
        const row = { id: newCatalogId(), name };
        await api.updateSettings({ environments: [...fresh.environments, row] });
        await onCatalogRefreshed();
        onSaved(row.id);
        toast.success("Ambiente aggiunto al catalogo.");
        onClose();
        return;
      }

      if (variant === "crmModule") {
        const name = moduleName.trim();
        if (!name) {
          toast.error("Inserisci il nome del modulo.");
          return;
        }
        const hit = fresh.crmModules.find((m) => normKey(m.name) === normKey(name)) ?? null;
        if (hit) {
          await onCatalogRefreshed();
          onSaved(hit.id);
          toast.success("Modulo già presente — selezionato.");
          onClose();
          return;
        }
        const row = { id: newCatalogId(), name };
        await api.updateSettings({ crmModules: [...fresh.crmModules, row] });
        await onCatalogRefreshed();
        onSaved(row.id);
        toast.success("Modulo aggiunto al catalogo.");
        onClose();
        return;
      }

      const picked = [...presetPick].filter((x) => x.trim());
      if (picked.length === 0) {
        toast.error("Seleziona almeno un servizio a cui applicare la voce.");
        return;
      }

      if (variant === "version") {
        const value = versionValue.trim();
        if (!value) {
          toast.error("Inserisci il valore della versione prodotto.");
          return;
        }
        const hit = fresh.versionOptions.find((v) => normKey(v.value) === normKey(value)) ?? null;
        if (!hit) {
          const row: (typeof fresh.versionOptions)[number] = {
            id: newCatalogId(),
            value,
            presetIds: picked,
          };
          await api.updateSettings({ versionOptions: [...fresh.versionOptions, row] });
          await onCatalogRefreshed();
          onSaved(row.id);
          toast.success("Versione prodotto aggiunta al catalogo.");
          onClose();
          return;
        }
        const merged = [...new Set([...(hit.presetIds ?? []), ...picked])];
        const nextList = fresh.versionOptions.map((v) =>
          v.id === hit.id ? { ...v, presetIds: merged } : v,
        );
        await api.updateSettings({ versionOptions: nextList });
        await onCatalogRefreshed();
        onSaved(hit.id);
        toast.success("Versione prodotto aggiornata nel catalogo (servizi collegati).");
        onClose();
        return;
      }

      const name = releaseName.trim();
      if (!name) {
        toast.error("Inserisci il nome della release.");
        return;
      }
      const hit = fresh.releaseOptions.find((r) => normKey(r.name) === normKey(name)) ?? null;
      if (!hit) {
        const row: (typeof fresh.releaseOptions)[number] = {
          id: newCatalogId(),
          name,
          presetIds: picked,
        };
        await api.updateSettings({ releaseOptions: [...fresh.releaseOptions, row] });
        await onCatalogRefreshed();
        onSaved(row.id);
        toast.success("Release aggiunta al catalogo.");
        onClose();
        return;
      }
      const merged = [...new Set([...(hit.presetIds ?? []), ...picked])];
      const nextList = fresh.releaseOptions.map((r) =>
        r.id === hit.id ? { ...r, presetIds: merged } : r,
      );
      await api.updateSettings({ releaseOptions: nextList });
      await onCatalogRefreshed();
      onSaved(hit.id);
      toast.success("Release aggiornata nel catalogo (servizi collegati).");
      onClose();
    } catch (e) {
      toast.error(api.formatErr(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open || !variant) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-950"
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h3>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Stessi campi del catalogo in Impostazioni: la voce viene salvata subito nel database.
        </p>

        <div className="mt-4 space-y-4">
          {variant === "environment" ? (
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Nome ambiente</label>
              <input
                value={envName}
                onChange={(e) => setEnvName(e.target.value)}
                placeholder="es. PROD"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                autoFocus
              />
            </div>
          ) : null}

          {variant === "version" ? (
            <>
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Valore</label>
                <input
                  value={versionValue}
                  onChange={(e) => setVersionValue(e.target.value)}
                  placeholder="es. 365"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                  autoFocus
                />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Servizio</p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  A quali nomi servizio {presetKind === "rdp" ? "RDP" : "WEB"} associare questa versione.
                </p>
                <div className="mt-2 flex max-w-md flex-wrap gap-x-3 gap-y-1.5">
                  {presetScope.map((p) => (
                    <label
                      key={p.id}
                      className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300"
                    >
                      <input
                        type="checkbox"
                        checked={presetPick.has(p.id)}
                        onChange={(e) => togglePreset(p.id, e.target.checked)}
                      />
                      <span className="max-w-[10rem] truncate" title={p.name || p.id}>
                        {p.name.trim() || "Servizio"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {variant === "release" ? (
            <>
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Nome</label>
                <input
                  value={releaseName}
                  onChange={(e) => setReleaseName(e.target.value)}
                  placeholder="es. Wave 3"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                  autoFocus
                />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Servizio</p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  A quali nomi servizio {presetKind === "rdp" ? "RDP" : "WEB"} associare questa release.
                </p>
                <div className="mt-2 flex max-w-md flex-wrap gap-x-3 gap-y-1.5">
                  {presetScope.map((p) => (
                    <label
                      key={p.id}
                      className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300"
                    >
                      <input
                        type="checkbox"
                        checked={presetPick.has(p.id)}
                        onChange={(e) => togglePreset(p.id, e.target.checked)}
                      />
                      <span className="max-w-[10rem] truncate" title={p.name || p.id}>
                        {p.name.trim() || "Servizio"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {variant === "crmModule" || variant === "collaboratorCompetency" ? (
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {variant === "crmModule" ? "Modulo" : "Competenza"}
              </label>
              <input
                value={moduleName}
                onChange={(e) => setModuleName(e.target.value)}
                placeholder={
                  variant === "crmModule" ? "Es. Fatture, CRM, Portale…" : "Es. Contabilità, HR, Payroll…"
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                autoFocus
              />
            </div>
          ) : null}

          {variant === "servicePreset" ? (
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Nome servizio</label>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Tipo: <strong>{presetKind === "rdp" ? "RDP" : "WEB"}</strong> — come nei servizi configurati in
                Impostazioni.
              </p>
              <input
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder={presetKind === "rdp" ? "Es. Gestionale principale" : "Es. Portale fornitori"}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                autoFocus
              />
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave()}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white",
              "bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50",
            )}
          >
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            Salva nel catalogo
          </button>
        </div>
      </div>
    </div>
  );
}
