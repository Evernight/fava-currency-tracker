import { Accordion, AccordionDetails, AccordionSummary, Box, Stack, Typography } from "@mui/material";
import { useMemo } from "react";

export interface Marker {
  d: string;
  v: number;
  color?: string | null;
  comment?: string | null;
}

export interface MarkersListProps {
  markers: readonly Marker[];
  currency: string | undefined;
  base: string | undefined;
}

export function MarkersList({ markers, currency, base }: MarkersListProps) {
  const example = useMemo(() => {
    const exampleBase = base ?? "USD";
    // Pick a reasonable example currency that differs from base (currency is optional).
    let exampleCurrency = currency ?? (exampleBase !== "EUR" ? "EUR" : "GBP");
    if (exampleCurrency === exampleBase) exampleCurrency = exampleBase !== "EUR" ? "EUR" : "GBP";
    return `2025-10-01 custom "currency-marker" "${exampleCurrency}" "${exampleBase}" 1.12 "green" "Comment"`;
  }, [currency, base]);

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1">Markers</Typography>

      {markers.length ? (
        <Stack spacing={0.75}>
          {markers
            .slice()
            .sort((a, b) => a.d.localeCompare(b.d))
            .map((m, idx) => (
              <Stack key={`${m.d}-${m.v}-${idx}`} direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "2px",
                    bgcolor: m.color ?? "text.disabled",
                    flex: "0 0 auto",
                    mt: "3px",
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    minWidth: 90,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                  }}
                >
                  {m.d}
                </Typography>
                <Typography variant="body2" sx={{ minWidth: 60 }}>
                  {m.v}
                </Typography>
                {m.comment ? (
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                    {m.comment}
                  </Typography>
                ) : null}
              </Stack>
            ))}
        </Stack>
      ) : (
        <Accordion>
          <AccordionSummary
            expandIcon={
              <Box component="span" sx={{ fontSize: 10 }}>
                ▼
              </Box>
            }
          >
            <Typography variant="body2" color="text.secondary">
              No markers
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={0.75}>
              <Typography variant="body2" color="text.secondary">
                You can add markers using the following format in the Ledger file:
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1,
                  bgcolor: "action.hover",
                  borderRadius: 1,
                  overflow: "auto",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                  fontSize: 12,
                  color: "text.secondary",
                }}
              >
                {example}
              </Box>
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
    </Stack>
  );
}

