import { Box } from "@mui/material";
import React from "react";

interface CustomAppBarProps {
  children: any;
  height?: string | number;
  overflow?: string;
}

export default function CustomAppBar({ children, height = "63px", overflow }: CustomAppBarProps) {
  return (
    <Box
      height={height}
      sx={{
        background: "#1f2c33",
        padding: "0px 20px",
        overflow: overflow || undefined,
      }}
    >
      {children}
    </Box>
  );
}
