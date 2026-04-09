import { Redirect } from 'expo-router'
import { View, ActivityIndicator } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { Colors } from '../constants/theme'

/**
 * Màn hình entry point của ứng dụng (route "/").
 *
 * Đây là màn hình đầu tiên được render khi mở app.
 * Chức năng duy nhất là điều hướng người dùng đến đúng màn hình:
 *
 * - Đang tải (loading=true): Hiện spinner toàn màn hình với nền primary
 *   để tránh flash trắng trước khi biết user đã đăng nhập hay chưa
 * - Đã đăng nhập (user != null): Redirect thẳng vào trang tabs (trang chính)
 * - Chưa đăng nhập: Redirect vào trang login
 *
 * AuthGuard trong _layout.tsx cũng xử lý điều hướng,
 * nhưng màn hình này xử lý trường hợp app mới mở lần đầu.
 */
export default function Index() {
  const { user, loading } = useAuth()

  // Hiện loading spinner trong khi AuthContext đang restore session từ storage
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    )
  }

  // Đã đăng nhập → vào app
  if (user) {
    return <Redirect href="/(tabs)" />
  }

  // Chưa đăng nhập → vào trang đăng nhập
  return <Redirect href="/(auth)/login" />
}
