import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../context/ChatContext'
import { useSocket } from '../../context/SocketContext'
import UserAvatar from '../../components/UserAvatar'
import { Colors } from '../../constants/theme'
import {
  getFriendsApi,
  getFriendRequestsReceivedApi,
  getFriendRequestsSentApi,
  sendFriendRequestApi,
  acceptFriendRequestApi,
  declineFriendRequestApi,
  cancelFriendRequestApi,
  unfriendApi,
  searchUsersApi,
  unwrap,
} from '../../lib/api'
import { User } from '../../context/AuthContext'

type SubTab = 'people' | 'friends' | 'requests'

interface FriendRequest {
  id?: string
  senderId?: string
  receiverId?: string
  status?: string
  createdAt?: string
}

export default function ContactsScreen() {
  const { user } = useAuth()
  const { users, openOrCreateConversation, loadUsers } = useChat()
  const { isOnline } = useSocket()
  const router = useRouter()

  const [subTab, setSubTab] = useState<SubTab>('people')
  const [search, setSearch] = useState('')
  const [friends, setFriends] = useState<User[]>([])
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([])
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Search + pagination state
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [searchPage, setSearchPage] = useState(0)
  const [searchHasMore, setSearchHasMore] = useState(true)
  const [searchLoading, setSearchLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const myId = String(user?.id || user?._id || '')

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([loadData(), loadUsers()])
    setRefreshing(false)
  }, [loadData, loadUsers])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Search API ──────────────────────────────────────────────────────────────

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

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSearch(search, 0, true)
    }, 400)
    return () => clearTimeout(timer)
  }, [search, fetchSearch])

  const handleLoadMore = () => {
    if (!loadingMore && searchHasMore) {
      fetchSearch(search, searchPage + 1, false)
    }
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const friendIds = new Set(friends.map((f) => String(f.id || f._id)))
  const sentToIds = new Set(sentRequests.map((r) => String(r.receiverId)))
  const receivedFromIds = new Set(receivedRequests.map((r) => String(r.senderId)))

  const filteredFriends = friends.filter((u) => {
    const q = search.toLowerCase()
    return (
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q)
    )
  })

  // ── Actions ─────────────────────────────────────────────────────────────────

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

  const handleAccept = async (req: FriendRequest) => {
    if (!req.id) return
    setActionLoading(req.id)
    try {
      await acceptFriendRequestApi(req.id)
      await loadData()
    } catch (err: any) {
      Alert.alert('Lỗi', err.response?.data?.message || 'Không thể chấp nhận.')
    } finally {
      setActionLoading(null)
    }
  }

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

  const getFriendStatus = (uid: string) => {
    if (friendIds.has(uid)) return 'friend'
    if (sentToIds.has(uid)) return 'sent'
    if (receivedFromIds.has(uid)) return 'received'
    return 'none'
  }

  const renderPersonItem = ({ item: u }: { item: User }) => {
    const uid = String(u.id || u._id)
    const name = u.displayName || u.username || 'Unknown'
    const online = isOnline(uid)
    const status = getFriendStatus(uid)
    const isActing = actionLoading === uid

    return (
      <View style={styles.item}>
        <UserAvatar name={name} size="md" online={online} />
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>{name}</Text>
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

  const renderRequestItem = ({ item: req }: { item: FriendRequest }) => {
    const sender = users.find((u) => String(u.id || u._id) === String(req.senderId))
    const name = sender?.displayName || sender?.username || 'Unknown'
    const uid = String(req.senderId)
    const isActing = actionLoading === req.id

    return (
      <View style={styles.item}>
        <UserAvatar name={name} size="md" />
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>{name}</Text>
          <Text style={styles.itemSub}>Muốn kết bạn với bạn</Text>
        </View>
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

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Search */}
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

      {/* Sub-tabs */}
      <View style={styles.subTabRow}>
        {(['people', 'friends', 'requests'] as SubTab[]).map((t) => {
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
          {/* People tab */}
          {subTab === 'people' && (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => String(item.id || item._id)}
              renderItem={renderPersonItem}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.3}
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

          {/* Friends tab */}
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

          {/* Requests tab */}
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

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: Colors.textSecondary, fontSize: 15, textAlign: 'center' },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemInfo: { flex: 1, marginLeft: 12 },
  itemName: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  itemSub: { fontSize: 12, color: Colors.textSecondary },
  onlineSub: { color: Colors.online },

  actionArea: { marginLeft: 8, alignItems: 'flex-end' },
  btnAdd: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  btnAddText: { color: '#fff', fontSize: 12, fontWeight: '600' },
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
  receivedLabel: { fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic' },
  btnChat: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnChatText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  btnUnfriend: {
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 8,
  },
  btnUnfriendText: { color: Colors.danger, fontSize: 12 },

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
