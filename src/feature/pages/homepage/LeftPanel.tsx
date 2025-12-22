import { Avatar, Box, IconButton, Input, Chip } from "@mui/material";
import CustomAppBar from "../../../foundation/CustomAppBar/CustomAppBar";
import CustomMenuButton from "../../../foundation/CustomMenuButton/CustomMenuButton";
import { leftPanelMenuItem } from "./utils/constant";
import ChatIcon from "@mui/icons-material/Chat";
import DonutLargeIcon from "@mui/icons-material/DonutLarge";
import ChatCard from "../../../foundation/ChatCard/ChatCard";
import FilterListIcon from "@mui/icons-material/FilterList";
import SearchIcon from "@mui/icons-material/Search";
import { ChatCardType } from "./utils/LeftPanel.types";
import React, { useEffect, useState } from "react";
import { io as socketIO } from "socket.io-client";
import DBStatus from "../../../foundation/CustomAppBar/DBStatus";

const API_BASE = (typeof process !== 'undefined' && (process as any).env && (process as any).env.REACT_APP_API_BASE) || '/api';
const WS_BASE = (typeof window !== 'undefined' && (window as any).WS_BASE)
  || (typeof window !== 'undefined' && window.location ? `${window.location.protocol}//${window.location.hostname}:5000` : 'http://localhost:5000');

interface LeftPanelProps {
  onSelectChat?: (chat?: ChatCardType) => void;
}

