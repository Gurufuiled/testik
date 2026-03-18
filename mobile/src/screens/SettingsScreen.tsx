import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { authStore } from '../stores/authStore';
import { authService, apiUserToUserRow } from '../services/AuthService';
import { getProfile, updateProfile } from '../services/profileService';
import { apiUpload } from '../services/apiClient';
import { resolveAvatarUrl } from '../config';

const HANDLE_REGEX = /^[a-zA-Z0-9_]{5,32}$/;

export function SettingsScreen() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<{
    display_name: string | null;
    avatar_url: string | null;
    handle: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [savingHandle, setSavingHandle] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await getProfile();
      setProfile({
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        handle: p.handle,
      });
      setDisplayName(p.display_name ?? '');
      setHandle(p.handle ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const syncAuthStore = useCallback((apiUser: Parameters<typeof apiUserToUserRow>[0]) => {
    const token = authStore.getState().accessToken;
    if (token) {
      authStore.getState().setSession(apiUserToUserRow(apiUser), token);
    }
  }, []);

  const handleAvatarTap = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to photos to change avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    setError(null);
    try {
      const asset = result.assets[0];
      const uploadRes = await apiUpload({
        uri: asset.uri,
        name: asset.fileName ?? 'avatar.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
      const avatarUrl = typeof uploadRes.url === 'string' ? uploadRes.url : (uploadRes as { url: string }).url;
      const updated = await updateProfile({ avatar_url: avatarUrl });
      setProfile((prev) => (prev ? { ...prev, avatar_url: updated.avatar_url } : null));
      await authService.saveUserToLocal(updated);
      syncAuthStore(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  }, [syncAuthStore]);

  const handleSaveDisplayName = useCallback(async () => {
    const trimmed = displayName.trim();
    if (trimmed === (profile?.display_name ?? '')) return;
    setSavingDisplayName(true);
    setError(null);
    try {
      const updated = await updateProfile({ display_name: trimmed || undefined });
      setProfile((prev) => (prev ? { ...prev, display_name: updated.display_name } : null));
      await authService.saveUserToLocal(updated);
      syncAuthStore(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save display name');
    } finally {
      setSavingDisplayName(false);
    }
  }, [displayName, profile?.display_name, syncAuthStore]);

  const handleSaveHandle = useCallback(async () => {
    const trimmed = handle.trim().replace(/^@/, '');
    if (trimmed === (profile?.handle ?? '')) return;
    if (trimmed.length > 0) {
      if (trimmed.length < 5 || trimmed.length > 32) {
        setError('Handle must be 5-32 characters');
        return;
      }
      if (!HANDLE_REGEX.test(trimmed)) {
        setError('Handle can only contain letters, numbers, and underscores (no @, -, or spaces)');
        return;
      }
    }
    setSavingHandle(true);
    setError(null);
    try {
      const updated = await updateProfile({ handle: trimmed || undefined });
      setProfile((prev) => (prev ? { ...prev, handle: updated.handle } : null));
      setHandle(updated.handle ?? '');
      await authService.saveUserToLocal(updated);
      syncAuthStore(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save handle');
    } finally {
      setSavingHandle(false);
    }
  }, [handle, profile?.handle, syncAuthStore]);

  const handleValue = (profile?.handle ?? handle).trim().replace(/^@/, '');
  const handleCopyHandle = useCallback(async () => {
    if (!handleValue) {
      Alert.alert('No handle to copy', 'Set a handle first, then copy it.');
      return;
    }
    const toCopy = `@${handleValue}`;
    await Clipboard.setStringAsync(toCopy);
    Alert.alert('Copied', `${toCopy} copied to clipboard`);
  }, [handleValue]);

  const avatarUrl = resolveAvatarUrl(profile?.avatar_url ?? user?.avatar_url);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={styles.avatarWrap}
          onPress={uploadingAvatar ? undefined : handleAvatarTap}
          disabled={uploadingAvatar}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>
                {(profile?.display_name ?? user?.display_name ?? '?')[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
          )}
          {uploadingAvatar && (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </Pressable>

        <View style={styles.field}>
          <Text style={styles.label}>Display name</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor="#999"
              autoCapitalize="words"
            />
            <Pressable
              style={[styles.saveBtn, savingDisplayName && styles.saveBtnDisabled]}
              onPress={handleSaveDisplayName}
              disabled={savingDisplayName}
            >
              {savingDisplayName ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Handle</Text>
          <View style={styles.row}>
            <Text style={styles.handlePrefix}>@</Text>
            <TextInput
              style={[styles.input, styles.handleInput]}
              value={handle.replace(/^@/, '')}
              onChangeText={(t) => setHandle(t.replace(/^@/, ''))}
              placeholder="handle"
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.saveBtn, savingHandle && styles.saveBtnDisabled]}
              onPress={handleSaveHandle}
              disabled={savingHandle}
            >
              {savingHandle ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </Pressable>
          </View>
          <Pressable
            style={[styles.copyBtn, !handleValue && styles.copyBtnDisabled]}
            onPress={handleCopyHandle}
            disabled={!handleValue}
          >
            <Text style={[styles.copyBtnText, !handleValue && styles.copyBtnTextDisabled]}>
              Copy handle
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && styles.buttonPressed]}
          onPress={logout}
        >
          <Text style={styles.logoutBtnText}>Logout</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorBox: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: { color: '#c62828', fontSize: 14 },
  avatarWrap: {
    alignSelf: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#9e9e9e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '600',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  field: { marginBottom: 20 },
  label: { fontSize: 12, color: '#666', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  handleInput: { flex: 1 },
  handlePrefix: { fontSize: 16, color: '#333' },
  saveBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  copyBtn: {
    marginTop: 8,
    paddingVertical: 8,
  },
  copyBtnDisabled: { opacity: 0.5 },
  copyBtnText: { color: '#007AFF', fontSize: 14 },
  copyBtnTextDisabled: { color: '#999' },
  logoutBtn: {
    backgroundColor: '#ff3b30',
    padding: 16,
    borderRadius: 8,
    marginTop: 24,
  },
  buttonPressed: { opacity: 0.8 },
  logoutBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
