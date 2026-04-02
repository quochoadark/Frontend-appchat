import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useAuth } from '../../context/AuthContext'
import UserAvatar from '../../components/UserAvatar'
import { Colors } from '../../constants/theme'
import { updateUserApi, unwrap } from '../../lib/api'
import AsyncStorage from '@react-native-async-storage/async-storage'

export default function ProfileScreen() {
  const { user, logout, setUser } = useAuth()

  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const [bio, setBio] = useState(user?.bio || '')
  const [saving, setSaving] = useState(false)

  const userId = String(user?.id || user?._id || '')
  const name = user?.displayName || user?.username || 'User'

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ])
  }

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('Lỗi', 'Tên hiển thị không được để trống.')
      return
    }
    setSaving(true)
    try {
      const res = await updateUserApi(userId, {
        displayName: displayName.trim(),
        bio: bio.trim(),
      })
      const updated = unwrap(res)
      const newUser = { ...user, ...updated }
      setUser(newUser)
      await AsyncStorage.setItem('user', JSON.stringify(newUser))
      setEditing(false)
    } catch (err: any) {
      Alert.alert('Lỗi', err.response?.data?.message || 'Không thể cập nhật hồ sơ.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setDisplayName(user?.displayName || '')
    setBio(user?.bio || '')
    setEditing(false)
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Avatar section */}
        <View style={styles.avatarSection}>
          <UserAvatar name={name} size="lg" online />
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.username}>@{user?.username || ''}</Text>
          <Text style={styles.email}>{user?.email || ''}</Text>
        </View>

        {/* Info card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Thông tin cá nhân</Text>
            {!editing ? (
              <TouchableOpacity onPress={() => setEditing(true)}>
                <Text style={styles.editLink}>Chỉnh sửa</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {!editing ? (
            <>
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
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Giới thiệu</Text>
                <Text style={[styles.rowValue, !user?.bio && { color: Colors.textSecondary }]}>
                  {user?.bio || 'Chưa cập nhật'}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Trạng thái</Text>
                <View style={styles.onlineRow}>
                  <View style={styles.onlineDot} />
                  <Text style={[styles.rowValue, { color: Colors.online }]}>Đang hoạt động</Text>
                </View>
              </View>
            </>
          ) : (
            /* Edit form */
            <>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Tên hiển thị</Text>
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Tên hiển thị"
                  placeholderTextColor={Colors.textSecondary}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Giới thiệu</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Viết vài dòng về bản thân..."
                  placeholderTextColor={Colors.textSecondary}
                  multiline
                  maxLength={255}
                />
                <Text style={styles.charCount}>{bio.length}/255</Text>
              </View>
              <View style={styles.editBtns}>
                <TouchableOpacity style={styles.btnSave} onPress={handleSave} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.btnSaveText}>Lưu</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnCancel} onPress={handleCancelEdit}>
                  <Text style={styles.btnCancelText}>Huỷ</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.btnLogout} onPress={handleLogout}>
          <Text style={styles.btnLogoutText}>🚪  Đăng xuất</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.inputBg,
  },
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
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    margin: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  editLink: { fontSize: 14, color: Colors.primary, fontWeight: '600' },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  rowLabel: { flex: 1, fontSize: 14, color: Colors.textSecondary },
  rowValue: { fontSize: 14, color: Colors.text, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  onlineRow: { flexDirection: 'row', alignItems: 'center' },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.online,
    marginRight: 6,
  },
  divider: { height: 1, backgroundColor: Colors.border },

  formGroup: { marginBottom: 14, paddingTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: '#FAFAFA',
  },
  inputMultiline: { height: 80, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: Colors.textSecondary, textAlign: 'right', marginTop: 3 },

  editBtns: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  btnSave: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  btnSaveText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  btnCancelText: { color: Colors.textSecondary, fontSize: 15 },

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
