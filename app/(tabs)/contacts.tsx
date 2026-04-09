import { useRouter } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import UserAvatar from '../../components/UserAvatar'
import { Colors } from '../../constants/theme'
import { useAuth, User } from '../../context/AuthContext'
import { useChat } from '../../context/ChatContext'
import { useSocket } from '../../context/SocketContext'
import {
  acceptFriendRequestApi,
  cancelFriendRequestApi,
  declineFriendRequestApi,
  getFriendRequestsReceivedApi,
  getFriendRequestsSentApi,
  getFriendsApi,
  searchUsersApi,
  sendFriendRequestApi,
  unfriendApi,
  unwrap,
} from '../../lib/api'

// 3 sub-tab trong màn hình này
type SubTab = 'people' | 'friends' | 'requests'

// Kiểu dữ liệu cho một lời mời kết bạn
interface FriendRequest {
  id?: string
  senderId?: string
  receiverId?: string
  status?: string
  createdAt?: string
}

/**
 * Màn hình Bạn bè — quản lý toàn bộ quan hệ bạn bè.
 *
 * 3 sub-tab:
 * - "Mọi người":  Tìm kiếm tất cả người dùng, gửi/huỷ lời mời kết bạn
 * - "Bạn bè":    Danh sách bạn bè hiện tại, chat nhanh, huỷ kết bạn
 * - "Lời mời":   Lời mời kết bạn nhận được, chấp nhận/từ chối
 *
 * State chính:
 * - subTab: tab đang active
 * - search: từ khóa tìm kiếm (dùng ở tất cả tab)
 * - friends/receivedRequests/sentRequests: dữ liệu từ API
 * - actionLoading: ID của item đang xử lý action (để disable button đúng item)
 * - searchResults/searchPage/searchHasMore: phân trang kết quả tìm kiếm
 */
