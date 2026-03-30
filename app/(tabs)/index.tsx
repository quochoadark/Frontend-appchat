import { useAuth } from '@/context/AuthContext';
import { useChat, type Conversation } from '@/context/ChatContext';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

const PALETTE = ['#0a7ea4', '#e74c3c', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e67e22'];

function colorFor(name: string) {
  return PALETTE[(name || '?').charCodeAt(0) % PALETTE.length];
}

/** Avatar đơn (direct chat) */
function SingleAvatar({ name, size = 48 }: { name: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(name) }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.35 }]}>
        {(name || '?').slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

/** Avatar ghép (group chat) – hiển thị 2 avatar nhỏ chồng nhau */
function GroupAvatar({ names, size = 48 }: { names: string[]; size?: number }) {
  const small = size * 0.62;
  const [a, b] = names;
  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <View style={[styles.avatar, {
        width: small, height: small, borderRadius: small / 2,
        backgroundColor: colorFor(a ?? ''),
        position: 'absolute', top: 0, left: 0,
        borderWidth: 1.5, borderColor: '#fff',
      }]}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: small * 0.38 }}>
          {(a || '?').slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={[styles.avatar, {
        width: small, height: small, borderRadius: small / 2,
        backgroundColor: colorFor(b ?? 'Z'),
        position: 'absolute', bottom: 0, right: 0,
        borderWidth: 1.5, borderColor: '#fff',
      }]}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: small * 0.38 }}>
          {(b || '?').slice(0, 1).toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

function formatTime(date: Date) {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60000) return 'vừa xong';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} phút`;
  if (diff < 86400000) return date.toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('vi', { day: '2-digit', month: '2-digit' });
}

function ConvRow({ item, myId }: { item: Conversation; myId: string }) {
  const isDirect = item.type === 'DIRECT';

  const title = isDirect
    ? (item.partner?.displayName || item.partner?.username || '')
    : (item.groupName ?? 'Nhóm chat');

  const memberNames = isDirect
    ? []
    : (item.members ?? []).map((m) => m.displayName || m.username || '');

  const isOnline = isDirect ? !!item.partner?.isOnline : false;

  const lastSenderMe = item.lastMessage?.senderId === myId;
  const lastSenderName = isDirect
    ? (lastSenderMe ? 'Bạn' : '')
    : (lastSenderMe ? 'Bạn' : item.lastMessage?.senderName?.split(' ').pop() ?? '');

  const preview = item.lastMessage
    ? `${lastSenderName ? lastSenderName + ': ' : ''}${item.lastMessage.content}`
    : 'Bắt đầu cuộc trò chuyện';

  function open() {
    router.push({
      pathname: '/chat/[id]',
      params: { id: item.id, name: title, isGroup: isDirect ? '0' : '1' },
    });
  }

  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={open}>
      {/* Avatar */}
      <View style={styles.avatarWrap}>
        {isDirect ? (
          <>
            <SingleAvatar name={title} />
            {isOnline && <View style={styles.onlineDot} />}
          </>
        ) : (
          <GroupAvatar names={memberNames} />
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.topRow}>
          <View style={styles.titleRow}>
            {!isDirect && <Text style={styles.groupTag}>👥 </Text>}
            <Text style={styles.name} numberOfLines={1}>{title}</Text>
          </View>
          {item.lastMessage && (
            <Text style={styles.time}>{formatTime(item.lastMessage.sentAt)}</Text>
          )}
        </View>
        <View style={styles.bottomRow}>
          <Text style={[styles.preview, item.unread > 0 && styles.previewBold]} numberOfLines={1}>
            {preview}
          </Text>
          {item.unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function ChatsScreen() {
  const { user } = useAuth();
  const { conversations } = useChat();

  const convList = Array.from(conversations.values()).sort(
    (a, b) => (b.lastMessage?.sentAt.getTime() ?? 0) - (a.lastMessage?.sentAt.getTime() ?? 0)
  );

  if (convList.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>💬</Text>
        <Text style={styles.emptyTitle}>Chưa có tin nhắn nào</Text>
        <Text style={styles.emptySubtitle}>Vào tab Liên hệ để bắt đầu trò chuyện</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={convList}
      keyExtractor={(item) => item.id}
      style={styles.list}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => <ConvRow item={item} myId={user?.id ?? ''} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#fff' },
  separator: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 76 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  rowPressed: { backgroundColor: '#f5f5f5' },
  avatarWrap: { position: 'relative', marginRight: 12, width: 48, height: 48 },
  avatar: { justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  onlineDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#2ecc71', borderWidth: 2, borderColor: '#fff',
  },
  info: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  groupTag: { fontSize: 13 },
  name: { fontSize: 15, fontWeight: '600', color: '#1a1a2e', flex: 1 },
  time: { fontSize: 12, color: '#999', marginLeft: 8 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  preview: { fontSize: 13, color: '#888', flex: 1 },
  previewBold: { color: '#333', fontWeight: '600' },
  badge: {
    backgroundColor: '#0a7ea4', borderRadius: 10, minWidth: 20, height: 20,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5, marginLeft: 8,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center' },
});
