/**
 * SocketContext — Kết nối WebSocket real-time qua STOMP over SockJS.
 *
 * Backend endpoint: /ws  (Spring WebSocket với SockJS fallback)
 * SockJS WebSocket transport URL: ws://host/ws/{server3}/{session8}/websocket
 *
 * Topics backend publish:
 *   /topic/presence              — USER_ONLINE / USER_OFFLINE broadcasts (tất cả user)
 *   /topic/conversation/{id}     — NEW_MESSAGE, TYPING, READ_RECEIPT (per conversation)
 *
 * Destinations client publish (qua /app prefix của Spring):
 *   /app/chat.send    — gửi tin nhắn mới
 *   /app/chat.typing  — broadcast sự kiện đang gõ
 *   /app/chat.read    — gửi read receipt
 */
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { Client, IMessage, StompSubscription } from '@stomp/stompjs'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from './AuthContext'
import { BASE_URL } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Kiểu dữ liệu notification nhận từ WebSocket.
 * Backend đóng gói tất cả sự kiện trong envelope này.
 */
export interface ChatNotification {
  type: 'NEW_MESSAGE' | 'TYPING' | 'READ_RECEIPT' | 'USER_ONLINE' | 'USER_OFFLINE'
  conversationId?: string
  data?: any // Payload thực tế, kiểu tùy theo type
}

/**
 * Interface của SocketContext — các giá trị và hàm được expose ra ngoài.
 */
interface SocketContextType {
  connected: boolean        // Kết nối STOMP đang active
  onlineUsers: string[]     // Danh sách userId đang online (nhận từ presence topic)
  /** Đăng ký lắng nghe một conversation topic; trả về hàm để unsubscribe */
  subscribeConversation: (
    convId: string,
    onNotification: (n: ChatNotification) => void
  ) => () => void
  /** Gửi tin nhắn qua STOMP /app/chat.send (hiện tại app dùng REST thay thế) */
  sendChatMessage: (req: {
    conversationId: string
    content: string
    messageType?: string
    replyToMessageId?: string
  }) => void
  /** Phát sự kiện đang gõ đến conversation */
  sendTyping: (conversationId: string) => void
  /** Phát read receipt đến conversation */
  sendRead: (conversationId: string) => void
  /** Kiểm tra một user có đang online không */
  isOnline: (userId: string) => boolean
}

const SocketContext = createContext<SocketContextType | null>(null)

// ─── Helper: tạo URL WebSocket SockJS ─────────────────────────────────────────

/**
 * Tạo URL WebSocket theo format SockJS transport:
 * ws://host/ws/{server3}/{session8}/websocket
 *
 * Vì React Native không có SockJS client native, ta tạo thẳng URL WebSocket
 * theo format SockJS thay vì dùng thư viện SockJS.
 *
 * @param base  URL gốc của API (http://host:port)
 * @returns     URL WebSocket SockJS transport
 */
