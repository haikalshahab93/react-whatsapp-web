import React from "react";
import { Avatar as MuiAvatar, Badge, Box, SxProps, Theme } from "@mui/material";
import { avatarGradient, initials } from "../lib/format";
import { mediaUrl } from "../lib/api";

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  online?: boolean;
  showPresence?: boolean;
  sx?: SxProps<Theme>;
}

export default function UserAvatar({
  src,
  name,
  size = 44,
  online,
  showPresence = false,
  sx,
}: UserAvatarProps) {
  const resolved = mediaUrl(src) || undefined;
  const inner = (
    <MuiAvatar
      src={resolved}
      alt={name || "User"}
      sx={{
        width: size,
        height: size,
        fontSize: Math.max(12, size * 0.36),
        fontWeight: 700,
        color: "#fff",
        background: resolved ? undefined : avatarGradient(name),
        border: "1px solid rgba(255,255,255,0.12)",
        ...sx,
      }}
    >
      {initials(name)}
    </MuiAvatar>
  );

  if (!showPresence) return inner;

  return (
    <Badge
      overlap="circular"
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      variant="dot"
      sx={{
        "& .MuiBadge-badge": {
          backgroundColor: online ? "#22c55e" : "#94a3b8",
          color: online ? "#22c55e" : "#94a3b8",
          boxShadow: (theme) => `0 0 0 2px ${theme.palette.background.paper}`,
          width: 10,
          height: 10,
          borderRadius: "50%",
        },
      }}
    >
      {inner}
    </Badge>
  );
}

export function AvatarStack({ users, max = 3 }: { users: { name?: string; avatarUrl?: string | null }[]; max?: number }) {
  const shown = users.slice(0, max);
  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      {shown.map((u, index) => (
        <Box key={`${u.name}-${index}`} sx={{ ml: index === 0 ? 0 : -1.2, zIndex: max - index }}>
          <UserAvatar src={u.avatarUrl} name={u.name} size={26} sx={{ border: "2px solid", borderColor: "background.paper" }} />
        </Box>
      ))}
    </Box>
  );
}
