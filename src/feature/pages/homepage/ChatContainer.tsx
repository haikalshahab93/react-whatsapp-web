import { Box, Chip, Typography } from "@mui/material";
import React from "react";
import OwnMessageCard from "../../../foundation/ChatCard/OwnMessageCard";
import ReplyMessageCard from "../../../foundation/ChatCard/ReplyCard";

interface ChatContainerProps {
  messages: any[];
  currentUserId: string;
}

function formatDayLabel(date: Date) {
  const today = new Date();
  const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((d1 - d0) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === -1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ChatContainer({ messages, currentUserId }: ChatContainerProps) {
  let lastDateStr = "";
  return (
    <Box height="100%" width="100%" overflow="auto" p={{ xs: 1.5, sm: 2 }} display="flex" flexDirection="column" gap={{ xs: 1, sm: 1.25 }}>
      {(Array.isArray(messages) ? messages : []).map((m: any, idx: number) => {
        const created = m?.createdAt ? new Date(m.createdAt) : null;
        const dayStr = created ? `${created.getFullYear()}-${created.getMonth()+1}-${created.getDate()}` : "";
        const showSeparator = !!created && dayStr !== lastDateStr;
        if (showSeparator) lastDateStr = dayStr;

        const senderId = String(m?.sender?._id || m?.sender || "");
        const isOwn = senderId && String(senderId) === String(currentUserId);
        const senderName = m?.sender?.name || m?.sender?.phone || m?.sender?.email || "User";
        const time = created ? new Date(m?.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
        const text = m?.content || m?.text || "";

        return (
          <React.Fragment key={m?._id || `${idx}-${dayStr}`}>
            {showSeparator && (
              <Box display="flex" justifyContent="center" my={{ xs: 0.5, sm: 0.75 }}>
                <Chip label={formatDayLabel(created!)} size="small" sx={{ bgcolor: "#23323a", color: "#e9edef" }} />
              </Box>
            )}
            {isOwn ? (
              <OwnMessageCard text={text} time={time} name={senderName} />
            ) : (
              <ReplyMessageCard text={text} time={time} name={senderName} />
            )}
          </React.Fragment>
        );
      })}
    </Box>
  );
}
