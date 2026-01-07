import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import * as echarts from "echarts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAvailability } from "../../api/availability";
import { EChart } from "../EChart";
import { useScrollToEnd } from "../hooks";
import { escapeHtml } from "./escapeHtml";
import { PricesFetcher } from "./PricesFetcher";

export interface AvailabilityTabProps {
  currency: string | undefined;
  base: string | undefined;
  /** Parsed by Fava from the current time filter (inclusive). */
  favaFilterRange?: [string, string] | null;
  /** Show at most N latest calendar years in the calendar heatmap. Default: 3. */
  maxCalendarYears?: number;
}

function getDirectivesFromTooltipData(data: unknown): string[] {
  if (typeof data !== "object" || data === null) return [];
  const directives = (data as Record<string, unknown>)["directives"];
  if (!Array.isArray(directives)) return [];
  return directives.filter((d): d is string => typeof d === "string");
}

function formatTooltipWithCurrencies(
  date: string,
  count: number,
  currencies: string[] = [],
  maxShown: number = 10,
): string {
  const shown = currencies.slice(0, maxShown);
  const extra = currencies.length - shown.length;

  const lines = [
    `<div><b>${escapeHtml(date)}</b></div>`,
    `<div>${count} price directive${count === 1 ? "" : "s"}</div>`,
    shown.length
      ? `<div style="margin-top:6px;max-width:360px;white-space:normal;overflow-wrap:anywhere;word-break:break-word">${shown
          .map((s) => escapeHtml(s))
          .join(", ")}</div>`
      : "",
    extra > 0 ? `<div style="margin-top:6px">…and ${extra} more</div>` : "",
  ].filter(Boolean);

  return lines.join("");
}

type SelectedDay = { date: string; count: number; directives: string[] };

type AvailabilityDay = { d: string; n: number; directives: string[] };
type HeatmapDatum = { value: [string, number]; directives: string[] };

