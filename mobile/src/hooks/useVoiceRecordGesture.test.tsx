/**
 * Tests for useVoiceRecordGesture.
 * Scope: TypeScript compiles, hook returns valid gesture object, GestureDetector integration.
 * Run: npx tsc --noEmit (compile) + npm run test:voice-gesture (type-integration)
 *
 * Note: Full gesture testing requires device/simulator. This focuses on compile and type integration.
 */

import React from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import {
  useVoiceRecordGesture,
  type UseVoiceRecordGestureOptions,
} from './useVoiceRecordGesture';

// --- Type-integration: hook return type is compatible with GestureDetector ---

function TestComponent() {
  const onSend = async () => {};
  const { gesture } = useVoiceRecordGesture({ onSend });

  // gesture must be assignable to GestureDetector's gesture prop
  return (
    <GestureDetector gesture={gesture}>
      <View />
    </GestureDetector>
  );
}

// --- Type check: options interface ---

function assertOptionsShape(): UseVoiceRecordGestureOptions {
  return {
    onSend: async () => {},
    onRecordingStart: () => {},
    onRecordingCancel: () => {},
    enabled: true,
  };
}

// This file is a type-integration test: tsc --noEmit verifies that
// 1) useVoiceRecordGesture returns { gesture } compatible with GestureDetector
// 2) UseVoiceRecordGestureOptions has correct shape
