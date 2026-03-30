import { createContext, useCallback, useContext, useState } from 'react';
import type { User } from '@/lib/api';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName?: string;
  content: string;
  sentAt: Date;
  type: 'TEXT' | 'IMAGE' | 'FILE';
}

export interface Conversation {
  id: string;
  type: 'DIRECT' | 'GROUP';
  partner?: User;       // chỉ dùng cho DIRECT
  groupName?: string;   // chỉ dùng cho GROUP
  members?: User[];     // chỉ dùng cho GROUP
  messages: ChatMessage[];
  lastMessage?: ChatMessage;
  unread: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const t = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
let seq = 0;
const fid = () => `f${++seq}`;

// ─── Fake users ───────────────────────────────────────────────────────────────
const BINH:  User = { id: 'u2', username: 'binh.tran',  email: 'binh@demo.com',  displayName: 'Trần Thị Bình',  bio: 'UI/UX Designer 🎨',      isOnline: true  };
const CUONG: User = { id: 'u3', username: 'cuong.le',   email: 'cuong@demo.com', displayName: 'Lê Minh Cường',  bio: 'Backend Developer ⚙️',   isOnline: false };
const DUNG:  User = { id: 'u4', username: 'dung.pham',  email: 'dung@demo.com',  displayName: 'Phạm Thu Dung',  bio: 'Project Manager 📋',      isOnline: true  };
const EM:    User = { id: 'u5', username: 'em.hoang',   email: 'em@demo.com',    displayName: 'Hoàng Văn Em',   bio: 'Frontend Developer 💻',   isOnline: false };
const GUEST: User = { id: 'guest', username: 'guest',   email: '',               displayName: 'Khách',          isOnline: true };

export const FAKE_CONTACT_USERS = [BINH, CUONG, DUNG, EM];

// ─── Seed conversations ───────────────────────────────────────────────────────
function seedData(): Map<string, Conversation> {
  const map = new Map<string, Conversation>();

  // 1. Direct: guest ↔ Trần Thị Bình
  const dm: ChatMessage[] = [
    { id: fid(), senderId: 'u2',    senderName: 'Trần Thị Bình', content: 'Ơi, hôm nay họp mấy giờ vậy?',           sentAt: t(130), type: 'TEXT' },
    { id: fid(), senderId: 'guest', senderName: 'Khách',          content: '3 giờ chiều nha, phòng 201 😊',           sentAt: t(128), type: 'TEXT' },
    { id: fid(), senderId: 'u2',    senderName: 'Trần Thị Bình', content: 'OK cảm ơn! Tớ sẽ đến đúng giờ',          sentAt: t(125), type: 'TEXT' },
    { id: fid(), senderId: 'guest', senderName: 'Khách',          content: 'Nhớ mang tài liệu dự án theo nha',        sentAt: t(90),  type: 'TEXT' },
    { id: fid(), senderId: 'u2',    senderName: 'Trần Thị Bình', content: 'Ừ, tớ chuẩn bị xong hết rồi',            sentAt: t(88),  type: 'TEXT' },
    { id: fid(), senderId: 'u2',    senderName: 'Trần Thị Bình', content: 'Slide bao nhiêu trang vậy?',              sentAt: t(60),  type: 'TEXT' },
    { id: fid(), senderId: 'guest', senderName: 'Khách',          content: 'Khoảng 20 trang thôi, nhẹ lắm 😄',       sentAt: t(58),  type: 'TEXT' },
    { id: fid(), senderId: 'u2',    senderName: 'Trần Thị Bình', content: 'Ok nghen! Lát gặp 👋',                    sentAt: t(5),   type: 'TEXT' },
  ];
  map.set('u2', { id: 'u2', type: 'DIRECT', partner: BINH, messages: dm, lastMessage: dm[dm.length - 1], unread: 1 });

  // 2. Group: Nhóm Dự Án Web
  const gm: ChatMessage[] = [
    { id: fid(), senderId: 'u3',    senderName: 'Lê Minh Cường',  content: 'Ae ơi, task frontend xong chưa mọi người?',       sentAt: t(1440), type: 'TEXT' },
    { id: fid(), senderId: 'u4',    senderName: 'Phạm Thu Dung',  content: 'Tớ xong phần login rồi, đang review',               sentAt: t(1435), type: 'TEXT' },
    { id: fid(), senderId: 'u5',    senderName: 'Hoàng Văn Em',   content: 'Tớ đang làm phần dashboard, còn 1 tiếng',           sentAt: t(1430), type: 'TEXT' },
    { id: fid(), senderId: 'guest', senderName: 'Khách',          content: 'Chat module xong rồi, đang push lên git',            sentAt: t(1420), type: 'TEXT' },
    { id: fid(), senderId: 'u3',    senderName: 'Lê Minh Cường',  content: 'Tốt! Merge vào nhánh develop thôi 🚀',              sentAt: t(1415), type: 'TEXT' },
    { id: fid(), senderId: 'u4',    senderName: 'Phạm Thu Dung',  content: 'Mọi người test thử chưa, có bug gì không?',          sentAt: t(180),  type: 'TEXT' },
    { id: fid(), senderId: 'u5',    senderName: 'Hoàng Văn Em',   content: 'Test rồi, ổn hết. Chạy mượt lắm 👍',               sentAt: t(175),  type: 'TEXT' },
    { id: fid(), senderId: 'u3',    senderName: 'Lê Minh Cường',  content: 'Backend API cũng sẵn sàng rồi',                     sentAt: t(170),  type: 'TEXT' },
    { id: fid(), senderId: 'guest', senderName: 'Khách',          content: 'Tốt! Deploy lên staging nhé mọi người',             sentAt: t(60),   type: 'TEXT' },
    { id: fid(), senderId: 'u4',    senderName: 'Phạm Thu Dung',  content: 'Oke, tớ báo sếp luôn 📋',                          sentAt: t(58),   type: 'TEXT' },
    { id: fid(), senderId: 'u3',    senderName: 'Lê Minh Cường',  content: 'Cả nhóm làm tốt lắm! 🎉',                          sentAt: t(10),   type: 'TEXT' },
  ];
  map.set('group1', {
    id: 'group1', type: 'GROUP',
    groupName: 'Nhóm Dự Án Web 🚀',
    members: [GUEST, CUONG, DUNG, EM],
    messages: gm, lastMessage: gm[gm.length - 1], unread: 2,
  });

  return map;
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface ChatState {
  conversations: Map<string, Conversation>;
  getOrCreate: (partner: User) => Conversation;
  sendMessage: (convId: string, senderId: string, senderName: string, content: string) => void;
  markRead: (convId: string) => void;
}

const ChatContext = createContext<ChatState>({
  conversations: new Map(),
  getOrCreate: () => ({ id: '', type: 'DIRECT', messages: [], unread: 0 }),
  sendMessage: () => {},
  markRead: () => {},
});

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Map<string, Conversation>>(seedData);

  const getOrCreate = useCallback((partner: User): Conversation => {
    if (conversations.has(partner.id)) return conversations.get(partner.id)!;
    const newConv: Conversation = { id: partner.id, type: 'DIRECT', partner, messages: [], unread: 0 };
    setConversations((prev) => new Map(prev).set(partner.id, newConv));
    return newConv;
  }, [conversations]);

  const sendMessage = useCallback((convId: string, senderId: string, senderName: string, content: string) => {
    setConversations((prev) => {
      const conv = prev.get(convId);
      if (!conv) return prev;
      const msg: ChatMessage = { id: `msg-${Date.now()}`, senderId, senderName, content, sentAt: new Date(), type: 'TEXT' };
      return new Map(prev).set(convId, { ...conv, messages: [...conv.messages, msg], lastMessage: msg, unread: 0 });
    });
  }, []);

  const markRead = useCallback((convId: string) => {
    setConversations((prev) => {
      const conv = prev.get(convId);
      if (!conv || conv.unread === 0) return prev;
      return new Map(prev).set(convId, { ...conv, unread: 0 });
    });
  }, []);

  return (
    <ChatContext.Provider value={{ conversations, getOrCreate, sendMessage, markRead }}>
      {children}
    </ChatContext.Provider>
  );
}

export const useChat = () => useContext(ChatContext);
