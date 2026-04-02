import React, { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { ChatProvider } from '../context/ChatContext'
import { SocketProvider } from '../context/SocketContext'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return

    const inAuthGroup = segments[0] === '(auth)'

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)')
    }
  }, [user, loading, segments])

  return <>{children}</>
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <SocketProvider>
        <ChatProvider>
          <AuthGuard>
            <Stack screenOptions={{ headerShown: false }} />
          </AuthGuard>
        </ChatProvider>
      </SocketProvider>
    </AuthProvider>
  )
}
