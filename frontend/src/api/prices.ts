import { fetchJSON, postJSON } from "./api";

export interface PricesPreviewResponse {
  date: string; // YYYY-MM-DD
  base?: string | null;
  command: string;
  filename: string;
  content: string;
  matchedLines: number;
}

export interface PricesSaveResponse {
  filename: string;
}

export async function fetchPricesPreview(date: string, base: string | undefined): Promise<PricesPreviewResponse> {
  const params = new URLSearchParams(location.search);
  params.set("date", date);
  if (base) params.set("base", base);
  const url = `prices_preview?${params}`;
  return fetchJSON<PricesPreviewResponse>(url);
}

export async function savePrices(date: string, content: string): Promise<PricesSaveResponse> {
  return postJSON<PricesSaveResponse>("prices_save", { date, content });
}


