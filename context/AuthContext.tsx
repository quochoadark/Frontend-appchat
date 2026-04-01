import React, { createContext, useContext, useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { loginApi } from '../lib/api'

interface User {
  _id?: string
  id?: string
  username?: string
  name?: string
  email?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
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
        await AsyncStorage.removeItem('user').catch(() => {})
      } finally {
        setLoading(false)
      }
    }
    restore()
  }, [])

  const login = async (email: string, password: string) => {
    const res = await loginApi(email, password)
    const { token, accessToken, user: userData } = res.data
    const jwt = token || accessToken
    await AsyncStorage.setItem('token', jwt)
    await AsyncStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  const logout = async () => {
    await AsyncStorage.removeItem('token')
    await AsyncStorage.removeItem('user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)!