function isoDateUtc(d: Date): string {
  // YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

function clampRangeToLatestYears(range: [string, string], maxYears: number | undefined): [string, string] {
  if (typeof maxYears !== "number" || !Number.isFinite(maxYears)) return range;
  const n = Math.floor(maxYears);
  if (n <= 0) return range;

  const end = range[1];
  const endYear = Number(end.slice(0, 4));
  if (!Number.isFinite(endYear)) return range;

  // Show at most N calendar years (inclusive of end year), i.e. clamp start to Jan 1 of (endYear - (N-1)).
  const minYear = endYear - (n - 1);
  const minStart = `${minYear}-01-01`;
  const start = range[0] < minStart ? minStart : range[0];
  return [start, end];
}

function expandCalendarRange(
  range: string | [string, string],
  favaFilterRange?: [string, string] | null,
  maxYears?: number,
): [string, string] | null {
  if (Array.isArray(range)) return clampRangeToLatestYears(range, maxYears);

  // Prefer Fava's server-side parsed time filter range (if any), instead of
  // trying to parse `time=` ourselves.
  if (favaFilterRange?.[0] && favaFilterRange?.[1]) {
    return clampRangeToLatestYears(favaFilterRange, maxYears);
  }

  const year = Number(range);
  if (!Number.isFinite(year)) return null;
  return clampRangeToLatestYears([`${year}-01-01`, `${year}-12-31`], maxYears);
}

function getAllDatesInRange(
  range: string | [string, string],
  fallbackDates: string[],
  favaFilterRange?: [string, string] | null,
  maxYears?: number,
): string[] {
  const expandedRange = expandCalendarRange(range, favaFilterRange, maxYears);
  if (!expandedRange) return fallbackDates;

  const [start, end] = expandedRange;
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (!Number.isFinite(cur.getTime()) || !Number.isFinite(endDate.getTime())) return fallbackDates;
  while (cur <= endDate) {
    out.push(isoDateUtc(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function buildAvailabilityHeatmapData(
  days: AvailabilityDay[],
  range: [string, string],
  favaFilterRange?: [string, string] | null,
  maxYears?: number,
): HeatmapDatum[] {
  const byDate = new Map(days.map((d) => [d.d, d] as const));
  const allDates = getAllDatesInRange(
    range,
    days.map((d) => d.d),
    favaFilterRange,
    maxYears,
  );

  // Include explicit 0-count days so calendar cells are clickable.
  return allDates.map((d) => {
    const day = byDate.get(d);
    return {
      value: [d, day?.n ?? 0],
      directives: day?.directives ?? [],
    };
  });
}

function estimateCalendarMinWidthPx(
  range: [string, string],
  opts: { cellWidth: number; calendarLeft: number; calendarRight: number; extraPadding?: number },
): number {
  const startDate = new Date(`${range[0]}T00:00:00Z`);
  const endDate = new Date(`${range[1]}T00:00:00Z`);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
    return opts.calendarLeft + opts.calendarRight + (opts.extraPadding ?? 0);
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const dayCount = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1);

  // ECharts lays out days in a weekly grid. Approximate columns as the number of week buckets
  // needed to cover the range (including partial weeks on each end).
  const startDow = startDate.getUTCDay(); // 0..6, Sun..Sat
  const endDow = endDate.getUTCDay(); // 0..6, Sun..Sat
  const paddedCells = dayCount + startDow + (6 - endDow);
  const weekCols = Math.max(1, Math.ceil(paddedCells / 7));

  return (
    opts.calendarLeft +
    opts.calendarRight +
    weekCols * opts.cellWidth +
    (opts.extraPadding ?? 0)
  );
}

function AvailabilityChart(props: {
  option: echarts.EChartsCoreOption;
  onCellClick: (params: unknown) => void;
  minWidth?: number;
}) {
  const { option, onCellClick, minWidth } = props;
  const events = useMemo(() => ({ click: onCellClick }), [onCellClick]);
  return <EChart height={220} option={option} events={events} style={minWidth ? { minWidth } : undefined} />;
}

function SelectedDayPanel(props: {
  selected: SelectedDay | null;
  base: string | undefined;
  onClear: () => void;
}) {
  const { selected, base, onClear } = props;
  if (!selected) {
    return (
      <Typography variant="body2" color="text.secondary">
        Click a day to show its price directives and fetch the prices for the day.
      </Typography>
    );
  }

  return (
    <Box sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 1 }}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
          <Typography variant="subtitle1">
            {selected.date} — {selected.count} price directive{selected.count === 1 ? "" : "s"}
          </Typography>
          <Stack direction="row" spacing={1}>
            <PricesFetcher date={selected.date} base={base} disabled={!base} />
            <Button size="small" onClick={onClear}>
              Clear
            </Button>
          </Stack>
        </Stack>

        {selected.directives.length ? (
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1.5,
              bgcolor: "action.hover",
              borderRadius: 1,
              overflow: "auto",
              maxHeight: 260,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
              fontSize: 13,
            }}
          >
            {selected.directives.join("\n")}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No price directives for this day.
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

export function AvailabilityTab({
  base,
  favaFilterRange,
  maxCalendarYears = 4,
}: AvailabilityTabProps) {
  // Always show all price directives, regardless of currency/base filters
  const { data: availability, isLoading: isLoadingAvailability, error: availabilityError } = useAvailability(
    undefined,
    undefined,
  );

  const [selected, setSelected] = useState<SelectedDay | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Reset selection when data range changes.
    setSelected(null);
  }, [availability?.range]);

  const availabilityChart = useMemo((): { option: echarts.EChartsCoreOption; minWidth?: number } => {
    const days = availability?.days ?? [];
    const today = isoDateUtc(new Date());
    const range: [string, string] =
      availability?.range ?? (days.length ? [days[0].d, days[days.length - 1].d] : [today, today]);

    const clampedRange = clampRangeToLatestYears(range, maxCalendarYears);
    const data = buildAvailabilityHeatmapData(days, clampedRange, favaFilterRange, maxCalendarYears);

    const minWidth = estimateCalendarMinWidthPx(clampedRange, {
      cellWidth: 18,
      calendarLeft: 40,
      calendarRight: 20,
      extraPadding: 40,
    });

    // Calculate max value from the data for better color scaling
    const maxCount = Math.max(1, ...data.map((d) => d.value[1]));

    return {
      minWidth,
      option: {
        tooltip: {
          position: "top",
          formatter: (params: unknown) => {
            if (typeof params !== "object" || params === null) return "";
            const rec = params as Record<string, unknown>;
            const value = rec["value"];
            const date = Array.isArray(value) ? String(value[0] ?? "") : "";
            const count = Array.isArray(value) ? Number(value[1] ?? 0) : 0;
            // const directives = getDirectivesFromTooltipData(rec["data"]);
            // const currencies = getCurrenciesFromPriceDirectives(directives);
            return formatTooltipWithCurrencies(date, count);
          },
        },
        visualMap: {
          show: false,
          min: 0,
          max: maxCount,
        },
        calendar: {
          top: 60,
          left: 40,
          right: 20,
          cellSize: [18, 18],
          range: clampedRange,
          monthLabel: { formatter: "{yyyy}-{MM}" },
          yearLabel: { show: false },
        },
        series: [
          {
            type: "heatmap",
            coordinateSystem: "calendar",
            data: data as unknown as unknown[],
          },
        ],
      },
    };
  }, [availability, favaFilterRange, maxCalendarYears]);

  const onHeatmapClick = useCallback((params: unknown) => {
    if (typeof params !== "object" || params === null) return;
    const rec = params as Record<string, unknown>;
    if (rec["componentType"] !== "series" || rec["seriesType"] !== "heatmap") return;

    const value = rec["value"];
    const date = Array.isArray(value) ? String(value[0] ?? "") : "";
    const count = Array.isArray(value) ? Number(value[1] ?? 0) : 0;
    if (!date) return;

    const directives = getDirectivesFromTooltipData(rec["data"]);
    setSelected({ date, count, directives });
  }, []);

  useScrollToEnd(scrollContainerRef, [availabilityChart.minWidth]);

  return (
    <Stack>
      <Typography variant="h6" gutterBottom>
        Price data availability
      </Typography>
      {availabilityError ? <Alert severity="error">{String(availabilityError)}</Alert> : null}
      {isLoadingAvailability ? <CircularProgress size={24} /> : null}
      {!isLoadingAvailability && !availabilityError && (availability?.days?.length ?? 0) === 0 ? (
        <Alert severity="info">No price directives found in the selected date range.</Alert>
      ) : null}

      <Box ref={scrollContainerRef} sx={{ overflowX: "scroll", overflowY: "hidden", width: "100%", minWidth: 0 }}>
        <AvailabilityChart
          option={availabilityChart.option}
          minWidth={availabilityChart.minWidth}
          onCellClick={onHeatmapClick}
        />
      </Box>
      <SelectedDayPanel
        selected={selected}
        base={base}
        onClear={() => setSelected(null)}
      />
    </Stack>
  );
}