export default function LeftPanel({ onSelectChat }: LeftPanelProps) {
  const [chats, setChats] = useState<ChatCardType[]>([]);
  const [query, setQuery] = useState<string>("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState<boolean>(false);
  const [meId, setMeId] = useState<string | null>(null);

  function getMeId(): string | null {
    const userRaw = localStorage.getItem('chateasy_user');
    return userRaw ? JSON.parse(userRaw).id : null;
  }

  function formatDirectName(c: any, me: string | null): string {
    try {
      if (c?.isGroup) return c?.name || '';
      const members = Array.isArray(c?.members) ? c.members : [];
      const meStr = String(me || '');
      const other = members.find((m: any) => String(m?._id || m) !== meStr);
      const otherName = other?.name || other?.email || other?.phone;
      return otherName || c?.name || '';
    } catch {
      return c?.name || '';
    }
  }

  function mapChats(data: any[], me: string | null): ChatCardType[] {
    return (Array.isArray(data) ? data : []).map((c: any) => ({
      id: c._id,
      name: formatDirectName(c, me),
      lastText: c?.lastMessage?.content || '',
      lastSeen: c?.lastMessage?.createdAt ? new Date(c.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      selected: false,
      unreadCount: 0,
      pinned: !!c?.pinned,
    }));
  }

  useEffect(() => {
    const token = localStorage.getItem('chateasy_token');
    const userId = getMeId();
    setMeId(userId);
    if (!token || !userId) { setChats([]); return; }
    fetch(`${API_BASE}/chats?member=${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => setChats(mapChats(Array.isArray(data) ? data : [], userId)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Socket connection for realtime chat list updates
    const token = localStorage.getItem('chateasy_token');
    const userId = getMeId();
    if (!token || !userId) return;
    const s = socketIO(WS_BASE, { transports: ['websocket', 'polling'] });
    s.emit('user:join', userId);
    s.on('chat:created', (chat: any) => {
      const currMe = meId || getMeId();
      setChats((prev) => {
        const exists = prev.some((c) => c.id === chat._id);
        if (exists) return prev;
        const mapped = mapChats([chat], currMe);
        return [mapped[0], ...prev];
      });
    });
    s.on('chat:updated', (chat: any) => {
      const currMe = meId || getMeId();
      setChats((prev) => {
        const mapped = mapChats([chat], currMe)[0];
        const others = prev.filter((c) => c.id !== chat._id);
        return [mapped, ...others];
      });
    });
    return () => { s.disconnect(); };
  }, [meId]);

  useEffect(() => {
    // Fetch user suggestions based on query
    const token = localStorage.getItem('chateasy_token');
    const userId = getMeId();
    if (!token || !userId) { setSuggestions([]); setSuggestionsLoading(false); return; }
    const q = query.trim();
    if (!q) { setSuggestions([]); setSuggestionsLoading(false); return; }
    const controller = new AbortController();
    setSuggestionsLoading(true);
    fetch(`${API_BASE}/users/suggest?q=${encodeURIComponent(q)}&limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => setSuggestions(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setSuggestionsLoading(false));
    return () => controller.abort();
  }, [query]);

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

  async function startOrOpenChat(user: any) {
    const token = localStorage.getItem('chateasy_token');
    const meIdLocal = getMeId();
    if (!token || !meIdLocal || !user || !user._id) return;
    try {
      // Check existing chats containing the target user
      const res = await fetch(`${API_BASE}/chats?member=${meIdLocal}`, { headers: { Authorization: `Bearer ${token}` } });
      const list = await res.json();
      const existing = (Array.isArray(list) ? list : []).find((c: any) => Array.isArray(c.members) && c.members.some((m: any) => String(m._id || m) === String(user._id)));
      if (existing) {
        const mapped = mapChats([existing], meIdLocal)[0];
        onSelectChat?.(mapped);
        setQuery("");
        setSuggestions([]);
        return;
      }
      // Create new chat
      const createRes = await fetch(`${API_BASE}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: user.name || user.email || user.phone || 'New Chat', isGroup: false, members: [meIdLocal, user._id] }),
      });
      const chat = await createRes.json();
      if (createRes.ok && chat?._id) {
        // Fetch detail to get populated members for proper naming
        const detailRes = await fetch(`${API_BASE}/chats/${chat._id}`, { headers: { Authorization: `Bearer ${token}` } });
        const detail = await detailRes.json();
        const mapped = mapChats([detail], meIdLocal)[0];
        setChats((prev) => [mapped, ...prev]);
        onSelectChat?.(mapped);
      }
    } catch (e) {
      // silent fail
    } finally {
      setQuery("");
      setSuggestions([]);
    }
  }

  return (
    <Box height="100%" width="100%" overflow="hidden" display="flex" flexDirection="column">
      <CustomAppBar height="30%" overflow="hidden">
        <Box
          width="100%"
          height="100%"
          display="flex"
          justifyContent="space-between"
          alignItems="center"
        >
          <Avatar />

          <Box display="flex">
            <IconButton
              onClick={() => {}}
              sx={{
                paddingRight: "15px",
              }}
            >
              <DonutLargeIcon
                sx={{
                  color: "#afbac0",
                }}
              />
            </IconButton>
            <IconButton
              onClick={() => {}}
              sx={{
                paddingRight: "10px",
              }}
            >
              <ChatIcon
                sx={{
                  color: "#afbac0",
                }}
              />
            </IconButton>
            <CustomMenuButton menuItems={leftPanelMenuItem} onSelect={handleMenuSelect} />
            {/* DB status indicator */}
            <DBStatus />
          </Box>
        </Box>
      </CustomAppBar>
      <Box
        sx={{
          background: "#101b20",
          padding: "12px",
        }}
        display="flex"
      >
        <Box
          display="flex"
          sx={{
            background: "#1f2c33",
            borderRadius: "8px",
            padding: "0px 8px",
          }}
          flex={1}
          alignItems="center"
        >
          <IconButton onClick={() => {}}>
            <SearchIcon
              sx={{
                color: "#8696a1",
                height: "20px",
                width: "20px",
              }}
            />
          </IconButton>
          <Input
            fullWidth
            disableUnderline
            placeholder="Search or start a new chat"
            sx={{
              height: "35px",
              color: "white",
              padding: "0px 13px",
              fontSize: "14px",
            }}
            value={query}
            onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && suggestions[0]) startOrOpenChat(suggestions[0]);
            }}
          />
        </Box>
        <IconButton onClick={() => {}}>
          <FilterListIcon
            sx={{
              color: "#8696a1",
              height: "20px",
              width: "20px",
            }}
          />
        </IconButton>
      </Box>
      <Box sx={{ background: "#101b20", px: "12px", pb: "8px" }} display="flex" gap={1}>
        <Chip label="All" size="small" sx={{ bgcolor: "#25d366", color: "#1f2c33", fontWeight: 600 }} />
        <Chip label="Unread" size="small" sx={{ bgcolor: "transparent", color: "#e9edef", border: "1px solid #2a3942" }} />
        <Chip label="Favorites" size="small" sx={{ bgcolor: "transparent", color: "#e9edef", border: "1px solid #2a3942" }} />
        <Chip label="Groups" size="small" sx={{ bgcolor: "transparent", color: "#e9edef", border: "1px solid #2a3942" }} />
      </Box>
      <Box
        overflow="auto"
        flex={1}
        sx={{
          background: "#101b20",
          pt: 0,
        }}
      >
        {query && (
          <Box sx={{ px: "12px", pt: "8px" }}>
            {suggestionsLoading && (
              <Box sx={{ color: '#8696a1', fontSize: '0.9rem', py: 1 }}>Searching…</Box>
            )}
            {!suggestionsLoading && suggestions.length === 0 && (
              <Box sx={{ color: '#8696a1', fontSize: '0.9rem', py: 1 }}>No results</Box>
            )}
            {suggestions.map((u: any) => (
              <Box
                key={u._id}
                onClick={() => startOrOpenChat(u)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  cursor: 'pointer',
                  px: 1,
                  py: 1,
                  borderRadius: '8px',
                  '&:hover': { backgroundColor: '#1f2c33' },
                }}
              >
                <Avatar src={u.avatarUrl} sx={{ width: 32, height: 32 }} />
                <Box sx={{ color: '#e9edef' }}>{u.name || u.email || u.phone}</Box>
              </Box>
            ))}
          </Box>
        )}
        {chats.map((item: ChatCardType, index: number) => {
          return <ChatCard key={item.id ?? index} item={item} onClick={() => onSelectChat?.(item)} />;
        })}
        <Box pt="50px" />
      </Box>
    </Box>
  );
}
