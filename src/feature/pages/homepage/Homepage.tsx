import React from "react";
import { Box, Slide, useMediaQuery } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import { useAuth } from "../../../context/AuthContext";
import { api } from "../../../lib/api";
import type { Chat } from "../../../lib/types";

export default function Homepage() {
  const isMobile = useMediaQuery("(max-width:900px)");
  const { user } = useAuth();
  const meId = String(user?._id || user?.id || "");
  const [selectedChat, setSelectedChat] = React.useState<Chat | null>(null);
  const [params, setParams] = useSearchParams();

  // Deep link: /chats?chat=<id> (used by notifications).
  React.useEffect(() => {
    const chatId = params.get("chat");
    if (!chatId) return;
    let active = true;
    api<Chat>(`/chats/${chatId}`)
      .then((chat) => {
        if (active) setSelectedChat(chat);
      })
      .catch(() => undefined)
      .finally(() => {
        const next = new URLSearchParams(params);
        next.delete("chat");
        setParams(next, { replace: true });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get("chat")]);

  const openChat = (chat?: Chat) => setSelectedChat(chat || null);

  if (isMobile) {
    return (
      <Box sx={{ height: "100%", overflow: "hidden", position: "relative" }}>
        <Slide direction="right" in={!selectedChat} mountOnEnter unmountOnExit>
          <Box sx={{ position: "absolute", inset: 0 }}>
            <LeftPanel onSelectChat={openChat} selectedChatId={selectedChat?._id} />
          </Box>
        </Slide>
        <Slide direction="left" in={!!selectedChat} mountOnEnter unmountOnExit>
          <Box sx={{ position: "absolute", inset: 0 }}>
            <RightPanel
              chat={selectedChat}
              meId={meId}
              onBack={() => setSelectedChat(null)}
              onChatUpdated={(chat) => setSelectedChat(chat)}
            />
          </Box>
        </Slide>
      </Box>
    );
  }

  return (
    <Box display="flex" height="100%" sx={{ overflow: "hidden" }}>
      <Box sx={{ width: 360, flexShrink: 0, borderRight: "1px solid", borderColor: "divider", minHeight: 0 }}>
        <LeftPanel onSelectChat={openChat} selectedChatId={selectedChat?._id} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <RightPanel chat={selectedChat} meId={meId} onChatUpdated={(chat) => setSelectedChat(chat)} />
      </Box>
    </Box>
  );
}
