import { Avatar, Box, IconButton, Input, Typography, useMediaQuery } from "@mui/material";
import CustomAppBar from "../../../foundation/CustomAppBar/CustomAppBar";
import SearchIcon from "@mui/icons-material/Search";
import CustomMenuButton from "../../../foundation/CustomMenuButton/CustomMenuButton";
import { rightPanelMenuItem } from "./utils/constant";
import bg from "../../../assets/background.png";
import MoodIcon from "@mui/icons-material/Mood";
import MicIcon from "@mui/icons-material/Mic";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

import ChatContainer from "./ChatContainer";
import AttachmentPopover from "./AttachmentPopover";
import React, { useEffect, useRef, useState } from "react";
import { ChatCardType } from "./utils/LeftPanel.types";
import { io as socketIO } from "socket.io-client";
import type { Socket } from "socket.io-client";

import DBStatus from "../../../foundation/CustomAppBar/DBStatus";

interface RightPanelProps {
  onBack?: () => void;
  chat?: ChatCardType;
}

const API_BASE = (typeof process !== 'undefined' && (process as any).env && (process as any).env.REACT_APP_API_BASE) || '/api';
const WS_BASE = (typeof window !== 'undefined' && window.location ? `${window.location.protocol}//${window.location.hostname}:5000` : 'http://localhost:5000');

