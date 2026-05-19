import { useEffect, useMemo, useState } from "react";
import { MapPinned } from "lucide-react";
import { photonFirstPoint } from "@/lib/photonGeocode";

/** Anteprima mappa (iframe OpenStreetMap) da testo sede; opzionale riquadro se la località manca (es. affiancata al sito). */
export function LocationMapPreview({
  query,
  className = "",
  emptyPlaceholder = false,
}: {
  query: string;
  className?: string;
  /** Se vero e `query` è vuota, mostra un riquadro tratteggiato allineabile alla colonna sito. */
  emptyPlaceholder?: boolean;
}) {
  const trimmed = query.trim();
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!trimmed) {
      setCoords(null);
      return;
    }
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      setLoading(true);
      photonFirstPoint(trimmed, ac.signal)
        .then((p) => {
          if (!p) setCoords(null);
          else setCoords({ lat: p.lat, lon: p.lon });
        })
        .catch(() => setCoords(null))
        .finally(() => setLoading(false));
    }, 400);
    return () => {
      ac.abort();
      window.clearTimeout(t);
    };
  }, [trimmed]);

  const src = useMemo(() => {
    if (!coords) return null;
    const { lon, lat } = coords;
    const dLon = 0.018;
    const dLat = 0.012;
    const minLon = lon - dLon;
    const minLat = lat - dLat;
    const maxLon = lon + dLon;
    const maxLat = lat + dLat;
    const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
    const marker = `${lat}%2C${lon}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${marker}`;
  }, [coords]);

  if (!trimmed) {
    if (!emptyPlaceholder) return null;
    return (
      <div
        className={`overflow-hidden rounded-lg border border-dashed border-slate-300/90 bg-slate-50/80 dark:border-slate-600 dark:bg-slate-900/40 ${className}`}
      >
        <div className="relative flex aspect-[16/7] w-full min-h-[6.5rem] flex-col items-center justify-center gap-2 px-3 text-center text-[11px] text-slate-500 dark:text-slate-400">
          <MapPinned className="h-8 w-8 opacity-45" aria-hidden />
          <span>Indica la sede in Modifica cliente per l&apos;anteprima sulla mappa.</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-lg border border-slate-200/90 bg-slate-100 shadow-inner dark:border-slate-700 dark:bg-slate-950/80 ${className}`}
    >
      {loading ? (
        <div className="flex aspect-[16/7] min-h-[6.5rem] animate-pulse items-center justify-center text-xs text-slate-500 dark:text-slate-400">
          Ricerca sulla mappa…
        </div>
      ) : src ? (
        <>
        <div className="relative aspect-[16/7] w-full min-h-[6.5rem] overflow-hidden rounded-lg bg-slate-200/40 dark:bg-slate-900/80">
            <iframe
              title="Anteprima mappa sede"
              className="absolute left-0 top-0 w-full border-0"
              style={{ height: "calc(100% + 58px)" }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={src}
            />
          </div>
        </>
      ) : (
        <div className="flex aspect-[16/7] min-h-[6.5rem] flex-col items-center justify-center gap-2 px-3 text-center text-xs text-slate-500 dark:text-slate-400">
          <MapPinned className="h-8 w-8 opacity-50" aria-hidden />
          <span>Nessuna corrispondenza cartografica per questo testo.</span>
        </div>
      )}
    </div>
  );
}
