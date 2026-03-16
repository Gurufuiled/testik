import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export function SettingsScreen() {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      {user && (
        <Text style={styles.user}>
          {user.display_name || user.username || user.id}
        </Text>
      )}
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={logout}
      >
        <Text style={styles.buttonText}>Logout</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  user: { fontSize: 18, marginBottom: 24 },
  button: {
    backgroundColor: '#ff3b30',
    padding: 16,
    borderRadius: 8,
  },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
