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

/**
 * Định dạng thời gian hiển thị cho tin nhắn cuối cùng.
 * - Hôm nay: hiển thị giờ:phút (HH:mm)
 * - Hôm qua: hiển thị "Hôm qua"
 * - Trong vòng 7 ngày: hiển thị tên thứ (T2, T3... CN)
 * - Lâu hơn 7 ngày: hiển thị ngày/tháng (dd/MM)
 */
function formatTime(dateStr?: string) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  // Tính số ngày chênh lệch giữa hiện tại và thời điểm tin nhắn
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
  if (diffDays === 0)
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Hôm qua'
  if (diffDays < 7) {
    // Mảng tên thứ theo chỉ số getDay() (0=CN, 1=T2, ...)
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
    return days[date.getDay()]
  }
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

/**
 * Lấy tên hiển thị của cuộc trò chuyện:
 * - Nếu là nhóm: trả về tên nhóm (conv.name)
 * - Nếu là chat 1-1: tìm ID của người kia trong danh sách participants,
 *   sau đó tra tên qua hàm getUserDisplayName
 */
function getConvName(
  conv: Conversation,
  currentUserId: string,
  getUserDisplayName: (id: string) => string
): string {
  if (conv.name) return conv.name
  // participants là mảng string[] chứa ID của các thành viên
  const otherId = (conv.participants || [])
    .map(String)
    .find((id) => id !== currentUserId)
  return otherId ? getUserDisplayName(otherId) : 'Unknown'
}

/**
 * Lấy nội dung xem trước của tin nhắn cuối cùng để hiển thị dưới tên cuộc trò chuyện:
 * - Chưa có tin nhắn: "Bắt đầu cuộc trò chuyện"
 * - Tin nhắn ảnh: hiển thị icon 📷
 * - Tin nhắn file: hiển thị icon 📎
 * - Tin nhắn text: trả về nội dung rút gọn (contentPreview)
 */
function getLastMsgText(conv: Conversation): string {
  const msg = conv.lastMessage
  if (!msg) return 'Bắt đầu cuộc trò chuyện'
  if (msg.messageType === 'IMAGE') return '📷 Ảnh'
  if (msg.messageType === 'FILE') return '📎 Tệp'
  return msg.contentPreview || 'Bắt đầu cuộc trò chuyện'
}

/**
 * Màn hình chính - danh sách tất cả cuộc trò chuyện của người dùng.
 * Chức năng:
 * - Hiển thị danh sách conversations với tin nhắn cuối, thời gian, trạng thái online
 * - Lọc/tìm kiếm theo tên
 * - Tạo nhóm chat mới
 * - Real-time cập nhật tin nhắn cuối qua WebSocket
 * - Badge thông báo tin chưa đọc
 */
