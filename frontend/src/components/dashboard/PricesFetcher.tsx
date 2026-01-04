import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { useCallback, useReducer } from "react";
import { fetchPricesPreview, savePrices, type PricesPreviewResponse } from "../../api/prices";

export interface PricesFetcherProps {
  date: string; // YYYY-MM-DD
  base: string | undefined;
  disabled?: boolean;
}

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

export function PricesFetcher({ date, base, disabled }: PricesFetcherProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { open, preview, error, isLoading, isSaving, savedFilename } = state;

  const canFetch = Boolean(base) && !disabled;

  const onFetch = useCallback(async () => {
    if (!base) return;
    dispatch({ type: "FETCH_START" });
    try {
      const res = await fetchPricesPreview(date, base);
      dispatch({ type: "FETCH_SUCCESS", payload: res });
    } catch (e) {
      dispatch({ type: "FETCH_ERROR", payload: String(e) });
    }
  }, [base, date]);

  const onSave = useCallback(async () => {
    if (!preview) return;
    dispatch({ type: "SAVE_START" });
    try {
      const res = await savePrices(preview.date, preview.content);
      dispatch({ type: "SAVE_SUCCESS", payload: res.filename });
    } catch (e) {
      dispatch({ type: "SAVE_ERROR", payload: String(e) });
    }
  }, [preview]);

  return (
    <>
      <Button size="small" variant="outlined" onClick={onFetch} disabled={!canFetch}>
        Fetch all prices for {date}
      </Button>

      <Dialog open={open} onClose={() => dispatch({ type: "CLOSE_DIALOG" })} maxWidth="md" fullWidth>
        <DialogTitle>Fetch prices</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.25}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            {savedFilename ? <Alert severity="success">Saved to {savedFilename}</Alert> : null}
            {isLoading ? <CircularProgress size={24} /> : null}

            {preview ? (
              <>
                <Typography variant="body2" color="text.secondary">
                  Command:{" "}
                  <Box
                    component="span"
                    sx={{
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                    }}
                  >
                    {preview.command}
                  </Box>
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  Any{" "}
                  <Box
                    component="span"
                    sx={{
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                    }}
                  >
                    price_fetch_multiplier
                  </Box>
                  {" "}metadata on commodity directives will be applied to the fetched prices.
                </Typography>
                
                <Typography variant="body2" color="text.secondary">
                  Save to:{" "}
                  <Box
                    component="span"
                    sx={{
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                    }}
                  >
                    {preview.filename}
                  </Box>
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
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
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


