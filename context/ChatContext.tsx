import React, { createContext, useContext, useState, useCallback } from 'react'
import {
  getConversationsApi,
  getMessagesApi,
  sendMessageApi,
  createConversationApi,
  getUsersApi,
} from '../lib/api'

export interface Message {
  _id?: string
  id?: string
  content: string
  sender?: { _id?: string; id?: string; username?: string; name?: string }
  senderId?: string
  conversationId?: string
  createdAt: string
  type?: string
}

export interface Conversation {
  _id?: string
  id?: string
  name?: string
  participants?: any[]
  lastMessage?: Message
  unreadCount?: number
  updatedAt?: string
  type?: string
}

interface ChatContextType {
  conversations: Conversation[]
  activeConv: Conversation | null
  messages: Message[]
  users: any[]
  loadingConvs: boolean
  loadingMsgs: boolean
  loadConversations: () => Promise<void>
  loadUsers: () => Promise<void>
  openConversation: (conv: Conversation) => Promise<void>
  openOrCreateConversation: (userId: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  receiveMessage: (msg: any) => void
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
}

const ChatContext = createContext<ChatContextType | null>(null)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConv, setActiveConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [loadingConvs, setLoadingConvs] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  const loadConversations = useCallback(async () => {
    setLoadingConvs(true)
    try {
      const res = await getConversationsApi()
      setConversations(res.data)
    } catch (err) {
      console.error('Failed to load conversations', err)
    } finally {
      setLoadingConvs(false)
    }
  }, [])

  const loadUsers = useCallback(async () => {
    try {
      const res = await getUsersApi()
      setUsers(res.data)
    } catch (err) {
      console.error('Failed to load users', err)
    }
  }, [])

  const openConversation = useCallback(async (conv: Conversation) => {
    setActiveConv(conv)
    setLoadingMsgs(true)
    try {
      const res = await getMessagesApi(String(conv._id || conv.id))
      setMessages(res.data)
      setConversations((prev) =>
        prev.map((c) =>
          (c._id || c.id) === (conv._id || conv.id) ? { ...c, unreadCount: 0 } : c
        )
      )
    } catch (err) {
      console.error('Failed to load messages', err)
      setMessages([])
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  const openOrCreateConversation = useCallback(
    async (userId: string) => {
      const existing = conversations.find((c) => {
        if (c.type === 'GROUP') return false
        const ids = (c.participants || []).map((p) => String(p._id || p.id || p))
        return ids.includes(String(userId))
      })
      if (existing) {
        await openConversation(existing)
        return
      }
      try {
        const res = await createConversationApi(userId)
        const newConv = res.data
        setConversations((prev) => [newConv, ...prev])
        await openConversation(newConv)
      } catch (err) {
        console.error('Failed to create conversation', err)
      }
    },
    [conversations, openConversation]
  )

  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeConv || !content.trim()) return
      const convId = String(activeConv._id || activeConv.id)
      try {
        const res = await sendMessageApi({ conversationId: convId, content: content.trim() })
        const newMsg = res.data
        setMessages((prev) => [...prev, newMsg])
        setConversations((prev) =>
          prev
            .map((c) =>
              (c._id || c.id) === convId
                ? { ...c, lastMessage: newMsg, updatedAt: newMsg.createdAt }
                : c
            )
            .sort(
              (a, b) =>
                new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
            )
        )
      } catch (err) {
        console.error('Failed to send message', err)
      }
    },
    [activeConv]
  )

  const receiveMessage = useCallback(
    (msg: any) => {
      const convId = msg.conversationId
      setConversations((prev) =>
        prev
          .map((c) =>
            (c._id || c.id) === convId
              ? {
                  ...c,
                  lastMessage: msg,
                  updatedAt: msg.createdAt,
                  unreadCount:
                    activeConv && (activeConv._id || activeConv.id) === convId
                      ? 0
                      : (c.unreadCount || 0) + 1,
                }
              : c
          )
          .sort(
            (a, b) =>
              new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
          )
      )
      if (activeConv && (activeConv._id || activeConv.id) === convId) {
        setMessages((prev) => [...prev, msg])
      }
    },
    [activeConv]
  )

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
        sendMessage,
        receiveMessage,
        setConversations,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export const useChat = () => useContext(ChatContext)!
