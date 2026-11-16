import React from "react";
import { Box, Card, Skeleton, Stack } from "@mui/material";

export function ChatListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <Box sx={{ p: 1 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Stack key={i} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.5 }}>
          <Skeleton variant="circular" width={44} height={44} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="45%" height={18} />
            <Skeleton variant="text" width="75%" height={14} />
          </Box>
          <Skeleton variant="text" width={34} height={14} />
        </Stack>
      ))}
    </Box>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Skeleton variant="circular" width={56} height={56} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width="60%" height={22} />
              <Skeleton variant="text" width="40%" height={16} />
            </Box>
          </Stack>
          <Skeleton variant="text" sx={{ mt: 2 }} height={16} />
          <Skeleton variant="text" width="80%" height={16} />
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Skeleton variant="rounded" width={70} height={26} />
            <Skeleton variant="rounded" width={70} height={26} />
          </Stack>
        </Card>
      ))}
    </Box>
  );
}

export function DiscoveryCardSkeleton() {
  return (
    <Card sx={{ overflow: "hidden" }}>
      <Skeleton variant="rectangular" height={260} />
      <Box sx={{ p: 2.5 }}>
        <Skeleton variant="text" width="50%" height={26} />
        <Skeleton variant="text" width="35%" height={16} />
        <Skeleton variant="text" sx={{ mt: 1.5 }} height={16} />
        <Skeleton variant="text" width="80%" height={16} />
      </Box>
    </Card>
  );
}

export function MessageListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Box
          key={i}
          sx={{
            alignSelf: i % 2 === 0 ? "flex-start" : "flex-end",
            width: `${40 + ((i * 7) % 30)}%`,
          }}
        >
          <Skeleton variant="rounded" height={i % 3 === 0 ? 64 : 44} sx={{ borderRadius: 3 }} />
        </Box>
      ))}
    </Box>
  );
}

export function ProfileSkeleton() {
  return (
    <Box>
      <Skeleton variant="rectangular" height={180} />
      <Box sx={{ px: 3, mt: -5 }}>
        <Skeleton variant="circular" width={96} height={96} />
        <Skeleton variant="text" width={220} height={32} sx={{ mt: 1 }} />
        <Skeleton variant="text" width={160} height={18} />
        <Skeleton variant="rounded" height={120} sx={{ mt: 3 }} />
      </Box>
    </Box>
  );
}
