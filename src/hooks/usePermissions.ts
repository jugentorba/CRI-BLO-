import { useEffect, useState } from 'react';
import { PermissionStatus } from '@capacitor/core';
import {
  permissionManager,
  PermissionType,
} from '@/lib/permissions/PermissionManager';
import { PermissionFlow } from '@/lib/permissions/PermissionFlow';

export interface UsePermissionsResult {
  permissions: Record<PermissionType, PermissionStatus | null>;
  isGranted: (type: PermissionType) => boolean;
  requestPermission: (type: PermissionType) => Promise<PermissionStatus>;
  canProceed: boolean;
  loading: boolean;
  error: Error | null;
}

/**
 * React hook for managing permissions throughout the app
 */
export function usePermissions(): UsePermissionsResult {
  const [permissions, setPermissions] = useState<
    Record<PermissionType, PermissionStatus | null>
  >({
    camera: null,
    geolocation: null,
    microphone: null,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const initializePermissions = async () => {
      try {
        const result = await PermissionFlow.initializeAppPermissions();
        const perms = Object.fromEntries(result.granted) as Record<
          PermissionType,
          PermissionStatus
        >;
        setPermissions(perms);
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error('Failed to initialize permissions')
        );
      } finally {
        setLoading(false);
      }
    };

    initializePermissions();
  }, []);

  const requestPermission = async (
    type: PermissionType
  ): Promise<PermissionStatus> => {
    try {
      const status = await PermissionFlow.ensurePermission(type);
      setPermissions((prev) => ({
        ...prev,
        [type]: status,
      }));
      return status;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      throw error;
    }
  };

  const isGranted = (type: PermissionType): boolean => {
    return permissions[type]?.state === 'granted' ?? false;
  };

  const canProceed = PermissionFlow.canProceedToFieldWork();

  return {
    permissions,
    isGranted,
    requestPermission,
    canProceed,
    loading,
    error,
  };
}

export default usePermissions;