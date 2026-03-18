import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { API_BASE_URL } from '../config';
import { authService } from '../services/AuthService';

type Props = {
  onLogin: () => void;
};

export function LoginScreen({ onLogin }: Props) {
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLoginPress = useCallback(async () => {
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${API_BASE_URL}/auth/login-url`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = (await res.json()) as { url?: string };
      if (data?.url) {
        setLoginUrl(data.url);
      } else {
        Alert.alert('Error', 'Failed to get login URL');
      }
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? 'Сервер не отвечает (таймаут 15 сек). Проверьте: 1) Сервер запущен? 2) Выполнен ли adb reverse? (npm run adb:reverse)'
          : 'Сервер недоступен. Запустите сервер и выполните: npm run adb:reverse';
      Alert.alert('Ошибка сети', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const onMessage = useCallback(
    async (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data?.type !== 'auth') return;
        if (data?.error) {
          Alert.alert('Login failed', data.error);
          setLoginUrl(null);
          return;
        }
        if (!data?.code) return;
        console.log('[Auth] onMessage: got code, calling loginWithCode');
        await authService.loginWithCode(data.code, data.redirect_uri ?? '');
        console.log('[Auth] onMessage: loginWithCode OK, calling onLogin');
        await onLogin();
        setLoginUrl(null);
        console.log('[Auth] onMessage: onLogin OK');
      } catch (e) {
        console.error('[Auth] onMessage: error', e);
        setLoginUrl(null);
        Alert.alert(
          'Ошибка входа',
          e instanceof Error ? e.message : 'Не удалось обменять код. Проверьте adb reverse и доступность сервера.'
        );
      }
    },
    [onLogin]
  );

  if (loginUrl) {
    return (
      <View style={styles.container}>
        <WebView
          source={{ uri: loginUrl }}
          style={styles.webview}
          originWhitelist={['https://*', 'http://*']}
          onMessage={onMessage}
          onError={(e) => {
            console.warn('[Auth] WebView onError', e.nativeEvent);
            setLoginUrl(null);
            Alert.alert(
              'Ошибка загрузки',
              'Не удалось загрузить страницу входа. Проверьте: сервер запущен, выполнен npm run adb:reverse'
            );
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <Text style={styles.title}>P2P Messenger</Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={handleLoginPress}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Login with Loginus</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonPressed: { opacity: 0.8 },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
