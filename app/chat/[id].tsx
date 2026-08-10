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
import UserAvatar from '../../components/common/UserAvatar'
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
  reactToMessageApi,
} from '../../lib/api'

// Danh sách emoji nhanh trong emoji picker
const EMOJIS = [
  '😀', '😂', '😍', '🥰', '😎', '😭', '😡', '🥳',
  '👍', '👎', '❤️', '🔥', '✅', '🎉', '🙏', '💯',
  '😊', '🤔', '😴', '🤩', '😏', '🙄', '😬', '🤗',
  '👋', '🤝', '💪', '🫶', '🎊', '🌟', '💫', '⭐',
]

/**
 * Kiểm tra xem chuỗi có phải chỉ chứa từ 1-3 ký tự emoji không.
 */
function isOnlyEmoji(str?: string) {
  if (!str) return false
  const trimmed = str.replace(/\s+/g, '')
  if (trimmed.length === 0) return false
  const emojiRegex = /^[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}\u{1FA70}-\u{1FAFF}\u{2B50}\u{1F3FB}-\u{1F3FF}]+$/u
  if (!emojiRegex.test(trimmed)) return false
  return [...trimmed].length <= 3
}

/**
 * Trả về icon cho file.
 */
function getFileIcon(ext: string) {
  const map: Record<string, { icon: string, color: string }> = {
    pdf: { icon: '📄', color: '#e74c3c' },
    doc: { icon: '📝', color: '#3498db' },
    docx: { icon: '📝', color: '#3498db' },
    xls: { icon: '📊', color: '#2ecc71' },
    xlsx: { icon: '📊', color: '#2ecc71' },
    zip: { icon: '🗜️', color: '#f1c40f' },
    rar: { icon: '🗜️', color: '#f1c40f' }
  }
  return map[ext.toLowerCase()] || { icon: '📎', color: Colors.textSecondary }
}

/**
 * Format giờ:phút cho timestamp tin nhắn (VD: "14:30")
 */
function formatTime(dateStr?: string) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Format nhãn phân cách ngày giữa các tin nhắn:
 * - Hôm nay: "Hôm nay"
 * - Hôm qua: "Hôm qua"
 * - Lâu hơn: "dd/MM/yyyy"
 */
function formatDateLabel(dateStr?: string) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
  if (diffDays === 0) return 'Hôm nay'
  if (diffDays === 1) return 'Hôm qua'
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Format kích thước file thành chuỗi dễ đọc:
 * - < 1KB: "N B"
 * - < 1MB: "N.N KB"
 * - >= 1MB: "N.N MB"
 */
function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Kiểm tra hai timestamp có cùng ngày không.
 * Dùng để quyết định có hiển thị nhãn phân cách ngày trước tin nhắn không.
 */
function isSameDay(a?: string, b?: string) {
  if (!a || !b) return false
  const da = new Date(a), db = new Date(b)
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
}

/**
 * Màn hình Chat — giao diện nhắn tin chính.
 *
 * Route params (từ expo-router dynamic route /chat/[id]):
 * - id:          ID của conversation
 * - partnerName: Tên hiển thị (đối với 1-1: tên người kia, nhóm: tên nhóm)
 * - partnerId:   ID người kia (chỉ có với chat 1-1, dùng để kiểm tra online)
 *
 * Tính năng:
 * - Tin nhắn text, ảnh, file
 * - Real-time qua WebSocket (STOMP)
 * - Typing indicator
 * - Thu hồi tin nhắn (long press)
 * - Xem ảnh toàn màn hình, lưu ảnh về máy
 * - Tải/chia sẻ file
 * - Emoji picker
 * - Modal thông tin: xem profile (1-1) hoặc quản lý thành viên (nhóm)
 */
