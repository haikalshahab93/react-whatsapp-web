export interface Privacy {
  discoverable: boolean;
  showAge: boolean;
  showDistance: boolean;
  showOnline: boolean;
  messagesFrom: "friends" | "everyone";
}

export interface DiscoveryPrefs {
  maxDistanceKm: number;
  genderPreference: "male" | "female" | "all";
  ageMin: number;
  ageMax: number;
}

export interface User {
  _id: string;
  id?: string;
  name: string;
  username?: string | null;
  email?: string;
  phone?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  bio?: string;
  gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
  birthdate?: string | null;
  age?: number | null;
  interests?: string[];
  languages?: string[];
  occupation?: string | null;
  statusMessage?: string;
  online?: boolean;
  isOnline?: boolean;
  lastActiveAt?: string | null;
  verified?: boolean;
  privacy?: Privacy;
  discovery?: DiscoveryPrefs;
  messagesFrom?: "friends" | "everyone";
  distanceKm?: number | null;
  distanceLabel?: string | null;
  likedMe?: boolean;
  isFriend?: boolean;
  createdAt?: string;
}

export interface ChatMember extends User {
  statusMessage?: string;
}

export interface MessageMedia {
  url: string;
  name?: string;
  mime?: string;
  size?: number;
  duration?: number;
  mediaId?: string;
}

export interface Reaction {
  user: string;
  emoji: string;
}

export interface Message {
  _id: string;
  chat: string;
  sender: User | string;
  content: string;
  type: "text" | "image" | "file" | "audio" | "video" | "sticker";
  replyTo?: Message | string | null;
  media?: MessageMedia;
  reactions?: Reaction[];
  deliveredTo?: string[];
  readBy?: string[];
  seenBy?: string[];
  forwarded?: boolean;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface Chat {
  _id: string;
  name: string;
  isGroup: boolean;
  avatarUrl?: string | null;
  description?: string;
  members: ChatMember[];
  admins: string[];
  createdBy?: string | null;
  lastMessage?: Message | null;
  unreadCount?: number;
  pinned?: boolean;
  muted?: boolean;
  isAdmin?: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface NotificationItem {
  _id: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
}

export interface FriendRequestItem {
  _id: string;
  message?: string;
  status?: string;
  createdAt: string;
  from?: User;
  to?: User;
}

export interface DiscoveryFilters {
  gender: "male" | "female" | "all";
  minAge: number;
  maxAge: number;
  maxDistanceKm: number;
  interests: string[];
  onlineOnly: boolean;
}

export interface DiscoveryResponse {
  results: User[];
  page: number;
  hasMore: boolean;
  total: number;
  hasLocation: boolean;
  filters: DiscoveryFilters;
}
