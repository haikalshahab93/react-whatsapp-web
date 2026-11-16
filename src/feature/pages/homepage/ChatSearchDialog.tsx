import React from "react";
import {
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  InputAdornment,
  List,
  ListItemButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import EmptyState from "../../../components/EmptyState";
import UserAvatar from "../../../components/Avatar";
import { ApiError, api } from "../../../lib/api";
import { formatRelative, senderName } from "../../../lib/format";
import type { Message } from "../../../lib/types";

interface ChatSearchDialogProps {
  open: boolean;
  chatId?: string;
  onClose: () => void;
}

export default function ChatSearchDialog({ open, chatId, onClose }: ChatSearchDialogProps) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || !chatId) return undefined;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const data = await api<{ messages: Message[] }>("/messages/search", {
          query: { chat: chatId, q: term, limit: 30 },
          signal: controller.signal,
        });
        setResults(data.messages || []);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as ApiError).message || "Search failed");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, chatId, open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Search this conversation</DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <TextField
          autoFocus
          fullWidth
          placeholder="Search messages"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />

        {loading && (
          <Box sx={{ display: "grid", placeItems: "center", py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        )}

        {!loading && error && (
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        )}

        {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
          <EmptyState title="No matches" description={`Nothing here contains “${query.trim()}”.`} compact />
        )}

        <List>
          {results.map((message) => (
            <ListItemButton key={message._id} onClick={onClose} sx={{ borderRadius: 2, alignItems: "flex-start" }}>
              <UserAvatar src={(message.sender as { avatarUrl?: string })?.avatarUrl} name={senderName(message.sender)} size={32} />
              <Stack sx={{ ml: 1.5, minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {senderName(message.sender)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatRelative(message.createdAt)}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {message.content}
                </Typography>
              </Stack>
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  );
}
