import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

function Avatar({ name, size = 80 }: { name: string; size?: number }) {
  const initials = (name || '?').slice(0, 2).toUpperCase();
  const palette = ['#0a7ea4', '#e74c3c', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c'];
  const bg = palette[name.charCodeAt(0) % palette.length];
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.35 }]}>{initials}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoIcon}>{icon}</Text>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  const name = user?.displayName || user?.username || 'Người dùng';

  function confirmLogout() {
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc muốn đăng xuất không?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đăng xuất',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Không tìm thấy thông tin người dùng</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar & Name */}
      <View style={styles.heroCard}>
        <Avatar name={name} size={90} />
        <Text style={styles.heroName}>{name}</Text>
        {user.email ? <Text style={styles.heroEmail}>{user.email}</Text> : null}
        <View style={[styles.statusBadge, user.isOnline ? styles.statusOnline : styles.statusOffline]}>
          <View style={[styles.statusDot, user.isOnline ? styles.dotOnline : styles.dotOffline]} />
          <Text style={styles.statusText}>{user.isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}</Text>
        </View>
      </View>

      {/* Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Thông tin cá nhân</Text>
        <InfoRow icon="👤" label="Tên hiển thị" value={user.displayName} />
        <InfoRow icon="🔖" label="Tên đăng nhập" value={user.username} />
        <InfoRow icon="📧" label="Email" value={user.email} />
        <InfoRow icon="📝" label="Giới thiệu" value={user.bio} />
        {user.createdAt && (
          <InfoRow
            icon="📅"
            label="Ngày tham gia"
            value={new Date(user.createdAt).toLocaleDateString('vi', {
              day: '2-digit', month: '2-digit', year: 'numeric',
            })}
          />
        )}
      </View>

      {/* Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tài khoản</Text>
        <Pressable
          style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
          onPress={confirmLogout}
        >
          <Text style={styles.actionIcon}>🚪</Text>
          <Text style={styles.actionText}>Đăng xuất</Text>
          <Text style={styles.actionArrow}>›</Text>
        </Pressable>
      </View>

      <Text style={styles.version}>ChatApp v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 14 },

  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: { justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  heroName: { fontSize: 22, fontWeight: '700', color: '#1a1a2e', marginTop: 4 },
  heroEmail: { fontSize: 13, color: '#888' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
    marginTop: 4,
  },
  statusOnline: { backgroundColor: '#e8f8f0' },
  statusOffline: { backgroundColor: '#f0f0f0' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  dotOnline: { backgroundColor: '#2ecc71' },
  dotOffline: { backgroundColor: '#bbb' },
  statusText: { fontSize: 12, fontWeight: '500', color: '#555' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 4,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0a7ea4',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 10,
  },
  infoIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 11, color: '#aaa', marginBottom: 2 },
  infoValue: { fontSize: 14, color: '#333', fontWeight: '500' },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  actionRowPressed: { opacity: 0.6 },
  actionIcon: { fontSize: 20 },
  actionText: { flex: 1, fontSize: 15, color: '#e74c3c', fontWeight: '500' },
  actionArrow: { fontSize: 20, color: '#ccc' },

  version: { textAlign: 'center', fontSize: 12, color: '#bbb', marginTop: 8 },
});
