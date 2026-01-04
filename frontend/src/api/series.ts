import { useQuery } from "@tanstack/react-query";
import { fetchJSON } from "./api";

export interface SeriesPoint {
  d: string; // YYYY-MM-DD
  v: number;
}

export interface SeriesMarker {
  d: string; // YYYY-MM-DD
  v: number;
  color?: string | null;
  comment?: string | null;
}

export interface SeriesResponse {
  currency: string;
  base: string;
  inverted: boolean;
  points: SeriesPoint[];
  markers?: SeriesMarker[];
}

export function useSeries(currency: string | undefined, base: string | undefined) {
  // Start from current page query params so we preserve Fava's filters (e.g. `time`).
  const params = new URLSearchParams(location.search);
  if (currency) params.set("currency", currency);
  if (base) params.set("base", base);
  const url = `series?${params.toString()}`;

  return useQuery({
    queryKey: [url],
    enabled: Boolean(currency && base),
    queryFn: () => fetchJSON<SeriesResponse>(url),
  });
}


