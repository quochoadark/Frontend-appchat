import AsyncStorage from '@react-native-async-storage/async-storage'
import axios from 'axios'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080'

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

export const loginApi = (email: string, password: string) =>
  api.post('/api/auth/login', { email, password })

export const getMeApi = () =>
  api.get('/api/auth/me')

export const getUsersApi = () =>
  api.get('/api/users')

export const getConversationsApi = () =>
  api.get('/api/conversations')

export const getMessagesApi = (conversationId: string) =>
  api.get(`/api/messages/${conversationId}`)

export const sendMessageApi = (data: { conversationId: string; content: string }) =>
  api.post('/api/messages', data)

export const createConversationApi = (participantId: string) =>
  api.post('/api/conversations', { participantId })

export default api