/**
 * VoicePlayerContext - Global singleton voice player via React Context.
 * One voice at a time. UI re-renders when playback status changes.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  VoicePlayerService,
  type VoicePlayerStatus,
} from '../services/VoicePlayerService';

type VoicePlayerContextType = {
  play: (uri: string) => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  currentVoiceUri: string | null;
  status: VoicePlayerStatus;
};

const VoicePlayerContext = createContext<VoicePlayerContextType | null>(null);

export function VoicePlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentVoiceUri, setCurrentVoiceUri] = useState<string | null>(null);
  const [status, setStatus] = useState<VoicePlayerStatus>(() =>
    VoicePlayerService.getStatus()
  );

  useEffect(() => {
    const listener = (s: VoicePlayerStatus) => setStatus(s);
    VoicePlayerService.addStatusListener(listener);
    return () => VoicePlayerService.removeStatusListener(listener);
  }, []);

  const play = useCallback(async (uri: string) => {
    setCurrentVoiceUri(uri);
    try {
      await VoicePlayerService.play(uri);
    } catch (err) {
      setCurrentVoiceUri(null);
      throw err;
    }
  }, []);

  const pause = useCallback(async () => {
    await VoicePlayerService.pause();
  }, []);

  const stop = useCallback(async () => {
    await VoicePlayerService.stop();
    setCurrentVoiceUri(null);
  }, []);

  const value: VoicePlayerContextType = {
    play,
    pause,
    stop,
    currentVoiceUri,
    status,
  };

  return (
    <VoicePlayerContext.Provider value={value}>
      {children}
    </VoicePlayerContext.Provider>
  );
}

export function useVoicePlayer(): VoicePlayerContextType {
  const ctx = useContext(VoicePlayerContext);
  if (!ctx) {
    throw new Error('useVoicePlayer must be used within VoicePlayerProvider');
  }
  return ctx;
}
