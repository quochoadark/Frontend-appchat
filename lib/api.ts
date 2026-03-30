import AsyncStorage from '@react-native-async-storage/async-storage';

// ⚠️  Đổi BASE_URL theo môi trường chạy:
//   Android Emulator  → http://10.0.2.2:8080
//   iOS Simulator     → http://localhost:8080
//   Thiết bị thật     → http://<IP-máy-tính>:8080  (vd: http://192.168.1.5:8080)
export const BASE_URL = 'http://10.0.2.2:8080';

export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
  error?: string;
  details?: string[];
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  isOnline?: boolean;
  lastSeenAt?: string;
  createdAt?: string;
}

export const TOKEN_KEY = 'access_token';
export const USER_KEY = 'current_user';

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const json = await res.json();
  return json as ApiResponse<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function loginApi(email: string, password: string) {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// ── Users ─────────────────────────────────────────────────────────────────────
export async function getUsersApi() {
  return apiFetch<User[]>('/users');
}

export async function getUserApi(id: string) {
  return apiFetch<User>(`/users/${id}`);
}

export async function updateUserApi(id: string, data: Partial<User>) {
  return apiFetch<User>(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
