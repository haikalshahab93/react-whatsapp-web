import React from "react";
import { Avatar, Box, CircularProgress, IconButton, Popover, Tooltip, Typography } from "@mui/material";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import InsertPhotoIcon from "@mui/icons-material/InsertPhoto";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import { colors } from "../../../theme";
import { ApiError, uploadFile, UploadResult } from "../../../lib/api";
import { useToast } from "../../../context/ToastContext";

interface AttachmentPopoverProps {
  chatId?: string;
  disabled?: boolean;
  onUploaded: (media: UploadResult) => void;
}

type OptionId = "photo" | "video" | "camera" | "document";

export default function AttachmentPopover({ chatId, disabled, onUploaded }: AttachmentPopoverProps) {
  const toast = useToast();
  const [anchorEl, setAnchorEl] = React.useState<HTMLButtonElement | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const pendingKind = React.useRef<OptionId>("photo");

  const open = Boolean(anchorEl);

  const options: { id: OptionId; label: string; background: string; icon: React.ReactNode; accept: string; capture?: string }[] = [
    {
      id: "photo",
      label: "Photo",
      background: colors.pink1,
      icon: <InsertPhotoIcon sx={{ fontSize: "1.6rem" }} />,
      accept: "image/*",
    },
    {
      id: "video",
      label: "Video",
      background: colors.blue2,
      icon: <VideocamOutlinedIcon sx={{ fontSize: "1.6rem" }} />,
      accept: "video/*",
    },
    {
      id: "camera",
      label: "Camera",
      background: colors.red1,
      icon: <CameraAltIcon sx={{ fontSize: "1.6rem" }} />,
      accept: "image/*",
      capture: "environment",
    },
    {
      id: "document",
      label: "Document",
      background: colors.purple1,
      icon: <InsertDriveFileIcon sx={{ fontSize: "1.6rem" }} />,
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip",
    },
  ];

  const activeOption = options.find((o) => o.id === pendingKind.current) || options[0];

  function pick(id: OptionId) {
    pendingKind.current = id;
    setAnchorEl(null);
    const input = inputRef.current;
    if (!input) return;
    const option = options.find((o) => o.id === id) || options[0];
    input.accept = option.accept;
    if (option.capture) input.setAttribute("capture", option.capture);
    else input.removeAttribute("capture");
    input.value = "";
    input.click();
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadFile(file, { chatId });
      onUploaded(uploaded);
    } catch (error) {
      toast.error((error as ApiError).message || "Could not upload that file.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Box>
      <input ref={inputRef} type="file" hidden onChange={handleFile} aria-hidden tabIndex={-1} />
      <Tooltip title="Attach">
        <span>
          <IconButton
            disabled={disabled || uploading}
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => setAnchorEl(event.currentTarget)}
            aria-label="Attach a file"
          >
            {uploading ? (
              <CircularProgress size={20} />
            ) : (
              <AttachFileIcon sx={{ transform: "rotate(45deg)", color: "text.secondary" }} />
            )}
          </IconButton>
        </span>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{ paper: { sx: { borderRadius: 4, p: 2, mb: 1 } } }}
        elevation={6}
      >
        <Box display="flex" gap={2}>
          {options.map((item) => (
            <Box key={item.id} sx={{ textAlign: "center", width: 62 }}>
              <Avatar
                component="button"
                onClick={() => pick(item.id)}
                sx={{
                  background: item.background,
                  height: 48,
                  width: 48,
                  mx: "auto",
                  mb: 0.75,
                  border: "none",
                  cursor: "pointer",
                  transition: "transform 120ms ease",
                  "&:hover": { transform: "translateY(-2px)" },
                }}
                aria-label={`Send ${item.label.toLowerCase()}`}
              >
                {item.icon}
              </Avatar>
              <Typography variant="caption" color="text.secondary">
                {item.label}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1.5, textAlign: "center" }}>
          {activeOption.accept.replace(/\./g, "").replace(/\*/g, "")} · max 12 MB
        </Typography>
      </Popover>
    </Box>
  );
}
