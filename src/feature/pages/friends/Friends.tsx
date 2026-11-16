import React from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import PersonRemoveAlt1Icon from "@mui/icons-material/PersonRemoveAlt1";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import FavoriteIcon from "@mui/icons-material/Favorite";
import BlockIcon from "@mui/icons-material/Block";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import { useNavigate } from "react-router-dom";
import UserAvatar from "../../../components/Avatar";
import EmptyState from "../../../components/EmptyState";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { FRIEND_REQUESTS_EVENT } from "../../../components/AppShell";
import { ApiError, api } from "../../../lib/api";
import { formatRelative, presenceLabel } from "../../../lib/format";
import type { FriendRequestItem, User } from "../../../lib/types";

type TabKey = "received" | "sent" | "friends" | "matches" | "blocked";

interface MatchItem {
  _id: string;
  createdAt: string;
  user: User;
}

export default function Friends() {
  const { user } = useAuth();
  const meId = String(user?._id || user?.id || "");
  const toast = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = React.useState<TabKey>("received");
  const [received, setReceived] = React.useState<FriendRequestItem[]>([]);
  const [sent, setSent] = React.useState<FriendRequestItem[]>([]);
  const [friends, setFriends] = React.useState<User[]>([]);
  const [matches, setMatches] = React.useState<MatchItem[]>([]);
  const [blocked, setBlocked] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [confirm, setConfirm] = React.useState<{ kind: "remove" | "block" | "unblock"; user: User } | null>(null);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const [r, s, f, m, b] = await Promise.all([
        api<FriendRequestItem[]>("/friends/requests/received"),
        api<FriendRequestItem[]>("/friends/requests/sent"),
        api<User[]>("/friends"),
        api<MatchItem[]>("/friends/matches"),
        api<User[]>("/friends/blocked"),
      ]);
      setReceived(r || []);
      setSent(s || []);
      setFriends(f || []);
      setMatches(m || []);
      setBlocked(b || []);
    } catch (e) {
      toast.error((e as ApiError).message || "Could not load your friends.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  React.useEffect(() => {
    const refresh = () => void loadAll();
    window.addEventListener(FRIEND_REQUESTS_EVENT, refresh);
    return () => window.removeEventListener(FRIEND_REQUESTS_EVENT, refresh);
  }, [loadAll]);

  async function accept(request: FriendRequestItem) {
    setBusyId(request._id);
    try {
      await api(`/friends/request/${request._id}/accept`, { method: "POST" });
      toast.success("Friend request accepted");
      await loadAll();
      window.dispatchEvent(new CustomEvent(FRIEND_REQUESTS_EVENT));
    } catch (e) {
      toast.error((e as ApiError).message || "Could not accept the request.");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(request: FriendRequestItem) {
    setBusyId(request._id);
    try {
      await api(`/friends/request/${request._id}/reject`, { method: "POST" });
      setReceived((prev) => prev.filter((r) => r._id !== request._id));
      toast.info("Request declined");
    } catch (e) {
      toast.error((e as ApiError).message || "Could not decline the request.");
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(request: FriendRequestItem) {
    setBusyId(request._id);
    try {
      await api(`/friends/request/${request._id}`, { method: "DELETE" });
      setSent((prev) => prev.filter((r) => r._id !== request._id));
      toast.info("Request cancelled");
    } catch (e) {
      toast.error((e as ApiError).message || "Could not cancel the request.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeFriend(person: User) {
    setBusyId(person._id);
    try {
      await api(`/friends/friend/${person._id}`, { method: "DELETE" });
      setFriends((prev) => prev.filter((f) => f._id !== person._id));
      toast.success(`${person.name} removed from friends`);
    } catch (e) {
      toast.error((e as ApiError).message || "Could not remove this friend.");
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  }

  async function blockUser(person: User) {
    setBusyId(person._id);
    try {
      await api(`/friends/block/${person._id}`, { method: "POST" });
      toast.success(`${person.name} blocked`);
      await loadAll();
    } catch (e) {
      toast.error((e as ApiError).message || "Could not block this user.");
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  }

  async function unblockUser(person: User) {
    setBusyId(person._id);
    try {
      await api(`/friends/block/${person._id}`, { method: "DELETE" });
      setBlocked((prev) => prev.filter((b) => b._id !== person._id));
      toast.success(`${person.name} unblocked`);
    } catch (e) {
      toast.error((e as ApiError).message || "Could not unblock this user.");
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  }

  async function openChat(person: User) {
    try {
      const chat = await api<{ _id: string }>("/chats", { method: "POST", body: { members: [meId, person._id] } });
      navigate(`/chats?chat=${chat._id}`);
    } catch (e) {
      toast.error((e as ApiError).message || "Could not open the chat.");
    }
  }

  async function sendRequest(person: User) {
    try {
      await api("/friends/request", { method: "POST", body: { toUserId: person._id } });
      toast.success(`Friend request sent to ${person.name}`);
    } catch (e) {
      toast.error((e as ApiError).message || "Could not send the request.");
    }
  }

  const filteredFriends = friends.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Box sx={{ height: "100%", overflowY: "auto", px: { xs: 2, sm: 3 }, py: 2.5 }}>
      <Typography variant="h5">Friends</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        You only become friends when both people agree. Friends can message you privately.
      </Typography>

      <Card sx={{ mb: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, value: TabKey) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 1, minHeight: 46 }}
        >
          <Tab
            value="received"
            label={
              <Badge color="error" badgeContent={received.length} max={9} sx={{ pr: received.length ? 1.5 : 0 }}>
                Requests
              </Badge>
            }
          />
          <Tab value="sent" label="Sent" />
          <Tab value="friends" label={`Friends${friends.length ? ` (${friends.length})` : ""}`} />
          <Tab value="matches" label="Matches" />
          <Tab value="blocked" label="Blocked" />
        </Tabs>
        <Divider />
      </Card>

      {loading ? (
        <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {tab === "received" && (
            <Stack spacing={1.5}>
              {received.length === 0 && (
                <EmptyState
                  icon={MailOutlineIcon}
                  title="No pending requests"
                  description="When someone asks to be friends, their request appears here."
                />
              )}
              {received.map((request) => {
                const person = request.from;
                if (!person) return null;
                return (
                  <Card key={request._id} sx={{ p: 2 }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <UserAvatar src={person.avatarUrl} name={person.name} size={52} online={person.isOnline} showPresence />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 650 }} noWrap>
                          {person.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                          {[person.age ? `${person.age}` : null, person.distanceLabel, presenceLabel(person.isOnline, person.lastActiveAt)]
                            .filter(Boolean)
                            .join(" · ")}
                        </Typography>
                        {request.message && (
                          <Typography variant="body2" sx={{ mt: 0.5, fontStyle: "italic" }} noWrap>
                            “{request.message}”
                          </Typography>
                        )}
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Button
                          variant="contained"
                          startIcon={<CheckIcon />}
                          onClick={() => accept(request)}
                          disabled={busyId === request._id}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="outlined"
                          color="inherit"
                          startIcon={<CloseIcon />}
                          onClick={() => reject(request)}
                          disabled={busyId === request._id}
                        >
                          Decline
                        </Button>
                      </Stack>
                    </Stack>
                  </Card>
                );
              })}
            </Stack>
          )}

          {tab === "sent" && (
            <Stack spacing={1.5}>
              {sent.length === 0 && (
                <EmptyState
                  icon={MailOutlineIcon}
                  title="No sent requests"
                  description="Requests you send from Discover or a profile show up here."
                />
              )}
              {sent.map((request) => {
                const person = request.to;
                if (!person) return null;
                return (
                  <Card key={request._id} sx={{ p: 2 }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <UserAvatar src={person.avatarUrl} name={person.name} size={46} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 600 }} noWrap>
                          {person.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {request.status === "rejected" ? "Declined" : "Waiting for a response"} ·{" "}
                          {formatRelative(request.createdAt)}
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        color="inherit"
                        onClick={() => cancel(request)}
                        disabled={busyId === request._id || request.status === "rejected"}
                      >
                        Cancel
                      </Button>
                    </Stack>
                  </Card>
                );
              })}
            </Stack>
          )}

          {tab === "friends" && (
            <>
              <TextField
                placeholder="Search friends"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                size="small"
                sx={{ mb: 2, maxWidth: 340 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
              {filteredFriends.length === 0 ? (
                <EmptyState
                  icon={GroupOutlinedIcon}
                  title="No friends yet"
                  description="Use Discover to meet people nearby, or accept a pending request."
                  actionLabel="Open Discover"
                  onAction={() => navigate("/discover")}
                />
              ) : (
                <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" } }}>
                  {filteredFriends.map((friend) => (
                    <Card key={friend._id} sx={{ p: 2 }}>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <UserAvatar src={friend.avatarUrl} name={friend.name} size={46} online={friend.isOnline} showPresence />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 600 }} noWrap>
                            {friend.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap display="block">
                            {presenceLabel(friend.isOnline, friend.lastActiveAt)}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.5}>
                          <Tooltip title="Message">
                            <IconButton onClick={() => openChat(friend)} aria-label={`Message ${friend.name}`}>
                              <ChatBubbleOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Remove friend">
                            <IconButton
                              onClick={() => setConfirm({ kind: "remove", user: friend })}
                              aria-label={`Remove ${friend.name}`}
                            >
                              <PersonRemoveAlt1Icon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Block">
                            <IconButton
                              onClick={() => setConfirm({ kind: "block", user: friend })}
                              color="error"
                              aria-label={`Block ${friend.name}`}
                            >
                              <BlockIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Stack>
                    </Card>
                  ))}
                </Box>
              )}
            </>
          )}

          {tab === "matches" && (
            <Stack spacing={1.5}>
              {matches.length === 0 && (
                <EmptyState
                  icon={FavoriteIcon}
                  title="No matches yet"
                  description="When you and someone else like each other in Discover, the match shows up here."
                  actionLabel="Open Discover"
                  onAction={() => navigate("/discover")}
                />
              )}
              {matches.map((item) => (
                <Card key={item._id} sx={{ p: 2 }}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <UserAvatar src={item.user.avatarUrl} name={item.user.name} size={46} online={item.user.isOnline} showPresence />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }} noWrap>
                        {item.user.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Matched {formatRelative(item.createdAt)}
                      </Typography>
                    </Box>
                    <Chip label="Mutual like" color="secondary" size="small" icon={<FavoriteIcon />} />
                    <Button size="small" variant="outlined" onClick={() => sendRequest(item.user)}>
                      Add friend
                    </Button>
                  </Stack>
                </Card>
              ))}
            </Stack>
          )}

          {tab === "blocked" && (
            <Stack spacing={1.5}>
              {blocked.length === 0 && (
                <EmptyState
                  icon={BlockIcon}
                  title="Nobody is blocked"
                  description="Blocked people cannot message you, see your profile or find you in Discover."
                />
              )}
              {blocked.map((person) => (
                <Card key={person._id} sx={{ p: 2 }}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <UserAvatar src={person.avatarUrl} name={person.name} size={46} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }} noWrap>
                        {person.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Blocked
                      </Typography>
                    </Box>
                    <Button size="small" onClick={() => setConfirm({ kind: "unblock", user: person })}>
                      Unblock
                    </Button>
                  </Stack>
                </Card>
              ))}
            </Stack>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={
          confirm?.kind === "remove"
            ? `Remove ${confirm?.user.name}?`
            : confirm?.kind === "block"
            ? `Block ${confirm?.user.name}?`
            : `Unblock ${confirm?.user.name}?`
        }
        description={
          confirm?.kind === "remove"
            ? "You will no longer be friends. They keep their copy of your conversations."
            : confirm?.kind === "block"
            ? "This removes the friendship and hides both profiles from each other."
            : "They will be able to find and message you again."
        }
        confirmLabel={confirm?.kind === "remove" ? "Remove" : confirm?.kind === "block" ? "Block" : "Unblock"}
        danger={confirm?.kind !== "unblock"}
        loading={!!busyId}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "remove") void removeFriend(confirm.user);
          else if (confirm.kind === "block") void blockUser(confirm.user);
          else void unblockUser(confirm.user);
        }}
      />
    </Box>
  );
}
