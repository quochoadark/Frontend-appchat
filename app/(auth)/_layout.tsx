import { Stack } from 'expo-router'

/**
 * Layout cho nhóm route xác thực (auth group).
 *
 * Bao gồm các màn hình: login, (register tích hợp trong login).
 * headerShown: false — ẩn header mặc định vì màn hình login tự thiết kế UI riêng.
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
