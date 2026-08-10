import AsyncStorage from '@react-native-async-storage/async-storage' // Dùng để lưu trữ dữ liệu (như Token) vào bộ nhớ cục bộ của điện thoại
import axios from 'axios' // Thư viện dùng để gọi API (Gửi request HTTP)

/**
 * URL gốc của backend API.
 * Nó sẽ ưu tiên đọc địa chỉ từ biến môi trường EXPO_PUBLIC_API_URL (trong file .env).
 * Fallback: Nếu không có file .env, nó sẽ dùng địa chỉ local mặc định (http://192.168.123.3:8080).
 * LƯU Ý: Khi chạy trên điện thoại thật, không dùng được 'localhost', phải dùng IP của máy tính (IP LAN).
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.123.3:8080'
console.log('[API] BASE_URL =', BASE_URL) // In ra màn hình console để biết app đang gọi đến server nào

/**
 * Tạo một "Axios instance" dùng chung cho toàn bộ ứng dụng.
 * Việc này giúp:
 * - Không phải lặp lại đoạn BASE_URL ở mỗi lần gọi API.
 * - Có thể cấu hình chung thời gian chờ (timeout) cho mọi Request.
 * - Có thể cấu hình chung các Header.
 */
const api = axios.create({
  baseURL: BASE_URL, // Gắn tiền tố đường dẫn cho mọi API
  timeout: 10000, // Cài đặt thời gian chờ tối đa 10 giây. Nếu mạng lag quá 10s sẽ tự ngắt tránh treo máy.
  headers: {
    // Header đặc biệt dùng khi phát triển bằng Ngrok (để bỏ qua trang cảnh báo của Ngrok)
    'ngrok-skip-browser-warning': 'true', 
  },
})

// ─── PHẦN XỬ LÝ LỖI HẾT HẠN TOKEN (UNAUTHORIZED) ────────────────────────────────────────────────────

/**
 * Biến lưu trữ một hàm callback. Hàm này sẽ được gọi khi phát hiện lỗi 401 (Lỗi chưa xác thực/Hết hạn token).
 * Tại sao phải dùng biến ngoài thay vì import thẳng AuthContext vào đây?
 * → Để tránh lỗi "Circular Dependency" (Vòng lặp import: api.ts gọi AuthContext, AuthContext lại gọi api.ts).
 */
let _onUnauthorized: (() => void) | null = null

/**
 * Hàm này dùng để AuthContext truyền cái hàm xử lý đăng xuất của nó vào đây.
 * Sẽ được gọi 1 lần duy nhất lúc app khởi động (trong AuthProvider).
 */
export function setUnauthorizedHandler(cb: () => void) {
  _onUnauthorized = cb
}

// ─── REQUEST INTERCEPTOR (MÀNG LỌC TRƯỚC KHI GỬI REQUEST) ─────────────────────────────────────────────────────

/**
 * Interceptor.request: Đứng chặn mọi Request TRƯỚC KHI chúng được gửi lên Server.
 * Chức năng: Tự động móc lấy JWT Token từ bộ nhớ điện thoại và nhét vào cái Header "Authorization".
 * 
 * Tại sao phải đọc AsyncStorage mỗi lần gửi?
 * → Vì Token có thể bị thay đổi (khi user đăng nhập lại, hoặc khi cấp mới token). 
 * Đọc trực tiếp sẽ đảm bảo luôn dùng cái mới nhất.
 */
api.interceptors.request.use(async (config) => {
  // Bới trong bộ nhớ đệm lấy cái thẻ 'token' ra
  const token = await AsyncStorage.getItem('token')
  
  if (token) {
    // Nếu có token, nhét vào Header với định dạng chuẩn Bearer Token
    config.headers.Authorization = `Bearer ${token}`
  }
  // Cho phép Request tiếp tục bay lên server
  return config
})

// ─── RESPONSE INTERCEPTOR (MÀNG LỌC SAU KHI SERVER TRẢ KẾT QUẢ VỀ) ────────────────────────────────────────────────────

/**
 * Interceptor.response: Đứng chặn mọi Response TỪ SERVER trả về TRƯỚC KHI đưa vào Code của mình.
 * Chức năng: Xử lý lỗi tập trung. Đặc biệt là lỗi 401 (Hết hạn Token).
 */
