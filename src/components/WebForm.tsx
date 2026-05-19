import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn } from "react-hook-form";
import React from "react";
import type { AppSettings, Client, ConnectionNamePreset, CrmModuleDef, VpnConnection, WebAccess } from "@/types";
import {
  environmentsForPreset,
  findPresetByNameKind,
  releaseOptionsForPresetId,
  versionOptionsForPresetId,
} from "@/lib/presetCatalog";
import { effectiveClientVpnId } from "@/lib/clientVpn";
import { VaultUnlockBanner } from "@/components/VaultUnlockBanner";

import { isTauriRuntime } from "@/lib/api";

import { CatalogCreationModal, CATALOG_ADD_NEW_SENTINEL } from "@/components/CatalogCreationModal";
import { pickNewWebTemplate } from "@/lib/siblingConnections";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

function webCrmIdsFromAccess(w: Pick<WebAccess, "crmModuleIds" | "crmModuleId">): string[] {
  const ids = [...(w.crmModuleIds ?? [])].map((x) => x.trim()).filter(Boolean);
  const uniq = [...new Set(ids)];
  if (uniq.length) return uniq;
  const one = w.crmModuleId?.trim();
  return one ? [one] : [];
}

const schema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1, "Nome obbligatorio"),
  url: z.string().min(1, "URL obbligatorio"),
  domain: z.string().optional(),
  username: z.string().optional(),
  passwordPlain: z.string().optional(),
  notes: z.string().optional(),
  version: z.string().optional(),
  environmentId: z.string().optional(),
  versionOptionId: z.string().optional(),
  releaseOptionId: z.string().optional(),
  crmModuleIds: z.array(z.string()),
  sportello: z.boolean(),
});

export type WebFormValues = z.infer<typeof schema>;

function applySiblingWebDefaults(tpl: WebAccess, form: UseFormReturn<WebFormValues>): void {
  form.setValue("domain", tpl.domain ?? "");
  form.setValue("environmentId", tpl.environmentId ?? "");
  form.setValue("versionOptionId", tpl.versionOptionId ?? "");
  form.setValue("releaseOptionId", tpl.releaseOptionId ?? "");
  form.setValue("version", tpl.version ?? "");
  form.setValue("crmModuleIds", webCrmIdsFromAccess(tpl));
  form.setValue("sportello", tpl.sportello === true);
}

type Props = {
  clients: Client[];
  vpns?: VpnConnection[];
  connectionNamePresets?: ConnectionNamePreset[];
  catalog?: AppSettings | null;
  /** Dopo modifiche al catalogo (ambiente/versione/release) da questo riquadro. */
  onCatalogRefreshed?: () => Promise<void>;
  /** Voci catalogo Moduli (Impostazioni). */
  crmModules?: CrmModuleDef[];
  initial?: WebAccess | null;
  preferredClientId?: string | null;
  /** Altri accessi web dello stesso cliente (per copiare dominio / catalogo da un accesso già salvato con lo stesso nome). */
  siblingWebAccesses?: WebAccess[];
  onSubmit: (v: WebFormValues & { clearPassword?: boolean }) => Promise<void>;
  onCancel: () => void;
};

