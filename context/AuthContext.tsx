import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { getMeApi, loginApi, logoutApi, registerApi, unwrap } from '../lib/api'

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

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: {
    username: string
    email: string
    password: string
    displayName: string
  }) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User | null) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const restore = async () => {
      try {
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
        await AsyncStorage.removeItem('user').catch(() => { })
      } finally {
        setLoading(false)
      }
    }
    restore()
  }, [])

  const login = async (email: string, password: string) => {
    const res = await loginApi(email, password)
    const { accessToken } = unwrap(res)
    await AsyncStorage.setItem('token', accessToken)

    const meRes = await getMeApi()
    const userData: User = unwrap(meRes)

    await AsyncStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  const register = async (data: {
    username: string
    email: string
    password: string
    displayName: string
  }) => {
    await registerApi(data)
    // After register, user must log in (backend doesn't return token on register)
  }

  const logout = async () => {
    await logoutApi().catch(() => { })
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

export const useAuth = () => useContext(AuthContext)!
