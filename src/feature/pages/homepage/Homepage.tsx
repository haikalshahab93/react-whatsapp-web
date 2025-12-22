import { Box, Slide, useMediaQuery } from "@mui/material";
import React, { useState } from "react";
import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import { ChatCardType } from "./utils/LeftPanel.types";

export default function Homepage() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [selectedChat, setSelectedChat] = useState<ChatCardType | undefined>(undefined);
  const isMobile = useMediaQuery("(max-width:600px)");

  const handleOpenChat = (chat?: ChatCardType) => {
    setSelectedChat(chat);
    setIsChatOpen(true);
  };
  const handleBackToList = () => setIsChatOpen(false);

  return (
    <Box display="flex" flexDirection={{ xs: "column", sm: "row" }} height="100vh" sx={{ overflow: "hidden" }}>
      {isMobile ? (
        <>
          {/* Left Panel (mobile) */}
          <Slide direction="right" in={!isChatOpen} mountOnEnter unmountOnExit>
            <Box sx={{ width: "100%" }}>
              <LeftPanel onSelectChat={(c?: ChatCardType) => handleOpenChat(c)} />
            </Box>
          </Slide>

          {/* Divider hidden on mobile */}
          <Box sx={{ display: "none" }} />

          {/* Right Panel (mobile) */}
          <Slide direction="left" in={isChatOpen} mountOnEnter unmountOnExit>
            <Box sx={{ width: "100%" }}>
              <RightPanel onBack={handleBackToList} chat={selectedChat} />
            </Box>
          </Slide>
        </>
      ) : (
        <>
          {/* Desktop: Left + Divider + Right */}
          <Box sx={{ width: "30%", minWidth: 320 }}>
            <LeftPanel onSelectChat={(c?: ChatCardType) => handleOpenChat(c)} />
          </Box>
          <Box sx={{ width: "1px", bgcolor: "#2f3b44" }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <RightPanel chat={selectedChat} />
          </Box>
        </>
      )}
    </Box>
  );
}
