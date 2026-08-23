import { useState, useEffect, useCallback } from 'react';
import { networkService, NetworkStatus } from '@/lib/sync/NetworkService';
import { offlineStorageService } from '@/lib/storage/OfflineStorageService';

export interface UseSyncResult {
  networkStatus: NetworkStatus;
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  syncProgress: { current: number; total: number } | null;
  error: Error | null;
  manualSync: () => Promise<void>;
  waitForNetwork: () => Promise<void>;
}

export function useSync(): UseSyncResult {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>('unknown');
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Monitor network status
  useEffect(() => {
    const unsubscribe = networkService.onStatusChange((status) => {
      setNetworkStatus(status);
    });

    return unsubscribe;
  }, []);

  // Monitor pending sync count
  useEffect(() => {
    const checkPending = async () => {
      const queue = await offlineStorageService.getPendingSync();
      setPendingSyncCount(queue.length);
    };

    checkPending();
    const interval = setInterval(checkPending, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const manualSync = useCallback(async () => {
    if (!networkStatus.isOnline()) {
      setError(new Error('No network connection'));
      return;
    }

    setIsSyncing(true);
    setError(null);

    try {
      // This will be called by the sync manager
      // For now, just update UI state
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Sync failed');
      setError(error);
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  }, [networkStatus]);

  const waitForNetwork = useCallback(async () => {
    if (networkStatus.isOnline()) {
      return;
    }
    await networkService.waitForOnline();
  }, [networkStatus]);

  return {
    networkStatus,
    isOnline: networkStatus === 'online',
    pendingSyncCount,
    isSyncing,
    syncProgress,
    error,
    manualSync,
    waitForNetwork,
  };
}

export default useSync;