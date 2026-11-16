import React from "react";
import {
  Box,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  InputBase,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CallOutlinedIcon from "@mui/icons-material/CallOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import SearchIcon from "@mui/icons-material/Search";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import MoodIcon from "@mui/icons-material/Mood";
import SendIcon from "@mui/icons-material/Send";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CloseIcon from "@mui/icons-material/Close";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import ChatContainer from "./ChatContainer";
import AttachmentPopover from "./AttachmentPopover";
import ChatInfoDialog from "./ChatInfoDialog";
import ChatSearchDialog from "./ChatSearchDialog";
import ForwardDialog from "./ForwardDialog";
import CallDialog from "./CallDialog";
import { useCall } from "./useCall";
import UserAvatar from "../../../components/Avatar";
import EmptyState from "../../../components/EmptyState";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { useToast } from "../../../context/ToastContext";
import { ApiError, api, uploadFile, UploadResult } from "../../../lib/api";
import { getSocket } from "../../../lib/socket";
import { chatDisplayName, chatPartner, presenceLabel, senderId, senderName } from "../../../lib/format";
import type { Chat, Message } from "../../../lib/types";

interface RightPanelProps {
  chat: Chat | null;
  meId: string;
  onBack?: () => void;
  onChatUpdated?: (chat: Chat) => void;
}

interface MessagesResponse {
  messages: Message[];
  hasMore: boolean;
  nextBefore: string | null;
}

export default function RightPanel({ chat, meId, onBack, onChatUpdated }: RightPanelProps) {
  const toast = useToast();

  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [nextBefore, setNextBefore] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<Message | null>(null);
  const [editing, setEditing] = React.useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = React.useState<Record<string, string>>({});
  const [partnerOnline, setPartnerOnline] = React.useState(false);
  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [forwardMessage, setForwardMessage] = React.useState<Message | null>(null);
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Message | null>(null);
  const [recording, setRecording] = React.useState(false);
  const [recordSeconds, setRecordSeconds] = React.useState(0);

  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const typingTimer = React.useRef<number | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const recordTimerRef = React.useRef<number | null>(null);
  const recordStartRef = React.useRef<number>(0);

  const partner = chat ? chatPartner(chat, meId) : undefined;
  const socket = getSocket();
  const call = useCall(socket, chat?._id);

  React.useEffect(() => {
    setPartnerOnline(!!partner?.online);
  }, [partner?._id, partner?.online]);

  /* ------------------------------- data load ------------------------------- */

  const loadMessages = React.useCallback(async () => {
    if (!chat?._id) {
      setMessages([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api<MessagesResponse>(`/chats/${chat._id}/messages`, { query: { limit: 30 } });
      setMessages(data.messages || []);
      setHasMore(!!data.hasMore);
      setNextBefore(data.nextBefore || null);
      if ((data.messages || []).length) {
        await api(`/chats/${chat._id}/read`, { method: "POST" }).catch(() => undefined);
      }
    } catch (e) {
      toast.error((e as ApiError).message || "Could not load this conversation.");
      setMessages([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat?._id]);

  React.useEffect(() => {
    void loadMessages();
    setReplyTo(null);
    setEditing(null);
    setText("");
    setTypingUsers({});
  }, [loadMessages]);

  const loadMore = React.useCallback(async () => {
    if (!chat?._id || !nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await api<MessagesResponse>(`/chats/${chat._id}/messages`, {
        query: { limit: 30, before: nextBefore },
      });
      setMessages((prev) => [...(data.messages || []), ...prev]);
      setHasMore(!!data.hasMore);
      setNextBefore(data.nextBefore || null);
    } catch (e) {
      toast.error((e as ApiError).message || "Could not load older messages.");
    } finally {
      setLoadingMore(false);
    }
  }, [chat?._id, nextBefore, loadingMore, toast]);

  /* -------------------------------- socket -------------------------------- */

  React.useEffect(() => {
    if (!chat?._id) return undefined;
    const s = getSocket();
    if (!s) return undefined;

    s.emit("chat:join", chat._id);

    const onCreated = (message: Message) => {
      if (String(message.chat) !== String(chat._id)) return;
      setMessages((prev) => (prev.some((m) => m._id === message._id) ? prev : [...prev, message]));
      if (senderId(message.sender) !== meId) {
        if (document.visibilityState === "visible") {
          s.emit("message:read", { chatId: chat._id });
        }
      }
    };

    const onUpdated = (message: Message) => {
      if (String(message.chat) !== String(chat._id)) return;
      setMessages((prev) => prev.map((m) => (m._id === message._id ? { ...m, ...message } : m)));
    };

    const onRead = ({ chatId, userId }: { chatId: string; userId: string }) => {
      if (String(chatId) !== String(chat._id)) return;
      setMessages((prev) =>
        prev.map((m) =>
          String(senderId(m.sender)) === meId
            ? { ...m, readBy: [...new Set([...(m.readBy || []), userId])] }
            : m
        )
      );
    };

    const onTyping = ({ chatId, userId, typing }: { chatId: string; userId: string; typing: boolean }) => {
      if (String(chatId) !== String(chat._id) || String(userId) === meId) return;
      const name = chat.members.find((m) => String(m._id) === String(userId))?.name || "Someone";
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (typing) next[userId] = name;
        else delete next[userId];
        return next;
      });
    };

    const onPresence = ({ userId, online }: { userId: string; online: boolean }) => {
      if (partner && String(userId) === String(partner._id)) setPartnerOnline(online);
    };

    s.on("message:created", onCreated);
    s.on("message:updated", onUpdated);
    s.on("chat:read", onRead);
    s.on("typing", onTyping);
    s.on("presence:changed", onPresence);

    return () => {
      s.emit("chat:leave", chat._id);
      s.off("message:created", onCreated);
      s.off("message:updated", onUpdated);
      s.off("chat:read", onRead);
      s.off("typing", onTyping);
      s.off("presence:changed", onPresence);
    };
  }, [chat?._id, chat?.members, meId, partner]);

  // Mark the conversation read when the tab becomes visible again.
  React.useEffect(() => {
    if (!chat?._id) return undefined;
    const handler = () => {
      if (document.visibilityState === "visible") {
        void api(`/chats/${chat._id}/read`, { method: "POST" }).catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [chat?._id]);

  /* -------------------------------- sending ------------------------------- */

  const emitTyping = (typing: boolean) => {
    if (!chat?._id) return;
    getSocket()?.emit("typing", { chatId: chat._id, typing });
  };

  const handleTextChange = (value: string) => {
    setText(value);
    emitTyping(true);
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => emitTyping(false), 1500);
  };

  async function send() {
    if (!chat || sending) return;
    const content = text.trim();
    if (!content) return;
    setSending(true);
    emitTyping(false);
    try {
      if (editing) {
        const updated = await api<Message>(`/messages/${editing._id}`, { method: "PUT", body: { content } });
        setMessages((prev) => prev.map((m) => (m._id === updated._id ? updated : m)));
        setEditing(null);
      } else {
        const created = await api<Message>("/messages", {
          method: "POST",
          body: {
            chat: chat._id,
            content,
            type: "text",
            replyTo: replyTo?._id,
          },
        });
        setMessages((prev) => (prev.some((m) => m._id === created._id) ? prev : [...prev, created]));
        setReplyTo(null);
      }
      setText("");
    } catch (e) {
      toast.error((e as ApiError).message || "Message could not be sent.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function sendAttachment(upload: UploadResult) {
    if (!chat) return;
    try {
      const type = upload.kind === "image" ? "image" : upload.kind === "video" ? "video" : upload.kind === "audio" ? "audio" : "file";
      const created = await api<Message>("/messages", {
        method: "POST",
        body: {
          chat: chat._id,
          content: "",
          type,
          replyTo: replyTo?._id,
          media: {
            mediaId: upload._id,
            url: upload.url,
            name: upload.name,
            mime: upload.mime,
            size: upload.size,
            duration: upload.duration,
          },
        },
      });
      setMessages((prev) => (prev.some((m) => m._id === created._id) ? prev : [...prev, created]));
      setReplyTo(null);
    } catch (e) {
      toast.error((e as ApiError).message || "Could not send that attachment.");
    }
  }

  async function react(message: Message, emoji: string) {
    try {
      const updated = await api<Message>(`/messages/${message._id}/reactions`, {
        method: "POST",
        body: { emoji },
      });
      setMessages((prev) => prev.map((m) => (m._id === updated._id ? updated : m)));
    } catch (e) {
      toast.error((e as ApiError).message || "Could not react.");
    }
  }

  async function remove(message: Message) {
    try {
      await api(`/messages/${message._id}`, { method: "DELETE" });
      setMessages((prev) =>
        prev.map((m) =>
          m._id === message._id ? { ...m, deletedAt: new Date().toISOString(), content: "", media: undefined, reactions: [] } : m
        )
      );
      toast.success("Message deleted");
    } catch (e) {
      toast.error((e as ApiError).message || "Could not delete the message.");
    } finally {
      setDeleteTarget(null);
    }
  }

  /* -------------------------------- recording ------------------------------ */

  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Recording is not supported in this browser");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recordStartRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const duration = Math.round((Date.now() - recordStartRef.current) / 1000);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setRecording(false);
        if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
        setRecordSeconds(0);
        if (blob.size < 800) return;
        try {
          const uploaded = await uploadFile(blob, {
            chatId: chat?._id,
            kind: "audio",
            name: `voice-${Date.now()}.webm`,
            duration,
          });
          await sendAttachment({ ...uploaded, duration });
        } catch (e) {
          toast.error((e as ApiError).message || "Could not send the voice message.");
        }
      };
      recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (e) {
      toast.error((e as Error).message || "Microphone access was blocked.");
    }
  }

  function stopRecording(cancel = false) {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (cancel) {
      chunksRef.current = [];
      recorder.onstop = null;
      recorder.stream.getTracks().forEach((t) => t.stop());
      recorder.stop();
      setRecording(false);
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      setRecordSeconds(0);
      return;
    }
    recorder.stop();
  }

  React.useEffect(
    () => () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    },
    []
  );

  /* --------------------------------- render -------------------------------- */

  if (!chat) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: (t) => (t.palette.mode === "light" ? "#eef4f1" : "#081512"),
        }}
      >
        <EmptyState
          icon={ChatBubbleOutlineIcon}
          title="Your conversations live here"
          description="Pick a chat on the left, or find someone new in Discover to start talking."
        />
      </Box>
    );
  }

  const typingNames = Object.values(typingUsers);
  const typingLabel = typingNames.length
    ? chat.isGroup
      ? `${typingNames.slice(0, 2).join(", ")} ${typingNames.length > 1 ? "are" : "is"} typing…`
      : "typing…"
    : null;

  const subtitle = typingLabel
    ? typingLabel
    : chat.isGroup
    ? `${chat.members.length} members`
    : presenceLabel(partnerOnline, partner?.lastActiveAt);

  return (
    <Box height="100%" width="100%" display="flex" flexDirection="column" sx={{ minHeight: 0, bgcolor: "background.default" }}>
      {/* Header */}
      <Box
        sx={{
          px: { xs: 1, sm: 2 },
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexShrink: 0,
          minHeight: 64,
        }}
      >
        {onBack && (
          <IconButton onClick={onBack} aria-label="Back to chats" sx={{ display: { xs: "inline-flex", md: "none" } }}>
            <ArrowBackIcon />
          </IconButton>
        )}
        <Box sx={{ cursor: "pointer" }} onClick={() => setInfoOpen(true)}>
          <UserAvatar
            src={chat.isGroup ? chat.avatarUrl : partner?.avatarUrl}
            name={chatDisplayName(chat, meId)}
            size={42}
            online={!chat.isGroup && partnerOnline}
            showPresence={!chat.isGroup}
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setInfoOpen(true)}>
          <Typography variant="body1" sx={{ fontWeight: 700 }} noWrap>
            {chatDisplayName(chat, meId)}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: typingLabel || (!chat.isGroup && partnerOnline) ? "primary.main" : "text.secondary" }}
            noWrap
          >
            {subtitle}
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.25} alignItems="center">
          {!chat.isGroup && partner && (
            <>
              <Tooltip title="Voice call">
                <IconButton
                  onClick={() => call.startCall({ _id: String(partner._id), name: partner.name || "Friend", avatarUrl: partner.avatarUrl }, "audio")}
                  aria-label="Start voice call"
                >
                  <CallOutlinedIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Video call">
                <IconButton
                  onClick={() => call.startCall({ _id: String(partner._id), name: partner.name || "Friend", avatarUrl: partner.avatarUrl }, "video")}
                  aria-label="Start video call"
                >
                  <VideocamOutlinedIcon />
                </IconButton>
              </Tooltip>
            </>
          )}
          <Tooltip title="Search in conversation">
            <IconButton onClick={() => setSearchOpen(true)} aria-label="Search conversation">
              <SearchIcon />
            </IconButton>
          </Tooltip>
          <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="Conversation options">
            <MoreVertIcon />
          </IconButton>
        </Stack>
      </Box>

      {/* Messages */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          background: (t) =>
            t.palette.mode === "light"
              ? "radial-gradient(circle at 15% 15%, rgba(15,157,118,0.07), transparent 45%), radial-gradient(circle at 85% 80%, rgba(124,108,246,0.07), transparent 45%), #eef4f1"
              : "radial-gradient(circle at 15% 15%, rgba(46,230,168,0.06), transparent 45%), radial-gradient(circle at 85% 80%, rgba(169,155,255,0.06), transparent 45%), #081512",
        }}
      >
        <ChatContainer
          messages={messages}
          currentUserId={meId}
          isGroup={chat.isGroup}
          loading={loading}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          typingLabel={typingLabel}
          emptyHint={chat.isGroup ? "Send the first message to your group." : "Say hello 👋"}
          onReply={(message) => {
            setReplyTo(message);
            setEditing(null);
            inputRef.current?.focus();
          }}
          onEdit={(message) => {
            setEditing(message);
            setText(message.content);
            setReplyTo(null);
            inputRef.current?.focus();
          }}
          onDelete={(message) => setDeleteTarget(message)}
          onReact={react}
          onForward={(message) => setForwardMessage(message)}
        />
      </Box>

      {/* Composer */}
      <Box
        sx={{
          borderTop: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          px: { xs: 1, sm: 1.5 },
          py: 1,
          flexShrink: 0,
          pb: "calc(8px + env(safe-area-inset-bottom))",
        }}
      >
        {(replyTo || editing) && (
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ px: 1, py: 0.75, mb: 1, borderRadius: 2, bgcolor: "action.hover" }}
          >
            {editing ? <EditOutlinedIcon fontSize="small" /> : <ChatBubbleOutlineIcon fontSize="small" />}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: "primary.main", display: "block" }}>
                {editing ? "Editing message" : `Replying to ${senderName(replyTo?.sender)}`}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {editing ? editing.content : replyTo?.content || (replyTo?.media?.name ?? "Attachment")}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={() => {
                setReplyTo(null);
                setEditing(null);
                if (editing) setText("");
              }}
              aria-label="Cancel reply"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        )}

        {recording ? (
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 1, py: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "error.main", animation: "pulse 1s infinite" }} />
            <Typography variant="body2" sx={{ flex: 1 }}>
              Recording… {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, "0")}
            </Typography>
            <Tooltip title="Cancel">
              <IconButton onClick={() => stopRecording(true)} aria-label="Cancel recording">
                <DeleteOutlineIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Send voice message">
              <IconButton color="primary" onClick={() => stopRecording(false)} aria-label="Stop and send recording">
                <StopIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        ) : (
          <Stack direction="row" alignItems="flex-end" spacing={0.5}>
            <Tooltip title="Emoji">
              <IconButton onClick={() => setEmojiOpen((v) => !v)} aria-label="Insert emoji">
                <MoodIcon />
              </IconButton>
            </Tooltip>
            <AttachmentPopover chatId={chat._id} onUploaded={sendAttachment} />

            <InputBase
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={chat.isGroup ? "Message group" : "Message"}
              inputRef={inputRef}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
                if (e.key === "Escape") {
                  setReplyTo(null);
                  setEditing(null);
                }
              }}
              multiline
              maxRows={5}
              sx={{
                flex: 1,
                bgcolor: "action.hover",
                borderRadius: 3.5,
                px: 1.75,
                py: 0.9,
                fontSize: 14.5,
                minHeight: 42,
              }}
              endAdornment={
                sending ? (
                  <InputAdornment position="end">
                    <CircularProgress size={14} sx={{ mr: 1 }} />
                  </InputAdornment>
                ) : undefined
              }
            />

            {text.trim() ? (
              <IconButton
                onClick={() => void send()}
                color="primary"
                aria-label="Send message"
                sx={{ bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.dark" } }}
              >
                <SendIcon fontSize="small" />
              </IconButton>
            ) : (
              <Tooltip title="Hold to record a voice message">
                <IconButton onClick={startRecording} aria-label="Record voice message">
                  <MicIcon />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        )}

        {emojiOpen && (
          <Box sx={{ mt: 1 }}>
            <EmojiPicker
              height={320}
              width="100%"
              previewConfig={{ showPreview: false }}
              lazyLoadEmojis
              onEmojiClick={(emoji: EmojiClickData) => {
                setText((prev) => prev + emoji.emoji);
                setEmojiOpen(false);
              }}
            />
          </Box>
        )}
      </Box>

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={async () => {
            setMenuAnchor(null);
            try {
              const updated = await api<Chat>(`/chats/${chat._id}`, {
                method: "PUT",
                body: { muted: !chat.muted },
              });
              onChatUpdated?.(updated);
              toast.success(chat.muted ? "Notifications unmuted" : "Notifications muted");
            } catch (e) {
              toast.error((e as ApiError).message || "Could not update notifications.");
            }
          }}
        >
          {chat.muted ? "Unmute notifications" : "Mute notifications"}
        </MenuItem>
        <MenuItem
          onClick={async () => {
            setMenuAnchor(null);
            try {
              const updated = await api<Chat>(`/chats/${chat._id}`, {
                method: "PUT",
                body: { pinned: !chat.pinned },
              });
              onChatUpdated?.(updated);
              toast.success(chat.pinned ? "Chat unpinned" : "Chat pinned");
            } catch (e) {
              toast.error((e as ApiError).message || "Could not pin the chat.");
            }
          }}
        >
          {chat.pinned ? "Unpin chat" : "Pin chat"}
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { setMenuAnchor(null); setInfoOpen(true); }}>
          {chat.isGroup ? "Group info" : "Contact info"}
        </MenuItem>
        <MenuItem onClick={() => { setMenuAnchor(null); setSearchOpen(true); }}>Search in chat</MenuItem>
      </Menu>

      <ChatInfoDialog
        open={infoOpen}
        chat={chat}
        onClose={() => setInfoOpen(false)}
        onChatUpdated={(updated) => onChatUpdated?.(updated)}
        onLeft={() => onBack?.()}
      />
      <ChatSearchDialog open={searchOpen} chatId={chat._id} onClose={() => setSearchOpen(false)} />
      <ForwardDialog open={!!forwardMessage} message={forwardMessage} onClose={() => setForwardMessage(null)} />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete message?"
        description="This removes the message for everyone in the conversation."
        confirmLabel="Delete"
        danger
        onConfirm={() => deleteTarget && remove(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
      />

      <CallDialog
        open={!!call.call}
        call={call.call}
        localVideoRef={call.localVideoRef}
        remoteVideoRef={call.remoteVideoRef}
        localStreamRef={call.localStreamRef}
        remoteStreamRef={call.remoteStreamRef}
        muted={call.muted}
        cameraOff={call.cameraOff}
        elapsed={call.elapsed}
        onToggleMute={call.toggleMute}
        onToggleCamera={call.toggleCamera}
        onAccept={call.acceptCall}
        onReject={call.rejectCall}
        onEnd={call.endCall}
      />
    </Box>
  );
}
