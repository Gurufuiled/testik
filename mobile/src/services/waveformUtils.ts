/**
 * Pure waveform utilities. No RN/expo deps вЂ” safe for unit tests in Node.
 */

const METERING_MIN_DB = -160;
const METERING_MAX_DB = 0;

/** Maps dB metering (-160..0) to 0..1. 0 at -160dB (silence), 1 at 0dB (max). */
export function dbToNormalized(metering: number | undefined): number {
  if (metering == null || !Number.isFinite(metering)) return 0;
  const clamped = Math.max(METERING_MIN_DB, Math.min(METERING_MAX_DB, metering));
  return (clamped - METERING_MIN_DB) / (METERING_MAX_DB - METERING_MIN_DB);
}
