import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '@/constants/api';

const COLORS = {
  indigo: '#3B4B8C',
  ink: '#1E2233',
  slate: '#6E7484',
  slateLight: '#A8ACB8',
  border: '#E7E9F0',
  bg: '#F7F8FB',
  sage: '#3D9970',
  sageBg: '#E3F4EB',
  ochre: '#C08A2E',
  ochreBg: '#FCF0DC',
  peri: '#E8EBF9',
};

type Enquiry = {
  id: number;
  item: string;
  quantity: string;
};

type Vendor = {
  id: number;
  name: string;
};

type StoredUser = {
  id: number;
  name: string;
  role: string;
};

export default function HomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('user').then((value) => {
      if (!value) {
        router.replace('/login');
      } else {
        setUser(JSON.parse(value));
      }
      setCheckingAuth(false);
    });
  }, []);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      const params = `?user_id=${user.id}&role=${user.role}`;
      const [vendorsRes, enquiriesRes] = await Promise.all([
        fetch(`${API_URL}/vendors${params}`),
        fetch(`${API_URL}/enquiries`),
      ]);
      const vendorsData = await vendorsRes.json();
      const enquiriesData = await enquiriesRes.json();
      setVendors(vendorsData);
      setEnquiries(enquiriesData);
    } catch (e) {
      setError('Could not reach the server. Check your WiFi connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (user) loadData();
    }, [loadData, user])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (checkingAuth || (loading && user)) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.indigo} />
      </View>
    );
  }

  if (!user) {
    return <View style={styles.screen} />;
  }

  const initials = user.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>Good morning, {user.name.split(' ')[0]}</Text>
          <Text style={styles.title}>Ken-Connect</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.actionCard}
        activeOpacity={0.85}
        onPress={() => router.push('/enquiry-chat')}
      >
        <Text style={styles.actionTitle}>Raise a new enquiry</Text>
        <Text style={styles.actionSubtitle}>Type it in your own words — I&apos;ll handle the rest</Text>
        <View style={styles.plusButton}>
          <Text style={styles.plusText}>+</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.statsRow}>
        <View style={styles.bigStat}>
          <Text style={styles.statLabel}>OPEN ENQUIRIES</Text>
          <Text style={styles.statBig}>{enquiries.length}</Text>
          <Text style={styles.statNote}>{vendors.length} vendors registered</Text>
        </View>
        <View style={styles.smallStatsCol}>
          <View style={[styles.smallStat, { backgroundColor: COLORS.peri }]}>
            <Text style={[styles.smallStatLabel, { color: COLORS.indigo }]}>VENDORS</Text>
            <Text style={styles.smallStatValue}>{vendors.length}</Text>
          </View>
          <View style={[styles.smallStat, { backgroundColor: COLORS.sageBg }]}>
            <Text style={[styles.smallStatLabel, { color: COLORS.sage }]}>ENQUIRIES</Text>
            <Text style={styles.smallStatValue}>{enquiries.length}</Text>
          </View>
        </View>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Recent enquiries</Text>
      </View>

      {enquiries.length === 0 ? (
        <Text style={styles.emptyText}>No enquiries yet. Raise your first one above.</Text>
      ) : (
        enquiries.slice().reverse().slice(0, 5).map((item) => (
          <View key={item.id} style={styles.listItem}>
            <View style={[styles.accentBar, { backgroundColor: COLORS.indigo }]} />
            <View style={styles.listItemContent}>
              <Text style={styles.listItemTitle}>{item.item}</Text>
              <Text style={styles.listItemSub}>{item.quantity}</Text>
            </View>
            <Text style={[styles.listItemStatus, { color: COLORS.indigo }]}>#{item.id}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greeting: { fontSize: 13, color: COLORS.slate },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.ink, marginTop: 2 },
  avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  errorBox: { backgroundColor: COLORS.ochreBg, borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { color: COLORS.ochre, fontSize: 13 },
  actionCard: { backgroundColor: COLORS.indigo, borderRadius: 20, padding: 20, marginBottom: 16, overflow: 'hidden' },
  actionTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  actionSubtitle: { color: '#CED4EB', fontSize: 12, marginTop: 6, maxWidth: '80%' },
  plusButton: { position: 'absolute', right: 20, bottom: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  plusText: { color: COLORS.indigo, fontSize: 18, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  bigStat: { flex: 1.4, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16, justifyContent: 'space-between' },
  statLabel: { fontSize: 11, fontWeight: '700', color: COLORS.slate },
  statBig: { fontSize: 30, fontWeight: '700', color: COLORS.ink, marginTop: 8 },
  statNote: { fontSize: 12, color: COLORS.slate, marginTop: 8 },
  smallStatsCol: { flex: 1, gap: 12 },
  smallStat: { flex: 1, borderRadius: 18, padding: 14, justifyContent: 'center' },
  smallStatLabel: { fontSize: 10, fontWeight: '700' },
  smallStatValue: { fontSize: 20, fontWeight: '700', color: COLORS.ink, marginTop: 6 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.ink },
  emptyText: { fontSize: 13, color: COLORS.slateLight, textAlign: 'center', marginTop: 20 },
  listItem: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10, overflow: 'hidden', alignItems: 'center' },
  accentBar: { width: 5, alignSelf: 'stretch' },
  listItemContent: { flex: 1, paddingVertical: 12, paddingHorizontal: 14 },
  listItemTitle: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  listItemSub: { fontSize: 12, color: COLORS.slate, marginTop: 3 },
  listItemStatus: { fontSize: 12, fontWeight: '700', paddingRight: 14 },
});