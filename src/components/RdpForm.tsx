import { z } from "zod";

import { zodResolver } from "@hookform/resolvers/zod";

import { Controller, type UseFormReturn, useFieldArray, useForm } from "react-hook-form";

import React from "react";

import { FolderOpen, Plus, Trash2, ChevronDown } from "lucide-react";

import { toast } from "sonner";

import { open } from "@tauri-apps/plugin-dialog";

import type { AppSettings, Client, ConnectionNamePreset, RdpConnection } from "@/types";

import * as api from "@/lib/api";

import {
  environmentsForPreset,
  findPresetByNameKind,
  releaseOptionsForPresetId,
  versionOptionsForPresetId,
} from "@/lib/presetCatalog";

import { formatErr, isTauriRuntime } from "@/lib/api";

import { CatalogCreationModal, CATALOG_ADD_NEW_SENTINEL } from "@/components/CatalogCreationModal";
import { VaultUnlockBanner } from "@/components/VaultUnlockBanner";

import { pickNewRdpTemplate } from "@/lib/siblingConnections";

import { rdpDomainUserDisplay } from "@/lib/rdpDisplay";
import { cn } from "@/lib/utils";

const schema = z

  .object({
    entryMode: z.enum(["manual", "file"]),

    clientId: z.string().min(1),

    name: z.string().min(1, "Nome obbligatorio"),

    rdpFilePath: z.string().optional(),

    host: z.string().optional(),

    port: z.preprocess(
      (val) => {
        if (val === undefined || val === null) return undefined;
        if (typeof val === "number" && Number.isNaN(val)) return undefined;
        return val;
      },
      z.number().int().min(1).max(65535).optional(),
    ),

    username: z.string().optional(),

    passwordPlain: z.string().optional(),

    domain: z.string().optional(),

    resolutionWidth: z.coerce.number().optional(),

    resolutionHeight: z.coerce.number().optional(),

    colorDepth: z.coerce.number().optional(),

    useFullscreen: z.boolean(),

    useClipboard: z.boolean(),

    ignoreCertificate: z.boolean(),

    gatewayHost: z.string().optional(),

    notes: z.string().optional(),
    version: z.string().optional(),
    environmentSlots: z.array(
      z.object({
        environmentId: z.string(),
        releaseOptionId: z.string().optional(),
      }),
    ),
    versionOptionId: z.string().optional(),
    billing: z.boolean(),
    finance: z.boolean(),
    gwCredit: z.boolean(),
  })

  .superRefine((data, ctx) => {
    if (data.entryMode === "manual") {
      if (!data.host?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Host obbligatorio",
          path: ["host"],
        });
      }
    } else if (!data.rdpFilePath?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,

        message: "Percorso file .rdp obbligatorio",

        path: ["rdpFilePath"],
      });
    }
  });

export type RdpFormValues = z.infer<typeof schema>;

function initialEnvironmentSlots(
  initial: RdpConnection | null | undefined,
): { environmentId: string; releaseOptionId: string }[] {
  const dep =
    initial?.environmentDeployments?.filter((d) => (d.environmentId ?? "").trim()) ?? [];
  if (dep.length > 0) {
    return dep.map((d) => ({
      environmentId: (d.environmentId ?? "").trim(),
      releaseOptionId: (d.releaseOptionId ?? "").trim(),
    }));
  }
  if (initial?.environmentId?.trim()) {
    return [
      {
        environmentId: initial.environmentId.trim(),
        releaseOptionId: (initial.releaseOptionId ?? "").trim(),
      },
    ];
  }
  return [{ environmentId: "", releaseOptionId: "" }];
}

