import { db, StoredIntervention, StoredPhoto, SyncQueue } from './database';
import { nanoid } from 'nanoid';

class OfflineStorageService {
  /**
   * Create new intervention locally
   */
  async createIntervention(
    data: Record<string, any>
  ): Promise<StoredIntervention> {
    const now = Date.now();
    const intervention: StoredIntervention = {
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
      status: 'draft',
      data,
    };

    await db.interventions.add(intervention);
    return intervention;
  }

  /**
   * Update intervention
   */
  async updateIntervention(
    id: string,
    data: Partial<StoredIntervention>
  ): Promise<void> {
    await db.interventions.update(id, {
      ...data,
      updatedAt: Date.now(),
    });
  }

  /**
   * Get intervention by ID
   */
  async getIntervention(id: string): Promise<StoredIntervention | undefined> {
    return db.interventions.get(id);
  }

  /**
   * Get all interventions
   */
  async getAllInterventions(): Promise<StoredIntervention[]> {
    return db.interventions.toArray();
  }

  /**
   * Get interventions by status
   */
  async getInterventionsByStatus(
    status: StoredIntervention['status']
  ): Promise<StoredIntervention[]> {
    return db.interventions.where('status').equals(status).toArray();
  }

  /**
   * Delete intervention and all associated photos
   */
  async deleteIntervention(id: string): Promise<void> {
    // Delete photos
    const photos = await db.photos
      .where('interventionId')
      .equals(id)
      .toArray();
    
    for (const photo of photos) {
      await db.photos.delete(photo.id);
    }

    // Delete intervention
    await db.interventions.delete(id);

    // Remove from sync queue
    await db.syncQueue
      .where('interventionId')
      .equals(id)
      .delete();
  }

  /**
   * Save photo for intervention
   */
  async savePhoto(
    interventionId: string,
    photoData: {
      base64: string;
      timestamp: number;
      coordinates?: any;
      address?: string;
      section?: string;
    }
  ): Promise<StoredPhoto> {
    const photo: StoredPhoto = {
      id: nanoid(),
      interventionId,
      base64: photoData.base64,
      metadata: {
        timestamp: photoData.timestamp,
        coordinates: photoData.coordinates,
        address: photoData.address,
        section: photoData.section,
      },
      createdAt: Date.now(),
      status: 'local',
    };

    await db.photos.add(photo);
    return photo;
  }

  /**
   * Get all photos for intervention
   */
  async getPhotosForIntervention(
    interventionId: string
  ): Promise<StoredPhoto[]> {
    return db.photos
      .where('interventionId')
      .equals(interventionId)
      .toArray();
  }

  /**
   * Update photo with watermarked version
   */
  async updatePhotoWatermark(
    photoId: string,
    watermarked: string
  ): Promise<void> {
    await db.photos.update(photoId, {
      watermarked,
      watermarkedSyncedAt: undefined, // Reset sync status
    });
  }

  /**
   * Delete photo
   */
  async deletePhoto(photoId: string): Promise<void> {
    await db.photos.delete(photoId);
  }

  /**
   * Add to sync queue
   */
  async addToSyncQueue(
    interventionId: string,
    type: 'intervention' | 'photo',
    dataId: string
  ): Promise<SyncQueue> {
    const item: SyncQueue = {
      id: nanoid(),
      interventionId,
      type,
      dataId,
      attempts: 0,
      nextRetry: Date.now(),
      createdAt: Date.now(),
    };

    await db.syncQueue.add(item);
    return item;
  }

  /**
   * Get pending sync queue
   */
  async getPendingSyncQueue(): Promise<SyncQueue[]> {
    return db.syncQueue
      .where('nextRetry')
      .below(Date.now())
      .toArray();
  }

  /**
   * Mark sync item as succeeded
   */
  async markSyncSucceeded(
    queueId: string,
    dataId: string,
    type: 'intervention' | 'photo'
  ): Promise<void> {
    // Remove from queue
    await db.syncQueue.delete(queueId);

    // Update status in intervention/photo
    if (type === 'intervention') {
      await db.interventions.update(dataId, {
        status: 'synced',
        syncedAt: Date.now(),
      });
    } else if (type === 'photo') {
      await db.photos.update(dataId, {
        status: 'synced',
        syncedAt: Date.now(),
      });
    }
  }

  /**
   * Mark sync item as failed with exponential backoff
   */
  async markSyncFailed(
    queueId: string,
    error: string
  ): Promise<void> {
    const item = await db.syncQueue.get(queueId);
    if (!item) return;

    const newAttempts = item.attempts + 1;
    const backoffMs = Math.min(1000 * Math.pow(2, newAttempts), 3600000); // Max 1 hour

    await db.syncQueue.update(queueId, {
      attempts: newAttempts,
      lastAttempt: Date.now(),
      nextRetry: Date.now() + backoffMs,
      error,
    });
  }

  /**
   * Clear old synced data (retention policy)
   */
  async clearOldSyncedData(retentionDays: number = 30): Promise<number> {
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    // Clear old synced interventions
    const oldInterventions = await db.interventions
      .where('syncedAt')
      .below(cutoffTime)
      .toArray();

    for (const intervention of oldInterventions) {
      await this.deleteIntervention(intervention.id);
      deletedCount++;
    }

    return deletedCount;
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    interventions: number;
    photos: number;
    pendingSync: number;
    totalSize: number;
  }> {
    const interventions = await db.interventions.count();
    const photos = await db.photos.count();
    const pendingSync = await db.syncQueue.count();

    // Estimate size (rough calculation)
    const allPhotos = await db.photos.toArray();
    let totalSize = 0;
    for (const photo of allPhotos) {
      totalSize += photo.base64.length; // Approximate
    }

    return {
      interventions,
      photos,
      pendingSync,
      totalSize,
    };
  }

  /**
   * Export all local data as JSON (for debugging/backup)
   */
  async exportAllData(): Promise<{
    interventions: StoredIntervention[];
    photos: StoredPhoto[];
    syncQueue: SyncQueue[];
  }> {
    return {
      interventions: await db.interventions.toArray(),
      photos: await db.photos.toArray(),
      syncQueue: await db.syncQueue.toArray(),
    };
  }
}

export const offlineStorageService = new OfflineStorageService();
export default OfflineStorageService;