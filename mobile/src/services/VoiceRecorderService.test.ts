/**
 * Unit tests for VoiceRecorderService.
 * Focus: dbToNormalized logic (0 at -160dB, 1 at 0dB, clamping).
 * Run: npx tsx src/services/VoiceRecorderService.test.ts
 * Native recording (expo-av) requires device; not tested here.
 */

import {
  buildUiWaveform,
  dbToNormalized,
  resampleWaveform,
  smoothWaveform,
} from './waveformUtils';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function assertClose(actual: number, expected: number, tolerance: number, msg: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg}: expected ${expected} +/- ${tolerance}, got ${actual}`);
  }
}

function runTests(): void {
  // 0 at -160 dB (minimum/silence)
  assert(dbToNormalized(-160) === 0, 'dbToNormalized(-160) should be 0');

  // 1 at 0 dB (maximum)
  assert(dbToNormalized(0) === 1, 'dbToNormalized(0) should be 1');

  // 0.5 at -80 dB (midpoint)
  assert(dbToNormalized(-80) === 0.5, 'dbToNormalized(-80) should be 0.5');

  // Clamp below -160
  assert(dbToNormalized(-200) === 0, 'dbToNormalized(-200) should clamp to 0');
  assert(dbToNormalized(-161) === 0, 'dbToNormalized(-161) should clamp to 0');

  // Clamp above 0
  assert(dbToNormalized(10) === 1, 'dbToNormalized(10) should clamp to 1');
  assert(dbToNormalized(1) === 1, 'dbToNormalized(1) should clamp to 1');

  // undefined
  assert(dbToNormalized(undefined) === 0, 'dbToNormalized(undefined) should be 0');

  // NaN and non-finite
  assert(dbToNormalized(NaN) === 0, 'dbToNormalized(NaN) should be 0');
  assert(dbToNormalized(Infinity) === 0, 'dbToNormalized(Infinity) should be 0');
  assert(dbToNormalized(-Infinity) === 0, 'dbToNormalized(-Infinity) should be 0');

  // Linear interpolation
  assertClose(dbToNormalized(-120), 0.25, 1e-5, 'dbToNormalized(-120)');
  assertClose(dbToNormalized(-40), 0.75, 1e-5, 'dbToNormalized(-40)');

  // Resample keeps requested size
  const resampled = resampleWaveform([0, 0.2, 0.4, 0.6, 0.8, 1], 3);
  assert(resampled.length === 3, 'resampleWaveform should return target length');
  assert(resampled.every((v) => v >= 0 && v <= 1), 'resampleWaveform values should stay in 0..1');

  // Smooth reduces harsh central spike
  const smoothed = smoothWaveform([0, 0, 1, 0, 0], 1);
  assert(smoothed[2] < 1, 'smoothWaveform should soften a peak');
  assert(smoothed[2] > smoothed[1], 'smoothed center should remain higher than neighbors');

  // Full UI waveform pipeline returns visible bars
  const uiWaveform = buildUiWaveform([0, 0.1, 0.4, 0.8, 0.3, 0.05], 8);
  assert(uiWaveform.length === 8, 'buildUiWaveform should return target length');
  assert(uiWaveform.every((v) => v >= 0.04 && v <= 1), 'buildUiWaveform should clamp to visible floor');

  console.log('VoiceRecorderService dbToNormalized: all tests passed');
}

runTests();
