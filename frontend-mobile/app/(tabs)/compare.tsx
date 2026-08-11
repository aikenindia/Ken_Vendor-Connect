import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { API_URL } from '@/constants/api';
import { COLORS } from '@/constants/colors';

type Enquiry = { id: number; item: string };
type Quote = {
  vendor: string;
  quoted_rate: string | null;
  moq: string | null;
  delivery_days: string | null;
  status: string;
};
type EnquiryVendorItem = {
  vendor_id: number;
  vendor_name: string;
  status: string;
};

export default function CompareScreen() {
  const router = useRouter();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [enquiryVendors, setEnquiryVendors] = useState<EnquiryVendorItem[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/enquiries`);
      const data = await res.json();
      setEnquiries(data.slice().reverse());
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      if (expandedId !== null) {
        loadQuotes(expandedId);
      }
    }, [load, expandedId])
  );

  const loadQuotes = async (id: number) => {
    setQuotesLoading(true);
    try {
      const [compareRes, vendorsRes] = await Promise.all([
        fetch(`${API_URL}/enquiries/${id}/compare`),
        fetch(`${API_URL}/enquiries/${id}/vendors`),
      ]);
      const compareData = await compareRes.json();
      const vendorsData = await vendorsRes.json();
      setQuotes(compareData.quotes || []);
      setEnquiryVendors(vendorsData || []);
    } catch (e) {
      setQuotes([]);
      setEnquiryVendors([]);
    } finally {
      setQuotesLoading(false);
    }
  };

  const toggleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    await loadQuotes(id);
  };

  const lowestRate = quotes
    .map((q) => (q.quoted_rate ? parseFloat(q.quoted_rate) : null))
    .filter((r): r is number => r !== null)
    .sort((a, b) => a - b)[0];

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
        <Text style={styles.headerTitle}>Compare</Text>
      </View>
      <FlatList
        data={enquiries}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.emptyText}>No enquiries to compare yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity style={styles.cardHeader} onPress={() => toggleExpand(item.id)}>
              <Text style={styles.title}>#{item.id} — {item.item}</Text>
              <Text style={styles.chevron}>{expandedId === item.id ? '︿' : '﹀'}</Text>
            </TouchableOpacity>

            {expandedId === item.id && (
              <View style={styles.quotesWrap}>
                {quotesLoading ? (
                  <ActivityIndicator size="small" color={COLORS.indigo} style={{ marginVertical: 10 }} />
                ) : enquiryVendors.length === 0 ? (
                  <Text style={styles.emptyText}>No vendors on this enquiry.</Text>
                ) : (
                  enquiryVendors.map((ev, evi) => {
                    const q = quotes.find((qt) => qt.vendor === ev.vendor_name);
                    const isLowest = q?.quoted_rate && parseFloat(q.quoted_rate) === lowestRate;
                    return (
                      <View key={evi} style={[styles.quoteRow, isLowest && styles.quoteRowLowest]}>
                        <View style={{ flex: 1 }}>
                          <TextInput
                            style={styles.vendorName}
                            value={ev.vendor_name}
                            editable={false}
                          />
                          {q?.quoted_rate ? (
                            <Text style={styles.quoteMeta}>
                              {q.moq ? `MOQ: ${q.moq}` : ''} {q.delivery_days ? `· ${q.delivery_days} days` : ''}
                            </Text>
                          ) : (
                            <Text style={styles.quoteMeta}>No quote yet</Text>
                          )}
                        </View>
                        {q?.quoted_rate ? (
                          <View style={{ alignItems: 'flex-end' }}>
                            <TextInput
                              style={[styles.rate, isLowest && styles.rateLowest]}
                              value={`₹${q.quoted_rate}`}
                              editable={false}
                            />
                            {isLowest && <Text style={styles.lowestTag}>LOWEST</Text>}
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.addQuoteButton}
                            onPress={() =>
                              router.push({
                                pathname: '/add-quote',
                                params: {
                                  enquiryId: String(item.id),
                                  vendorId: String(ev.vendor_id),
                                  vendorName: ev.vendor_name,
                                },
                              })
                            }
                          >
                            <Text style={styles.addQuoteText}>+ Add quote</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            )}
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
  emptyText: { textAlign: 'center', color: COLORS.slateLight, marginTop: 10, fontSize: 13 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 10, overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  title: { fontSize: 14, fontWeight: '700', color: COLORS.ink, flex: 1 },
  chevron: { fontSize: 14, color: COLORS.slateLight },
  quotesWrap: { paddingHorizontal: 14, paddingBottom: 14 },
  quoteRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  quoteRowLowest: { backgroundColor: COLORS.sageBg, marginHorizontal: -14, paddingHorizontal: 14, borderTopColor: '#D3ECDE' },
  vendorName: { fontSize: 13, fontWeight: '700', color: COLORS.ink, padding: 0, margin: 0 },
  quoteMeta: { fontSize: 11, color: COLORS.slate, marginTop: 2 },
  rate: { fontSize: 15, fontWeight: '700', color: COLORS.ink, padding: 0, margin: 0, textAlign: 'right' },
  rateLowest: { color: COLORS.sage },
  lowestTag: { fontSize: 9, fontWeight: '700', color: COLORS.sage, marginTop: 2 },
  addQuoteButton: { backgroundColor: COLORS.indigo, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  addQuoteText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});