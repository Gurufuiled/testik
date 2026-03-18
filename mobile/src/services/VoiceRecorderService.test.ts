/**
 * Unit tests for VoiceRecorderService.
 * Focus: dbToNormalized logic (0 at -160dB, 1 at 0dB, clamping).
 * Run: npx tsx src/services/VoiceRecorderService.test.ts
 * Native recording (expo-av) requires device; not tested here.
 */

import { dbToNormalized } from './waveformUtils';

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

  console.log('VoiceRecorderService dbToNormalized: all tests passed');
}

runTests();
