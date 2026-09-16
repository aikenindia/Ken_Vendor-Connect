import { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Alert, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '@/constants/api';
import { COLORS } from '@/constants/colors';

type Msg = {
  id: number;
  sender: string;
  text: string;
  is_read: number;
  created_at: string;
  pending?: boolean;
};

function formatTime(iso: string | null) {
  if (!iso) return '';
  const parsedIso = iso.includes('T') && !iso.endsWith('Z') && !iso.includes('+') ? iso + 'Z' : iso;
  const d = new Date(parsedIso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function VendorChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [vendorName, setVendorName] = useState('Vendor');
  const [vendorPhone, setVendorPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [templateMode, setTemplateMode] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateLanguage, setTemplateLanguage] = useState('en_US');
  const scrollRef = useRef<ScrollView>(null);

  const scrollToEnd = () => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const load = useCallback(async (isSilent = false) => {
    if (!id) return;
    try {
      const [msgRes, vendorsRes] = await Promise.all([
        fetch(`${API_URL}/messages/${id}`),
        fetch(`${API_URL}/vendors`),
      ]);
      const msgData: Msg[] = await msgRes.json();
      const vendors = await vendorsRes.json();

      setMessages((prev) => {
        const pendingMsgs = prev.filter((m) => m.pending);
        const serverIds = new Set(msgData.map((m) => m.id));
        const activePending = pendingMsgs.filter((pm) => !serverIds.has(pm.id));
        return [...msgData, ...activePending];
      });

      const v = vendors.find((x: any) => String(x.id) === String(id));
      if (v) {
        setVendorName(v.name);
        setVendorPhone(v.whatsapp_number);
      }

      fetch(`${API_URL}/messages/${id}/mark-read`, { method: 'POST' }).catch(() => {});
    } catch (e) {
      // silent
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [id]);

  // Initial load + Real-time fast polling interval (every 1.5 seconds)
  useFocusEffect(
    useCallback(() => {
      load(false);

      const interval = setInterval(() => {
        load(true);
      }, 1500);

      return () => clearInterval(interval);
    }, [load])
  );

  // OPTIMISTIC INSTANT MESSAGE SENDING (WhatsApp Speed)
  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;

    // 1. Instant local UI update (0ms delay)
    const tempId = Date.now();
    const tempMsg: Msg = {
      id: tempId,
      sender: 'user',
      text,
      is_read: 1,
      created_at: new Date().toISOString(),
      pending: true,
    };

    setInput('');
    setMessages((prev) => [...prev, tempMsg]);
    scrollToEnd();

    // 2. Network send in background
    try {
      const res = await fetch(`${API_URL}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: Number(id), sender: 'user', text }),
      });
      const newMsg = await res.json();

      // Replace temp optimistic message with confirmed server message
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...newMsg, pending: false } : m))
      );
      scrollToEnd();

      if (newMsg.whatsapp_api?.error) {
        Alert.alert('Delivery Notice', `Message saved locally, but Meta WhatsApp API returned: ${newMsg.whatsapp_api.error}`);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not send message. Please check your network connection.');
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  const sendTemplate = async () => {
    const name = templateName.trim();
    if (!name || !vendorPhone) return;

    try {
      const res = await fetch(`${API_URL}/whatsapp/send-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: vendorPhone,
          template_name: name,
          language_code: templateLanguage.trim() || 'en_US',
        }),
      });
      const result = await res.json();
      if (!result.api_result?.success) {
        Alert.alert('Template not sent', result.api_result?.error || 'Meta rejected this template.');
        return;
      }

      const templateMessage: Msg = {
        id: Date.now(),
        sender: 'user',
        text: `[Template: ${name}]`,
        is_read: 1,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, templateMessage]);
      setTemplateName('');
      setTemplateMode(false);
      scrollToEnd();
    } catch (e) {
      Alert.alert('Error', 'Could not send the WhatsApp template.');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding" keyboardVerticalOffset={0}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerTitleWrap}
            onPress={() => router.push(`/vendor-info/${id}`)}
            activeOpacity={0.7}
          >
            <Text style={styles.headerTitle}>{vendorName}</Text>
            <Text style={styles.headerSubtitle}>Tap for contact info</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push(`/vendor-info/${id}`)} style={styles.infoIconButton}>
            <Ionicons name="information-circle-outline" size={22} color="#fff" />
          </TouchableOpacity>
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
                  <View style={styles.bubbleFooter}>
                    <Text style={styles.bubbleTime}>{m.pending ? 'sending...' : formatTime(m.created_at)}</Text>
                    {isUser && (
                      <Ionicons
                        name={m.pending ? 'time-outline' : 'checkmark-done'}
                        size={12}
                        color={m.pending ? COLORS.slate : COLORS.indigo}
                        style={{ marginLeft: 3 }}
                      />
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.composer}>
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeButton, !templateMode && styles.activeModeButton]}
                onPress={() => setTemplateMode(false)}
              >
                <Text style={[styles.modeText, !templateMode && styles.activeModeText]}>Message</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeButton, templateMode && styles.activeModeButton]}
                onPress={() => setTemplateMode(true)}
              >
                <Text style={[styles.modeText, templateMode && styles.activeModeText]}>Template</Text>
              </TouchableOpacity>
            </View>
            {templateMode ? (
              <View style={styles.templateFields}>
                <TextInput
                  style={styles.templateInput}
                  value={templateName}
                  onChangeText={setTemplateName}
                  placeholder="Approved template name"
                  placeholderTextColor={COLORS.slate}
                  autoCapitalize="none"
                />
                <TextInput
                  style={styles.languageInput}
                  value={templateLanguage}
                  onChangeText={setTemplateLanguage}
                  placeholder="en_US"
                  placeholderTextColor={COLORS.slate}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.sendButton} onPress={sendTemplate}>
                  <Text style={styles.sendButtonText}>Send</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={input}
                  onChangeText={setInput}
                  placeholder={`Message ${vendorName}...`}
                  placeholderTextColor={COLORS.slate}
                  multiline
                />
                <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
                  <Text style={styles.sendButtonText}>Send</Text>
                </TouchableOpacity>
              </View>
            )}
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
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSubtitle: { fontSize: 11, color: '#D0D5EE', marginTop: 1 },
  infoIconButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  chatContent: { padding: 16, paddingBottom: 20 },
  hint: { fontSize: 13, color: COLORS.slate, textAlign: 'center', marginTop: 40 },
  bubble: { borderRadius: 14, padding: 12, marginBottom: 10, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.greyBubble },
  vendorBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border },
  senderLabel: { fontSize: 10, color: COLORS.slateLight, marginBottom: 4, fontWeight: '700' },
  bubbleText: { fontSize: 14, color: COLORS.ink, padding: 0, margin: 0 },
  bubbleFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    marginTop: 4,
  },
  bubbleTime: { fontSize: 10, color: COLORS.slateLight },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 10,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  composer: {
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  modeRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  modeButton: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  activeModeButton: { backgroundColor: COLORS.indigo },
  modeText: { color: COLORS.slate, fontSize: 12, fontWeight: '600' },
  activeModeText: { color: '#fff' },
  templateFields: {
    flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8,
  },
  templateInput: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.ink,
  },
  languageInput: {
    width: 68, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14,
    paddingHorizontal: 8, paddingVertical: 10, fontSize: 13, color: COLORS.ink,
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 100, color: COLORS.ink,
  },
  sendButton: { backgroundColor: COLORS.indigo, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  sendButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
