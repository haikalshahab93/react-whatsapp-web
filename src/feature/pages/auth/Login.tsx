import React from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import AuthLayout from "./AuthLayout";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { ApiError, api } from "../../../lib/api";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const toast = useToast();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = React.useState(false);
  const [resending, setResending] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNeedsVerification(false);
    if (!email.trim() || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.success("Welcome back");
      navigate("/chats", { replace: true });
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || "Could not sign you in.");
      if (apiError.code === "unverified" || apiError.status === 403) setNeedsVerification(true);
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
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
        toast.info("Verification email sent. Check your inbox.");
      }
    } catch (err) {
      toast.error((err as ApiError).message || "Could not resend the verification email.");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up your conversations, friends and nearby discoveries."
      footer={
        <Stack spacing={1.5}>
          <Divider>
            <Typography variant="caption" color="text.secondary">
              New to ChatEasy?
            </Typography>
          </Divider>
          <Button component={RouterLink} to="/register" variant="outlined" fullWidth>
            Create an account
          </Button>
          <Typography variant="caption" color="text.secondary" textAlign="center">
            By continuing you agree to treat people with respect. Reports are reviewed.
          </Typography>
        </Stack>
      }
    >
      <Box component="form" onSubmit={handleSubmit} noValidate>
        {error && (
          <Alert
            severity="error"
            sx={{ mb: 2, borderRadius: 3 }}
            action={
              needsVerification ? (
                <Button color="inherit" size="small" onClick={resendVerification} disabled={resending}>
                  {resending ? "Sending…" : "Resend email"}
                </Button>
              ) : undefined
            }
          >
            {error}
          </Alert>
        )}

        <TextField
          label="Email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          required
          autoComplete="email"
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <MailOutlineIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        <TextField
          label="Password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          required
          autoComplete="current-password"
          sx={{ mb: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <LockOutlinedIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  edge="end"
                >
                  {showPassword ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <Box sx={{ textAlign: "right", mb: 2.5 }}>
          <Link component={RouterLink} to="/reset-password" variant="body2" underline="hover">
            Forgot password?
          </Link>
        </Box>

        <Button type="submit" variant="contained" fullWidth size="large" disabled={loading} sx={{ py: 1.25 }}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </Box>
    </AuthLayout>
  );
}
