import React from "react";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  Typography,
} from "@mui/material";
import UserAvatar from "../../../components/Avatar";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { ApiError, api } from "../../../lib/api";
import { chatDisplayName, chatPartner, messagePreview } from "../../../lib/format";
import type { Chat, Message } from "../../../lib/types";

interface ForwardDialogProps {
  open: boolean;
  message: Message | null;
  onClose: () => void;
}

export default function ForwardDialog({ open, message, onClose }: ForwardDialogProps) {
  const { user } = useAuth();
  const meId = String(user?._id || user?.id || "");
  const toast = useToast();
  const [chats, setChats] = React.useState<Chat[]>([]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected([]);
    api<Chat[]>("/chats")
      .then((data) => setChats(data || []))
      .catch((e) => toast.error((e as ApiError).message || "Could not load your chats."))
      .finally(() => setLoading(false));
  }, [open, toast]);

  async function forward() {
    if (!message || selected.length === 0) return;
    setSending(true);
    try {
      await api(`/messages/${message._id}/forward`, { method: "POST", body: { chatIds: selected } });
      toast.success(`Forwarded to ${selected.length} chat${selected.length > 1 ? "s" : ""}`);
      onClose();
    } catch (e) {
      toast.error((e as ApiError).message || "Could not forward that message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Forward message</DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        {message && (
          <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 1.5, mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              {messagePreview(message)}
            </Typography>
          </Box>
        )}
        {loading ? (
          <Box sx={{ display: "grid", placeItems: "center", py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        ) : (
          <List sx={{ maxHeight: 320, overflow: "auto" }}>
            {chats.map((chat) => {
              const partner = chatPartner(chat, meId);
              const checked = selected.includes(chat._id);
              return (
                <ListItemButton
                  key={chat._id}
                  onClick={() =>
                    setSelected((prev) => (checked ? prev.filter((id) => id !== chat._id) : [...prev, chat._id]))
                  }
                  sx={{ borderRadius: 2 }}
                >
                  <Checkbox checked={checked} size="small" sx={{ mr: 0.5 }} />
                  <UserAvatar
                    src={chat.isGroup ? chat.avatarUrl : partner?.avatarUrl}
                    name={chatDisplayName(chat, meId)}
                    size={32}
                  />
                  <Typography variant="body2" sx={{ ml: 1.5, fontWeight: 600 }} noWrap>
                    {chatDisplayName(chat, meId)}
                  </Typography>
                </ListItemButton>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button variant="contained" onClick={forward} disabled={sending || selected.length === 0}>
          {sending ? "Forwarding…" : `Forward${selected.length ? ` (${selected.length})` : ""}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