export default function RightPanel({ onBack, chat }: RightPanelProps) {
  const globalIconStyle = {
    color: "#8696a1",
    height: "28px",
    width: "28px",
  };

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [textValue, setTextValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isMobile = useMediaQuery("(max-width:600px)");
  const [messages, setMessages] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const typingTimeoutRef = useRef<any>(null);

  function uniqueById(list: any[]) {
    const seen = new Set<string>();
    return (Array.isArray(list) ? list : []).filter((m: any) => {
      const id = String(m?._id || "");
      if (!id) return true; // keep items without _id
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  useEffect(() => {
    const userRaw = localStorage.getItem('chateasy_user');
    const uid = userRaw ? JSON.parse(userRaw).id : '';
    setCurrentUserId(uid);
  }, []);

  useEffect(() => {
    if (!chat?.id) { setMessages([]); return; }
    const token = localStorage.getItem('chateasy_token');
    fetch(`${API_BASE}/chats/${chat.id}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => setMessages(uniqueById(Array.isArray(data) ? data : [])))
      .catch(() => {});
  }, [chat?.id]);

  useEffect(() => {
    // Socket connection per chat room
    if (!chat?.id) return;
    const s = socketIO(WS_BASE, { transports: ['websocket', 'polling'] });
    s.emit('chat:join', chat.id);
    s.on('message:created', (msg: any) => {
      if (msg?.chat === chat.id) {
        setMessages((prev) => {
          const exists = prev.some((m: any) => m?._id === msg?._id);
          return exists ? prev : [...prev, msg];
        });
      }
    });
    s.on('typing', ({ userId, typing }: any) => {
      // tampilkan indikator hanya jika lawan bicara yang mengetik
      if (String(userId) !== String(currentUserId)) {
        setIsTyping(!!typing);
        if (typing) {
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2500);
        }
      }
    });
    setSocket(s);
    return () => { s.disconnect(); };
  }, [chat?.id, currentUserId]);

  async function handleSend() {
    if (!textValue.trim() || !chat?.id || !currentUserId) return;
    const token = localStorage.getItem('chateasy_token');
    try {
      const res = await fetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chat: chat.id, sender: currentUserId, content: textValue.trim(), type: 'text' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to send');
      const meRaw = localStorage.getItem('chateasy_user');
      let meDisplay = 'Me';
      try {
        const meObj = meRaw ? JSON.parse(meRaw) : {};
        meDisplay = meObj?.name || meObj?.email || meObj?.phone || meDisplay;
      } catch {}
      setMessages((prev) => uniqueById([
        ...prev,
        {
          ...data,
          sender: data?.sender?.name ? data.sender : { _id: currentUserId, name: meDisplay },
        },
      ]));
      setTextValue('');
      // berhenti mengetik setelah mengirim
      if (socket) socket.emit('typing', { chatId: chat.id, userId: currentUserId, typing: false });
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    // Fokus input hanya di mobile
    if (isMobile) {
      inputRef.current?.focus();
    }
  }, [isMobile]);

  const handleMenuSelect = (label: string) => {
    if (label === 'Logout') {
      localStorage.removeItem('chateasy_token');
      localStorage.removeItem('chateasy_user');
      window.location.href = '/login';
      return;
    }
    if (label === 'Invite Friends') {
      window.location.href = '/invite';
      return;
    }
  };

  return (
    <Box height="100%" width="100%" display="flex" flexDirection="column">
      <CustomAppBar>
        <Box
          width="100%"
          height="100%"
          display="flex"
          justifyContent="space-between"
          alignItems="center"
        >
          <Box display="flex" alignItems="center">
            {/* Tombol Back muncul hanya di mobile */}
            {onBack && (
              <IconButton onClick={onBack} sx={{ mr: 1, display: { xs: "inline-flex", sm: "none" } }} aria-label="Back">
                <ArrowBackIcon sx={{ color: "#afbac0" }} />
              </IconButton>
            )}
            <Avatar sx={{ width: { xs: 36, sm: 40 }, height: { xs: 36, sm: 40 } }} />
            <Box
              display="flex"
              flexDirection="column"
              alignItems="flex-start"
              pl="10px"
            >
              <Typography variant="body1" color="white" sx={{ fontSize: { xs: "1rem", sm: "0.95rem" }, fontWeight: { xs: 600, sm: 600 } }}>
                {chat?.name ?? "Select a chat"}
              </Typography>
              <Typography variant="caption" sx={{ color: { xs: "#00a884", sm: "#8496a0" }, fontSize: { xs: "0.75rem", sm: "0.75rem" } }}>
                {isTyping ? 'typing…' : 'online'}
              </Typography>
            </Box>
          </Box>
          <Box display="flex">
            <IconButton onClick={() => {}}>
              <SearchIcon
                sx={{
                  color: "#afbac0",
                }}
              />
            </IconButton>
            <CustomMenuButton menuItems={rightPanelMenuItem} onSelect={handleMenuSelect} />
            {/* DB status indicator */}
            <DBStatus />
          </Box>
        </Box>
      </CustomAppBar>
      <Box flex={1} minHeight={0} position="relative" sx={{ backgroundImage: `url(${bg})`, backgroundRepeat: "repeat", backgroundPosition: "center", backgroundSize: "auto" }}>

        <ChatContainer messages={messages} currentUserId={currentUserId} />
      </Box>
      <Box
        height="62px"
        alignItems="center"
        display="flex"
        zIndex="1000"
        sx={{
          background: "#1f2c33",
          padding: "0px 15px",
        }}
      >
        <IconButton
          onClick={() => {
            setShowEmojiPicker(!showEmojiPicker);
          }}
        >
          <MoodIcon sx={globalIconStyle} />
        </IconButton>
        <AttachmentPopover />
        <Box flex={1} pl="5px" pr="5px">
          <Input
            fullWidth
            disableUnderline
            placeholder={chat?.id ? "Type a message" : "Select a chat to start messaging"}
            value={textValue}
            onChange={(event: any) => {
              setTextValue(event.target.value);
              // emit typing dengan debounce sederhana
              if (socket && chat?.id && currentUserId) {
                socket.emit('typing', { chatId: chat.id, userId: currentUserId, typing: true });
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = setTimeout(() => {
                  socket.emit('typing', { chatId: chat.id, userId: currentUserId, typing: false });
                }, 1200);
              }
            }}
            onKeyDown={(e: any) => { if (e.key === 'Enter') handleSend(); }}
            inputRef={inputRef}
            sx={{
              background: "#2b3943",
              height: { xs: "46px", sm: "42px" },
              borderRadius: "6px",
              color: "white",
              padding: { xs: "0px 12px", sm: "0px 10px" },
            }}
          />
        </Box>
        <IconButton onClick={handleSend} disabled={!chat?.id}>
          <MicIcon sx={globalIconStyle} />
        </IconButton>
      </Box>
      {showEmojiPicker && (
        <EmojiPicker
          height="45%"
          width="100%"
          previewConfig={{
            showPreview: false,
          }}
          onEmojiClick={(emojiData: EmojiClickData) => {
            setTextValue(textValue + emojiData.emoji);
          }}
        />
      )}
    </Box>
  );
}
