/**
 * SocketContext – STOMP over SockJS (Spring WebSocket backend)
 *
 * Backend endpoint: /ws  (withSockJS())
 * SockJS raw WebSocket transport URL: ws://host/ws/{server}/{session}/websocket
 *
 * Topics:
 *   /topic/presence              – USER_OFFLINE broadcasts
 *   /topic/conversation/{id}     – NEW_MESSAGE, TYPING, READ_RECEIPT
 */
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { Client, IMessage, StompSubscription } from '@stomp/stompjs'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from './AuthContext'
import { BASE_URL } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatNotification {
  type: 'NEW_MESSAGE' | 'TYPING' | 'READ_RECEIPT' | 'USER_ONLINE' | 'USER_OFFLINE'
  conversationId?: string
  data?: any
}

interface SocketContextType {
  connected: boolean
  onlineUsers: string[]
  /** Subscribe to a conversation topic; returns an unsubscribe function */
  subscribeConversation: (
    convId: string,
    onNotification: (n: ChatNotification) => void
  ) => () => void
  /** Send a chat message via STOMP /app/chat.send */
  sendChatMessage: (req: {
    conversationId: string
    content: string
    messageType?: string
    replyToMessageId?: string
  }) => void
  /** Broadcast typing event */
  sendTyping: (conversationId: string) => void
  /** Broadcast read receipt */
  sendRead: (conversationId: string) => void
  isOnline: (userId: string) => boolean
}

const SocketContext = createContext<SocketContextType | null>(null)

// ─── SockJS raw WebSocket URL ─────────────────────────────────────────────────

function getSockJsWsUrl(base: string): string {
  // SockJS WebSocket transport path: /{base}/{server3}/{session8}/websocket
  const wsBase = base.replace(/^http/, 'ws')
  const server = String(Math.floor(Math.random() * 900) + 100)
  const session = Math.random().toString(36).substring(2, 10)
  return `${wsBase}/ws/${server}/${session}/websocket`
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const clientRef = useRef<Client | null>(null)
  const [connected, setConnected] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState<string[]>([])
  // Track all active subscriptions so we can resubscribe after reconnect
  const subsRef = useRef<Map<string, (n: ChatNotification) => void>>(new Map())

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
        webSocketFactory: () => new WebSocket(getSockJsWsUrl(BASE_URL)),
        connectHeaders: {
          Authorization: `Bearer ${token}`,
        },
        reconnectDelay: 5000,

        onConnect: () => {
          if (cancelled) return
          setConnected(true)

          // Subscribe to presence broadcasts
          client.subscribe('/topic/presence', (msg: IMessage) => {
            try {
              const n: ChatNotification = JSON.parse(msg.body)
              if (n.type === 'USER_OFFLINE' && typeof n.data === 'string') {
                setOnlineUsers((prev) => prev.filter((id) => id !== n.data))
              } else if (n.type === 'USER_ONLINE' && typeof n.data === 'string') {
                setOnlineUsers((prev) => [...new Set([...prev, n.data])])
              }
            } catch { /* ignore parse errors */ }
          })

          // Resubscribe to any conversation topics that were registered before reconnect
          subsRef.current.forEach((handler, convId) => {
            client.subscribe(
              `/topic/conversation/${convId}`,
              (msg: IMessage) => {
                try { handler(JSON.parse(msg.body)) } catch { /* ignore */ }
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
      client.activate()
    }

    connect()

    return () => {
      cancelled = true
      clientRef.current?.deactivate()
      clientRef.current = null
      setConnected(false)
    }
  }, [user])

  // ── Public methods ──────────────────────────────────────────────────────────

  const subscribeConversation = useCallback(
    (convId: string, onNotification: (n: ChatNotification) => void): (() => void) => {
      subsRef.current.set(convId, onNotification)
      let stompSub: StompSubscription | null = null

      if (clientRef.current?.connected) {
        stompSub = clientRef.current.subscribe(
          `/topic/conversation/${convId}`,
          (msg: IMessage) => {
            try { onNotification(JSON.parse(msg.body)) } catch { /* ignore */ }
          }
        )
      }

      return () => {
        subsRef.current.delete(convId)
        stompSub?.unsubscribe()
      }
    },
    []
  )

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

  const sendTyping = useCallback((conversationId: string) => {
    clientRef.current?.connected &&
      clientRef.current.publish({
        destination: '/app/chat.typing',
        body: JSON.stringify({ conversationId }),
      })
  }, [])

  const sendRead = useCallback((conversationId: string) => {
    clientRef.current?.connected &&
      clientRef.current.publish({
        destination: '/app/chat.read',
        body: JSON.stringify({ conversationId }),
      })
  }, [])

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

export const useSocket = () => useContext(SocketContext)!
