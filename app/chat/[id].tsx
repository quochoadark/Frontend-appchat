import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import UserAvatar from '../../components/UserAvatar'
import { Colors } from '../../constants/theme'
import { useAuth } from '../../context/AuthContext'
import { Message, useChat } from '../../context/ChatContext'
import { useSocket } from '../../context/SocketContext'

const EMOJIS = [
  '😀', '😂', '😍', '🥰', '😎', '😭', '😡', '🥳',
  '👍', '👎', '❤️', '🔥', '✅', '🎉', '🙏', '💯',
  '😊', '🤔', '😴', '🤩', '😏', '🙄', '😬', '🤗',
  '👋', '🤝', '💪', '🫶', '🎊', '🌟', '💫', '⭐',
]

function formatTime(dateStr?: string) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateLabel(dateStr?: string) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
  if (diffDays === 0) return 'Hôm nay'
  if (diffDays === 1) return 'Hôm qua'
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isSameDay(a?: string, b?: string) {
  if (!a || !b) return false
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

export default function ChatScreen() {
  const { id, partnerName, partnerId } = useLocalSearchParams<{
    id: string
    partnerName: string
    partnerId: string
  }>()
  const router = useRouter()
  const { user } = useAuth()
  const { conversations, messages, loadingMsgs, sendMessage, receiveMessage, openConversation } =
    useChat()
  const { onMessage, emitTyping, emitStopTyping, joinRoom, isOnline, typingUsers } = useSocket()

  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const flatListRef = useRef<FlatList>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const name = partnerName || 'Unknown'
  const online = partnerId ? isOnline(partnerId) : false
  const isTyping = id ? !!typingUsers[id] : false

  // Open conversation on mount if not already active
  useEffect(() => {
    if (!id) return
    const conv = conversations.find((c) => (c._id || c.id) === id)
    if (conv) openConversation(conv)
  }, [id])

  // Join socket room and listen for messages
  useEffect(() => {
    if (!id) return
    joinRoom(id)
    const off = onMessage((msg: any) => receiveMessage(msg))
    return off
  }, [id])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }, [messages.length])

  const handleSend = useCallback(async () => {
    if (!text.trim()) return
    const content = text.trim()
    setText('')
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    emitStopTyping(id)
    await sendMessage(content)
  }, [text, id, sendMessage, emitStopTyping])

  const handleTextChange = (val: string) => {
    setText(val)
    emitTyping(id)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => emitStopTyping(id), 2000)
  }

  const handleEmojiPress = (emoji: string) => {
    setText((prev) => prev + emoji)
    setShowEmoji(false)
  }

  const renderMessage = ({ item: msg, index }: { item: Message; index: number }) => {
    const senderId = msg.sender?._id || msg.sender?.id || msg.senderId
    const isOut = String(senderId) === String(user?._id || user?.id)
    const prevMsg = messages[index - 1]
    const showDate = !prevMsg || !isSameDay(prevMsg.createdAt, msg.createdAt)

    return (
      <View>
        {showDate && (
          <View style={styles.dateDivider}>
            <Text style={styles.dateDividerText}>{formatDateLabel(msg.createdAt)}</Text>
          </View>
        )}
        <View style={[styles.msgWrapper, isOut && styles.msgWrapperOut]}>
          {!isOut && (
            <UserAvatar name={msg.sender?.name || msg.sender?.username || 'U'} size="sm" />
          )}
          <View style={[styles.bubble, isOut ? styles.bubbleOut : styles.bubbleIn]}>
            <Text style={styles.bubbleText}>{msg.content}</Text>
            <View style={styles.bubbleFooter}>
              <Text style={styles.bubbleTime}>{formatTime(msg.createdAt)}</Text>
              {isOut && <Text style={styles.bubbleTick}>✓✓</Text>}
            </View>
          </View>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <UserAvatar name={name} size="sm" online={online} />
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
          <Text style={styles.headerStatus}>
            {isTyping ? 'Đang gõ...' : online ? 'Đang hoạt động' : 'Ngoại tuyến'}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <View style={styles.messagesArea}>
          {loadingMsgs ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item, index) => String(item._id || item.id || index)}
              renderItem={renderMessage}
              contentContainerStyle={styles.messagesList}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            />
          )}
          {isTyping && (
            <View style={[styles.msgWrapper]}>
              <UserAvatar name={name} size="sm" />
              <View style={[styles.bubble, styles.bubbleIn, styles.typingBubble]}>
                <Text style={styles.typingText}>Đang gõ...</Text>
              </View>
            </View>
          )}
        </View>

        {/* Emoji Picker Modal */}
        <Modal
          visible={showEmoji}
          transparent
          animationType="slide"
          onRequestClose={() => setShowEmoji(false)}
        >
          <TouchableOpacity
            style={styles.emojiOverlay}
            activeOpacity={1}
            onPress={() => setShowEmoji(false)}
          >
            <View style={styles.emojiPicker}>
              <View style={styles.emojiGrid}>
                {EMOJIS.map((em) => (
                  <TouchableOpacity
                    key={em}
                    style={styles.emojiBtn}
                    onPress={() => handleEmojiPress(em)}
                  >
                    <Text style={styles.emojiText}>{em}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Input Area */}
        <View style={styles.inputArea}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setShowEmoji((v) => !v)}
          >
            <Text style={{ fontSize: 22 }}>😊</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            placeholder="Nhập tin nhắn..."
            placeholderTextColor={Colors.textSecondary}
            value={text}
            onChangeText={handleTextChange}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim()}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingTop: Platform.OS === 'android' ? 40 : 10,
  },
  backBtn: { marginRight: 8, padding: 4 },
  headerInfo: { flex: 1, marginLeft: 10 },
  headerName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  headerStatus: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  messagesArea: { flex: 1, backgroundColor: Colors.background },
  messagesList: { padding: 10, paddingBottom: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dateDivider: {
    alignItems: 'center',
    marginVertical: 10,
  },
  dateDividerText: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    color: '#fff',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  msgWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 4,
    paddingHorizontal: 6,
  },
  msgWrapperOut: { flexDirection: 'row-reverse' },
  bubble: {
    maxWidth: '75%',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginHorizontal: 6,
  },
  bubbleIn: {
    backgroundColor: Colors.bubbleIn,
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleOut: {
    backgroundColor: Colors.bubbleOut,
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 15, color: Colors.text, lineHeight: 20 },
  bubbleFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 3,
  },
  bubbleTime: { fontSize: 11, color: Colors.textSecondary },
  bubbleTick: { fontSize: 11, color: Colors.primary, marginLeft: 4 },
  typingBubble: { paddingVertical: 10 },
  typingText: { color: Colors.textSecondary, fontSize: 14, fontStyle: 'italic' },
  emojiOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  emojiPicker: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 12,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  emojiBtn: { padding: 8 },
  emojiText: { fontSize: 26 },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  iconBtn: { padding: 6, justifyContent: 'center', alignItems: 'center' },
  textInput: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 7,
    fontSize: 15,
    color: Colors.text,
    maxHeight: 100,
    marginHorizontal: 6,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.border },
})
