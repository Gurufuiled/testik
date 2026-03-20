import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { useVoicePlayer } from '../contexts/VoicePlayerContext';
import { colors, bubbleRadius, typography } from '../theme/colors';
import { buildUiWaveform } from '../services/waveformUtils';
import { MessageTimeStatus } from './MessageTimeStatus';

export interface VoiceBubbleProps {
  uri: string;
  waveform: number[];
  durationMs: number;
  isMe: boolean;
  time?: string;
  status?: string;
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function VoiceBubble({
  uri,
  waveform,
  durationMs,
  isMe,
  time,
  status: messageStatus,
}: VoiceBubbleProps) {
  const { play, pause, currentVoiceUri, status } = useVoicePlayer();

  const isCurrent = currentVoiceUri === uri;
  const isPlaying = isCurrent && status.isPlaying;
  const progress =
    isCurrent && status.durationMs > 0 ? status.positionMs / status.durationMs : 0;
  const effectiveDurationMs = isCurrent
    ? Math.max(durationMs - status.positionMs, 0)
    : durationMs;

  const handlePress = async () => {
    if (isPlaying) {
      await pause();
    } else {
      try {
        await play(uri);
      } catch (err) {
        if (__DEV__) console.warn('[VoiceBubble] playback error:', err, uri);
      }
    }
  };

  const bars = buildUiWaveform(waveform.length > 0 ? waveform : Array(48).fill(0.5), 34)
    .map((value) => Math.min(1, Math.max(0.08, Math.pow(value, 0.72))));
  const barCount = bars.length;

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
          {isPlaying ? '❚❚' : '▶'}
        </Text>
      </Pressable>

      <View style={styles.contentColumn}>
        <View style={styles.waveformContainer}>
          {Array.from({ length: barCount }).map((_, i) => {
            const value = Math.max(0, Math.min(1, bars[i] ?? 0.5));
            const barHeight = 3 + value * 16;
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
                        ? 'rgba(255,255,255,0.96)'
                        : '#9EAA1A'
                      : isMe
                        ? 'rgba(255,255,255,0.34)'
                        : 'rgba(96, 87, 25, 0.30)',
                  },
                ]}
              />
            );
          })}
        </View>

        <View style={styles.metaRow}>
          <Text style={[styles.duration, isMe && styles.durationMe]}>
            {formatDuration(effectiveDurationMs)}
          </Text>

          {time ? (
            <MessageTimeStatus
              time={time}
              status={messageStatus ?? 'sent'}
              isMe={isMe}
              compact
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginVertical: 4,
    gap: 10,
    width: '100%',
  },
  bubbleMe: {
    backgroundColor: colors.bubbleMe,
    ...bubbleRadius.mine,
  },
  bubbleOther: {
    backgroundColor: '#F8F1B8',
    ...bubbleRadius.other,
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonMe: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  playButtonOther: {
    backgroundColor: 'rgba(157, 170, 26, 0.22)',
  },
  playButtonPressed: {
    opacity: 0.72,
  },
  playIcon: {
    fontSize: 15,
    color: '#605719',
    fontWeight: '700',
    marginLeft: 1,
  },
  playIconMe: {
    color: '#FFFFFF',
  },
  contentColumn: {
    flex: 1,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minWidth: 84,
    paddingTop: 2,
  },
  bar: {
    width: 3,
    borderRadius: 1,
    minHeight: 3,
  },
  metaRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  duration: {
    fontSize: typography.timeStatus,
    color: 'rgba(96, 87, 25, 0.78)',
    minWidth: 36,
  },
  durationMe: {
    color: colors.textSecondaryMuted,
  },
});
