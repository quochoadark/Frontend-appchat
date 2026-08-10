import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '../../constants/theme'

// Bảng màu nền avatar — được chọn ngẫu nhiên dựa trên chữ cái đầu tên
const COLORS = [
  '#e17055', '#0984e3', '#6c5ce7', '#00b894', '#fd79a8',
  '#fdcb6e', '#e84393', '#00cec9', '#a29bfe', '#55efc4',
]

/**
 * Tính màu nền avatar từ tên người dùng.
 * Dùng charCode của ký tự đầu tiên để chọn màu từ bảng COLORS.
 * Cùng một tên → luôn ra cùng một màu (deterministic).
 */
function getColor(name = '') {
  const code = name.charCodeAt(0) || 0
  return COLORS[code % COLORS.length]
}

// Kích thước avatar theo prop size
const SIZES = { xs: 16, sm: 40, md: 48, lg: 64 }

interface Props {
  name?: string           // Tên người dùng — dùng để lấy chữ cái đầu và tính màu
  size?: 'xs' | 'sm' | 'md' | 'lg'
  online?: boolean        // Hiện dot xanh góc dưới phải nếu true
}

/**
 * Component Avatar hình tròn với chữ cái đầu tên.
 *
 * Cấu trúc:
 * - View ngoài: giữ vị trí và kích thước để dot online có thể dùng absolute
 * - View hình tròn màu nền: chứa chữ cái đầu
 * - Dot xanh (tuỳ chọn): hình tròn nhỏ, absolute ở góc dưới phải, viền trắng
 *
 * Kích thước dot = 28% kích thước avatar (tỉ lệ cố định)
 * Font chữ cái đầu = 42% kích thước avatar
 */
export default function UserAvatar({ name = '?', size = 'sm', online = false }: Props) {
  const dim = SIZES[size]              // Kích thước pixel của avatar
  const bg = getColor(name)            // Màu nền dựa trên tên
  const initial = name.charAt(0).toUpperCase() // Chữ cái đầu viết hoa
  const dotSize = Math.floor(dim * 0.28)       // Kích thước dot online

  return (
    // View ngoài không có màu nền, chỉ để giữ kích thước cho positioning
    <View style={{ width: dim, height: dim }}>
      {/* Hình tròn màu nền với chữ cái đầu */}
      <View
        style={[
          styles.avatar,
          { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: bg },
        ]}
      >
        <Text style={[styles.initial, { fontSize: dim * 0.42 }]}>{initial}</Text>
      </View>

      {/* Dot online: chỉ render khi online=true */}
      {online && (
        <View
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2, // Hình tròn
            },
          ]}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // Hình tròn chứa chữ cái
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Chữ cái đầu màu trắng, bold
  initial: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  // Dot online: absolute góc dưới phải, viền trắng để tách biệt với avatar
  dot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.online,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
})
