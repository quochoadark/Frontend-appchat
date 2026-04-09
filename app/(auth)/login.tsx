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
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../context/AuthContext'
import { Colors } from '../../constants/theme'

// Tab hiện tại: đăng nhập hay đăng ký
type Tab = 'login' | 'register'

/**
 * Màn hình đăng nhập / đăng ký.
 * Hai form được gộp vào một màn hình, chuyển đổi bằng tab toggle.
 *
 * State quản lý:
 * - tab: xác định form nào đang hiển thị
 * - email/password: dữ liệu form đăng nhập
 * - regUsername/regEmail/regDisplayName/regPassword/regConfirmPassword: dữ liệu form đăng ký
 * - showPwd/showRegPwd: toggle hiện/ẩn mật khẩu
 * - error/successMsg: thông báo lỗi hoặc thành công
 * - loading: đang gửi request API
 */
export default function LoginScreen() {
  const { login, register } = useAuth()

  // Tab đang active: 'login' hoặc 'register'
  const [tab, setTab] = useState<Tab>('login')

  // --- Fields cho form đăng nhập ---
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // --- Fields cho form đăng ký ---
  const [regUsername, setRegUsername] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regDisplayName, setRegDisplayName] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')

  const [showPwd, setShowPwd] = useState(false)       // Toggle hiện/ẩn mật khẩu đăng nhập
  const [showRegPwd, setShowRegPwd] = useState(false) // Toggle hiện/ẩn mật khẩu đăng ký
  const [error, setError] = useState('')              // Thông báo lỗi
  const [successMsg, setSuccessMsg] = useState('')    // Thông báo thành công
  const [loading, setLoading] = useState(false)       // Đang gửi request

  /**
   * Xử lý đăng nhập:
   * 1. Validate: email và password không rỗng
   * 2. Gọi login() từ AuthContext (gọi API, lưu token)
   * 3. AuthGuard trong _layout.tsx sẽ tự động redirect vào app sau khi login thành công
   * 4. Nếu lỗi: hiển thị message từ server hoặc fallback message
   */
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
      console.error('[Login Error]', err)
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          'Email hoặc mật khẩu không đúng.'
      )
    } finally {
      setLoading(false)
    }
  }

  /**
   * Xử lý đăng ký tài khoản mới:
   * 1. Validate: tất cả fields không rỗng, mật khẩu khớp, tối thiểu 6 ký tự
   * 2. Gọi register() từ AuthContext
   * 3. Sau khi đăng ký thành công:
   *    - Hiện thông báo thành công
   *    - Chuyển sang tab login
   *    - Pre-fill email để người dùng chỉ cần nhập mật khẩu
   *    - Reset tất cả fields đăng ký
   */
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
      // Chuyển sang tab login và pre-fill email cho tiện
      setEmail(regEmail.trim())
      setPassword('')
      setTab('login')
      // Reset form đăng ký
      setRegUsername('')
      setRegEmail('')
      setRegDisplayName('')
      setRegPassword('')
      setRegConfirmPassword('')
    } catch (err: any) {
      console.error('[Register Error]', err)
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          'Đăng ký thất bại. Vui lòng thử lại.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/*
        KeyboardAvoidingView: đẩy nội dung lên khi bàn phím hiện ra.
        iOS dùng 'padding', Android dùng 'height' để tránh bị che.
      */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      {/*
        ScrollView với keyboardShouldPersistTaps="handled":
        cho phép nhấn button trong khi bàn phím đang mở mà không cần dismiss keyboard trước.
      */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {/* Logo và tên ứng dụng */}
          <View style={styles.logoSection}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoEmoji}>💬</Text>
            </View>
            <Text style={styles.appName}>ChatApp</Text>
            <Text style={styles.appSub}>Nhắn tin thời gian thực</Text>
          </View>

          {/* Tab toggle: chuyển đổi giữa Đăng nhập và Đăng ký */}
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

          {/* Thông báo thành công (xanh) hoặc lỗi (đỏ) */}
          {successMsg ? <Text style={styles.successMsg}>{successMsg}</Text> : null}
          {error ? <Text style={styles.errorMsg}>{error}</Text> : null}

          {/* ── Form Đăng nhập ── */}
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
                {/* inputWrapper + togglePwd: overlay nút mắt lên góc phải của input */}
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

              {/* Nút submit — disable và hiện spinner khi đang loading */}
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

          {/* ── Form Đăng ký ── */}
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
                  autoCapitalize="words" // Tự viết hoa chữ cái đầu mỗi từ
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
                {/* Không cần toggle vì người dùng đã gõ mật khẩu ở field trên */}
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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  // Nền toàn màn hình màu primary
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  // ScrollView content: căn giữa dọc, có padding
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  // Card trắng chứa toàn bộ form
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
  // Phần logo + tên app ở trên cùng
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

  // Tab toggle (pill style)
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
    backgroundColor: Colors.primary, // Tab active có nền primary
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: { color: '#fff' },

  // Thông báo thành công (màu xanh primary)
  successMsg: {
    color: Colors.primaryLight,
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  // Thông báo lỗi (màu đỏ)
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
  // Container cho input có nút toggle mật khẩu bên trong
  inputWrapper: { position: 'relative' },
  // Nút mắt nằm tuyệt đối ở góc phải của input
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
  btnDisabled: { opacity: 0.7 }, // Giảm độ sáng khi đang loading
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
})
