/**
 * FileBubble - File message bubble with icon, filename, and optional size.
 * Matches VoiceBubble/ImageBubble styling patterns (bubbleMe, bubbleOther).
 */

import React, { useCallback } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, bubbleRadius } from '../theme/colors';

/** Unicode icon for file/attach: ⊕ */
const ICON_FILE = '\u2295';

export interface FileBubbleProps {
  fileName: string;
  fileSize?: number;
  uri?: string;
  isMe: boolean;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function FileBubble({ fileName, fileSize, uri, isMe }: FileBubbleProps) {
  const sizeText = fileSize != null ? formatFileSize(fileSize) : null;

  const handlePress = useCallback(() => {
    if (uri?.trim()) {
      Linking.openURL(uri).catch(() => {
        // Ignore - file may not be openable
      });
    }
  }, [uri]);

  return (
    <View style={[styles.container, isMe ? styles.bubbleMe : styles.bubbleOther]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={uri ? 'Open file' : 'File'}
        style={({ pressed }) => [styles.content, pressed && styles.contentPressed]}
        onPress={handlePress}
        hitSlop={8}
      >
        <Text style={[styles.icon, isMe && styles.iconMe]}>{ICON_FILE}</Text>
        <View style={styles.textContainer}>
          <Text
            style={[styles.fileName, isMe && styles.fileNameMe]}
            numberOfLines={2}
            ellipsizeMode="middle"
          >
            {fileName || 'Unnamed file'}
          </Text>
          {sizeText != null && (
            <Text style={[styles.fileSize, isMe && styles.fileSizeMe]}>
              {sizeText}
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '80%',
    alignSelf: 'flex-start',
  },
  bubbleMe: {
    backgroundColor: colors.bubbleMe,
    ...bubbleRadius.mine,
  },
  bubbleOther: {
    backgroundColor: colors.bubbleOther,
    ...bubbleRadius.other,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  contentPressed: {
    opacity: 0.8,
  },
  icon: {
    fontSize: 24,
    color: colors.textPrimary,
  },
  iconMe: {
    color: colors.textPrimary,
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  fileNameMe: {
    color: colors.textPrimary,
  },
  fileSize: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  fileSizeMe: {
    color: colors.textSecondaryMuted,
  },
});
