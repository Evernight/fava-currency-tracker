import { createTheme, ThemeProvider, useMediaQuery } from "@mui/material";

interface CustomThemeProviderProps {
  children?: React.ReactNode;
}

export function CustomThemeProvider({ children }: CustomThemeProviderProps) {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const mode = getFavaThemeSetting() ?? (prefersDark ? "dark" : "light");

  const theme = createTheme({
    cssVariables: true,
    palette: { mode },
    typography: {
      fontFamily: "", // use Fava default font
    },
  });

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

function getFavaThemeSetting(): "light" | "dark" | undefined {
  const favaThemeSetting = document.documentElement.style.colorScheme;
  switch (favaThemeSetting) {
    case "light":
      return "light";
    case "dark":
      return "dark";
    default:
      return undefined;
  }
}


