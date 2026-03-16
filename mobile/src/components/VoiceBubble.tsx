/**
 * VoiceBubble - Voice message bubble with waveform, play/pause, and duration.
 * Matches ChatScreen bubble styles (bubbleMe, bubbleOther).
 */

import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { useVoicePlayer } from '../contexts/VoicePlayerContext';
import { colors, bubbleRadius } from '../theme/colors';

export interface VoiceBubbleProps {
  uri: string;
  waveform: number[];
  durationMs: number;
  isMe: boolean;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function VoiceBubble({ uri, waveform, durationMs, isMe }: VoiceBubbleProps) {
  const { play, pause, currentVoiceUri, status } = useVoicePlayer();

  const isCurrent = currentVoiceUri === uri;
  const isPlaying = isCurrent && status.isPlaying;
  const progress =
    isCurrent && status.durationMs > 0 ? status.positionMs / status.durationMs : 0;

  const handlePress = async () => {
    if (isPlaying) {
      await pause();
    } else {
      try {
        await play(uri);
      } catch {
        // Playback failed (invalid URI, network error) - no user feedback for now
      }
    }
  };

  const bars = waveform.length > 0 ? waveform : Array(50).fill(0.5);
  const barCount = Math.min(bars.length, 50);

  return (
    <View style={[styles.container, isMe ? styles.bubbleMe : styles.bubbleOther]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause voice message' : 'Play voice message'}
        accessibilityState={{ selected: isPlaying }}
        style={({ pressed }) => [
          styles.playButton,
          isMe ? styles.playButtonMe : styles.playButtonOther,
          pressed && styles.playButtonPressed,
        ]}
        onPress={handlePress}
        hitSlop={8}
      >
        <Text style={[styles.playIcon, isMe && styles.playIconMe]}>
          {isPlaying ? '⏸' : '▶'}
        </Text>
      </Pressable>

      <View style={styles.waveformContainer}>
        {Array.from({ length: barCount }).map((_, i) => {
          const value = Math.max(0, Math.min(1, bars[i] ?? 0.5));
          const barHeight = 4 + value * 20;
          const isFilled = progress > 0 && i / barCount <= progress;
          return (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  height: barHeight,
                  backgroundColor: isFilled
                    ? isMe
                      ? colors.textSecondaryMuted
                      : colors.accent
                    : isMe
                      ? 'rgba(0,0,0,0.2)'
                      : 'rgba(0,0,0,0.25)',
                },
              ]}
            />
          );
        })}
      </View>

      <Text style={[styles.duration, isMe && styles.durationMe]}>
        {formatDuration(durationMs)}
      </Text>
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
    gap: 8,
  },
  bubbleMe: {
    backgroundColor: colors.bubbleMe,
    ...bubbleRadius.mine,
  },
  bubbleOther: {
    backgroundColor: colors.bubbleOther,
    ...bubbleRadius.other,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonMe: {
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  playButtonOther: {
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  playButtonPressed: {
    opacity: 0.7,
  },
  playIcon: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  playIconMe: {
    color: colors.textPrimary,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
    minWidth: 80,
  },
  bar: {
    width: 2,
    borderRadius: 1,
    minHeight: 4,
  },
  duration: {
    fontSize: 11,
    color: colors.textSecondary,
    minWidth: 32,
  },
  durationMe: {
    color: colors.textSecondaryMuted,
  },
});
