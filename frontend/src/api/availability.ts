import { useQuery } from "@tanstack/react-query";
import { fetchJSON } from "./api";

export interface PriceDirective {
  currency: string;
  amount: string;
  base_currency: string;
  generated_by: string | null;
  filename: string | null;
  lineno: number | null;
}

export interface AvailabilityDay {
  d: string; // YYYY-MM-DD
  n: number;
  directives: PriceDirective[];
}

export interface AvailabilityResponse {
  base: string;
  range: [string, string] | null;
  days: AvailabilityDay[];
}

export function useAvailability(base: string | undefined, currency: string | undefined) {
  // Start from current page query params so we preserve Fava's filters (e.g. `time`).
  const params = new URLSearchParams(location.search);
  if (base) params.set("base", base);
  if (currency) params.set("currency", currency);
  const url = `availability?${params.toString()}`;

  return useQuery({
    queryKey: [url],
    queryFn: () => fetchJSON<AvailabilityResponse>(url),
  });
}


