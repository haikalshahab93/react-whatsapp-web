import { Avatar, Box, Typography, Chip } from "@mui/material";
import PushPinIcon from "@mui/icons-material/PushPin";
import React from "react";
import { ChatCardType } from "../../feature/pages/homepage/utils/LeftPanel.types";

interface ChatCardProps {
  item: ChatCardType;
  onClick?: () => void;
}

export default function ChatCard({ item, onClick }: ChatCardProps) {
  const { name, lastSeen, lastText, selected, unreadCount, pinned } = item;
  return (
    <Box
      onClick={onClick}
      display="flex"
      sx={{
        background: selected ? "#2b3943" : "#101b20",
        padding: "10px 12px",
        cursor: onClick ? "pointer" : "default",
        width: "100%",
        borderBottom: "1px solid #23323a",
      }}
    >
      <Avatar sx={{ width: { xs: 38, sm: 32 }, height: { xs: 38, sm: 32 } }} />
      <Box
        display="flex"
        flexDirection="column"
        pl="12px"
        width="100%"
        alignItems="flex-start"
      >
        <Box display="flex" justifyContent="space-between" width="100%" alignItems="center">
          <Box display="flex" alignItems="center" gap={0.75}>
            {pinned && <PushPinIcon sx={{ color: "#8696a1", fontSize: 18 }} />}
            <Typography variant="body1" color="#e9edef" sx={{ fontWeight: 600, fontSize: { xs: "1rem", sm: "0.95rem" } }}>
              {name}
            </Typography>
          </Box>
          <Typography variant="caption" color="#8696a1" sx={{ fontSize: { xs: "0.75rem", sm: "0.7rem" } }}>
            {lastSeen}
          </Typography>
        </Box>
        <Box display="flex" justifyContent="space-between" width="100%" alignItems="center" mt={0.5}>
          <Typography variant="subtitle2" color="#8696a1" sx={{ fontSize: { xs: "0.85rem", sm: "0.8rem" }, opacity: 0.95, pr: 1 }} noWrap>
            {lastText}
          </Typography>
          {unreadCount && unreadCount > 0 && (
            <Chip label={unreadCount} size="small" sx={{ bgcolor: "#25d366", color: "#1f2c33", height: 20, minWidth: 20, borderRadius: "10px", fontWeight: 600 }} />
          )}
        </Box>
      </Box>
    </Box>
  );
}
