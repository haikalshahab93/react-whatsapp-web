import React from "react";
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import AuthLayout from "./AuthLayout";
import { api } from "../../../lib/api";

type State = "idle" | "verifying" | "verified" | "error";

export default function Verify() {
  const navigate = useNavigate();
  const [state, setState] = React.useState<State>("idle");
  const [message, setMessage] = React.useState<string>("");
  const [email, setEmail] = React.useState("");
  const [resending, setResending] = React.useState(false);
  const [resent, setResent] = React.useState<string | null>(null);

  const token = React.useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("token") || "";
    } catch {
      return "";
    }
  }, []);

  React.useEffect(() => {
    try {
      const fromQuery = new URLSearchParams(window.location.search).get("email");
      if (fromQuery) setEmail(fromQuery);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    if (!token) return;
    let active = true;
    setState("verifying");
    api("/auth/verify", { method: "POST", auth: false, body: { token } })
      .then(() => {
        if (!active) return;
        setState("verified");
        setMessage("Your email is verified. You can sign in now.");
      })
      .catch((error: Error) => {
        if (!active) return;
        setState("error");
        setMessage(error.message || "This verification link is invalid or has expired.");
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function resend() {
    if (!email.trim()) {
      setMessage("Enter the email address you registered with.");
      setState("error");
      return;
    }
    setResending(true);
    try {
      const result = await api<{ verificationToken?: string }>("/auth/resend", {
        method: "POST",
        auth: false,
        body: { email: email.trim() },
      });
      if (result?.verificationToken) {
        navigate(`/verify?token=${encodeURIComponent(result.verificationToken)}`);
      } else {
        setResent("Verification email sent. Check your inbox and spam folder.");
      }
    } catch (error) {
      setMessage((error as Error).message || "Could not resend the verification email.");
      setState("error");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="Email verification protects your account and unlocks sign-in."
      footer={
        <Button component={RouterLink} to="/login" variant="outlined" fullWidth>
          Back to sign in
        </Button>
      }
    >
      <Stack spacing={2.5} alignItems="flex-start">
        <Box
          sx={{
            width: 54,
            height: 54,
            borderRadius: "50%",
            bgcolor: "action.hover",
            display: "grid",
            placeItems: "center",
            color: "primary.main",
          }}
        >
          <MarkEmailReadOutlinedIcon />
        </Box>

        {state === "verifying" && (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={18} />
            <Typography variant="body2">Checking your verification link…</Typography>
          </Stack>
        )}

        {state === "verified" && (
          <>
            <Alert severity="success" sx={{ width: "100%", borderRadius: 3 }}>
              {message}
            </Alert>
            <Button component={RouterLink} to="/login" variant="contained" fullWidth>
              Sign in
            </Button>
          </>
        )}

        {state === "error" && (
          <Alert severity="error" sx={{ width: "100%", borderRadius: 3 }}>
            {message}
          </Alert>
        )}

        {state !== "verified" && (
          <Box sx={{ width: "100%" }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {token
                ? "Need a new link? Enter your email and we will send another one."
                : "Open the link from your verification email, or request a new one below."}
            </Typography>
            <TextField
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              sx={{ mb: 1.5 }}
            />
            {resent && (
              <Alert severity="success" sx={{ mb: 1.5, borderRadius: 3 }}>
                {resent}
              </Alert>
            )}
            <Button onClick={resend} variant="contained" fullWidth disabled={resending}>
              {resending ? "Sending…" : "Resend verification email"}
            </Button>
          </Box>
        )}
      </Stack>
    </AuthLayout>
  );
}
