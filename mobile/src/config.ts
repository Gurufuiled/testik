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

const forceEmulator =
  typeof process !== 'undefined' &&
  (process as { env?: { EXPO_PUBLIC_USE_EMULATOR?: string } }).env?.EXPO_PUBLIC_USE_EMULATOR === 'true';
const forceDevice =
  typeof process !== 'undefined' &&
  (process as { env?: { EXPO_PUBLIC_USE_EMULATOR?: string } }).env?.EXPO_PUBLIC_USE_EMULATOR === 'false';

/**
 * Resolve API URL for Android:
 * - Physical device (USB + adb reverse): 127.0.0.1 - use as-is
 * - Physical device (WiFi): 192.168.x - use as-is
 * - Emulator: 127.0.0.1/localhost - replace with 10.0.2.2 (emulator's host alias)
 * - EXPO_PUBLIC_USE_EMULATOR=true/false overrides auto-detection when Constants.isDevice is wrong
 */
function resolveApiUrl(): string {
  if (Platform.OS !== 'android') return envApiUrl;
  try {
    const url = new URL(envApiUrl);
    // Explicit override: physical device (use env as-is)
    if (forceDevice) return envApiUrl;
    // Explicit override: emulator (use 10.0.2.2)
    if (forceEmulator) {
      if (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname.startsWith('192.168.')) {
        url.hostname = '10.0.2.2';
        return url.toString();
      }
      return envApiUrl;
    }
    // Physical device: use env as-is (USB adb reverse or WiFi)
    if (Constants.isDevice) return envApiUrl;
    // 192.168.x (LAN IP) - works on both phone and emulator, do not replace
    if (url.hostname.startsWith('192.168.')) return envApiUrl;
    // Emulator: 127.0.0.1/localhost -> 10.0.2.2 to reach host
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
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

/** P2P disabled for MVP (server storage). Set true when switching to decentralized. */
export const USE_P2P =
  (typeof process !== 'undefined' &&
    (process as { env?: { EXPO_PUBLIC_USE_P2P?: string } }).env?.EXPO_PUBLIC_USE_P2P === 'true') ||
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

/** Resolve relative avatar URL (/uploads/xxx) to full URL using API host. */
export function resolveAvatarUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl || typeof avatarUrl !== 'string') return null;
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) return avatarUrl;
  if (avatarUrl.startsWith('/uploads/')) {
    try {
      const url = new URL(API_BASE_URL);
      return `${url.protocol}//${url.host}${avatarUrl}`;
    } catch {
      return avatarUrl;
    }
  }
  return avatarUrl;
}
