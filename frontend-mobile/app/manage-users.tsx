import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, Alert, KeyboardAvoidingView, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '@/constants/api';
import { COLORS } from '@/constants/colors';

type StoredUser = { id: number; name: string; role: string };
type TeamUser = { id: number; name: string; role: string };

const ROLE_OPTIONS = [
  { value: 'purchase_user', label: 'Purchase Team' },
  { value: 'head', label: 'Department Head' },
  { value: 'vp', label: 'VP' },
  { value: 'owner', label: 'Owner' },
];

const ROLE_LABELS: Record<string, string> = {
  purchase_user: 'Purchase Team',
  head: 'Department Head',
  vp: 'VP',
  owner: 'Owner',
};

export default function ManageUsersScreen() {
  const router = useRouter();
  const [me, setMe] = useState<StoredUser | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('purchase_user');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const stored = await AsyncStorage.getItem('user');
    if (!stored) return;
    const parsed = JSON.parse(stored);
    setMe(parsed);
    try {
      const res = await fetch(`${API_URL}/users`);
      const data = await res.json();
      setUsers(data);
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const addUser = async () => {
    if (!name.trim() || !username.trim() || !password.trim()) {
      Alert.alert('Missing info', 'Fill in name, username, and password.');
      return;
    }
    if (!me) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim(),
          password: password.trim(),
          role,
          requester_role: me.role,
        }),
      });
      const data = await res.json();
      if (data.error) {
        Alert.alert('Not allowed', data.error);
        return;
      }
      setName('');
      setUsername('');
      setPassword('');
      setRole('purchase_user');
      load();
    } catch (e) {
      Alert.alert('Error', 'Could not create user.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.indigo} />
      </View>
    );
  }

  const isManagement = me && ['head', 'vp', 'owner'].includes(me.role);

  if (!isManagement) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.deniedText}>You don't have access to this screen.</Text>
        <TouchableOpacity style={styles.backButtonAlt} onPress={() => router.back()}>
          <Text style={styles.backButtonAltText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Team & Access</Text>
          <View style={{ width: 32 }} />
        </View>
      </SafeAreaView>

      <FlatList
        data={users}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.form}>
            <Text style={styles.formTitle}>Add team member</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={COLORS.slate} />
            <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="Username" placeholderTextColor={COLORS.slate} autoCapitalize="none" />
            <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Temporary password" placeholderTextColor={COLORS.slate} secureTextEntry />

            <Text style={styles.label}>Role</Text>
            <View style={styles.roleRow}>
              {ROLE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.roleChip, role === opt.value && styles.roleChipSelected]}
                  onPress={() => setRole(opt.value)}
                >
                  <Text style={[styles.roleChipText, role === opt.value && styles.roleChipTextSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.addButton} onPress={addUser} disabled={saving}>
              <Text style={styles.addButtonText}>{saving ? 'Adding...' : 'Add team member'}</Text>
            </TouchableOpacity>

            <Text style={styles.sectionLabel}>EXISTING TEAM</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.userRow}>
            <Text style={styles.userName}>{item.name}</Text>
            <Text style={styles.userRole}>{ROLE_LABELS[item.role] || item.role}</Text>
          </View>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  deniedText: { fontSize: 14, color: COLORS.slate, marginBottom: 16 },
  backButtonAlt: { backgroundColor: COLORS.indigo, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  backButtonAltText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  headerSafeArea: { backgroundColor: COLORS.indigo },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 12, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: COLORS.indigo,
  },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 26, color: '#fff' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  listContent: { padding: 20 },
  form: { marginBottom: 10 },
  formTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink, marginBottom: 12 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.ink, marginBottom: 10,
  },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.slate, marginBottom: 8, marginTop: 4 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
  roleChipSelected: { backgroundColor: COLORS.indigo, borderColor: COLORS.indigo },
  roleChipText: { fontSize: 12, fontWeight: '600', color: COLORS.slate },
  roleChipTextSelected: { color: '#fff' },
  addButton: { backgroundColor: COLORS.indigo, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.slateLight, marginTop: 24, marginBottom: 4 },
  userRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    padding: 14, marginBottom: 8,
  },
  userName: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  userRole: { fontSize: 12, color: COLORS.slate },
});