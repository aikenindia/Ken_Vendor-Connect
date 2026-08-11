import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { API_URL } from '@/constants/api';
import { COLORS } from '@/constants/colors';

type InboxItem = {
  vendor_id: number;
  name: string;
  last_message: string | null;
  last_sender: string | null;
  last_time: string | null;
  unread_count: number;
};

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export default function VendorsScreen() {
  const router = useRouter();
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/vendors/inbox`);
      const data = await res.json();
      setInbox(data);
    } catch (e) {
      // silent fail, keep old data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const confirmDelete = (vendorId: number, name: string) => {
    Alert.alert(
      'Delete vendor',
      `Remove ${name} and all their conversation history? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteVendor(vendorId),
        },
      ]
    );
  };

  const deleteVendor = async (vendorId: number) => {
    try {
      const res = await fetch(`${API_URL}/vendors/${vendorId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) {
        Alert.alert('Error', data.error);
        return;
      }
      setInbox((prev) => prev.filter((v) => v.vendor_id !== vendorId));
    } catch (e) {
      Alert.alert('Error', 'Could not delete vendor. Check your connection.');
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.indigo} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Vendors</Text>
          <TouchableOpacity style={styles.addButton} onPress={() => router.push('/add-vendor')}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={inbox}
        keyExtractor={(item) => String(item.vendor_id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No vendors yet. Tap + Add to create one.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push(`/vendor-chat/${item.vendor_id}`)}
            onLongPress={() => confirmDelete(item.vendor_id, item.name)}
            delayLongPress={350}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(item.name)}</Text>
            </View>
            <View style={styles.rowContent}>
              <View style={styles.rowTop}>
                <Text style={styles.vendorName}>{item.name}</Text>
                <Text style={styles.time}>{timeAgo(item.last_time)}</Text>
              </View>
              <View style={styles.rowBottom}>
                <Text style={styles.lastMsg} numberOfLines={1}>
                  {item.last_message || 'No messages yet'}
                </Text>
                {item.unread_count > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{item.unread_count}</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: COLORS.ink },
  addButton: { backgroundColor: COLORS.indigo, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  emptyText: { textAlign: 'center', color: COLORS.slateLight, marginTop: 40, fontSize: 13 },
  row: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1,
    borderColor: COLORS.border, padding: 14, marginBottom: 10, alignItems: 'center',
  },
  avatar: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: COLORS.peri,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarText: { color: COLORS.indigo, fontWeight: '700', fontSize: 14 },
  rowContent: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  vendorName: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  time: { fontSize: 11, color: COLORS.slateLight },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lastMsg: { fontSize: 13, color: COLORS.slate, flex: 1, marginRight: 8 },
  unreadBadge: {
    backgroundColor: COLORS.indigo, borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
}); 