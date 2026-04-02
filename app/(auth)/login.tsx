import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { useAuth } from '../../context/AuthContext'
import { Colors } from '../../constants/theme'

type Tab = 'login' | 'register'

export default function LoginScreen() {
  const { login, register } = useAuth()
  const [tab, setTab] = useState<Tab>('login')

  // Login fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Register fields
  const [regUsername, setRegUsername] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regDisplayName, setRegDisplayName] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')

  const [showPwd, setShowPwd] = useState(false)
  const [showRegPwd, setShowRegPwd] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Vui lòng nhập đầy đủ thông tin.')
      return
    }
    setError('')
    setSuccessMsg('')
    setLoading(true)
    try {
      await login(email.trim(), password)
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'Email hoặc mật khẩu không đúng.'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    if (
      !regUsername.trim() ||
      !regEmail.trim() ||
      !regDisplayName.trim() ||
      !regPassword.trim()
    ) {
      setError('Vui lòng nhập đầy đủ thông tin.')
      return
    }
    if (regPassword !== regConfirmPassword) {
      setError('Mật khẩu xác nhận không khớp.')
      return
    }
    if (regPassword.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự.')
      return
    }
    setError('')
    setSuccessMsg('')
    setLoading(true)
    try {
      await register({
        username: regUsername.trim(),
        email: regEmail.trim(),
        password: regPassword,
        displayName: regDisplayName.trim(),
      })
      setSuccessMsg('Đăng ký thành công! Vui lòng đăng nhập.')
      // Switch to login tab and pre-fill email
      setEmail(regEmail.trim())
      setPassword('')
      setTab('login')
      setRegUsername('')
      setRegEmail('')
      setRegDisplayName('')
      setRegPassword('')
      setRegConfirmPassword('')
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'Đăng ký thất bại. Vui lòng thử lại.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          {/* Logo */}
          <View style={styles.logoSection}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoEmoji}>💬</Text>
            </View>
            <Text style={styles.appName}>ChatApp</Text>
            <Text style={styles.appSub}>Nhắn tin thời gian thực</Text>
          </View>

          {/* Tab Toggle */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'login' && styles.tabBtnActive]}
              onPress={() => { setTab('login'); setError(''); setSuccessMsg('') }}
            >
              <Text style={[styles.tabText, tab === 'login' && styles.tabTextActive]}>
                Đăng nhập
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'register' && styles.tabBtnActive]}
              onPress={() => { setTab('register'); setError(''); setSuccessMsg('') }}
            >
              <Text style={[styles.tabText, tab === 'register' && styles.tabTextActive]}>
                Đăng ký
              </Text>
            </TouchableOpacity>
          </View>

          {successMsg ? <Text style={styles.successMsg}>{successMsg}</Text> : null}
          {error ? <Text style={styles.errorMsg}>{error}</Text> : null}

          {/* ── Login Form ── */}
          {tab === 'login' && (
            <>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="example@email.com"
                  placeholderTextColor={Colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Mật khẩu</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.input, { paddingRight: 44 }]}
                    placeholder="Nhập mật khẩu"
                    placeholderTextColor={Colors.textSecondary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPwd}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.togglePwd}
                    onPress={() => setShowPwd((v) => !v)}
                  >
                    <Text style={{ fontSize: 18 }}>{showPwd ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.btnPrimary, loading && styles.btnDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Đăng nhập</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* ── Register Form ── */}
          {tab === 'register' && (
            <>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Tên hiển thị</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nguyễn Văn A"
                  placeholderTextColor={Colors.textSecondary}
                  value={regDisplayName}
                  onChangeText={setRegDisplayName}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Tên người dùng</Text>
                <TextInput
                  style={styles.input}
                  placeholder="nguyen_van_a"
                  placeholderTextColor={Colors.textSecondary}
                  value={regUsername}
                  onChangeText={setRegUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="example@email.com"
                  placeholderTextColor={Colors.textSecondary}
                  value={regEmail}
                  onChangeText={setRegEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Mật khẩu</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.input, { paddingRight: 44 }]}
                    placeholder="Tối thiểu 6 ký tự"
                    placeholderTextColor={Colors.textSecondary}
                    value={regPassword}
                    onChangeText={setRegPassword}
                    secureTextEntry={!showRegPwd}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.togglePwd}
                    onPress={() => setShowRegPwd((v) => !v)}
                  >
                    <Text style={{ fontSize: 18 }}>{showRegPwd ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Xác nhận mật khẩu</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nhập lại mật khẩu"
                  placeholderTextColor={Colors.textSecondary}
                  value={regConfirmPassword}
                  onChangeText={setRegConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              <TouchableOpacity
                style={[styles.btnPrimary, loading && styles.btnDisabled]}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Tạo tài khoản</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoEmoji: { fontSize: 32 },
  appName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  appSub: { fontSize: 14, color: Colors.textSecondary },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    marginBottom: 20,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: { color: '#fff' },

  successMsg: {
    color: Colors.primaryLight,
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  errorMsg: {
    color: Colors.danger,
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  formGroup: { marginBottom: 14 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: '#FAFAFA',
  },
  inputWrapper: { position: 'relative' },
  togglePwd: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  btnDisabled: { opacity: 0.7 },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
})