function getSockJsWsUrl(base: string): string {
  const wsBase = base.replace(/^http/, 'ws') // http → ws, https → wss
  const server = String(Math.floor(Math.random() * 900) + 100) // 3 chữ số ngẫu nhiên (100-999)
  const session = Math.random().toString(36).substring(2, 10)   // 8 ký tự alphanumeric ngẫu nhiên
  return `${wsBase}/ws/${server}/${session}/websocket`
}

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * SocketProvider — quản lý vòng đời kết nối WebSocket STOMP.
 *
 * Lifecycle:
 * - Mount với user: tạo STOMP client, kết nối với token JWT trong header
 * - Mất kết nối: tự động reconnect sau 5 giây (reconnectDelay)
 * - Logout (user = null): ngắt kết nối, xóa toàn bộ state online
 *
 * Subscription management:
 * - subsRef: Map<convId, handler> — lưu tất cả subscriptions đang active
 * - Khi reconnect (onConnect): re-subscribe lại tất cả từ subsRef
 *   (STOMP subscription bị mất sau khi ngắt kết nối)
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const clientRef = useRef<Client | null>(null)    // STOMP client instance
  const [connected, setConnected] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]) // Danh sách userId online

  /**
   * Map lưu tất cả subscriptions đang active: convId → handler.
   * Dùng useRef (không phải useState) vì không cần re-render khi thay đổi.
   * Dùng khi reconnect để restore lại tất cả subscriptions.
   */
  const subsRef = useRef<Map<string, (n: ChatNotification) => void>>(new Map())

  /**
   * Effect chính: kết nối/ngắt kết nối WebSocket khi trạng thái user thay đổi.
   *
   * Khi user logout (user = null):
   * - Deactivate client → ngắt kết nối
   * - Xóa state connected và onlineUsers
   *
   * Khi user login (user != null):
   * - Lấy token từ AsyncStorage
   * - Tạo STOMP client với custom WebSocket factory (SockJS URL)
   * - connectHeaders: gửi JWT để server xác thực kết nối WebSocket
   * - reconnectDelay: 5000ms = tự reconnect sau 5 giây nếu mất kết nối
   *
   * cancelled flag: tránh gọi setState sau khi component đã unmount
   * (async race condition khi user thay đổi nhanh)
   */
  useEffect(() => {
    if (!user) {
      clientRef.current?.deactivate()
      clientRef.current = null
      setConnected(false)
      setOnlineUsers([])
      return
    }

    let cancelled = false

    const connect = async () => {
      const token = await AsyncStorage.getItem('token')
      if (!token || cancelled) return

      const client = new Client({
        // Custom factory vì React Native không có SockJS native
        webSocketFactory: () => new WebSocket(getSockJsWsUrl(BASE_URL)),
        connectHeaders: {
          Authorization: `Bearer ${token}`,          // JWT auth
          'ngrok-skip-browser-warning': 'true',       // Bypass ngrok warning page
        },
        reconnectDelay: 5000, // Tự reconnect sau 5 giây nếu bị ngắt

        onConnect: () => {
          if (cancelled) return
          setConnected(true)

          // Subscribe topic presence để nhận sự kiện user online/offline
          client.subscribe('/topic/presence', (msg: IMessage) => {
            try {
              const n: ChatNotification = JSON.parse(msg.body)
              if (n.type === 'USER_OFFLINE' && typeof n.data === 'string') {
                // Xóa user khỏi danh sách online
                setOnlineUsers((prev) => prev.filter((id) => id !== n.data))
              } else if (n.type === 'USER_ONLINE' && typeof n.data === 'string') {
                // Thêm user vào danh sách online (dùng Set để tránh duplicate)
                setOnlineUsers((prev) => [...new Set([...prev, n.data])])
              }
            } catch { /* bỏ qua lỗi parse JSON */ }
          })

          // Re-subscribe lại tất cả conversation topics sau khi reconnect.
          // Cần thiết vì STOMP subscription không persist sau khi ngắt kết nối.
          subsRef.current.forEach((handler, convId) => {
            client.subscribe(
              `/topic/conversation/${convId}`,
              (msg: IMessage) => {
                try { handler(JSON.parse(msg.body)) } catch { /* bỏ qua */ }
              }
            )
          })
        },

        onDisconnect: () => setConnected(false),
        onStompError: (frame) => {
          console.warn('STOMP error', frame.headers['message'])
        },
        onWebSocketError: (evt) => {
          console.warn('WebSocket error', evt)
        },
      })

      clientRef.current = client
      client.activate() // Bắt đầu kết nối
    }

    connect()

    // Cleanup: ngắt kết nối khi user thay đổi hoặc component unmount
    return () => {
      cancelled = true
      clientRef.current?.deactivate()
      clientRef.current = null
      setConnected(false)
    }
  }, [user]) // Chỉ re-run khi user thay đổi (login/logout)

  // ── Public methods ──────────────────────────────────────────────────────────

  /**
   * Subscribe lắng nghe một conversation topic.
   *
   * Cơ chế "pending subscription":
   * - Lưu handler vào subsRef ngay lập tức (dù có connected hay không)
   * - Nếu STOMP đang connected: subscribe ngay, lưu StompSubscription để unsubscribe
   * - Nếu chưa connected: subsRef đã có sẵn, khi reconnect onConnect sẽ re-subscribe
   *
   * Trả về hàm cleanup:
   * - Xóa khỏi subsRef (ngừng nhận sau khi reconnect)
   * - Unsubscribe STOMP nếu đã subscribe
   *
   * Dùng [] dependency vì không dùng bất kỳ state nào — chỉ dùng ref.
   */
  const subscribeConversation = useCallback(
    (convId: string, onNotification: (n: ChatNotification) => void): (() => void) => {
      subsRef.current.set(convId, onNotification) // Lưu để re-subscribe khi reconnect
      let stompSub: StompSubscription | null = null

      if (clientRef.current?.connected) {
        // Client đang connected: subscribe ngay
        stompSub = clientRef.current.subscribe(
          `/topic/conversation/${convId}`,
          (msg: IMessage) => {
            try { onNotification(JSON.parse(msg.body)) } catch { /* bỏ qua */ }
          }
        )
      }
      // Nếu chưa connected: subsRef đã lưu, onConnect sẽ xử lý

      return () => {
        subsRef.current.delete(convId) // Xóa khỏi registry
        stompSub?.unsubscribe()        // Unsubscribe STOMP nếu đã subscribe
      }
    },
    [] // Không có dependency vì chỉ dùng ref
  )

  /**
   * Gửi tin nhắn qua STOMP (hiện tại app dùng REST API thay thế).
   * Giữ lại để có thể chuyển sang STOMP nếu cần.
   */
  const sendChatMessage = useCallback(
    (req: {
      conversationId: string
      content: string
      messageType?: string
      replyToMessageId?: string
    }) => {
      if (!clientRef.current?.connected) {
        console.warn('STOMP not connected – message not sent')
        return
      }
      clientRef.current.publish({
        destination: '/app/chat.send',
        body: JSON.stringify({
          conversationId: req.conversationId,
          content: req.content,
          messageType: req.messageType || 'TEXT',
          replyToMessageId: req.replyToMessageId || null,
        }),
      })
    },
    []
  )

  /**
   * Phát sự kiện "đang gõ" đến conversation.
   * Server sẽ broadcast cho các thành viên khác trong conversation.
   * Dùng && shortcircuit để tránh publish khi chưa connected.
   */
  const sendTyping = useCallback((conversationId: string) => {
    clientRef.current?.connected &&
      clientRef.current.publish({
        destination: '/app/chat.typing',
        body: JSON.stringify({ conversationId }),
      })
  }, [])

  /**
   * Phát read receipt — thông báo mình đã đọc tin nhắn mới nhất.
   * Server dùng để reset unreadCount và cập nhật readBy trên tin nhắn.
   */
  const sendRead = useCallback((conversationId: string) => {
    clientRef.current?.connected &&
      clientRef.current.publish({
        destination: '/app/chat.read',
        body: JSON.stringify({ conversationId }),
      })
  }, [])

  /**
   * Kiểm tra một user có trong danh sách online không.
   * Re-compute khi onlineUsers thay đổi.
   */
  const isOnline = useCallback(
    (userId: string) => onlineUsers.includes(String(userId)),
    [onlineUsers]
  )

  return (
    <SocketContext.Provider
      value={{
        connected,
        onlineUsers,
        subscribeConversation,
        sendChatMessage,
        sendTyping,
        sendRead,
        isOnline,
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

/**
 * Hook để sử dụng SocketContext trong bất kỳ component nào.
 * Dùng ! vì context luôn có giá trị bên trong SocketProvider.
 */
export const useSocket = () => useContext(SocketContext)!
