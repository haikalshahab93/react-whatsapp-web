import React from "react";
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Popover,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ExploreOutlinedIcon from "@mui/icons-material/ExploreOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import GroupAddOutlinedIcon from "@mui/icons-material/GroupAddOutlined";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import { useColorMode } from "../context/ColorModeContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { formatRelative } from "../lib/format";
import type { NotificationItem } from "../lib/types";
import UserAvatar from "./Avatar";

const NAV = [
  { label: "Chats", to: "/chats", icon: ChatBubbleOutlineIcon },
  { label: "Discover", to: "/discover", icon: ExploreOutlinedIcon },
  { label: "Friends", to: "/friends", icon: GroupOutlinedIcon },
  { label: "Profile", to: "/profile", icon: PersonOutlineIcon },
];

export const FRIEND_REQUESTS_EVENT = "chateasy:friend-requests-changed";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const { mode, toggle } = useColorMode();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [menuEl, setMenuEl] = React.useState<HTMLElement | null>(null);

  const meId = String(user?._id || user?.id || "");
  const supportsNotifications = typeof window !== "undefined" && "Notification" in window;
  const [notificationPermission, setNotificationPermission] = React.useState<
    NotificationPermission | "unsupported"
  >(supportsNotifications ? Notification.permission : "unsupported");
  const lastNotified = React.useRef<string>("");
  const [offline, setOffline] = React.useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  // One banner for both the browser going offline and the socket dropping, so the app
  // never looks frozen without saying why.
  React.useEffect(() => {
    const socket = getSocket();
    const markOffline = () => setOffline(true);
    const markOnline = () => setOffline(false);
    socket?.on("disconnect", markOffline);
    socket?.on("connect", markOnline);
    window.addEventListener("offline", markOffline);
    window.addEventListener("online", markOnline);
    return () => {
      socket?.off("disconnect", markOffline);
      socket?.off("connect", markOnline);
      window.removeEventListener("offline", markOffline);
      window.removeEventListener("online", markOnline);
    };
  }, []);

  const requestNotifications = React.useCallback(async () => {
    if (!supportsNotifications) return;
    try {
      setNotificationPermission(await Notification.requestPermission());
    } catch {
      /* the user dismissed the prompt */
    }
  }, [supportsNotifications]);

  // System notification only when the tab is in the background and permission was granted.
  const showSystemNotification = React.useCallback(
    (title: string, body: string, tag?: string) => {
      if (!supportsNotifications || !document.hidden || Notification.permission !== "granted") return;
      if (tag && lastNotified.current === tag) return;
      lastNotified.current = tag || "";
      try {
        new Notification(title, { body, tag, icon: "/icon-192.png", badge: "/icon-192.png" });
      } catch {
        /* some browsers refuse notifications from insecure origins */
      }
    },
    [supportsNotifications]
  );

  const loadNotifications = React.useCallback(async () => {
    try {
      const data = await api<{ items: NotificationItem[]; unreadCount: number }>("/notifications", {
        query: { limit: 20 },
      });
      setNotifications(data.items || []);
      setUnread(data.unreadCount || 0);
    } catch {
      /* silent: the bell simply shows the last known state */
    }
  }, []);

  React.useEffect(() => {
    void loadNotifications();
  }, [loadNotifications, location.pathname]);

  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onNotification = (item: NotificationItem) => {
      setNotifications((prev) => [item, ...prev].slice(0, 20));
      setUnread((prev) => prev + 1);
      if (item.type === "friend_request" || item.type === "friend_accepted" || item.type === "match") {
        window.dispatchEvent(new CustomEvent(FRIEND_REQUESTS_EVENT));
      }
      showSystemNotification(item.title, item.body || "Open ChatEasy to see it", item._id);
    };
    socket.on("notification:new", onNotification);
    return () => {
      socket.off("notification:new", onNotification);
    };
  }, [showSystemNotification]);

  // Messages arrive as chat updates in the user room, so the bell can surface them
  // even when the conversation itself is not open.
  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onChatUpdated = (chat: {
      _id?: string;
      name?: string;
      isGroup?: boolean;
      lastMessage?: { _id?: string; content?: string; sender?: { _id?: string; name?: string } | string };
    }) => {
      const last = chat?.lastMessage;
      if (!last || typeof last.sender !== "object" || !last.sender) return;
      if (String(last.sender._id) === meId) return;
      const title = chat.isGroup ? chat.name || "Group chat" : last.sender.name || "New message";
      showSystemNotification(title, last.content || "Sent an attachment", last._id);
    };
    socket.on("chat:updated", onChatUpdated);
    return () => {
      socket.off("chat:updated", onChatUpdated);
    };
  }, [meId, showSystemNotification]);

  const markAllRead = async () => {
    try {
      await api("/notifications/read-all", { method: "PUT" });
      setUnread(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    } catch {
      /* ignore */
    }
  };

  const openNotification = async (item: NotificationItem) => {
    if (!item.readAt) {
      try {
        await api(`/notifications/${item._id}/read`, { method: "PUT" });
        setUnread((prev) => Math.max(0, prev - 1));
        setNotifications((prev) => prev.map((n) => (n._id === item._id ? { ...n, readAt: new Date().toISOString() } : n)));
      } catch {
        /* ignore */
      }
    }
    setAnchorEl(null);
    if (item.type === "friend_request" || item.type === "friend_accepted" || item.type === "match") {
      navigate("/friends");
    } else if (item.type === "group_added" && item.data && (item.data as { chatId?: string }).chatId) {
      navigate(`/chats?chat=${(item.data as { chatId?: string }).chatId}`);
    }
  };

  const signOut = () => {
    setMenuEl(null);
    logout();
    navigate("/login", { replace: true });
  };

  const brand = (
    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: isDesktop ? 1 : 0 }}>
      <Box
        sx={{
          width: 38,
          height: 38,
          borderRadius: "12px",
          background: "linear-gradient(135deg, #0f9d76, #38bdf8)",
          display: "grid",
          placeItems: "center",
          color: "#fff",
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: "-0.04em",
          flexShrink: 0,
        }}
      >
        C
      </Box>
      <Box>
        <Typography sx={{ fontWeight: 750, fontSize: "1.02rem", lineHeight: 1.1 }}>ChatEasy</Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          private & nearby
        </Typography>
      </Box>
    </Stack>
  );

  const navItems = (compact: boolean) =>
    NAV.map((item) => {
      const Icon = item.icon;
      const active = location.pathname === item.to;
      return (
        <Tooltip key={item.to} title={compact ? item.label : ""} placement="right">
          <ListItemButton
            component={NavLink}
            to={item.to}
            sx={{
              borderRadius: 3,
              mb: 0.5,
              py: compact ? 1.1 : 1,
              px: compact ? 0 : 1.5,
              justifyContent: compact ? "center" : "flex-start",
              color: active ? "primary.main" : "text.secondary",
              bgcolor: active
                ? theme.palette.mode === "light"
                  ? "rgba(15,157,118,0.10)"
                  : "rgba(46,230,168,0.12)"
                : "transparent",
              "&:hover": { bgcolor: "action.hover", color: "text.primary" },
              fontWeight: 600,
            }}
          >
            <Icon sx={{ fontSize: 22, mr: compact ? 0 : 1.5 }} />
            {!compact && <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }} />}
          </ListItemButton>
        </Tooltip>
      );
    });

  if (!isDesktop) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", bgcolor: "background.default" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1.25,
            borderBottom: `1px solid ${theme.palette.divider}`,
            bgcolor: theme.palette.background.paper,
            flexShrink: 0,
          }}
        >
          {brand}
          <Stack direction="row" spacing={0.25} alignItems="center">
            <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} aria-label="Notifications">
              <Badge color="error" badgeContent={unread} max={9}>
                <NotificationsNoneIcon />
              </Badge>
            </IconButton>
            <IconButton onClick={toggle} aria-label="Toggle colour mode">
              {mode === "dark" ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
            </IconButton>
            <IconButton onClick={(e) => setMenuEl(e.currentTarget)} aria-label="Account menu">
              <UserAvatar src={user?.avatarUrl} name={user?.name} size={30} />
            </IconButton>
          </Stack>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{children}</Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            borderTop: `1px solid ${theme.palette.divider}`,
            bgcolor: theme.palette.background.paper,
            flexShrink: 0,
            pb: "env(safe-area-inset-bottom)",
          }}
        >
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to;
            return (
              <Button
                key={item.to}
                component={NavLink}
                to={item.to}
                sx={{
                  flexDirection: "column",
                  gap: 0.3,
                  py: 1,
                  borderRadius: 0,
                  color: active ? "primary.main" : "text.secondary",
                  fontSize: 11,
                  fontWeight: 600,
                  minWidth: 0,
                }}
              >
                <Icon sx={{ fontSize: 22 }} />
                {item.label}
              </Button>
            );
          })}
        </Box>

        <NotificationPopover
          anchorEl={anchorEl}
          onClose={() => setAnchorEl(null)}
          items={notifications}
          unread={unread}
          onMarkAllRead={markAllRead}
          onOpenItem={openNotification}
          permission={notificationPermission}
          onEnableDesktopNotifications={requestNotifications}
        />
        <AccountMenu
          anchorEl={menuEl}
          onClose={() => setMenuEl(null)}
          onLogout={signOut}
          onProfile={() => { setMenuEl(null); navigate("/profile"); }}
          onInvite={() => { setMenuEl(null); navigate("/invite"); }}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", height: "100dvh", overflow: "hidden", bgcolor: "background.default" }}>
      {offline && (
        <Box
          role="status"
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: (t) => t.zIndex.snackbar,
            bgcolor: "warning.main",
            color: "warning.contrastText",
            textAlign: "center",
            py: 0.5,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Reconnecting… messages may be delayed
        </Box>
      )}
      <Box
        component="aside"
        sx={{
          width: 244,
          flexShrink: 0,
          borderRight: `1px solid ${theme.palette.divider}`,
          bgcolor: theme.palette.background.paper,
          display: "flex",
          flexDirection: "column",
          p: 1.5,
          gap: 1,
        }}
      >
        {brand}
        <List sx={{ mt: 1.5, flex: 1 }}>
          {navItems(false)}
          <Tooltip title="" placement="right">
            <ListItemButton
              component={NavLink}
              to="/invite"
              sx={{
                borderRadius: 3,
                py: 1,
                px: 1.5,
                color: location.pathname === "/invite" ? "primary.main" : "text.secondary",
                "&:hover": { bgcolor: "action.hover", color: "text.primary" },
                fontWeight: 600,
              }}
            >
              <GroupAddOutlinedIcon sx={{ fontSize: 22, mr: 1.5 }} />
              <ListItemText primary="Invite friends" primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }} />
            </ListItemButton>
          </Tooltip>
        </List>

        <Box sx={{ borderTop: `1px solid ${theme.palette.divider}`, pt: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 0.5, mb: 1.25 }}>
            <UserAvatar src={user?.avatarUrl} name={user?.name} size={34} online showPresence />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>
                {user?.name || "You"}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }} noWrap>
                @{user?.username || "you"}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={0.5}>
            <Tooltip title={mode === "dark" ? "Light mode" : "Dark mode"}>
              <IconButton onClick={toggle} size="small">
                {mode === "dark" ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Notifications">
              <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} size="small">
                <Badge color="error" badgeContent={unread} max={9}>
                  <NotificationsNoneIcon fontSize="small" />
                </Badge>
              </IconButton>
            </Tooltip>
            <Tooltip title="Sign out">
              <IconButton onClick={signOut} size="small">
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>{children}</Box>

      <NotificationPopover
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        items={notifications}
        unread={unread}
        onMarkAllRead={markAllRead}
        onOpenItem={openNotification}
        permission={notificationPermission}
        onEnableDesktopNotifications={requestNotifications}
      />
      <AccountMenu
        anchorEl={menuEl}
        onClose={() => setMenuEl(null)}
        onLogout={signOut}
        onProfile={() => { setMenuEl(null); navigate("/profile"); }}
        onInvite={() => { setMenuEl(null); navigate("/invite"); }}
      />
    </Box>
  );
}

