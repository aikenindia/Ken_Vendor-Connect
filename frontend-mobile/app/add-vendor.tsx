import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { API_URL } from '@/constants/api';
import { COLORS } from '@/constants/colors';

export default function AddVendorScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !whatsapp.trim()) {
      Alert.alert('Missing info', 'Vendor name and WhatsApp number are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          whatsapp_number: whatsapp.trim(),
          email: email.trim() || null,
          category: category.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Could not save vendor. Check your connection and try again.');
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
          <Text style={styles.headerTitle}>New Vendor</Text>
          <View style={{ width: 32 }} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Vendor name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Shree Textiles" placeholderTextColor={COLORS.slate} />

        <Text style={styles.label}>WhatsApp number *</Text>
        <TextInput
          style={styles.input}
          value={whatsapp}
          onChangeText={setWhatsapp}
          placeholder="91XXXXXXXXXX (with country code)"
          placeholderTextColor={COLORS.slate}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="vendor@email.com"
          placeholderTextColor={COLORS.slate}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Category</Text>
        <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="Fabric, Trims, Dyeing..." placeholderTextColor={COLORS.slate} />

        <TouchableOpacity style={styles.saveButton} onPress={save} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save vendor'}</Text>
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
  label: { fontSize: 12, fontWeight: '700', color: COLORS.slate, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.ink,
  },
  saveButton: { backgroundColor: COLORS.indigo, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});