export default function ConversationsScreen() {
  // Lấy thông tin người dùng đang đăng nhập
  const { user } = useAuth()

  // Lấy dữ liệu và các hàm thao tác từ ChatContext
  const {
    conversations,       // Danh sách cuộc trò chuyện
    loadConversations,   // Hàm tải lại danh sách conversations từ API
    loadUsers,           // Hàm tải thông tin users (dùng để tra tên)
    openConversation,    // Đặt conversation đang active trong context
    loadingConvs,        // Trạng thái đang tải conversations
    getUserDisplayName,  // Tra tên hiển thị của user theo ID
    setConversations,    // Cập nhật trực tiếp state conversations
    receiveMessage,      // Xử lý khi nhận tin nhắn mới (cập nhật lastMessage + unreadCount)
  } = useChat()

  // Lấy trạng thái online của users và hàm đăng ký lắng nghe WebSocket
  const { isOnline, subscribeConversation } = useSocket()

  const router = useRouter()

  // State ô tìm kiếm
  const [search, setSearch] = useState('')

  // State kéo xuống để refresh
  const [refreshing, setRefreshing] = useState(false)

  // Track xem tab này có đang được focus không (dùng để kiểm soát subscribe WebSocket)
  const [isFocused, setIsFocused] = useState(false)

  // --- State cho tính năng tạo nhóm ---
  const [showCreateGroup, setShowCreateGroup] = useState(false) // Hiện/ẩn modal tạo nhóm
  const [groupName, setGroupName] = useState('')                // Tên nhóm đang nhập
  const [friends, setFriends] = useState<User[]>([])           // Danh sách bạn bè để chọn vào nhóm
  const [selectedIds, setSelectedIds] = useState<string[]>([]) // ID các thành viên đã chọn
  const [creatingGroup, setCreatingGroup] = useState(false)    // Đang gửi request tạo nhóm

  // ID của người dùng hiện tại, ép kiểu sang string để so sánh nhất quán
  const myId = String(user?.id || user?._id || '')

  /**
   * useFocusEffect: chạy mỗi lần tab được focus (người dùng chuyển sang tab này).
   * Tải lại conversations và users để đảm bảo dữ liệu luôn mới nhất.
   * Cleanup: đặt isFocused = false khi rời tab.
   */
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true)
      loadConversations()
      loadUsers()
      return () => setIsFocused(false)
    }, [loadConversations, loadUsers])
  )

  /**
   * Subscribe WebSocket cho tất cả conversations khi tab đang được focus.
   * Mục đích: cập nhật tin nhắn cuối cùng (lastMessage) trên danh sách theo thời gian thực
   * mà không cần phải vào từng cuộc trò chuyện.
   *
   * Logic:
   * - Chỉ subscribe khi tab đang focused VÀ có ít nhất 1 conversation
   * - Mỗi conversation được subscribe 1 channel riêng
   * - Khi nhận sự kiện NEW_MESSAGE → gọi receiveMessage() để cập nhật state
   * - Cleanup: unsubscribe tất cả khi tab mất focus hoặc danh sách thay đổi
   *
   * Dependency [conversations.length]: chỉ re-subscribe khi số lượng conversation thay đổi
   * (thêm/xóa), không re-subscribe mỗi khi nhận tin nhắn (tránh vòng lặp vô hạn)
   */
  useEffect(() => {
    if (!isFocused || conversations.length === 0) return
    const unsubs = conversations.map((conv) => {
      const convId = String(conv.id || conv._id)
      return subscribeConversation(convId, (n: ChatNotification) => {
        if (n.type === 'NEW_MESSAGE' && n.data) {
          // Xây dựng object Message từ payload notification và đẩy vào ChatContext
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
    // Trả về hàm cleanup để unsubscribe tất cả khi effect re-run hoặc unmount
    return () => unsubs.forEach((u) => u())
    // conversations.length: re-subscribe only when convs are added/removed, not on every message
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, conversations.length, subscribeConversation, receiveMessage])

  /**
   * Mở modal tạo nhóm:
   * - Gọi API lấy danh sách bạn bè để chọn vào nhóm
   * - Reset form (tên nhóm, danh sách đã chọn)
   * - Hiển thị modal
   */
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

  /**
   * Toggle chọn/bỏ chọn một thành viên trong form tạo nhóm.
   * Nếu uid đã có trong selectedIds → bỏ chọn, ngược lại → thêm vào.
   */
  const toggleSelect = (uid: string) => {
    setSelectedIds((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    )
  }

  /**
   * Xử lý submit tạo nhóm chat:
   * 1. Validate: tên nhóm không rỗng, chọn ít nhất 2 thành viên
   * 2. Gọi API tạo nhóm với tên và danh sách participantIds
   * 3. Thêm conversation mới vào đầu danh sách (optimistic update)
   * 4. Đóng modal và điều hướng vào màn hình chat của nhóm vừa tạo
   */
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
      // Thêm nhóm mới vào đầu danh sách conversations
      setConversations((prev) => [newConv, ...prev])
      setShowCreateGroup(false)
      // Đặt conversation mới là active trong context
      openConversation(newConv)
      // Điều hướng vào màn hình chat của nhóm
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

  /**
   * Xử lý kéo xuống để refresh:
   * Tải lại đồng thời danh sách conversations và thông tin users.
   */
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([loadConversations(), loadUsers()])
    setRefreshing(false)
  }, [loadConversations, loadUsers])

  /**
   * Lọc danh sách conversations theo từ khóa tìm kiếm.
   * So sánh không phân biệt hoa/thường với tên cuộc trò chuyện.
   */
  const filtered = conversations.filter((c) => {
    const name = getConvName(c, myId, getUserDisplayName).toLowerCase()
    return name.includes(search.toLowerCase())
  })

  /**
   * Xử lý khi người dùng nhấn vào một cuộc trò chuyện:
   * - Đặt conversation là active trong ChatContext
   * - Điều hướng đến màn hình chat với các params cần thiết:
   *   id (conversation ID), partnerName (tên hiển thị), partnerId (ID người kia)
   */
  const handleOpen = (conv: Conversation) => {
    openConversation(conv)
    const convId = String(conv.id || conv._id)
    // Tìm ID người kia trong conversation 1-1 (khác với myId)
    const otherId = (conv.participants || []).map(String).find((id) => id !== myId) || ''
    const partnerName = getConvName(conv, myId, getUserDisplayName)
    router.push({
      pathname: '/chat/[id]',
      params: { id: convId, partnerName, partnerId: otherId },
    })
  }

  /**
   * Render một item trong FlatList danh sách conversations.
   * Hiển thị:
   * - Avatar (nhóm: chữ cái đầu tên nhóm, 1-1: UserAvatar với trạng thái online)
   * - Tên cuộc trò chuyện + icon nhóm nếu là GROUP
   * - Thời gian tin nhắn cuối
   * - Nội dung xem trước tin nhắn cuối (kèm tên người gửi nếu là nhóm)
   * - Badge số tin chưa đọc (nếu có)
   * - Highlight nền nếu có tin chưa đọc
   */
  const renderItem = ({ item: conv }: { item: Conversation }) => {
    const convId = String(conv.id || conv._id)
    // ID người kia trong chat 1-1 (dùng để kiểm tra trạng thái online)
    const otherId = (conv.participants || []).map(String).find((id) => id !== myId) || ''
    const name = getConvName(conv, myId, getUserDisplayName)
    // Chỉ kiểm tra online cho chat 1-1, nhóm không có trạng thái online
    const online = otherId ? isOnline(otherId) : false
    // Ưu tiên lấy sentAt của tin nhắn cuối, fallback về updatedAt của conversation
    const timeStr = formatTime(conv.lastMessage?.sentAt || conv.updatedAt)

    // Có tin nhắn chưa đọc khi unreadCount > 0
    const hasUnread = (conv.unreadCount || 0) > 0

    return (
      <TouchableOpacity
        style={[styles.convItem, hasUnread && styles.convItemUnread]}
        onPress={() => handleOpen(conv)}
        activeOpacity={0.75}
      >
        {/* Avatar: nhóm dùng chữ cái đầu, 1-1 dùng UserAvatar với dot online */}
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
          {/* Hàng trên: tên conversation (trái) + thời gian (phải) */}
          <View style={styles.convTop}>
            <Text style={[styles.convName, hasUnread && styles.convNameUnread]} numberOfLines={1}>
              {name}
              {/* Thêm icon nhóm nếu là GROUP conversation */}
              {conv.type === 'GROUP' && (
                <Text style={styles.groupTag}> 👥</Text>
              )}
            </Text>
            <Text style={[styles.convTime, hasUnread && styles.convTimeUnread]}>{timeStr}</Text>
          </View>
          {/* Hàng dưới: preview tin nhắn cuối (trái) + badge chưa đọc (phải) */}
          <View style={styles.convBottom}>
            <Text style={[styles.convLast, hasUnread && styles.convLastUnread]} numberOfLines={1}>
              {/* Trong nhóm: hiển thị "Tên người gửi: " nếu không phải mình gửi */}
              {conv.lastMessage?.senderDisplayName && conv.lastMessage.senderId !== myId
                ? `${conv.lastMessage.senderDisplayName}: `
                : ''}
              {getLastMsgText(conv)}
            </Text>
            {/* Badge số tin chưa đọc, chỉ hiển thị khi có unread */}
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
      {/* Thanh tìm kiếm + nút tạo nhóm */}
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
          {/* Nút xóa nhanh nội dung tìm kiếm, chỉ hiện khi đang có text */}
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={{ color: Colors.textSecondary, fontSize: 16, paddingHorizontal: 8 }}>
                ✕
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {/* Nút mở modal tạo nhóm */}
        <TouchableOpacity style={styles.createGroupBtn} onPress={openCreateGroup}>
          <Text style={styles.createGroupBtnText}>👥+</Text>
        </TouchableOpacity>
      </View>

      {/* Modal tạo nhóm chat */}
      <Modal
        visible={showCreateGroup}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateGroup(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Tạo nhóm chat</Text>

            {/* Input nhập tên nhóm */}
            <TextInput
              style={styles.modalInput}
              placeholder="Tên nhóm..."
              placeholderTextColor={Colors.textSecondary}
              value={groupName}
              onChangeText={setGroupName}
              maxLength={60}
            />

            {/* Tiêu đề phần chọn thành viên, hiển thị số đã chọn */}
            <Text style={styles.modalSubtitle}>
              Chọn thành viên ({selectedIds.length} đã chọn, tối thiểu 2)
            </Text>

            {/* Danh sách bạn bè để chọn vào nhóm */}
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
                    {/* Checkmark chỉ hiện khi đã chọn */}
                    {selected && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                )
              })}
              {/* Trường hợp chưa có bạn bè nào */}
              {friends.length === 0 && (
                <Text style={styles.noFriends}>Bạn chưa có bạn bè nào</Text>
              )}
            </ScrollView>

            {/* Nút Huỷ và Tạo nhóm */}
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
                disabled={creatingGroup} // Disable khi đang gửi request để tránh bấm nhiều lần
              >
                {/* Hiện spinner khi đang tạo, hiện text khi chờ */}
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

      {/* Nội dung chính: loading spinner / danh sách rỗng / FlatList */}
      {loadingConvs && !refreshing ? (
        // Đang tải lần đầu (không phải pull-to-refresh) → hiện spinner
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        // Không có kết quả: do tìm kiếm không khớp hoặc chưa có conversation nào
        <View style={styles.center}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>💬</Text>
          <Text style={styles.emptyText}>
            {search ? 'Không tìm thấy cuộc trò chuyện' : 'Chưa có cuộc trò chuyện nào'}
          </Text>
        </View>
      ) : (
        // Danh sách conversations
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id || item._id)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            // Pull-to-refresh: kéo xuống để tải lại
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // Layout chính của màn hình
  container: { flex: 1, backgroundColor: Colors.surface },

  // Thanh trên cùng chứa ô tìm kiếm và nút tạo nhóm
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 0,
  },

  // Ô tìm kiếm hình pill
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

  // Nút tạo nhóm hình tròn bên phải
  createGroupBtn: {
    marginLeft: 8,
    backgroundColor: Colors.primary,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  createGroupBtnText: { fontSize: 16 },

  // --- Styles cho Modal tạo nhóm ---

  // Lớp phủ mờ phía sau modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  // Hộp nội dung modal
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%', // Giới hạn chiều cao để scroll được nếu có nhiều bạn bè
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
  friendList: { maxHeight: 240, marginBottom: 12 }, // Giới hạn chiều cao danh sách bạn bè

  // Item bạn bè trong danh sách chọn
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  friendItemSelected: { backgroundColor: Colors.inputBg }, // Nền khi đã chọn
  friendName: { flex: 1, marginLeft: 10, fontSize: 15, color: Colors.text },
  friendNameSelected: { color: Colors.primary, fontWeight: '600' }, // Tên nổi bật khi đã chọn
  checkmark: { color: Colors.primary, fontSize: 16, fontWeight: 'bold' },
  noFriends: { color: Colors.textSecondary, textAlign: 'center', paddingVertical: 20 },

  // Hàng nút Huỷ / Tạo nhóm
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

  // Container căn giữa cho trạng thái loading/empty
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: Colors.textSecondary, fontSize: 15, textAlign: 'center' },

  // --- Styles cho item trong danh sách conversations ---

  // Container của mỗi row conversation
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  // Avatar nhóm: hình tròn màu primary với chữ cái đầu
  groupAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupAvatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },

  // Phần thông tin bên phải avatar
  convInfo: { flex: 1, marginLeft: 12 },

  // Hàng trên: tên + thời gian
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
  groupTag: { fontSize: 14 }, // Icon 👥 nhỏ hơn tên nhóm
  convTime: { fontSize: 12, color: Colors.textSecondary },

  // Hàng dưới: preview tin nhắn + badge
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

  // Badge số tin chưa đọc (hình viên thuốc)
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

  // Đường kẻ phân cách giữa các item, thụt vào bằng chiều rộng avatar
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 76 },

  // --- Styles highlight khi có tin chưa đọc ---
  convItemUnread: { backgroundColor: '#F0F9F7' },       // Nền xanh nhạt
  convNameUnread: { fontWeight: '700', color: Colors.text }, // Tên đậm hơn
  convLastUnread: { color: Colors.text, fontWeight: '600' }, // Preview đậm hơn
  convTimeUnread: { color: Colors.primary, fontWeight: '600' }, // Thời gian màu primary
})
