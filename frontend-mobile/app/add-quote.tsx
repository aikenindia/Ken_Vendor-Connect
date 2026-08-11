import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { API_URL } from '@/constants/api';
import { COLORS } from '@/constants/colors';

export default function AddQuoteScreen() {
  const router = useRouter();
  const { enquiryId, vendorId, vendorName } = useLocalSearchParams<{
    enquiryId: string; vendorId: string; vendorName: string;
  }>();
  const [rate, setRate] = useState('');
  const [moq, setMoq] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!rate.trim()) {
      Alert.alert('Missing info', 'Please enter the quoted rate.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/enquiries/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enquiry_id: Number(enquiryId),
          vendor_id: Number(vendorId),
          quoted_rate: rate.trim(),
          moq: moq.trim() || null,
          delivery_days: deliveryDays.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Could not save the quote. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding" keyboardVerticalOffset={0}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Quote</Text>
          <View style={{ width: 32 }} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.vendorLabel}>Quote from</Text>
        <Text style={styles.vendorName}>{vendorName}</Text>

        <Text style={styles.label}>Quoted rate *</Text>
        <TextInput
          style={styles.input}
          value={rate}
          onChangeText={setRate}
          placeholder="e.g. 185"
          placeholderTextColor={COLORS.slate}
          keyboardType="numeric"
        />

        <Text style={styles.label}>MOQ (Minimum Order Quantity)</Text>
        <TextInput
          style={styles.input}
          value={moq}
          onChangeText={setMoq}
          placeholder="e.g. 1000 meters"
          placeholderTextColor={COLORS.slate}
        />

        <Text style={styles.label}>Delivery days</Text>
        <TextInput
          style={styles.input}
          value={deliveryDays}
          onChangeText={setDeliveryDays}
          placeholder="e.g. 15"
          placeholderTextColor={COLORS.slate}
          keyboardType="numeric"
        />

        <TouchableOpacity style={styles.saveButton} onPress={save} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save quote'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  headerSafeArea: { backgroundColor: COLORS.indigo },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 12, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: COLORS.indigo,
  },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 26, color: '#fff' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  form: { padding: 20 },
  vendorLabel: { fontSize: 12, color: COLORS.slate },
  vendorName: { fontSize: 18, fontWeight: '700', color: COLORS.ink, marginTop: 2, marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.slate, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.ink,
  },
  saveButton: { backgroundColor: COLORS.indigo, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});