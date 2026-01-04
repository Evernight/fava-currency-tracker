import { useQuery } from "@tanstack/react-query";
import { fetchJSON } from "./api";

export interface ConfigResponse {
  currencies: string[];
  defaultCurrency: string;
  defaultBaseCurrency: string;
  /** Start date of the current Fava time filter (inclusive), or null if no time filter is set. */
  filterFirst?: string | null;
  /** End date of the current Fava time filter (inclusive), or null if no time filter is set. */
  filterLast?: string | null;
}

export function useConfig() {
  // Include Fava filter params from the current URL (`time`, `filter`, `account`,
  // `conversion`, `interval`, ...). This ensures the backend sees the same filters
  // as the currently viewed Fava page.
  const params = new URLSearchParams(location.search);
  const q = params.toString();
  const url = q ? `config?${q}` : "config";
  return useQuery({
    queryKey: [url],
    queryFn: () => fetchJSON<ConfigResponse>(url),
  });
}


