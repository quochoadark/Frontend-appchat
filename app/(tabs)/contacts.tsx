import React, { useState } from 'react'
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
import { useChat } from '../../context/ChatContext'
import { useSocket } from '../../context/SocketContext'
import UserAvatar from '../../components/UserAvatar'
import { Colors } from '../../constants/theme'

export default function ContactsScreen() {
  const { user } = useAuth()
  const { users, openOrCreateConversation, openConversation, conversations, loadingConvs } = useChat()
  const { isOnline } = useSocket()
  const router = useRouter()
  const [search, setSearch] = useState('')

  const filtered = users
    .filter((u) => String(u._id || u.id) !== String(user?._id || user?.id))
    .filter((u) => {
      const q = search.toLowerCase()
      return (
        (u.name || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      )
    })

  const handlePress = async (u: any) => {
    const uid = String(u._id || u.id)
    await openOrCreateConversation(uid)
    // find the opened conversation to get its id for navigation
    const conv = conversations.find((c) => {
      if (c.type === 'GROUP') return false
      const ids = (c.participants || []).map((p) => String(p._id || p.id || p))
      return ids.includes(uid)
    })
    const name = u.name || u.username || 'Unknown'
    if (conv) {
      router.push({
        pathname: '/chat/[id]',
        params: { id: String(conv._id || conv.id), partnerName: name, partnerId: uid },
      })
    }
  }

  const renderItem = ({ item: u }: { item: any }) => {
    const uid = String(u._id || u.id)
    const online = isOnline(uid)
    const name = u.name || u.username || 'Unknown'

    return (
      <TouchableOpacity style={styles.item} onPress={() => handlePress(u)} activeOpacity={0.7}>
        <UserAvatar name={name} size="md" online={online} />
        <View style={styles.info}>
          <Text style={styles.name}>{name}</Text>
          <Text style={[styles.sub, online && styles.onlineSub]}>
            {online ? 'Đang hoạt động' : u.email || 'Ngoại tuyến'}
          </Text>
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
          placeholder="Tìm kiếm bạn bè..."
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
          <Text style={{ fontSize: 40, marginBottom: 12 }}>👥</Text>
          <Text style={styles.emptyText}>Không tìm thấy người dùng</Text>
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
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  info: { flex: 1, marginLeft: 12 },
  name: { fontSize: 16, fontWeight: '600', color: Colors.text, marginBottom: 3 },
  sub: { fontSize: 13, color: Colors.textSecondary },
  onlineSub: { color: Colors.online },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 76 },
})
