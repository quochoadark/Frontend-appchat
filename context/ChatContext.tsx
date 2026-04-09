import React, { createContext, useCallback, useContext, useState } from 'react'
import {
  createDirectConversationApi,
  getConversationsApi,
  getMessagesApi,
  getUnreadCountApi,
  getUsersApi,
  markAsReadApi,
  unwrap,
} from '../lib/api'
import { User } from './AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Tin nhắn cuối trong một conversation — dùng để hiển thị preview trên danh sách.
 * Đây là subset của Message, không phải object Message đầy đủ.
 */
export interface LastMessage {
  messageId?: string
  senderId?: string
  senderDisplayName?: string
  contentPreview?: string  // Rút gọn nội dung (text), hoặc null nếu là ảnh/file
  messageType?: string     // "TEXT" | "IMAGE" | "FILE"
  sentAt?: string          // ISO timestamp
}

/**
 * Kiểu dữ liệu Conversation — một cuộc trò chuyện (1-1 hoặc nhóm).
 *
 * Lưu ý về id/_id: backend MongoDB trả về _id, DTO Spring map thành id.
 * Để an toàn, luôn dùng String(conv.id || conv._id) khi so sánh.
 *
 * unreadCount là field local-only — không có trong schema backend,
 * được tính từ API /messages/unread và cập nhật khi nhận tin mới.
 */
export interface Conversation {
  id?: string
  _id?: string
  type?: string            // "DIRECT" (1-1) | "GROUP" (nhóm)
  participants?: string[]  // Mảng userID của tất cả thành viên
  name?: string            // Chỉ có với nhóm (GROUP)
  avatarUrl?: string
  description?: string
  adminIds?: string[]      // Chỉ có với nhóm: danh sách admin
  lastMessage?: LastMessage
  active?: boolean
  createdAt?: string
  updatedAt?: string
  // Field local-only — không có trong server response
  unreadCount?: number     // Số tin chưa đọc, cập nhật local
}

/**
 * Kiểu dữ liệu Message — một tin nhắn trong conversation.
 *
 * messageType xác định cách render:
 * - TEXT:   hiển thị msg.content
 * - IMAGE:  hiển thị msg.media.url dưới dạng ảnh
 * - FILE:   hiển thị card file với tên và kích thước
 * - SYSTEM: thông báo hệ thống (thành viên tham gia/rời nhóm)
 *
 * readBy: Map<userId, timestamp> — ai đã đọc và lúc nào.
 */
export interface Message {
  id?: string
  _id?: string
  conversationId?: string
  senderId?: string
  senderDisplayName?: string
  messageType?: string    // "TEXT" | "IMAGE" | "FILE" | "SYSTEM"
  content?: string
  media?: {
    url?: string
    fileName?: string
    fileSize?: number     // bytes
    mimeType?: string
    thumbnailUrl?: string
  }
  replyToMessageId?: string    // ID tin nhắn được reply (nếu có)
  readBy?: Record<string, string> // { userId: timestamp }
  deleted?: boolean             // true = tin nhắn đã bị thu hồi (từ server)
  createdAt?: string
}

/**
 * Interface của ChatContext — tất cả state và method liên quan đến chat.
 */
interface ChatContextType {
  conversations: Conversation[]              // Danh sách tất cả conversations
  activeConv: Conversation | null            // Conversation đang mở
  messages: Message[]                        // Tin nhắn của conversation đang active
  users: User[]                              // Cache thông tin tất cả users (dùng để tra tên)
  loadingConvs: boolean                      // Đang tải danh sách conversations
  loadingMsgs: boolean                       // Đang tải tin nhắn
  loadConversations: () => Promise<Conversation[]>
  loadUsers: () => Promise<void>
  openConversation: (conv: Conversation) => Promise<void>
  openOrCreateConversation: (userId: string) => Promise<Conversation | null>
  receiveMessage: (msg: Message) => void     // Xử lý tin nhắn mới từ WebSocket
  updateConvLastMessage: (convId: string, msg: Message) => void
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
  getUserDisplayName: (userId: string) => string // Tra tên user từ cache
}

const ChatContext = createContext<ChatContextType | null>(null)

