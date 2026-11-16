import React from "react";
import { Box, Chip, IconButton, Stack, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import TravelExploreOutlinedIcon from "@mui/icons-material/TravelExploreOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import { useColorMode } from "../../../context/ColorModeContext";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const HIGHLIGHTS = [
  { icon: BoltOutlinedIcon, title: "Real-time chats", body: "Delivered instantly, with read receipts and reactions." },
  { icon: TravelExploreOutlinedIcon, title: "Nearby friends", body: "Discover people around you with privacy-first distance." },
  { icon: LockOutlinedIcon, title: "Private by default", body: "Only friends can message you unless you say otherwise." },
];

export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  const theme = useTheme();
  const { mode, toggle } = useColorMode();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        background: () =>
          mode === "light"
            ? "radial-gradient(circle at 20% 20%, #b9f5e0 0%, transparent 55%), radial-gradient(circle at 80% 0%, #dcd7ff 0%, transparent 45%), linear-gradient(160deg,#f7fbf9,#eaf4ef)"
            : "radial-gradient(circle at 20% 20%, rgba(46,230,168,0.22) 0%, transparent 55%), radial-gradient(circle at 80% 0%, rgba(169,155,255,0.18) 0%, transparent 45%), linear-gradient(160deg,#08110e,#0c1a15)",
      }}
    >
      {isDesktop && (
        <Box
          sx={{
            flex: 1.1,
            p: 6,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            maxWidth: 620,
          }}
        >
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: "13px",
                background: "linear-gradient(135deg,#0f9d76,#38bdf8)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: 20,
              }}
            >
              C
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 750, lineHeight: 1.1 }}>ChatEasy</Typography>
              <Typography variant="caption" color="text.secondary">
                private &amp; nearby
              </Typography>
            </Box>
          </Stack>

          <Box>
            <Typography variant="h1" sx={{ fontSize: { md: "2.6rem", lg: "3.1rem" }, mb: 2 }}>
              Conversations that feel{" "}
              <Box component="span" sx={{ color: "primary.main" }}>
                close
              </Box>
              .
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 460, mb: 4 }}>
              A calmer place to message friends, share moments and meet people nearby — with the privacy
              controls you actually need.
            </Typography>
            <Stack spacing={2.5}>
              {HIGHLIGHTS.map((item) => {
                const Icon = item.icon;
                return (
                  <Stack key={item.title} direction="row" spacing={2} alignItems="flex-start">
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 2.5,
                        display: "grid",
                        placeItems: "center",
                        bgcolor: theme.palette.mode === "light" ? "rgba(15,157,118,0.12)" : "rgba(46,230,168,0.14)",
                        color: "primary.main",
                        flexShrink: 0,
                      }}
                    >
                      <Icon fontSize="small" />
                    </Box>
                    <Box>
                      <Typography sx={{ fontWeight: 650 }}>{item.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.body}
                      </Typography>
                    </Box>
                  </Stack>
                );
              })}
            </Stack>
          </Box>

          <Stack direction="row" spacing={1}>
            <Chip size="small" label="End-to-end authenticated" />
            <Chip size="small" label="Free tier friendly" />
          </Stack>
        </Box>
      )}

      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 2, sm: 4 },
          position: "relative",
        }}
      >
        <IconButton
          onClick={toggle}
          aria-label="Toggle colour mode"
          sx={{ position: "absolute", top: 16, right: 16, bgcolor: "background.paper" }}
        >
          {mode === "dark" ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
        </IconButton>

        <Box
          sx={{
            width: "100%",
            maxWidth: 430,
            bgcolor: "background.paper",
            borderRadius: 5,
            p: { xs: 3, sm: 4 },
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: theme.palette.mode === "light" ? "0 30px 70px -50px rgba(16,35,29,0.75)" : "none",
          }}
        >
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {subtitle}
          </Typography>
          {children}
          {footer && <Box sx={{ mt: 3 }}>{footer}</Box>}
        </Box>
      </Box>
    </Box>
  );
}
