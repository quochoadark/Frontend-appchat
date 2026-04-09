/**
 * Bảng màu dùng chung cho toàn bộ ứng dụng.
 * Phong cách màu lấy cảm hứng từ WhatsApp.
 *
 * Cách dùng: import { Colors } from '../constants/theme'
 * Sau đó dùng Colors.primary, Colors.text, v.v. trong StyleSheet.
 */
export const Colors = {
  // ── Màu chủ đạo (xanh lá WhatsApp) ──────────────────────────────────────
  primary: '#128C7E',        // Màu chính: header, button, tab active, badge
  primaryDark: '#075E54',    // Màu chính đậm hơn: avatar nhóm, sidebar
  primaryLight: '#25D366',   // Màu xanh sáng hơn: online dot, success text, nút Chat

  // ── Màu nền ──────────────────────────────────────────────────────────────
  background: '#EFEAE2',     // Nền vùng tin nhắn (màu kem nhạt)
  surface: '#FFFFFF',        // Nền card, màn hình chính, bubble tin nhắn nhận

  // ── Bubble tin nhắn ───────────────────────────────────────────────────────
  bubbleOut: '#DCF8C6',      // Nền bubble tin nhắn mình gửi (xanh lá rất nhạt)
  bubbleIn: '#FFFFFF',       // Nền bubble tin nhắn nhận được (trắng)

  // ── Màu chữ ──────────────────────────────────────────────────────────────
  text: '#111B21',           // Chữ chính (gần đen)
  textSecondary: '#667781',  // Chữ phụ: timestamp, placeholder, subtitle

  // ── Đường viền và input ──────────────────────────────────────────────────
  border: '#E9EDEF',         // Viền, đường separator giữa các item
  inputBg: '#F0F2F5',        // Nền ô input, search bar, tab inactive background

  // ── Trạng thái ───────────────────────────────────────────────────────────
  online: '#25D366',         // Màu dot online, text "Đang hoạt động"
  danger: '#DC3545',         // Màu lỗi, nút huỷ kết bạn, nút đăng xuất
}
