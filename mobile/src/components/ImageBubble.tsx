import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, bubbleRadius, typography } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MAX_SIZE = 240;

const STATUS_ICONS: Record<string, string> = {
  sending: '\u23F1',
  sent: '\u2713',
  delivered: '\u2713\u2713',
  read: '\u2713\u2713',
  failed: '\u26A0',
};

export interface ImageBubbleProps {
  uri: string;
  isMe: boolean;
  width?: number;
  height?: number;
  caption?: string;
  time?: string;
  status?: string;
}

function computeDisplaySize(
  naturalWidth: number,
  naturalHeight: number,
  maxSize: number = MAX_SIZE
): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: maxSize, height: maxSize };
  }
  const scale = Math.min(maxSize / naturalWidth, maxSize / naturalHeight, 1);
  return {
    width: Math.round(naturalWidth * scale),
    height: Math.round(naturalHeight * scale),
  };
}

export function ImageBubble({
  uri,
  isMe,
  width: propWidth,
  height: propHeight,
  caption,
  time,
  status,
}: ImageBubbleProps) {
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!uri?.trim()) {
      setDisplaySize({ width: MAX_SIZE, height: MAX_SIZE });
      return;
    }
    if (propWidth != null && propHeight != null) {
      setDisplaySize(computeDisplaySize(propWidth, propHeight));
      return;
    }
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (!cancelled) {
          setDisplaySize(computeDisplaySize(w, h));
        }
      },
      () => {
        if (!cancelled) {
          setDisplaySize({ width: MAX_SIZE, height: MAX_SIZE });
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [uri, propWidth, propHeight]);

  const handlePress = useCallback(() => {
    setFullscreenVisible(true);
  }, []);

  const handleClose = useCallback(() => {
    setFullscreenVisible(false);
  }, []);

  const w = displaySize?.width ?? MAX_SIZE;
  const h = displaySize?.height ?? MAX_SIZE;
  const hasCaption = (caption ?? '').trim().length > 0;
  const statusIcon = isMe ? STATUS_ICONS[status ?? ''] ?? STATUS_ICONS.sending : null;

  return (
    <>
      <View style={[styles.container, isMe ? styles.bubbleMe : styles.bubbleOther]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View image fullscreen"
          onPress={handlePress}
          style={styles.imageWrapper}
        >
          <Image
            source={{ uri }}
            style={[styles.image, { width: w, height: h }]}
            resizeMode="cover"
          />

          {(time || statusIcon) ? (
            <View style={styles.overlayMeta}>
              {time ? <Text style={styles.overlayTime}>{time}</Text> : null}
              {statusIcon ? <Text style={styles.overlayStatus}>{statusIcon}</Text> : null}
            </View>
          ) : null}
        </Pressable>

        {hasCaption ? (
          <Text style={[styles.caption, isMe && styles.captionMe]}>{caption}</Text>
        ) : null}
      </View>

      <Modal
        visible={fullscreenVisible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <Pressable style={styles.fullscreenBackdrop} onPress={handleClose}>
          <View style={styles.fullscreenContent}>
            <Image
              source={{ uri }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
            <Pressable
              style={[styles.closeButton, { top: insets.top + 12 }]}
              onPress={handleClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close fullscreen"
            >
              <Text style={styles.closeButtonText}>x</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    maxWidth: '82%',
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
  imageWrapper: {
    overflow: 'hidden',
    borderRadius: 14,
    position: 'relative',
  },
  image: {
    maxWidth: MAX_SIZE,
    maxHeight: MAX_SIZE,
  },
  overlayMeta: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  overlayTime: {
    fontSize: typography.timeStatus,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  overlayStatus: {
    fontSize: typography.timeStatus,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  caption: {
    marginTop: 6,
    paddingHorizontal: 4,
    paddingBottom: 2,
    fontSize: 14,
    lineHeight: 19,
    color: '#111827',
  },
  captionMe: {
    color: '#FFFFFF',
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenContent: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '600',
  },
});
