import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from './AuthContext'

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:8080'

interface SocketContextType {
  onlineUsers: string[]
  typingUsers: Record<string, string>
  onMessage: (handler: (msg: any) => void) => () => void
  emitTyping: (conversationId: string) => void
  emitStopTyping: (conversationId: string) => void
  joinRoom: (conversationId: string) => void
  isOnline: (userId: string) => boolean
}

const SocketContext = createContext<SocketContextType | null>(null)

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const socketRef = useRef<Socket | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<string[]>([])
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!user) return

    const connect = async () => {
      const token = await AsyncStorage.getItem('token')
      const socket = io(SOCKET_URL, {
        auth: { token },
        query: { token },
        transports: ['websocket', 'polling'],
      })

      socketRef.current = socket

      socket.on('online_users', (users: string[]) => setOnlineUsers(users))
      socket.on('user_online', (userId: string) =>
        setOnlineUsers((prev) => [...new Set([...prev, userId])])
      )
      socket.on('user_offline', (userId: string) =>
        setOnlineUsers((prev) => prev.filter((id) => id !== userId))
      )
      socket.on('typing', ({ conversationId, userId }: { conversationId: string; userId: string }) =>
        setTypingUsers((prev) => ({ ...prev, [conversationId]: userId }))
      )
      socket.on('stop_typing', ({ conversationId }: { conversationId: string }) =>
        setTypingUsers((prev) => {
          const next = { ...prev }
          delete next[conversationId]
          return next
        })
      )
    }

    connect()

    return () => {
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [user])

  const onMessage = (handler: (msg: any) => void) => {
    const socket = socketRef.current
    if (!socket) return () => {}
    socket.on('receive_message', handler)
    return () => socket.off('receive_message', handler)
  }

  const emitTyping = (conversationId: string) =>
    socketRef.current?.emit('typing', { conversationId })

  const emitStopTyping = (conversationId: string) =>
    socketRef.current?.emit('stop_typing', { conversationId })

  const joinRoom = (conversationId: string) =>
    socketRef.current?.emit('join_room', conversationId)

  const isOnline = (userId: string) => onlineUsers.includes(String(userId))

  return (
    <SocketContext.Provider
      value={{ onlineUsers, typingUsers, onMessage, emitTyping, emitStopTyping, joinRoom, isOnline }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)!
