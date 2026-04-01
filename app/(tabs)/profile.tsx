import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native'
import { useAuth } from '../../context/AuthContext'
import UserAvatar from '../../components/UserAvatar'
import { Colors } from '../../constants/theme'

export default function ProfileScreen() {
  const { user, logout } = useAuth()

  const name = user?.name || user?.username || 'User'

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ])
  }

  return (
    <View style={styles.container}>
      <View style={styles.avatarSection}>
        <UserAvatar name={name} size="lg" />
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.email}>{user?.email || ''}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Tên hiển thị</Text>
          <Text style={styles.rowValue}>{name}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Email</Text>
          <Text style={styles.rowValue}>{user?.email || '—'}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Trạng thái</Text>
          <View style={styles.onlineDot} />
          <Text style={[styles.rowValue, { color: Colors.online }]}>Đang hoạt động</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.btnLogout} onPress={handleLogout}>
        <Text style={styles.btnLogoutText}>🚪  Đăng xuất</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    padding: 20,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  name: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
  },
  email: {
    marginTop: 4,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    color: Colors.textSecondary,
  },
  rowValue: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '500',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.online,
    marginRight: 6,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  btnLogout: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFCCCC',
  },
  btnLogoutText: {
    color: Colors.danger,
    fontSize: 16,
    fontWeight: '600',
  },
})