export default function ChatScreen() {
  // Lấy params từ route động /chat/[id]
  const { id, partnerName, partnerId } = useLocalSearchParams<{
    id: string; partnerName: string; partnerId: string
  }>()
  const insets = useSafeAreaInsets() // Safe area padding cho iPhone notch/home indicator
  const router = useRouter()
  const { user } = useAuth()
  const { conversations, messages, loadingMsgs, receiveMessage, openConversation, getUserDisplayName } = useChat()
  const { subscribeConversation, sendTyping, sendRead, isOnline } = useSocket()

  // --- State UI ---
  const [text, setText] = useState('')               // Nội dung đang gõ trong input
  const [showEmoji, setShowEmoji] = useState(false)  // Hiện/ẩn emoji picker
  const [showAttach, setShowAttach] = useState(false) // Hiện/ẩn menu đính kèm
  const [typingVisible, setTypingVisible] = useState(false) // Hiện "Đang gõ..." indicator
  const [uploading, setUploading] = useState(false)  // Đang upload file/ảnh

  // --- Image preview (chờ gửi) ---
  const [pendingImage, setPendingImage] = useState<{ uri: string, fileName: string, mimeType: string } | null>(null)

  // --- Image viewer ---
  const [viewingImage, setViewingImage] = useState<string | null>(null) // URL ảnh đang xem
  const [savingImage, setSavingImage] = useState(false)                 // Đang lưu ảnh về máy

  // --- File download ---
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null) // URL file đang download

  // --- Modal thông tin (profile 1-1 hoặc thành viên nhóm) ---
  const [showInfo, setShowInfo] = useState(false)
  const [loadingInfo, setLoadingInfo] = useState(false)

  // Thông tin chi tiết cho chat 1-1
  const [partnerInfo, setPartnerInfo] = useState<any>(null)

  // Thông tin chi tiết cho nhóm
  const [groupConv, setGroupConv] = useState<any>(null)         // Dữ liệu nhóm đầy đủ từ API
  const [groupMembers, setGroupMembers] = useState<any[]>([])   // Danh sách thành viên với info đầy đủ
  const [groupSearch, setGroupSearch] = useState('')            // Tìm kiếm thành viên trong modal
  const [memberActionLoading, setMemberActionLoading] = useState<string | null>(null) // ID thành viên đang xử lý

  // Set ID tin nhắn đã bị thu hồi (local state để update UI ngay, không cần refetch)
  const [deletedMsgIds, setDeletedMsgIds] = useState<Set<string>>(new Set())

  // --- Message Action Menu (Reply, React, Delete) ---
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)

  // --- Reply ---
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)

  // Ref đến FlatList để scroll xuống cuối
  const flatListRef = useRef<FlatList>(null)

  // Ref cho typing debounce: delay gửi sự kiện typing để giảm số lần gửi WebSocket
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ref để tự động ẩn typing indicator sau 3 giây không có sự kiện mới
  const typingHideRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const name = partnerName || 'Unknown'
  const online = partnerId ? isOnline(partnerId) : false
  const myId = String(user?.id || user?._id || '')

  // Tìm conversation object từ danh sách đã tải để lấy thêm metadata (type, participants)
  const convObj = conversations.find((c) => String(c.id || c._id) === id)
  const isGroupConv = convObj?.type === 'GROUP'

  /**
   * Khi vào màn hình, tìm và set conversation đang active trong ChatContext.
   * ChatContext sẽ tải tin nhắn của conversation này.
   */
  useEffect(() => {
    if (!id) return
    const conv = conversations.find((c) => String(c.id || c._id) === id)
    if (conv) openConversation(conv)
  }, [id])

  /**
   * Subscribe WebSocket cho conversation này để nhận tin nhắn real-time.
   *
   * Lý do re-subscribe khi receiveMessage thay đổi:
   * openConversation() tạo closure mới của receiveMessage, nếu không re-subscribe
   * sẽ bị "stale closure" — vẫn dùng hàm cũ và không cập nhật đúng state.
   *
   * Xử lý 2 loại notification:
   * - NEW_MESSAGE: thêm tin nhắn mới + gửi read receipt
   * - TYPING: hiện "Đang gõ..." và tự ẩn sau 3 giây
   */
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
        // Gửi read receipt để server đánh dấu đã đọc và reset unreadCount
        sendRead(id)
      } else if (n.type === 'TYPING' && n.data?.senderId !== myId) {
        // Chỉ hiện typing indicator khi người khác gõ (không phải mình)
        setTypingVisible(true)
        // Reset timer ẩn typing: nếu tiếp tục nhận event TYPING thì không ẩn
        if (typingHideRef.current) clearTimeout(typingHideRef.current)
        typingHideRef.current = setTimeout(() => setTypingVisible(false), 3000)
      }
    })
    return () => {
      unsubscribe()
      if (typingHideRef.current) clearTimeout(typingHideRef.current)
    }
  }, [id, myId, receiveMessage])

  /**
   * Tự động scroll xuống cuối khi có tin nhắn mới.
   * Dùng setTimeout 100ms để đợi FlatList render xong trước khi scroll.
   * Chỉ trigger khi số lượng tin nhắn thay đổi (dependency: messages.length).
   */
  useEffect(() => {
    if (messages.length > 0)
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
  }, [messages.length])

  /**
   * Gửi tin nhắn text qua REST API.
   *
   * Lý do dùng REST thay vì WebSocket để gửi:
   * Gửi qua REST đảm bảo tin nhắn xuất hiện ngay trong UI (receiveMessage)
   * mà không phụ thuộc vào WebSocket echo từ server (có thể bị delay hoặc mất).
   *
   * Flow: gửi → nhận response → gọi receiveMessage để thêm vào state.
   * Nếu lỗi: khôi phục lại text vào input.
   */
  const handleSend = useCallback(async () => {
    if (!text.trim() && !pendingImage) return
    const content = text.trim()
    const imgToSend = pendingImage

    setText('') 
    setPendingImage(null) // Xóa preview ngay lập tức
    setShowEmoji(false)
    setShowAttach(false)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    try {
      if (imgToSend) {
        // Nếu có ảnh pending -> gọi uploadAndSend (pass thêm caption)
        await uploadAndSend(imgToSend.uri, imgToSend.fileName, imgToSend.mimeType, 'IMAGE', content)
      } else if (id) {
        const res = await sendMessageRestApi(id, { messageType: 'TEXT', content, replyToMessageId: replyingTo?.id })
        const msg = unwrap(res)
        if (msg) receiveMessage({ ...msg, conversationId: msg.conversationId || id })
      }
      setReplyingTo(null)
    } catch (err: any) {
      Alert.alert('Lỗi', 'Không thể gửi tin nhắn.')
      setText(content) // Khôi phục text
      setPendingImage(imgToSend) // Khôi phục ảnh
    }
  }, [text, id, pendingImage, receiveMessage])

  /**
   * Xử lý khi người dùng gõ vào input:
   * - Cập nhật state text
   * - Gửi sự kiện TYPING qua WebSocket (debounce ngầm bằng cách không gửi liên tục)
   */
  const handleTextChange = (val: string) => {
    setText(val)
    if (!id) return
    sendTyping(id)
    // Clear timeout cũ để debounce (không dùng thực sự vì chỉ setTimeout rỗng)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => { }, 2000)
  }

  /**
   * Chèn emoji vào vị trí cuối của text và đóng emoji picker.
   */
  const handleEmojiPress = (emoji: string) => {
    setText((prev) => prev + emoji)
    setShowEmoji(false)
  }

  // ── Upload file/ảnh ──────────────────────────────────────────────────────────

  /**
   * Upload file lên server và gửi tin nhắn chứa media.
   *
   * Flow:
   * 1. Upload file lên /api/files/upload → nhận URL
   * 2. Gửi tin nhắn với messageType IMAGE/FILE và media object chứa URL
   * 3. Nhận response và thêm vào state qua receiveMessage
   *
   * @param uri         URI local của file (từ ImagePicker hoặc DocumentPicker)
   * @param fileName    Tên file hiển thị
   * @param mimeType    MIME type để server xử lý đúng
   * @param messageType 'IMAGE' hoặc 'FILE'
   */
  const uploadAndSend = async (
    uri: string,
    fileName: string,
    mimeType: string,
    messageType: 'IMAGE' | 'FILE',
    caption: string = ''
  ) => {
    if (!id) return
    setUploading(true)
    try {
      // Tạo FormData để upload multipart
      const formData = new FormData()
      formData.append('file', { uri, name: fileName, type: mimeType } as any)
      const uploadRes = await uploadFileApi(formData)
      const uploaded = unwrap(uploadRes)
      // Gửi tin nhắn với thông tin media từ server
      const res = await sendMessageRestApi(id, {
        messageType,
        content: caption || fileName, // content = tên file hoặc caption
        replyToMessageId: replyingTo?.id,
        media: {
          url: uploaded?.url || uploaded?.fileUrl,
          fileName: uploaded?.fileName || fileName,
          fileSize: uploaded?.fileSize,
          mimeType: uploaded?.mimeType || mimeType,
        },
      })
      const msg = unwrap(res)
      if (msg) receiveMessage({ ...msg, conversationId: msg.conversationId || id })
      setReplyingTo(null)
    } catch (err: any) {
      Alert.alert('Lỗi', err.response?.data?.message || 'Không thể gửi file.')
    } finally {
      setUploading(false)
    }
  }

  /**
   * Mở thư viện ảnh để chọn ảnh gửi.
   * Yêu cầu quyền truy cập thư viện ảnh trước.
   * Quality 0.85: nén nhẹ để giảm kích thước upload mà vẫn giữ chất lượng.
   */
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
    setPendingImage({
      uri: asset.uri,
      fileName: asset.fileName || `image_${Date.now()}.jpg`,
      mimeType: asset.mimeType || 'image/jpeg'
    })
  }

  /**
   * Mở document picker để chọn file bất kỳ.
   * copyToCacheDirectory: copy file vào cache để đọc được URI (cần thiết trên Android).
   */
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

  // ── Lưu ảnh về máy ──────────────────────────────────────────────────────────

  /**
   * Lưu ảnh từ URL về thư viện ảnh của thiết bị.
   * Flow: xin quyền → download về cache → saveToLibrary
   * Header ngrok-skip-browser-warning: bypass ngrok warning page khi dev
   */
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

  /**
   * Map phần mở rộng file → MIME type.
   * Cần thiết khi share file để system biết mở bằng app nào.
   * Fallback: 'application/octet-stream' cho các loại file không rõ.
   */
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

  /**
   * Download file từ URL về thư mục cache của app.
   * Trả về URI local để dùng với Sharing hoặc StorageAccessFramework.
   */
  const downloadToCache = async (url: string, fileName: string): Promise<string> => {
    const cacheUri = `${FileSystem.cacheDirectory}dl_${Date.now()}_${fileName}`
    const { uri } = await FileSystem.downloadAsync(url, cacheUri, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    })
    return uri
  }

  /**
   * Chia sẻ file qua native share sheet (Sharing.shareAsync).
   * Người dùng chọn app để mở/share (email, Drive, Zalo, v.v.).
   */
  const handleShareFile = async (url: string, fileName: string) => {
    setDownloadingFile(url)
    try {
      const ext = fileName.includes('.') ? fileName.split('.').pop()! : 'bin'
      const cachedUri = await downloadToCache(url, fileName)
      await Sharing.shareAsync(cachedUri, {
        mimeType: getMimeType(ext),
        dialogTitle: `Chia sẻ "${fileName}"`,
        UTI: ext, // Universal Type Identifier cho iOS
      })
    } catch (e) {
      console.error('[ShareFile]', e)
      Alert.alert('Lỗi', 'Không thể chia sẻ tệp.')
    } finally {
      setDownloadingFile(null)
    }
  }

  /**
   * Lưu file vào thư mục do người dùng chọn (Android SAF - Storage Access Framework).
   * Flow:
   * 1. Download về cache
   * 2. Mở dialog chọn thư mục đích (SAF)
   * 3. Đọc file cache dưới dạng Base64
   * 4. Ghi vào thư mục đích bằng SAF
   *
   * Lý do dùng SAF: Android 10+ không cho phép ghi trực tiếp vào Downloads nếu không có SAF.
   */
  const handleSaveFile = async (url: string, fileName: string) => {
    setDownloadingFile(url)
    try {
      const ext = fileName.includes('.') ? fileName.split('.').pop()! : 'bin'
      const cachedUri = await downloadToCache(url, fileName)
      // Yêu cầu người dùng chọn thư mục lưu
      const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()
      if (!perm.granted) return
      const mime = getMimeType(ext)
      // Tạo file mới trong thư mục được chọn
      const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
        perm.directoryUri, fileName, mime
      )
      // Đọc cache file và ghi vào thư mục đích
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

  // ── Modal thông tin ──────────────────────────────────────────────────────────

  /**
   * Mở modal thông tin và tải dữ liệu:
   * - Nhóm: tải thông tin nhóm đầy đủ + thông tin từng thành viên (song song)
   * - 1-1: tải thông tin user đối diện (chỉ tải 1 lần, cache trong partnerInfo)
   */
  const handleOpenInfo = async () => {
    setShowInfo(true)
    setLoadingInfo(true)
    try {
      if (isGroupConv) {
        const res = await getConversationByIdApi(id)
        const fullConv = unwrap(res)
        setGroupConv(fullConv)
        const participantIds: string[] = (fullConv?.participants || []).map(String)
        // Tải song song thông tin tất cả thành viên
        const memberDetails = await Promise.all(
          participantIds.map((pid) =>
            getUserByIdApi(pid).then((r) => unwrap(r)).catch(() => null)
          )
        )
        setGroupMembers(memberDetails.filter(Boolean)) // Lọc bỏ null (user bị xóa)
      } else {
        if (!partnerId) return
        // Cache: chỉ gọi API nếu chưa tải trước đó
        if (!partnerInfo) {
          const res = await getUserByIdApi(partnerId)
          setPartnerInfo(unwrap(res))
        }
      }
    } catch {
      // Giữ nguyên dữ liệu partial nếu có lỗi
    } finally {
      setLoadingInfo(false)
    }
  }

  /**
   * Xác định vai trò của một thành viên trong nhóm:
   * - 'Nhóm trưởng': creatorId hoặc adminIds[0] (người tạo nhóm)
   * - 'Nhóm phó':    có trong adminIds (được bầu bởi nhóm trưởng)
   * - 'Thành viên':  tất cả còn lại
   */
  const getGroupRole = (uid: string): string => {
    if (!groupConv) return 'Thành viên'
    const creatorId = String(groupConv.creatorId || groupConv.adminIds?.[0] || '')
    const adminIds: string[] = (groupConv.adminIds || []).map(String)
    if (uid === creatorId) return 'Nhóm trưởng'
    if (adminIds.includes(uid)) return 'Nhóm phó'
    return 'Thành viên'
  }

  /**
   * Kiểm tra xem mình có phải nhóm trưởng không.
   * Chỉ nhóm trưởng mới có thể kick/bầu admin cho thành viên khác.
   */
  const amGroupOwner = (): boolean => {
    if (!groupConv) return false
    const creatorId = String(groupConv.creatorId || groupConv.adminIds?.[0] || '')
    return myId === creatorId
  }

  /**
   * Kick thành viên khỏi nhóm (chỉ nhóm trưởng).
   * Confirm dialog trước, sau đó gọi API và xóa khỏi state local.
   */
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

  /**
   * Thu hồi tin nhắn của mình (long press).
   * Gọi API xóa, sau đó thêm msgId vào deletedMsgIds để render "Tin nhắn đã bị thu hồi".
   * Dùng local Set thay vì re-fetch để update UI ngay lập tức.
   */
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

  /**
   * Thả cảm xúc cho tin nhắn
   */
  const handleReact = async (emoji: string) => {
    if (!selectedMessage?.id) return
    try {
      await reactToMessageApi(selectedMessage.id, emoji)
    } catch (err) {
      console.error(err)
    } finally {
      setSelectedMessage(null)
    }
  }

  /**
   * Trả lời tin nhắn
   */
  const handleReply = () => {
    setReplyingTo(selectedMessage)
    setSelectedMessage(null)
  }

  /**
   * Toggle vai trò admin cho thành viên (chỉ nhóm trưởng):
   * - Nếu đang là Nhóm phó → hạ chức xuống Thành viên (demote)
   * - Nếu là Thành viên → bầu lên Nhóm phó (promote)
   * Cập nhật groupConv.adminIds local để UI phản hồi ngay.
   */
  const handleToggleAdmin = async (uid: string, currentRole: string) => {
    setMemberActionLoading(uid)
    try {
      if (currentRole === 'Nhóm phó') {
        await demoteFromAdminApi(id, uid)
        // Xóa khỏi adminIds
        setGroupConv((prev: any) => ({
          ...prev,
          adminIds: (prev?.adminIds || []).filter((aid: string) => String(aid) !== uid),
        }))
      } else {
        await promoteToAdminApi(id, uid)
        // Thêm vào adminIds
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

  // ── Render một tin nhắn ──────────────────────────────────────────────────────

  /**
   * Render một bubble tin nhắn.
   *
   * Logic hiển thị:
   * - showDate:   Hiện nhãn ngày nếu tin nhắn này khác ngày với tin trước
   * - showAvatar: Chỉ hiện avatar của người gửi (không phải mình) ở tin nhắn cuối
   *               của một chuỗi liên tiếp từ cùng người (gộp nhóm)
   * - isDeleted:  Kiểm tra từ msg.deleted (server) VÀ deletedMsgIds (local optimistic)
   *
   * Long press: thu hồi tin nhắn của mình (chỉ khi chưa bị thu hồi)
   *
   * 3 loại nội dung:
   * - Đã thu hồi: text italic "Tin nhắn đã bị thu hồi"
   * - IMAGE:      ảnh có thể nhấn để xem fullscreen
   * - FILE:       card file với nút download và share
   * - TEXT:       text thường
   */
  const renderMessage = ({ item: msg, index }: { item: Message; index: number }) => {
    const isOut = String(msg.senderId) === myId       // Tin nhắn do mình gửi
    const prevMsg = messages[index - 1]
    const showDate = !prevMsg || !isSameDay(prevMsg.createdAt, msg.createdAt) // Khác ngày với tin trước
    // Hiện avatar ở tin nhắn cuối cùng của một chuỗi từ cùng người gửi
    const showAvatar = !isOut && (
      index === messages.length - 1 ||
      messages[index + 1]?.senderId !== msg.senderId
    )
    // Tin nhắn bị thu hồi: từ server hoặc từ local state
    const isDeleted = msg.deleted || deletedMsgIds.has(String(msg.id))
    const isOnlyEmo = !isDeleted && msg.messageType === 'TEXT' && isOnlyEmoji(msg.content)

    return (
      <View>
        {/* Nhãn phân cách ngày */}
        {showDate && (
          <View style={styles.dateDivider}>
            <Text style={styles.dateDividerText}>{formatDateLabel(msg.createdAt)}</Text>
          </View>
        )}
        <View style={[styles.msgWrapper, isOut && styles.msgWrapperOut]}>
          {/* Avatar bên trái cho tin nhắn của người khác */}
          {!isOut ? (
            showAvatar
              ? <UserAvatar name={msg.senderDisplayName || '?'} size="sm" />
              : <View style={{ width: 32 }} /> // Placeholder để giữ alignment khi không có avatar
          ) : null}
          <TouchableOpacity
            activeOpacity={1}
            delayLongPress={300}
            // Mở Action Menu thay vì hỏi xóa ngay
            onLongPress={() => {
              if (!isDeleted && msg.id) {
                Keyboard.dismiss()
                setSelectedMessage(msg)
              }
            }}
            style={[
              styles.bubble,
              isOut ? styles.bubbleOut : styles.bubbleIn,
              !isDeleted && msg.messageType === 'IMAGE' && msg.media?.url ? styles.bubbleMedia : null,
              isOnlyEmo ? styles.bubbleBigEmoji : null,
            ]}
          >
            {/* Tên người gửi trong nhóm (chỉ hiện cho tin nhắn của người khác, không phải tin thu hồi) */}
            {isGroupConv && !isOut && msg.senderDisplayName && !isDeleted && !isOnlyEmo && (
              <Text style={styles.senderName}>{msg.senderDisplayName}</Text>
            )}

            {/* Quote block (nếu có reply) */}
            {!isDeleted && msg.replyToMessageId && (
              <View style={[styles.quoteBox, isOut ? styles.quoteBoxOut : styles.quoteBoxIn]}>
                <Text style={styles.quoteText} numberOfLines={2}>
                  {messages.find(m => String(m.id) === msg.replyToMessageId)?.content || 'Đã trả lời một tin nhắn'}
                </Text>
              </View>
            )}

            {isDeleted ? (
              // Tin nhắn đã thu hồi
              <Text style={styles.deletedText}>Tin nhắn đã bị thu hồi</Text>
            ) : msg.messageType === 'IMAGE' && msg.media?.url ? (
              // Tin nhắn ảnh: nhấn để xem fullscreen
              <View>
                <TouchableOpacity activeOpacity={0.9} onPress={() => setViewingImage(msg.media!.url!)}>
                  <Image
                    source={{ uri: msg.media.url, headers: { 'ngrok-skip-browser-warning': 'true' } }}
                    style={styles.mediaImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
                {/* Caption của ảnh (nếu khác tên file) */}
                {msg.content && msg.content !== msg.media.fileName && (
                  <Text style={[styles.bubbleText, { marginTop: 6, marginHorizontal: 4 }]}>{msg.content}</Text>
                )}
              </View>
            ) : msg.messageType === 'FILE' && msg.media?.url ? (
              // Tin nhắn file: card với nút download và share
              <View style={styles.fileCard}>
                <Text style={styles.fileCardIcon}>
                  {getFileIcon(msg.media.fileName?.split('.').pop() || '').icon}
                </Text>
                <View style={styles.fileCardInfo}>
                  <Text style={styles.fileCardName} numberOfLines={2}>
                    {msg.media.fileName || 'Tệp đính kèm'}
                  </Text>
                  {!!msg.media.fileSize && (
                    <Text style={styles.fileCardSize}>{formatFileSize(msg.media.fileSize)}</Text>
                  )}
                </View>
                {downloadingFile === msg.media.url ? (
                  // Đang download file này → hiện spinner thay cho nút
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <View style={styles.fileCardActions}>
                    {/* Nút download: lưu vào bộ nhớ thiết bị */}
                    <TouchableOpacity
                      onPress={() => handleSaveFile(msg.media!.url!, msg.media!.fileName || 'file')}
                      style={styles.fileActionBtn}
                    >
                      <Ionicons name="download-outline" size={18} color={Colors.primary} />
                    </TouchableOpacity>
                    {/* Nút share: mở native share sheet */}
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
              // Tin nhắn text thường hoặc Big Emoji
              <Text style={isOnlyEmo ? styles.bigEmojiText : styles.bubbleText}>{msg.content}</Text>
            )}

            {/* Footer: giờ gửi + tick đã gửi */}
            <View style={[styles.bubbleFooter, isOnlyEmo && { display: 'none' }]}>
              <Text style={styles.bubbleTime}>{formatTime(msg.createdAt)}</Text>
              {isOut && !isDeleted && <Text style={styles.bubbleTick}>✓✓</Text>}
            </View>
          </TouchableOpacity>

          {/* Dải reactions */}
          {!isDeleted && msg.reactions && Object.keys(msg.reactions).length > 0 && (
            <View style={[styles.reactionsBadge, isOut ? styles.reactionsBadgeOut : styles.reactionsBadgeIn]}>
              {Array.from(new Set(Object.values(msg.reactions))).map((emoji, idx) => (
                <Text key={idx} style={styles.reactionEmoji}>{emoji}</Text>
              ))}
              {Object.keys(msg.reactions).length > 1 && (
                <Text style={styles.reactionCount}>{Object.keys(msg.reactions).length}</Text>
              )}
            </View>
          )}

        </View>

        {/* Read Receipts (Chỉ hiện cho tin nhắn cuối cùng) */}
        {index === messages.length - 1 && isOut && msg.readBy && Object.keys(msg.readBy).some(uid => uid !== myId) && (
          <View style={styles.readReceiptsRow}>
            {Object.keys(msg.readBy).filter(uid => uid !== myId).map(uid => (
              <View key={uid} style={styles.readReceiptAvatar}>
                <UserAvatar name={getUserDisplayName(uid)} size="xs" />
              </View>
            ))}
          </View>
        )}

      </View>
    )
  }

  // Filter thành viên theo từ khóa tìm kiếm trong modal nhóm
  const filteredMembers = groupMembers.filter((m) => {
    if (!groupSearch) return true
    const n = (m.displayName || m.username || '').toLowerCase()
    return n.includes(groupSearch.toLowerCase())
  })

  // ── Render chính ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header: nút back + avatar + tên + trạng thái + nút info */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        {/* Phần giữa header: nhấn để mở modal thông tin */}
        <TouchableOpacity style={styles.headerCenter} onPress={handleOpenInfo} activeOpacity={0.8}>
          {/* Avatar nhóm: chữ cái đầu, avatar 1-1: UserAvatar với dot online */}
          {isGroupConv ? (
            <View style={styles.headerGroupAvatar}>
              <Text style={styles.headerGroupAvatarText}>{name.charAt(0).toUpperCase()}</Text>
            </View>
          ) : (
            <UserAvatar name={name} size="sm" online={online} />
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
            {/* Trạng thái: nhóm hiện số thành viên, 1-1 hiện typing/online/offline */}
            <Text style={styles.headerStatus}>
              {isGroupConv
                ? `${convObj?.participants?.length || 0} thành viên`
                : typingVisible ? 'Đang gõ...' : online ? 'Đang hoạt động' : 'Ngoại tuyến'
              }
            </Text>
          </View>
        </TouchableOpacity>
        {/* Nút info ở góc phải header */}
        <TouchableOpacity style={styles.headerBtn} onPress={handleOpenInfo}>
          <Ionicons name="information-circle-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/*
        KeyboardAvoidingView: đẩy input area lên trên bàn phím.
        iOS: 'padding' hoạt động tốt.
        Android: undefined vì Android tự xử lý với windowSoftInputMode.
      */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Vùng hiển thị tin nhắn */}
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
              // Scroll xuống cuối khi content thay đổi kích thước (ảnh load xong)
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            />
          )}
          {/* Typing indicator: chỉ hiện trong chat 1-1, không hiện trong nhóm */}
          {typingVisible && !isGroupConv && (
            <View style={styles.msgWrapper}>
              <UserAvatar name={name} size="sm" />
              <View style={[styles.bubble, styles.bubbleIn, styles.typingBubble]}>
                <Text style={styles.typingText}>Đang gõ...</Text>
              </View>
            </View>
          )}
        </View>

        {/* Xem trước trả lời */}
        {replyingTo && (
          <View style={styles.previewArea}>
            <View style={styles.replyPreviewContainer}>
              <View style={styles.replyPreviewLine} />
              <View style={{ flex: 1 }}>
                <Text style={styles.replyPreviewName}>Đang trả lời {replyingTo.senderDisplayName || 'ai đó'}</Text>
                <Text style={styles.replyPreviewContent} numberOfLines={1}>{replyingTo.content || 'Đính kèm'}</Text>
              </View>
              <TouchableOpacity style={{ padding: 4 }} onPress={() => setReplyingTo(null)}>
                <Ionicons name="close-circle" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Xem trước ảnh (nếu có) */}
        {pendingImage && (
          <View style={styles.previewArea}>
            <View style={styles.previewImageContainer}>
              <Image source={{ uri: pendingImage.uri }} style={styles.previewImage} />
              <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setPendingImage(null)}>
                <Ionicons name="close-circle" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Input area: attach + emoji + text input + send */}
        <View style={[styles.inputArea, { paddingBottom: showAttach ? 8 : (insets.bottom || 0) + 10 }]}>
          {/* Nút đính kèm: toggle menu attach, đóng emoji */}
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => { Keyboard.dismiss(); setShowEmoji(false); setShowAttach((v) => !v) }}
          >
            <Ionicons name="attach" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          {/* Nút emoji: toggle emoji picker, đóng attach menu */}
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => { Keyboard.dismiss(); setShowAttach(false); setShowEmoji((v) => !v) }}
          >
            <Text style={styles.emojiIconText}>😊</Text>
          </TouchableOpacity>
          {/* Text input: đóng cả emoji và attach khi focus */}
          <TextInput
            style={styles.textInput}
            placeholder={pendingImage ? "Thêm chú thích..." : "Nhập tin nhắn..."}
            placeholderTextColor={Colors.textSecondary}
            value={text}
            onChangeText={handleTextChange}
            onFocus={() => { setShowEmoji(false); setShowAttach(false) }}
            multiline
            maxLength={2000}
          />
          {/* Spinner khi upload, nút send khi có text hoặc có ảnh */}
          {uploading ? (
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginHorizontal: 8 }} />
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, (!text.trim() && !pendingImage) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!text.trim() && !pendingImage} // Disable khi chưa có nội dung và không có ảnh
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Menu đính kèm: ảnh / tệp */}
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

      {/* Modal xem ảnh fullscreen */}
      <Modal
        visible={!!viewingImage}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingImage(null)}
      >
        <View style={styles.imgViewerOverlay}>
          {/* Nút đóng tuyệt đối góc trên phải */}
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
          {/* Nút lưu ảnh ở dưới cùng */}
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

      {/* Modal emoji picker (slide up từ dưới) */}
      <Modal
        visible={showEmoji}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmoji(false)}
      >
        {/* Nhấn vùng tối phía trên để đóng */}
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

      {/* Modal Action Menu (Reactions, Reply, Delete) */}
      <Modal
        visible={!!selectedMessage}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMessage(null)}
      >
        <TouchableOpacity style={styles.actionOverlay} activeOpacity={1} onPress={() => setSelectedMessage(null)}>
          <View style={styles.actionMenu}>
            {/* Reactions Row */}
            <View style={styles.reactionRowMenu}>
              {['❤️', '😆', '😯', '😢', '😡', '👍'].map(emoji => (
                <TouchableOpacity key={emoji} onPress={() => handleReact(emoji)}>
                  <Text style={styles.reactionMenuItem}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Actions */}
            <View style={styles.actionList}>
              <TouchableOpacity style={styles.actionItem} onPress={handleReply}>
                <Ionicons name="arrow-undo-outline" size={20} color={Colors.text} />
                <Text style={styles.actionItemText}>Trả lời</Text>
              </TouchableOpacity>
              
              {selectedMessage && String(selectedMessage.senderId) === myId && (
                <TouchableOpacity style={styles.actionItem} onPress={() => {
                  const id = selectedMessage.id;
                  setSelectedMessage(null);
                  if (id) handleDeleteMessage(String(id));
                }}>
                  <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                  <Text style={[styles.actionItemText, { color: Colors.danger }]}>Thu hồi tin nhắn</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal thông tin (slide up từ dưới — bottom sheet style) */}
      <Modal
        visible={showInfo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInfo(false)}
      >
        <View style={styles.infoOverlay}>
          <View style={styles.infoSheet}>
            {/* Handle bar decorative */}
            <View style={styles.infoHandle} />

            {loadingInfo ? (
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: 40 }} />
            ) : isGroupConv ? (
              // ── Thông tin nhóm ──────────────────────────────────────────────
              <>
                {/* Header nhóm: avatar chữ cái + tên + số thành viên */}
                <View style={styles.infoAvatarRow}>
                  <View style={styles.groupInfoAvatar}>
                    <Text style={styles.groupInfoAvatarText}>{name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.infoName}>{name}</Text>
                  <Text style={styles.infoOnline}>{groupMembers.length} thành viên</Text>
                </View>

                {/* Ô tìm kiếm thành viên */}
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

                {/* Danh sách thành viên với role và action (chỉ nhóm trưởng) */}
                <ScrollView style={styles.memberList} showsVerticalScrollIndicator={false}>
                  {filteredMembers.map((m) => {
                    const uid = String(m.id || m._id)
                    const mName = m.displayName || m.username || 'Unknown'
                    const role = getGroupRole(uid)
                    const isActing = memberActionLoading === uid
                    const isSelf = uid === myId
                    // Chỉ nhóm trưởng có thể quản lý, không quản lý được chính mình hoặc nhóm trưởng khác
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
                            role === 'Nhóm trưởng' && styles.roleOwner, // Màu primary
                            role === 'Nhóm phó' && styles.roleVice,     // Màu primaryLight
                          ]}>
                            {role}
                          </Text>
                        </View>
                        {/* Nút quản lý: chỉ hiện khi canManage */}
                        {canManage && (
                          isActing ? (
                            <ActivityIndicator size="small" color={Colors.primary} />
                          ) : (
                            <View style={styles.memberActions}>
                              {/* Toggle bầu/hạ Nhóm phó */}
                              <TouchableOpacity
                                style={styles.memberActionBtn}
                                onPress={() => handleToggleAdmin(uid, role)}
                              >
                                <Text style={styles.memberActionBtnText}>
                                  {role === 'Nhóm phó' ? 'Hạ chức' : 'Bầu NP'}
                                </Text>
                              </TouchableOpacity>
                              {/* Nút kick thành viên */}
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
              // ── Thông tin người dùng (chat 1-1) ──────────────────────────────
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

            {/* Nút đóng modal */}
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

  // ── Header ──────────────────────────────────────────────────────────────────
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
  // Avatar nhóm trong header (nhỏ hơn avatar trong modal info)
  headerGroupAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerGroupAvatarText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  // ── Vùng tin nhắn ────────────────────────────────────────────────────────────
  messagesArea: { flex: 1, backgroundColor: Colors.background },
  messagesList: { padding: 10, paddingBottom: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Nhãn phân cách ngày giữa các tin nhắn
  dateDivider: { alignItems: 'center', marginVertical: 10 },
  dateDividerText: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    color: '#fff',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },

  // Container của mỗi tin nhắn (avatar + bubble)
  msgWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 4,
    paddingHorizontal: 6,
  },
  msgWrapperOut: { flexDirection: 'row-reverse' }, // Tin nhắn mình gửi: reverse để bubble bên phải

  // Bubble tin nhắn
  bubble: {
    maxWidth: '75%',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginHorizontal: 6,
  },
  bubbleIn: {
    backgroundColor: Colors.bubbleIn, // Màu nền bubble tin nhắn nhận
    borderBottomLeftRadius: 4,        // Góc nhọn bên trái dưới (gần avatar)
    elevation: 1,
  },
  bubbleOut: { backgroundColor: Colors.bubbleOut, borderBottomRightRadius: 4 }, // Góc nhọn bên phải dưới
  senderName: { fontSize: 12, color: Colors.primary, fontWeight: '600', marginBottom: 3 },
  bubbleText: { fontSize: 15, color: Colors.text, lineHeight: 20 },
  bubbleMedia: { padding: 4 }, // Padding nhỏ hơn cho bubble ảnh
  bubbleBigEmoji: { backgroundColor: 'transparent', elevation: 0, paddingHorizontal: 0, paddingVertical: 0 },
  bigEmojiText: { fontSize: 50 },

  // Quote
  quoteBox: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderLeftWidth: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
  },
  quoteBoxIn: { borderLeftColor: Colors.primary },
  quoteBoxOut: { borderLeftColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.15)' },
  quoteText: { fontSize: 13, color: Colors.textSecondary },

  // Reactions
  reactionsBadge: {
    position: 'absolute',
    bottom: -10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1, elevation: 2,
  },
  reactionsBadgeIn: { left: 16 },
  reactionsBadgeOut: { right: 16 },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { fontSize: 11, color: Colors.primary, marginLeft: 2, fontWeight: 'bold' },

  // Read Receipts
  readReceiptsRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingRight: 8, marginTop: 12 },
  readReceiptAvatar: { marginLeft: 2 },

  // Ảnh trong tin nhắn
  mediaImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 2,
  },

  // Card file trong tin nhắn
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

  // ── Image Viewer fullscreen ──────────────────────────────────────────────────
  imgViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)', // Gần đen để tập trung vào ảnh
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

  // Tin nhắn đã bị thu hồi
  deletedText: { fontSize: 14, color: Colors.textSecondary, fontStyle: 'italic' },

  // Footer của bubble: giờ + tick
  bubbleFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 3 },
  bubbleTime: { fontSize: 11, color: Colors.textSecondary },
  bubbleTick: { fontSize: 11, color: Colors.primary, marginLeft: 4 }, // ✓✓ màu primary

  // Typing indicator bubble
  typingBubble: { paddingVertical: 10 },
  typingText: { color: Colors.textSecondary, fontSize: 14, fontStyle: 'italic' },

  // ── Action Menu ──────────────────────────────────────────────────────────────
  actionOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  actionMenu: { backgroundColor: '#fff', borderRadius: 16, width: 250, padding: 12, elevation: 5 },
  reactionRowMenu: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 8 },
  reactionMenuItem: { fontSize: 28 },
  actionList: { gap: 4 },
  actionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  actionItemText: { fontSize: 15, color: Colors.text, fontWeight: '500' },

  // Preview Reply
  replyPreviewContainer: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8 },
  replyPreviewLine: { width: 3, height: '100%', backgroundColor: Colors.primary, borderRadius: 2, marginRight: 8 },
  replyPreviewName: { fontSize: 13, fontWeight: 'bold', color: Colors.primary, marginBottom: 2 },
  replyPreviewContent: { fontSize: 13, color: Colors.textSecondary },

  // ── Input area ────────────────────────────────────────────────────────────────
  previewArea: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  previewImageContainer: {
    position: 'relative',
    width: 80,
    height: 80,
  },
  previewImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  previewCloseBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
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
    maxHeight: 100, // Giới hạn chiều cao khi multiline (cuộn trong input)
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
  sendBtnDisabled: { backgroundColor: Colors.border }, // Xám khi chưa có text

  // ── Attach menu ──────────────────────────────────────────────────────────────
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

  // ── Emoji picker ─────────────────────────────────────────────────────────────
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

  // ── Info Sheet (bottom sheet) ─────────────────────────────────────────────────
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
  // Thanh kéo decorative ở đầu bottom sheet
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

  // ── Group Info specifics ──────────────────────────────────────────────────────
  // Avatar nhóm lớn trong modal info (khác headerGroupAvatar ở kích thước)
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
  memberList: { maxHeight: 300 }, // Giới hạn để bottom sheet không quá cao
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
  roleOwner: { color: Colors.primary, fontWeight: '600' },    // Nhóm trưởng: primary
  roleVice: { color: Colors.primaryLight },                   // Nhóm phó: primaryLight
  memberActions: { flexDirection: 'row', gap: 6 },
  memberActionBtn: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  memberActionBtnText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  memberKickBtn: { borderColor: Colors.danger }, // Nút kick: viền đỏ
  memberKickText: { color: Colors.danger },
})
