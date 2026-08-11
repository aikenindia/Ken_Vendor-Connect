import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '@/constants/colors';

type StoredUser = {
  id: number;
  name: string;
  role: string;
};

const ROLE_LABELS: Record<string, string> = {
  purchase_user: 'Purchase Team',
  head: 'Department Head',
  vp: 'VP',
  owner: 'Owner',
};

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('user').then((value) => {
        if (value) {
          setUser(JSON.parse(value));
        }
        setLoading(false);
      });
    }, [])
  );

  const logout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('user');
          router.replace('/login');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.indigo} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.emptyText}>Not signed in.</Text>
        <TouchableOpacity style={styles.loginRedirectButton} onPress={() => router.replace('/login')}>
          <Text style={styles.loginRedirectText}>Go to login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const initials = user.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const isManagement = user.role === 'head' || user.role === 'vp' || user.role === 'owner';

  return (
    <View style={styles.screen}>
      <View style={styles.headerCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.role}>{ROLE_LABELS[user.role] || user.role}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Trial mode</Text>
        </View>
      </View>

      {isManagement && (
        <>
          <Text style={styles.sectionTitle}>ADMIN</Text>
          <TouchableOpacity style={styles.infoCard} onPress={() => router.push('/manage-users')}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.infoLabel}>Team & access</Text>
                <Text style={styles.infoValue}>Add or view team members</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
        </>
      )}

      <Text style={styles.sectionTitle}>ACCOUNT</Text>
      <TouchableOpacity style={styles.infoCard} onPress={() => router.push('/change-password')}>
        <View style={styles.rowBetween}>
          <Text style={styles.infoLabel}>Change password</Text>
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>SYSTEM</Text>
      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>App</Text>
        <Text style={styles.infoValue}>Ken-Connect v1.0.0</Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg, padding: 20, paddingTop: 60 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: COLORS.slate, marginBottom: 16 },
  loginRedirectButton: { backgroundColor: COLORS.indigo, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  loginRedirectText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  headerCard: { backgroundColor: COLORS.indigo, borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 24 },
  avatar: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontSize: 22, fontWeight: '700', color: COLORS.indigo },
  name: { fontSize: 18, fontWeight: '700', color: '#fff' },
  role: { fontSize: 12, color: '#CED4EB', marginTop: 2 },
  badge: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5, marginTop: 10 },
  badgeText: { fontSize: 11, fontWeight: '700', color: COLORS.indigo },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: COLORS.slateLight, marginBottom: 10, marginTop: 6 },
  infoCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 10 },
  infoLabel: { fontSize: 11, color: COLORS.slate },
  infoValue: { fontSize: 13, fontWeight: '700', color: COLORS.ink, marginTop: 3 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chevron: { fontSize: 20, color: COLORS.slateLight },
  logoutButton: { borderRadius: 14, borderWidth: 1, borderColor: '#E8B4B4', paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  logoutText: { color: '#C0392B', fontWeight: '700', fontSize: 14 },
});