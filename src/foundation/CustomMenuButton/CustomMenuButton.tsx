import { Box, IconButton, Menu, MenuItem } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import React, { useState } from "react";

interface CustomMenuButtonProps {
  menuItems: string[];
  onSelect?: (label: string) => void;
}

export default function CustomMenuButton({ menuItems, onSelect }: CustomMenuButtonProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  return (
    <Box>
      <IconButton onClick={handleClick}>
        <MoreVertIcon
          sx={{
            color: "#afbac0",
          }}
        />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": "basic-button",
        }}
      >
        {menuItems.map((item: string, index: number) => {
          return (
            <MenuItem
              key={index}
              onClick={() => {
                handleClose();
                onSelect?.(item);
              }}
            >
              {item}
            </MenuItem>
          );
        })}
      </Menu>
    </Box>
  );
}
