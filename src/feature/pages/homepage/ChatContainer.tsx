import React from "react";
import { Box, Button, Chip, Dialog, IconButton, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import OwnMessageCard from "../../../foundation/ChatCard/OwnMessageCard";
import ReplyMessageCard from "../../../foundation/ChatCard/ReplyCard";
import { MessageActions } from "../../../foundation/ChatCard/MessageBubble";
import EmptyState from "../../../components/EmptyState";
import { mediaUrl } from "../../../lib/api";
import { formatDayLabel, isSameDay, senderId } from "../../../lib/format";
import type { Message } from "../../../lib/types";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { MessageListSkeleton } from "../../../components/Skeletons";

interface ChatContainerProps extends MessageActions {
  messages: Message[];
  currentUserId: string;
  isGroup?: boolean;
  loading?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  emptyHint?: string;
  typingLabel?: string | null;
}

export default function ChatContainer({
  messages,
  currentUserId,
  isGroup = false,
  loading = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  emptyHint,
  typingLabel,
  ...actions
}: ChatContainerProps) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  const lastCountRef = React.useRef(0);
  const previousHeightRef = React.useRef(0);
  const [lightbox, setLightbox] = React.useState<Message | null>(null);
  const [showJump, setShowJump] = React.useState(false);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  // New messages append → keep the view pinned if the user is already near the bottom.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = messages.length > lastCountRef.current;
    lastCountRef.current = messages.length;
    if (!grew) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 220;
    if (nearBottom) scrollToBottom("smooth");
    else setShowJump(true);
  }, [messages.length, scrollToBottom]);

  // Loading older messages prepends → preserve the scroll anchor.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (loadingMore) {
      previousHeightRef.current = el.scrollHeight;
      return;
    }
    if (previousHeightRef.current) {
      el.scrollTop += el.scrollHeight - previousHeightRef.current;
      previousHeightRef.current = 0;
    }
  }, [loadingMore]);

  const firstMessageId = messages[0]?._id || "";
  const messageCountRef = React.useRef(messages.length);
  messageCountRef.current = messages.length;

  React.useEffect(() => {
    // Reset the anchor whenever the conversation changes.
    lastCountRef.current = messageCountRef.current;
    setShowJump(false);
    scrollToBottom("auto");
  }, [firstMessageId, scrollToBottom]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 220) setShowJump(false);
    if (el.scrollTop < 80 && hasMore && !loadingMore) onLoadMore?.();
  };

  let lastDay: Date | null = null;

  return (
    <Box sx={{ position: "relative", height: "100%", width: "100%" }}>
      <Box
        ref={scrollRef}
        onScroll={handleScroll}
        sx={{
          height: "100%",
          width: "100%",
          overflowY: "auto",
          overflowX: "hidden",
          px: { xs: 1, sm: 2 },
          py: { xs: 1.25, sm: 2 },
          display: "flex",
          flexDirection: "column",
          gap: { xs: 0.75, sm: 1 },
        }}
      >
        {hasMore && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
            <Button size="small" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load earlier messages"}
            </Button>
          </Box>
        )}

        {loading && messages.length === 0 && <MessageListSkeleton />}

        {!loading && messages.length === 0 && (
          <Box sx={{ my: "auto" }}>
            <EmptyState
              icon={ChatBubbleOutlineIcon}
              title="No messages yet"
              description={emptyHint || "Say hello — your first message starts the conversation."}
            />
          </Box>
        )}

        {messages.map((message, index) => {
          const created = new Date(message.createdAt);
          const newDay = !lastDay || !isSameDay(lastDay, created);
          if (newDay) lastDay = created;
          const own = senderId(message.sender) === String(currentUserId);
          const previous = messages[index - 1];
          const sameSenderAsPrevious =
            !!previous && senderId(previous.sender) === senderId(message.sender) && !newDay;

          return (
            <React.Fragment key={message._id || index}>
              {newDay && (
                <Box sx={{ display: "flex", justifyContent: "center", my: 1 }}>
                  <Chip
                    label={formatDayLabel(created)}
                    size="small"
                    sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", fontSize: 11 }}
                  />
                </Box>
              )}
              {own ? (
                <OwnMessageCard message={message} currentUserId={currentUserId} {...actions} />
              ) : (
                <ReplyMessageCard
                  message={message}
                  currentUserId={currentUserId}
                  showSender={isGroup && !sameSenderAsPrevious}
                  {...actions}
                />
              )}
            </React.Fragment>
          );
        })}

        {typingLabel && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, py: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {typingLabel}
            </Typography>
            <Stack direction="row" spacing={0.4}>
              {[0, 1, 2].map((i) => (
                <Box
                  key={i}
                  sx={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    bgcolor: "text.secondary",
                    animation: "typing 1.2s infinite ease-in-out",
                    animationDelay: `${i * 0.15}s`,
                    "@keyframes typing": {
                      "0%, 60%, 100%": { opacity: 0.25, transform: "translateY(0)" },
                      "30%": { opacity: 1, transform: "translateY(-2px)" },
                    },
                  }}
                />
              ))}
            </Stack>
          </Stack>
        )}

        <Box ref={bottomRef} sx={{ height: 1 }} />
      </Box>

      {showJump && (
        <IconButton
          onClick={() => {
            scrollToBottom();
            setShowJump(false);
          }}
          sx={{
            position: "absolute",
            bottom: 16,
            right: 16,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            boxShadow: 3,
          }}
          aria-label="Jump to latest message"
        >
          <ArrowDownwardIcon fontSize="small" />
        </IconButton>
      )}

      <Dialog open={!!lightbox} onClose={() => setLightbox(null)} maxWidth="md" fullWidth>
        <Box sx={{ position: "relative", bgcolor: "black" }}>
          <IconButton
            onClick={() => setLightbox(null)}
            sx={{ position: "absolute", top: 8, right: 8, color: "#fff", bgcolor: "rgba(0,0,0,0.4)" }}
            aria-label="Close image"
          >
            <CloseIcon />
          </IconButton>
          {lightbox?.media?.url && (
            <Box
              component="img"
              src={mediaUrl(lightbox.media.url)}
              alt={lightbox.media.name || "Shared image"}
              sx={{ width: "100%", maxHeight: "80vh", objectFit: "contain", display: "block" }}
            />
          )}
        </Box>
      </Dialog>
    </Box>
  );
}
