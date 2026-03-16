/**
 * VideoNoteRecorder - Modal for recording video notes (front camera, max 60s).
 * Tap to start/stop recording, cancel to dismiss without sending.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type {
  VideoNoteRecordingResult,
  VideoNoteCameraRef,
} from '../services/VideoNoteRecorderService';
import {
  VideoNoteRecorderService,
  MAX_DURATION_SECONDS,
} from '../services/VideoNoteRecorderService';

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface VideoNoteRecorderProps {
  visible: boolean;
  onComplete: (result: VideoNoteRecordingResult) => void | Promise<void>;
  onCancel: () => void;
}

export function VideoNoteRecorder({
  visible,
  onComplete,
  onCancel,
}: VideoNoteRecorderProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const cameraRef = useRef<VideoNoteCameraRef | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStoppingRef = useRef(false);
  const cancelledRef = useRef(false);

  const setCameraRef = useCallback((instance: VideoNoteCameraRef | null) => {
    cameraRef.current = instance;
    VideoNoteRecorderService.setCameraRef(instance);
  }, []);

  useEffect(() => {
    if (visible) cancelledRef.current = false;
  }, [visible]);

  useEffect(() => {
    return () => {
      VideoNoteRecorderService.setCameraRef(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    setElapsedSec(0);
    timerRef.current = setInterval(() => {
      setElapsedSec((prev) => {
        const next = prev + 1;
        if (next >= MAX_DURATION_SECONDS && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return next;
      });
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsedSec(0);
  }, []);

  const handleRecordPress = useCallback(async () => {
    if (isRecording) {
      if (isStoppingRef.current) return;
      isStoppingRef.current = true;
      try {
        const result = await VideoNoteRecorderService.stopRecording();
        stopTimer();
        setIsRecording(false);
        if (cancelledRef.current) return;
        await onComplete(result);
      } catch {
        stopTimer();
        setIsRecording(false);
        Alert.alert('Error', 'Failed to save recording');
      } finally {
        isStoppingRef.current = false;
      }
      return;
    }

    try {
      await VideoNoteRecorderService.startRecording();
      setIsRecording(true);
      startTimer();
    } catch {
      Alert.alert('Error', 'Failed to start recording');
    }
  }, [isRecording, onComplete, startTimer, stopTimer]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    if (isRecording) {
      VideoNoteRecorderService.stopRecording().catch(() => {});
      stopTimer();
      setIsRecording(false);
    }
    onCancel();
  }, [isRecording, onCancel, stopTimer]);

  useEffect(() => {
    if (isRecording && elapsedSec >= MAX_DURATION_SECONDS) {
      handleRecordPress();
    }
  }, [isRecording, elapsedSec, handleRecordPress]);

  if (!permission) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
        <View style={styles.container}>
          <Text style={styles.permissionText}>
            Camera permission is required for video notes
          </Text>
          <Pressable style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant permission</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleCancel}>
      <View style={styles.container}>
        {visible ? (
          <CameraView
            ref={setCameraRef}
            style={styles.camera}
            facing="front"
            mode="video"
          />
        ) : (
          <View style={styles.camera} />
        )}
        {isRecording && (
          <View style={styles.timerOverlay}>
            <Text style={styles.timerText}>{formatTimer(elapsedSec)}</Text>
          </View>
        )}
        <View style={styles.controls}>
          <Pressable style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.recordButton, isRecording && styles.recordButtonActive]}
            onPress={handleRecordPress}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
          >
            <View
              style={[
                styles.recordInner,
                isRecording && styles.recordInnerActive,
              ]}
            />
          </Pressable>
          <View style={styles.placeholder} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: 'center',
    marginBottom: 16,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  timerOverlay: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  timerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 24,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonActive: {
    backgroundColor: 'rgba(255,59,48,0.5)',
  },
  recordInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ff3b30',
  },
  recordInnerActive: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  placeholder: {
    width: 80,
  },
});
