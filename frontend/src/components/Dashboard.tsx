import { Alert, Autocomplete, Box, Button, CircularProgress, Paper, Stack, TextField } from "@mui/material";
import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useConfig } from "../api/config";
import { AvailabilityTab } from "./dashboard/AvailabilityTab";
import { RateTab } from "./dashboard/RateTab";

export function Dashboard() {
  const { data: config, isLoading: isLoadingConfig, error: configError } = useConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const favaFilterRange = useMemo((): [string, string] | null => {
    const first = config?.filterFirst ?? null;
    const last = config?.filterLast ?? null;
    if (!first || !last) return null;
    return [first, last];
  }, [config?.filterFirst, config?.filterLast]);

  const currency = (searchParams.get("currency") || undefined)?.toUpperCase();
  const base = (searchParams.get("base") || undefined)?.toUpperCase();

  useEffect(() => {
    // Normalize params (uppercase) and fill default base once config is known.
    const defaultBase = config?.defaultBaseCurrency?.toUpperCase();

    const next = new URLSearchParams(searchParams);

    const rawCurrency = searchParams.get("currency");
    const rawBase = searchParams.get("base");

    if (rawCurrency) next.set("currency", rawCurrency.toUpperCase());
    if (rawBase) next.set("base", rawBase.toUpperCase());
    if (!rawBase && defaultBase) next.set("base", defaultBase);

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [config?.defaultBaseCurrency, searchParams, setSearchParams]);

  const currencies = config?.currencies ?? [];

  if (isLoadingConfig) {
    return (
      <Box sx={{ p: 2 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (configError) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{String(configError)}</Alert>
      </Box>
    );
  }

  const canSwap = Boolean(currency && base && currency !== base);
  const swapCurrencyAndBase = () => {
    if (!currency || !base) return;
    setSearchParams((prev: URLSearchParams) => {
      const next = new URLSearchParams(prev);
      next.set("currency", base);
      next.set("base", currency);
      return next;
    }, { replace: true });
  };

  const currencyValue = currency ?? null;
  const baseValue = base ?? null;

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
          <Autocomplete
            size="small"
            sx={{ minWidth: 220 }}
            options={currencies}
            value={currencyValue}
            onChange={(_, v) => {
              setSearchParams((prev: URLSearchParams) => {
                const next = new URLSearchParams(prev);
                if (v) next.set("currency", v);
                else next.delete("currency");
                return next;
              }, { replace: true });
            }}
            getOptionDisabled={(opt) => Boolean(base && opt === base)}
            disableClearable={false}
            renderInput={(params) => <TextField {...params} label="Currency" />}
          />

          <Button
            size="small"
            variant="outlined"
            sx={{ alignSelf: "center" }}
            disabled={!canSwap}
            onClick={swapCurrencyAndBase}
            aria-label="Swap currency and base currency"
          >
            ⇄
          </Button>

          <Autocomplete
            size="small"
            sx={{ minWidth: 220 }}
            options={currencies}
            value={baseValue}
            onChange={(_, v) => {
              setSearchParams((prev: URLSearchParams) => {
                const next = new URLSearchParams(prev);
                if (v) next.set("base", v);
                else next.delete("base");
                return next;
              }, { replace: true });
            }}
            getOptionDisabled={(opt) => Boolean(currency && opt === currency)}
            disableClearable={Boolean(base)}
            renderInput={(params) => <TextField {...params} label="Base" />}
          />
        </Stack>

        <Stack direction="column" spacing={2} sx={{ alignItems: "stretch" }}>
          <Paper variant="outlined" sx={{ p: 2, width: "100%", minWidth: 0 }}>
            <RateTab currency={currency} base={base} />
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, width: "100%", minWidth: 0 }}>
            <AvailabilityTab currency={currency} base={base} favaFilterRange={favaFilterRange} />
          </Paper>
        </Stack>
      </Stack>
    </Box>
  );
}
