/**
 * useVoiceRecordGesture - Hold-to-record gesture for voice messages.
 * Long press = start recording, release = send, swipe left = cancel.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import {
  VoiceRecorderService,
  type VoiceRecordingResult,
} from '../services/VoiceRecorderService';

const SWIPE_CANCEL_THRESHOLD = 60;

export interface UseVoiceRecordGestureOptions {
  onSend: (result: VoiceRecordingResult) => void | Promise<void>;
  onRecordingStart?: () => void;
  onRecordingCancel?: () => void;
  enabled?: boolean;
}

export function useVoiceRecordGesture(options: UseVoiceRecordGestureOptions) {
  const {
    onSend,
    onRecordingStart,
    onRecordingCancel,
    enabled = true,
  } = options;

  const cancelled = useSharedValue(false);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const isRecordingRef = useRef(false);
  const pendingEndRef = useRef<{ cancelled: boolean } | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (isRecordingRef.current) {
        VoiceRecorderService.stopRecording().catch(() => {});
      }
    };
  }, []);

  const finishRecording = useCallback(
    async (didCancel: boolean) => {
      if (!isRecordingRef.current) return;
      isRecordingRef.current = false;
      try {
        const result = await VoiceRecorderService.stopRecording();
        if (!isMountedRef.current) return;
        if (didCancel) {
          onRecordingCancel?.();
        } else {
          await onSend(result);
        }
      } catch {
        if (isMountedRef.current) onRecordingCancel?.();
      }
    },
    [onSend, onRecordingCancel]
  );

  const startRecordingFn = useCallback(() => {
    cancelled.value = false;
    const promise = (async () => {
      try {
        await VoiceRecorderService.startRecording();
        isRecordingRef.current = true;
        onRecordingStart?.();

        const pending = pendingEndRef.current;
        if (pending) {
          pendingEndRef.current = null;
          finishRecording(pending.cancelled);
        }
      } catch {
        onRecordingCancel?.();
      }
    })();
    startPromiseRef.current = promise;
  }, [onRecordingStart, onRecordingCancel, finishRecording]);

  const handleLongPressEnd = useCallback(
    async (wasCancelled: boolean) => {
      const promise = startPromiseRef.current;
      if (!promise) {
        pendingEndRef.current = { cancelled: wasCancelled };
        return;
      }
      startPromiseRef.current = null;

      try {
        await promise;
      } catch {
        return;
      }

      if (!isRecordingRef.current) return;

      finishRecording(wasCancelled);
    },
    [finishRecording]
  );

  const gesture = useMemo(() => {
    if (!enabled) {
      return Gesture.Tap();
    }

    const longPress = Gesture.LongPress()
      .minDuration(400)
      .onStart(() => {
        cancelled.value = false;
        runOnJS(startRecordingFn)();
      })
      .onEnd(() => {
        const wasCancelled = cancelled.value;
        runOnJS(handleLongPressEnd)(wasCancelled);
      });

    const pan = Gesture.Pan().onUpdate((e) => {
      if (e.translationX < -SWIPE_CANCEL_THRESHOLD) {
        cancelled.value = true;
      }
    });

    return Gesture.Simultaneous(longPress, pan);
  }, [enabled, startRecordingFn, handleLongPressEnd]);

  return { gesture };
}
