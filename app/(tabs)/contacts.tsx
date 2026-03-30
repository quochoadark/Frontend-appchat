import { useAuth } from '@/context/AuthContext';
import { useChat, FAKE_CONTACT_USERS } from '@/context/ChatContext';
import { getUsersApi, type User } from '@/lib/api';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

function Avatar({ name, size = 46 }: { name: string; size?: number }) {
  const initials = (name || '?').slice(0, 2).toUpperCase();
  const palette = ['#0a7ea4', '#e74c3c', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e67e22'];
  const bg = palette[name.charCodeAt(0) % palette.length];
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

export default function ContactsScreen() {
  const { user: me } = useAuth();
  const { getOrCreate, conversations } = useChat();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setError(null);
      const res = await getUsersApi();
      if (res.statusCode === 200 && res.data && res.data.length > 0) {
        // Gộp: ưu tiên API, bổ sung fake users nếu chưa có
        const apiIds = new Set(res.data.map((u) => u.id));
        const extras = FAKE_CONTACT_USERS.filter((u) => !apiIds.has(u.id));
        setUsers([...res.data, ...extras].filter((u) => u.id !== me?.id));
      } else {
        // API lỗi hoặc chưa có dữ liệu → dùng fake users
        setUsers(FAKE_CONTACT_USERS.filter((u) => u.id !== me?.id));
      }
    } catch {
      // Không kết nối được → dùng fake users
      setUsers(FAKE_CONTACT_USERS.filter((u) => u.id !== me?.id));
    }
  }, [me?.id]);

  useEffect(() => {
    fetchUsers().finally(() => setLoading(false));
  }, [fetchUsers]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  }

  function openChat(partner: User) {
    // Đảm bảo conversation tồn tại trong ChatContext
    getOrCreate(partner);
    const name = partner.displayName || partner.username;
    router.push({ pathname: '/chat/[id]', params: { id: partner.id, name } });
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.username?.toLowerCase().includes(q) ||
      u.displayName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0a7ea4" />
      </View>
    );
  }

  // Không hiển thị lỗi nữa vì đã có fallback fake data

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm kiếm theo tên, email..."
          placeholderTextColor="#aaa"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0a7ea4" />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Không tìm thấy liên hệ nào</Text>
          </View>
        }
        renderItem={({ item }) => {
          const name = item.displayName || item.username;
          const conv = conversations.get(item.id);
          const hasChat = !!conv?.lastMessage;

          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => openChat(item)}
            >
              <View style={styles.avatarWrap}>
                <Avatar name={name} />
                {item.isOnline && <View style={styles.onlineDot} />}
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{name}</Text>
                <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
                {item.bio ? (
                  <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text>
                ) : null}
              </View>
              <View style={styles.actions}>
                <Pressable style={styles.chatBtn} onPress={() => openChat(item)}>
                  <Text style={styles.chatBtnText}>{hasChat ? '💬' : '✉️'}</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#f5f7fa' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: '#333' },
  separator: { height: 1, backgroundColor: '#eee', marginLeft: 74 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowPressed: { backgroundColor: '#f0f0f0' },
  avatarWrap: { position: 'relative', marginRight: 12 },
  avatar: { justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: '#2ecc71', borderWidth: 2, borderColor: '#fff',
  },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#1a1a2e' },
  email: { fontSize: 12, color: '#888', marginTop: 1 },
  bio: { fontSize: 12, color: '#aaa', marginTop: 2, fontStyle: 'italic' },
  actions: { marginLeft: 8 },
  chatBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#e8f4f8',
    justifyContent: 'center', alignItems: 'center',
  },
  chatBtnText: { fontSize: 18 },
  emptyText: { fontSize: 14, color: '#999' },
  errorEmoji: { fontSize: 40, marginBottom: 12 },
  errorText: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    backgroundColor: '#0a7ea4', borderRadius: 8,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
