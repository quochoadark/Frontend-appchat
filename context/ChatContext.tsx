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

export interface LastMessage {
  messageId?: string
  senderId?: string
  senderDisplayName?: string
  contentPreview?: string
  messageType?: string
  sentAt?: string
}

export interface Conversation {
  id?: string
  _id?: string
  type?: string        // "DIRECT" | "GROUP"
  participants?: string[]  // user IDs
  name?: string        // GROUP only
  avatarUrl?: string
  description?: string
  adminIds?: string[]
  lastMessage?: LastMessage
  active?: boolean
  createdAt?: string
  updatedAt?: string
  // local-only
  unreadCount?: number
}

export interface Message {
  id?: string
  _id?: string
  conversationId?: string
  senderId?: string
  senderDisplayName?: string
  messageType?: string   // "TEXT" | "IMAGE" | "FILE" | "SYSTEM"
  content?: string
  media?: {
    url?: string
    fileName?: string
    fileSize?: number
    mimeType?: string
    thumbnailUrl?: string
  }
  replyToMessageId?: string
  readBy?: Record<string, string>
  deleted?: boolean
  createdAt?: string
}

interface ChatContextType {
  conversations: Conversation[]
  activeConv: Conversation | null
  messages: Message[]
  users: User[]
  loadingConvs: boolean
  loadingMsgs: boolean
  loadConversations: () => Promise<Conversation[]>
  loadUsers: () => Promise<void>
  openConversation: (conv: Conversation) => Promise<void>
  openOrCreateConversation: (userId: string) => Promise<Conversation | null>
  receiveMessage: (msg: Message) => void
  updateConvLastMessage: (convId: string, msg: Message) => void
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
  getUserDisplayName: (userId: string) => string
}

const ChatContext = createContext<ChatContextType | null>(null)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConv, setActiveConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loadingConvs, setLoadingConvs] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  const getUserDisplayName = useCallback(
    (userId: string) => {
      const u = users.find((x) => String(x.id || x._id) === String(userId))
      return u?.displayName || u?.username || 'Unknown'
    },
    [users]
  )

  const loadConversations = useCallback(async (): Promise<Conversation[]> => {
    setLoadingConvs(true)
    try {
      const res = await getConversationsApi()
      const data: Conversation[] = unwrap(res) || []

      // Fetch unread counts for all conversations in parallel
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
      const unreadMap: Record<string, number> = {}
      unreadResults.forEach(({ convId, count }) => { unreadMap[convId] = count })

      setConversations((prev) =>
        data.map((serverConv) => {
          const convId = String(serverConv.id || serverConv._id)
          const local = prev.find((c) => String(c.id || c._id) === convId)
          return {
            ...serverConv,
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

  const loadUsers = useCallback(async () => {
    try {
      const res = await getUsersApi()
      const data: User[] = unwrap(res) || []
      setUsers(data)
    } catch (err) {
      console.error('Failed to load users', err)
    }
  }, [])

  const openConversation = useCallback(async (conv: Conversation) => {
    setActiveConv(conv)
    setLoadingMsgs(true)
    try {
      const convId = String(conv.id || conv._id)
      const res = await getMessagesApi(convId)
      const data: Message[] = unwrap(res) || []
      // Messages come newest-first from backend (OrderByCreatedAtDesc), reverse for display
      setMessages([...data].reverse())
      // Clear unread badge
      setConversations((prev) =>
        prev.map((c) =>
          String(c.id || c._id) === convId ? { ...c, unreadCount: 0 } : c
        )
      )
      // Mark as read on server (fire and forget)
      markAsReadApi(convId).catch(() => { })
    } catch (err) {
      console.error('Failed to load messages', err)
      setMessages([])
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  const openOrCreateConversation = useCallback(
    async (userId: string): Promise<Conversation | null> => {
      // Check if direct conversation already exists locally
      const existing = conversations.find((c) => {
        if (c.type === 'GROUP') return false
        return (c.participants || []).map(String).includes(String(userId))
      })
      if (existing) {
        await openConversation(existing)
        return existing
      }
      try {
        const res = await createDirectConversationApi(userId)
        const newConv: Conversation = unwrap(res)
        setConversations((prev) => [newConv, ...prev])
        await openConversation(newConv)
        return newConv
      } catch (err) {
        console.error('Failed to create conversation', err)
        return null
      }
    },
    [conversations, openConversation]
  )

  const receiveMessage = useCallback(
    (msg: Message) => {
      const convId = msg.conversationId
      if (!convId) return

      setConversations((prev) =>
        prev
          .map((c) => {
            if (String(c.id || c._id) !== convId) return c
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
              unreadCount: isActive ? 0 : (c.unreadCount || 0) + 1,
            }
          })
          .sort(
            (a, b) =>
              new Date(b.updatedAt || 0).getTime() -
              new Date(a.updatedAt || 0).getTime()
          )
      )

      if (activeConv && String(activeConv.id || activeConv._id) === convId) {
        setMessages((prev) => {
          // Deduplicate by ID
          if (msg.id && prev.some((m) => String(m.id) === String(msg.id))) {
            return prev
          }
          return [...prev, msg]
        })
      }
    },
    [activeConv]
  )

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

export const useChat = () => useContext(ChatContext)!
