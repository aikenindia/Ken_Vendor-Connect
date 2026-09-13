import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Pressable, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { API_URL } from '@/constants/api';

const COLORS = {
  indigo: '#3B4B8C',
  ink: '#1E2233',
  slate: '#6E7484',
  border: '#E7E9F0',
  bg: '#F7F8FB',
  sage: '#3D9970',
  sageBg: '#E3F4EB',
  ochre: '#C08A2E',
  greyBubble: '#F0F1F4',
  selectedTint: '#DCE3F5',
};

type EnquiryItem = {
  item: string;
  spec: string | null;
  quantity: string;
  message_body?: string | null;
};

type ParsedResult = {
  type: 'enquiry' | 'chat' | 'multiple';
  ready: boolean;
  items: EnquiryItem[];
  delivery_date: string | null;
  send_mode?: 'combined' | 'separate' | null;
  vendor_ids: number[];
  clarification: string | null;
  reply: string | null;
};

type SentVendor = {
  vendor: string;
  whatsapp_link: string;
  whatsapp_api_sent?: boolean;
  whatsapp_api_error?: string | null;
  email_sent: boolean;
};

type SentEnquiry = {
  enquiryId: number;
  item: string;
  sentTo: SentVendor[];
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

type Message =
  | { role: 'user'; text: string }
  | { role: 'ai_text'; text: string }
  | { role: 'ai_confirm'; data: ParsedResult; selectedIdsByItem: number[][] }
  | { role: 'ai_sent'; results: SentEnquiry[] };

export default function EnquiryChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [allVendors, setAllVendors] = useState<Vendor[]>([]);
  const [pickerOpenFor, setPickerOpenFor] = useState<{ msgIndex: number; itemIndex: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    fetch(`${API_URL}/vendors`)
      .then((res) => res.json())
      .then((data) => setAllVendors(data))
      .catch(() => {});

    AsyncStorage.getItem('user').then((value) => {
      if (value) setCurrentUser(JSON.parse(value));
    });
  }, []);

  const scrollToEnd = () => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setLoading(true);

    const historyTexts = messages
      .filter((m): m is { role: 'user'; text: string } => m.role === 'user')
      .map((m) => m.text);

    try {
      const res = await fetch(`${API_URL}/chat/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: historyTexts }),
      });
      const data: ParsedResult = await res.json();

      if (data.type === 'chat') {
        setMessages((prev) => [
          ...prev,
          { role: 'ai_text', text: data.reply || "How can I help?" },
        ]);
      } else if (data.type === 'multiple') {
        const defaultVids = data.vendor_ids && data.vendor_ids.length > 0 ? data.vendor_ids.slice() : [];
        const selectedIdsByItem = data.items.map(() => defaultVids.slice());
        setMessages((prev) => [
          ...prev,
          { role: 'ai_text', text: data.clarification || `I found ${data.items.length} items. Review and send below.` },
          { role: 'ai_confirm', data, selectedIdsByItem },
        ]);
      } else if (data.ready) {
        const selectedIdsByItem = data.items.map(() => data.vendor_ids.slice());
        setMessages((prev) => [...prev, { role: 'ai_confirm', data, selectedIdsByItem }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'ai_text', text: data.clarification || "Could you share a bit more detail?" },
        ]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'ai_text', text: "Couldn't reach the server. Check your WiFi and try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const toggleVendor = (msgIndex: number, itemIndex: number, vendorId: number) => {
    setMessages((prev) =>
      prev.map((msg, i) => {
        if (i !== msgIndex || msg.role !== 'ai_confirm') return msg;
        const newSelected = msg.selectedIdsByItem.map((ids, ii) => {
          if (ii !== itemIndex) return ids;
          return ids.includes(vendorId) ? ids.filter((id) => id !== vendorId) : [...ids, vendorId];
        });
        return { ...msg, selectedIdsByItem: newSelected };
      })
    );
  };

  const toggleAllVendors = (msgIndex: number, itemIndex: number) => {
    setMessages((prev) =>
      prev.map((msg, i) => {
        if (i !== msgIndex || msg.role !== 'ai_confirm') return msg;
        const allIds = allVendors.map((v) => v.id);
        const current = msg.selectedIdsByItem[itemIndex];
        const allSelected = allIds.length > 0 && allIds.every((id) => current.includes(id));
        const newSelected = msg.selectedIdsByItem.map((ids, ii) =>
          ii === itemIndex ? (allSelected ? [] : allIds) : ids
        );
        return { ...msg, selectedIdsByItem: newSelected };
      })
    );
  };

  const confirmAndSendAll = async (data: ParsedResult, selectedIdsByItem: number[][]) => {
    const anyEmpty = selectedIdsByItem.some((ids) => ids.length === 0);
    if (anyEmpty) {
      Alert.alert('Select vendors', 'Please select at least one vendor for each item before sending.');
      return;
    }
    setLoading(true);
    const sendMode = data.send_mode || 'combined';

    try {
      const results: SentEnquiry[] = [];

      if (sendMode === 'combined') {
        const allSelectedVids = Array.from(new Set(selectedIdsByItem.flat()));
        const itemsPayload = data.items.map((item, i) => ({
          item: item.item,
          spec: item.spec,
          quantity: item.quantity,
          message_body: item.message_body || null,
          vendor_ids: selectedIdsByItem[i],
        }));

        const res = await fetch(`${API_URL}/enquiries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            send_mode: 'combined',
            delivery_date: data.delivery_date,
            vendor_ids: allSelectedVids,
            sender_name: currentUser?.name || null,
            items: itemsPayload,
          }),
        });

        const result = await res.json();
        const enquiryIds: number[] = result.enquiry_ids || (result.enquiry_id ? [result.enquiry_id] : []);

        for (let i = 0; i < data.items.length; i++) {
          const item = data.items[i];
          const eqId = enquiryIds[i] || result.enquiry_id || 0;
          results.push({
            enquiryId: eqId,
            item: item.item + (item.spec ? ` (${item.spec})` : ''),
            sentTo: result.sent_to || [],
          });
        }
      } else {
        for (let i = 0; i < data.items.length; i++) {
          const item = data.items[i];
          const res = await fetch(`${API_URL}/enquiries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              send_mode: 'separate',
              item: item.item,
              spec: item.spec,
              quantity: item.quantity,
              delivery_date: data.delivery_date,
              vendor_ids: selectedIdsByItem[i],
              sender_name: currentUser?.name || null,
              message_body: item.message_body || null,
            }),
          });
          const result = await res.json();
          results.push({
            enquiryId: result.enquiry_id,
            item: item.item,
            sentTo: result.sent_to || [],
          });
        }
      }

      setMessages((prev) => [...prev, { role: 'ai_sent', results }]);
    } catch (e) {
      Alert.alert('Error', 'Could not send one or more enquiries. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openWhatsApp = async (link: string) => {
    try {
      if (Platform.OS === 'web') {
        window.open(link, '_blank');
      } else {
        await Linking.openURL(link);
      }
    } catch (e) {
      Alert.alert('Error opening WhatsApp', String(e));
    }
  };

  const getMessageText = (msg: Message): string | null => {
    if (msg.role === 'user' || msg.role === 'ai_text') return msg.text;
    return null;
  };

  const copySelected = async () => {
    if (selectedIndex === null) return;
    const msg = messages[selectedIndex];
    const text = getMessageText(msg);
    if (text) {
      await Clipboard.setStringAsync(text);
    }
    setSelectedIndex(null);
  };

  const deleteSelected = () => {
    if (selectedIndex === null) return;
    Alert.alert('Delete message', 'Remove this message from the chat?', [
      { text: 'Cancel', style: 'cancel', onPress: () => setSelectedIndex(null) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setMessages((prev) => prev.filter((_, i) => i !== selectedIndex));
          setSelectedIndex(null);
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          {selectedIndex !== null ? (
            <>
              <TouchableOpacity onPress={() => setSelectedIndex(null)} style={styles.backButton}>
                <Text style={styles.backText}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>1 selected</Text>
              <View style={styles.selectionActions}>
                {getMessageText(messages[selectedIndex]) && (
                  <TouchableOpacity onPress={copySelected} style={styles.selectionActionButton}>
                    <Text style={styles.selectionActionText}>Copy</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={deleteSelected} style={styles.selectionActionButton}>
                  <Text style={styles.selectionActionText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <Text style={styles.backText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>KEN-Enquiry</Text>
              <View style={{ width: 32 }} />
            </>
          )}
        </View>
      </SafeAreaView>

      <View style={styles.bodyWrap}>
        <ScrollView
          ref={scrollRef}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToEnd}
        >
          {messages.length === 0 && (
            <Text style={styles.hint}>
              Paste your enquiry — even a full spec block with multiple items — or ask a question like
              &quot;what is MOQ?&quot;
            </Text>
          )}

          {messages.map((msg, i) => {
            const isSelected = selectedIndex === i;

            if (msg.role === 'user') {
              return (
                <Pressable
                  key={i}
                  onLongPress={() => setSelectedIndex(i)}
                  delayLongPress={300}
                >
                  <View style={[styles.userBubble, isSelected && styles.bubbleSelected]}>
                    <Text style={styles.userText}>{msg.text}</Text>
                  </View>
                </Pressable>
              );
            }
            if (msg.role === 'ai_text') {
              return (
                <Pressable
                  key={i}
                  onLongPress={() => setSelectedIndex(i)}
                  delayLongPress={300}
                >
                  <View style={[styles.aiBubble, isSelected && styles.bubbleSelected]}>
                    <Text style={styles.aiText}>{msg.text}</Text>
                  </View>
                </Pressable>
              );
            }
            if (msg.role === 'ai_confirm') {
              const d = msg.data;
              return (
                <Pressable key={i} onLongPress={() => setSelectedIndex(i)} delayLongPress={300}>
                  <View style={[styles.confirmCard, isSelected && styles.bubbleSelected]}>
                    <Text style={styles.confirmIntro}>
                      {d.items.length > 1
                        ? `${d.items.length} items found (${(d.send_mode || 'combined') === 'combined' ? 'Combined message' : 'Separate messages'}). Review each before sending:`
                        : 'I understood your enquiry as follows. Please confirm:'}
                    </Text>

                    {d.items.map((item, itemIndex) => {
                      const selectedIds = msg.selectedIdsByItem[itemIndex];
                      const allIds = allVendors.map((v) => v.id);
                      const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
                      return (
                        <View key={itemIndex} style={styles.itemBlock}>
                          {d.items.length > 1 && (
                            <Text style={styles.itemNumber}>Item {itemIndex + 1}</Text>
                          )}
                          <View style={styles.fieldRow}>
                            <Text style={styles.fieldLabel}>Item</Text>
                            <Text style={styles.fieldValue}>{item.item}</Text>
                          </View>
                          <View style={styles.fieldRow}>
                            <Text style={styles.fieldLabel}>Spec</Text>
                            <Text style={styles.fieldValue}>{item.spec || '—'}</Text>
                          </View>
                          <View style={styles.fieldRow}>
                            <Text style={styles.fieldLabel}>Quantity</Text>
                            <Text style={styles.fieldValue}>{item.quantity}</Text>
                          </View>
                          {d.delivery_date && (
                            <View style={styles.fieldRow}>
                              <Text style={styles.fieldLabel}>Delivery</Text>
                              <Text style={styles.fieldValue}>{d.delivery_date}</Text>
                            </View>
                          )}

                          <Text style={[styles.fieldLabel, { marginTop: 10, marginBottom: 6 }]}>Vendors</Text>
                          <TouchableOpacity
                            style={styles.dropdownButton}
                            onPress={() => setPickerOpenFor({ msgIndex: i, itemIndex })}
                          >
                            <Text style={styles.dropdownButtonText}>
                              {selectedIds.length === 0
                                ? 'Select vendors'
                                : allSelected
                                ? 'All vendors'
                                : `${selectedIds.length} vendor${selectedIds.length > 1 ? 's' : ''} selected`}
                            </Text>
                            <Text style={styles.dropdownArrow}>▾</Text>
                          </TouchableOpacity>

                          {itemIndex < d.items.length - 1 && <View style={styles.itemDivider} />}
                        </View>
                      );
                    })}

                    <View style={styles.confirmButtonsRow}>
                      <TouchableOpacity
                        style={styles.confirmButton}
                        onPress={() => confirmAndSendAll(d, msg.selectedIdsByItem)}
                      >
                        <Text style={styles.confirmButtonText}>
                          {d.items.length > 1
                            ? (d.send_mode || 'combined') === 'combined'
                              ? `Confirm & send combined enquiry (${d.items.length} items)`
                              : `Confirm & send ${d.items.length} separate enquiries`
                            : 'Confirm & send'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Pressable>
              );
            }
            if (msg.role === 'ai_sent') {
              return (
                <Pressable key={i} onLongPress={() => setSelectedIndex(i)} delayLongPress={300}>
                  <View style={[styles.successCard, isSelected && styles.bubbleSelected]}>
                    {msg.results.map((r, ri) => (
                      <View key={ri} style={ri > 0 ? styles.enquiryBlockSpaced : undefined}>
                        <Text style={styles.successText}>
                          Enquiry #{r.enquiryId} — {r.item} — sent.
                        </Text>
                        {r.sentTo.map((v, vi) => (
                          <View key={vi} style={styles.sentVendorRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.sentVendorName}>{v.vendor}</Text>
                              <Text style={styles.sentVendorMeta}>
                                {v.whatsapp_api_sent ? 'Direct WhatsApp API Sent ✓ • ' : (v.whatsapp_api_error ? `WhatsApp Error: ${v.whatsapp_api_error} • ` : '')}
                                {v.email_sent ? 'Email sent ✓' : 'No email on file'}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                </Pressable>
              );
            }
            return null;
          })}

          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={COLORS.indigo} />
            </View>
          )}
        </ScrollView>

        <Modal
          visible={pickerOpenFor !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerOpenFor(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Select vendors</Text>

              {pickerOpenFor !== null && (
                <ScrollView style={{ maxHeight: 320 }}>
                  {(() => {
                    const { msgIndex, itemIndex } = pickerOpenFor;
                    const msg = messages[msgIndex];
                    if (!msg || msg.role !== 'ai_confirm') return null;
                    const selectedIds = msg.selectedIdsByItem[itemIndex];
                    const allIds = allVendors.map((v) => v.id);
                    const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
                    return (
                      <>
                        <TouchableOpacity
                          style={styles.modalRow}
                          onPress={() => toggleAllVendors(msgIndex, itemIndex)}
                        >
                          <View style={[styles.checkbox, allSelected && styles.checkboxChecked]}>
                            {allSelected && <Text style={styles.checkmark}>✓</Text>}
                          </View>
                          <Text style={styles.modalRowText}>All vendors</Text>
                        </TouchableOpacity>
                        <View style={styles.modalDivider} />
                        {allVendors.map((v) => {
                          const selected = selectedIds.includes(v.id);
                          return (
                            <TouchableOpacity
                              key={v.id}
                              style={styles.modalRow}
                              onPress={() => toggleVendor(msgIndex, itemIndex, v.id)}
                            >
                              <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                                {selected && <Text style={styles.checkmark}>✓</Text>}
                              </View>
                              <Text style={styles.modalRowText}>{v.name}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </>
                    );
                  })()}
                </ScrollView>
              )}

              <TouchableOpacity style={styles.modalDoneButton} onPress={() => setPickerOpenFor(null)}>
                <Text style={styles.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Type your enquiry or a question..."
            placeholderTextColor={COLORS.slate}
            multiline
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage} disabled={loading}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  headerSafeArea: { backgroundColor: COLORS.indigo },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 12, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: COLORS.indigo,
  },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 22, color: '#FFFFFF' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', flex: 1, marginLeft: 8 },
  selectionActions: { flexDirection: 'row', gap: 16 },
  selectionActionButton: { paddingHorizontal: 4 },
  selectionActionText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  bodyWrap: { flex: 1 },
  chatArea: { flex: 1 },
  chatContent: { padding: 16, paddingTop: 10, paddingBottom: 30 },
  hint: { fontSize: 13, color: COLORS.slate, textAlign: 'center', marginTop: 30, paddingHorizontal: 20 },

  userBubble: {
    alignSelf: 'flex-end', backgroundColor: COLORS.greyBubble, borderRadius: 14,
    padding: 12, marginBottom: 12, maxWidth: '85%',
  },
  userText: { fontSize: 14, color: COLORS.ink },

  aiBubble: {
    alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, padding: 12, marginBottom: 12, maxWidth: '90%',
  },
  aiText: { fontSize: 14, color: COLORS.ink },

  bubbleSelected: {
    backgroundColor: COLORS.selectedTint,
    borderColor: COLORS.indigo,
    borderWidth: 1,
  },

  confirmCard: {
    backgroundColor: COLORS.indigo, borderRadius: 14, padding: 12, marginBottom: 10, maxWidth: '94%',
  },
  confirmIntro: { fontSize: 12, color: '#CED4EB', marginBottom: 10 },
  itemBlock: { marginBottom: 4 },
  itemNumber: { fontSize: 10, fontWeight: '700', color: '#CED4EB', marginBottom: 6, textTransform: 'uppercase' },
  itemDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 12 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  fieldLabel: { fontSize: 11, color: '#CED4EB' },
  fieldValue: { fontSize: 11, fontWeight: '700', color: '#fff', flexShrink: 1, textAlign: 'right', marginLeft: 10 },

  dropdownButton: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  dropdownButtonText: { fontSize: 12, fontWeight: '600', color: COLORS.indigo },
  dropdownArrow: { fontSize: 12, color: COLORS.indigo },

  confirmButtonsRow: { marginTop: 14 },
  confirmButton: { backgroundColor: '#fff', borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  confirmButtonText: { color: COLORS.indigo, fontWeight: '700', fontSize: 13 },

  successCard: { backgroundColor: COLORS.sageBg, borderRadius: 14, padding: 14, marginBottom: 12, maxWidth: '94%' },
  enquiryBlockSpaced: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#D3ECDE' },
  successText: { color: COLORS.sage, fontWeight: '700', fontSize: 14, marginBottom: 8 },
  sentVendorRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#D3ECDE',
  },
  sentVendorName: { fontSize: 13, fontWeight: '700', color: COLORS.ink },
  sentVendorMeta: { fontSize: 11, color: COLORS.slate, marginTop: 2 },
  waLink: { fontSize: 12, fontWeight: '700', color: COLORS.indigo },

  loadingRow: { alignItems: 'flex-start', marginBottom: 12 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.ink, marginBottom: 14 },
  modalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  modalRowText: { fontSize: 14, color: COLORS.ink, marginLeft: 12 },
  modalDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: COLORS.indigo, borderColor: COLORS.indigo },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  modalDoneButton: { backgroundColor: COLORS.indigo, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  modalDoneText: { color: '#fff', fontWeight: '700', fontSize: 14 },

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