import React from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import UserAvatar from "../../../components/Avatar";
import EmptyState from "../../../components/EmptyState";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { ApiError, api } from "../../../lib/api";
import type { User } from "../../../lib/types";

interface InviteResponse {
  message: string;
  registerUrl?: string;
  delivered?: { email: boolean; whatsapp: boolean };
}

export default function Invite() {
  const { user } = useAuth();
  const toast = useToast();
  const [suggestions, setSuggestions] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");

  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<InviteResponse | null>(null);

  const inviteLink = React.useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const id = user?._id || user?.id || "";
    return id ? `${origin}/register?inviter=${encodeURIComponent(id)}` : `${origin}/register`;
  }, [user]);

  React.useEffect(() => {
    setLoading(true);
    api<User[]>("/users/suggest", { query: { limit: 12 } })
      .then((data) => setSuggestions(data || []))
      .catch((e) => toast.error((e as ApiError).message || "Could not load suggestions."))
      .finally(() => setLoading(false));
  }, [toast]);

  async function sendInvite(target: { email?: string; phone?: string }) {
    if (!target.email && !target.phone) {
      toast.error("Enter an email address or phone number.");
      return;
    }
    setSending(true);
    setLastResult(null);
    try {
      const result = await api<InviteResponse>("/users/invite", {
        method: "POST",
        body: { email: target.email, phone: target.phone, message },
      });
      setLastResult(result);
      if (result.delivered?.email || result.delivered?.whatsapp) {
        toast.success("Invitation sent");
        setEmail("");
        setPhone("");
      } else {
        toast.info("Sharing channels are not configured — copy the invite link instead.");
      }
    } catch (e) {
      toast.error((e as ApiError).message || "Could not send the invitation.");
    } finally {
      setSending(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success("Invite link copied");
    } catch {
      toast.info(inviteLink);
    }
  }

  return (
    <Box sx={{ height: "100%", overflowY: "auto", px: { xs: 2, sm: 3 }, py: 2.5 }}>
      <Typography variant="h5">Invite friends</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        ChatEasy is better with the people you already talk to. Share your personal invite link.
      </Typography>

      <Card sx={{ p: 2.5, mb: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Your invite link
            </Typography>
            <TextField
              value={inviteLink}
              fullWidth
              size="small"
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Copy link">
                      <IconButton onClick={copyLink} edge="end" aria-label="Copy invite link">
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
            />
          </Box>
          <Button variant="contained" onClick={copyLink} startIcon={<ContentCopyIcon />}>
            Copy link
          </Button>
        </Stack>
      </Card>

      {lastResult && !lastResult.delivered?.email && !lastResult.delivered?.whatsapp && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 3 }}>
          {lastResult.message}
        </Alert>
      )}

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1.2fr 1fr" } }}>
        <Card sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            People you may know
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Based on your email domain and phone prefix.
          </Typography>
          <TextField
            placeholder="Search by name, email or phone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            fullWidth
            size="small"
            sx={{ mb: 1.5 }}
          />
          {loading ? (
            <Box sx={{ display: "grid", placeItems: "center", py: 4 }}>
              <CircularProgress size={22} />
            </Box>
          ) : suggestions.length === 0 ? (
            <EmptyState icon={PersonAddAltIcon} title="No suggestions yet" description="Share your link with a friend instead." compact />
          ) : (
            <List>
              {suggestions
                .filter((s) => {
                  const term = query.trim().toLowerCase();
                  if (!term) return true;
                  return (
                    s.name.toLowerCase().includes(term) ||
                    (s.email || "").toLowerCase().includes(term) ||
                    (s.phone || "").includes(term)
                  );
                })
                .map((person) => (
                  <ListItem
                    key={person._id}
                    secondaryAction={
                      <Stack direction="row" spacing={0.5}>
                        {person.email && (
                          <Tooltip title="Invite by email">
                            <IconButton
                              onClick={() => sendInvite({ email: person.email })}
                              disabled={sending}
                              aria-label={`Invite ${person.name} by email`}
                            >
                              <MailOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {person.phone && (
                          <Tooltip title="Invite via WhatsApp">
                            <IconButton
                              onClick={() => sendInvite({ phone: person.phone || undefined })}
                              disabled={sending}
                              aria-label={`Invite ${person.name} via WhatsApp`}
                            >
                              <WhatsAppIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    }
                  >
                    <ListItemAvatar>
                      <UserAvatar src={person.avatarUrl} name={person.name} size={38} />
                    </ListItemAvatar>
                    <ListItemText
                      primary={person.name}
                      secondary={[person.email, person.phone].filter(Boolean).join(" · ") || "No contact details"}
                    />
                  </ListItem>
                ))}
            </List>
          )}
        </Card>

        <Card sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Send a direct invitation
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Requires email (SMTP) or WhatsApp (Twilio) to be configured on the server.
          </Typography>
          <Stack spacing={2}>
            <TextField label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
            <TextField label="WhatsApp number (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth />
            <TextField
              label="Personal message (optional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              fullWidth
              multiline
              minRows={3}
              inputProps={{ maxLength: 300 }}
            />
            <Button
              variant="contained"
              startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
              onClick={() => sendInvite({ email: email || undefined, phone: phone || undefined })}
              disabled={sending}
            >
              {sending ? "Sending…" : "Send invitation"}
            </Button>
            <Divider />
            <Typography variant="caption" color="text.secondary">
              Invitations never create an account for the other person. They receive a link and choose to register.
            </Typography>
          </Stack>
        </Card>
      </Box>
    </Box>
  );
}
