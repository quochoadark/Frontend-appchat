import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/theme'

/**
 * Layout cho nhóm route tabs (trang chính sau khi đăng nhập).
 *
 * Cấu hình thanh tab phía dưới màn hình với 3 tab:
 * - index    → "Tin nhắn"  (icon chatbubbles)
 * - contacts → "Bạn bè"    (icon people)
 * - profile  → "Hồ sơ"     (icon person)
 *
 * screenOptions áp dụng chung cho tất cả tab:
 * - tabBarActiveTintColor:   màu icon/text khi tab đang active
 * - tabBarInactiveTintColor: màu icon/text khi tab không active
 * - headerStyle:             nền header màu primary
 * - headerTintColor:         màu text/icon trên header
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: { borderTopColor: Colors.border },
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      {/* Tab 1: Danh sách tin nhắn (file: app/(tabs)/index.tsx) */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tin nhắn',       // Tên hiển thị trên thanh tab
          headerTitle: 'ChatApp',  // Tiêu đề header khi ở tab này
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Tab 2: Danh sách bạn bè / tìm kiếm người dùng (file: app/(tabs)/contacts.tsx) */}
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Bạn bè',
          headerTitle: 'Bạn bè',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Tab 3: Thông tin cá nhân / đăng xuất (file: app/(tabs)/profile.tsx) */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Hồ sơ',
          headerTitle: 'Hồ sơ',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
