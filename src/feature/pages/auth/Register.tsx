import React from "react";
import {
  Alert,
  Box,
  Button,
  Collapse,
  Divider,
  IconButton,
  InputAdornment,
  InputLabel,
  Link,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AuthLayout from "./AuthLayout";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { ApiError, api } from "../../../lib/api";

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Register() {
  const navigate = useNavigate();
  const { register, login } = useAuth();
  const toast = useToast();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showMore, setShowMore] = React.useState(false);
  const [gender, setGender] = React.useState("");
  const [birthdate, setBirthdate] = React.useState("");
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [inviter] = React.useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("inviter") || "";
    } catch {
      return "";
    }
  });

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!name.trim() || name.trim().length < 2) next.name = "Tell us your name (2+ characters).";
    if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email address.";
    if (password.length < 8) next.password = "Use at least 8 characters.";
    if (confirm !== password) next.confirm = "Passwords do not match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const result = await register({
        name: name.trim(),
        email: email.trim(),
        password,
        inviter: inviter || undefined,
        gender: gender || undefined,
        birthdate: birthdate || undefined,
      });

      if (result?.verificationToken) {
        // No SMTP configured on this server: verify immediately and sign in.
        await api("/auth/verify", { method: "POST", auth: false, body: { token: result.verificationToken } });
        await login(email.trim(), password);
        toast.success("Account created. Welcome to ChatEasy!");
        navigate("/profile?welcome=1", { replace: true });
      } else {
        toast.success("Account created. Check your email to verify it.");
        navigate(`/verify?email=${encodeURIComponent(email.trim())}`, { replace: true });
      }
    } catch (err) {
      setError((err as ApiError).message || "Could not create your account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="A few details and you are in. You can fine-tune your profile later."
      footer={
        <Stack spacing={1.5}>
          <Divider>
            <Typography variant="caption" color="text.secondary">
              Already have an account?
            </Typography>
          </Divider>
          <Button component={RouterLink} to="/login" variant="outlined" fullWidth>
            Sign in instead
          </Button>
        </Stack>
      }
    >
      <Box component="form" onSubmit={handleSubmit} noValidate>
        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
            {error}
          </Alert>
        )}

        <TextField
          label="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={!!errors.name}
          helperText={errors.name}
          fullWidth
          required
          autoComplete="name"
          sx={{ mb: 2 }}
        />

        <TextField
          label="Email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={!!errors.email}
          helperText={errors.email}
          fullWidth
          required
          autoComplete="email"
          sx={{ mb: 2 }}
        />

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={!!errors.password}
            helperText={errors.password || "At least 8 characters"}
            fullWidth
            required
            autoComplete="new-password"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    edge="end"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <VisibilityOffOutlinedIcon fontSize="small" />
                    ) : (
                      <VisibilityOutlinedIcon fontSize="small" />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="Confirm password"
            type={showPassword ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={!!errors.confirm}
            helperText={errors.confirm}
            fullWidth
            required
            autoComplete="new-password"
          />
        </Stack>

        <Button
          onClick={() => setShowMore((v) => !v)}
          size="small"
          endIcon={<ExpandMoreIcon sx={{ transform: showMore ? "rotate(180deg)" : "none", transition: "0.2s" }} />}
          sx={{ mb: 1, color: "text.secondary" }}
        >
          Add profile details (optional)
        </Button>

        <Collapse in={showMore} timeout="auto" unmountOnExit>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
            <Box sx={{ flex: 1 }}>
              <InputLabel shrink htmlFor="gender-select" sx={{ mb: 0.5, fontSize: 12 }}>
                Gender
              </InputLabel>
              <Select
                id="gender-select"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                displayEmpty
                fullWidth
                size="small"
              >
                <MenuItem value="">Prefer not to say</MenuItem>
                <MenuItem value="male">Male</MenuItem>
                <MenuItem value="female">Female</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </Box>
            <TextField
              label="Date of birth"
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: new Date().toISOString().slice(0, 10) }}
              helperText="Used for age filters. Must be 18+"
            />
          </Stack>
        </Collapse>

        <Button type="submit" variant="contained" fullWidth size="large" disabled={loading} sx={{ py: 1.25 }}>
          {loading ? "Creating account…" : "Create account"}
        </Button>

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2, textAlign: "center" }}>
          We never post on your behalf. You can hide your profile from discovery at any time.
        </Typography>
        <Typography variant="caption" sx={{ display: "block", mt: 1, textAlign: "center" }}>
          <Link component={RouterLink} to="/login" underline="hover">
            Back to sign in
          </Link>
        </Typography>
      </Box>
    </AuthLayout>
  );
}
