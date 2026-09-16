import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, ScrollView, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { API_URL } from '@/constants/api';
import { COLORS } from '@/constants/colors';

type Vendor = {
  id: number;
  name: string;
  whatsapp_number: string;
  email: string | null;
  category: string | null;
};

function initials(name: string) {
  if (!name) return 'V';
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export default function VendorInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);

  // Email Editing state
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/vendors`);
      const vendors = await res.json();
      const v = vendors.find((x: any) => String(x.id) === String(id));
      setVendor(v || null);
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const callVendor = () => {
    if (!vendor?.whatsapp_number) return;
    const cleanPhone = vendor.whatsapp_number.replace(/\D/g, '');
    Linking.openURL(`tel:${cleanPhone}`);
  };

  const emailVendor = () => {
    if (!vendor?.email) {
      Alert.alert('No Email', 'This vendor has no email address on file. Tap "Change" to add one.');
      return;
    }
    Linking.openURL(`mailto:${vendor.email}`);
  };

  const returnToChat = () => {
    router.back();
  };

  const copyToClipboard = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${label} copied to clipboard.`);
  };

  const startEditingEmail = () => {
    setEmailInput(vendor?.email || '');
    setEditingEmail(true);
  };

  const saveEmail = async () => {
    if (!id || !vendor) return;
    const newEmail = emailInput.trim();
    setSavingEmail(true);
    try {
      const res = await fetch(`${API_URL}/vendors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      });
      const data = await res.json();
      if (data.error) {
        Alert.alert('Error', data.error);
        return;
      }
      setVendor((prev) => (prev ? { ...prev, email: newEmail || null } : prev));
      setEditingEmail(false);
      Alert.alert('Success', 'Vendor email updated successfully.');
    } catch (e) {
      Alert.alert('Error', 'Could not update email. Please check connection.');
    } finally {
      setSavingEmail(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.indigo} />
      </View>
    );
  }

  if (!vendor) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.emptyText}>Vendor not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Contact Info</Text>
          <View style={{ width: 32 }} />
        </View>
      </SafeAreaView>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* HERO SECTION WITH MATURE ENTERPRISE AVATAR */}
        <View style={styles.profileSection}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>{initials(vendor.name)}</Text>
          </View>
          <Text style={styles.vendorNameLarge}>{vendor.name}</Text>
          <Text style={styles.vendorPhoneSubtitle}>{vendor.whatsapp_number}</Text>
          {vendor.category && (
            <View style={styles.categoryBadgeContainer}>
              <Ionicons name="pricetag-outline" size={12} color={COLORS.indigo} style={{ marginRight: 4 }} />
              <Text style={styles.categoryTag}>{vendor.category}</Text>
            </View>
          )}
        </View>

        {/* QUICK ACTIONS ROW WITH VECTOR ICONS */}
        <View style={styles.quickActionsRow}>
          <TouchableOpacity style={styles.quickAction} onPress={callVendor}>
            <View style={styles.quickActionCircle}>
              <Ionicons name="call" size={20} color={COLORS.indigo} />
            </View>
            <Text style={styles.quickActionLabel}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickAction} onPress={returnToChat}>
            <View style={styles.quickActionCircle}>
              <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.indigo} />
            </View>
            <Text style={styles.quickActionLabel}>Message</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickAction} onPress={emailVendor}>
            <View style={styles.quickActionCircle}>
              <Ionicons name="mail" size={20} color={COLORS.indigo} />
            </View>
            <Text style={styles.quickActionLabel}>Email</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickAction} onPress={() => copyToClipboard(vendor.whatsapp_number, 'Phone number')}>
            <View style={styles.quickActionCircle}>
              <Ionicons name="copy-outline" size={20} color={COLORS.indigo} />
            </View>
            <Text style={styles.quickActionLabel}>Copy</Text>
          </TouchableOpacity>
        </View>

        {/* DETAILS CARDS WITH PROFESSIONAL VECTOR ICONS */}
        <View style={styles.infoCard}>
          <Text style={styles.cardSectionLabel}>CONTACT DETAILS</Text>

          {/* Phone Row */}
          <TouchableOpacity style={styles.infoRow} onPress={() => copyToClipboard(vendor.whatsapp_number, 'Phone number')}>
            <View style={styles.infoRowIconWrap}>
              <Ionicons name="phone-portrait-outline" size={22} color={COLORS.indigo} />
            </View>
            <View style={styles.infoRowContent}>
              <Text style={styles.infoRowValue}>{vendor.whatsapp_number}</Text>
              <Text style={styles.infoRowSubLabel}>WhatsApp / Mobile Number</Text>
            </View>
            <Text style={styles.infoRowAction}>Copy</Text>
          </TouchableOpacity>

          {/* Email Row with Change Option */}
          <View style={styles.infoRow}>
            <View style={styles.infoRowIconWrap}>
              <Ionicons name="mail-outline" size={22} color={COLORS.indigo} />
            </View>
            <View style={styles.infoRowContent}>
              {editingEmail ? (
                <View style={styles.editEmailContainer}>
                  <TextInput
                    style={styles.emailTextInput}
                    value={emailInput}
                    onChangeText={setEmailInput}
                    placeholder="Enter email address..."
                    placeholderTextColor={COLORS.slate}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoFocus
                  />
                  <View style={styles.editEmailButtonsRow}>
                    <TouchableOpacity style={styles.saveEmailBtn} onPress={saveEmail} disabled={savingEmail}>
                      {savingEmail ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.saveEmailBtnText}>Save</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cancelEmailBtn} onPress={() => setEditingEmail(false)}>
                      <Text style={styles.cancelEmailBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={emailVendor}>
                  <Text style={styles.infoRowValue}>{vendor.email || 'No email address on file'}</Text>
                  <Text style={styles.infoRowSubLabel}>Email Address</Text>
                </TouchableOpacity>
              )}
            </View>
            {!editingEmail && (
              <TouchableOpacity onPress={startEditingEmail} style={styles.editActionBtn}>
                <Text style={styles.infoRowAction}>Change</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Category Row */}
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <View style={styles.infoRowIconWrap}>
              <Ionicons name="business-outline" size={22} color={COLORS.indigo} />
            </View>
            <View style={styles.infoRowContent}>
              <Text style={styles.infoRowValue}>{vendor.category || 'General Vendor'}</Text>
              <Text style={styles.infoRowSubLabel}>Business Category</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: COLORS.slate },
  headerSafeArea: { backgroundColor: COLORS.indigo },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 12, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: COLORS.indigo,
  },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  content: { flex: 1 },
  contentContainer: { padding: 20, paddingBottom: 40 },
  profileSection: {
    alignItems: 'center', backgroundColor: '#fff', borderRadius: 20,
    paddingVertical: 28, paddingHorizontal: 16, borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 16, shadowColor: '#1E293B', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  avatarLarge: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.indigo,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    borderWidth: 4, borderColor: '#EEF2FF', shadowColor: COLORS.indigo,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 3,
  },
  avatarLargeText: { color: '#fff', fontWeight: '800', fontSize: 34, letterSpacing: 1 },
  vendorNameLarge: { fontSize: 22, fontWeight: '700', color: COLORS.ink, textAlign: 'center' },
  vendorPhoneSubtitle: { fontSize: 14, color: COLORS.slate, marginTop: 4, textAlign: 'center' },
  categoryBadgeContainer: {
    flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: '#EEF2FF',
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#D0DDFB',
  },
  categoryTag: { fontSize: 12, color: COLORS.indigo, fontWeight: '700' },
  quickActionsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 16, paddingHorizontal: 10, marginBottom: 16,
  },
  quickAction: { alignItems: 'center', flex: 1 },
  quickActionCircle: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  quickActionLabel: { fontSize: 12, color: COLORS.indigo, fontWeight: '700' },
  infoCard: {
    backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: COLORS.border,
    padding: 16, marginBottom: 16,
  },
  cardSectionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.slateLight, marginBottom: 12, letterSpacing: 0.8 },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F0F2F6',
  },
  infoRowIconWrap: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  infoRowContent: { flex: 1 },
  infoRowValue: { fontSize: 15, color: COLORS.ink, fontWeight: '600' },
  infoRowSubLabel: { fontSize: 11, color: COLORS.slate, marginTop: 2 },
  infoRowAction: { fontSize: 12, fontWeight: '700', color: COLORS.indigo, paddingLeft: 8 },
  editActionBtn: { paddingVertical: 4, paddingHorizontal: 6 },

  editEmailContainer: { width: '100%' },
  emailTextInput: {
    borderWidth: 1, borderColor: COLORS.indigo, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: COLORS.ink,
    backgroundColor: '#F8F9FE', marginBottom: 8,
  },
  editEmailButtonsRow: { flexDirection: 'row', gap: 8 },
  saveEmailBtn: {
    backgroundColor: COLORS.indigo, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6,
  },
  saveEmailBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  cancelEmailBtn: {
    backgroundColor: '#F0F2F6', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6,
  },
  cancelEmailBtnText: { color: COLORS.slate, fontWeight: '600', fontSize: 12 },
});