api.interceptors.response.use(
  (res) => res, // Nếu gọi API thành công (Mã 2xx): Cho đi qua bình thường
  async (err) => {
    // Nếu bị lỗi
    if (err.response?.status === 401) {
      // Bắt trúng lỗi 401 (Lỗi xác thực)
      // Tiến hành dọn dẹp: Xóa sạch token và dữ liệu user đang lưu
      await AsyncStorage.multiRemove(['token', 'user'])
      // Kích hoạt hàm xử lý đăng xuất (đẩy văng user ra màn hình Login)
      _onUnauthorized?.()
    } else {
      // Với các lỗi khác: In log ra màn hình console để DEV dễ debug
      console.error('[LỖI API]', err.message, err.response?.status, err.response?.data)
    }
    // Vẫn ném lỗi này ra ngoài để đoạn code nào gọi API tự biết đường hiện thông báo cho User (VD: báo lỗi mật khẩu sai)
    return Promise.reject(err)
  }
)

/**
 * Hàm bóc tách dữ liệu (Unwrap payload).
 * Server Backend Spring Boot thường bọc kết quả trong cấu trúc: { statusCode: 200, message: "OK", data: {...} }
 * Hàm này giúp bóc cái vỏ ngoài ra, chỉ lấy đúng cái ruột "data" để dùng cho gọn.
 */
export const unwrap = (res: any) => res?.data?.data ?? res?.data

// ─── CÁC HÀM GỌI API LIÊN QUAN ĐẾN XÁC THỰC (AUTH) ────────────────────────────────────────────────────────────────────

/** Gọi API Đăng nhập: Trả về Access Token và Refresh Token */
export const loginApi = (email: string, password: string) =>
  api.post('/auth/login', { email, password })

/** Gọi API Đăng ký tài khoản mới */
export const registerApi = (data: {
  username: string
  email: string
  password: string
  displayName: string
}) => api.post('/auth/register', data)

/** Gọi API Lấy thông tin user hiện tại (Dựa theo Token đang có) */
export const getMeApi = () => api.get('/auth/me')

/** Gọi API Đăng xuất: Báo cho Server biết để đưa Token vào danh sách đen (Blacklist) */
export const logoutApi = () => api.post('/auth/logout')

// ─── CÁC HÀM GỌI API VỀ NGƯỜI DÙNG (USERS) ───────────────────────────────────────────────────────────────────

/** Lấy danh sách tất cả user trong hệ thống */
export const getUsersApi = () => api.get('/users')

/**
 * Gọi API Tìm kiếm người dùng có hỗ trợ phân trang
 * @param keyword Tên người dùng cần tìm
 * @param page    Số thứ tự trang (Bắt đầu từ 0)
 * @param size    Số lượng kết quả trên mỗi trang
 */
export const searchUsersApi = (keyword: string, page = 0, size = 10) =>
  api.get('/users/search', { params: { keyword, page, size } })

/** Lấy thông tin chi tiết của 1 user bất kỳ theo ID của họ */
export const getUserByIdApi = (id: string) => api.get(`/users/${id}`)

/** Cập nhật thông tin profile của user (Đổi tên, mô tả, đổi Avatar) */
export const updateUserApi = (id: string, data: Partial<{
  displayName: string
  bio: string
  avatarUrl: string
}>) => api.patch(`/users/${id}`, data)

// ─── CÁC HÀM GỌI API VỀ CUỘC TRÒ CHUYỆN (CONVERSATIONS) ───────────────────────────────────────────────────────────

/** Lấy danh sách toàn bộ các đoạn chat (box chat) của người dùng hiện tại */
export const getConversationsApi = () => api.get('/conversations')

/** Lấy thông tin chi tiết (gồm các thành viên) của 1 box chat cụ thể */
export const getConversationByIdApi = (id: string) => api.get(`/conversations/${id}`)

/**
 * Tạo mới hoặc mở một cuộc trò chuyện 1-1 với người khác.
 * Nếu đã từng chat với người này, server sẽ trả về box chat cũ.
 */
export const createDirectConversationApi = (targetUserId: string) =>
  api.post('/conversations/direct', { targetUserId })

/** Tạo một Box chat Nhóm mới */
export const createGroupConversationApi = (data: {
  name: string // Tên nhóm
  participantIds: string[] // Danh sách ID những người được mời vào
  description?: string
  avatarUrl?: string
}) => api.post('/conversations/group', data)

/** Sửa thông tin của Group Chat (Đổi tên, avatar) */
export const updateConversationApi = (id: string, data: {
  name?: string
  description?: string
  avatarUrl?: string
}) => api.put(`/conversations/${id}`, data)

/** Xóa bỏ hoàn toàn một cuộc trò chuyện khỏi hệ thống */
export const deleteConversationApi = (id: string) =>
  api.delete(`/conversations/${id}`)

