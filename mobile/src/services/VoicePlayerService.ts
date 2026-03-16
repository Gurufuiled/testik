/**
 * VoicePlayerService - Plays voice messages using expo-av.
 * Single sound at a time. Loading new URI stops and unloads previous.
 */

import { Audio } from 'expo-av';
import type { AVPlaybackStatus } from 'expo-av';

const PROGRESS_UPDATE_INTERVAL_MS = 250;

export interface VoicePlayerStatus {
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
}

export type VoicePlayerStatusListener = (status: VoicePlayerStatus) => void;

class VoicePlayerServiceClass {
  private soundRef: Audio.Sound | null = null;
  private playPromise: Promise<void> = Promise.resolve();
  private statusListeners = new Set<VoicePlayerStatusListener>();
  private lastStatus: VoicePlayerStatus = {
    positionMs: 0,
    durationMs: 0,
    isPlaying: false,
  };

  /** Ensure audio mode allows playback (plays in silent mode on iOS). */
  private async ensureAudioMode(): Promise<void> {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  }

  /** Stop and unload current sound if any. */
  private async stopAndUnloadCurrent(): Promise<void> {
    const sound = this.soundRef;
    if (!sound) return;

    try {
      await sound.unloadAsync();
    } catch {
      // Ignore unload errors (e.g. already unloaded)
    }
    this.soundRef = null;
    this.lastStatus = { positionMs: 0, durationMs: 0, isPlaying: false };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const status = { ...this.lastStatus };
    this.statusListeners.forEach((cb) => cb(status));
  }

  addStatusListener(cb: VoicePlayerStatusListener): void {
    this.statusListeners.add(cb);
  }

  removeStatusListener(cb: VoicePlayerStatusListener): void {
    this.statusListeners.delete(cb);
  }

  private handlePlaybackStatusUpdate = (status: AVPlaybackStatus): void => {
    if (!status.isLoaded) return;

    this.lastStatus = {
      positionMs: status.positionMillis ?? 0,
      durationMs: status.durationMillis ?? 0,
      isPlaying: status.isPlaying ?? false,
    };
    this.notifyListeners();
  };

  /**
   * Load and play a voice message from URI.
   * Stops and unloads any previously playing sound.
   * Serialized to avoid race when play() is called concurrently.
   */
  async play(uri: string): Promise<void> {
    const previous = this.playPromise;
    this.playPromise = (async () => {
      await previous;
      await this.stopAndUnloadCurrent();
      await this.ensureAudioMode();

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        {
          shouldPlay: true,
          progressUpdateIntervalMillis: PROGRESS_UPDATE_INTERVAL_MS,
        },
        this.handlePlaybackStatusUpdate,
        false
      );

      this.soundRef = sound;
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        this.lastStatus = {
          positionMs: status.positionMillis ?? 0,
          durationMs: status.durationMillis ?? 0,
          isPlaying: status.isPlaying ?? false,
        };
        this.notifyListeners();
      }
    })();
    return this.playPromise;
  }

  /** Pause current playback. */
  async pause(): Promise<void> {
    const sound = this.soundRef;
    if (!sound) return;

    try {
      await sound.pauseAsync();
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        this.lastStatus.isPlaying = false;
        this.lastStatus.positionMs = status.positionMillis ?? 0;
        this.notifyListeners();
      }
    } catch {
      this.soundRef = null;
      this.lastStatus = { positionMs: 0, durationMs: 0, isPlaying: false };
      throw new Error('Failed to pause playback');
    }
  }

  /** Stop current playback and unload. */
  async stop(): Promise<void> {
    await this.stopAndUnloadCurrent();
  }

  /** Get current playback status (position, duration, isPlaying). */
  getStatus(): VoicePlayerStatus {
    return { ...this.lastStatus };
  }

  /** Check if any sound is currently loaded. */
  hasActiveSound(): boolean {
    return this.soundRef != null;
  }
}

export const VoicePlayerService = new VoicePlayerServiceClass();
