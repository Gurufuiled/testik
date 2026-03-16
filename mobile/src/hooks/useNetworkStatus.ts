/**
 * useNetworkStatus - Network connectivity detection for sync/offline flow.
 * Uses @react-native-community/netinfo for cross-platform network state.
 */

import { useEffect, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export interface NetworkStatus {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

export function useNetworkStatus(): NetworkStatus {
  const [state, setState] = useState<NetworkStatus>({
    isConnected: null,
    isInternetReachable: null,
  });

  useEffect(() => {
    let isMounted = true;

    const updateState = (netState: NetInfoState) => {
      if (!isMounted) return;
      setState({
        isConnected: netState?.isConnected ?? null,
        isInternetReachable: netState?.isInternetReachable ?? null,
      });
    };

    NetInfo.fetch()
      .then((netState) => updateState(netState))
      .catch(() => {});

    const unsubscribe = NetInfo.addEventListener(updateState);

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return state;
}