// ─── CÁC HÀM GỌI API VỀ TIN NHẮN (MESSAGES) ────────────────────────────────────────────────────────────────

/**
 * Lấy lịch sử tin nhắn trong 1 box chat.
 * @param before Mốc thời gian (Nếu truyền vào, nó sẽ lấy các tin cũ hơn mốc này - Phục vụ tính năng Vuốt lên tải thêm)
 */
export const getMessagesApi = (conversationId: string, before?: string) =>
  api.get(`/conversations/${conversationId}/messages`, before ? { params: { before } } : undefined)

/**
 * Bắn tin nhắn vào một Box Chat (Thông qua cổng API REST).
 * Dữ liệu bao gồm Loại tin nhắn, Nội dung, ID tin nhắn được trả lời, và File đính kèm.
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

/** Thu hồi (xóa) một tin nhắn cụ thể của bản thân */
export const deleteMessageApi = (messageId: string) =>
  api.delete(`/messages/${messageId}`)

/** Thả cảm xúc (icon trái tim, haha...) vào tin nhắn */
export const reactToMessageApi = (messageId: string, emoji?: string) =>
  api.post(`/messages/${messageId}/react`, null, { params: { emoji } })

/** Bắn tín hiệu "Đã đọc tất cả" trong box chat này lên Server */
export const markAsReadApi = (conversationId: string) =>
  api.post(`/conversations/${conversationId}/messages/read`)

/** Hỏi server đếm xem mình còn bao nhiêu tin nhắn chưa đọc trong box chat này */
export const getUnreadCountApi = (conversationId: string) =>
  api.get(`/conversations/${conversationId}/messages/unread`)

// ─── CÁC HÀM GỌI API VỀ BẠN BÈ (FRIENDS) ─────────────────────────────────────────────────────────────────

/** Lấy danh sách bạn bè hiện tại đã kết bạn thành công */
export const getFriendsApi = () => api.get('/friends')

/** Xem ai đang gửi lời mời kết bạn cho mình (Chờ mình đồng ý) */
export const getFriendRequestsReceivedApi = () =>
  api.get('/friends/requests/received')

/** Xem mình đang gửi lời mời kết bạn cho ai (Đang chờ người ta đồng ý) */
export const getFriendRequestsSentApi = () =>
  api.get('/friends/requests/sent')

/** Gửi lời mời kết bạn đến 1 người lạ */
export const sendFriendRequestApi = (targetUserId: string) =>
  api.post('/friends/requests', { targetUserId })

/** Đồng ý lời mời kết bạn (Dựa vào ID của cái lời mời đó) */
export const acceptFriendRequestApi = (requestId: string) =>
  api.post(`/friends/requests/${requestId}/accept`)

/** Từ chối lời mời kết bạn (Bỏ qua) */
export const declineFriendRequestApi = (requestId: string) =>
  api.post(`/friends/requests/${requestId}/decline`)

/** Rút lại lời mời kết bạn mình đã trót gửi đi */
export const cancelFriendRequestApi = (requestId: string) =>
  api.delete(`/friends/requests/${requestId}`)

/** Xóa bạn bè (Unfriend) */
export const unfriendApi = (friendId: string) =>
  api.delete(`/friends/${friendId}`)

// ─── CÁC HÀM QUẢN LÝ NHÓM (GROUP MEMBER MANAGEMENT) ─────────────────────────────────────────────────

/** Đuổi (Kick) một thành viên nào đó ra khỏi nhóm chat */
export const removeGroupMemberApi = (convId: string, userId: string) =>
  api.delete(`/conversations/${convId}/members/${userId}`)

/** Thăng quyền một thành viên lên làm Phó Nhóm (Admin) */
export const promoteToAdminApi = (convId: string, userId: string) =>
  api.post(`/conversations/${convId}/admins/${userId}`)

/** Giáng chức Phó Nhóm trở lại thành Thành viên thường */
export const demoteFromAdminApi = (convId: string, userId: string) =>
  api.delete(`/conversations/${convId}/admins/${userId}`)

// ─── CÁC HÀM GỌI API VỀ TẢI FILE (FILE UPLOAD) ─────────────────────────────────────────────────────────────

/**
 * Đẩy hình ảnh/file (Upload) từ điện thoại lên Server để lấy link (URL).
 * Gửi theo dạng "multipart/form-data" (Dạng đặc biệt chuyên dùng cho file vật lý).
 */
export const uploadFileApi = (formData: FormData) =>
  api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

// Cho phép các file khác được quyền xuất trực tiếp BASE_URL và Axios Instance
export { BASE_URL }
export default api
