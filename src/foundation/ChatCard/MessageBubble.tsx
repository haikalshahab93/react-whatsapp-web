import React from "react";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import DoneIcon from "@mui/icons-material/Done";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import ReplyIcon from "@mui/icons-material/Reply";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import AddReactionOutlinedIcon from "@mui/icons-material/AddReactionOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { mediaUrl } from "../../lib/api";
import { formatBytes, formatDuration, formatTime, senderId, senderName } from "../../lib/format";
import type { Message } from "../../lib/types";

export interface MessageActions {
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (message: Message) => void;
  onReact?: (message: Message, emoji: string) => void;
  onForward?: (message: Message) => void;
  onOpenMedia?: (message: Message) => void;
}

interface MessageBubbleProps extends MessageActions {
  message: Message;
  isOwn: boolean;
  currentUserId: string;
  showSender?: boolean;
  pending?: boolean;
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export default function MessageBubble({
  message,
  isOwn,
  currentUserId,
  showSender = false,
  pending = false,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onForward,
  onOpenMedia,
}: MessageBubbleProps) {
  const theme = useTheme();
  const [actionsEl, setActionsEl] = React.useState<HTMLElement | null>(null);
  const [reactionEl, setReactionEl] = React.useState<HTMLElement | null>(null);

  const deleted = !!message.deletedAt;
  const reply = message.replyTo && typeof message.replyTo === "object" ? (message.replyTo as Message) : null;
  const reactions = (message.reactions || []).filter((r) => r && r.emoji);
  const reactionCounts = reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {});
  const myReaction = reactions.find((r) => String(r.user) === String(currentUserId))?.emoji;

  const readByOthers = (message.readBy || []).some((id) => String(id) !== String(currentUserId));
  const deliveredToOthers = (message.deliveredTo || []).some((id) => String(id) !== String(currentUserId));
  const media = message.media;

