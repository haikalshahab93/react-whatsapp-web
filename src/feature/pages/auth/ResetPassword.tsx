import React from "react";
import { Alert, Box, Button, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import LockResetOutlinedIcon from "@mui/icons-material/LockResetOutlined";
import AuthLayout from "./AuthLayout";
import { api } from "../../../lib/api";
import { useToast } from "../../../context/ToastContext";

export default function ResetPassword() {
  const navigate = useNavigate();
  const toast = useToast();
  const [token, setToken] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      setToken(new URLSearchParams(window.location.search).get("token") || "");
    } catch {
      /* ignore */
    }
  }, []);

  async function requestLink(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSent(null);
    setLoading(true);
    try {
      const result = await api<{ message: string; resetToken?: string }>("/auth/forgot", {
        method: "POST",
        auth: false,
        body: { email: email.trim() },
      });
      if (result.resetToken) {
        setToken(result.resetToken);
        toast.info("This server has no email configured, so the reset link opened directly.");
      } else {
        setSent(result.message || "Check your inbox for the reset link.");
      }
    } catch (err) {
      setError((err as Error).message || "Could not start the reset process.");
    } finally {
      setLoading(false);
    }
  }

  async function submitReset(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await api("/auth/reset", { method: "POST", auth: false, body: { token, password } });
      toast.success("Password updated. Sign in with your new password.");
      navigate("/login", { replace: true });
    } catch (err) {
      setError((err as Error).message || "Could not reset your password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={token ? "Choose a new password" : "Reset your password"}
      subtitle={
        token
          ? "Pick something strong that you have not used elsewhere."
          : "We will email you a secure link to set a new password."
      }
      footer={
        <Stack spacing={1}>
          <Button component={RouterLink} to="/login" variant="outlined" fullWidth>
            Back to sign in
          </Button>
          <Button component={RouterLink} to="/register" color="inherit" fullWidth>
            Create an account
          </Button>
        </Stack>
      }
    >
      <Box
        component="form"
        onSubmit={token ? submitReset : requestLink}
        noValidate
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <Box
          sx={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            bgcolor: "action.hover",
            display: "grid",
            placeItems: "center",
            color: "primary.main",
          }}
        >
          <LockResetOutlinedIcon />
        </Box>

        {error && (
          <Alert severity="error" sx={{ borderRadius: 3 }}>
            {error}
          </Alert>
        )}
        {sent && (
          <Alert severity="success" sx={{ borderRadius: 3 }}>
            {sent}
          </Alert>
        )}

        {token ? (
          <>
            <TextField
              label="New password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              required
              autoComplete="new-password"
              helperText="At least 8 characters"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockResetOutlinedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="Confirm new password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              fullWidth
              required
              autoComplete="new-password"
            />
            <Button type="submit" variant="contained" fullWidth disabled={loading}>
              {loading ? "Updating…" : "Update password"}
            </Button>
            <Typography variant="caption" color="text.secondary">
              Resetting also confirms your email address.
            </Typography>
          </>
        ) : (
          <>
            <TextField
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              required
              autoComplete="email"
            />
            <Button type="submit" variant="contained" fullWidth disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </Button>
          </>
        )}
      </Box>
    </AuthLayout>
  );
}
