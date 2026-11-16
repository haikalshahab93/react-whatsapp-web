import React from "react";
import { Box, Typography, Button, SvgIconProps } from "@mui/material";
import InboxIcon from "@mui/icons-material/Inbox";

interface EmptyStateProps {
  icon?: React.ComponentType<SvgIconProps>;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export default function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 1,
        px: 3,
        py: compact ? 4 : 8,
        color: "text.secondary",
      }}
    >
      <Box
        sx={{
          width: 62,
          height: 62,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          bgcolor: (theme) => (theme.palette.mode === "light" ? "rgba(15,157,118,0.10)" : "rgba(46,230,168,0.12)"),
          color: "primary.main",
          mb: 0.5,
        }}
      >
        <Icon sx={{ fontSize: 28 }} />
      </Box>
      <Typography variant="h6" color="text.primary">
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" sx={{ maxWidth: 380 }}>
          {description}
        </Typography>
      )}
      {actionLabel && onAction && (
        <Button variant="contained" onClick={onAction} sx={{ mt: 1.5 }}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}
