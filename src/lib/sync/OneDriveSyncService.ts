import { MSALPublicClientApplication } from '@azure/msal-browser';
import { offlineStorageService } from '@/lib/storage/OfflineStorageService';
import { StoredIntervention, StoredPhoto } from '@/lib/storage/database';

interface OneDriveConfig {
  clientId: string;
  authority: string;
  scopes: string[];
}

class OneDriveSyncService {
  private msalInstance: MSALPublicClientApplication | null = null;
  private config: OneDriveConfig;
  private accessToken: string | null = null;
  private syncInProgress = false;

  constructor(config: OneDriveConfig) {
    this.config = config;
  }

  /**
   * Initialize MSAL for OneDrive auth
   */
  async initialize(msalInstance: MSALPublicClientApplication): Promise<void> {
    this.msalInstance = msalInstance;
    try {
      const result = await msalInstance.acquireTokenSilent({
        scopes: this.config.scopes,
      });
      this.accessToken = result.accessToken;
    } catch (error) {
      console.warn('Silent token acquisition failed, will use interactive:', error);
    }
  }

  /**
   * Get valid access token
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken;
    }

    if (!this.msalInstance) {
      throw new Error('MSAL not initialized');
    }

    try {
      const result = await this.msalInstance.acquireTokenPopup({
        scopes: this.config.scopes,
      });
      this.accessToken = result.accessToken;
      return this.accessToken;
    } catch (error) {
      throw new Error('Failed to acquire access token');
    }
  }

  /**
   * Sync all pending items
   */
  async syncPendingItems(
    onProgress?: (current: number, total: number) => void
  ): Promise<{ succeeded: number; failed: number }> {
    if (this.syncInProgress) {
      console.warn('Sync already in progress');
      return { succeeded: 0, failed: 0 };
    }

    this.syncInProgress = true;
    let succeeded = 0;
    let failed = 0;

    try {
      const token = await this.getAccessToken();
      const pendingQueue = await offlineStorageService.getPendingSyncQueue();

      for (let i = 0; i < pendingQueue.length; i++) {
        const item = pendingQueue[i];

        try {
          if (item.type === 'intervention') {
            const intervention = await offlineStorageService.getIntervention(
              item.dataId
            );
            if (intervention) {
              await this.syncIntervention(intervention, token);
              await offlineStorageService.markSyncSucceeded(
                item.id,
                item.dataId,
                'intervention'
              );
              succeeded++;
            }
          } else if (item.type === 'photo') {
            const photos = await offlineStorageService.getPhotosForIntervention(
              item.interventionId
            );
            const photo = photos.find((p) => p.id === item.dataId);
            if (photo) {
              await this.syncPhoto(photo, token);
              await offlineStorageService.markSyncSucceeded(
                item.id,
                item.dataId,
                'photo'
              );
              succeeded++;
            }
          }
        } catch (error) {
          failed++;
          const errorMsg =
            error instanceof Error ? error.message : 'Unknown error';
          await offlineStorageService.markSyncFailed(item.id, errorMsg);
        }

        onProgress?.(i + 1, pendingQueue.length);
      }
    } finally {
      this.syncInProgress = false;
    }

    return { succeeded, failed };
  }

  /**
   * Sync single intervention
   */
  private async syncIntervention(
    intervention: StoredIntervention,
    token: string
  ): Promise<void> {
    const url = 'https://graph.microsoft.com/v1.0/me/drive/root/children';

    const fileName = `intervention_${intervention.id}.json`;
    const fileContent = JSON.stringify(intervention.data);

    // Check if file exists and delete it (to avoid duplicates)
    try {
      const searchUrl = `https://graph.microsoft.com/v1.0/me/drive/root/children?$filter=name eq '${fileName}'`;
      const searchResponse = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.value && searchData.value.length > 0) {
          const fileId = searchData.value[0].id;
          await fetch(
            `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );
        }
      }
    } catch (error) {
      console.warn('Failed to check for existing file:', error);
    }

    // Upload file
    const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${fileName}:/content`;
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: fileContent,
    });

    if (!response.ok) {
      throw new Error(`Failed to sync intervention: ${response.statusText}`);
    }
  }

  /**
   * Sync single photo
   */
  private async syncPhoto(
    photo: StoredPhoto,
    token: string
  ): Promise<void> {
    if (!photo.watermarked) {
      throw new Error('Photo must be watermarked before syncing');
    }

    const fileName = `photo_${photo.id}.jpg`;

    // Check if exists and delete
    try {
      const searchUrl = `https://graph.microsoft.com/v1.0/me/drive/root/children?$filter=name eq '${fileName}'`;
      const searchResponse = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.value && searchData.value.length > 0) {
          const fileId = searchData.value[0].id;
          await fetch(
            `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );
        }
      }
    } catch (error) {
      console.warn('Failed to check for existing photo:', error);
    }

    // Upload photo
    const base64Data = photo.watermarked.split(',')[1];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${fileName}:/content`;
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'image/jpeg',
      },
      body: bytes,
    });

    if (!response.ok) {
      throw new Error(`Failed to sync photo: ${response.statusText}`);
    }
  }

  /**
   * Get sync status
   */
  isSyncing(): boolean {
    return this.syncInProgress;
  }
}

export default OneDriveSyncService;