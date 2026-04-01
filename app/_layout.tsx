import React from 'react'
import { Stack } from 'expo-router'
import { AuthProvider } from '../context/AuthContext'
import { ChatProvider } from '../context/ChatContext'
import { SocketProvider } from '../context/SocketContext'

export default function RootLayout() {
  return (
    <AuthProvider>
      <SocketProvider>
        <ChatProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </ChatProvider>
      </SocketProvider>
    </AuthProvider>
  )
}
