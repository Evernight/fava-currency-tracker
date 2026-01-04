import { useTheme } from "@mui/material/styles";
import * as echarts from "echarts";
import { CSSProperties, useEffect, useRef } from "react";
import { useComponentWidthOf } from "./hooks";

interface EChartProps {
  height: CSSProperties["height"];
  option: echarts.EChartsCoreOption;
  events?: Record<string, (params: unknown) => void>;
  style?: CSSProperties;
}

export function EChart({ height, option, events, style }: EChartProps) {
  const theme = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts>(null);
  const width = useComponentWidthOf(ref);
  const echartsTheme = theme.palette.mode === "dark" ? "dark" : undefined;

  useEffect(() => {
    if (chartRef.current && !chartRef.current.isDisposed()) {
      echarts.dispose(chartRef.current);
    }
    chartRef.current = null;

    const chart = echarts.init(ref.current, echartsTheme);

    const nextOption =
      echartsTheme === "dark" && option.backgroundColor === undefined
        ? { ...option, backgroundColor: "transparent" }
        : option;

    chart.setOption(nextOption);

    if (events) {
      for (const [name, handler] of Object.entries(events)) {
        chart.on(name, handler as never);
      }
    }

    chartRef.current = chart;

    return () => {
      if (!chart.isDisposed()) {
        echarts.dispose(chart);
      }
    };
  }, [option, echartsTheme, events]);

  useEffect(() => {
    if (chartRef.current) chartRef.current.resize();
  }, [width, height]);

  return <div ref={ref} style={{ height, ...style }} />;
}


