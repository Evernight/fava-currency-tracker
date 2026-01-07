import { fetchJSON, postJSON } from "./api";

export interface PricesPreviewResponse {
  command: string;
  filename: string;
  content: string;
  matchedLines: number;
}

export interface PricesSaveResponse {
  filename: string;
}

export type PricesRangePreviewResponse = PricesPreviewResponse;

function withLocationParams(extraParams: Record<string, string | undefined>): URLSearchParams {
  const params = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(extraParams)) {
    if (value !== undefined) params.set(key, value);
  }
  return params;
}

export async function fetchPricesPreview(date: string, base: string | undefined): Promise<PricesPreviewResponse> {
  const params = withLocationParams({ date, base });
  const url = `prices_preview?${params.toString()}`;
  return fetchJSON<PricesPreviewResponse>(url);
}

export async function savePrices(date: string, content: string): Promise<PricesSaveResponse> {
  return postJSON<PricesSaveResponse>("prices_save", { date, content });
}

export async function fetchPricesRangePreview(
  currency: string,
  startDate: string,
  endDate: string,
): Promise<PricesRangePreviewResponse> {
  const params = withLocationParams({ currency, startDate, endDate });
  const url = `prices_preview_range?${params.toString()}`;
  return fetchJSON<PricesRangePreviewResponse>(url);
}

export async function savePricesRange(
  currency: string,
  startDate: string,
  endDate: string,
  content: string,
): Promise<PricesSaveResponse> {
  return postJSON<PricesSaveResponse>("prices_save_range", {
    currency,
    startDate,
    endDate,
    content,
  });
}


