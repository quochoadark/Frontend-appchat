import AsyncStorage from '@react-native-async-storage/async-storage'
import axios from 'axios'

/**
 * URL gốc của backend API.
 * Đọc từ biến môi trường EXPO_PUBLIC_API_URL (file .env).
 * Fallback: địa chỉ local khi develop (thay bằng IP máy tính thực).
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.123.3:8080'
console.log('[API] BASE_URL =', BASE_URL)

/**
 * Axios instance dùng chung cho toàn bộ ứng dụng.
 * - baseURL: tất cả request sẽ prefix với BASE_URL
 * - timeout: 10 giây — tránh treo vô hạn khi mạng chậm
 * - ngrok-skip-browser-warning: bypass trang cảnh báo của ngrok khi dev với tunnel
 */
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'ngrok-skip-browser-warning': 'true',
  },
})

// ─── Unauthorized handler ────────────────────────────────────────────────────

/**
 * Callback được gọi khi nhận lỗi 401 — đăng ký từ AuthContext.
 * Pattern này tránh circular dependency giữa api.ts và AuthContext.
 * (AuthContext import api.ts, nếu api.ts import AuthContext → circular)
 */
let _onUnauthorized: (() => void) | null = null

/**
 * Đăng ký callback xử lý lỗi 401 Unauthorized.
 * Gọi một lần trong AuthProvider khi mount.
 */
export function setUnauthorizedHandler(cb: () => void) {
  _onUnauthorized = cb
}

// ─── Request Interceptor ─────────────────────────────────────────────────────

/**
 * Tự động đính kèm JWT token vào header Authorization của mọi request.
 * Token được lấy từ AsyncStorage trước mỗi request để đảm bảo luôn dùng token mới nhất.
 *
 * Lý do đọc AsyncStorage mỗi lần thay vì cache trong memory:
 * Token có thể được cập nhật (refresh) hoặc xóa (logout) bởi code khác.
 */
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── Response Interceptor ────────────────────────────────────────────────────

/**
 * Xử lý lỗi toàn cục:
 * - 401 Unauthorized: xóa token + user khỏi storage → gọi _onUnauthorized (logout)
 * - Các lỗi khác: log để debug
 *
 * Trả về Promise.reject để lỗi vẫn được throw ra cho caller xử lý.
 */
api.interceptors.response.use(
  (res) => res, // Response thành công: pass through
  async (err) => {
    if (err.response?.status === 401) {
      // Token hết hạn hoặc không hợp lệ → xóa storage và logout
      await AsyncStorage.multiRemove(['token', 'user'])
      _onUnauthorized?.() // Gọi setUser(null) trong AuthContext
    } else {
      console.error('[API Error]', err.message, err.response?.status, err.response?.data)
    }
    return Promise.reject(err)
  }
)

/**
 * Unwrap envelope response của backend.
 * Backend trả về format: { statusCode: number, message: string, data: T }
 * Hàm này trích xuất phần data để code gọi API không cần biết về envelope.
 *
 * Fallback: nếu không có data.data thì dùng data trực tiếp (cho các API không có envelope).
 */
export const unwrap = (res: any) => res?.data?.data ?? res?.data

// ─── Auth ────────────────────────────────────────────────────────────────────

/** POST /auth/login → { accessToken, refreshToken } */
export const loginApi = (email: string, password: string) =>
  api.post('/auth/login', { email, password })

/** POST /auth/register → tạo tài khoản mới, không trả token */
export const registerApi = (data: {
  username: string
  email: string
  password: string
  displayName: string
}) => api.post('/auth/register', data)

/** GET /auth/me → thông tin user đang đăng nhập */
export const getMeApi = () => api.get('/auth/me')

/** POST /auth/logout → server invalidate token */
export const logoutApi = () => api.post('/auth/logout')

// ─── Users ───────────────────────────────────────────────────────────────────

/** GET /users → danh sách tất cả users (dùng để cache thông tin tra tên) */
export const getUsersApi = () => api.get('/users')

/**
 * GET /users/search → tìm kiếm users theo keyword với phân trang.
 * @param keyword Từ khóa tìm kiếm (username hoặc displayName)
 * @param page    Trang hiện tại (0-based, Spring Page)
 * @param size    Số kết quả mỗi trang (mặc định 10)
 * Trả về Spring Page object: { content, last, totalElements, ... }
 */
export const searchUsersApi = (keyword: string, page = 0, size = 10) =>
  api.get('/users/search', { params: { keyword, page, size } })

/** GET /users/{id} → thông tin chi tiết của một user */
export const getUserByIdApi = (id: string) => api.get(`/users/${id}`)

/** PATCH /users/{id} → cập nhật thông tin profile (displayName, bio, avatarUrl) */
export const updateUserApi = (id: string, data: Partial<{
  displayName: string
  bio: string
  avatarUrl: string
}>) => api.patch(`/users/${id}`, data)

// ─── Conversations ───────────────────────────────────────────────────────────

/** GET /conversations → danh sách tất cả conversations của user hiện tại */
export const getConversationsApi = () => api.get('/conversations')

/** GET /conversations/{id} → thông tin đầy đủ của một conversation (gồm participants) */
export const getConversationByIdApi = (id: string) => api.get(`/conversations/${id}`)

/**
 * POST /conversations/direct → tạo hoặc lấy conversation 1-1 với targetUserId.
 * Backend trả về conversation hiện có nếu đã tồn tại (idempotent).
 */
