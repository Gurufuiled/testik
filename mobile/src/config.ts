/**
 * App configuration - API base URL, OAuth settings.
 * Use env vars in production (e.g. EXPO_PUBLIC_API_URL).
 * Android emulator uses 10.0.2.2 to reach host's localhost.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

const envApiUrl =
  (typeof process !== 'undefined' && (process as { env?: { EXPO_PUBLIC_API_URL?: string } }).env?.EXPO_PUBLIC_API_URL) ||
  'http://localhost:4000/api';

/**
 * Resolve API URL for Android:
 * - 127.0.0.1 in env = adb reverse (physical device) → use as-is
 * - Emulator (Constants.isDevice=false) + localhost/192.168.x = use 10.0.2.2 (emulator's host alias)
 * - Physical device + 192.168.x = use as-is (same WiFi)
 */
function resolveApiUrl(): string {
  if (Platform.OS !== 'android') return envApiUrl;
  try {
    const url = new URL(envApiUrl);
    // 127.0.0.1 = adb reverse, never replace
    if (url.hostname === '127.0.0.1') return envApiUrl;
    // Physical device: use env as-is
    if (Constants.isDevice) return envApiUrl;
    // Emulator: replace localhost/192.168.x with 10.0.2.2 (emulator's alias for host)
    if (url.hostname === 'localhost' || url.hostname.startsWith('192.168.')) {
      url.hostname = '10.0.2.2';
      return url.toString();
    }
    return envApiUrl;
  } catch {
    return envApiUrl;
  }
}

export const API_BASE_URL = resolveApiUrl();

export const USE_MOCKS =
  (typeof process !== 'undefined' &&
    (process as { env?: { EXPO_PUBLIC_USE_MOCKS?: string } }).env?.EXPO_PUBLIC_USE_MOCKS === 'true') ||
  false;

/** WebSocket URL derived from API: http://host:4000/api -> ws://host:4001 */
export function getWebSocketUrl(): string {
  try {
    const url = new URL(API_BASE_URL);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.hostname}:4001`;
  } catch {
    return 'ws://localhost:4001';
  }
}

/** Signaling WebSocket URL for P2P: http://host:4000/api -> ws://host:4002 */
export function getSignalingUrl(): string {
  try {
    const url = new URL(API_BASE_URL);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.hostname}:4002`;
  } catch {
    return 'ws://localhost:4002';
  }
}

export const LOGINUS_CLIENT_ID =
  (typeof process !== 'undefined' && (process as { env?: { EXPO_PUBLIC_LOGINUS_CLIENT_ID?: string } }).env?.EXPO_PUBLIC_LOGINUS_CLIENT_ID) ||
  '';

export const OAUTH_REDIRECT_URI = 'messenger://auth/callback';
