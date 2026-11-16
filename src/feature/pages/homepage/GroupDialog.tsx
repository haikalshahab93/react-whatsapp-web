import React from "react";
import {
  Avatar,
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
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import GroupAddOutlinedIcon from "@mui/icons-material/GroupAddOutlined";
import { useToast } from "../../../context/ToastContext";
import { ApiError, api } from "../../../lib/api";
import type { Chat, User } from "../../../lib/types";
import EmptyState from "../../../components/EmptyState";

interface GroupDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (chat: Chat) => void;
}

export default function GroupDialog({ open, onClose, onCreated }: GroupDialogProps) {
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [friends, setFriends] = React.useState<User[]>([]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    api<User[]>("/friends")
      .then((data) => setFriends(data || []))
      .catch((e) => toast.error((e as ApiError).message || "Could not load your friends."))
      .finally(() => setLoading(false));
  }, [open, toast]);

  React.useEffect(() => {
    if (!open) {
      setName("");
      setSelected([]);
      setQuery("");
    }
  }, [open]);

  const filtered = friends.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function create() {
    if (!name.trim()) {
      toast.error("Give the group a name.");
      return;
    }
    if (selected.length === 0) {
      toast.error("Pick at least one friend.");
      return;
    }
    setCreating(true);
    try {
      const chat = await api<Chat>("/chats", {
        method: "POST",
        body: { name: name.trim(), isGroup: true, members: selected },
      });
      toast.success("Group created");
      onCreated(chat);
      onClose();
    } catch (e) {
      toast.error((e as ApiError).message || "Could not create the group.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>New group</DialogTitle>
      <DialogContent sx={{ pb: 1 }}>
        <TextField
          label="Group name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          autoFocus
          sx={{ mb: 2 }}
          inputProps={{ maxLength: 80 }}
        />
        <TextField
          label="Find a friend"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 1 }}
        />

        {loading ? (
          <Box sx={{ display: "grid", placeItems: "center", py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        ) : friends.length === 0 ? (
          <EmptyState
            icon={GroupAddOutlinedIcon}
            title="No friends yet"
            description="Groups are built from your friends list. Accept a request first."
            compact
          />
        ) : (
          <List sx={{ maxHeight: 280, overflow: "auto" }}>
            {filtered.map((friend) => {
              const checked = selected.includes(friend._id);
              return (
                <ListItemButton
                  key={friend._id}
                  onClick={() =>
                    setSelected((prev) => (checked ? prev.filter((id) => id !== friend._id) : [...prev, friend._id]))
                  }
                  sx={{ borderRadius: 2 }}
                >
                  <Checkbox checked={checked} size="small" sx={{ mr: 0.5 }} />
                  <Avatar src={friend.avatarUrl || undefined} sx={{ width: 34, height: 34, mr: 1.5 }}>
                    {friend.name?.[0]}
                  </Avatar>
                  <Stack sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                      {friend.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {friend.bio || `@${friend.username || "friend"}`}
                    </Typography>
                  </Stack>
                </ListItemButton>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: "auto" }}>
          {selected.length} selected
        </Typography>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button variant="contained" onClick={create} disabled={creating}>
          {creating ? "Creating…" : "Create group"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
