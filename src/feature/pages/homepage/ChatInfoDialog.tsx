import React from "react";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import IconButton from "@mui/material/IconButton";
import ConfirmDialog from "../../../components/ConfirmDialog";
import UserAvatar from "../../../components/Avatar";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { ApiError, api } from "../../../lib/api";
import { chatDisplayName, presenceLabel } from "../../../lib/format";
import type { Chat, User } from "../../../lib/types";

interface ChatInfoDialogProps {
  open: boolean;
  chat: Chat | null;
  onClose: () => void;
  onChatUpdated: (chat: Chat) => void;
  onLeft: () => void;
}

export default function ChatInfoDialog({ open, chat, onClose, onChatUpdated, onLeft }: ChatInfoDialogProps) {
  const { user } = useAuth();
  const meId = String(user?._id || user?.id || "");
  const toast = useToast();

  const [friends, setFriends] = React.useState<User[]>([]);
  const [addOpen, setAddOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<{ el: HTMLElement; member: User } | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState<User | null>(null);
  const [confirmLeave, setConfirmLeave] = React.useState(false);

  const isAdmin = (chat?.admins || []).includes(meId);

  React.useEffect(() => {
    if (!open || !chat?.isGroup || !addOpen) return;
    api<User[]>("/friends")
      .then((data) => setFriends(data || []))
      .catch(() => setFriends([]));
  }, [open, chat?.isGroup, addOpen]);

  React.useEffect(() => {
    if (!open) {
      setAddOpen(false);
      setConfirmRemove(null);
      setConfirmLeave(false);
      setMenuAnchor(null);
    }
  }, [open]);

  async function addMember(friend: User) {
    if (!chat) return;
    setBusy(true);
    try {
      const updated = await api<Chat>(`/chats/${chat._id}/members`, {
        method: "POST",
        body: { userId: friend._id },
      });
      onChatUpdated(updated);
      toast.success(`${friend.name} added`);
      setAddOpen(false);
    } catch (e) {
      toast.error((e as ApiError).message || "Could not add that member.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: User) {
    if (!chat) return;
    setBusy(true);
    try {
      await api(`/chats/${chat._id}/members/${member._id}`, { method: "DELETE" });
      const fresh = await api<Chat>(`/chats/${chat._id}`);
      onChatUpdated(fresh);
      toast.success(`${member.name} removed`);
      setConfirmRemove(null);
    } catch (e) {
      toast.error((e as ApiError).message || "Could not remove that member.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAdmin(member: User, admin: boolean) {
    if (!chat) return;
    try {
      const updated = await api<Chat>(`/chats/${chat._id}/admins/${member._id}`, {
        method: "POST",
        body: { admin },
      });
      onChatUpdated(updated);
      toast.success(admin ? `${member.name} is now an admin` : `${member.name} is no longer an admin`);
    } catch (e) {
      toast.error((e as ApiError).message || "Could not update the admin.");
    } finally {
      setMenuAnchor(null);
    }
  }

  async function leave() {
    if (!chat) return;
    setBusy(true);
    try {
      await api(`/chats/${chat._id}`, { method: "DELETE" });
      toast.success(chat.isGroup ? "You left the group" : "Chat removed from your list");
      setConfirmLeave(false);
      onClose();
      onLeft();
    } catch (e) {
      toast.error((e as ApiError).message || "Could not leave this chat.");
    } finally {
      setBusy(false);
    }
  }

  if (!chat) return null;
  const partner = chat.members.find((m) => String(m._id) !== meId);
  const notInGroup = friends.filter((f) => !chat.members.some((m) => String(m._id) === f._id));

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle>{chat.isGroup ? "Group info" : "Conversation info"}</DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          <Stack alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <UserAvatar
              src={chat.isGroup ? chat.avatarUrl : partner?.avatarUrl}
              name={chatDisplayName(chat, meId)}
              size={84}
            />
            <Typography variant="h6">{chatDisplayName(chat, meId)}</Typography>
            {chat.isGroup ? (
              <Typography variant="body2" color="text.secondary">
                {chat.members.length} members
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {presenceLabel(partner?.online, partner?.lastActiveAt)}
              </Typography>
            )}
            {chat.isGroup && chat.description && (
              <Typography variant="body2" color="text.secondary" textAlign="center">
                {chat.description}
              </Typography>
            )}
          </Stack>

          <Divider sx={{ mb: 1 }} />

          {chat.isGroup && (
            <>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="subtitle2">Members</Typography>
                {isAdmin && (
                  <Button size="small" startIcon={<PersonAddAltIcon />} onClick={() => setAddOpen(true)}>
                    Add
                  </Button>
                )}
              </Stack>

              {addOpen && (
                <Box sx={{ mb: 1.5, bgcolor: "action.hover", borderRadius: 2, p: 1 }}>
                  {notInGroup.length === 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      All your friends are already in this group.
                    </Typography>
                  ) : (
                    notInGroup.map((friend) => (
                      <Button
                        key={friend._id}
                        size="small"
                        disabled={busy}
                        onClick={() => addMember(friend)}
                        sx={{ mr: 1, mb: 1 }}
                        variant="outlined"
                        startIcon={<Avatar src={friend.avatarUrl || undefined} sx={{ width: 18, height: 18 }} />}
                      >
                        {friend.name}
                      </Button>
                    ))
                  )}
                </Box>
              )}

              <List dense>
                {chat.members.map((member) => {
                  const admin = (chat.admins || []).includes(String(member._id));
                  return (
                    <ListItem
                      key={member._id}
                      secondaryAction={
                        isAdmin && String(member._id) !== meId ? (
                          <IconButton
                            edge="end"
                            size="small"
                            onClick={(e) => setMenuAnchor({ el: e.currentTarget, member })}
                            aria-label={`Manage ${member.name}`}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        ) : undefined
                      }
                    >
                      <ListItemAvatar>
                        <UserAvatar src={member.avatarUrl} name={member.name} size={34} online={member.online} showPresence />
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {String(member._id) === meId ? "You" : member.name}
                            </Typography>
                            {admin && <Chip label="Admin" size="small" sx={{ height: 18, fontSize: 10 }} />}
                          </Stack>
                        }
                        secondary={String(member._id) === meId ? undefined : presenceLabel(member.online, member.lastActiveAt)}
                      />
                    </ListItem>
                  );
                })}
              </List>
            </>
          )}

          {!chat.isGroup && partner && (
            <Stack spacing={1} sx={{ py: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Messages are private to the two of you. Block the conversation from the chat menu if needed.
              </Typography>
            </Stack>
          )}

          <Divider sx={{ mt: 1.5, mb: 1.5 }} />
          <Button color="error" fullWidth variant="outlined" onClick={() => setConfirmLeave(true)}>
            {chat.isGroup ? "Leave group" : "Delete chat for me"}
          </Button>
        </DialogContent>
      </Dialog>

      <Menu
        anchorEl={menuAnchor?.el}
        open={!!menuAnchor}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem
          onClick={() => {
            if (menuAnchor) {
              const isMemberAdmin = (chat.admins || []).includes(String(menuAnchor.member._id));
              void toggleAdmin(menuAnchor.member, !isMemberAdmin);
            }
          }}
        >
          {(chat.admins || []).includes(String(menuAnchor?.member._id || "")) ? "Dismiss as admin" : "Make admin"}
        </MenuItem>
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => {
            if (menuAnchor) setConfirmRemove(menuAnchor.member);
            setMenuAnchor(null);
          }}
        >
          Remove from group
        </MenuItem>
      </Menu>

      <ConfirmDialog
        open={!!confirmRemove}
        title={`Remove ${confirmRemove?.name || "member"}?`}
        description="They will lose access to this group's messages."
        confirmLabel="Remove"
        danger
        loading={busy}
        onConfirm={() => confirmRemove && removeMember(confirmRemove)}
        onClose={() => setConfirmRemove(null)}
      />

      <ConfirmDialog
        open={confirmLeave}
        title={chat.isGroup ? "Leave this group?" : "Delete this chat?"}
        description={
          chat.isGroup
            ? "You will stop receiving messages from this group."
            : "The conversation is removed from your list. The other person keeps their copy."
        }
        confirmLabel={chat.isGroup ? "Leave" : "Delete"}
        danger
        loading={busy}
        onConfirm={leave}
        onClose={() => setConfirmLeave(false)}
      />
    </>
  );
}

