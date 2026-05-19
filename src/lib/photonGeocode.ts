/** Ricerca pubblica Photon (Komoot); dati da OpenStreetMap. */

export type PhotonSuggestion = {
  label: string;
  lat: number;
  lon: number;
};

type PhotonGeometry = {
  type: string;
  coordinates: [number, number];
};

type PhotonFeature = {
  geometry: PhotonGeometry;
  properties: Record<string, string | undefined>;
};

function buildLabel(properties: Record<string, string | undefined>): string {
  const p = properties;
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const street = typeof p.street === "string" ? p.street.trim() : "";
  const houseno = typeof p.housenumber === "string" ? p.housenumber.trim() : "";
  const postcode = typeof p.postcode === "string" ? p.postcode.trim() : "";
  const locality =
    (typeof p.city === "string" && p.city.trim()) ||
    (typeof p.town === "string" && p.town.trim()) ||
    (typeof p.village === "string" && p.village.trim()) ||
    (typeof p.district === "string" && p.district.trim()) ||
    "";
  const region = typeof p.state === "string" ? p.state.trim() : "";
  const country = typeof p.country === "string" ? p.country.trim() : "";

  const line1Parts = [
    houseno && street ? `${houseno} ${street}` : street || "",
    postcode && locality ? `${postcode} ${locality}` : locality || postcode,
  ].filter(Boolean);
  const line1 = line1Parts.join(", ");
  const line2 = [region, country].filter(Boolean).join(", ");
  const body = [line1 || locality, line2].filter(Boolean).join(" · ");

  if (name && body && !body.toLowerCase().includes(name.toLowerCase())) return `${name} — ${body}`;
  if (name) return `${name}${body ? ` · ${body}` : ""}`;
  return body || "Posizione";
}

export async function photonSuggest(
  query: string,
  opts?: { limit?: number; signal?: AbortSignal },
): Promise<PhotonSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const limit = opts?.limit ?? 7;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(limit))}`;
  const res = await fetch(url, { signal: opts?.signal });
  if (!res.ok) return [];
  const data = await res.json();
  const features = (data?.features ?? []) as PhotonFeature[];
  const out: PhotonSuggestion[] = [];
  for (const f of features) {
    const geom = f?.geometry?.coordinates;
    if (!geom || geom.length < 2) continue;
    const [lon, lat] = geom;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const label = buildLabel((f.properties ?? {}) as Record<string, string | undefined>);
    out.push({ label, lat, lon });
  }
  return out;
}

export async function photonFirstPoint(
  query: string,
  signal?: AbortSignal,
): Promise<{ lat: number; lon: number; label?: string } | null> {
  const list = await photonSuggest(query, { limit: 1, signal });
  const first = list[0];
  if (!first) return null;
  return { lat: first.lat, lon: first.lon, label: first.label };
}
