import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { getMeApi, loginApi, logoutApi, registerApi, setUnauthorizedHandler, unwrap } from '../lib/api'

/**
 * Kiểu dữ liệu User — thông tin người dùng từ backend.
 * id và _id đều được hỗ trợ vì backend có thể trả về một trong hai
 * (MongoDB ObjectId thường là _id, nhưng DTO của Spring có thể map thành id).
 */
export interface User {
  id?: string
  _id?: string
  username?: string
  email?: string
  displayName?: string
  avatarUrl?: string
  bio?: string
  online?: boolean
  lastSeenAt?: string
  friendIds?: string[]
}

/**
 * Interface của AuthContext — các giá trị và hàm được expose ra ngoài.
 */
interface AuthContextType {
  user: User | null        // null = chưa đăng nhập
  loading: boolean         // true = đang restore session từ AsyncStorage
  login: (email: string, password: string) => Promise<void>
  register: (data: {
    username: string
    email: string
    password: string
    displayName: string
  }) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User | null) => void // Cho phép cập nhật user từ bên ngoài nếu cần
}

const AuthContext = createContext<AuthContextType | null>(null)

/**
 * AuthProvider — quản lý toàn bộ vòng đời xác thực của ứng dụng.
 *
 * Chức năng:
 * 1. Restore session khi mở app: đọc token + user từ AsyncStorage
 * 2. Đăng ký unauthorized handler: khi API trả về 401, tự động logout
 * 3. Expose login/register/logout cho các component con
 *
 * Token và user được lưu vào AsyncStorage để persist qua các lần mở app.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true) // Bắt đầu là true để chờ restore

  /**
   * Đăng ký handler xử lý lỗi 401 (Unauthorized) từ axios interceptor.
   * Khi nhận 401 → setUser(null) → AuthGuard sẽ redirect về login.
   */
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
  }, [])

  /**
   * Restore session khi app khởi động.
   *
   * Logic:
   * - Đọc song song token và user từ AsyncStorage
   * - Timeout 3 giây để không bị treo vô hạn nếu AsyncStorage lỗi
   * - Nếu cả hai tồn tại: parse và set user (dùng dữ liệu cached, không gọi API)
   * - Nếu lỗi parse JSON: xóa dữ liệu hỏng
   * - Dù thành công hay thất bại: set loading=false để app tiếp tục
   *
   * Lưu ý: không gọi getMeApi() khi restore để tránh delay — dữ liệu user
   * được cập nhật khi cần (ví dụ sau khi chỉnh sửa profile).
   */
  useEffect(() => {
    const restore = async () => {
      try {
        // Promise.race: lấy kết quả đầu tiên xong — AsyncStorage hoặc timeout 3s
        const [token, savedUser] = await Promise.race([
          Promise.all([
            AsyncStorage.getItem('token'),
            AsyncStorage.getItem('user'),
          ]),
          new Promise<[null, null]>((resolve) =>
            setTimeout(() => resolve([null, null]), 3000)
          ),
        ])
        if (token && savedUser) {
          setUser(JSON.parse(savedUser))
        }
      } catch {
        // Dữ liệu hỏng (JSON không parse được) → xóa để tránh lặp lỗi
        await AsyncStorage.removeItem('user').catch(() => { })
      } finally {
        setLoading(false) // Luôn kết thúc loading dù thành công hay thất bại
      }
    }
    restore()
  }, [])

  /**
   * Đăng nhập:
   * 1. Gọi POST /auth/login → nhận accessToken
   * 2. Lưu token vào AsyncStorage (axios interceptor sẽ tự đính vào mọi request)
   * 3. Gọi GET /auth/me để lấy thông tin user đầy đủ
   * 4. Lưu user vào AsyncStorage để restore sau này
   * 5. Set user vào state → AuthGuard tự redirect vào app
   */
  const login = async (email: string, password: string) => {
    const res = await loginApi(email, password)
    const { accessToken } = unwrap(res)
    await AsyncStorage.setItem('token', accessToken)

    const meRes = await getMeApi()
    const userData: User = unwrap(meRes)

    await AsyncStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  /**
   * Đăng ký tài khoản mới.
   * Backend chỉ tạo tài khoản, không trả về token — người dùng cần đăng nhập thủ công sau.
   */
  const register = async (data: {
    username: string
    email: string
    password: string
    displayName: string
  }) => {
    await registerApi(data)
    // Sau đăng ký, user phải tự đăng nhập (backend không trả token khi register)
  }

  /**
   * Đăng xuất:
   * 1. Gọi POST /auth/logout để server invalidate token (fire and forget, bỏ qua lỗi)
   * 2. Xóa token và user khỏi AsyncStorage
   * 3. Set user = null → AuthGuard redirect về login
   */
  const logout = async () => {
    await logoutApi().catch(() => { }) // Bỏ qua lỗi network khi logout
    await AsyncStorage.removeItem('token')
    await AsyncStorage.removeItem('user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook để sử dụng AuthContext trong bất kỳ component nào.
 * Dùng ! vì context luôn có giá trị bên trong AuthProvider.
 */
export const useAuth = () => useContext(AuthContext)!
