import { z } from "zod";

import { zodResolver } from "@hookform/resolvers/zod";

import { Controller, useForm } from "react-hook-form";

import React from "react";

import type { Client, ContractTypeDef, VpnConnection } from "@/types";

import { photonSuggest, type PhotonSuggestion } from "@/lib/photonGeocode";

import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";



const schema = z.object({

  name: z.string().min(1, "Nome obbligatorio"),

  description: z.string().optional(),

  websiteUrl: z.string().optional(),

  location: z.string().optional(),

  /** Solo in modifica cliente; vuoto = nessuna VPN predefinita */

  defaultVpnId: z.string().optional(),

  contractTypeId: z.string().optional(),

  updateCount: z.coerce.number().int().min(0).catch(0),

});



export type ClientFormValues = z.infer<typeof schema>;



type Props = {

  initial?: Client | null;

  /** Voci catalogo «Contratti» da Impostazioni. */

  contractTypes: ContractTypeDef[];

  /** VPN del cliente in modifica (vuoto per nuovo cliente). */

  vpnsForClient: VpnConnection[];

  onSubmit: (v: ClientFormValues) => Promise<void>;

  onCancel: () => void;

};



/** Campo sede con suggerimenti da Photon/OSM mentre si digita. */

function LocationSuggestField({

  value,

  onChange,

  onBlur,

}: {

  value: string;

  onChange: (next: string) => void;

  onBlur: () => void;

}) {

  const [open, setOpen] = React.useState(false);

  const [busy, setBusy] = React.useState(false);

  const [hits, setHits] = React.useState<PhotonSuggestion[]>([]);

  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const blurDelayRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);



  React.useEffect(() => {

    const raw = typeof value === "string" ? value : "";

    if (raw.trim().length < 2) {

      setHits([]);

      setBusy(false);

      return;

    }

    const ac = new AbortController();

    const t = window.setTimeout(async () => {

      setBusy(true);

      try {

        const next = await photonSuggest(raw, { signal: ac.signal, limit: 8 });

        if (!ac.signal.aborted) setHits(next);

      } catch {

        if (!ac.signal.aborted) setHits([]);

      } finally {

        if (!ac.signal.aborted) setBusy(false);

      }

    }, 280);

    return () => {

      ac.abort();

      window.clearTimeout(t);

    };

  }, [value]);



  React.useEffect(() => {

    return () => {

      if (blurDelayRef.current) window.clearTimeout(blurDelayRef.current);

    };

  }, []);



  React.useEffect(() => {

    const doc = typeof document !== "undefined" ? document : null;

    if (!doc || !open) return;

    const onDoc = (ev: MouseEvent) => {

      const el = rootRef.current;

      if (el && !el.contains(ev.target as Node)) setOpen(false);

    };

    doc.addEventListener("mousedown", onDoc);

    return () => doc.removeEventListener("mousedown", onDoc);

  }, [open]);



  const qLen = typeof value === "string" ? value.trim().length : 0;

  const showDropdown = open && (qLen >= 2 || busy);



  return (

    <div ref={rootRef} className="relative">

      <input

        value={value}

        placeholder="Es. Milano, Via Roma 1"

        autoComplete="off"

        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"

        onBlur={() => {

          blurDelayRef.current = window.setTimeout(() => {

            blurDelayRef.current = null;

            onBlur();

          }, 140);

        }}

        onFocus={() => {

          if (blurDelayRef.current) window.clearTimeout(blurDelayRef.current);

          blurDelayRef.current = null;

          setOpen(true);

        }}

        onChange={(e) => {

          onChange(e.target.value);

          setOpen(true);

        }}

      />

      {showDropdown ? (

        <ul

          role="listbox"

          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-600 dark:bg-slate-950"

        >

          {busy && hits.length === 0 ? (

            <li className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">

              Ricerca indirizzo…

            </li>

          ) : null}

          {!busy && hits.length === 0 && qLen >= 2 ? (

            <li className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">

              Nessun suggerimento. Puoi continuare a scrivere liberamente.

            </li>

          ) : null}

          {hits.map((h, idx) => (

            <li key={`${h.lat}-${h.lon}-${idx}`} role="none">

              <button

                type="button"

                role="option"

                className="flex w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 dark:hover:bg-emerald-950/50"

                onMouseDown={(e) => {

                  e.preventDefault();

                  if (blurDelayRef.current) window.clearTimeout(blurDelayRef.current);

                  blurDelayRef.current = null;

                  onChange(h.label);

                  setOpen(false);

                  onBlur();

                }}

              >

                <span className="line-clamp-2">{h.label}</span>

              </button>

            </li>

          ))}

        </ul>

      ) : null}

      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">

        Suggerimenti da Photon (dati © OpenStreetMap contributors).

      </p>

    </div>

  );

}



