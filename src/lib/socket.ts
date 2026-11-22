import { io, Socket } from "socket.io-client";
import { getToken } from "./api";

/**
 * Same-origin by default: the dev proxy and the single-origin production build both
 * forward /socket.io. When the front end is hosted separately, REACT_APP_WS_BASE points
 * at the API host, and an absolute REACT_APP_API_BASE is used as a fallback so only one
 * variable has to be set.
 */
function socketOrigin(): string {
  const env = ((typeof process !== "undefined" && process.env) || {}) as Record<
    string,
    string | undefined
  >;
  if (env.REACT_APP_WS_BASE) return env.REACT_APP_WS_BASE;
  const apiBase = env.REACT_APP_API_BASE;
  if (apiBase && /^https?:\/\//i.test(apiBase)) {
    try {
      return new URL(apiBase).origin;
    } catch {
      /* fall through to same-origin */
    }
  }
  if (typeof window !== "undefined" && window.location) return window.location.origin;
  return "http://localhost:5000";
}

let socket: Socket | null = null;
let socketToken: string | null = null;

export function getSocket(): Socket | null {
  const token = getToken();
  if (!token) return null;

  // Reuse the existing client even while it is still handshaking. Several components call
  // this on mount; recreating the socket here would abort the handshake in a loop so no
  // events would ever be delivered.
  if (socket && socketToken === token) {
    if (!socket.active) socket.connect();
    return socket;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socketToken = token;
  socket = io(socketOrigin(), {
    // Polling first: some proxies/tunnels reject WebSocket upgrades, and Socket.IO still
    // upgrades the transport automatically once a working connection exists.
    transports: ["polling", "websocket"],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 800,
  });
  return socket;
}

/** Fresh connection after a token change (login/logout). */
export function resetSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socketToken = null;
}
