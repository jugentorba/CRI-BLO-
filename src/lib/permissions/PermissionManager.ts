import { Permissions, PermissionStatus } from '@capacitor/core';
import { Platform } from '@ionic/react';

export type PermissionType = 'camera' | 'geolocation' | 'microphone';

export interface PermissionRequest {
  type: PermissionType;
  critical: boolean;
  description: string;
  retryable: boolean;
}

interface PermissionState {
  camera: PermissionStatus | null;
  geolocation: PermissionStatus | null;
  microphone: PermissionStatus | null;
}

class PermissionManager {
  private permissions: PermissionState = {
    camera: null,
    geolocation: null,
    microphone: null,
  };

  private listeners: Map<string, (status: PermissionStatus) => void> = new Map();

  /**
   * Request permissions sequentially to prevent dialog conflicts
   * Critical permissions block if denied, non-critical continue
   */
  async requestPermissionsSequentially(
    requests: PermissionRequest[]
  ): Promise<Map<PermissionType, PermissionStatus>> {
    const results = new Map<PermissionType, PermissionStatus>();

    for (const request of requests) {
      try {
        const status = await this.requestSinglePermission(request);
        results.set(request.type, status);

        // If critical permission denied, stop and throw
        if (request.critical && status.state === 'denied') {
          throw new Error(
            `Critical permission denied: ${request.type}. Cannot continue.`
          );
        }
      } catch (error) {
        console.error(`Permission request failed: ${request.type}`, error);
        if (request.critical) {
          throw error;
        }
        // Continue with non-critical permissions
      }

      // Small delay between requests to prevent dialog overlap
      await this.delay(500);
    }

    return results;
  }

  /**
   * Request single permission with native Android dialog
   */
  private async requestSinglePermission(
    request: PermissionRequest
  ): Promise<PermissionStatus> {
    let status: PermissionStatus;

    switch (request.type) {
      case 'camera':
        status = await Permissions.query({ name: 'Camera' });
        if (status.state !== 'granted') {
          status = await Permissions.requestPermission({ name: 'Camera' });
        }
        break;

      case 'geolocation':
        status = await Permissions.query({ name: 'Geolocation' });
        if (status.state !== 'granted') {
          status = await Permissions.requestPermission({
            name: 'Geolocation',
          });
        }
        break;

      case 'microphone':
        status = await Permissions.query({ name: 'Microphone' });
        if (status.state !== 'granted') {
          status = await Permissions.requestPermission({ name: 'Microphone' });
        }
        break;

      default:
        throw new Error(`Unknown permission type: ${request.type}`);
    }

    this.permissions[request.type] = status;
    this.notifyListeners(request.type, status);

    return status;
  }

  /**
   * Check permission status without requesting
   */
  async checkPermission(type: PermissionType): Promise<PermissionStatus> {
    let status: PermissionStatus;

    switch (type) {
      case 'camera':
        status = await Permissions.query({ name: 'Camera' });
        break;
      case 'geolocation':
        status = await Permissions.query({ name: 'Geolocation' });
        break;
      case 'microphone':
        status = await Permissions.query({ name: 'Microphone' });
        break;
    }

    this.permissions[type] = status;
    return status;
  }

  /**
   * Retry permission after user denies it
   */
  async retryPermission(request: PermissionRequest): Promise<PermissionStatus> {
    if (!request.retryable) {
      throw new Error(`Permission ${request.type} cannot be retried`);
    }

    return this.requestSinglePermission(request);
  }

  /**
   * Get cached permission status
   */
  getPermissionStatus(type: PermissionType): PermissionStatus | null {
    return this.permissions[type];
  }

  /**
   * Check if permission is granted
   */
  isGranted(type: PermissionType): boolean {
    return this.permissions[type]?.state === 'granted' ?? false;
  }

  /**
   * Subscribe to permission changes
   */
  onPermissionChange(
    type: PermissionType,
    callback: (status: PermissionStatus) => void
  ): () => void {
    const key = `${type}:change`;
    this.listeners.set(key, callback);

    return () => {
      this.listeners.delete(key);
    };
  }

  private notifyListeners(
    type: PermissionType,
    status: PermissionStatus
  ): void {
    const key = `${type}:change`;
    const listener = this.listeners.get(key);
    if (listener) {
      listener(status);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get human-readable permission description
   */
  static getPermissionDescription(type: PermissionType): string {
    const descriptions: Record<PermissionType, string> = {
      camera: 'Camera access is required to capture evidence photos',
      geolocation: 'Location access is needed to tag interventions with GPS coordinates',
      microphone: 'Microphone access allows voice notes during interventions',
    };

    return descriptions[type];
  }

  /**
   * Get user-friendly permission status message
   */
  static getStatusMessage(
    type: PermissionType,
    status: PermissionStatus
  ): string {
    switch (status.state) {
      case 'granted':
        return `${type} permission granted`;
      case 'denied':
        return `${type} permission denied. Some features may not work.`;
      case 'prompt':
        return `${type} permission needs to be requested`;
      default:
        return `Unknown status for ${type}`;
    }
  }
}

export const permissionManager = new PermissionManager();
export default PermissionManager;