  const bubbleBg = isOwn ? theme.palette.primary.main : theme.palette.background.paper;
  const bubbleColor = isOwn ? theme.palette.primary.contrastText : theme.palette.text.primary;

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: isOwn ? "flex-end" : "flex-start",
        px: { xs: 0.25, sm: 0.5 },
        "&:hover .message-actions": { opacity: 1 },
      }}
    >
      <Box sx={{ maxWidth: { xs: "86%", sm: "70%", md: "62%" }, minWidth: 0 }}>
        {showSender && !isOwn && (
          <Typography
            variant="caption"
            sx={{ color: "primary.main", fontWeight: 650, ml: 1.5, mb: 0.25, display: "block" }}
          >
            {senderName(message.sender)}
          </Typography>
        )}

        <Box
          sx={{
            position: "relative",
            display: "flex",
            alignItems: "flex-end",
            gap: 0.5,
            flexDirection: isOwn ? "row-reverse" : "row",
          }}
        >
          <Box
            sx={{
              bgcolor: bubbleBg,
              color: bubbleColor,
              borderRadius: 3.5,
              borderTopRightRadius: isOwn ? 0.75 : 3.5,
              borderTopLeftRadius: isOwn ? 3.5 : 0.75,
              px: 1.5,
              py: 1,
              boxShadow: theme.palette.mode === "light" ? "0 10px 24px -22px rgba(16,35,29,0.9)" : "none",
              border: isOwn ? "none" : `1px solid ${theme.palette.divider}`,
              minWidth: 0,
              width: "fit-content",
              maxWidth: "100%",
              opacity: pending ? 0.7 : 1,
            }}
          >
            {message.forwarded && !deleted && (
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5, opacity: 0.85 }}>
                <ReplyIcon sx={{ fontSize: 13, transform: "scaleX(-1)" }} />
                <Typography variant="caption" sx={{ fontStyle: "italic" }}>
                  Forwarded
                </Typography>
              </Stack>
            )}

            {reply && !deleted && (
              <Box
                sx={{
                  borderLeft: 3,
                  borderColor: isOwn ? "rgba(255,255,255,0.55)" : "primary.main",
                  bgcolor: isOwn ? "rgba(255,255,255,0.14)" : "action.hover",
                  borderRadius: 1.5,
                  px: 1,
                  py: 0.5,
                  mb: 0.75,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>
                  {senderId(reply.sender) === String(currentUserId) ? "You" : senderName(reply.sender)}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ opacity: 0.85, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {reply.deletedAt ? "Message deleted" : reply.content || `${reply.type} attachment`}
                </Typography>
              </Box>
            )}

            {deleted ? (
              <Typography variant="body2" sx={{ fontStyle: "italic", opacity: 0.75 }}>
                This message was deleted
              </Typography>
            ) : (
              <>
                {media?.url && message.type === "image" && (
                  <Box
                    component="img"
                    src={mediaUrl(media.url)}
                    alt={media.name || "Shared image"}
                    onClick={() => onOpenMedia?.(message)}
                    sx={{
                      display: "block",
                      borderRadius: 2.5,
                      maxHeight: 300,
                      maxWidth: "100%",
                      mb: message.content ? 0.75 : 0,
                      cursor: "zoom-in",
                      objectFit: "cover",
                    }}
                  />
                )}

                {media?.url && message.type === "video" && (
                  <Box
                    component="video"
                    src={mediaUrl(media.url)}
                    controls
                    preload="metadata"
                    sx={{ display: "block", borderRadius: 2.5, maxHeight: 320, maxWidth: "100%", mb: message.content ? 0.75 : 0 }}
                  />
                )}

                {media?.url && message.type === "audio" && (
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{
                      bgcolor: isOwn ? "rgba(255,255,255,0.14)" : "action.hover",
                      borderRadius: 2.5,
                      px: 1,
                      py: 0.75,
                      mb: message.content ? 0.75 : 0,
                      minWidth: 210,
                    }}
                  >
                    <PlayArrowIcon fontSize="small" />
                    <Box component="audio" src={mediaUrl(media.url)} controls sx={{ height: 32, width: 170 }} />
                    {media.duration ? (
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        {formatDuration(media.duration)}
                      </Typography>
                    ) : null}
                  </Stack>
                )}

                {media?.url && message.type === "file" && (
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    component="a"
                    href={mediaUrl(media.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      textDecoration: "none",
                      color: "inherit",
                      bgcolor: isOwn ? "rgba(255,255,255,0.14)" : "action.hover",
                      borderRadius: 2.5,
                      px: 1,
                      py: 0.75,
                      mb: message.content ? 0.75 : 0,
                    }}
                  >
                    <InsertDriveFileOutlinedIcon fontSize="small" />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600, maxWidth: 180 }}>
                        {media.name || "Document"}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.75 }}>
                        {formatBytes(media.size)}
                      </Typography>
                    </Box>
                    <DownloadOutlinedIcon fontSize="small" />
                  </Stack>
                )}

                {message.content && (
                  <Typography
                    variant="body2"
                    sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: { xs: "0.92rem", sm: "0.95rem" } }}
                  >
                    {message.content}
                  </Typography>
                )}
              </>
            )}

            <Stack direction="row" spacing={0.6} alignItems="center" justifyContent="flex-end" sx={{ mt: 0.25 }}>
              {message.editedAt && !deleted && (
                <Typography variant="caption" sx={{ opacity: 0.7, fontSize: 10 }}>
                  edited
                </Typography>
              )}
              <Typography variant="caption" sx={{ opacity: 0.75, fontSize: 10.5 }}>
                {formatTime(message.createdAt)}
              </Typography>
              {isOwn &&
                (pending ? (
                  <CircularProgress size={10} sx={{ color: "inherit", opacity: 0.8 }} />
                ) : readByOthers ? (
                  <DoneAllIcon sx={{ fontSize: 14, color: isOwn ? "rgba(255,255,255,0.9)" : "primary.main" }} />
                ) : deliveredToOthers ? (
                  <DoneAllIcon sx={{ fontSize: 14, opacity: 0.7 }} />
                ) : (
                  <DoneIcon sx={{ fontSize: 14, opacity: 0.7 }} />
                ))}
            </Stack>
          </Box>

          {!deleted && (
            <Stack
              className="message-actions"
              direction="row"
              spacing={0}
              sx={{ opacity: 0, transition: "opacity 120ms ease", alignSelf: "center", flexShrink: 0 }}
            >
              <Tooltip title="React">
                <IconButton size="small" onClick={(e) => setReactionEl(e.currentTarget)} aria-label="React to message">
                  <AddReactionOutlinedIcon sx={{ fontSize: 17 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Reply">
                <IconButton size="small" onClick={() => onReply?.(message)} aria-label="Reply to message">
                  <ReplyIcon sx={{ fontSize: 17 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="More">
                <IconButton size="small" onClick={(e) => setActionsEl(e.currentTarget)} aria-label="More message actions">
                  <MoreHorizIcon sx={{ fontSize: 17 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          )}
        </Box>

        {reactions.length > 0 && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, justifyContent: isOwn ? "flex-end" : "flex-start", flexWrap: "wrap" }}>
            {Object.entries(reactionCounts).map(([emoji, count]) => (
              <Chip
                key={emoji}
                size="small"
                label={`${emoji}${count > 1 ? ` ${count}` : ""}`}
                onClick={() => onReact?.(message, emoji)}
                sx={{
                  height: 22,
                  fontSize: 12,
                  bgcolor: emoji === myReaction ? "primary.main" : "background.paper",
                  color: emoji === myReaction ? "primary.contrastText" : "text.primary",
                  border: `1px solid ${theme.palette.divider}`,
                }}
              />
            ))}
          </Stack>
        )}

        <Menu anchorEl={reactionEl} open={!!reactionEl} onClose={() => setReactionEl(null)}>
          <Stack direction="row" spacing={0.5} sx={{ px: 1.5, py: 0.5 }}>
            {QUICK_REACTIONS.map((emoji) => (
              <IconButton
                key={emoji}
                size="small"
                onClick={() => {
                  onReact?.(message, emoji);
                  setReactionEl(null);
                }}
                sx={{ fontSize: 20 }}
                aria-label={`React with ${emoji}`}
              >
                <span>{emoji}</span>
              </IconButton>
            ))}
          </Stack>
        </Menu>

        <Menu anchorEl={actionsEl} open={!!actionsEl} onClose={() => setActionsEl(null)}>
          <MenuItem
            onClick={() => {
              onReply?.(message);
              setActionsEl(null);
            }}
          >
            Reply
          </MenuItem>
          <MenuItem
            onClick={() => {
              onForward?.(message);
              setActionsEl(null);
            }}
          >
            Forward
          </MenuItem>
          {isOwn && message.type === "text" && (
            <MenuItem
              onClick={() => {
                onEdit?.(message);
                setActionsEl(null);
              }}
            >
              Edit
            </MenuItem>
          )}
          {isOwn && (
            <MenuItem
              sx={{ color: "error.main" }}
              onClick={() => {
                onDelete?.(message);
                setActionsEl(null);
              }}
            >
              Delete
            </MenuItem>
          )}
        </Menu>
      </Box>
    </Box>
  );
}
