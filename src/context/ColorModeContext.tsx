import React from "react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { createAppTheme, ColorMode } from "../theme";

const STORAGE_KEY = "chateasy_mode";

interface ColorModeContextValue {
  mode: ColorMode;
  toggle: () => void;
  setMode: (mode: ColorMode) => void;
}

const ColorModeContext = React.createContext<ColorModeContextValue>({
  mode: "light",
  toggle: () => undefined,
  setMode: () => undefined,
});

export const useColorMode = () => React.useContext(ColorModeContext);

function initialMode(): ColorMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
  } catch {
    /* ignore */
  }
  return "light";
}

export function ColorModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<ColorMode>(initialMode);

  const setMode = React.useCallback((next: ColorMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = React.useCallback(() => {
    setModeState((prev) => {
      const next: ColorMode = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const theme = React.useMemo(() => createAppTheme(mode), [mode]);
  const value = React.useMemo(() => ({ mode, toggle, setMode }), [mode, toggle, setMode]);

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
