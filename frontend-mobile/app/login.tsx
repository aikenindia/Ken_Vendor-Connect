import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '@/constants/api';
import { COLORS } from '@/constants/colors';

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Missing info', 'Enter username and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        Alert.alert('Login failed', data.error);
        return;
      }
      await AsyncStorage.setItem('user', JSON.stringify(data));
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('Error', 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <View style={styles.content}>
        <Text style={styles.title}>Ken-Connect</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="Username"
          placeholderTextColor={COLORS.slate}
          autoCapitalize="none"
        />

        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={COLORS.slate}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
            <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.button} onPress={login} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign in'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.indigo, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.slate, textAlign: 'center', marginTop: 6, marginBottom: 32 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: COLORS.ink, marginBottom: 14,
  },
  passwordRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1,
    borderColor: COLORS.border, borderRadius: 12, marginBottom: 14,
  },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: COLORS.ink },
  eyeButton: { paddingHorizontal: 14 },
  eyeText: { fontSize: 12, fontWeight: '700', color: COLORS.indigo },
  button: { backgroundColor: COLORS.indigo, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});