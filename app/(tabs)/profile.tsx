import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native'
import { useAuth } from '../../context/AuthContext'
import UserAvatar from '../../components/common/UserAvatar'
import { Colors } from '../../constants/theme'

/**
 * Màn hình Hồ sơ cá nhân.
 *
 * Hiển thị thông tin của người dùng đang đăng nhập:
 * - Avatar với trạng thái online (luôn hiện "Đang hoạt động" vì đang dùng app)
 * - Tên hiển thị, username, email trên nền primary
 * - Card thông tin chi tiết: tên, username, email, bio, trạng thái
 * - Nút đăng xuất với confirm dialog
 *
 * Màn hình này chỉ đọc, chưa có chức năng chỉnh sửa thông tin.
 */
export default function ProfileScreen() {
  const { user, logout } = useAuth()

  // Tên hiển thị: ưu tiên displayName → username → fallback 'User'
  const name = user?.displayName || user?.username || 'User'

  /**
   * Xử lý đăng xuất với confirm dialog để tránh bấm nhầm.
   * Gọi logout() từ AuthContext sau khi user xác nhận.
   * AuthGuard trong _layout.tsx sẽ tự redirect về login.
   */
  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ])
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Phần header: Avatar + tên + username + email trên nền primary */}
      <View style={styles.avatarSection}>
        {/* online=true vì người dùng đang sử dụng app */}
        <UserAvatar name={name} size="lg" online />
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.username}>@{user?.username || ''}</Text>
        <Text style={styles.email}>{user?.email || ''}</Text>
      </View>

      {/* Card thông tin chi tiết */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Thông tin cá nhân</Text>
        </View>

        {/* Các hàng thông tin: label (trái) + value (phải) */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Tên hiển thị</Text>
          <Text style={styles.rowValue}>{user?.displayName || '—'}</Text>
        </View>
        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Tên người dùng</Text>
          <Text style={styles.rowValue}>@{user?.username || '—'}</Text>
        </View>
        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Email</Text>
          <Text style={styles.rowValue}>{user?.email || '—'}</Text>
        </View>
        <View style={styles.divider} />

        {/* Bio: hiện màu mờ nếu chưa cập nhật */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Giới thiệu</Text>
          <Text style={[styles.rowValue, !user?.bio && { color: Colors.textSecondary }]}>
            {user?.bio || 'Chưa cập nhật'}
          </Text>
        </View>
        <View style={styles.divider} />

        {/* Trạng thái: luôn hiện "Đang hoạt động" với dot xanh */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Trạng thái</Text>
          <View style={styles.onlineRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Đang hoạt động</Text>
          </View>
        </View>
      </View>

      {/* Nút đăng xuất - viền đỏ nhạt, text đỏ */}
      <TouchableOpacity style={styles.btnLogout} onPress={handleLogout}>
        <Text style={styles.btnLogoutText}>🚪  Đăng xuất</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.inputBg, // Nền xám nhạt
  },

  // Phần header màu primary chứa avatar và tên
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 28,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
  },
  name: {
    marginTop: 12,
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  username: {
    marginTop: 2,
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  email: {
    marginTop: 2,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },

  // Card thông tin chi tiết
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    margin: 16,
    marginBottom: 12,
  },
  cardHeader: {
    paddingVertical: 14,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },

  // Mỗi hàng thông tin: label flex:1 bên trái, value bên phải
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  rowLabel: { flex: 1, fontSize: 14, color: Colors.textSecondary },
  rowValue: { fontSize: 14, color: Colors.text, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },

  // Trạng thái online với dot xanh
  onlineRow: { flexDirection: 'row', alignItems: 'center' },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.online,
    marginRight: 6,
  },
  onlineText: {
    fontSize: 14,
    color: Colors.online,
    fontWeight: '500',
  },

  divider: { height: 1, backgroundColor: Colors.border },

  // Nút đăng xuất với viền đỏ nhạt
  btnLogout: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#FFCCCC',
  },
  btnLogoutText: { color: Colors.danger, fontSize: 16, fontWeight: '600' },
})
