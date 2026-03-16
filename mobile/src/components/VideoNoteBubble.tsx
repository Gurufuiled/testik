/**
 * VideoNoteBubble - Video note message bubble with circular mask.
 * Matches VoiceBubble styling patterns (bubbleMe, bubbleOther).
 */

import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useRef } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, bubbleRadius } from '../theme/colors';

export interface VideoNoteBubbleProps {
  uri: string;
  thumbnailUri?: string;
  durationMs: number;
  isMe: boolean;
  isViewed?: boolean;
  onViewed?: () => void;
}

const SIZE = 240;
const RADIUS = SIZE / 2;

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function VideoNoteBubble({
  uri,
  thumbnailUri,
  durationMs,
  isMe,
  isViewed = false,
  onViewed,
}: VideoNoteBubbleProps) {
  const hasCalledViewed = useRef(false);
  const player = useVideoPlayer(uri);
  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
  });

  const handlePress = () => {
    if (isPlaying) {
      player.pause();
    } else {
      if (!hasCalledViewed.current && !isViewed) {
        hasCalledViewed.current = true;
        onViewed?.();
      }
      try {
        player.play();
      } catch {
        // Playback failed (invalid URI, network error) - no user feedback for now
      }
    }
  };

  return (
    <View style={[styles.container, isMe ? styles.bubbleMe : styles.bubbleOther]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause video note' : 'Play video note'}
        accessibilityState={{ selected: isPlaying }}
        style={styles.circleWrapper}
        onPress={handlePress}
        hitSlop={8}
      >
        <View style={styles.circle}>
          <VideoView
            style={StyleSheet.absoluteFill}
            player={player}
            contentFit="cover"
            nativeControls={false}
          />
          {!isPlaying && (
            thumbnailUri ? (
              <Image
                source={{ uri: thumbnailUri }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.thumbnailPlaceholder} />
            )
          )}
          {!isPlaying && (
            <View
              style={[
                styles.playOverlay,
                isMe ? styles.playOverlayMe : styles.playOverlayOther,
              ]}
            >
              <Text style={[styles.playIcon, isMe && styles.playIconMe]}>▶</Text>
            </View>
          )}
          <View
            style={[
              styles.durationBadge,
              isMe ? styles.durationBadgeMe : styles.durationBadgeOther,
            ]}
          >
            <Text style={[styles.durationText, isMe && styles.durationTextMe]}>
              {formatDuration(durationMs)}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
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
  circleWrapper: {
    width: SIZE,
    height: SIZE,
  },
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  thumbnail: {
    ...StyleSheet.absoluteFillObject,
  },
  thumbnailPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.placeholderBg,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlayMe: {
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  playOverlayOther: {
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  playIcon: {
    fontSize: 48,
    color: colors.textPrimary,
  },
  playIconMe: {
    color: '#fff',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  durationBadgeMe: {
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  durationBadgeOther: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  durationText: {
    fontSize: 11,
    color: '#fff',
  },
  durationTextMe: {
    color: 'rgba(255,255,255,0.95)',
  },
});