function NotificationPopover({
  anchorEl,
  onClose,
  items,
  unread,
  onMarkAllRead,
  onOpenItem,
  permission,
  onEnableDesktopNotifications,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  items: NotificationItem[];
  unread: number;
  onMarkAllRead: () => void;
  onOpenItem: (item: NotificationItem) => void;
  permission: NotificationPermission | "unsupported";
  onEnableDesktopNotifications: () => void;
}) {
  return (
    <Popover
      open={!!anchorEl}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      slotProps={{ paper: { sx: { width: 340, borderRadius: 4, mt: 1 } } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <NotificationsNoneIcon fontSize="small" />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Notifications
          </Typography>
          {unread > 0 && (
            <Box sx={{ bgcolor: "primary.main", color: "primary.contrastText", borderRadius: 10, px: 0.75, fontSize: 11, fontWeight: 700 }}>
              {unread}
            </Box>
          )}
        </Stack>
        <Tooltip title="Mark all as read">
          <span>
            <IconButton size="small" onClick={onMarkAllRead} disabled={!unread}>
              <DoneAllIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Divider />
      <List sx={{ maxHeight: 380, overflow: "auto", p: 0.5 }}>
        {items.length === 0 && (
          <Box sx={{ px: 2, py: 5, textAlign: "center", color: "text.secondary" }}>
            <NotificationsNoneIcon sx={{ fontSize: 30, mb: 1, opacity: 0.5 }} />
            <Typography variant="body2">You are all caught up.</Typography>
          </Box>
        )}
        {items.map((item) => (
          <MenuItem
            key={item._id}
            onClick={() => onOpenItem(item)}
            sx={{
              alignItems: "flex-start",
              borderRadius: 2,
              whiteSpace: "normal",
              bgcolor: item.readAt ? "transparent" : "action.hover",
              mb: 0.5,
            }}
          >
            <Box sx={{ bgcolor: "action.selected", borderRadius: 2, p: 0.75, mr: 1.25, mt: 0.25, display: "grid", placeItems: "center" }}>
              {item.type === "friend_request" ? (
                <PersonAddAltIcon fontSize="small" />
              ) : (
                <NotificationsNoneIcon fontSize="small" />
              )}
            </Box>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {item.title}
              </Typography>
              {item.body && (
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                  {item.body}
                </Typography>
              )}
              <Typography variant="caption" sx={{ color: "text.disabled" }}>
                {formatRelative(item.createdAt)}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </List>
      {permission !== "unsupported" && (
        <Box sx={{ borderTop: "1px solid", borderColor: "divider", p: 1 }}>
          {permission === "granted" ? (
            <Typography variant="caption" sx={{ color: "text.secondary", px: 1 }}>
              Desktop notifications are on.
            </Typography>
          ) : permission === "denied" ? (
            <Typography variant="caption" sx={{ color: "text.secondary", px: 1 }}>
              Notifications are blocked in your browser settings.
            </Typography>
          ) : (
            <Button
              fullWidth
              size="small"
              startIcon={<NotificationsNoneIcon fontSize="small" />}
              onClick={onEnableDesktopNotifications}
            >
              Enable desktop notifications
            </Button>
          )}
        </Box>
      )}
    </Popover>
  );
}

function AccountMenu({
  anchorEl,
  onClose,
  onLogout,
  onProfile,
  onInvite,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onLogout: () => void;
  onProfile: () => void;
  onInvite: () => void;
}) {
  return (
    <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={onClose}>
      <MenuItem onClick={onProfile}>My profile</MenuItem>
      <MenuItem onClick={onInvite}>Invite friends</MenuItem>
      <MenuItem onClick={onLogout}>Sign out</MenuItem>
    </Menu>
  );
}
