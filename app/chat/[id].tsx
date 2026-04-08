import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImagePicker from 'expo-image-picker'
import * as MediaLibrary from 'expo-media-library'
import * as Sharing from 'expo-sharing'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import UserAvatar from '../../components/UserAvatar'
import { Colors } from '../../constants/theme'
import { useAuth } from '../../context/AuthContext'
import { Message, useChat } from '../../context/ChatContext'
import { ChatNotification, useSocket } from '../../context/SocketContext'
import {
  deleteMessageApi,
  demoteFromAdminApi,
  getConversationByIdApi,
  getUserByIdApi,
  promoteToAdminApi,
  removeGroupMemberApi,
  sendMessageRestApi,
  unwrap,
  uploadFileApi,
} from '../../lib/api'

const EMOJIS = [
  '😀', '😂', '😍', '🥰', '😎', '😭', '😡', '🥳',
  '👍', '👎', '❤️', '🔥', '✅', '🎉', '🙏', '💯',
  '😊', '🤔', '😴', '🤩', '😏', '🙄', '😬', '🤗',
  '👋', '🤝', '💪', '🫶', '🎊', '🌟', '💫', '⭐',
]

function formatTime(dateStr?: string) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
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

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isSameDay(a?: string, b?: string) {
  if (!a || !b) return false
  const da = new Date(a), db = new Date(b)
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
}