/**
 * ChatProvider — quản lý state conversations, messages và users.
 *
 * State chính:
 * - conversations: danh sách đầy đủ, được sắp xếp theo updatedAt mới nhất
 * - activeConv: conversation đang mở trong màn hình chat
 * - messages: tin nhắn của activeConv, sắp xếp cũ → mới (cho FlatList hiển thị đúng)
 * - users: cache thông tin users để tra tên (displayName) theo ID
 */
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConv, setActiveConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loadingConvs, setLoadingConvs] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  /**
   * Tra tên hiển thị của user theo ID từ cache users.
   * Fallback: displayName → username → 'Unknown'
   */
  const getUserDisplayName = useCallback(
    (userId: string) => {
      const u = users.find((x) => String(x.id || x._id) === String(userId))
      return u?.displayName || u?.username || 'Unknown'
    },
    [users]
  )

  /**
   * Tải danh sách conversations từ API.
   *
   * Sau khi tải, gọi song song API lấy unreadCount cho từng conversation.
   * Merge kết quả: giữ lại lastMessage local nếu server không có (tránh mất preview).
   *
   * Tại sao không chỉ dùng dữ liệu server?
   * - Server có thể không trả về lastMessage nếu conversation chưa có tin nhắn
   * - unreadCount được tính riêng, không có trong response của /conversations
   */
  const loadConversations = useCallback(async (): Promise<Conversation[]> => {
    setLoadingConvs(true)
    try {
      const res = await getConversationsApi()
      const data: Conversation[] = unwrap(res) || []

      // Lấy unreadCount song song cho tất cả conversations (O(n) requests song song)
      const unreadResults = await Promise.all(
        data.map(async (conv) => {
          const convId = String(conv.id || conv._id)
          try {
            const r = await getUnreadCountApi(convId)
            return { convId, count: (unwrap(r) as number) || 0 }
          } catch {
            return { convId, count: 0 }
          }
        })
      )
      // Tạo Map để tra cứu O(1)
      const unreadMap: Record<string, number> = {}
      unreadResults.forEach(({ convId, count }) => { unreadMap[convId] = count })

      setConversations((prev) =>
        data.map((serverConv) => {
          const convId = String(serverConv.id || serverConv._id)
          const local = prev.find((c) => String(c.id || c._id) === convId)
          return {
            ...serverConv,
            // Giữ lastMessage local nếu server không có (tránh mất preview)
            lastMessage: serverConv.lastMessage ?? local?.lastMessage,
            unreadCount: unreadMap[convId] ?? local?.unreadCount ?? 0,
          }
        })
      )
      return data
    } catch (err) {
      console.error('Failed to load conversations', err)
      return []
    } finally {
      setLoadingConvs(false)
    }
  }, [])

  /**
   * Tải danh sách tất cả users để cache thông tin (tên, avatar).
   * Dùng để tra tên khi hiển thị conversation 1-1 và trong các danh sách.
   */
  const loadUsers = useCallback(async () => {
    try {
      const res = await getUsersApi()
      const data: User[] = unwrap(res) || []
      setUsers(data)
    } catch (err) {
      console.error('Failed to load users', err)
    }
  }, [])

  /**
   * Mở một conversation — tải tin nhắn và cập nhật state.
   *
   * Flow:
   * 1. Set activeConv ngay để UI biết đang mở conversation nào
   * 2. Tải tin nhắn từ API
   * 3. Đảo ngược mảng: backend trả về newest-first, FlatList cần oldest-first
   * 4. Reset unreadCount về 0 (vì đang xem)
   * 5. Gọi markAsReadApi để server biết (fire and forget)
   */
  const openConversation = useCallback(async (conv: Conversation) => {
    setActiveConv(conv)
    setLoadingMsgs(true)
    try {
      const convId = String(conv.id || conv._id)
      const res = await getMessagesApi(convId)
      const data: Message[] = unwrap(res) || []
      // Backend trả về OrderByCreatedAtDesc (mới nhất trước) → reverse để hiển thị đúng
      setMessages([...data].reverse())
      // Reset badge unread trên danh sách conversations
      setConversations((prev) =>
        prev.map((c) =>
          String(c.id || c._id) === convId ? { ...c, unreadCount: 0 } : c
        )
      )
      // Thông báo server đã đọc (bỏ qua lỗi)
      markAsReadApi(convId).catch(() => { })
    } catch (err) {
      console.error('Failed to load messages', err)
      setMessages([])
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  /**
   * Mở conversation với một user, tạo mới nếu chưa có.
   *
   * Logic:
   * 1. Tìm conversation 1-1 đã tồn tại trong local state (tránh gọi API thừa)
   * 2. Nếu có: mở luôn
   * 3. Nếu chưa có: gọi POST /conversations/direct → nhận conversation mới
   *    → thêm vào đầu danh sách → mở
   *
   * Dùng trong ContactsScreen khi nhấn nút "Chat" trên một người bạn.
   */
  const openOrCreateConversation = useCallback(
    async (userId: string): Promise<Conversation | null> => {
      // Tìm conversation DIRECT đã có với userId này
      const existing = conversations.find((c) => {
        if (c.type === 'GROUP') return false
        return (c.participants || []).map(String).includes(String(userId))
      })
      if (existing) {
        await openConversation(existing)
        return existing
      }
      // Chưa có → tạo mới
      try {
        const res = await createDirectConversationApi(userId)
        const newConv: Conversation = unwrap(res)
        setConversations((prev) => [newConv, ...prev]) // Thêm vào đầu danh sách
        await openConversation(newConv)
        return newConv
      } catch (err) {
        console.error('Failed to create conversation', err)
        return null
      }
    },
    [conversations, openConversation]
  )

  /**
   * Xử lý tin nhắn mới đến từ WebSocket.
   *
   * Thực hiện 2 việc đồng thời:
   *
   * 1. Cập nhật conversations list:
   *    - Cập nhật lastMessage của conversation tương ứng
   *    - Tăng unreadCount (+1) NẾU conversation không đang active
   *    - Nếu đang active (đang xem): unreadCount = 0 (đã đọc ngay)
   *    - Re-sort danh sách theo updatedAt (conversation có tin mới lên đầu)
   *
   * 2. Thêm vào messages list (chỉ khi conversation đang active):
   *    - Deduplicate theo ID: tránh hiện tin 2 lần (từ REST response + WebSocket)
   *
   * Tại sao dùng activeConv trong dependency?
   * - Cần biết conversation nào đang active để quyết định tăng unreadCount hay không
   * - Mỗi lần activeConv thay đổi, receiveMessage được tạo lại với closure mới
   *   (đây là lý do ChatScreen phải re-subscribe WebSocket khi receiveMessage thay đổi)
   */
  const receiveMessage = useCallback(
    (msg: Message) => {
      const convId = msg.conversationId
      if (!convId) return

      setConversations((prev) =>
        prev
          .map((c) => {
            if (String(c.id || c._id) !== convId) return c
            // Kiểm tra conversation này có đang được xem không
            const isActive =
              activeConv && String(activeConv.id || activeConv._id) === convId
            return {
              ...c,
              lastMessage: {
                messageId: msg.id,
                senderId: msg.senderId,
                senderDisplayName: msg.senderDisplayName,
                contentPreview: msg.content,
                messageType: msg.messageType,
                sentAt: msg.createdAt,
              },
              updatedAt: msg.createdAt,
              // Đang xem → unreadCount = 0; không xem → tăng lên 1
              unreadCount: isActive ? 0 : (c.unreadCount || 0) + 1,
            }
          })
          // Sắp xếp lại: conversation có tin mới nhất lên đầu
          .sort(
            (a, b) =>
              new Date(b.updatedAt || 0).getTime() -
              new Date(a.updatedAt || 0).getTime()
          )
      )

      // Chỉ thêm vào messages list nếu đang xem conversation này
      if (activeConv && String(activeConv.id || activeConv._id) === convId) {
        setMessages((prev) => {
          // Deduplicate: không thêm nếu tin nhắn đã tồn tại (nhận từ REST + WebSocket)
          if (msg.id && prev.some((m) => String(m.id) === String(msg.id))) {
            return prev
          }
          return [...prev, msg]
        })
      }
    },
    [activeConv] // Phụ thuộc vào activeConv để đọc đúng conversation đang active
  )

  /**
   * Cập nhật lastMessage của một conversation mà không cần tải lại.
   * Dùng sau khi gửi tin nhắn thành công (optimistic update trên danh sách).
   */
  const updateConvLastMessage = useCallback((convId: string, msg: Message) => {
    setConversations((prev) =>
      prev.map((c) =>
        String(c.id || c._id) === convId
          ? {
            ...c,
            lastMessage: {
              messageId: msg.id,
              senderId: msg.senderId,
              senderDisplayName: msg.senderDisplayName,
              contentPreview: msg.content,
              messageType: msg.messageType,
              sentAt: msg.createdAt,
            },
            updatedAt: msg.createdAt,
          }
          : c
      )
    )
  }, [])

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConv,
        messages,
        users,
        loadingConvs,
        loadingMsgs,
        loadConversations,
        loadUsers,
        openConversation,
        openOrCreateConversation,
        receiveMessage,
        updateConvLastMessage,
        setConversations,
        getUserDisplayName,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

/**
 * Hook để sử dụng ChatContext trong bất kỳ component nào.
 * Dùng ! vì context luôn có giá trị bên trong ChatProvider.
 */
export const useChat = () => useContext(ChatContext)!
