import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, Alert
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '@/constants/api';
import { COLORS } from '@/constants/colors';

type Enquiry = {
  id: number;
  item: string;
  spec: string | null;
  quantity: string;
  delivery_date: string | null;
  created_at: string;
};

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

type EnquiryCompareData = {
  enquiry: Enquiry;
  vendors: EnquiryVendorItem[];
  quotes: Quote[];
  loading: boolean;
};

function EnquiryCompareCard({ enquiry, router }: { enquiry: Enquiry; router: any }) {
  const [vendors, setVendors] = useState<EnquiryVendorItem[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [vendorsRes, compareRes] = await Promise.all([
        fetch(`${API_URL}/enquiries/${enquiry.id}/vendors`),
        fetch(`${API_URL}/enquiries/${enquiry.id}/compare`),
      ]);
      const vendorsData = await vendorsRes.json();
      const compareData = await compareRes.json();
      setVendors(vendorsData || []);
      setQuotes(compareData.quotes || []);
    } catch (e) {
      setVendors([]);
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }, [enquiry.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Calculate lowest numerical rate quote
  const validNumericQuotes = quotes
    .map((q) => {
      if (!q.quoted_rate) return null;
      const num = parseFloat(q.quoted_rate.replace(/[^\d.]/g, ''));
      return isNaN(num) ? null : { quote: q, num };
    })
    .filter((item): item is { quote: Quote; num: number } => item !== null)
    .sort((a, b) => a.num - b.num);

  const lowestItem = validNumericQuotes.length > 0 ? validNumericQuotes[0] : null;

  return (
    <View style={styles.card}>
      {/* CARD HEADER: ENQUIRY NAME & ITEM */}
      <View style={styles.cardHeader}>
        <View style={styles.itemTitleRow}>
          <View style={styles.iconBox}>
            <Ionicons name="document-text" size={18} color={COLORS.indigo} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle}>{enquiry.item}</Text>
            <Text style={styles.enquiryIdSub}>Enquiry #{enquiry.id}</Text>
          </View>
        </View>

        {/* ENQUIRY DETAILS BOX */}
        <View style={styles.specBox}>
          {enquiry.spec ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Spec:</Text>
              <Text style={styles.detailValue}>{enquiry.spec}</Text>
            </View>
          ) : null}
          <View style={styles.detailRowInline}>
            <Text style={styles.detailInlineText}>
              Quantity: <Text style={{ fontWeight: '700', color: COLORS.ink }}>{enquiry.quantity}</Text>
            </Text>
            {enquiry.delivery_date ? (
              <Text style={styles.detailInlineText}>
                Delivery: <Text style={{ fontWeight: '700', color: COLORS.ink }}>{enquiry.delivery_date}</Text>
              </Text>
            ) : null}
          </View>
        </View>

        {/* VENDORS SENT TO ROW */}
        {vendors.length > 0 && (
          <View style={styles.sentToRow}>
            <Ionicons name="send-outline" size={13} color={COLORS.indigo} style={{ marginRight: 6 }} />
            <Text style={styles.sentToLabel}>Sent to: </Text>
            <Text style={styles.sentToVendors} numberOfLines={2}>
              {vendors.map((v) => v.vendor_name).join(', ')}
            </Text>
          </View>
        )}
      </View>

      {/* BEST PRICE TROPHY BANNER (IF QUOTE EXISTS) */}
      {lowestItem && (
        <View style={styles.winnerBanner}>
          <Ionicons name="trophy" size={18} color="#D97706" style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.winnerTextTitle}>LOWEST QUOTE OFFER</Text>
            <Text style={styles.winnerVendor}>{lowestItem.quote.vendor}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.winnerRate}>₹{lowestItem.quote.quoted_rate}</Text>
            <Text style={styles.winnerLabel}>Best Price</Text>
          </View>
        </View>
      )}

      {/* VENDOR RATES COMPARISON TABLE */}
      <View style={styles.vendorsListSection}>
        <Text style={styles.vendorListHeader}>VENDOR QUOTES & RATES</Text>

        {loading ? (
          <ActivityIndicator size="small" color={COLORS.indigo} style={{ marginVertical: 12 }} />
        ) : vendors.length === 0 ? (
          <Text style={styles.noVendorsText}>No vendors tagged for this enquiry.</Text>
        ) : (
          // Sort vendors: Quoted rates lowest-to-highest first, then unquoted vendors (Top 10)
          vendors
            .slice()
            .sort((a, b) => {
              const qA = quotes.find((qt) => qt.vendor === a.vendor_name)?.quoted_rate;
              const qB = quotes.find((qt) => qt.vendor === b.vendor_name)?.quoted_rate;
              const numA = qA ? parseFloat(qA.replace(/[^\d.]/g, '')) : Infinity;
              const numB = qB ? parseFloat(qB.replace(/[^\d.]/g, '')) : Infinity;
              return numA - numB;
            })
            .slice(0, 10)
            .map((v, index) => {
              const q = quotes.find((qt) => qt.vendor === v.vendor_name);
              const isLowest = lowestItem && q && q.vendor === lowestItem.quote.vendor;

              return (
                <View key={v.vendor_id} style={[styles.vendorRow, isLowest && styles.vendorRowLowest]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {q?.quoted_rate && (
                        <Text style={[styles.rankTag, isLowest && styles.rankTagLowest]}>#{index + 1}</Text>
                      )}
                      <Text style={styles.vendorName}>{v.vendor_name}</Text>
                    </View>
                    <Text style={styles.vendorStatusText}>
                      {q?.quoted_rate ? 'AI Extracted Rate ✓' : 'Awaiting Vendor WhatsApp Reply'}
                    </Text>
                    {q?.quoted_rate ? (
                      <Text style={styles.vendorMetaText}>
                        {q.moq ? `MOQ: ${q.moq}` : ''} {q.delivery_days ? `· Delivery: ${q.delivery_days} days` : ''}
                      </Text>
                    ) : null}
                  </View>

                  {q?.quoted_rate ? (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.rateValue, isLowest && styles.rateValueLowest]}>
                        ₹{q.quoted_rate}
                      </Text>
                      {isLowest && (
                        <View style={styles.bestBadge}>
                          <Text style={styles.bestBadgeText}>LOWEST PRICE</Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={styles.awaitingBadge}>
                      <Text style={styles.awaitingBadgeText}>Pending</Text>
                    </View>
                  )}
                </View>
              );
            })
        )}
      </View>
    </View>
  );
}

