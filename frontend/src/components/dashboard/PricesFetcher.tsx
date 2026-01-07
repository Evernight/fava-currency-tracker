import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useCallback, useMemo, useReducer } from "react";
import {
  fetchPricesPreview,
  fetchPricesRangePreview,
  savePrices,
  savePricesRange,
  type PricesPreviewResponse,
} from "../../api/prices";

type PricesFetcherDayProps = {
  /** Default when omitted. */
  kind?: "day";
  date: string; // YYYY-MM-DD
  base: string | undefined;
  disabled?: boolean;
};

type PricesFetcherRangeProps = {
  kind: "range";
  currency: string | undefined;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  disabled?: boolean;
};

export type PricesFetcherProps = PricesFetcherDayProps | PricesFetcherRangeProps;

interface State {
  open: boolean;
  preview: PricesPreviewResponse | null;
  error: string | null;
  isLoading: boolean;
  isSaving: boolean;
  savedFilename: string | null;
}

type Action =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; payload: PricesPreviewResponse }
  | { type: "FETCH_ERROR"; payload: string }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS"; payload: string }
  | { type: "SAVE_ERROR"; payload: string }
  | { type: "CLOSE_DIALOG" };

const initialState: State = {
  open: false,
  preview: null,
  error: null,
  isLoading: false,
  isSaving: false,
  savedFilename: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "FETCH_START":
      return {
        ...state,
        open: true,
        preview: null,
        savedFilename: null,
        error: null,
        isLoading: true,
      };
    case "FETCH_SUCCESS":
      return {
        ...state,
        preview: action.payload,
        isLoading: false,
      };
    case "FETCH_ERROR":
      return {
        ...state,
        error: action.payload,
        isLoading: false,
      };
    case "SAVE_START":
      return {
        ...state,
        error: null,
        isSaving: true,
      };
    case "SAVE_SUCCESS":
      return {
        ...state,
        savedFilename: action.payload,
        isSaving: false,
      };
    case "SAVE_ERROR":
      return {
        ...state,
        error: action.payload,
        isSaving: false,
      };
    case "CLOSE_DIALOG":
      return {
        ...state,
        open: false,
      };
    default:
      return state;
  }
}

const monoSpanSx = {
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

function MonoSpan({ children }: { children: ReactNode }) {
  return (
    <Box component="span" sx={monoSpanSx}>
      {children}
    </Box>
  );
}

export function PricesFetcher(props: PricesFetcherProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { open, preview, error, isLoading, isSaving, savedFilename } = state;

  const isRange = props.kind === "range";
  const date = !isRange ? props.date : undefined;
  const base = !isRange ? props.base : undefined;
  const currency = isRange ? props.currency : undefined;
  const startDate = isRange ? props.startDate : undefined;
  const endDate = isRange ? props.endDate : undefined;

  const canFetch = !props.disabled && (isRange ? Boolean(currency) : Boolean(base));

  const onFetch = useCallback(async () => {
    if (isRange) {
      if (!currency || !startDate || !endDate) return;
      dispatch({ type: "FETCH_START" });
      try {
        const res = await fetchPricesRangePreview(currency, startDate, endDate);
        dispatch({ type: "FETCH_SUCCESS", payload: res });
      } catch (e) {
        dispatch({ type: "FETCH_ERROR", payload: String(e) });
      }
      return;
    }

    if (!date || !base) return;
    dispatch({ type: "FETCH_START" });
    try {
      const res = await fetchPricesPreview(date, base);
      dispatch({ type: "FETCH_SUCCESS", payload: res });
    } catch (e) {
      dispatch({ type: "FETCH_ERROR", payload: String(e) });
    }
  }, [base, currency, date, endDate, isRange, startDate]);

  const onSave = useCallback(async () => {
    if (!preview) return;
    dispatch({ type: "SAVE_START" });
    try {
      if (isRange) {
        if (!currency || !startDate || !endDate) return;
        const res = await savePricesRange(currency, startDate, endDate, preview.content);
        dispatch({ type: "SAVE_SUCCESS", payload: res.filename });
        return;
      }

      if (!date) return;
      const res = await savePrices(date, preview.content);
      dispatch({ type: "SAVE_SUCCESS", payload: res.filename });
    } catch (e) {
      dispatch({ type: "SAVE_ERROR", payload: String(e) });
    }
  }, [currency, date, endDate, isRange, preview, startDate]);

  const buttonLabel =
    isRange ? `Fetch ${currency} prices from ${startDate} to ${endDate}` : `Fetch all prices for ${date ?? ""}`;
  const dialogTitle = isRange ? "Fetch prices for date range" : "Fetch prices";
  const explanation = useMemo(() => {
    if (isRange) {
      return (
        <>
          Prices fetched using <MonoSpan>price</MonoSpan> metadata from {currency} commodity directive. Any{" "}
          <MonoSpan>price_fetch_multiplier</MonoSpan> will be applied.
        </>
      );
    }
    return (
      <>
        Any <MonoSpan>price_fetch_multiplier</MonoSpan> metadata on commodity directives will be
        applied to the fetched prices.
      </>
    );
  }, [isRange, currency]);

  return (
    <>
      <Button size="small" variant="outlined" onClick={onFetch} disabled={!canFetch}>
        {buttonLabel}
      </Button>

      <Dialog open={open} onClose={() => dispatch({ type: "CLOSE_DIALOG" })} maxWidth="md" fullWidth>
        <DialogTitle>{dialogTitle}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.25}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            {isSaving && !savedFilename ? (
              <CircularProgress size={24} />
            ) : savedFilename ? (
              <Alert severity="success">Saved to {savedFilename}</Alert>
            ) : null}
            {isLoading ? <CircularProgress size={24} /> : null}

            {preview ? (
              <>
                <Typography variant="body2" color="text.secondary">
                  Command:{" "}
                  <MonoSpan>{preview.command}</MonoSpan>
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  {explanation}
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  Save to:{" "}
                  <MonoSpan>{preview.filename}</MonoSpan>
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 1.5,
                    bgcolor: "action.hover",
                    borderRadius: 1,
                    overflow: "auto",
                    maxHeight: 420,
                    ...monoSpanSx,
                    fontSize: 13,
                  }}
                >
                  {preview.content || "// (no output)"}
                </Box>
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => dispatch({ type: "CLOSE_DIALOG" })} disabled={isSaving}>
            Close
          </Button>
          <Button
            onClick={onSave}
            variant="contained"
            disabled={!preview || !preview.content.trim() || isLoading || isSaving || Boolean(savedFilename)}
          >
            {savedFilename ? "Saved" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}


