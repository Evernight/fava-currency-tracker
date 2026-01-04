import { Alert, CircularProgress, Stack } from "@mui/material";
import * as echarts from "echarts";
import { useMemo } from "react";
import { useSeries } from "../../api/series";
import { EChart } from "../EChart";
import { escapeHtml } from "./escapeHtml";
import { MarkersList } from "./MarkersList";

export interface RateTabProps {
  currency: string | undefined;
  base: string | undefined;
}

const EMPTY_MARKERS: ReadonlyArray<never> = [];

export function RateTab({ currency, base }: RateTabProps) {
  const canQuery = Boolean(currency && base && currency !== base);

  const { data: series, isLoading: isLoadingSeries, error: seriesError } = useSeries(
    canQuery ? currency : undefined,
    canQuery ? base : undefined,
  );
  const markers = series?.markers ?? EMPTY_MARKERS;

  const rateOption = useMemo((): echarts.EChartsCoreOption => {
    const pts = series?.points ?? [];

    const x = Array.from(new Set([...pts.map((p) => p.d), ...markers.map((m) => m.d)])).sort();
    const yByDate = new Map(pts.map((p) => [p.d, p.v] as const));
    const y = x.map((d) => yByDate.get(d) ?? null);

    return {
      tooltip: { trigger: "axis" },
      grid: { left: 50, right: 20, top: 30, bottom: 50 },
      xAxis: { type: "category", data: x },
      yAxis: { type: "value", scale: true },
      dataZoom: [{ type: "inside" }, { type: "slider" }],
      series: [
        {
          type: "line",
          showSymbol: false,
          data: y,
          name: series ? `${series.currency}/${series.base}` : "rate",
          markLine: {
            symbol: ["none", "none"],
            silent: false,
            data: markers.map((m) => ({
              yAxis: m.v,
              lineStyle: { color: m.color ?? undefined, type: "dashed", width: 2 },
              label: {
                show: true,
                position: "insideStartBottom",
                color: m.color ?? undefined,
                formatter: `${m.v} (${m.d})${m.comment ? `\n${m.comment}` : ""}`,
              },
              tooltip: {
                formatter: () =>
                  [
                    `<div><b>marker</b></div>`,
                    `<div>value: ${m.v}</div>`,
                    m.comment ? `<div style="margin-top:6px">${escapeHtml(m.comment)}</div>` : "",
                  ]
                    .filter(Boolean)
                    .join(""),
              },
            })) as unknown as unknown[],
          },
        },
      ],
    };
  }, [series, markers]);

  return (
    <Stack spacing={2}>
      {!currency ? <Alert severity="info">Select a currency to show the exchange-rate series.</Alert> : null}

      {seriesError ? <Alert severity="error">{String(seriesError)}</Alert> : null}
      {isLoadingSeries ? <CircularProgress size={24} /> : null}

      <EChart height={380} option={rateOption} />

      <MarkersList markers={markers} currency={currency} base={base} />
    </Stack>
  );
}


