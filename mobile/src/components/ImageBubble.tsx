/**
 * ImageBubble - Image message bubble with optional fullscreen viewer.
 * Matches VoiceBubble/VideoNoteBubble styling patterns (bubbleMe, bubbleOther).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, bubbleRadius } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MAX_SIZE = 240;

export interface ImageBubbleProps {
  uri: string;
  isMe: boolean;
  width?: number;
  height?: number;
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

export function ImageBubble({ uri, isMe, width: propWidth, height: propHeight }: ImageBubbleProps) {
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!uri?.trim()) {
      setDisplaySize({ width: MAX_SIZE, height: MAX_SIZE });
      return;
    }
    if (propWidth != null && propHeight != null) {
      const size = computeDisplaySize(propWidth, propHeight);
      setDisplaySize(size);
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
        </Pressable>
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
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
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
  imageWrapper: {
    overflow: 'hidden',
    borderRadius: 8,
  },
  image: {
    maxWidth: MAX_SIZE,
    maxHeight: MAX_SIZE,
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
