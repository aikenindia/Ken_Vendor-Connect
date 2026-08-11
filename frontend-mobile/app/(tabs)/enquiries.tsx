import { useCallback, useState } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { API_URL } from '@/constants/api';
import { COLORS } from '@/constants/colors';

type Enquiry = {
  id: number;
  item: string;
  spec: string | null;
  quantity: string;
  delivery_date: string | null;
};

export default function EnquiriesScreen() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/enquiries`);
      const data = await res.json();
      setEnquiries(data.slice().reverse());
    } catch (e) {
      // silent
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
        <Text style={styles.headerTitle}>Enquiries</Text>
      </View>
      <FlatList
        data={enquiries}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No enquiries raised yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.idTag}>#{item.id}</Text>
              <TextInput
                style={styles.title}
                value={item.item}
                editable={false}
                multiline
              />
            </View>
            {item.spec && (
              <TextInput
                style={styles.sub}
                value={item.spec}
                editable={false}
                multiline
              />
            )}
            <View style={styles.metaRow}>
              <TextInput
                style={styles.meta}
                value={`Qty: ${item.quantity}`}
                editable={false}
              />
              {item.delivery_date && (
                <TextInput
                  style={styles.meta}
                  value={`Delivery: ${item.delivery_date}`}
                  editable={false}
                />
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: COLORS.ink },
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  emptyText: { textAlign: 'center', color: COLORS.slateLight, marginTop: 40, fontSize: 13 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    padding: 14, marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  idTag: { fontSize: 11, color: COLORS.slateLight, marginRight: 8, fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.ink, padding: 0, margin: 0 },
  sub: { fontSize: 12, color: COLORS.slate, marginBottom: 6, padding: 0 },
  metaRow: { flexDirection: 'row', gap: 14 },
  meta: { fontSize: 11, color: COLORS.slateLight, padding: 0 },
});