export default function CompareScreen() {
  const router = useRouter();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadEnquiries = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/enquiries`);
      const data: Enquiry[] = await res.json();
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
      loadEnquiries();
    }, [loadEnquiries])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadEnquiries();
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
        <Text style={styles.headerTitle}>Rate Comparison</Text>
        <Text style={styles.headerSubtitle}>Compare quotes & vendor prices for all enquiries</Text>
      </View>

      <FlatList
        data={enquiries}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Ionicons name="stats-chart-outline" size={48} color={COLORS.slate} />
            <Text style={styles.emptyTitle}>No Enquiries to Compare</Text>
            <Text style={styles.emptySub}>Send an enquiry to vendors to view and compare their quotes here.</Text>
          </View>
        }
        renderItem={({ item }) => <EnquiryCompareCard enquiry={item} router={router} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: 24, fontWeight: '700', color: COLORS.ink },
  headerSubtitle: { fontSize: 13, color: COLORS.slate, marginTop: 2 },

  listContent: { padding: 16, paddingBottom: 30 },

  emptyCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.ink, marginTop: 12 },
  emptySub: { fontSize: 13, color: COLORS.slate, textAlign: 'center', marginTop: 6, lineHeight: 18 },

  card: {
    backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 16, overflow: 'hidden', shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  cardHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  iconBox: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
  },
  itemTitle: { fontSize: 17, fontWeight: '700', color: COLORS.ink },
  enquiryIdSub: { fontSize: 11, color: COLORS.slateLight, marginTop: 1 },

  specBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, marginVertical: 6 },
  detailRow: { flexDirection: 'row', marginBottom: 4 },
  detailLabel: { fontSize: 12, fontWeight: '700', color: COLORS.slate, marginRight: 6 },
  detailValue: { fontSize: 12, color: COLORS.ink, flex: 1 },
  detailRowInline: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  detailInlineText: { fontSize: 12, color: COLORS.slate },

  sentToRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingTop: 6 },
  sentToLabel: { fontSize: 12, fontWeight: '700', color: COLORS.indigo },
  sentToVendors: { fontSize: 12, color: COLORS.ink, fontWeight: '600', flex: 1 },

  winnerBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#A7F3D0',
  },
  winnerTextTitle: { fontSize: 10, fontWeight: '800', color: '#047857', letterSpacing: 0.5 },
  winnerVendor: { fontSize: 14, fontWeight: '700', color: COLORS.ink, marginTop: 1 },
  winnerRate: { fontSize: 18, fontWeight: '800', color: '#047857' },
  winnerLabel: { fontSize: 9, fontWeight: '800', color: '#047857' },

  vendorsListSection: { padding: 14 },
  vendorListHeader: { fontSize: 11, fontWeight: '700', color: COLORS.slateLight, marginBottom: 10, letterSpacing: 0.8 },
  noVendorsText: { fontSize: 12, color: COLORS.slate, fontStyle: 'italic' },

  vendorRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  vendorRowLowest: { backgroundColor: '#FAFFFD', borderColor: '#A7F3D0' },
  rankTag: { fontSize: 11, fontWeight: '800', color: COLORS.slate, backgroundColor: '#E2E8F0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  rankTagLowest: { color: '#047857', backgroundColor: '#DEF7EC' },
  vendorName: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  vendorStatusText: { fontSize: 11, color: COLORS.slate, marginTop: 2 },
  vendorMetaText: { fontSize: 11, color: COLORS.indigo, fontWeight: '600', marginTop: 2 },

  rateValue: { fontSize: 16, fontWeight: '700', color: COLORS.ink },
  rateValueLowest: { fontSize: 18, fontWeight: '800', color: '#047857' },
  bestBadge: { backgroundColor: '#DEF7EC', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  bestBadgeText: { fontSize: 9, fontWeight: '800', color: '#03543F' },
  awaitingBadge: { backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  awaitingBadgeText: { fontSize: 10, color: COLORS.slate, fontWeight: '600' },
});