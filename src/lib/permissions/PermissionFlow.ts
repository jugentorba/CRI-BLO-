import {
  permissionManager,
  PermissionRequest,
  PermissionType,
} from './PermissionManager';
import { PermissionStatus } from '@capacitor/core';

/**
 * Define the permission flow for CRI-BLO field application
 * Permissions are requested sequentially in order of criticality
 */

const FIELD_WORK_PERMISSIONS: PermissionRequest[] = [
  {
    type: 'camera',
    critical: true,
    description: 'Required for evidence photos',
    retryable: true,
  },
  {
    type: 'geolocation',
    critical: true,
    description: 'Required for GPS tagging evidence',
    retryable: true,
  },
  {
    type: 'microphone',
    critical: false,
    description: 'Optional for voice notes',
    retryable: true,
  },
];

export class PermissionFlow {
  /**
   * Initialize permissions on app startup
   * This is called once when technician opens CRI-BLO
   */
  static async initializeAppPermissions(): Promise<{
    success: boolean;
    granted: Map<PermissionType, PermissionStatus>;
    denied?: string[];
  }> {
    try {
      const granted = await permissionManager.requestPermissionsSequentially(
        FIELD_WORK_PERMISSIONS
      );

      const denied: string[] = [];
      for (const [type, status] of granted.entries()) {
        if (status.state !== 'granted') {
          denied.push(type);
        }
      }

      return {
        success: denied.length === 0,
        granted,
        denied: denied.length > 0 ? denied : undefined,
      };
    } catch (error) {
      console.error('Permission initialization failed:', error);
      throw error;
    }
  }

  /**
   * Check if app can proceed to field work
   * Returns false if critical permissions are missing
   */
  static canProceedToFieldWork(): boolean {
    const cameraGranted = permissionManager.isGranted('camera');
    const locationGranted = permissionManager.isGranted('geolocation');

    return cameraGranted && locationGranted;
  }

  /**
   * Handle user denying a critical permission
   * Show retry/settings guidance
   */
  static async handlePermissionDenied(
    type: PermissionType
  ): Promise<'retry' | 'settings' | 'continue'> {
    const request = FIELD_WORK_PERMISSIONS.find((p) => p.type === type);

    if (!request) {
      throw new Error(`Unknown permission: ${type}`);
    }

    if (!request.critical) {
      // Non-critical permissions can be skipped
      return 'continue';
    }

    // Critical permissions require action
    // Return what the user chose: retry, go to settings, or we'll handle it in UI
    return 'settings';
  }

  /**
   * Get all permissions that are currently granted
   */
  static async getGrantedPermissions(): Promise<PermissionType[]> {
    const granted: PermissionType[] = [];

    for (const perm of ['camera', 'geolocation', 'microphone'] as PermissionType[]) {
      if (permissionManager.isGranted(perm)) {
        granted.push(perm);
      }
    }

    return granted;
  }

  /**
   * Check single permission and request if needed
   */
  static async ensurePermission(
    type: PermissionType
  ): Promise<PermissionStatus> {
    const status = await permissionManager.checkPermission(type);

    if (status.state === 'granted') {
      return status;
    }

    const request = FIELD_WORK_PERMISSIONS.find((p) => p.type === type);
    if (!request) {
      throw new Error(`Permission request not found: ${type}`);
    }

    return permissionManager.retryPermission(request);
  }
}

export default PermissionFlow;