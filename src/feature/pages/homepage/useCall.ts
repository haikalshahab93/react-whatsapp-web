import React from "react";
import type { Socket } from "socket.io-client";
import type { CallState } from "./CallDialog";
import { useToast } from "../../../context/ToastContext";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];
// Note: no TURN relay is configured. Calls between symmetric NATs (some mobile networks)
// will fail; add a TURN server to ICE_SERVERS for production reliability.

interface PeerInfo {
  _id: string;
  name: string;
  avatarUrl?: string | null;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `call-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useCall(socket: Socket | null, chatId?: string) {
  const toast = useToast();
  const [call, setCall] = React.useState<CallState | null>(null);
  const [muted, setMuted] = React.useState(false);
  const [cameraOff, setCameraOff] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);

  const localVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const remoteStreamRef = React.useRef<MediaStream | null>(null);
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const callIdRef = React.useRef<string>("");
  const peerIdRef = React.useRef<string>("");
  const pendingCandidates = React.useRef<RTCIceCandidateInit[]>([]);
  const timerRef = React.useRef<number | null>(null);

  const cleanup = React.useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      pcRef.current?.getSenders().forEach((s) => s.track?.stop());
      pcRef.current?.close();
    } catch {
      /* ignore */
    }
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingCandidates.current = [];
    setMuted(false);
    setCameraOff(false);
    setElapsed(0);
  }, []);

  const finish = React.useCallback(
    (status: CallState["status"], error?: string) => {
      setCall((prev) => (prev ? { ...prev, status, error: error || null } : prev));
      cleanup();
      window.setTimeout(() => setCall(null), status === "ended" || status === "failed" ? 1600 : 0);
    },
    [cleanup]
  );

  const createPeer = React.useCallback(
    (peerId: string, media: "audio" | "video") => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      peerIdRef.current = peerId;

      const remote = new MediaStream();
      remoteStreamRef.current = remote;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;

      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => remote.addTrack(track));
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit("call:ice", { toUserId: peerId, callId: callIdRef.current, candidate: event.candidate.toJSON() });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setCall((prev) => (prev ? { ...prev, status: "active" } : prev));
        }
        if (pc.connectionState === "failed") finish("failed", "Network could not connect the call");
      };

      void media;
      return pc;
    },
    [socket, finish]
  );

  const getMedia = React.useCallback(async (media: "audio" | "video"): Promise<MediaStream> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Your browser does not support calls");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: media === "video" ? { facingMode: "user" } : false,
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }, []);

  React.useEffect(() => {
    if (!socket) return undefined;

    const onIncoming = (payload: {
      callId: string;
      from: PeerInfo;
      chatId: string | null;
      media: "audio" | "video";
      offer: RTCSessionDescriptionInit;
    }) => {
      if (call) {
        socket.emit("call:busy", { toUserId: payload.from._id, callId: payload.callId });
        return;
      }
      callIdRef.current = payload.callId;
      peerIdRef.current = payload.from._id;
      setCall({
        status: "ringing",
        direction: "incoming",
        media: payload.media,
        peer: { _id: payload.from._id, name: payload.from.name, avatarUrl: payload.from.avatarUrl },
      });
      pendingOffer.current = payload.offer;
    };

    const onAnswer = async (payload: { callId: string; answer: RTCSessionDescriptionInit }) => {
      if (payload.callId !== callIdRef.current || !pcRef.current) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
      const queued = pendingCandidates.current;
      pendingCandidates.current = [];
      for (const candidate of queued) {
        await pcRef.current.addIceCandidate(candidate).catch(() => undefined);
      }
    };

    const onIce = async (payload: { callId: string; candidate: RTCIceCandidateInit }) => {
      if (payload.callId !== callIdRef.current || !payload.candidate) return;
      if (!pcRef.current || !pcRef.current.remoteDescription) {
        pendingCandidates.current.push(payload.candidate);
        return;
      }
      await pcRef.current.addIceCandidate(payload.candidate).catch(() => undefined);
    };

    const onRejected = (payload: { callId: string }) => {
      if (payload.callId === callIdRef.current) finish("ended", "Call declined");
    };
    const onEnded = (payload: { callId: string }) => {
      if (payload.callId === callIdRef.current) finish("ended");
    };
    const onUnavailable = (payload: { reason?: string }) => {
      finish("failed", payload?.reason || "User unavailable");
    };
    const onError = (payload: { message?: string }) => finish("failed", payload?.message || "Call error");
    const onBusy = () => finish("ended", "Line busy");

    socket.on("call:incoming", onIncoming);
    socket.on("call:answer", onAnswer);
    socket.on("call:ice", onIce);
    socket.on("call:rejected", onRejected);
    socket.on("call:ended", onEnded);
    socket.on("call:unavailable", onUnavailable);
    socket.on("call:error", onError);
    socket.on("call:busy", onBusy);

    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:answer", onAnswer);
      socket.off("call:ice", onIce);
      socket.off("call:rejected", onRejected);
      socket.off("call:ended", onEnded);
      socket.off("call:unavailable", onUnavailable);
      socket.off("call:error", onError);
      socket.off("call:busy", onBusy);
    };
  }, [socket, call, finish]);

  const pendingOffer = React.useRef<RTCSessionDescriptionInit | null>(null);

  const startCall = React.useCallback(
    async (peer: PeerInfo, media: "audio" | "video") => {
      if (!socket) {
        toast.error("Realtime connection is not ready yet.");
        return;
      }
      if (call) return;
      const callId = newId();
      callIdRef.current = callId;
      peerIdRef.current = peer._id;
      setCall({ status: "dialling", direction: "outgoing", media, peer });

      try {
        const stream = await getMedia(media);
        const pc = createPeer(peer._id, media);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("call:invite", {
          toUserId: peer._id,
          chatId,
          callId,
          media,
          offer: pc.localDescription,
        });
      } catch (e) {
        finish("failed", (e as Error).message || "Could not access your microphone or camera");
      }
    },
    [socket, call, chatId, getMedia, createPeer, finish, toast]
  );

  const acceptCall = React.useCallback(async () => {
    if (!socket || !call || call.direction !== "incoming" || !pendingOffer.current) return;
    setCall((prev) => (prev ? { ...prev, status: "connecting" } : prev));
    try {
      const stream = await getMedia(call.media);
      const pc = createPeer(call.peer._id, call.media);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer.current));
      const queued = pendingCandidates.current;
      pendingCandidates.current = [];
      for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => undefined);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("call:answer", { toUserId: call.peer._id, callId: callIdRef.current, answer: pc.localDescription });
    } catch (e) {
      socket.emit("call:reject", { toUserId: call.peer._id, callId: callIdRef.current });
      finish("failed", (e as Error).message || "Could not access your microphone or camera");
    }
  }, [socket, call, getMedia, createPeer, finish]);

  const endCall = React.useCallback(() => {
    if (socket && peerIdRef.current) {
      socket.emit("call:end", { toUserId: peerIdRef.current, callId: callIdRef.current });
    }
    finish("ended");
  }, [socket, finish]);

  const rejectCall = React.useCallback(() => {
    if (socket && call) {
      socket.emit("call:reject", { toUserId: call.peer._id, callId: callIdRef.current });
    }
    finish("ended");
  }, [socket, call, finish]);

  React.useEffect(() => {
    if (call?.status !== "active") return undefined;
    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [call?.status]);

  const toggleMute = React.useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    const next = !muted;
    tracks.forEach((t) => {
      t.enabled = !next;
    });
    setMuted(next);
  }, [muted]);

  const toggleCamera = React.useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() || [];
    const next = !cameraOff;
    tracks.forEach((t) => {
      t.enabled = !next;
    });
    setCameraOff(next);
  }, [cameraOff]);

  React.useEffect(() => cleanup, [cleanup]);

  return {
    call,
    muted,
    cameraOff,
    elapsed,
    localVideoRef,
    remoteVideoRef,
    localStreamRef,
    remoteStreamRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
  };
}
