import React, { useCallback } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useAuth } from '../contexts/AuthContext';

/**
 * Modal WebView for Loginus SLO (Single Logout).
 * Shown when sloUrlToOpen is set after logout.
 * Loads slo_url, receives logout_done via postMessage, then closes.
 */
export function SloWebView() {
  const { sloUrlToOpen, clearSloUrl } = useAuth();

  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data?.type === 'logout_done') {
          clearSloUrl();
        }
      } catch {
        // Ignore non-JSON messages
      }
    },
    [clearSloUrl]
  );

  if (!sloUrlToOpen) return null;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={clearSloUrl}
    >
      <View style={styles.container}>
        <WebView
          source={{ uri: sloUrlToOpen }}
          style={styles.webview}
          originWhitelist={['https://*', 'http://*']}
          onMessage={onMessage}
          onError={() => clearSloUrl()}
          onHttpError={() => clearSloUrl()}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Завершение выхода...</Text>
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
});