export const createDirectConversationApi = (targetUserId: string) =>
  api.post('/conversations/direct', { targetUserId })

/**
 * POST /conversations/group → tạo nhóm chat mới.
 * participantIds: danh sách userId thành viên (không bao gồm người tạo — backend tự thêm).
 */
export const createGroupConversationApi = (data: {
  name: string
  participantIds: string[]
  description?: string
  avatarUrl?: string
}) => api.post('/conversations/group', data)

/** PUT /conversations/{id} → cập nhật thông tin nhóm (tên, mô tả, avatar) */
export const updateConversationApi = (id: string, data: {
  name?: string
  description?: string
  avatarUrl?: string
}) => api.put(`/conversations/${id}`, data)

/** DELETE /conversations/{id} → xóa conversation */
export const deleteConversationApi = (id: string) =>
  api.delete(`/conversations/${id}`)

// ─── Messages ────────────────────────────────────────────────────────────────

/**
 * GET /conversations/{conversationId}/messages → tải tin nhắn.
 * Trả về theo thứ tự mới nhất trước (OrderByCreatedAtDesc).
 * @param before ISO timestamp để phân trang: lấy tin nhắn trước thời điểm này (load more)
 */
export const getMessagesApi = (conversationId: string, before?: string) =>
  api.get(`/conversations/${conversationId}/messages`, before ? { params: { before } } : undefined)

/**
 * POST /conversations/{conversationId}/messages → gửi tin nhắn qua REST.
 * App dùng REST thay vì STOMP để gửi, đảm bảo tin nhắn xuất hiện ngay trong UI.
 * media: thông tin file/ảnh đã upload (URL từ uploadFileApi)
 */
export const sendMessageRestApi = (conversationId: string, data: {
  messageType: string
  content?: string
  replyToMessageId?: string
  media?: {
    url: string
    fileName?: string
    fileSize?: number
    mimeType?: string
  }
}) => api.post(`/conversations/${conversationId}/messages`, data)

/** DELETE /messages/{messageId} → thu hồi tin nhắn (soft delete — đặt deleted=true) */
export const deleteMessageApi = (messageId: string) =>
  api.delete(`/messages/${messageId}`)

/** POST /conversations/{conversationId}/messages/read → đánh dấu đã đọc tất cả tin nhắn */
export const markAsReadApi = (conversationId: string) =>
  api.post(`/conversations/${conversationId}/messages/read`)

/** GET /conversations/{conversationId}/messages/unread → số tin nhắn chưa đọc */
export const getUnreadCountApi = (conversationId: string) =>
  api.get(`/conversations/${conversationId}/messages/unread`)

// ─── Friends ─────────────────────────────────────────────────────────────────

/** GET /friends → danh sách bạn bè hiện tại */
export const getFriendsApi = () => api.get('/friends')

/** GET /friends/requests/received → lời mời kết bạn nhận được (chờ xử lý) */
export const getFriendRequestsReceivedApi = () =>
  api.get('/friends/requests/received')

/** GET /friends/requests/sent → lời mời kết bạn đã gửi (chờ đối phương xác nhận) */
export const getFriendRequestsSentApi = () =>
  api.get('/friends/requests/sent')

/** POST /friends/requests → gửi lời mời kết bạn đến targetUserId */
export const sendFriendRequestApi = (targetUserId: string) =>
  api.post('/friends/requests', { targetUserId })

/** POST /friends/requests/{requestId}/accept → chấp nhận lời mời kết bạn */
export const acceptFriendRequestApi = (requestId: string) =>
  api.post(`/friends/requests/${requestId}/accept`)

/** POST /friends/requests/{requestId}/decline → từ chối lời mời kết bạn */
export const declineFriendRequestApi = (requestId: string) =>
  api.post(`/friends/requests/${requestId}/decline`)

/** DELETE /friends/requests/{requestId} → huỷ lời mời kết bạn đã gửi */
export const cancelFriendRequestApi = (requestId: string) =>
  api.delete(`/friends/requests/${requestId}`)

/** DELETE /friends/{friendId} → huỷ kết bạn */
export const unfriendApi = (friendId: string) =>
  api.delete(`/friends/${friendId}`)

// ─── Group Member Management ─────────────────────────────────────────────────
// LƯU Ý: Cần xác nhận các endpoint này đã tồn tại trên backend

/** DELETE /conversations/{convId}/members/{userId} → kick thành viên khỏi nhóm */
export const removeGroupMemberApi = (convId: string, userId: string) =>
  api.delete(`/conversations/${convId}/members/${userId}`)

/** POST /conversations/{convId}/admins/{userId} → bầu thành viên lên Nhóm phó */
export const promoteToAdminApi = (convId: string, userId: string) =>
  api.post(`/conversations/${convId}/admins/${userId}`)

/** DELETE /conversations/{convId}/admins/{userId} → hạ chức Nhóm phó xuống Thành viên */
export const demoteFromAdminApi = (convId: string, userId: string) =>
  api.delete(`/conversations/${convId}/admins/${userId}`)

// ─── File Upload ─────────────────────────────────────────────────────────────

/**
 * POST /upload → upload file lên server, trả về URL công khai.
 * formData phải chứa field 'file' với { uri, name, type }.
 * Content-Type multipart/form-data được set thủ công để axios xử lý đúng.
 */
export const uploadFileApi = (formData: FormData) =>
  api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export { BASE_URL }
export default api