export default function ChatScreen() {
  const { id, partnerName, partnerId } = useLocalSearchParams<{
    id: string; partnerName: string; partnerId: string
  }>()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user } = useAuth()
  const { conversations, messages, loadingMsgs, receiveMessage, openConversation } = useChat()
  const { subscribeConversation, sendTyping, sendRead, isOnline } = useSocket()

  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [typingVisible, setTypingVisible] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Image viewer
  const [viewingImage, setViewingImage] = useState<string | null>(null)
  const [savingImage, setSavingImage] = useState(false)
  // File download
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null)

  // Info modal
  const [showInfo, setShowInfo] = useState(false)
  const [loadingInfo, setLoadingInfo] = useState(false)
  // Direct info
  const [partnerInfo, setPartnerInfo] = useState<any>(null)
  // Group info
  const [groupConv, setGroupConv] = useState<any>(null)
  const [groupMembers, setGroupMembers] = useState<any[]>([])
  const [groupSearch, setGroupSearch] = useState('')
  const [memberActionLoading, setMemberActionLoading] = useState<string | null>(null)
  const [deletedMsgIds, setDeletedMsgIds] = useState<Set<string>>(new Set())

  const flatListRef = useRef<FlatList>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingHideRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const name = partnerName || 'Unknown'
  const online = partnerId ? isOnline(partnerId) : false
  const myId = String(user?.id || user?._id || '')

  const convObj = conversations.find((c) => String(c.id || c._id) === id)
  const isGroupConv = convObj?.type === 'GROUP'

  useEffect(() => {
    if (!id) return
    const conv = conversations.find((c) => String(c.id || c._id) === id)
    if (conv) openConversation(conv)
  }, [id])

  // Re-subscribe when receiveMessage changes (fixes stale closure after openConversation sets activeConv)
  useEffect(() => {
    if (!id) return
    const unsubscribe = subscribeConversation(id, (n: ChatNotification) => {
      if (n.type === 'NEW_MESSAGE' && n.data) {
        receiveMessage({
          id: n.data.id,
          conversationId: n.data.conversationId || id,
          senderId: n.data.senderId,
          senderDisplayName: n.data.senderDisplayName,
          messageType: n.data.messageType,
          content: n.data.content,
          media: n.data.media,
          replyToMessageId: n.data.replyToMessageId,
          readBy: n.data.readBy,
          deleted: n.data.deleted,
          createdAt: n.data.createdAt,
        } as Message)
        sendRead(id)
      } else if (n.type === 'TYPING' && n.data?.senderId !== myId) {
        setTypingVisible(true)
        if (typingHideRef.current) clearTimeout(typingHideRef.current)
        typingHideRef.current = setTimeout(() => setTypingVisible(false), 3000)
      }
    })
    return () => {
      unsubscribe()
      if (typingHideRef.current) clearTimeout(typingHideRef.current)
    }
  }, [id, myId, receiveMessage])

  useEffect(() => {
    if (messages.length > 0)
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
  }, [messages.length])

  // Use REST API for sending — message appears immediately without relying on WebSocket echo
  const handleSend = useCallback(async () => {
    if (!text.trim() || !id) return
    const content = text.trim()
    setText('')
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    try {
      const res = await sendMessageRestApi(id, { messageType: 'TEXT', content })
      const msg = unwrap(res)
      if (msg) receiveMessage({ ...msg, conversationId: msg.conversationId || id })
    } catch (err: any) {
      Alert.alert('Lỗi', 'Không thể gửi tin nhắn.')
      setText(content)
    }
  }, [text, id, receiveMessage])

  const handleTextChange = (val: string) => {
    setText(val)
    if (!id) return
    sendTyping(id)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => { }, 2000)
  }

  const handleEmojiPress = (emoji: string) => {
    setText((prev) => prev + emoji)
    setShowEmoji(false)
  }

  // ── Upload helpers ────────────────────────────────────────────────────────

  const uploadAndSend = async (
    uri: string,
    fileName: string,
    mimeType: string,
    messageType: 'IMAGE' | 'FILE'
  ) => {
    if (!id) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', { uri, name: fileName, type: mimeType } as any)
      const uploadRes = await uploadFileApi(formData)
      const uploaded = unwrap(uploadRes)
      const res = await sendMessageRestApi(id, {
        messageType,
        content: fileName,
        media: {
          url: uploaded?.url || uploaded?.fileUrl,
          fileName: uploaded?.fileName || fileName,
          fileSize: uploaded?.fileSize,
          mimeType: uploaded?.mimeType || mimeType,
        },
      })
      const msg = unwrap(res)
      if (msg) receiveMessage({ ...msg, conversationId: msg.conversationId || id })
    } catch (err: any) {
      Alert.alert('Lỗi', err.response?.data?.message || 'Không thể gửi file.')
    } finally {
      setUploading(false)
    }
  }

  const handlePickImage = async () => {
    setShowAttach(false)
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Cần quyền truy cập', 'Hãy cho phép ứng dụng truy cập thư viện ảnh.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    await uploadAndSend(asset.uri, asset.fileName || `image_${Date.now()}.jpg`, asset.mimeType || 'image/jpeg', 'IMAGE')
  }

  const handlePickFile = async () => {
    setShowAttach(false)
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
      if (result.canceled || !result.assets?.[0]) return
      const asset = result.assets[0]
      await uploadAndSend(asset.uri, asset.name, asset.mimeType || 'application/octet-stream', 'FILE')
    } catch {
      Alert.alert('Lỗi', 'Không thể chọn tệp.')
    }
  }

  // ── Image save ────────────────────────────────────────────────────────────

  const handleSaveImage = async (url: string) => {
    setSavingImage(true)
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Cần quyền', 'Hãy cho phép truy cập thư viện ảnh.')
        return
      }
      const ext = url.split('.').pop()?.split('?')[0] || 'jpg'
      const cacheUri = `${FileSystem.cacheDirectory}img_${Date.now()}.${ext}`
      const { uri } = await FileSystem.downloadAsync(url, cacheUri, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      await MediaLibrary.saveToLibraryAsync(uri)
      Alert.alert('Thành công', 'Ảnh đã lưu vào thư viện.')
    } catch (e) {
      console.error('[SaveImage]', e)
      Alert.alert('Lỗi', 'Không thể lưu ảnh.')
    } finally {
      setSavingImage(false)
    }
  }

  const getMimeType = (ext: string): string => {
    const map: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      zip: 'application/zip',
      txt: 'text/plain',
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
    }
    return map[ext.toLowerCase()] || 'application/octet-stream'
  }

  const downloadToCache = async (url: string, fileName: string): Promise<string> => {
    const cacheUri = `${FileSystem.cacheDirectory}dl_${Date.now()}_${fileName}`
    const { uri } = await FileSystem.downloadAsync(url, cacheUri, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    })
    return uri
  }

  const handleShareFile = async (url: string, fileName: string) => {
    setDownloadingFile(url)
    try {
      const ext = fileName.includes('.') ? fileName.split('.').pop()! : 'bin'
      const cachedUri = await downloadToCache(url, fileName)
      await Sharing.shareAsync(cachedUri, {
        mimeType: getMimeType(ext),
        dialogTitle: `Chia sẻ "${fileName}"`,
        UTI: ext,
      })
    } catch (e) {
      console.error('[ShareFile]', e)
      Alert.alert('Lỗi', 'Không thể chia sẻ tệp.')
    } finally {
      setDownloadingFile(null)
    }
  }

  const handleSaveFile = async (url: string, fileName: string) => {
    setDownloadingFile(url)
    try {
      const ext = fileName.includes('.') ? fileName.split('.').pop()! : 'bin'
      const cachedUri = await downloadToCache(url, fileName)
      const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()
      if (!perm.granted) return
      const mime = getMimeType(ext)
      const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
        perm.directoryUri, fileName, mime
      )
      const base64 = await FileSystem.readAsStringAsync(cachedUri, {
        encoding: FileSystem.EncodingType.Base64,
      })
      await FileSystem.writeAsStringAsync(destUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      })
      Alert.alert('Thành công', `Đã lưu "${fileName}".`)
    } catch (e) {
      console.error('[SaveFile]', e)
      Alert.alert('Lỗi', 'Không thể lưu tệp.')
    } finally {
      setDownloadingFile(null)
    }
  }

  // ── Info modal ────────────────────────────────────────────────────────────

  const handleOpenInfo = async () => {
    setShowInfo(true)
    setLoadingInfo(true)
    try {
      if (isGroupConv) {
        const res = await getConversationByIdApi(id)
        const fullConv = unwrap(res)
        setGroupConv(fullConv)
        const participantIds: string[] = (fullConv?.participants || []).map(String)
        const memberDetails = await Promise.all(
          participantIds.map((pid) =>
            getUserByIdApi(pid).then((r) => unwrap(r)).catch(() => null)
          )
        )
        setGroupMembers(memberDetails.filter(Boolean))
      } else {
        if (!partnerId) return
        if (!partnerInfo) {
          const res = await getUserByIdApi(partnerId)
          setPartnerInfo(unwrap(res))
        }
      }
    } catch {
      // keep whatever partial data we have
    } finally {
      setLoadingInfo(false)
    }
  }

  const getGroupRole = (uid: string): string => {
    if (!groupConv) return 'Thành viên'
    const creatorId = String(groupConv.creatorId || groupConv.adminIds?.[0] || '')
    const adminIds: string[] = (groupConv.adminIds || []).map(String)
    if (uid === creatorId) return 'Nhóm trưởng'
    if (adminIds.includes(uid)) return 'Nhóm phó'
    return 'Thành viên'
  }

  const amGroupOwner = (): boolean => {
    if (!groupConv) return false
    const creatorId = String(groupConv.creatorId || groupConv.adminIds?.[0] || '')
    return myId === creatorId
  }

  const handleKickMember = (uid: string, memberName: string) => {
    Alert.alert('Kick thành viên', `Kick ${memberName} khỏi nhóm?`, [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Kick',
        style: 'destructive',
        onPress: async () => {
          setMemberActionLoading(uid)
          try {
            await removeGroupMemberApi(id, uid)
            setGroupMembers((prev) => prev.filter((m) => String(m.id || m._id) !== uid))
          } catch (err: any) {
            Alert.alert('Lỗi', err.response?.data?.message || 'Không thể kick thành viên.')
          } finally {
            setMemberActionLoading(null)
          }
        },
      },
    ])
  }

  const handleDeleteMessage = useCallback((msgId: string) => {
    Alert.alert('Thu hồi tin nhắn', 'Bạn có muốn thu hồi tin nhắn này?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Thu hồi',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMessageApi(msgId)
            setDeletedMsgIds(prev => new Set([...prev, msgId]))
          } catch (err: any) {
            Alert.alert('Lỗi', err.response?.data?.message || 'Không thể thu hồi tin nhắn.')
          }
        },
      },
    ])
  }, [])

  const handleToggleAdmin = async (uid: string, currentRole: string) => {
    setMemberActionLoading(uid)
    try {
      if (currentRole === 'Nhóm phó') {
        await demoteFromAdminApi(id, uid)
        setGroupConv((prev: any) => ({
          ...prev,
          adminIds: (prev?.adminIds || []).filter((aid: string) => String(aid) !== uid),
        }))
      } else {
        await promoteToAdminApi(id, uid)
        setGroupConv((prev: any) => ({
          ...prev,
          adminIds: [...(prev?.adminIds || []), uid],
        }))
      }
    } catch (err: any) {
      Alert.alert('Lỗi', err.response?.data?.message || 'Không thể thực hiện.')
    } finally {
      setMemberActionLoading(null)
    }
  }

  // ── Render message ────────────────────────────────────────────────────────

  const renderMessage = ({ item: msg, index }: { item: Message; index: number }) => {
    const isOut = String(msg.senderId) === myId
    const prevMsg = messages[index - 1]
    const showDate = !prevMsg || !isSameDay(prevMsg.createdAt, msg.createdAt)
    const showAvatar = !isOut && (
      index === messages.length - 1 ||
      messages[index + 1]?.senderId !== msg.senderId
    )
    const isDeleted = msg.deleted || deletedMsgIds.has(String(msg.id))

    return (
      <View>
        {showDate && (
          <View style={styles.dateDivider}>
            <Text style={styles.dateDividerText}>{formatDateLabel(msg.createdAt)}</Text>
          </View>
        )}
        <View style={[styles.msgWrapper, isOut && styles.msgWrapperOut]}>
          {!isOut ? (
            showAvatar
              ? <UserAvatar name={msg.senderDisplayName || '?'} size="sm" />
              : <View style={{ width: 32 }} />
          ) : null}
          <TouchableOpacity
            activeOpacity={1}
            delayLongPress={400}
            onLongPress={() => {
              if (isOut && !isDeleted && msg.id) handleDeleteMessage(String(msg.id))
            }}
            style={[
              styles.bubble,
              isOut ? styles.bubbleOut : styles.bubbleIn,
              !isDeleted && msg.messageType === 'IMAGE' && msg.media?.url ? styles.bubbleMedia : null,
            ]}
          >
            {isGroupConv && !isOut && msg.senderDisplayName && !isDeleted && (
              <Text style={styles.senderName}>{msg.senderDisplayName}</Text>
            )}
            {isDeleted ? (
              <Text style={styles.deletedText}>Tin nhắn đã bị thu hồi</Text>
            ) : msg.messageType === 'IMAGE' && msg.media?.url ? (
              <TouchableOpacity activeOpacity={0.9} onPress={() => setViewingImage(msg.media!.url!)}>
                <Image
                  source={{ uri: msg.media.url, headers: { 'ngrok-skip-browser-warning': 'true' } }}
                  style={styles.mediaImage}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ) : msg.messageType === 'FILE' && msg.media?.url ? (
              <View style={styles.fileCard}>
                <Text style={styles.fileCardIcon}>📎</Text>
                <View style={styles.fileCardInfo}>
                  <Text style={styles.fileCardName} numberOfLines={2}>
                    {msg.media.fileName || 'Tệp đính kèm'}
                  </Text>
                  {!!msg.media.fileSize && (
                    <Text style={styles.fileCardSize}>{formatFileSize(msg.media.fileSize)}</Text>
                  )}
                </View>
                {downloadingFile === msg.media.url ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <View style={styles.fileCardActions}>
                    <TouchableOpacity
                      onPress={() => handleSaveFile(msg.media!.url!, msg.media!.fileName || 'file')}
                      style={styles.fileActionBtn}
                    >
                      <Ionicons name="download-outline" size={18} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleShareFile(msg.media!.url!, msg.media!.fileName || 'file')}
                      style={styles.fileActionBtn}
                    >
                      <Ionicons name="share-outline" size={18} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.bubbleText}>{msg.content}</Text>
            )}
            <View style={styles.bubbleFooter}>
              <Text style={styles.bubbleTime}>{formatTime(msg.createdAt)}</Text>
              {isOut && !isDeleted && <Text style={styles.bubbleTick}>✓✓</Text>}
            </View>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const filteredMembers = groupMembers.filter((m) => {
    if (!groupSearch) return true
    const n = (m.displayName || m.username || '').toLowerCase()
    return n.includes(groupSearch.toLowerCase())
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCenter} onPress={handleOpenInfo} activeOpacity={0.8}>
          {isGroupConv ? (
            <View style={styles.headerGroupAvatar}>
              <Text style={styles.headerGroupAvatarText}>{name.charAt(0).toUpperCase()}</Text>
            </View>
          ) : (
            <UserAvatar name={name} size="sm" online={online} />
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
            <Text style={styles.headerStatus}>
              {isGroupConv
                ? `${convObj?.participants?.length || 0} thành viên`
                : typingVisible ? 'Đang gõ...' : online ? 'Đang hoạt động' : 'Ngoại tuyến'
              }
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={handleOpenInfo}>
          <Ionicons name="information-circle-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
              keyExtractor={(item, index) => String(item.id || index)}
              renderItem={renderMessage}
              contentContainerStyle={styles.messagesList}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            />
          )}
          {typingVisible && !isGroupConv && (
            <View style={styles.msgWrapper}>
              <UserAvatar name={name} size="sm" />
              <View style={[styles.bubble, styles.bubbleIn, styles.typingBubble]}>
                <Text style={styles.typingText}>Đang gõ...</Text>
              </View>
            </View>
          )}
        </View>

        {/* Input Area */}
        <View style={[styles.inputArea, { paddingBottom: showAttach ? 8 : (insets.bottom || 0) + 10 }]}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => { Keyboard.dismiss(); setShowEmoji(false); setShowAttach((v) => !v) }}
          >
            <Ionicons name="attach" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => { Keyboard.dismiss(); setShowAttach(false); setShowEmoji((v) => !v) }}
          >
            <Text style={styles.emojiIconText}>😊</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            placeholder="Nhập tin nhắn..."
            placeholderTextColor={Colors.textSecondary}
            value={text}
            onChangeText={handleTextChange}
            onFocus={() => { setShowEmoji(false); setShowAttach(false) }}
            multiline
            maxLength={2000}
          />
          {uploading ? (
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginHorizontal: 8 }} />
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!text.trim()}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Attachment menu */}
        {showAttach && (
          <View style={[styles.attachMenu, { paddingBottom: (insets.bottom || 0) + 14 }]}>
            <TouchableOpacity style={styles.attachItem} onPress={handlePickImage}>
              <View style={[styles.attachIcon, { backgroundColor: '#6c5ce7' }]}>
                <Ionicons name="image-outline" size={24} color="#fff" />
              </View>
              <Text style={styles.attachLabel}>Ảnh</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachItem} onPress={handlePickFile}>
              <View style={[styles.attachIcon, { backgroundColor: '#0984e3' }]}>
                <Ionicons name="document-outline" size={24} color="#fff" />
              </View>
              <Text style={styles.attachLabel}>Tệp</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Image Viewer */}
      <Modal
        visible={!!viewingImage}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingImage(null)}
      >
        <View style={styles.imgViewerOverlay}>
          <TouchableOpacity style={styles.imgViewerClose} onPress={() => setViewingImage(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {viewingImage && (
            <Image
              source={{ uri: viewingImage, headers: { 'ngrok-skip-browser-warning': 'true' } }}
              style={styles.imgViewerFull}
              resizeMode="contain"
            />
          )}
          <View style={styles.imgViewerActions}>
            <TouchableOpacity
              style={styles.imgViewerBtn}
              onPress={() => viewingImage && handleSaveImage(viewingImage)}
              disabled={savingImage}
            >
              {savingImage
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="download-outline" size={22} color="#fff" />
              }
              <Text style={styles.imgViewerBtnText}>Lưu ảnh</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Emoji Picker */}
      <Modal
        visible={showEmoji}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmoji(false)}
      >
        <TouchableOpacity style={styles.emojiOverlay} activeOpacity={1} onPress={() => setShowEmoji(false)}>
          <View style={styles.emojiPicker}>
            <View style={styles.emojiGrid}>
              {EMOJIS.map((em) => (
                <TouchableOpacity key={em} style={styles.emojiBtn} onPress={() => handleEmojiPress(em)}>
                  <Text style={styles.emojiText}>{em}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Info Modal */}
      <Modal
        visible={showInfo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInfo(false)}
      >
        <View style={styles.infoOverlay}>
          <View style={styles.infoSheet}>
            <View style={styles.infoHandle} />

            {loadingInfo ? (
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: 40 }} />
            ) : isGroupConv ? (
              // ── Group Info ──────────────────────────────────────────────
              <>
                <View style={styles.infoAvatarRow}>
                  <View style={styles.groupInfoAvatar}>
                    <Text style={styles.groupInfoAvatarText}>{name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.infoName}>{name}</Text>
                  <Text style={styles.infoOnline}>{groupMembers.length} thành viên</Text>
                </View>

                <View style={styles.groupSearchBar}>
                  <Ionicons name="search-outline" size={16} color={Colors.textSecondary} />
                  <TextInput
                    style={styles.groupSearchInput}
                    placeholder="Tìm thành viên..."
                    placeholderTextColor={Colors.textSecondary}
                    value={groupSearch}
                    onChangeText={setGroupSearch}
                  />
                </View>

                <ScrollView style={styles.memberList} showsVerticalScrollIndicator={false}>
                  {filteredMembers.map((m) => {
                    const uid = String(m.id || m._id)
                    const mName = m.displayName || m.username || 'Unknown'
                    const role = getGroupRole(uid)
                    const isActing = memberActionLoading === uid
                    const isSelf = uid === myId
                    const canManage = amGroupOwner() && !isSelf && role !== 'Nhóm trưởng'

                    return (
                      <View key={uid} style={styles.memberItem}>
                        <UserAvatar name={mName} size="sm" />
                        <View style={styles.memberInfo}>
                          <Text style={styles.memberName}>
                            {mName}{isSelf ? ' (Bạn)' : ''}
                          </Text>
                          <Text style={[
                            styles.memberRole,
                            role === 'Nhóm trưởng' && styles.roleOwner,
                            role === 'Nhóm phó' && styles.roleVice,
                          ]}>
                            {role}
                          </Text>
                        </View>
                        {canManage && (
                          isActing ? (
                            <ActivityIndicator size="small" color={Colors.primary} />
                          ) : (
                            <View style={styles.memberActions}>
                              <TouchableOpacity
                                style={styles.memberActionBtn}
                                onPress={() => handleToggleAdmin(uid, role)}
                              >
                                <Text style={styles.memberActionBtnText}>
                                  {role === 'Nhóm phó' ? 'Hạ chức' : 'Bầu NP'}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.memberActionBtn, styles.memberKickBtn]}
                                onPress={() => handleKickMember(uid, mName)}
                              >
                                <Text style={[styles.memberActionBtnText, styles.memberKickText]}>Kick</Text>
                              </TouchableOpacity>
                            </View>
                          )
                        )}
                      </View>
                    )
                  })}
                  {filteredMembers.length === 0 && (
                    <Text style={styles.infoEmpty}>Không tìm thấy thành viên</Text>
                  )}
                </ScrollView>
              </>
            ) : (
              // ── Direct User Info ──────────────────────────────────────────
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.infoAvatarRow}>
                  <UserAvatar name={partnerInfo?.displayName || name} size="lg" online={online} />
                  <Text style={styles.infoName}>{partnerInfo?.displayName || name}</Text>
                  <Text style={styles.infoOnline}>
                    {online ? '🟢 Đang hoạt động' : '⚪ Ngoại tuyến'}
                  </Text>
                </View>
                <View style={styles.infoSection}>
                  {partnerInfo?.username && (
                    <View style={styles.infoRow}>
                      <Ionicons name="at" size={18} color={Colors.textSecondary} />
                      <View style={styles.infoRowText}>
                        <Text style={styles.infoRowLabel}>Tên người dùng</Text>
                        <Text style={styles.infoRowValue}>{partnerInfo.username}</Text>
                      </View>
                    </View>
                  )}
                  {partnerInfo?.email && (
                    <View style={styles.infoRow}>
                      <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} />
                      <View style={styles.infoRowText}>
                        <Text style={styles.infoRowLabel}>Email</Text>
                        <Text style={styles.infoRowValue}>{partnerInfo.email}</Text>
                      </View>
                    </View>
                  )}
                  {partnerInfo?.bio && (
                    <View style={styles.infoRow}>
                      <Ionicons name="person-outline" size={18} color={Colors.textSecondary} />
                      <View style={styles.infoRowText}>
                        <Text style={styles.infoRowLabel}>Giới thiệu</Text>
                        <Text style={styles.infoRowValue}>{partnerInfo.bio}</Text>
                      </View>
                    </View>
                  )}
                  {!partnerInfo && (
                    <Text style={styles.infoEmpty}>Không thể tải thông tin</Text>
                  )}
                </View>
              </ScrollView>
            )}

            <TouchableOpacity style={styles.infoCloseBtn} onPress={() => setShowInfo(false)}>
              <Text style={styles.infoCloseBtnText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  headerBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', marginHorizontal: 4 },
  headerInfo: { flex: 1, marginLeft: 10 },
  headerName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  headerStatus: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  headerGroupAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerGroupAvatarText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  // ── Messages ─────────────────────────────────────────────────────────────
  messagesArea: { flex: 1, backgroundColor: Colors.background },
  messagesList: { padding: 10, paddingBottom: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dateDivider: { alignItems: 'center', marginVertical: 10 },
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
    elevation: 1,
  },
  bubbleOut: { backgroundColor: Colors.bubbleOut, borderBottomRightRadius: 4 },
  senderName: { fontSize: 12, color: Colors.primary, fontWeight: '600', marginBottom: 3 },
  bubbleText: { fontSize: 15, color: Colors.text, lineHeight: 20 },
  bubbleMedia: { padding: 4 },
  mediaImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 2,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 8,
    padding: 10,
    gap: 8,
    minWidth: 160,
    maxWidth: 220,
  },
  fileCardIcon: { fontSize: 24 },
  fileCardInfo: { flex: 1 },
  fileCardName: { fontSize: 13, color: Colors.text, fontWeight: '500' },
  fileCardSize: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  fileCardActions: { flexDirection: 'row', gap: 4 },
  fileActionBtn: { padding: 4 },

  // ── Image Viewer ────────────────────────────────────────────────────────────
  imgViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imgViewerClose: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 10,
    padding: 8,
  },
  imgViewerFull: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.75,
  },
  imgViewerActions: {
    position: 'absolute',
    bottom: 48,
    flexDirection: 'row',
    gap: 24,
  },
  imgViewerBtn: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  imgViewerBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  deletedText: { fontSize: 14, color: Colors.textSecondary, fontStyle: 'italic' },
  bubbleFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 3 },
  bubbleTime: { fontSize: 11, color: Colors.textSecondary },
  bubbleTick: { fontSize: 11, color: Colors.primary, marginLeft: 4 },
  typingBubble: { paddingVertical: 10 },
  typingText: { color: Colors.textSecondary, fontSize: 14, fontStyle: 'italic' },

  // ── Input ─────────────────────────────────────────────────────────────────
  inputArea: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  iconBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiIconText: { fontSize: 22, lineHeight: 26 },
  textInput: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 7,
    fontSize: 15,
    color: Colors.text,
    maxHeight: 100,
    marginHorizontal: 4,
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

  // ── Attach menu ───────────────────────────────────────────────────────────
  attachMenu: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 24,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  attachItem: { alignItems: 'center', gap: 6 },
  attachIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },

  // ── Emoji ─────────────────────────────────────────────────────────────────
  emojiOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  emojiPicker: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 12,
  },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around' },
  emojiBtn: { padding: 8 },
  emojiText: { fontSize: 26 },

  // ── Info Sheet ────────────────────────────────────────────────────────────
  infoOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  infoSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    maxHeight: '80%',
  },
  infoHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  infoAvatarRow: { alignItems: 'center', marginBottom: 16 },
  infoName: { fontSize: 20, fontWeight: 'bold', color: Colors.text, marginTop: 12, marginBottom: 4 },
  infoOnline: { fontSize: 13, color: Colors.textSecondary },
  infoSection: { gap: 4 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  infoRowText: { flex: 1 },
  infoRowLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 2 },
  infoRowValue: { fontSize: 15, color: Colors.text },
  infoEmpty: { color: Colors.textSecondary, textAlign: 'center', paddingVertical: 20 },
  infoCloseBtn: {
    marginTop: 16,
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  infoCloseBtnText: { color: Colors.text, fontSize: 15, fontWeight: '600' },

  // ── Group Info ────────────────────────────────────────────────────────────
  groupInfoAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupInfoAvatarText: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  groupSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 10,
    gap: 6,
  },
  groupSearchInput: { flex: 1, fontSize: 14, color: Colors.text },
  memberList: { maxHeight: 300 },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  memberInfo: { flex: 1, marginLeft: 10 },
  memberName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  memberRole: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  roleOwner: { color: Colors.primary, fontWeight: '600' },
  roleVice: { color: Colors.primaryLight },
  memberActions: { flexDirection: 'row', gap: 6 },
  memberActionBtn: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  memberActionBtnText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  memberKickBtn: { borderColor: Colors.danger },
  memberKickText: { color: Colors.danger },
})
