import React from "react";
import { Box, Button, Dialog, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import CallIcon from "@mui/icons-material/Call";
import UserAvatar from "../../../components/Avatar";

export type CallStatus = "idle" | "dialling" | "ringing" | "connecting" | "active" | "ended" | "failed";

export interface CallState {
  status: CallStatus;
  direction: "outgoing" | "incoming";
  media: "audio" | "video";
  peer: { _id: string; name: string; avatarUrl?: string | null };
  error?: string | null;
}

interface CallDialogProps {
  open: boolean;
  call: CallState | null;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  localStreamRef: React.RefObject<MediaStream | null>;
  remoteStreamRef: React.RefObject<MediaStream | null>;
  muted: boolean;
  cameraOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  elapsed: number;
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const STATUS_LABEL: Record<CallStatus, string> = {
  idle: "",
  dialling: "Calling…",
  ringing: "Incoming call",
  connecting: "Connecting…",
  active: "Connected",
  ended: "Call ended",
  failed: "Call failed",
};

export default function CallDialog({
  open,
  call,
  localVideoRef,
  remoteVideoRef,
  localStreamRef,
  remoteStreamRef,
  muted,
  cameraOff,
  onToggleMute,
  onToggleCamera,
  onAccept,
  onReject,
  onEnd,
  elapsed,
}: CallDialogProps) {
  // MediaStreams must be attached imperatively; refs may mount after the track arrives.
  React.useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  });

  if (!call) return null;
  const isVideo = call.media === "video";
  const isRinging = call.status === "ringing";

  return (
    <Dialog
      open={open}
      fullScreen
      PaperProps={{ sx: { bgcolor: "#050d0b", color: "#f2fffb", backgroundImage: "none" } }}
      onClose={isRinging || call.status === "dialling" ? onReject : onEnd}
    >
      <Box sx={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
        <Box sx={{ flex: 1, position: "relative", minHeight: 0, display: "grid", placeItems: "center" }}>
          {isVideo && call.status === "active" && (
            <Box
              component="video"
              ref={remoteVideoRef}
              autoPlay
              playsInline
              sx={{ width: "100%", height: "100%", objectFit: "cover", background: "#000" }}
            />
          )}
          {(!isVideo || call.status !== "active") && (
            <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
              <UserAvatar src={call.peer.avatarUrl} name={call.peer.name} size={112} />
              <Typography variant="h5">{call.peer.name}</Typography>
              <Typography sx={{ opacity: 0.75 }}>
                {call.status === "active" ? formatElapsed(elapsed) : STATUS_LABEL[call.status]}
                {call.error ? ` — ${call.error}` : ""}
              </Typography>
              {isRinging && <Typography sx={{ opacity: 0.6 }}>{isVideo ? "Video" : "Voice"} call</Typography>}
            </Stack>
          )}

          {isVideo && call.status === "active" && (
            <Box
              component="video"
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              sx={{
                position: "absolute",
                bottom: 16,
                right: 16,
                width: { xs: 110, sm: 160 },
                borderRadius: 3,
                border: "2px solid rgba(255,255,255,0.2)",
                objectFit: "cover",
                background: "#000",
              }}
            />
          )}
        </Box>

        <Stack
          direction="row"
          spacing={{ xs: 1.5, sm: 2.5 }}
          justifyContent="center"
          alignItems="center"
          sx={{ py: 4, px: 2, pb: "calc(24px + env(safe-area-inset-bottom))" }}
        >
          {isRinging ? (
            <>
              <Button
                variant="contained"
                color="error"
                size="large"
                startIcon={<CallEndIcon />}
                onClick={onReject}
                sx={{ borderRadius: 5, px: 3 }}
              >
                Decline
              </Button>
              <Button
                variant="contained"
                color="success"
                size="large"
                startIcon={<CallIcon />}
                onClick={onAccept}
                sx={{ borderRadius: 5, px: 3 }}
              >
                Accept
              </Button>
            </>
          ) : (
            <>
              <Tooltip title={muted ? "Unmute" : "Mute"}>
                <IconButton onClick={onToggleMute} sx={controlStyle}>
                  {muted ? <MicOffIcon /> : <MicIcon />}
                </IconButton>
              </Tooltip>
              {isVideo && (
                <Tooltip title={cameraOff ? "Turn camera on" : "Turn camera off"}>
                  <IconButton onClick={onToggleCamera} sx={controlStyle}>
                    {cameraOff ? <VideocamOffIcon /> : <VideocamIcon />}
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="End call">
                <IconButton onClick={onEnd} sx={{ ...controlStyle, bgcolor: "#ef4444", "&:hover": { bgcolor: "#dc2626" } }}>
                  <CallEndIcon />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Stack>
      </Box>
    </Dialog>
  );
}

const controlStyle = {
  bgcolor: "rgba(255,255,255,0.14)",
  color: "#fff",
  width: 56,
  height: 56,
  "&:hover": { bgcolor: "rgba(255,255,255,0.24)" },
};
