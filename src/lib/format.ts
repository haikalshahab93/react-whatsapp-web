export function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Deterministic gradient for avatar fallbacks. */
export function avatarGradient(seed?: string | null): string {
  const palettes = [
    ["#0f9d76", "#38bdf8"],
    ["#7c6cf6", "#c86dd7"],
    ["#f59e0b", "#ef5b7b"],
    ["#2563eb", "#22d3ee"],
    ["#16a34a", "#a3e635"],
    ["#db2777", "#fb923c"],
  ];
  const key = String(seed || "?");
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 9973;
  const [a, b] = palettes[hash % palettes.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export function formatTime(value?: string | Date | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function formatDayLabel(value: string | Date): string {
  const d = new Date(value);
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (isSameDay(d, now)) return "Today";
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

export function formatRelative(value?: string | Date | null): string {
  if (!value) return "";
  const d = new Date(value);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export function formatListTime(value?: string | Date | null): string {
  if (!value) return "";
  const d = new Date(value);
  const now = new Date();
  if (isSameDay(d, now)) return formatTime(d);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export function presenceLabel(online?: boolean, lastActiveAt?: string | null): string {
  if (online) return "Online";
  if (!lastActiveAt) return "Offline";
  return `Last seen ${formatRelative(lastActiveAt)}`;
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function chatDisplayName(
  chat: { name?: string; isGroup?: boolean; members?: { _id: string; name?: string }[] },
  meId?: string
): string {
  if (chat?.isGroup) return chat.name || "Group chat";
  const other = (chat?.members || []).find((m) => String(m._id) !== String(meId));
  return other?.name || chat?.name || "Direct chat";
}

export function chatPartner<T extends { _id: string; name?: string }>(
  chat: { members?: T[] },
  meId?: string
): T | undefined {
  return (chat?.members || []).find((m) => String(m._id) !== String(meId));
}

export function messagePreview(message?: { content?: string; type?: string; deletedAt?: string | null; sender?: unknown } | null): string {
  if (!message) return "No messages yet";
  if (message.deletedAt) return "Message deleted";
  if (message.content) return message.content;
  switch (message.type) {
    case "image":
      return "Photo";
    case "video":
      return "Video";
    case "audio":
      return "Voice message";
    case "file":
      return "Document";
    default:
      return "Message";
  }
}

export function senderName(sender: unknown): string {
  if (!sender) return "Unknown";
  if (typeof sender === "string") return "Unknown";
  const s = sender as { name?: string; username?: string };
  return s.name || s.username || "Unknown";
}

export function senderId(sender: unknown): string {
  if (!sender) return "";
  if (typeof sender === "string") return sender;
  return String((sender as { _id?: string })._id || "");
}