function applySiblingRdpDefaults(tpl: RdpConnection, form: UseFormReturn<RdpFormValues>): void {
  form.setValue("entryMode", "manual");
  form.setValue("rdpFilePath", "");
  form.setValue("host", tpl.host ?? "");
  form.setValue("port", tpl.port ?? 3389);
  form.setValue("username", tpl.username ?? "");
  form.setValue("domain", tpl.domain ?? "");
  form.setValue("gatewayHost", tpl.gatewayHost ?? "");
  form.setValue("resolutionWidth", tpl.resolutionWidth);
  form.setValue("resolutionHeight", tpl.resolutionHeight);
  form.setValue("colorDepth", tpl.colorDepth);
  form.setValue("useFullscreen", tpl.useFullscreen !== 0);
  form.setValue("useClipboard", tpl.useClipboard !== 0);
  form.setValue("ignoreCertificate", tpl.ignoreCertificate !== 0);
  form.setValue("environmentSlots", initialEnvironmentSlots(tpl));
  form.setValue("versionOptionId", tpl.versionOptionId ?? "");
  form.setValue("version", tpl.version ?? "");
  form.setValue("billing", tpl.billing ?? false);
  form.setValue("finance", tpl.finance ?? false);
  form.setValue("gwCredit", tpl.gwCredit ?? false);
}

function shouldShowRdpExtraOpen(initial: RdpConnection | null | undefined): boolean {
  if (!initial) return false;
  return !!(initial.billing || initial.finance || initial.gwCredit);
}

type Props = {
  clients: Client[];

  initial?: RdpConnection | null;

  /** Cliente predefinito (scheda cliente / finestra dedicata); con un solo elemento in `clients` la select è disabilitata. */
  preferredClientId?: string | null;

  /** Altre RDP dello stesso cliente: valorizzazione predefinita da una connessione già salvata con lo stesso nome preset. */
  siblingRdps?: RdpConnection[];

  /** Preset nomi (solo quelli con tipo RDP sono elencati qui). */
  connectionNamePresets?: ConnectionNamePreset[];

  /** Catalogo Impostazioni; se assente si usa solo la versione testuale legacy. */
  catalog?: AppSettings | null;

  /** Dopo aver modificato ambienti / versioni / release da qui, ricarica il catalogo lato pagina. */
  onCatalogRefreshed?: () => Promise<void>;

  onSubmit: (
    v: RdpFormValues & {
      clearPassword?: boolean;
      environmentDeployments: { environmentId: string; releaseOptionId: string | null }[];
      environmentId: string;
      releaseOptionId: string;
    },
  ) => Promise<void>;

  onCancel: () => void;
};

