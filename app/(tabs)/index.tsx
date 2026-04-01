import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../context/AuthContext'
import { useChat, Conversation } from '../../context/ChatContext'
import { useSocket } from '../../context/SocketContext'
import UserAvatar from '../../components/UserAvatar'
import { Colors } from '../../constants/theme'

function formatTime(dateStr?: string) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
  if (diffDays === 0) {
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  }
  if (diffDays === 1) return 'Hôm qua'
  if (diffDays < 7) {
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
    return days[date.getDay()]
  }
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function getConvName(conv: Conversation, currentUser: any) {
  if (conv.name) return conv.name
  const other = (conv.participants || []).find(
    (p) => String(p._id || p.id) !== String(currentUser._id || currentUser.id)
  )
  return other?.name || other?.username || other?.email || 'Unknown'
}

function getLastMsgText(conv: Conversation) {
  const msg = conv.lastMessage
  if (!msg) return 'Bắt đầu cuộc trò chuyện'
  if (msg.type === 'IMAGE') return '📷 Ảnh'
  if (msg.type === 'FILE') return '📎 Tệp'
  return msg.content || ''
}

export default function ConversationsScreen() {
  const { user } = useAuth()
  const { conversations, loadConversations, loadUsers, openConversation, loadingConvs } = useChat()
  const { isOnline } = useSocket()
  const router = useRouter()
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadConversations()
    loadUsers()
  }, [])

  const filtered = conversations.filter((c) => {
    const name = getConvName(c, user).toLowerCase()
    return name.includes(search.toLowerCase())
  })

  const handleOpen = async (conv: Conversation) => {
    openConversation(conv)
    const other = (conv.participants || []).find(
      (p) => String(p._id || p.id) !== String(user?._id || user?.id)
    )
    const partnerName = getConvName(conv, user)
    const partnerId = String(other?._id || other?.id || '')
    router.push({
      pathname: '/chat/[id]',
      params: { id: String(conv._id || conv.id), partnerName, partnerId },
    })
  }

  const renderItem = ({ item: conv }: { item: Conversation }) => {
    const name = getConvName(conv, user)
    const other = (conv.participants || []).find(
      (p) => String(p._id || p.id) !== String(user?._id || user?.id)
    )
    const otherId = String(other?._id || other?.id || '')
    const online = otherId ? isOnline(otherId) : false

    return (
      <TouchableOpacity style={styles.convItem} onPress={() => handleOpen(conv)} activeOpacity={0.7}>
        <UserAvatar name={name} size="md" online={online} />
        <View style={styles.convInfo}>
          <View style={styles.convTop}>
            <Text style={styles.convName} numberOfLines={1}>{name}</Text>
            <Text style={styles.convTime}>
              {formatTime(conv.updatedAt || conv.lastMessage?.createdAt)}
            </Text>
          </View>
          <View style={styles.convBottom}>
            <Text style={styles.convLast} numberOfLines={1}>
              {getLastMsgText(conv)}
            </Text>
            {(conv.unreadCount || 0) > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{conv.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm kiếm..."
          placeholderTextColor={Colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={{ color: Colors.textSecondary, fontSize: 16, paddingHorizontal: 8 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {loadingConvs ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>💬</Text>
          <Text style={styles.emptyText}>Chưa có cuộc trò chuyện nào</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item._id || item.id)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    margin: 10,
    borderRadius: 20,
    paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 16, marginRight: 6 },
  searchInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 15,
    color: Colors.text,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: Colors.textSecondary, fontSize: 15 },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  convInfo: { flex: 1, marginLeft: 12 },
  convTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  convName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginRight: 8,
  },
  convTime: { fontSize: 12, color: Colors.textSecondary },
  convBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  convLast: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    marginRight: 8,
  },
  badge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 76 },
})
