import type { User } from './api';

// ─── Fake Users ───────────────────────────────────────────────────────────────
export const FAKE_USERS: User[] = [
  {
    id: 'u2',
    username: 'binh.tran',
    email: 'binh@demo.com',
    displayName: 'Trần Thị Bình',
    bio: 'UI/UX Designer 🎨',
    isOnline: true,
    createdAt: '2024-01-10T08:00:00Z',
  },
  {
    id: 'u3',
    username: 'cuong.le',
    email: 'cuong@demo.com',
    displayName: 'Lê Minh Cường',
    bio: 'Backend Developer ⚙️',
    isOnline: false,
    createdAt: '2024-01-12T08:00:00Z',
  },
  {
    id: 'u4',
    username: 'dung.pham',
    email: 'dung@demo.com',
    displayName: 'Phạm Thu Dung',
    bio: 'Project Manager 📋',
    isOnline: true,
    createdAt: '2024-01-15T08:00:00Z',
  },
  {
    id: 'u5',
    username: 'em.hoang',
    email: 'em@demo.com',
    displayName: 'Hoàng Văn Em',
    bio: 'Frontend Developer 💻',
    isOnline: false,
    createdAt: '2024-02-01T08:00:00Z',
  },
];

// ─── Helper ────────────────────────────────────────────────────────────────────
const ago = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);

let _id = 1;
const mid = () => `fake-${_id++}`;

// ─── Direct conversation: guest ↔ Bình ────────────────────────────────────────
export const FAKE_DIRECT_MESSAGES = [
  { id: mid(), senderId: 'u2', senderName: 'Trần Thị Bình', content: 'Ơi, hôm nay họp mấy giờ vậy?', sentAt: ago(130) },
  { id: mid(), senderId: 'guest', senderName: 'Khách', content: '3 giờ chiều nha, phòng 201 😊', sentAt: ago(128) },
  { id: mid(), senderId: 'u2', senderName: 'Trần Thị Bình', content: 'OK cảm ơn! Tớ sẽ đến đúng giờ', sentAt: ago(125) },
  { id: mid(), senderId: 'guest', senderName: 'Khách', content: 'Nhớ mang tài liệu dự án theo nha', sentAt: ago(90) },
  { id: mid(), senderId: 'u2', senderName: 'Trần Thị Bình', content: 'Ừ, tớ chuẩn bị xong hết rồi', sentAt: ago(88) },
  { id: mid(), senderId: 'u2', senderName: 'Trần Thị Bình', content: 'Slide bao nhiêu trang vậy?', sentAt: ago(60) },
  { id: mid(), senderId: 'guest', senderName: 'Khách', content: 'Khoảng 20 trang thôi, nhẹ lắm 😄', sentAt: ago(58) },
  { id: mid(), senderId: 'u2', senderName: 'Trần Thị Bình', content: 'Ok nghen! Lát gặp 👋', sentAt: ago(5) },
];

// ─── Group conversation: Nhóm Dự Án Web ───────────────────────────────────────
export const FAKE_GROUP_MEMBERS = [
  FAKE_USERS[1], // Cường
  FAKE_USERS[2], // Dung
  FAKE_USERS[3], // Em
];

export const FAKE_GROUP_MESSAGES = [
  { id: mid(), senderId: 'u3', senderName: 'Lê Minh Cường', content: 'Ae ơi, task frontend xong chưa mọi người?', sentAt: ago(1440) },
  { id: mid(), senderId: 'u4', senderName: 'Phạm Thu Dung', content: 'Tớ xong phần login rồi, đang review', sentAt: ago(1435) },
  { id: mid(), senderId: 'u5', senderName: 'Hoàng Văn Em', content: 'Tớ đang làm phần dashboard, còn 1 tiếng', sentAt: ago(1430) },
  { id: mid(), senderId: 'guest', senderName: 'Khách', content: 'Chat module xong rồi, đang push lên git', sentAt: ago(1420) },
  { id: mid(), senderId: 'u3', senderName: 'Lê Minh Cường', content: 'Tốt! Merge vào nhánh develop thôi 🚀', sentAt: ago(1415) },
  { id: mid(), senderId: 'u4', senderName: 'Phạm Thu Dung', content: 'Mọi người test thử chưa, có bug gì không?', sentAt: ago(180) },
  { id: mid(), senderId: 'u5', senderName: 'Hoàng Văn Em', content: 'Test rồi, ổn hết. Chạy mượt lắm 👍', sentAt: ago(175) },
  { id: mid(), senderId: 'u3', senderName: 'Lê Minh Cường', content: 'Backend API cũng sẵn sàng rồi', sentAt: ago(170) },
  { id: mid(), senderId: 'guest', senderName: 'Khách', content: 'Tốt! Deploy lên staging nhé mọi người', sentAt: ago(60) },
  { id: mid(), senderId: 'u4', senderName: 'Phạm Thu Dung', content: 'Oke, tớ báo sếp luôn 📋', sentAt: ago(58) },
  { id: mid(), senderId: 'u3', senderName: 'Lê Minh Cường', content: 'Cả nhóm làm tốt lắm! 🎉', sentAt: ago(10) },
];