export function RdpForm({
  clients,
  initial,
  preferredClientId = null,
  siblingRdps,
  connectionNamePresets = [],
  catalog = null,
  onCatalogRefreshed,
  onSubmit,
  onCancel,
}: Props) {
  const [showExtra, setShowExtra] = React.useState(() => shouldShowRdpExtraOpen(initial));

  React.useEffect(() => {
    setShowExtra(shouldShowRdpExtraOpen(initial));
  }, [initial?.id, initial?.billing, initial?.finance, initial?.gwCredit]);

  const form = useForm<RdpFormValues>({
    resolver: zodResolver(schema),

    defaultValues: {
      entryMode: initial?.rdpFilePath ? "file" : "manual",

      clientId: initial?.clientId ?? preferredClientId ?? clients[0]?.id ?? "",

      name: initial?.name ?? "",

      rdpFilePath: initial?.rdpFilePath ?? "",

      host: initial?.host ?? "",

      port: initial?.port ?? undefined,

      username: initial?.username ?? "",

      passwordPlain: "",

      domain: initial?.domain ?? "",

      resolutionWidth: initial?.resolutionWidth ?? 1920,

      resolutionHeight: initial?.resolutionHeight ?? 1080,

      colorDepth: initial?.colorDepth ?? 32,

      useFullscreen: initial ? initial.useFullscreen !== 0 : true,

      useClipboard: initial ? initial.useClipboard !== 0 : true,

      ignoreCertificate: initial ? initial.ignoreCertificate !== 0 : true,

      gatewayHost: initial?.gatewayHost ?? "",

      notes: initial?.notes ?? "",

      version: initial?.version ?? "",

      environmentSlots: initialEnvironmentSlots(initial ?? null),

      versionOptionId: initial?.versionOptionId ?? "",

      billing: initial?.billing ?? false,

      finance: initial?.finance ?? false,

      gwCredit: initial?.gwCredit ?? false,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "environmentSlots",
  });

  const entryMode = form.watch("entryMode");

  const pwdSet = Boolean(initial?.passwordEncrypted);

  const [removePwd, setRemovePwd] = React.useState(false);

  const presetChoices = React.useMemo(() => {
    const raw = connectionNamePresets
      .filter((p) => p.kind === "rdp")
      .map((p) => p.name.trim())
      .filter(Boolean);
    return [...new Set(raw)].sort((a, b) => a.localeCompare(b, "it"));
  }, [connectionNamePresets]);

  /** Nome salvato su DB ma non presente tra i preset Attuali (resta selezionabile finché non allinei Impostazioni). */
  const legacyName =
    initial?.name && !presetChoices.includes(initial.name)
      ? initial.name
      : null;

  const canCreateWithPresets =
    presetChoices.length > 0 || Boolean(initial) || Boolean(onCatalogRefreshed && isTauriRuntime());

  const nameWatch = form.watch("name");
  const slotsWatch = form.watch("environmentSlots");

  const selectedPreset = React.useMemo(
    () => findPresetByNameKind(connectionNamePresets, nameWatch, "rdp"),
    [connectionNamePresets, nameWatch],
  );

  const envChoices = React.useMemo(
    () => environmentsForPreset(selectedPreset, catalog?.environments ?? []),
    [selectedPreset, catalog?.environments],
  );

  /** Versione prodotto: elenco da catalogo in base al preset (non all'ambiente della riga). */
  const versionChoices = React.useMemo(
    () => versionOptionsForPresetId(selectedPreset?.id, catalog?.versionOptions ?? []),
    [selectedPreset?.id, catalog?.versionOptions],
  );

  const releaseChoicesForPreset = React.useMemo(
    () => releaseOptionsForPresetId(selectedPreset?.id, catalog?.releaseOptions ?? []),
    [selectedPreset?.id, catalog?.releaseOptions],
  );

  const versionChoicesDisplayed = versionChoices;

  const presetNamedForCatalog = Boolean(selectedPreset?.name?.trim());

  const useCatalogUi =
    presetNamedForCatalog &&
    (envChoices.length > 0 || Boolean(onCatalogRefreshed && selectedPreset?.id));

  const catalogPresetExtEnabled = Boolean(onCatalogRefreshed && selectedPreset?.id);

  type CatalogPendingTarget =
    | { variant: "environment"; slotIndex: number }
    | { variant: "release"; slotIndex: number }
    | { variant: "version" }
    | { variant: "servicePreset" };

  const [catalogDialog, setCatalogDialog] = React.useState<CatalogPendingTarget | null>(null);

  const siblings = siblingRdps ?? [];

  const { onChange: nameOnChange, ...nameRegister } = form.register("name");
  const clientIdField = form.register("clientId");

  React.useEffect(() => {
    if (!useCatalogUi) return;
    const cur = form.getValues("versionOptionId");
    if (!cur) return;
    if (!versionChoicesDisplayed.some((x) => x.id === cur)) {
      form.setValue("versionOptionId", "");
    }
  }, [useCatalogUi, versionChoicesDisplayed, form, nameWatch, selectedPreset?.id]);

  const savedEnvIdsOutsideCatalog = React.useMemo(() => {
    const ids = new Set<string>();
    for (const d of initial?.environmentDeployments ?? []) {
      const id = (d.environmentId ?? "").trim();
      if (id && !catalog?.environments?.some((e) => e.id === id)) ids.add(id);
    }
    return [...ids];
  }, [initial?.environmentDeployments, catalog?.environments]);

  const orphanVersionOption = React.useMemo(() => {
    const id = initial?.versionOptionId?.trim();
    if (!id || versionChoicesDisplayed.some((v) => v.id === id)) return null;
    return catalog?.versionOptions.find((v) => v.id === id) ?? null;
  }, [initial?.versionOptionId, versionChoicesDisplayed, catalog?.versionOptions]);

  const unknownSavedVersionId =
    initial?.versionOptionId?.trim() &&
    !catalog?.versionOptions?.some((v) => v.id === initial.versionOptionId)
      ? initial.versionOptionId
      : null;

  const applyPreview = React.useCallback(
    async (path: string) => {
      const t = path.trim();

      if (!t || !isTauriRuntime()) return;

      try {
        const prev = await api.previewRdpFile(t);

        form.setValue("host", prev.host);

        form.setValue("port", prev.port);

        form.setValue("username", prev.username ?? "");

        form.setValue("domain", prev.domain ?? "");
      } catch (e) {
        toast.error(formatErr(e));
      }
    },

    [form],
  );

  React.useEffect(() => {
    const fp = initial?.rdpFilePath?.trim();
    if (!initial?.id || !fp) return;
    void applyPreview(fp);
  }, [initial?.id, initial?.rdpFilePath, applyPreview]);

  const pickRdpFile = async () => {
    if (!isTauriRuntime()) {
      toast.error(
        "Sfoglia file disponibile solo nella finestra desktop Tauri.",
      );

      return;
    }

    try {
      const selected = await open({
        title: "Seleziona file RDP",

        multiple: false,

        filters: [{ name: "Remote Desktop", extensions: ["rdp"] }],
      });

      if (selected === null || Array.isArray(selected)) return;

      form.setValue("rdpFilePath", selected);

      form.setValue("entryMode", "file");

      await applyPreview(selected);
    } catch (e) {
      toast.error(formatErr(e));
    }
  };

  return (
    <form
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
      onSubmit={form.handleSubmit(async (v) => {
        const preset = findPresetByNameKind(connectionNamePresets, v.name, "rdp");
        const presetOkSubmit = Boolean(preset?.name?.trim());
        const catalogEnvSubmit = catalog?.environments?.length ?? 0;
        const useExtendedCatalogSubmit =
          presetOkSubmit &&
          (catalogEnvSubmit > 0 || Boolean(onCatalogRefreshed && preset?.id));

        let environmentDeploymentsOut: {
          environmentId: string;
          releaseOptionId: string | null;
        }[] = [];

        let environmentIdOut = "";
        let releaseOptionIdOut = "";
        let versionOptionIdOut: string | null = null;
        let versionText: string | null = v.version?.trim() ? v.version.trim() : null;

        if (useExtendedCatalogSubmit) {
          versionText = null;

          const deployments = v.environmentSlots
            .map((slot) => ({
              environmentId: (slot.environmentId ?? "").trim(),
              releaseOptionId: slot.releaseOptionId?.trim()
                ? slot.releaseOptionId.trim()
                : null,
            }))
            .filter((s) => s.environmentId.length > 0);

          if (deployments.length === 0) {
            form.setError("environmentSlots", {
              type: "manual",
              message: "Indica almeno un ambiente per questo host / IP",
            });
            return;
          }

          const seen = new Set<string>();
          for (const d of deployments) {
            if (seen.has(d.environmentId)) {
              form.setError("environmentSlots", {
                type: "manual",
                message: "Ogni ambiente può comparire una sola volta sullo stesso host",
              });
              return;
            }
            seen.add(d.environmentId);
          }

          environmentDeploymentsOut = deployments;
          environmentIdOut = deployments[0]!.environmentId;
          releaseOptionIdOut = deployments[0]!.releaseOptionId ?? "";
          versionOptionIdOut = v.versionOptionId?.trim() ? v.versionOptionId.trim() : null;
        } else {
          environmentDeploymentsOut = [];
          versionOptionIdOut = null;
        }

        await onSubmit({
          ...v,

          environmentDeployments: environmentDeploymentsOut,
          environmentId: useExtendedCatalogSubmit ? environmentIdOut : "",
          releaseOptionId: useExtendedCatalogSubmit ? releaseOptionIdOut : "",
          versionOptionId: useExtendedCatalogSubmit ? (versionOptionIdOut ?? "") : "",

          version: useExtendedCatalogSubmit ? "" : (versionText ?? ""),

          gatewayHost: v.gatewayHost || undefined,

          clearPassword: initial ? removePwd : false,
        });
      })}
    >
      <VaultUnlockBanner />
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Desktop remoto: puoi inserire host e porta oppure importare le impostazioni da un file{" "}
        <span className="font-mono">.rdp</span> (host, porta e utente vengono letti dal file).
      </p>
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 p-1 dark:border-slate-700">
        <button
          type="button"
          onClick={() => form.setValue("entryMode", "manual")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            entryMode === "manual"
              ? "bg-emerald-600 text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          Impostazioni manuali
        </button>

        <button
          type="button"
          onClick={() => form.setValue("entryMode", "file")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            entryMode === "file"
              ? "bg-emerald-600 text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          Da file .rdp
        </button>
      </div>

      {entryMode === "file" ? (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Usa il file scaricato dal cliente: host e porta vengono letti dal
          file. Puoi salvare la password in modo protetto se serve.
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Cliente
          </label>

          <select
            {...clientIdField}
            disabled={clients.length <= 1}
            onChange={(e) => {
              void clientIdField.onChange(e);
              const cid = e.target.value;
              if (!initial && form.getValues("name").trim()) {
                const tpl = pickNewRdpTemplate(siblings, cid, form.getValues("name"));
                if (tpl) applySiblingRdpDefaults(tpl, form);
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
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            La VPN è associata al cliente dalla sua scheda, non alla singola connessione RDP.
            {clients.length <= 1 ? (
              <>
                {" "}
                <span className="text-slate-600 dark:text-slate-300">Cliente fisso sulla scheda corrente.</span>
              </>
            ) : null}
          </p>
        </div>

        <div className="md:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <label className="text-xs font-medium">Nome connessione</label>
            {!initial && onCatalogRefreshed && isTauriRuntime() ? (
              <button
                type="button"
                onClick={() => setCatalogDialog({ variant: "servicePreset" })}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
              >
                + Nuovo servizio RDP…
              </button>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Solo servizi di tipo <strong>RDP</strong> definiti in Impostazioni → <strong>Servizi</strong>.
          </p>
          {canCreateWithPresets ? (
            <select
              {...nameRegister}
              onChange={(e) => {
                nameOnChange(e);
                const presetName = e.target.value;
                if (!initial && presetName.trim()) {
                  const tpl = pickNewRdpTemplate(
                    siblings,
                    form.getValues("clientId"),
                    presetName,
                  );
                  if (tpl) applySiblingRdpDefaults(tpl, form);
                  else {
                    form.setValue("environmentSlots", [{ environmentId: "", releaseOptionId: "" }]);
                    form.setValue("versionOptionId", "");
                  }
                } else {
                  form.setValue("environmentSlots", [{ environmentId: "", releaseOptionId: "" }]);
                  form.setValue("versionOptionId", "");
                }
              }}
              disabled={presetChoices.length === 0 && Boolean(initial)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 disabled:opacity-60"
            >
              {!initial ? (
                <option value="">Seleziona nome connessione…</option>
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
                Nessun servizio <strong>RDP</strong> configurato: aggiungine almeno uno in Impostazioni → Servizi
                prima di creare una connessione RDP.
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
            <p className="text-xs text-rose-600">
              {form.formState.errors.name.message}
            </p>
          ) : null}
        </div>

        {useCatalogUi ? (
          <div className="md:col-span-2 space-y-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-700/80 dark:bg-slate-900/40">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                Stesso host / IP · più ambienti
              </p>
              <p className="mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                Aggiungi una riga per ogni ambiente presente sulla stessa connessione. La{" "}
                <strong>versione prodotto</strong> è unica per tutti; la <strong>release</strong> può essere
                diversa per ambiente.
              </p>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => {
                const eidWatch = slotsWatch[index]?.environmentId ?? "";
                const ridWatch = (slotsWatch[index]?.releaseOptionId ?? "").trim();
                const relChoices = releaseChoicesForPreset;
                const orphanRel =
                  ridWatch &&
                  !relChoices.some((r) => r.id === ridWatch) &&
                  catalog?.releaseOptions?.find((r) => r.id === ridWatch);
                const unknownRelSaved =
                  ridWatch &&
                  !catalog?.releaseOptions?.some((r) => r.id === ridWatch) &&
                  !orphanRel
                    ? ridWatch
                    : null;
                const curEnvTrim = eidWatch.trim();
                const envNotInCatalog =
                  Boolean(curEnvTrim) && !envChoices.some((e) => e.id === curEnvTrim);
                return (
                  <div
                    key={field.id}
                    className="grid gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <div>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        Ambiente
                      </label>
                      <Controller
                        control={form.control}
                        name={`environmentSlots.${index}.environmentId`}
                        render={({ field: envField }) => (
                          <select
                            name={envField.name}
                            ref={envField.ref}
                            onBlur={envField.onBlur}
                            value={typeof envField.value === "string" ? envField.value : ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === CATALOG_ADD_NEW_SENTINEL && onCatalogRefreshed) {
                                setCatalogDialog({ variant: "environment", slotIndex: index });
                                return;
                              }
                              envField.onChange(v);
                              form.setValue(`environmentSlots.${index}.releaseOptionId`, "", {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                            }}
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                          >
                            <option value="">Seleziona ambiente…</option>
                            {envNotInCatalog ? (
                              <option value={curEnvTrim}>
                                {catalog?.environments.find((e) => e.id === curEnvTrim)?.name?.trim() ||
                                  (savedEnvIdsOutsideCatalog.includes(curEnvTrim)
                                    ? "Ambiente non più in catalogo (ID salvato)"
                                    : "Valore salvato (non in elenco)")}
                              </option>
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
                        )}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        Release <span className="font-normal text-slate-500">(per riga ambiente)</span>
                      </label>
                      <Controller
                        control={form.control}
                        name={`environmentSlots.${index}.releaseOptionId`}
                        render={({ field: relField }) => (
                          <select
                            name={relField.name}
                            ref={relField.ref}
                            onBlur={relField.onBlur}
                            value={typeof relField.value === "string" ? relField.value : ""}
                            disabled={releaseChoicesForPreset.length === 0 && !catalogPresetExtEnabled}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === CATALOG_ADD_NEW_SENTINEL && catalogPresetExtEnabled) {
                                setCatalogDialog({ variant: "release", slotIndex: index });
                                return;
                              }
                              relField.onChange(v);
                            }}
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
                          >
                            <option value="">
                              {releaseChoicesForPreset.length === 0 && !catalogPresetExtEnabled
                                ? "Nessuna release per questo servizio nel catalogo"
                                : releaseChoicesForPreset.length === 0
                                  ? "Nessuna release — scegli «Aggiungi nuovo» sotto"
                                  : "Seleziona release…"}
                            </option>
                            {orphanRel ? (
                              <option value={orphanRel.id}>
                                {(orphanRel.name || orphanRel.id).trim()} (salvata — non nelle opzioni attuali)
                              </option>
                            ) : null}
                            {unknownRelSaved ? (
                              <option value={unknownRelSaved}>
                                Release non più in catalogo (ID salvato)
                              </option>
                            ) : null}
                            {relChoices.map((ro) => (
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
                        )}
                      />
                    </div>
                    <div className="flex items-end pb-0.5 md:justify-end">
                      <button
                        type="button"
                        disabled={fields.length <= 1}
                        onClick={() => remove(index)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-35 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/30"
                        aria-label={`Rimuovi ambiente ${index + 1}`}
                      >
                        <Trash2 size={14} aria-hidden /> Rimuovi
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => append({ environmentId: "", releaseOptionId: "" })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800/80"
            >
              <Plus size={14} aria-hidden /> Aggiungi ambiente
            </button>

            {form.formState.errors.environmentSlots?.message ? (
              <p className="text-xs text-rose-600">
                {String(form.formState.errors.environmentSlots.message)}
              </p>
            ) : null}

            <div className="md:w-3/5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Versione prodotto{" "}
                <span className="font-normal text-slate-500">(comune a tutti gli ambienti sopra)</span>
              </label>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Le versioni ammesse sono quelle del catalogo associate a questo servizio in Impostazioni.
              </p>
              <Controller
                control={form.control}
                name="versionOptionId"
                render={({ field: verField }) => (
                  <select
                    name={verField.name}
                    ref={verField.ref}
                    onBlur={verField.onBlur}
                    value={typeof verField.value === "string" ? verField.value : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === CATALOG_ADD_NEW_SENTINEL && catalogPresetExtEnabled) {
                        setCatalogDialog({ variant: "version" });
                        return;
                      }
                      verField.onChange(v);
                    }}
                    disabled={versionChoicesDisplayed.length === 0 && !catalogPresetExtEnabled}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="">
                      {versionChoicesDisplayed.length === 0 && !catalogPresetExtEnabled
                        ? "Nessuna versione per questo servizio nel catalogo"
                        : versionChoicesDisplayed.length === 0
                          ? "Nessuna versione — scegli «Aggiungi nuovo» sotto"
                          : "Seleziona versione prodotto…"}
                    </option>
                    {orphanVersionOption ? (
                      <option value={orphanVersionOption.id}>
                        {(orphanVersionOption.value || orphanVersionOption.id).trim()} (salvata — non nelle opzioni
                        attuali)
                      </option>
                    ) : null}
                    {unknownSavedVersionId ? (
                      <option value={unknownSavedVersionId}>
                        Versione prodotto non più in catalogo (ID salvato)
                      </option>
                    ) : null}
                    {versionChoicesDisplayed.map((vo) => (
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
                )}
              />
              {form.formState.errors.versionOptionId ? (
                <p className="mt-1 text-xs text-rose-600">
                  {form.formState.errors.versionOptionId.message}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Versione prodotto (testo libero){" "}
              <span className="font-normal text-slate-500">
                (opzionale, per la Panoramica servizi in Dashboard se non usi il catalogo)
              </span>
            </label>
            <input
              {...form.register("version")}
              placeholder="es. 365, 2016, GRIDWAY"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        )}

        {entryMode === "file" ? (
          <div className="md:col-span-2 space-y-2">
            <label className="text-xs font-medium">Percorso file .rdp</label>

            <div className="flex flex-wrap gap-2">
              <input
                {...form.register("rdpFilePath")}
                placeholder="C:\Percorso\connessione.rdp"
                className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
              />

              <button
                type="button"
                onClick={() => void pickRdpFile()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700"
              >
                <FolderOpen size={16} /> Sfoglia
              </button>

              <button
                type="button"
                onClick={() => {
                  const p = form.getValues("rdpFilePath");

                  void applyPreview(p ?? "");
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700"
              >
                Aggiorna anteprima
              </button>
            </div>

            {form.formState.errors.rdpFilePath ? (
              <p className="text-xs text-rose-600">
                {form.formState.errors.rdpFilePath.message}
              </p>
            ) : null}

            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/60">
              <div className="font-mono text-slate-700 dark:text-slate-300">
                {form.watch("host") || "—"}
              </div>
              {form.watch("port") != null && Number(form.watch("port")) !== 3389 ? (
                <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  Porta: {String(form.watch("port"))}
                </div>
              ) : null}

              <div className="mt-1 text-slate-600 dark:text-slate-400">
                Dominio \ utente:{" "}
                {rdpDomainUserDisplay(form.watch("domain"), form.watch("username")) || "—"}
              </div>
            </div>
          </div>
        ) : null}

        {entryMode === "manual" ? (
          <>
            <div>
              <label className="text-xs font-medium">Host / IP</label>

              <input
                {...form.register("host")}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />

              {form.formState.errors.host ? (
                <p className="text-xs text-rose-600">
                  {form.formState.errors.host.message}
                </p>
              ) : null}
            </div>

            <div>
              <label className="text-xs font-medium">Porta (opzionale)</label>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Vuoto = predefinito 3389 (Windows RDP).
              </p>

              <input
                type="number"
                {...form.register("port", { valueAsNumber: true })}
                placeholder="3389"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />

              {form.formState.errors.port ? (
                <p className="text-xs text-rose-600">
                  {String(form.formState.errors.port.message)}
                </p>
              ) : null}
            </div>

            <div>
              <label className="text-xs font-medium">Username</label>

              <input
                {...form.register("username")}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
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
              <label className="text-xs font-medium">Dominio</label>

              <input
                {...form.register("domain")}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          </>
        ) : (
          <div className="md:col-span-2">
            <label className="text-xs font-medium">
              Password {pwdSet ? "(lascia vuoto per non modificare)" : ""}
            </label>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Da file .rdp: utente e dominio compaiono nell’anteprima sopra. Se il file ha già la password di Windows
              incorporata e lasci vuoto il campo qui, all’avvio resta quella del file. Se salvi una password nel vault,
              all’avvio viene usata quella (e le righe password incorporate nel file vengono ignorate).
            </p>

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
        )}

        {entryMode === "manual" ? (
          <>
            <div>
              <label className="text-xs font-medium">Larghezza</label>

              <input
                type="number"
                {...form.register("resolutionWidth")}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-medium">Altezza</label>

              <input
                type="number"
                {...form.register("resolutionHeight")}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-medium">Profondità colore</label>

              <input
                type="number"
                {...form.register("colorDepth")}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <div>
              <label className="text-xs font-medium">Gateway</label>

              <input
                {...form.register("gatewayHost")}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("useFullscreen")} />{" "}
              Fullscreen
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("useClipboard")} />{" "}
              Clipboard
            </label>

            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input type="checkbox" {...form.register("ignoreCertificate")} />{" "}
              Ignora certificato
            </label>
          </>
        ) : null}

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
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...form.register("billing")} />
                Billing
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...form.register("finance")} />
                Finance
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...form.register("gwCredit")} />
                GW Credit
              </label>
            </div>
          ) : null}
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-medium">Note</label>

          <textarea
            {...form.register("notes")}
            rows={2}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
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
          disabled={
            form.formState.isSubmitting ||
            (!initial && presetChoices.length === 0 && !nameWatch.trim())
          }
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Salva
        </button>
      </div>

      {catalogDialog && onCatalogRefreshed ? (
        <CatalogCreationModal
          open={catalogDialog !== null}
          variant={catalogDialog.variant === "servicePreset" ? "servicePreset" : catalogDialog.variant}
          presetKind="rdp"
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
            const ctx = catalogDialog;
            setCatalogDialog(null);
            if (!ctx) return;
            if (ctx.variant === "servicePreset") {
              const nameTrim = value.trim();
              form.setValue("name", nameTrim, {
                shouldDirty: true,
                shouldValidate: true,
              });
              if (nameTrim) {
                const tpl = pickNewRdpTemplate(
                  siblings,
                  form.getValues("clientId"),
                  nameTrim,
                );
                if (tpl) applySiblingRdpDefaults(tpl, form);
                else {
                  form.setValue("environmentSlots", [{ environmentId: "", releaseOptionId: "" }]);
                  form.setValue("versionOptionId", "");
                }
              }
              return;
            }
            if (ctx.variant === "environment") {
              form.setValue(`environmentSlots.${ctx.slotIndex}.environmentId`, value, {
                shouldDirty: true,
                shouldValidate: true,
              });
              return;
            }
            if (ctx.variant === "version") {
              form.setValue("versionOptionId", value, { shouldDirty: true });
              return;
            }
            form.setValue(`environmentSlots.${ctx.slotIndex}.releaseOptionId`, value, { shouldDirty: true });
          }}
        />
      ) : null}
    </form>
  );
}
