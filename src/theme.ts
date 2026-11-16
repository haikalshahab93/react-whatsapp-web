import { createTheme, Theme } from "@mui/material/styles";

/** Legacy palette kept for existing components that still import it. */
export const colors = {
  green1: "#0f9d76",
  white1: "#eef5f2",
  black1: "#16241f",
  grey1: "#8aa39b",
  pink1: "#c86dd7",
  blue1: "#3d7bfd",
  blue2: "#38bdf8",
  red1: "#ef5b7b",
  purple1: "#7c6cf6",
};

export type ColorMode = "light" | "dark";

export interface AppTokens {
  mode: ColorMode;
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  bubbleIn: string;
  bubbleOut: string;
  bubbleOutText: string;
  bubbleInText: string;
  chatCanvas: string;
  primary: string;
  accent: string;
  danger: string;
  success: string;
  shadow: string;
  glass: string;
  heroGradient: string;
}

export const tokensByMode: Record<ColorMode, AppTokens> = {
  light: {
    mode: "light",
    background: "#f3f7f5",
    surface: "#ffffff",
    surfaceAlt: "#eaf1ee",
    border: "rgba(16, 35, 29, 0.08)",
    text: "#10231d",
    textMuted: "#5f776f",
    bubbleIn: "#ffffff",
    bubbleOut: "#0f9d76",
    bubbleOutText: "#ffffff",
    bubbleInText: "#10231d",
    chatCanvas: "#eef4f1",
    primary: "#0f9d76",
    accent: "#7c6cf6",
    danger: "#d93a5c",
    success: "#0f9d76",
    shadow: "0 18px 40px -24px rgba(16, 35, 29, 0.6)",
    glass: "rgba(255,255,255,0.72)",
    heroGradient:
      "radial-gradient(circle at 20% 20%, #b9f5e0 0%, transparent 55%), radial-gradient(circle at 80% 0%, #dcd7ff 0%, transparent 45%), linear-gradient(160deg, #f7fbf9 0%, #eaf4ef 100%)",
  },
  dark: {
    mode: "dark",
    background: "#08110e",
    surface: "#111d19",
    surfaceAlt: "#16251f",
    border: "rgba(232, 242, 238, 0.08)",
    text: "#e8f2ee",
    textMuted: "#95aca4",
    bubbleIn: "#16251f",
    bubbleOut: "#106b54",
    bubbleOutText: "#f2fffb",
    bubbleInText: "#e8f2ee",
    chatCanvas: "#081512",
    primary: "#2ee6a8",
    accent: "#a99bff",
    danger: "#ff6b8b",
    success: "#2ee6a8",
    shadow: "0 22px 50px -30px rgba(0, 0, 0, 0.9)",
    glass: "rgba(17, 29, 25, 0.72)",
    heroGradient:
      "radial-gradient(circle at 20% 20%, rgba(46,230,168,0.22) 0%, transparent 55%), radial-gradient(circle at 80% 0%, rgba(169,155,255,0.18) 0%, transparent 45%), linear-gradient(160deg, #08110e 0%, #0c1a15 100%)",
  },
};

export function createAppTheme(mode: ColorMode): Theme {
  const t = tokensByMode[mode];
  return createTheme({
    palette: {
      mode,
      primary: { main: t.primary, contrastText: mode === "light" ? "#ffffff" : "#04231a" },
      secondary: { main: t.accent },
      error: { main: t.danger },
      success: { main: t.success },
      background: { default: t.background, paper: t.surface },
      text: { primary: t.text, secondary: t.textMuted },
      divider: t.border,
    },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily:
        "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      h1: { fontSize: "2.6rem", fontWeight: 700, letterSpacing: "-0.03em" },
      h2: { fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" },
      h3: { fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" },
      h4: { fontSize: "1.25rem", fontWeight: 700 },
      h5: { fontSize: "1.1rem", fontWeight: 650 },
      h6: { fontSize: "1rem", fontWeight: 650 },
      body1: { fontSize: "0.95rem", lineHeight: 1.55 },
      body2: { fontSize: "0.85rem", lineHeight: 1.5 },
      button: { textTransform: "none", fontWeight: 600, letterSpacing: 0 },
      caption: { fontSize: "0.75rem", letterSpacing: "0.01em" },
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 12, paddingInline: 18, paddingBlock: 9, fontWeight: 600 },
          containedPrimary: { boxShadow: "none" },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 20,
            border: `1px solid ${t.border}`,
            backgroundImage: "none",
            boxShadow: t.mode === "light" ? "0 10px 30px -24px rgba(16,35,29,0.55)" : "none",
          },
        },
      },
      MuiTextField: {
        defaultProps: { size: "small" },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: t.mode === "light" ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.03)",
            "& fieldset": { borderColor: t.border },
            "&:hover fieldset": { borderColor: `${t.primary}66` },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 10, fontWeight: 550 },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 22, border: `1px solid ${t.border}` },
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: true },
        styleOverrides: {
          tooltip: { borderRadius: 10, fontSize: "0.75rem" },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { borderRadius: 12 } },
      },
      MuiAvatar: {
        styleOverrides: { root: { fontWeight: 650 } },
      },
      MuiSnackbarContent: {
        styleOverrides: { root: { borderRadius: 12 } },
      },
    },
  });
}
