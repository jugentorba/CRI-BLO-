import { useState, useEffect } from 'react';
import { locationService, LocationData, GPSStatus } from '@/lib/location/LocationService';

export interface UseLocationResult {
  location: LocationData | null;
  status: GPSStatus;
  error: Error | null;
  accuracy: number | null;
  acquireLocation: () => Promise<LocationData>;
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
  isValid: boolean;
}

/**
 * React hook for GPS/Location operations
 */
export function useLocation(): UseLocationResult {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [status, setStatus] = useState<GPSStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Subscribe to location changes
    const unsubscribeLocation = locationService.onLocationChange((loc) => {
      setLocation(loc);
    });

    const unsubscribeStatus = locationService.onStatusChange((st) => {
      setStatus(st);
    });

    return () => {
      unsubscribeLocation();
      unsubscribeStatus();
    };
  }, []);

  const acquireLocation = async (): Promise<LocationData> => {
    try {
      setError(null);
      const loc = await locationService.acquireLocation();
      setLocation(loc);
      return loc;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to acquire location');
      setError(error);
      throw error;
    }
  };

  const startTracking = async () => {
    try {
      setError(null);
      await locationService.startWatching((loc) => {
        setLocation(loc);
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to start tracking');
      setError(error);
      throw error;
    }
  };

  const stopTracking = async () => {
    try {
      await locationService.stopWatching();
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to stop tracking');
      setError(error);
      throw error;
    }
  };

  return {
    location,
    status,
    error,
    accuracy: location?.coordinates.accuracy ?? null,
    acquireLocation,
    startTracking,
    stopTracking,
    isValid: locationService.isLocationValid(),
  };
}

export default useLocation;