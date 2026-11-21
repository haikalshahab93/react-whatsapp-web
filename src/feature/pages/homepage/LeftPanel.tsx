import React from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  ListItemButton,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import GroupAddOutlinedIcon from "@mui/icons-material/GroupAddOutlined";
import PushPinIcon from "@mui/icons-material/PushPin";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import { useNavigate } from "react-router-dom";
import UserAvatar from "../../../components/Avatar";
import EmptyState from "../../../components/EmptyState";
import { ChatListSkeleton } from "../../../components/Skeletons";
import GroupDialog from "./GroupDialog";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { ApiError, api } from "../../../lib/api";
import { getSocket } from "../../../lib/socket";
import { formatListTime, messagePreview, senderId } from "../../../lib/format";
import { chatDisplayName, chatPartner, presenceLabel } from "../../../lib/format";
import type { Chat, User } from "../../../lib/types";

interface LeftPanelProps {
  onSelectChat?: (chat: Chat) => void;
  selectedChatId?: string;
}

type Tab = "all" | "unread" | "groups";

type MessageHit = {
  _id: string;
  content?: string;
  createdAt?: string;
  chat?: { _id: string; name?: string; isGroup?: boolean } | string;
};

export default function LeftPanel({ onSelectChat, selectedChatId }: LeftPanelProps) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const meId = String(user?._id || user?.id || "");

  const [chats, setChats] = React.useState<Chat[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>("all");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<User[]>([]);
  const [messageHits, setMessageHits] = React.useState<MessageHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [groupOpen, setGroupOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const data = await api<Chat[]>("/chats");
      setChats(data || []);
    } catch (e) {
      setError((e as ApiError).message || "Could not load your chats.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const upsert = (incoming: Chat) => {
      setChats((prev) => {
        const rest = prev.filter((c) => c._id !== incoming._id);
        return [incoming, ...rest].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
    };

    const onUpdated = (incoming: Chat) => {
      if (!incoming || !incoming._id) return;
      upsert(incoming);
    };

    const onRemoved = ({ chatId }: { chatId: string }) => {
      setChats((prev) => prev.filter((c) => c._id !== chatId));
    };

    const onPresence = ({ userId, online }: { userId: string; online: boolean }) => {
      setChats((prev) =>
        prev.map((chat) => ({
          ...chat,
          members: chat.members.map((m) => (String(m._id) === String(userId) ? { ...m, online } : m)),
        }))
      );
    };

    const onRead = ({ chatId }: { chatId: string }) => {
      setChats((prev) =>
        prev.map((chat) => (String(chat._id) === String(chatId) ? { ...chat, unreadCount: 0 } : chat))
      );
    };

    socket.on("chat:updated", onUpdated);
    socket.on("chat:created", onUpdated);
    socket.on("chat:removed", onRemoved);
    socket.on("presence:changed", onPresence);
    socket.on("chat:read", onRead);
    return () => {
      socket.off("chat:updated", onUpdated);
      socket.off("chat:created", onUpdated);
      socket.off("chat:removed", onRemoved);
      socket.off("presence:changed", onPresence);
      socket.off("chat:read", onRead);
    };
  }, []);

  // Opening a conversation clears its badge immediately, before the server round-trip.
  React.useEffect(() => {
    if (!selectedChatId) return;
    setChats((prev) =>
      prev.map((chat) => (String(chat._id) === String(selectedChatId) ? { ...chat, unreadCount: 0 } : chat))
    );
  }, [selectedChatId]);

  // Debounced search across people and every message the user can see.
  React.useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setMessageHits([]);
      setSearching(false);
      return undefined;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const [people, messages] = await Promise.allSettled([
        api<User[]>("/users/suggest", { query: { q: term, limit: 8 }, signal: controller.signal }),
        api<{ messages: MessageHit[] }>("/messages/search", {
          query: { q: term, limit: 8 },
          signal: controller.signal,
        }),
      ]);
      const aborted = controller.signal.aborted;
      if (!aborted) {
        setResults(
          people.status === "fulfilled"
            ? (people.value || []).filter((u) => String(u._id) !== meId)
            : []
        );
        setMessageHits(messages.status === "fulfilled" ? messages.value?.messages || [] : []);
        setSearching(false);
      }
    }, 320);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, meId]);

  async function openMessageHit(hit: MessageHit) {
    const chatId = String(hit.chat && typeof hit.chat === "object" ? hit.chat._id : hit.chat || "");
    if (!chatId) return;
    setQuery("");
    setMessageHits([]);
    setResults([]);
    const existing = chats.find((c) => String(c._id) === chatId);
    if (existing) {
      onSelectChat?.(existing);
      return;
    }
    try {
      const chat = await api<Chat>(`/chats/${chatId}`);
      setChats((prev) => [chat, ...prev.filter((c) => c._id !== chat._id)]);
      onSelectChat?.(chat);
    } catch (e) {
      toast.error((e as ApiError).message || "Could not open that conversation.");
    }
  }

  async function startChat(person: User) {
    try {
      const chat = await api<Chat>("/chats", { method: "POST", body: { members: [meId, person._id] } });
      setChats((prev) => [chat, ...prev.filter((c) => c._id !== chat._id)]);
      setQuery("");
      setResults([]);
      onSelectChat?.(chat);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403) {
        toast.info("You need to be friends first. Sending a friend request…");
        try {
          await api("/friends/request", { method: "POST", body: { toUserId: person._id } });
          toast.success(`Friend request sent to ${person.name}`);
        } catch (reqErr) {
          toast.error((reqErr as ApiError).message || "Could not send the friend request.");
        }
      } else {
        toast.error(err.message || "Could not open that chat.");
      }
    }
  }

  const filtered = React.useMemo(() => {
    let list = chats;
    if (tab === "unread") list = list.filter((c) => (c.unreadCount || 0) > 0);
    if (tab === "groups") list = list.filter((c) => c.isGroup);
    const term = query.trim().toLowerCase();
    if (term) {
      list = list.filter((c) => {
        const name = chatDisplayName(c, meId).toLowerCase();
        return name.includes(term) || (c.lastMessage?.content || "").toLowerCase().includes(term);
      });
    }
    return [...list].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [chats, tab, query, meId]);

  const totalUnread = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return (
    <Box height="100%" width="100%" display="flex" flexDirection="column" sx={{ bgcolor: "background.paper", minHeight: 0 }}>
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 750 }}>
              Chats
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {totalUnread > 0 ? `${totalUnread} unread message${totalUnread > 1 ? "s" : ""}` : "You are all caught up"}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="New group">
              <IconButton onClick={() => setGroupOpen(true)} aria-label="Create a group">
                <GroupAddOutlinedIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Friends">
              <IconButton onClick={() => navigate("/friends")} aria-label="Open friends">
                <PersonAddAltIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        <TextField
          placeholder="Search chats, people or messages"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Stack direction="row" spacing={1} sx={{ px: 2, pb: 1.5 }}>
        {(["all", "unread", "groups"] as Tab[]).map((value) => (
          <Chip
            key={value}
            label={value === "all" ? "All" : value === "unread" ? "Unread" : "Groups"}
            onClick={() => setTab(value)}
            color={tab === value ? "primary" : "default"}
            variant={tab === value ? "filled" : "outlined"}
            size="small"
          />
        ))}
      </Stack>

      <Divider />

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {query.trim().length >= 2 && (
          <Box sx={{ px: 1, py: 1 }}>
            {messageHits.length > 0 && (
              <>
                <Typography variant="overline" sx={{ px: 1, color: "text.secondary" }}>
                  Messages
                </Typography>
                {messageHits.map((hit) => (
                  <ListItemButton
                    key={hit._id}
                    onClick={() => openMessageHit(hit)}
                    sx={{ borderRadius: 2.5, mx: 0.5, display: "block" }}
                  >
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                      {hit.content || "(attachment)"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap display="block">
                      {hit.chat && typeof hit.chat === "object" && hit.chat.name
                        ? hit.chat.name
                        : "Conversation"}
                      {hit.createdAt ? ` · ${new Date(hit.createdAt).toLocaleDateString()}` : ""}
                    </Typography>
                  </ListItemButton>
                ))}
                <Divider sx={{ my: 1 }} />
              </>
            )}
            <Typography variant="overline" sx={{ px: 1, color: "text.secondary" }}>
              People
            </Typography>
            {searching && <Skeleton height={56} sx={{ borderRadius: 2, mx: 1 }} />}
            {!searching && results.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 1.5 }}>
                No people match “{query.trim()}”.
              </Typography>
            )}
            {results.map((person) => (
              <ListItemButton
                key={person._id}
                onClick={() => startChat(person)}
                sx={{ borderRadius: 2.5, mx: 0.5 }}
              >
                <UserAvatar src={person.avatarUrl} name={person.name} size={38} online={person.isOnline || person.online} showPresence />
                <Box sx={{ ml: 1.5, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {person.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {person.username ? `@${person.username}` : person.bio || "Start a conversation"}
                  </Typography>
                </Box>
              </ListItemButton>
            ))}
            <Divider sx={{ my: 1 }} />
          </Box>
        )}

        {loading && <ChatListSkeleton />}

        {!loading && error && (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="error" variant="body2" sx={{ mb: 1.5 }}>
              {error}
            </Typography>
            <Button onClick={load} size="small" variant="outlined">
              Try again
            </Button>
          </Box>
        )}

        {!loading && !error && filtered.length === 0 && (
          <EmptyState
            icon={tab === "groups" ? GroupAddOutlinedIcon : CampaignOutlinedIcon}
            title={tab === "unread" ? "No unread chats" : tab === "groups" ? "No groups yet" : "No chats yet"}
            description={
              tab === "groups"
                ? "Create a group to plan things with several friends at once."
                : "Find someone in Discover or accept a friend request to start chatting."
            }
            actionLabel={tab === "groups" ? "Create a group" : "Discover people"}
            onAction={() => (tab === "groups" ? setGroupOpen(true) : navigate("/discover"))}
            compact
          />
        )}

        {!loading &&
          filtered.map((chat) => {
            const name = chatDisplayName(chat, meId);
            const partner = chatPartner(chat, meId);
            const last = chat.lastMessage;
            const lastSenderName =
              last && typeof last.sender === "object" ? (last.sender as User).name || "" : "";
            const preview = last
              ? `${senderId(last.sender) === meId ? "You: " : chat.isGroup && lastSenderName ? `${lastSenderName}: ` : ""}${messagePreview(
                  last
                )}`
              : "Say hello";
            const unread = chat.unreadCount || 0;
            const active = selectedChatId === chat._id;

            return (
              <ListItemButton
                key={chat._id}
                selected={active}
                onClick={() => onSelectChat?.(chat)}
                sx={{
                  py: 1.25,
                  px: 2,
                  borderRadius: 0,
                  alignItems: "flex-start",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  "&.Mui-selected": { bgcolor: "action.selected" },
                }}
              >
                <UserAvatar
                  src={chat.isGroup ? chat.avatarUrl : (partner as { avatarUrl?: string })?.avatarUrl}
                  name={name}
                  size={46}
                  online={!chat.isGroup && (partner as { online?: boolean })?.online}
                  showPresence={!chat.isGroup}
                />
                <Box sx={{ ml: 1.5, flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                      {chat.pinned && <PushPinIcon sx={{ fontSize: 14, color: "text.secondary" }} />}
                      <Typography variant="body2" sx={{ fontWeight: unread ? 750 : 600 }} noWrap>
                        {name}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" color={unread ? "primary.main" : "text.secondary"} sx={{ flexShrink: 0 }}>
                      {formatListTime(last?.createdAt || chat.updatedAt)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mt: 0.25 }}>
                    <Typography
                      variant="caption"
                      color={unread ? "text.primary" : "text.secondary"}
                      noWrap
                      sx={{ fontWeight: unread ? 600 : 400 }}
                    >
                      {preview}
                    </Typography>
                    {unread > 0 && (
                      <Box
                        sx={{
                          minWidth: 20,
                          height: 20,
                          px: 0.75,
                          borderRadius: 10,
                          bgcolor: "primary.main",
                          color: "primary.contrastText",
                          fontSize: 11,
                          fontWeight: 700,
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        {unread > 99 ? "99+" : unread}
                      </Box>
                    )}
                  </Stack>
                  {!chat.isGroup && partner && (
                    <Typography variant="caption" sx={{ color: "text.disabled", fontSize: 10.5 }}>
                      {presenceLabel(partner.online, (partner as User).lastActiveAt)}
                    </Typography>
                  )}
                </Box>
              </ListItemButton>
            );
          })}
      </Box>

      <GroupDialog
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        onCreated={(chat) => {
          setChats((prev) => [chat, ...prev]);
          onSelectChat?.(chat);
          setGroupOpen(false);
        }}
      />
    </Box>
  );
}

