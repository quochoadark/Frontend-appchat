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
  Modal,
  Alert,
  ScrollView,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { useAuth } from '../../context/AuthContext'
import { useChat, Conversation, Message } from '../../context/ChatContext'
import { ChatNotification, useSocket } from '../../context/SocketContext'
import UserAvatar from '../../components/UserAvatar'
import { Colors } from '../../constants/theme'
import { createGroupConversationApi, getFriendsApi, unwrap } from '../../lib/api'
import { User } from '../../context/AuthContext'

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
  return msg.contentPreview || 'Bắt đầu cuộc trò chuyện'
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
    setConversations,
    receiveMessage,
  } = useChat()
  const { isOnline, subscribeConversation } = useSocket()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [isFocused, setIsFocused] = useState(false)

  // Group creation state
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [friends, setFriends] = useState<User[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [creatingGroup, setCreatingGroup] = useState(false)

  const myId = String(user?.id || user?._id || '')

  // Reload on tab focus
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true)
      loadConversations()
      loadUsers()
      return () => setIsFocused(false)
    }, [loadConversations, loadUsers])
  )

  // Subscribe to all conversations for real-time last-message updates on the list
  useEffect(() => {
    if (!isFocused || conversations.length === 0) return
    const unsubs = conversations.map((conv) => {
      const convId = String(conv.id || conv._id)
      return subscribeConversation(convId, (n: ChatNotification) => {
        if (n.type === 'NEW_MESSAGE' && n.data) {
          receiveMessage({
            id: n.data.id,
            conversationId: n.data.conversationId || convId,
            senderId: n.data.senderId,
            senderDisplayName: n.data.senderDisplayName,
            messageType: n.data.messageType,
            content: n.data.content,
            createdAt: n.data.createdAt,
          } as Message)
        }
      })
    })
    return () => unsubs.forEach((u) => u())
    // conversations.length: re-subscribe only when convs are added/removed, not on every message
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, conversations.length, subscribeConversation, receiveMessage])

  const openCreateGroup = useCallback(async () => {
    try {
      const res = await getFriendsApi()
      setFriends(unwrap(res) || [])
    } catch {
      setFriends([])
    }
    setGroupName('')
    setSelectedIds([])
    setShowCreateGroup(true)
  }, [])

  const toggleSelect = (uid: string) => {
    setSelectedIds((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    )
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên nhóm.')
      return
    }
    if (selectedIds.length < 2) {
      Alert.alert('Lỗi', 'Chọn ít nhất 2 thành viên.')
      return
    }
    setCreatingGroup(true)
    try {
      const res = await createGroupConversationApi({
        name: groupName.trim(),
        participantIds: selectedIds,
      })
      const newConv: Conversation = unwrap(res)
      setConversations((prev) => [newConv, ...prev])
      setShowCreateGroup(false)
      openConversation(newConv)
      router.push({
        pathname: '/chat/[id]',
        params: { id: String(newConv.id || newConv._id), partnerName: newConv.name || groupName },
      })
    } catch (err: any) {
      Alert.alert('Lỗi', err.response?.data?.message || 'Không thể tạo nhóm.')
    } finally {
      setCreatingGroup(false)
    }
  }

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
    const timeStr = formatTime(conv.lastMessage?.sentAt || conv.updatedAt)

    const hasUnread = (conv.unreadCount || 0) > 0

    return (
      <TouchableOpacity
        style={[styles.convItem, hasUnread && styles.convItemUnread]}
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
            <Text style={[styles.convName, hasUnread && styles.convNameUnread]} numberOfLines={1}>
              {name}
              {conv.type === 'GROUP' && (
                <Text style={styles.groupTag}> 👥</Text>
              )}
            </Text>
            <Text style={[styles.convTime, hasUnread && styles.convTimeUnread]}>{timeStr}</Text>
          </View>
          <View style={styles.convBottom}>
            <Text style={[styles.convLast, hasUnread && styles.convLastUnread]} numberOfLines={1}>
              {conv.lastMessage?.senderDisplayName && conv.lastMessage.senderId !== myId
                ? `${conv.lastMessage.senderDisplayName}: `
                : ''}
              {getLastMsgText(conv)}
            </Text>
            {hasUnread && (
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
      <View style={styles.topBar}>
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
        <TouchableOpacity style={styles.createGroupBtn} onPress={openCreateGroup}>
          <Text style={styles.createGroupBtnText}>👥+</Text>
        </TouchableOpacity>
      </View>

      {/* Create Group Modal */}
      <Modal
        visible={showCreateGroup}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateGroup(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Tạo nhóm chat</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Tên nhóm..."
              placeholderTextColor={Colors.textSecondary}
              value={groupName}
              onChangeText={setGroupName}
              maxLength={60}
            />
            <Text style={styles.modalSubtitle}>
              Chọn thành viên ({selectedIds.length} đã chọn, tối thiểu 2)
            </Text>
            <ScrollView style={styles.friendList} showsVerticalScrollIndicator={false}>
              {friends.map((f) => {
                const uid = String(f.id || f._id)
                const fname = f.displayName || f.username || 'Unknown'
                const selected = selectedIds.includes(uid)
                return (
                  <TouchableOpacity
                    key={uid}
                    style={[styles.friendItem, selected && styles.friendItemSelected]}
                    onPress={() => toggleSelect(uid)}
                  >
                    <UserAvatar name={fname} size="sm" />
                    <Text style={[styles.friendName, selected && styles.friendNameSelected]}>
                      {fname}
                    </Text>
                    {selected && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                )
              })}
              {friends.length === 0 && (
                <Text style={styles.noFriends}>Bạn chưa có bạn bè nào</Text>
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowCreateGroup(false)}
              >
                <Text style={styles.modalCancelText}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, creatingGroup && { opacity: 0.6 }]}
                onPress={handleCreateGroup}
                disabled={creatingGroup}
              >
                {creatingGroup ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Tạo nhóm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 0,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: 20,
    paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 16, marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 9, fontSize: 15, color: Colors.text },
  createGroupBtn: {
    marginLeft: 8,
    backgroundColor: Colors.primary,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  createGroupBtnText: { fontSize: 16 },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text, marginBottom: 12 },
  modalInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    marginBottom: 12,
  },
  modalSubtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  friendList: { maxHeight: 240, marginBottom: 12 },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  friendItemSelected: { backgroundColor: Colors.inputBg },
  friendName: { flex: 1, marginLeft: 10, fontSize: 15, color: Colors.text },
  friendNameSelected: { color: Colors.primary, fontWeight: '600' },
  checkmark: { color: Colors.primary, fontSize: 16, fontWeight: 'bold' },
  noFriends: { color: Colors.textSecondary, textAlign: 'center', paddingVertical: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancel: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  modalCancelText: { color: Colors.textSecondary, fontSize: 14 },
  modalConfirm: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
    minWidth: 90,
    alignItems: 'center',
  },
  modalConfirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },
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

  // Unread highlight styles
  convItemUnread: { backgroundColor: '#F0F9F7' },
  convNameUnread: { fontWeight: '700', color: Colors.text },
  convLastUnread: { color: Colors.text, fontWeight: '600' },
  convTimeUnread: { color: Colors.primary, fontWeight: '600' },
})
