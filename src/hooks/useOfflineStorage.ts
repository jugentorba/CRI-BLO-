import { useState, useCallback } from 'react';
import { StoredIntervention, StoredPhoto } from '@/lib/storage/database';
import { offlineStorageService } from '@/lib/storage/OfflineStorageService';

export interface UseOfflineStorageResult {
  // Interventions
  createIntervention: (data: Record<string, any>) => Promise<StoredIntervention>;
  getIntervention: (id: string) => Promise<StoredIntervention | undefined>;
  updateIntervention: (id: string, data: any) => Promise<void>;
  getAllInterventions: () => Promise<StoredIntervention[]>;
  deleteIntervention: (id: string) => Promise<void>;

  // Photos
  savePhoto: (
    interventionId: string,
    photoData: any
  ) => Promise<StoredPhoto>;
  getPhotosForIntervention: (interventionId: string) => Promise<StoredPhoto[]>;
  deletePhoto: (photoId: string) => Promise<void>;

  // Sync
  getPendingSync: () => Promise<any[]>;
  markSyncSucceeded: (queueId: string, dataId: string, type: any) => Promise<void>;
  markSyncFailed: (queueId: string, error: string) => Promise<void>;

  // Stats
  getStorageStats: () => Promise<any>;

  isLoading: boolean;
  error: Error | null;
}

export function useOfflineStorage(): UseOfflineStorageResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const wrapAsync = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        setIsLoading(true);
        setError(null);
        return await fn();
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Storage error');
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    createIntervention: (data) =>
      wrapAsync(() => offlineStorageService.createIntervention(data)),
    getIntervention: (id) =>
      wrapAsync(() => offlineStorageService.getIntervention(id)),
    updateIntervention: (id, data) =>
      wrapAsync(() => offlineStorageService.updateIntervention(id, data)),
    getAllInterventions: () =>
      wrapAsync(() => offlineStorageService.getAllInterventions()),
    deleteIntervention: (id) =>
      wrapAsync(() => offlineStorageService.deleteIntervention(id)),
    savePhoto: (interventionId, photoData) =>
      wrapAsync(() => offlineStorageService.savePhoto(interventionId, photoData)),
    getPhotosForIntervention: (interventionId) =>
      wrapAsync(() => offlineStorageService.getPhotosForIntervention(interventionId)),
    deletePhoto: (photoId) =>
      wrapAsync(() => offlineStorageService.deletePhoto(photoId)),
    getPendingSync: () =>
      wrapAsync(() => offlineStorageService.getPendingSyncQueue()),
    markSyncSucceeded: (queueId, dataId, type) =>
      wrapAsync(() =>
        offlineStorageService.markSyncSucceeded(queueId, dataId, type)
      ),
    markSyncFailed: (queueId, error) =>
      wrapAsync(() => offlineStorageService.markSyncFailed(queueId, error)),
    getStorageStats: () =>
      wrapAsync(() => offlineStorageService.getStorageStats()),
    isLoading,
    error,
  };
}

export default useOfflineStorage;