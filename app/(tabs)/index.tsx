import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
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
  if (diffDays === 0)
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Hôm qua'
  if (diffDays < 7) {
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
    return days[date.getDay()]
  }
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function getConvName(
  conv: Conversation,
  currentUserId: string,
  getUserDisplayName: (id: string) => string
): string {
  if (conv.name) return conv.name
  // participants is string[] of user IDs
  const otherId = (conv.participants || [])
    .map(String)
    .find((id) => id !== currentUserId)
  return otherId ? getUserDisplayName(otherId) : 'Unknown'
}

function getLastMsgText(conv: Conversation): string {
  const msg = conv.lastMessage
  if (!msg) return 'Bắt đầu cuộc trò chuyện'
  if (msg.messageType === 'IMAGE') return '📷 Ảnh'
  if (msg.messageType === 'FILE') return '📎 Tệp'
  return msg.contentPreview || ''
}

export default function ConversationsScreen() {
  const { user } = useAuth()
  const {
    conversations,
    loadConversations,
    loadUsers,
    openConversation,
    loadingConvs,
    getUserDisplayName,
  } = useChat()
  const { isOnline } = useSocket()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const myId = String(user?.id || user?._id || '')

  // Reload on tab focus
  useFocusEffect(
    useCallback(() => {
      loadConversations()
      loadUsers()
    }, [])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([loadConversations(), loadUsers()])
    setRefreshing(false)
  }, [loadConversations, loadUsers])

  const filtered = conversations.filter((c) => {
    const name = getConvName(c, myId, getUserDisplayName).toLowerCase()
    return name.includes(search.toLowerCase())
  })

  const handleOpen = (conv: Conversation) => {
    openConversation(conv)
    const convId = String(conv.id || conv._id)
    const otherId = (conv.participants || []).map(String).find((id) => id !== myId) || ''
    const partnerName = getConvName(conv, myId, getUserDisplayName)
    router.push({
      pathname: '/chat/[id]',
      params: { id: convId, partnerName, partnerId: otherId },
    })
  }

  const renderItem = ({ item: conv }: { item: Conversation }) => {
    const convId = String(conv.id || conv._id)
    const otherId = (conv.participants || []).map(String).find((id) => id !== myId) || ''
    const name = getConvName(conv, myId, getUserDisplayName)
    const online = otherId ? isOnline(otherId) : false
    const timeStr = formatTime(conv.updatedAt || conv.lastMessage?.sentAt)

    return (
      <TouchableOpacity
        style={styles.convItem}
        onPress={() => handleOpen(conv)}
        activeOpacity={0.75}
      >
        {conv.type === 'GROUP' ? (
          <View style={styles.groupAvatar}>
            <Text style={styles.groupAvatarText}>
              {(conv.name || 'G').charAt(0).toUpperCase()}
            </Text>
          </View>
        ) : (
          <UserAvatar name={name} size="md" online={online} />
        )}
        <View style={styles.convInfo}>
          <View style={styles.convTop}>
            <Text style={styles.convName} numberOfLines={1}>
              {name}
              {conv.type === 'GROUP' && (
                <Text style={styles.groupTag}> 👥</Text>
              )}
            </Text>
            <Text style={styles.convTime}>{timeStr}</Text>
          </View>
          <View style={styles.convBottom}>
            <Text style={styles.convLast} numberOfLines={1}>
              {conv.lastMessage?.senderDisplayName &&
              conv.lastMessage.senderId !== myId
                ? `${conv.lastMessage.senderDisplayName}: `
                : ''}
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
            <Text style={{ color: Colors.textSecondary, fontSize: 16, paddingHorizontal: 8 }}>
              ✕
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {loadingConvs && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>💬</Text>
          <Text style={styles.emptyText}>
            {search ? 'Không tìm thấy cuộc trò chuyện' : 'Chưa có cuộc trò chuyện nào'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id || item._id)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
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
  searchInput: { flex: 1, paddingVertical: 9, fontSize: 15, color: Colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: Colors.textSecondary, fontSize: 15, textAlign: 'center' },

  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  groupAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupAvatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
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
  groupTag: { fontSize: 14 },
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