export default function ContactsScreen() {
  const { user } = useAuth()
  const { users, openOrCreateConversation, loadUsers } = useChat()
  const { isOnline } = useSocket()
  const router = useRouter()

  // Sub-tab hiện tại
  const [subTab, setSubTab] = useState<SubTab>('people')

  // Từ khóa tìm kiếm (dùng chung cho tất cả tab: search API ở people, filter local ở friends)
  const [search, setSearch] = useState('')

  // Dữ liệu quan hệ bạn bè
  const [friends, setFriends] = useState<User[]>([])
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]) // Lời mời nhận được
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([])         // Lời mời đã gửi

  const [loading, setLoading] = useState(false)       // Đang tải dữ liệu ban đầu
  const [refreshing, setRefreshing] = useState(false) // Đang pull-to-refresh
  const [actionLoading, setActionLoading] = useState<string | null>(null) // ID của item đang được action

  // --- State tìm kiếm người dùng với phân trang ---
  const [searchResults, setSearchResults] = useState<User[]>([])   // Kết quả tìm kiếm hiện tại
  const [searchPage, setSearchPage] = useState(0)                   // Trang hiện tại (0-based)
  const [searchHasMore, setSearchHasMore] = useState(true)          // Còn trang tiếp theo không
  const [searchLoading, setSearchLoading] = useState(false)         // Đang tải trang đầu
  const [loadingMore, setLoadingMore] = useState(false)             // Đang tải thêm (infinite scroll)

  const myId = String(user?.id || user?._id || '')

  /**
   * Tải đồng thời 3 loại dữ liệu bạn bè từ API:
   * - Danh sách bạn bè
   * - Lời mời kết bạn nhận được
   * - Lời mời kết bạn đã gửi
   *
   * Ba danh sách này kết hợp tạo ra trạng thái quan hệ với mỗi người dùng (friendIds, sentToIds, receivedFromIds).
   */
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [friendsRes, receivedRes, sentRes] = await Promise.all([
        getFriendsApi(),
        getFriendRequestsReceivedApi(),
        getFriendRequestsSentApi(),
      ])
      setFriends(unwrap(friendsRes) || [])
      setReceivedRequests(unwrap(receivedRes) || [])
      setSentRequests(unwrap(sentRes) || [])
    } catch (err) {
      console.error('Failed to load friend data', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Pull-to-refresh: tải lại cả bạn bè lẫn danh sách users trong context
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([loadData(), loadUsers()])
    setRefreshing(false)
  }, [loadData, loadUsers])

  // Tải dữ liệu lần đầu khi mount
  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Tìm kiếm người dùng với phân trang ──────────────────────────────────────

  /**
   * Gọi API tìm kiếm người dùng.
   * @param keyword Từ khóa tìm kiếm
   * @param page    Trang cần tải (0-based)
   * @param replace true = thay thế kết quả cũ (tìm kiếm mới), false = thêm vào (load more)
   *
   * Loại bỏ bản thân (myId) khỏi kết quả tìm kiếm.
   * Dùng pageData.last từ Spring Page để biết còn trang tiếp theo không.
   */
  const fetchSearch = useCallback(async (keyword: string, page: number, replace: boolean) => {
    if (page === 0) setSearchLoading(true)
    else setLoadingMore(true)
    try {
      const res = await searchUsersApi(keyword, page)
      const pageData = unwrap(res)
      const items: User[] = (pageData?.content || []).filter(
        (u: User) => String(u.id || u._id) !== myId
      )
      setSearchResults((prev) => replace ? items : [...prev, ...items])
      setSearchHasMore(!pageData?.last)
      setSearchPage(page)
    } catch (err) {
      console.error('Search failed', err)
    } finally {
      setSearchLoading(false)
      setLoadingMore(false)
    }
  }, [myId])

  /**
   * Debounce 400ms khi người dùng gõ tìm kiếm.
   * Mỗi lần search thay đổi, hủy timer cũ và tạo timer mới.
   * Sau 400ms không gõ thêm → gọi API với trang 0, replace=true.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSearch(search, 0, true)
    }, 400)
    return () => clearTimeout(timer)
  }, [search, fetchSearch])

  /**
   * Infinite scroll: tải trang tiếp theo khi người dùng cuộn gần cuối danh sách.
   * Chỉ tải thêm khi không đang loading và còn dữ liệu.
   */
  const handleLoadMore = () => {
    if (!loadingMore && searchHasMore) {
      fetchSearch(search, searchPage + 1, false)
    }
  }

  // ── Derived state (tính từ dữ liệu đã tải) ─────────────────────────────────

  // Set ID để tra trạng thái quan hệ O(1) thay vì O(n)
  const friendIds = new Set(friends.map((f) => String(f.id || f._id)))
  const sentToIds = new Set(sentRequests.map((r) => String(r.receiverId)))
  const receivedFromIds = new Set(receivedRequests.map((r) => String(r.senderId)))

  // Filter bạn bè theo từ khóa tìm kiếm (local filtering, không cần API)
  const filteredFriends = friends.filter((u) => {
    const q = search.toLowerCase()
    return (
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q)
    )
  })

  // ── Các action với API ──────────────────────────────────────────────────────

  /**
   * Gửi lời mời kết bạn đến targetId.
   * Sau khi gửi thành công, tải lại danh sách sentRequests để cập nhật UI ngay.
   */
  const handleSendRequest = async (targetId: string) => {
    setActionLoading(targetId)
    try {
      await sendFriendRequestApi(targetId)
      const newReq = unwrap(await getFriendRequestsSentApi())
      setSentRequests(newReq || [])
    } catch (err: any) {
      Alert.alert('Lỗi', err.response?.data?.message || 'Không thể gửi lời mời.')
    } finally {
      setActionLoading(null)
    }
  }

  /**
   * Huỷ lời mời kết bạn đã gửi đến targetId.
   * Tìm request ID từ sentRequests để gọi API, sau đó xóa khỏi state local.
   */
  const handleCancelRequest = async (targetId: string) => {
    const req = sentRequests.find((r) => String(r.receiverId) === targetId)
    if (!req?.id) return
    setActionLoading(targetId)
    try {
      await cancelFriendRequestApi(req.id)
      setSentRequests((prev) => prev.filter((r) => r.id !== req.id))
    } catch (err: any) {
      Alert.alert('Lỗi', err.response?.data?.message || 'Không thể huỷ lời mời.')
    } finally {
      setActionLoading(null)
    }
  }

  /**
   * Chấp nhận lời mời kết bạn.
   * Sau khi accept thành công, tải lại toàn bộ dữ liệu (vì cả friends lẫn requests đều thay đổi).
   */
  const handleAccept = async (req: FriendRequest) => {
    if (!req.id) return
    setActionLoading(req.id)
    try {
      await acceptFriendRequestApi(req.id)
      await loadData() // Tải lại để cập nhật cả friendsList và receivedRequests
    } catch (err: any) {
      Alert.alert('Lỗi', err.response?.data?.message || 'Không thể chấp nhận.')
    } finally {
      setActionLoading(null)
    }
  }

  /**
   * Từ chối lời mời kết bạn.
   * Xóa request khỏi state local ngay (optimistic) thay vì tải lại toàn bộ.
   */
  const handleDecline = async (req: FriendRequest) => {
    if (!req.id) return
    setActionLoading(req.id)
    try {
      await declineFriendRequestApi(req.id)
      setReceivedRequests((prev) => prev.filter((r) => r.id !== req.id))
    } catch (err: any) {
      Alert.alert('Lỗi', err.response?.data?.message || 'Không thể từ chối.')
    } finally {
      setActionLoading(null)
    }
  }

  /**
   * Huỷ kết bạn với confirm dialog (destructive action).
   * Xóa bạn khỏi state local sau khi API thành công.
   */
  const handleUnfriend = (friendId: string, name: string) => {
    Alert.alert('Huỷ kết bạn', `Bạn có muốn huỷ kết bạn với ${name}?`, [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Huỷ kết bạn',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(friendId)
          try {
            await unfriendApi(friendId)
            setFriends((prev) =>
              prev.filter((f) => String(f.id || f._id) !== friendId)
            )
          } catch (err: any) {
            Alert.alert('Lỗi', err.response?.data?.message || 'Không thể huỷ kết bạn.')
          } finally {
            setActionLoading(null)
          }
        },
      },
    ])
  }

  /**
   * Chat với một người bạn:
   * - Gọi openOrCreateConversation để lấy hoặc tạo mới conversation 1-1
   * - Điều hướng vào màn hình chat
   */
  const handleChatWithFriend = async (u: User) => {
    const uid = String(u.id || u._id)
    const conv = await openOrCreateConversation(uid)
    const name = u.displayName || u.username || 'Unknown'
    if (conv) {
      router.push({
        pathname: '/chat/[id]',
        params: {
          id: String(conv.id || conv._id),
          partnerName: name,
          partnerId: uid,
        },
      })
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  /**
   * Xác định trạng thái quan hệ với một user:
   * - 'friend':   đã là bạn bè
   * - 'sent':     đã gửi lời mời cho họ, chờ xác nhận
   * - 'received': họ đã gửi lời mời cho mình
   * - 'none':     chưa có quan hệ
   */
  const getFriendStatus = (uid: string) => {
    if (friendIds.has(uid)) return 'friend'
    if (sentToIds.has(uid)) return 'sent'
    if (receivedFromIds.has(uid)) return 'received'
    return 'none'
  }

  /**
   * Render một item trong tab "Mọi người" (kết quả tìm kiếm).
   * Hiển thị nút action khác nhau tùy trạng thái quan hệ:
   * - none:     nút "+ Kết bạn"
   * - sent:     nút "Đã gửi ✕" (nhấn để huỷ)
   * - received: label "Đã gửi cho bạn" (không có action ở đây, phải sang tab Lời mời)
   * - friend:   nút "💬 Chat"
   */
  const renderPersonItem = ({ item: u }: { item: User }) => {
    const uid = String(u.id || u._id)
    const name = u.displayName || u.username || 'Unknown'
    const online = isOnline(uid)
    const status = getFriendStatus(uid)
    const isActing = actionLoading === uid // Chỉ disable button của user đang xử lý

    return (
      <View style={styles.item}>
        <UserAvatar name={name} size="md" online={online} />
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>{name}</Text>
          {/* Hiện "Đang hoạt động" nếu online, nếu không thì hiện email hoặc @username */}
          <Text style={[styles.itemSub, online && styles.onlineSub]} numberOfLines={1}>
            {online ? 'Đang hoạt động' : u.email || '@' + u.username}
          </Text>
        </View>
        <View style={styles.actionArea}>
          {status === 'none' && (
            <TouchableOpacity
              style={styles.btnAdd}
              onPress={() => handleSendRequest(uid)}
              disabled={isActing}
            >
              {isActing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnAddText}>+ Kết bạn</Text>
              )}
            </TouchableOpacity>
          )}
          {status === 'sent' && (
            // Nút "Đã gửi ✕": nhấn vào để huỷ lời mời
            <TouchableOpacity
              style={styles.btnPending}
              onPress={() => handleCancelRequest(uid)}
              disabled={isActing}
            >
              {isActing ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={styles.btnPendingText}>Đã gửi ✕</Text>
              )}
            </TouchableOpacity>
          )}
          {status === 'received' && (
            // Chỉ hiện label, action accept/decline ở tab "Lời mời"
            <Text style={styles.receivedLabel}>Đã gửi cho bạn</Text>
          )}
          {status === 'friend' && (
            <TouchableOpacity
              style={styles.btnChat}
              onPress={() => handleChatWithFriend(u)}
            >
              <Text style={styles.btnChatText}>💬 Chat</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  /**
   * Render một item trong tab "Bạn bè".
   * Toàn bộ row nhấn được để chat nhanh.
   * Nút "Huỷ" ở góc phải để huỷ kết bạn.
   */
  const renderFriendItem = ({ item: u }: { item: User }) => {
    const uid = String(u.id || u._id)
    const name = u.displayName || u.username || 'Unknown'
    const online = isOnline(uid)

    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => handleChatWithFriend(u)}
        activeOpacity={0.75}
      >
        <UserAvatar name={name} size="md" online={online} />
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>{name}</Text>
          <Text style={[styles.itemSub, online && styles.onlineSub]}>
            {online ? 'Đang hoạt động' : 'Ngoại tuyến'}
          </Text>
        </View>
        {/* Nút huỷ kết bạn - stopPropagation ngầm vì TouchableOpacity lồng nhau */}
        <TouchableOpacity
          style={styles.btnUnfriend}
          onPress={() => handleUnfriend(uid, name)}
          disabled={actionLoading === uid}
        >
          <Text style={styles.btnUnfriendText}>Huỷ</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  /**
   * Render một item trong tab "Lời mời" (lời mời kết bạn nhận được).
   * Tra thông tin người gửi từ danh sách users trong ChatContext.
   * Hai nút: "Chấp nhận" (primary) và "Từ chối" (ghost).
   */
  const renderRequestItem = ({ item: req }: { item: FriendRequest }) => {
    // Tra thông tin người gửi từ danh sách users đã tải trong ChatContext
    const sender = users.find((u) => String(u.id || u._id) === String(req.senderId))
    const name = sender?.displayName || sender?.username || 'Unknown'
    const uid = String(req.senderId)
    const isActing = actionLoading === req.id // Dùng req.id thay vì uid để phân biệt

    return (
      <View style={styles.item}>
        <UserAvatar name={name} size="md" />
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>{name}</Text>
          <Text style={styles.itemSub}>Muốn kết bạn với bạn</Text>
        </View>
        {/* Hai nút xếp dọc bên phải */}
        <View style={styles.requestActions}>
          <TouchableOpacity
            style={styles.btnAccept}
            onPress={() => handleAccept(req)}
            disabled={isActing}
          >
            {isActing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnAcceptText}>Chấp nhận</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnDecline}
            onPress={() => handleDecline(req)}
            disabled={isActing}
          >
            <Text style={styles.btnDeclineText}>Từ chối</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Render chính ─────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Ô tìm kiếm — dùng chung cho cả 3 tab */}
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

      {/* Sub-tab toggle: Mọi người / Bạn bè (N) / Lời mời (N) */}
      <View style={styles.subTabRow}>
        {(['people', 'friends', 'requests'] as SubTab[]).map((t) => {
          // Label hiện count nếu có dữ liệu (trừ tab people)
          const labels: Record<SubTab, string> = {
            people: 'Mọi người',
            friends: `Bạn bè${friends.length > 0 ? ` (${friends.length})` : ''}`,
            requests: `Lời mời${receivedRequests.length > 0 ? ` (${receivedRequests.length})` : ''}`,
          }
          return (
            <TouchableOpacity
              key={t}
              style={[styles.subTabBtn, subTab === t && styles.subTabBtnActive]}
              onPress={() => setSubTab(t)}
            >
              <Text style={[styles.subTabText, subTab === t && styles.subTabTextActive]}>
                {labels[t]}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <>
          {/* Tab Mọi người: FlatList kết quả tìm kiếm với infinite scroll */}
          {subTab === 'people' && (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => String(item.id || item._id)}
              renderItem={renderPersonItem}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              onEndReached={handleLoadMore}         // Trigger khi cuộn gần cuối
              onEndReachedThreshold={0.3}           // Trigger khi còn 30% cuối
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={async () => {
                    setRefreshing(true)
                    await Promise.all([loadData(), fetchSearch(search, 0, true)])
                    setRefreshing(false)
                  }}
                />
              }
              // Footer spinner khi đang load thêm
              ListFooterComponent={
                loadingMore ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null
              }
              ListEmptyComponent={
                searchLoading ? (
                  <View style={styles.center}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                  </View>
                ) : (
                  <View style={styles.center}>
                    <Text style={{ fontSize: 40, marginBottom: 12 }}>👥</Text>
                    <Text style={styles.emptyText}>Không tìm thấy người dùng</Text>
                  </View>
                )
              }
            />
          )}

          {/* Tab Bạn bè: danh sách đã lọc theo search */}
          {subTab === 'friends' && (
            <FlatList
              data={filteredFriends}
              keyExtractor={(item) => String(item.id || item._id)}
              renderItem={renderFriendItem}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>🤝</Text>
                  <Text style={styles.emptyText}>Chưa có bạn bè nào</Text>
                </View>
              }
            />
          )}

          {/* Tab Lời mời: chỉ hiển thị lời mời NHẬN được (không hiện lời mời đã gửi) */}
          {subTab === 'requests' && (
            <FlatList
              data={receivedRequests}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderRequestItem}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>📨</Text>
                  <Text style={styles.emptyText}>Không có lời mời nào</Text>
                </View>
              }
            />
          )}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  // Ô tìm kiếm hình pill
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

  // Sub-tab toggle (pill style giống tab login)
  subTabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.inputBg,
    marginHorizontal: 10,
    marginBottom: 8,
    borderRadius: 10,
    padding: 3,
  },
  subTabBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  subTabBtnActive: { backgroundColor: Colors.primary },
  subTabText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  subTabTextActive: { color: '#fff' },

  // Container căn giữa cho empty/loading state
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: Colors.textSecondary, fontSize: 15, textAlign: 'center' },

  // Mỗi item trong danh sách
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemInfo: { flex: 1, marginLeft: 12 },
  itemName: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  itemSub: { fontSize: 12, color: Colors.textSecondary },
  onlineSub: { color: Colors.online }, // Override màu khi online

  // Vùng chứa nút action bên phải
  actionArea: { marginLeft: 8, alignItems: 'flex-end' },

  // Nút "+ Kết bạn" — màu primary
  btnAdd: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  btnAddText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Nút "Đã gửi ✕" — viền primary, background trong suốt
  btnPending: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  btnPendingText: { color: Colors.primary, fontSize: 12, fontWeight: '600' },

  // Label "Đã gửi cho bạn" — chỉ text, không có action
  receivedLabel: { fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic' },

  // Nút "💬 Chat" — màu primaryLight
  btnChat: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnChatText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Nút "Huỷ" kết bạn — viền đỏ
  btnUnfriend: {
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 8,
  },
  btnUnfriendText: { color: Colors.danger, fontSize: 12 },

  // Container 2 nút Chấp nhận / Từ chối xếp dọc
  requestActions: { flexDirection: 'column', gap: 4, marginLeft: 8 },
  btnAccept: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
    minWidth: 90,
  },
  btnAcceptText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  btnDecline: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
    minWidth: 90,
  },
  btnDeclineText: { color: Colors.textSecondary, fontSize: 12 },

  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 76 },
})
