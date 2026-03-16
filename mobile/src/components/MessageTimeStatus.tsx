import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../theme/colors';

/** Unicode icons for message status. */
const STATUS_ICONS: Record<string, string> = {
  sending: '\u23F1', // ⏱ (stopwatch)
  sent: '\u2713', // ✓
  delivered: '\u2713\u2713', // ✓✓
  read: '\u2713\u2713', // ✓✓
  failed: '\u26A0', // ⚠
};

interface MessageTimeStatusProps {
  time: string;
  status: string;
  isMe: boolean;
}

/**
 * Renders time and optional status icon at bottom-right of a message bubble.
 * For "my" messages (isMe): shows time + status icon (e.g. "10:30 ✓").
 * For "other" messages: shows only time.
 */
export function MessageTimeStatus({ time, status, isMe }: MessageTimeStatusProps) {
  const icon = isMe ? STATUS_ICONS[status] ?? STATUS_ICONS.sending : null;

  return (
    <View style={styles.container}>
      <Text style={[styles.time, isMe && styles.timeMe]}>{time}</Text>
      {icon != null && <Text style={[styles.icon, isMe && styles.iconMe]}>{icon}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  time: {
    fontSize: typography.timeStatus,
    color: colors.textSecondary,
  },
  timeMe: {
    color: colors.textSecondaryMuted,
  },
  icon: {
    fontSize: typography.timeStatus,
    color: colors.textSecondary,
  },
  iconMe: {
    color: colors.textSecondaryMuted,
  },
});
