import AsyncStorage from '@react-native-async-storage/async-storage'
import axios from 'axios'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.123.2:8080'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
})

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await AsyncStorage.removeItem('token')
      await AsyncStorage.removeItem('user')
    }
    return Promise.reject(err)
  }
)

/** Unwrap the backend's ApiResponse envelope: { statusCode, message, data } */
export const unwrap = (res: any) => res?.data?.data ?? res?.data

// ─── Auth ────────────────────────────────────────────────────────────────────

export const loginApi = (email: string, password: string) =>
  api.post('/auth/login', { email, password })

export const registerApi = (data: {
  username: string
  email: string
  password: string
  displayName: string
}) => api.post('/auth/register', data)

// ─── Users ───────────────────────────────────────────────────────────────────

export const getMeApi = () => api.get('/auth/me')

export const logoutApi = () => api.post('/auth/logout')

export const getUsersApi = () => api.get('/users')

export const searchUsersApi = (keyword: string, page = 0, size = 10) =>
  api.get('/users/search', { params: { keyword, page, size } })

export const getUserByIdApi = (id: string) => api.get(`/users/${id}`)

export const updateUserApi = (id: string, data: Partial<{
  displayName: string
  bio: string
  avatarUrl: string
}>) => api.put(`/users/${id}`, data)

// ─── Conversations ───────────────────────────────────────────────────────────

export const getConversationsApi = () => api.get('/conversations')

export const getConversationByIdApi = (id: string) => api.get(`/conversations/${id}`)

export const createDirectConversationApi = (targetUserId: string) =>
  api.post('/conversations/direct', { targetUserId })

export const createGroupConversationApi = (data: {
  name: string
  participantIds: string[]
  description?: string
  avatarUrl?: string
}) => api.post('/conversations/group', data)

export const updateConversationApi = (id: string, data: {
  name?: string
  description?: string
  avatarUrl?: string
}) => api.put(`/conversations/${id}`, data)

export const deleteConversationApi = (id: string) =>
  api.delete(`/conversations/${id}`)

// ─── Messages ────────────────────────────────────────────────────────────────

export const getMessagesApi = (conversationId: string, before?: string) =>
  api.get(`/conversations/${conversationId}/messages`, before ? { params: { before } } : undefined)

export const sendMessageRestApi = (conversationId: string, data: {
  messageType: string
  content?: string
  replyToMessageId?: string
}) => api.post(`/conversations/${conversationId}/messages`, data)

export const deleteMessageApi = (messageId: string) =>
  api.delete(`/messages/${messageId}`)

export const markAsReadApi = (conversationId: string) =>
  api.post(`/conversations/${conversationId}/messages/read`)

export const getUnreadCountApi = (conversationId: string) =>
  api.get(`/conversations/${conversationId}/messages/unread`)

// ─── Friends ─────────────────────────────────────────────────────────────────

export const getFriendsApi = () => api.get('/friends')

export const getFriendRequestsReceivedApi = () =>
  api.get('/friends/requests/received')

export const getFriendRequestsSentApi = () =>
  api.get('/friends/requests/sent')

export const sendFriendRequestApi = (targetUserId: string) =>
  api.post('/friends/requests', { targetUserId })

export const acceptFriendRequestApi = (requestId: string) =>
  api.post(`/friends/requests/${requestId}/accept`)

export const declineFriendRequestApi = (requestId: string) =>
  api.post(`/friends/requests/${requestId}/decline`)

export const cancelFriendRequestApi = (requestId: string) =>
  api.delete(`/friends/requests/${requestId}`)

export const unfriendApi = (friendId: string) =>
  api.delete(`/friends/${friendId}`)

// ─── File Upload ─────────────────────────────────────────────────────────────

export const uploadFileApi = (formData: FormData) =>
  api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export { BASE_URL }
export default api
