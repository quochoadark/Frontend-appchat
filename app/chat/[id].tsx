import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { FAKE_USERS } from '@/lib/fakeData';
import { getUserApi, type User } from '@/lib/api';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const PALETTE = ['#0a7ea4', '#e74c3c', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e67e22'];
function colorFor(name: string) {
  return PALETTE[(name || '?').charCodeAt(0) % PALETTE.length];
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: colorFor(name),
      justifyContent: 'center', alignItems: 'center',
    }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>
        {(name || '?').slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatScreen() {
  const { id, name: paramName, isGroup } = useLocalSearchParams<{ id: string; name: string; isGroup: string }>();
  const { user: me } = useAuth();
  const { getOrCreate, sendMessage, markRead, conversations } = useChat();

  const [partner, setPartner] = useState<User | null>(null);
  const [loadingPartner, setLoadingPartner] = useState(true);
  const [text, setText] = useState('');
  const flatRef = useRef<FlatList>(null);
  const groupMode = isGroup === '1';

  useEffect(() => {
    if (groupMode) {
      setLoadingPartner(false);
      return;
    }
    // Direct chat: lấy thông tin partner
    (async () => {
      try {
        // Thử fake users trước (nhanh hơn, không cần mạng)
        const fake = FAKE_USERS.find((u) => u.id === id);
        if (fake) {
          setPartner(fake);
          getOrCreate(fake);
          setLoadingPartner(false);
          return;
        }
        // Rồi mới gọi API
        const res = await getUserApi(id);
        if (res.data) {
          setPartner(res.data);
          getOrCreate(res.data);
        }
      } catch {
        setPartner({ id, username: paramName ?? id, email: '' } as User);
      } finally {
        setLoadingPartner(false);
      }
    })();
  }, [id, groupMode]);

  // Mark read khi mở
  useEffect(() => {
    if (id) markRead(id);
  }, [id, conversations.get(id)?.messages.length]);

  const conv = conversations.get(id);
  const messages = conv?.messages ?? [];
  const members = conv?.members ?? [];

  const screenTitle = groupMode
    ? (conv?.groupName ?? paramName ?? 'Nhóm chat')
    : (partner?.displayName || partner?.username || paramName || id);

  const memberCount = groupMode ? members.length : 0;

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !me?.id) return;
    const myName = me.displayName || me.username || 'Bạn';
    sendMessage(id, me.id, myName, trimmed);
    setText('');
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 50);
  }

  /** Tên hiển thị của người gửi trong group */
  function getSenderName(senderId: string, senderName?: string): string {
    if (senderId === me?.id) return 'Bạn';
    if (senderName) return senderName;
    const member = members.find((m) => m.id === senderId);
    return member?.displayName || member?.username || senderId;
  }

  if (loadingPartner) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#0a7ea4" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: screenTitle,
          headerRight: () =>
            groupMode ? (
              <Text style={styles.memberCount}>{memberCount} thành viên</Text>
            ) : partner?.isOnline ? (
              <View style={styles.onlineWrap}>
                <View style={styles.onlineDotHeader} />
                <Text style={styles.onlineText}>Online</Text>
              </View>
            ) : null,
        }}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <Avatar name={screenTitle} size={64} />
            <Text style={styles.emptyChatName}>{screenTitle}</Text>
            <Text style={styles.emptyChatHint}>Hãy bắt đầu cuộc trò chuyện! 👋</Text>
          </View>
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={(item) => item.id}
            style={styles.messageList}
            contentContainerStyle={styles.messageContent}
            onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item, index }) => {
              const isMe = item.senderId === me?.id;
              const prevMsg = messages[index - 1];
              const nextMsg = messages[index + 1];
              const sameAsPrev = prevMsg?.senderId === item.senderId;
              const sameAsNext = nextMsg?.senderId === item.senderId;
              const showSenderLabel = groupMode && !isMe && !sameAsPrev;
              const showAvatar = !isMe && !sameAsNext;
              const showTime =
                index === messages.length - 1 ||
                nextMsg?.senderId !== item.senderId ||
                (nextMsg?.sentAt.getTime() - item.sentAt.getTime()) > 300000;

              const senderName = getSenderName(item.senderId, item.senderName);

              return (
                <View style={[styles.msgGroup, isMe ? styles.msgGroupMe : styles.msgGroupThem]}>
                  {/* Avatar bên trái (them) */}
                  {!isMe && (
                    <View style={styles.avatarSlot}>
                      {showAvatar ? <Avatar name={senderName} size={28} /> : null}
                    </View>
                  )}

                  <View style={styles.bubbleColumn}>
                    {/* Tên người gửi trong group */}
                    {showSenderLabel && (
                      <Text style={[styles.senderLabel, { color: colorFor(senderName) }]}>
                        {senderName}
                      </Text>
                    )}

                    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                      <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
                        {item.content}
                      </Text>
                      {showTime && (
                        <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
                          {formatTime(item.sentAt)}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Nhập tin nhắn..."
            placeholderTextColor="#aaa"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <Pressable
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim()}
          >
            <Text style={styles.sendIcon}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },

  onlineWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 },
  onlineDotHeader: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2ecc71' },
  onlineText: { color: '#fff', fontSize: 12 },
  memberCount: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginRight: 12 },

  emptyChat: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  emptyChatName: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  emptyChatHint: { fontSize: 14, color: '#888' },

  messageList: { flex: 1 },
  messageContent: { padding: 12, paddingBottom: 4 },

  msgGroup: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 1 },
  msgGroupMe: { justifyContent: 'flex-end' },
  msgGroupThem: { justifyContent: 'flex-start' },

  avatarSlot: { width: 32, marginRight: 6, alignSelf: 'flex-end' },

  bubbleColumn: { maxWidth: '72%', flexDirection: 'column' },

  senderLabel: { fontSize: 11, fontWeight: '700', marginBottom: 2, marginLeft: 4 },

  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    paddingBottom: 6,
  },
  bubbleMe: {
    backgroundColor: '#0a7ea4',
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTextMe: { color: '#fff' },
  bubbleTextThem: { color: '#1a1a2e' },
  bubbleTime: { fontSize: 10, marginTop: 3 },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.65)', textAlign: 'right' },
  bubbleTimeThem: { color: '#aaa' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f7fa',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    color: '#1a1a2e',
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#0a7ea4',
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#c8dfe6' },
  sendIcon: { color: '#fff', fontSize: 16, marginLeft: 2 },
});
