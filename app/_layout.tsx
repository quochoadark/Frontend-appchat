import React, { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { LogBox } from 'react-native'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { ChatProvider } from '../context/ChatContext'
import { SocketProvider } from '../context/SocketContext'

// Tắt toàn bộ warning/log hiển thị trên màn hình thiết bị (chỉ dùng trong development)
LogBox.ignoreAllLogs()

/**
 * AuthGuard: Component bảo vệ route dựa trên trạng thái đăng nhập.
 *
 * Logic điều hướng:
 * - Đang tải thông tin user (loading=true) → không làm gì, chờ
 * - Chưa đăng nhập VÀ không ở nhóm route (auth) → redirect về trang login
 * - Đã đăng nhập VÀ đang ở nhóm route (auth) → redirect về tabs (trang chính)
 *
 * segments[0] trả về tên nhóm route đầu tiên trong URL hiện tại.
 * Ví dụ: URL "/(auth)/login" → segments[0] = "(auth)"
 */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    // Chờ cho đến khi AuthContext xác định xong trạng thái đăng nhập
    if (loading) return

    // Kiểm tra xem người dùng có đang ở trong nhóm route xác thực không
    const inAuthGroup = segments[0] === '(auth)'

    if (!user && !inAuthGroup) {
      // Chưa đăng nhập, đang ở trang khác → chuyển về login
      router.replace('/(auth)/login')
    } else if (user && inAuthGroup) {
      // Đã đăng nhập nhưng vẫn ở trang login/register → chuyển vào app
      router.replace('/(tabs)')
    }
  }, [user, loading, segments])

  return <>{children}</>
}

/**
 * RootLayout: Layout gốc của toàn bộ ứng dụng.
 *
 * Thứ tự wrap Provider (ngoài → trong):
 * 1. AuthProvider   — quản lý thông tin user, token, login/logout
 * 2. SocketProvider — quản lý kết nối WebSocket STOMP (cần user để auth)
 * 3. ChatProvider   — quản lý conversations, messages (dùng socket và auth)
 * 4. AuthGuard      — bảo vệ route dựa trên trạng thái đăng nhập
 * 5. Stack          — expo-router Stack navigator (headerShown: false vì mỗi màn tự quản header)
 */
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
