export interface ChatCardType {
  id?: string;
  name: string;
  lastText?: string;
  lastSeen?: string;
  selected: boolean;
  unreadCount?: number; // jumlah pesan belum dibaca
  pinned?: boolean;     // apakah chat dipin
}