function shouldShowExtraOpen(c: Client | null | undefined): boolean {

  if (!c) return false;

  const id = c.contractTypeId?.trim();

  const n = c.updateCount;

  return Boolean(id) || (typeof n === "number" && n > 0);

}



export function ClientForm({ initial, contractTypes, vpnsForClient, onSubmit, onCancel }: Props) {

  const [showExtra, setShowExtra] = React.useState(() => shouldShowExtraOpen(initial ?? null));



  const form = useForm<ClientFormValues>({

    resolver: zodResolver(schema),

    defaultValues: {

      name: initial?.name ?? "",

      description: initial?.description ?? "",

      websiteUrl: initial?.websiteUrl ?? "",

      location: initial?.location ?? "",

      defaultVpnId: initial?.defaultVpnId ?? "",

      contractTypeId: initial?.contractTypeId?.trim() ? initial.contractTypeId : "",

      updateCount: typeof initial?.updateCount === "number" ? initial.updateCount : 0,

    },

  });



  React.useEffect(() => {

    form.reset({

      name: initial?.name ?? "",

      description: initial?.description ?? "",

      websiteUrl: initial?.websiteUrl ?? "",

      location: initial?.location ?? "",

      defaultVpnId: initial?.defaultVpnId ?? "",

      contractTypeId: initial?.contractTypeId?.trim() ? initial.contractTypeId : "",

      updateCount: typeof initial?.updateCount === "number" ? initial.updateCount : 0,

    });

    setShowExtra(shouldShowExtraOpen(initial ?? null));

  }, [

    initial?.id,

    initial?.name,

    initial?.description,

    initial?.websiteUrl,

    initial?.location,

    initial?.defaultVpnId,

    initial?.contractTypeId,

    initial?.updateCount,

    form,

  ]);



  const editing = Boolean(initial);



  return (

    <form

      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"

      onSubmit={form.handleSubmit(async (v) => {

        await onSubmit(v);

      })}

    >

      <div>

        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Nome</label>

        <input

          {...form.register("name")}

          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"

        />

        {form.formState.errors.name ? (

          <p className="mt-1 text-xs text-rose-600">{form.formState.errors.name.message}</p>

        ) : null}

      </div>

      <div>

        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Descrizione</label>

        <textarea

          {...form.register("description")}

          rows={3}

          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"

        />

      </div>

      <div>

        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">

          Sito web istituzionale

        </label>

        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">

          Usato per logo e anteprima nella scheda cliente (HTTPS consigliato).

        </p>

        <input

          {...form.register("websiteUrl")}

          type="text"

          placeholder="https://www.esempio.it oppure dominio.it"

          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"

        />

      </div>

      <div>

        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Località / sede</label>

        <Controller

          name="location"

          control={form.control}

          render={({ field }) => (

            <LocationSuggestField value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} />

          )}

        />

      </div>



      <div className="rounded-xl border border-dashed border-slate-200 p-3 dark:border-slate-700">

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

            <div>

              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Tipo contratto</label>

              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">

                Elenco configurabile in Impostazioni → Contratti.

              </p>

              <select

                {...form.register("contractTypeId")}

                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"

              >

                <option value="">— Nessuno —</option>

                {contractTypes.map((c) => (

                  <option key={c.id} value={c.id}>

                    {c.name.trim() || c.id}

                  </option>

                ))}

              </select>

            </div>

            <div>

              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">N° aggiornamenti</label>

              <input

                type="number"

                min={0}

                step={1}

                {...form.register("updateCount", { valueAsNumber: true })}

                className="mt-1 w-full max-w-[12rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"

              />

            </div>

          </div>

        ) : null}

      </div>



      {editing ? (

        <div>

          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">

            VPN predefinita (RDP e accessi web)

          </label>

          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">

            Stessa VPN per tutte le connessioni RDP e il contesto degli accessi web di questo cliente.

          </p>

          {vpnsForClient.length === 0 ? (

            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">

              Nessuna VPN configurata: aggiungine una nella sezione VPN del cliente, poi torna qui per

              impostare la predefinita.

            </p>

          ) : (

            <select

              {...form.register("defaultVpnId")}

              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"

            >

              <option value="">Nessuna (scegli una VPN per RDP se ce ne sono più di una)</option>

              {vpnsForClient.map((v) => (

                <option key={v.id} value={v.id}>

                  {v.name}

                </option>

              ))}

            </select>

          )}

        </div>

      ) : null}

      <div className="flex justify-end gap-2 pt-2">

        <button

          type="button"

          onClick={onCancel}

          className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-700"

        >

          Annulla

        </button>

        <button

          type="submit"

          disabled={form.formState.isSubmitting}

          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"

        >

          Salva

        </button>

      </div>

    </form>

  );

}

