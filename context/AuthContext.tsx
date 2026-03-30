import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getUserApi, loginApi, TOKEN_KEY, USER_KEY, type User } from '@/lib/api';

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  loginAsGuest: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  token: null,
  user: null,
  loading: true,
  login: async () => null,
  loginAsGuest: () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Khôi phục session khi mở app
  useEffect(() => {
    (async () => {
      try {
        const [savedToken, savedUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (savedToken) setToken(savedToken);
        if (savedUser) setUser(JSON.parse(savedUser));
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const res = await loginApi(email, password);
      if (res.statusCode !== 200 || !res.data?.accessToken) {
        return res.message ?? 'Đăng nhập thất bại';
      }

      const { accessToken } = res.data;
      await AsyncStorage.setItem(TOKEN_KEY, accessToken);
      setToken(accessToken);

      // Tải thông tin user hiện tại từ /users (lấy user khớp email)
      try {
        const usersRes = await fetch(
          `${(await import('@/lib/api')).BASE_URL}/users`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const usersJson = await usersRes.json();
        const me: User | undefined = (usersJson.data as User[])?.find(
          (u) => u.email === email
        );
        if (me) {
          setUser(me);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(me));
        }
      } catch {
        // Không critical nếu không lấy được user
      }

      return null; // null = không có lỗi
    } catch (e: any) {
      return e?.message ?? 'Không thể kết nối đến máy chủ';
    }
  }, []);

  const loginAsGuest = useCallback(() => {
    const guest: User = {
      id: 'guest',
      username: 'guest',
      email: 'guest@demo.com',
      displayName: 'Khách',
      isOnline: true,
    };
    setToken('guest-token');
    setUser(guest);
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await getUserApi(user.id);
      if (res.data) {
        setUser(res.data);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(res.data));
      }
    } catch {
      // Ignore
    }
  }, [user?.id]);

  return (
    <AuthContext.Provider value={{ token, user, loading, login, loginAsGuest, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
