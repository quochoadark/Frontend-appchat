import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '../constants/theme'

const COLORS = [
  '#e17055', '#0984e3', '#6c5ce7', '#00b894', '#fd79a8',
  '#fdcb6e', '#e84393', '#00cec9', '#a29bfe', '#55efc4',
]

function getColor(name = '') {
  const code = name.charCodeAt(0) || 0
  return COLORS[code % COLORS.length]
}

const SIZES = { sm: 40, md: 48, lg: 64 }

interface Props {
  name?: string
  size?: 'sm' | 'md' | 'lg'
  online?: boolean
}

export default function UserAvatar({ name = '?', size = 'sm', online = false }: Props) {
  const dim = SIZES[size]
  const bg = getColor(name)
  const initial = name.charAt(0).toUpperCase()
  const dotSize = Math.floor(dim * 0.28)

  return (
    <View style={{ width: dim, height: dim }}>
      <View
        style={[
          styles.avatar,
          { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: bg },
        ]}
      >
        <Text style={[styles.initial, { fontSize: dim * 0.42 }]}>{initial}</Text>
      </View>
      {online && (
        <View
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
            },
          ]}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  dot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.online,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
})
