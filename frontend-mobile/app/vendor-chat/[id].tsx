import { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Linking, Alert, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { API_URL } from '@/constants/api';
import { COLORS } from '@/constants/colors';

type Msg = {
  id: number;
  sender: string;
  text: string;
  is_read: number;
  created_at: string;
};

export default function VendorChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [vendorName, setVendorName] = useState('Vendor');
  const [vendorPhone, setVendorPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToEnd = () => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const load = useCallback(async () => {
    try {
      const [msgRes, vendorsRes] = await Promise.all([
        fetch(`${API_URL}/messages/${id}`),
        fetch(`${API_URL}/vendors`),
      ]);
      const msgData = await msgRes.json();
      const vendors = await vendorsRes.json();
      setMessages(msgData);
      const v = vendors.find((x: any) => String(x.id) === String(id));
      if (v) {
        setVendorName(v.name);
        setVendorPhone(v.whatsapp_number);
      }

      fetch(`${API_URL}/messages/${id}/mark-read`, { method: 'POST' });
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

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: Number(id), sender: 'user', text }),
      });
      const newMsg = await res.json();
      setMessages((prev) => [...prev, newMsg]);
      scrollToEnd();

      // If Meta WhatsApp Cloud API sent the message directly, no need to force open WhatsApp link
      if (newMsg.whatsapp_api?.success) {
        // Message sent via Meta WhatsApp Cloud API directly
      } else {
        // Fallback to wa.me link
        const cleanPhone = vendorPhone.replace(/\D/g, '');
        const waLink = newMsg.whatsapp_link || (cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}` : null);
        if (waLink) {
          if (Platform.OS === 'web') {
            window.open(waLink, '_blank');
          } else {
            await Linking.openURL(waLink);
          }
        } else {
          Alert.alert('No WhatsApp number', 'This vendor has no valid WhatsApp number saved.');
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Could not send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding" keyboardVerticalOffset={0}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{vendorName}</Text>
          <View style={{ width: 32 }} />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={[styles.screen, styles.centered]}>
          <ActivityIndicator size="large" color={COLORS.indigo} />
        </View>
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.chatContent}
            onContentSizeChange={scrollToEnd}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 && (
              <Text style={styles.hint}>No conversation yet with this vendor.</Text>
            )}
            {messages.map((m) => {
              const isUser = m.sender === 'user';
              return (
                <View key={m.id} style={[styles.bubble, isUser ? styles.userBubble : styles.vendorBubble]}>
                  <Text style={styles.senderLabel}>
                    {isUser ? 'You' : m.sender === 'ai' ? 'AI' : vendorName}
                  </Text>
                  <TextInput
                    style={styles.bubbleText}
                    value={m.text}
                    editable={false}
                    multiline
                  />
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={`Message ${vendorName}...`}
              placeholderTextColor={COLORS.slate}
              multiline
            />
            <TouchableOpacity style={styles.sendButton} onPress={sendMessage} disabled={sending}>
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  headerSafeArea: { backgroundColor: COLORS.indigo },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 12, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: COLORS.indigo,
  },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 26, color: '#fff' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  chatContent: { padding: 16, paddingBottom: 20 },
  hint: { fontSize: 13, color: COLORS.slate, textAlign: 'center', marginTop: 40 },
  bubble: { borderRadius: 14, padding: 12, marginBottom: 10, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.greyBubble },
  vendorBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border },
  senderLabel: { fontSize: 10, color: COLORS.slateLight, marginBottom: 4, fontWeight: '700' },
  bubbleText: { fontSize: 14, color: COLORS.ink, padding: 0, margin: 0 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 10,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 100, color: COLORS.ink,
  },
  sendButton: { backgroundColor: COLORS.indigo, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  sendButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});