export function WebForm({
  clients,
  vpns = [],
  connectionNamePresets = [],
  catalog = null,

  onCatalogRefreshed,

  crmModules = [],
  initial,
  preferredClientId,
  siblingWebAccesses,
  onSubmit,
  onCancel,
}: Props) {
  const modules = crmModules;
  function shouldShowWebExtra(initialW: WebAccess | null | undefined): boolean {
    if (!initialW) return false;
    return !!(webCrmIdsFromAccess(initialW).length > 0 || initialW.sportello === true);
  }
  const [showExtra, setShowExtra] = React.useState(() => shouldShowWebExtra(initial));

  React.useEffect(() => {
    setShowExtra(shouldShowWebExtra(initial));
  }, [initial?.id, initial?.crmModuleIds, initial?.crmModuleId, initial?.sportello]);

  const form = useForm<WebFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId: initial?.clientId ?? preferredClientId ?? clients[0]?.id ?? "",
      name: initial?.name ?? "",
      url: initial?.url ?? "",
      domain: initial?.domain ?? "",
      username: initial?.username ?? "",
      passwordPlain: "",
      notes: initial?.notes ?? "",
      version: initial?.version ?? "",
      environmentId: initial?.environmentId ?? "",
      versionOptionId: initial?.versionOptionId ?? "",
      releaseOptionId: initial?.releaseOptionId ?? "",
      crmModuleIds: initial ? webCrmIdsFromAccess(initial) : [],
      sportello: initial?.sportello === true,
    },
  });

  const pwdSet = Boolean(initial?.passwordEncrypted);
  const [removePwd, setRemovePwd] = React.useState(false);

  const clientIdWatch = form.watch("clientId");
  const selClient = clients.find((c) => c.id === clientIdWatch);
  const vpnsForClient = React.useMemo(
    () => vpns.filter((v) => v.clientId === clientIdWatch),
    [vpns, clientIdWatch],
  );
  const fixedVpnLabel = React.useMemo(() => {
    const id = effectiveClientVpnId(selClient, vpnsForClient);
    if (!id) return null;
    return vpnsForClient.find((v) => v.id === id)?.name ?? id;
  }, [selClient, vpnsForClient]);

  const presetChoices = React.useMemo(() => {
    const raw = connectionNamePresets
      .filter((p) => p.kind === "web")
      .map((p) => p.name.trim())
      .filter(Boolean);
    return [...new Set(raw)].sort((a, b) => a.localeCompare(b, "it"));
  }, [connectionNamePresets]);

  const legacyName =
    initial?.name && !presetChoices.includes(initial.name) ? initial.name : null;

  const canCreateWithPresets =
    presetChoices.length > 0 || Boolean(initial) || Boolean(onCatalogRefreshed && isTauriRuntime());

  const siblings = siblingWebAccesses ?? [];

  const nameWatch = form.watch("name");
  const crmModuleIdsWatch = form.watch("crmModuleIds");

  const clientField = form.register("clientId");

  const selectedPreset = React.useMemo(
    () => findPresetByNameKind(connectionNamePresets, nameWatch, "web"),
    [connectionNamePresets, nameWatch],
  );

  const envChoices = React.useMemo(
    () => environmentsForPreset(selectedPreset, catalog?.environments ?? []),
    [selectedPreset, catalog?.environments],
  );

  const versionChoices = React.useMemo(
    () => versionOptionsForPresetId(selectedPreset?.id, catalog?.versionOptions ?? []),
    [selectedPreset?.id, catalog?.versionOptions],
  );

  const releaseChoices = React.useMemo(
    () => releaseOptionsForPresetId(selectedPreset?.id, catalog?.releaseOptions ?? []),
    [selectedPreset?.id, catalog?.releaseOptions],
  );

  const presetNamedForCatalog = Boolean(selectedPreset?.name?.trim());

  const useCatalogUi =
    presetNamedForCatalog &&
    (envChoices.length > 0 || Boolean(onCatalogRefreshed && selectedPreset?.id));

  const catalogPresetExtEnabled = Boolean(onCatalogRefreshed && selectedPreset?.id);

  type WebCatalogDialogVariant =
    | "environment"
    | "version"
    | "release"
    | "crmModule"
    | "servicePreset";
  type WebCatalogDialogState = { variant: WebCatalogDialogVariant };

  const [catalogDialog, setCatalogDialog] = React.useState<WebCatalogDialogState | null>(null);

  const environmentIdFd = form.watch("environmentId");
  const versionOptionIdFd = form.watch("versionOptionId");
  const releaseOptionIdFd = form.watch("releaseOptionId");

  const envFieldReg = form.register("environmentId");
  const verFieldReg = form.register("versionOptionId");
  const relFieldReg = form.register("releaseOptionId");

  const { onChange: nameOnChange, ...nameRegister } = form.register("name");

  React.useEffect(() => {
    if (!useCatalogUi) return;
    const cur = form.getValues("versionOptionId");
    if (!cur) return;
    if (!versionChoices.some((x) => x.id === cur)) {
      form.setValue("versionOptionId", "");
    }
  }, [useCatalogUi, versionChoices, form, nameWatch]);

  React.useEffect(() => {
    if (!useCatalogUi) return;
    const cur = form.getValues("releaseOptionId");
    if (!cur) return;
    if (!releaseChoices.some((x) => x.id === cur)) {
      form.setValue("releaseOptionId", "");
    }
  }, [useCatalogUi, releaseChoices, form, nameWatch]);

  const orphanEnvOption = React.useMemo(() => {
    const id = initial?.environmentId?.trim();
    if (!id || envChoices.some((e) => e.id === id)) return null;
    return catalog?.environments.find((e) => e.id === id) ?? null;
  }, [initial?.environmentId, envChoices, catalog?.environments]);

  const unknownSavedEnvId =
    initial?.environmentId?.trim() &&
    !catalog?.environments?.some((e) => e.id === initial.environmentId)
      ? initial.environmentId
      : null;

  const orphanVersionOption = React.useMemo(() => {
    const id = initial?.versionOptionId?.trim();
    if (!id || versionChoices.some((v) => v.id === id)) return null;
    return catalog?.versionOptions.find((v) => v.id === id) ?? null;
  }, [initial?.versionOptionId, versionChoices, catalog?.versionOptions]);

  const unknownSavedVersionId =
    initial?.versionOptionId?.trim() &&
    !catalog?.versionOptions?.some((v) => v.id === initial.versionOptionId)
      ? initial.versionOptionId
      : null;

  const orphanReleaseOption = React.useMemo(() => {
    const id = initial?.releaseOptionId?.trim();
    if (!id || releaseChoices.some((r) => r.id === id)) return null;
    return catalog?.releaseOptions?.find((r) => r.id === id) ?? null;
  }, [initial?.releaseOptionId, releaseChoices, catalog?.releaseOptions]);

  const unknownSavedReleaseId =
    initial?.releaseOptionId?.trim() &&
    !catalog?.releaseOptions?.some((r) => r.id === initial.releaseOptionId)
      ? initial.releaseOptionId
      : null;

  return (
    <form
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
      onSubmit={form.handleSubmit(async (v) => {
        const preset = findPresetByNameKind(connectionNamePresets, v.name, "web");
        const presetOkSubmit = Boolean(preset?.name?.trim());
        const catalogEnvSubmit = catalog?.environments?.length ?? 0;
        const useExtendedCatalogSubmit =
          presetOkSubmit &&
          (catalogEnvSubmit > 0 || Boolean(onCatalogRefreshed && preset?.id));

        let environmentIdOut: string | null = null;
        let versionOptionIdOut: string | null = null;
        let releaseOptionIdOut: string | null = null;
        let versionText: string | null = v.version?.trim() ? v.version.trim() : null;

        if (useExtendedCatalogSubmit) {
          versionText = null;
          environmentIdOut = v.environmentId?.trim() ? v.environmentId.trim() : null;
          if (!environmentIdOut) {
            form.setError("environmentId", {
              type: "manual",
              message: "Seleziona un ambiente",
            });
            return;
          }
          versionOptionIdOut = v.versionOptionId?.trim() ? v.versionOptionId.trim() : null;
          releaseOptionIdOut = v.releaseOptionId?.trim() ? v.releaseOptionId.trim() : null;
        } else {
          environmentIdOut = null;
          versionOptionIdOut = null;
          releaseOptionIdOut = null;
        }

        await onSubmit({
          ...v,
          environmentId: useExtendedCatalogSubmit ? (environmentIdOut ?? "") : "",
          versionOptionId: useExtendedCatalogSubmit ? (versionOptionIdOut ?? "") : "",
          releaseOptionId: useExtendedCatalogSubmit ? (releaseOptionIdOut ?? "") : "",
          version: useExtendedCatalogSubmit ? "" : (versionText ?? ""),
          clearPassword: initial ? removePwd : false,
        });
      })}
    >
      <VaultUnlockBanner />
      <p className="text-xs text-slate-600 dark:text-slate-400">
        CRM / portali web: salva le credenziali in modo protetto e apri il link nel browser predefinito.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Cliente</label>
          <select
            {...clientField}
            disabled={clients.length <= 1}
            onChange={(e) => {
              void clientField.onChange(e);
              const cid = e.target.value;
              if (!initial && form.getValues("name").trim()) {
                const tpl = pickNewWebTemplate(siblings, cid, form.getValues("name"));
                if (tpl) applySiblingWebDefaults(tpl, form);
              }
            }}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 disabled:opacity-70"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {clients.length <= 1 ? (
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Cliente fisso sulla scheda corrente.</p>
          ) : null}
        </div>
        {fixedVpnLabel ? (
          <div className="md:col-span-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
            VPN cliente (stessa contestualità delle RDP):{" "}
            <span className="font-semibold">{fixedVpnLabel}</span>
          </div>
        ) : null}
        <div className="md:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <label className="text-xs font-medium">Nome accesso</label>
            {!initial && onCatalogRefreshed && isTauriRuntime() ? (
              <button
                type="button"
                onClick={() => setCatalogDialog({ variant: "servicePreset" })}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
              >
                + Nuovo servizio WEB…
              </button>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Solo servizi di tipo <strong>WEB</strong> definiti in Impostazioni → <strong>Servizi</strong>.
          </p>
          {canCreateWithPresets ? (
            <select
              {...nameRegister}
              onChange={(e) => {
                nameOnChange(e);
                const presetName = e.target.value;
                if (!initial && presetName.trim()) {
                  const tpl = pickNewWebTemplate(siblings, form.getValues("clientId"), presetName);
                  if (tpl) applySiblingWebDefaults(tpl, form);
                  else {
                    form.setValue("environmentId", "");
                    form.setValue("versionOptionId", "");
                    form.setValue("releaseOptionId", "");
                  }
                } else {
                  form.setValue("environmentId", "");
                  form.setValue("versionOptionId", "");
                  form.setValue("releaseOptionId", "");
                }
              }}
              disabled={presetChoices.length === 0 && Boolean(initial)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 disabled:opacity-60"
            >
              {!initial ? (
                <option value="">Seleziona nome accesso…</option>
              ) : null}
              {legacyName ? (
                <option value={legacyName}>
                  {legacyName} (salvato — non in Impostazioni)
                </option>
              ) : null}
              {presetChoices.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          ) : (
            <div className="mt-1 space-y-1">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Nessun servizio <strong>WEB</strong> configurato: aggiungine almeno uno in Impostazioni → Servizi prima di creare un
                accesso web.
              </p>
              <select
                disabled
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm opacity-60 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">—</option>
              </select>
            </div>
          )}
          {form.formState.errors.name ? (
            <p className="text-xs text-rose-600">{form.formState.errors.name.message}</p>
          ) : null}
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium">URL</label>
          <input
            {...form.register("url")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
            placeholder="https://crm.esempio.it"
          />
          {form.formState.errors.url ? (
            <p className="text-xs text-rose-600">{form.formState.errors.url.message}</p>
          ) : null}
        </div>
        <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Dominio Windows</label>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-500">
              Opzionale · es. AZIENDA per <span className="font-mono">DOMINIO\utente</span> al login CRM
            </p>
            <input
              {...form.register("domain")}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
              placeholder="AZIENDA"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="text-xs font-medium">Nome utente</label>
            <input
              {...form.register("username")}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
              autoComplete="off"
            />
          </div>
        </div>
        {useCatalogUi ? (
          <div className="md:col-span-2 grid gap-3 md:grid-cols-3 md:items-end">
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Ambiente</label>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Catalogo ambienti (tutti disponibili per ogni servizio).
              </p>
              <select
                name="environmentId"
                ref={envFieldReg.ref}
                value={typeof environmentIdFd === "string" ? environmentIdFd : ""}
                onBlur={envFieldReg.onBlur}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === CATALOG_ADD_NEW_SENTINEL && onCatalogRefreshed) {
                    setCatalogDialog({ variant: "environment" });
                    return;
                  }
                  form.setValue("environmentId", v, { shouldDirty: true });
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Seleziona ambiente…</option>
                {orphanEnvOption ? (
                  <option value={orphanEnvOption.id}>
                    {orphanEnvOption.name || orphanEnvOption.id} (salvato)
                  </option>
                ) : null}
                {unknownSavedEnvId ? (
                  <option value={unknownSavedEnvId}>Ambiente non più in catalogo (ID salvato)</option>
                ) : null}
                {envChoices.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name.trim() || e.id}
                  </option>
                ))}
                {onCatalogRefreshed ? (
                  <option value={CATALOG_ADD_NEW_SENTINEL} className="font-semibold text-emerald-700">
                    + Aggiungi nuovo…
                  </option>
                ) : null}
              </select>
              {form.formState.errors.environmentId ? (
                <p className="mt-1 text-xs text-rose-600">{form.formState.errors.environmentId.message}</p>
              ) : null}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Versione prodotto</label>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Voci del catalogo associate a questo servizio (Impostazioni → Versione prodotto).
              </p>
              <select
                name="versionOptionId"
                ref={verFieldReg.ref}
                value={typeof versionOptionIdFd === "string" ? versionOptionIdFd : ""}
                onBlur={verFieldReg.onBlur}
                disabled={versionChoices.length === 0 && !catalogPresetExtEnabled}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === CATALOG_ADD_NEW_SENTINEL && catalogPresetExtEnabled) {
                    setCatalogDialog({ variant: "version" });
                    return;
                  }
                  form.setValue("versionOptionId", v, { shouldDirty: true });
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">
                  {versionChoices.length === 0 && !catalogPresetExtEnabled
                    ? "Nessuna versione per questo servizio nel catalogo"
                    : versionChoices.length === 0
                      ? "Nessuna versione — scegli «Aggiungi nuovo» sotto"
                      : "Seleziona versione prodotto…"}
                </option>
                {orphanVersionOption ? (
                  <option value={orphanVersionOption.id}>
                    {(orphanVersionOption.value || orphanVersionOption.id).trim()} (salvata — non nelle opzioni attuali)
                  </option>
                ) : null}
                {unknownSavedVersionId ? (
                  <option value={unknownSavedVersionId}>Versione prodotto non più in catalogo (ID salvato)</option>
                ) : null}
                {versionChoices.map((vo) => (
                  <option key={vo.id} value={vo.id}>
                    {vo.value.trim() || vo.id}
                  </option>
                ))}
                {catalogPresetExtEnabled ? (
                  <option value={CATALOG_ADD_NEW_SENTINEL} className="font-semibold text-emerald-700">
                    + Aggiungi nuovo…
                  </option>
                ) : null}
              </select>
              {form.formState.errors.versionOptionId ? (
                <p className="mt-1 text-xs text-rose-600">{form.formState.errors.versionOptionId.message}</p>
              ) : null}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Release</label>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Voci associate a questo servizio (Impostazioni → Release).
              </p>
              <select
                name="releaseOptionId"
                ref={relFieldReg.ref}
                value={typeof releaseOptionIdFd === "string" ? releaseOptionIdFd : ""}
                onBlur={relFieldReg.onBlur}
                disabled={releaseChoices.length === 0 && !catalogPresetExtEnabled}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === CATALOG_ADD_NEW_SENTINEL && catalogPresetExtEnabled) {
                    setCatalogDialog({ variant: "release" });
                    return;
                  }
                  form.setValue("releaseOptionId", v, { shouldDirty: true });
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">
                  {releaseChoices.length === 0 && !catalogPresetExtEnabled
                    ? "Nessuna release per questo servizio nel catalogo"
                    : releaseChoices.length === 0
                      ? "Nessuna release — scegli «Aggiungi nuovo» sotto"
                      : "Seleziona release…"}
                </option>
                {orphanReleaseOption ? (
                  <option value={orphanReleaseOption.id}>
                    {(orphanReleaseOption.name || orphanReleaseOption.id).trim()} (salvata — non nelle opzioni attuali)
                  </option>
                ) : null}
                {unknownSavedReleaseId ? (
                  <option value={unknownSavedReleaseId}>Release non più in catalogo (ID salvato)</option>
                ) : null}
                {releaseChoices.map((ro) => (
                  <option key={ro.id} value={ro.id}>
                    {ro.name.trim() || ro.id}
                  </option>
                ))}
                {catalogPresetExtEnabled ? (
                  <option value={CATALOG_ADD_NEW_SENTINEL} className="font-semibold text-emerald-700">
                    + Aggiungi nuovo…
                  </option>
                ) : null}
              </select>
              {form.formState.errors.releaseOptionId ? (
                <p className="mt-1 text-xs text-rose-600">{form.formState.errors.releaseOptionId.message}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Versione prodotto (testo libero){" "}
              <span className="font-normal text-slate-500">(opzionale, per la Panoramica servizi)</span>
            </label>
            <input
              {...form.register("version")}
              placeholder="es. 365, browser, ANDROID"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        )}
        <div className="md:col-span-2 rounded-xl border border-dashed border-slate-200 p-3 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setShowExtra((o) => !o)}
            className="flex w-full items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:bg-slate-800/90"
          >
            <span>Dati aggiuntivi</span>
            <ChevronDown
              className={cn("h-5 w-5 shrink-0 text-slate-500 transition-transform", showExtra ? "rotate-180" : "")}
              aria-hidden
            />
          </button>
          {showExtra ? (
            <div className="mt-3 space-y-3">
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Moduli</label>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Selezione multipla · catalogo in Impostazioni → Moduli.
                </p>
                {modules.length === 0 && (crmModuleIdsWatch?.length ?? 0) === 0 ? (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Nessun modulo nel catalogo: creane uno qui sotto o da Impostazioni → Moduli.
                  </p>
                ) : null}
                <div className="mt-2 flex flex-col gap-2">
                  {crmModuleIdsWatch
                    ?.filter((id) => !modules.some((m) => m.id === id))
                    .map((oid) => (
                      <label
                        key={oid}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm dark:border-amber-900/60 dark:bg-amber-950/30"
                      >
                        <input
                          type="checkbox"
                          checked
                          className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          onChange={() => {
                            const cur = form.getValues("crmModuleIds") ?? [];
                            form.setValue(
                              "crmModuleIds",
                              cur.filter((x) => x !== oid),
                            );
                          }}
                        />
                        <span className="text-slate-800 dark:text-slate-100">
                          <span className="font-mono text-xs">{oid}</span>{" "}
                          <span className="text-[11px] text-amber-800 dark:text-amber-200">
                            (non più in catalogo — deseleziona per rimuovere)
                          </span>
                        </span>
                      </label>
                    ))}
                  {modules.map((m) => {
                    const checked = (crmModuleIdsWatch ?? []).includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900/80"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          onChange={(e) => {
                            const cur = [...(form.getValues("crmModuleIds") ?? [])];
                            const on = e.target.checked;
                            let next = cur.filter((x) => x !== m.id);
                            if (on) next = [...next, m.id];
                            form.setValue("crmModuleIds", next);
                          }}
                        />
                        <span>{m.name.trim() || m.id}</span>
                      </label>
                    );
                  })}
                  {onCatalogRefreshed ? (
                    <button
                      type="button"
                      onClick={() => setCatalogDialog({ variant: "crmModule" })}
                      className="w-full rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 px-3 py-2 text-left text-xs font-semibold text-emerald-900 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100 dark:hover:bg-emerald-950/50"
                    >
                      + Aggiungi nuovo modulo…
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Sportello</span>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" {...form.register("sportello")} />
                  Sì
                </label>
              </div>
            </div>
          ) : null}
        </div>
        <div>
          <label className="text-xs font-medium">
            Password {pwdSet ? "(lascia vuoto per non modificare)" : ""}
          </label>
          <input
            type="password"
            autoComplete="new-password"
            {...form.register("passwordPlain")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          {initial && pwdSet ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={removePwd}
                onChange={(e) => setRemovePwd(e.target.checked)}
              />
              Rimuovi password salvata
            </label>
          ) : null}
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium">Note</label>
          <textarea
            {...form.register("notes")}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border px-4 py-2 text-sm dark:border-slate-700"
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={form.formState.isSubmitting || (!initial && presetChoices.length === 0 && !nameWatch.trim())}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Salva
        </button>
      </div>

      {catalogDialog && onCatalogRefreshed ? (
        <CatalogCreationModal
          open={catalogDialog !== null}
          variant={catalogDialog.variant === "servicePreset" ? "servicePreset" : catalogDialog.variant}
          presetKind="web"
          connectionNamePresets={connectionNamePresets}
          defaultPresetIds={
            catalogDialog.variant === "servicePreset"
              ? []
              : selectedPreset?.id
                ? [selectedPreset.id]
                : []
          }
          onClose={() => setCatalogDialog(null)}
          onCatalogRefreshed={onCatalogRefreshed}
          onSaved={(value) => {
            const prev = catalogDialog;
            setCatalogDialog(null);
            if (!prev) return;
            if (prev.variant === "servicePreset") {
              const nameTrim = value.trim();
              form.setValue("name", nameTrim, {
                shouldDirty: true,
                shouldValidate: true,
              });
              if (nameTrim) {
                const tpl = pickNewWebTemplate(siblings, form.getValues("clientId"), nameTrim);
                if (tpl) applySiblingWebDefaults(tpl, form);
                else {
                  form.setValue("environmentId", "");
                  form.setValue("versionOptionId", "");
                  form.setValue("releaseOptionId", "");
                }
              }
              return;
            }
            if (prev.variant === "environment") {
              form.setValue("environmentId", value, { shouldDirty: true });
              return;
            }
            if (prev.variant === "version") {
              form.setValue("versionOptionId", value, { shouldDirty: true });
              return;
            }
            if (prev.variant === "release") {
              form.setValue("releaseOptionId", value, { shouldDirty: true });
              return;
            }
            const cur = [...(form.getValues("crmModuleIds") ?? [])];
            if (!cur.includes(value)) form.setValue("crmModuleIds", [...cur, value], { shouldDirty: true });
          }}
        />
      ) : null}
    </form>
  );
}
