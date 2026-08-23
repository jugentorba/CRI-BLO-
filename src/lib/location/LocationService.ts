import { Geolocation, Position } from '@capacitor/geolocation';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  altitudeAccuracy?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

export interface LocationAddress {
  street?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  formatted: string;
}

export interface LocationData {
  coordinates: LocationCoordinates;
  address?: LocationAddress;
  isAccurate: boolean;
  lastUpdate: number;
}

export type GPSStatus = 'idle' | 'acquiring' | 'acquired' | 'error' | 'denied';

class LocationService {
  private currentLocation: LocationData | null = null;
  private gpsStatus: GPSStatus = 'idle';
  private acquireTimeout = 30000; // 30 seconds timeout
  private minAccuracy = 50; // meters - acceptable for field work
  private listeners: Map<string, (location: LocationData) => void> = new Map();
  private statusListeners: Map<string, (status: GPSStatus) => void> = new Map();
  private watchId: string | null = null;
  private retryCount = 0;
  private maxRetries = 3;

  /**
   * Acquire current location with automatic retry and accuracy checking
   */
  async acquireLocation(): Promise<LocationData> {
    this.gpsStatus = 'acquiring';
    this.notifyStatusListeners('acquiring');

    try {
      const position = await this.getCurrentPosition();
      const coordinates = this.parsePosition(position);

      // Check accuracy
      const isAccurate = coordinates.accuracy <= this.minAccuracy;

      if (!isAccurate && this.retryCount < this.maxRetries) {
        console.warn(
          `GPS accuracy ${coordinates.accuracy}m exceeds threshold ${this.minAccuracy}m. Retrying...`
        );
        this.retryCount++;
        await this.delay(1000);
        return this.acquireLocation();
      }

      this.retryCount = 0;

      // Try to get address
      let address: LocationAddress | undefined;
      try {
        address = await this.reverseGeocode(coordinates);
      } catch (error) {
        console.warn('Address lookup failed, continuing with coordinates only', error);
      }

      const locationData: LocationData = {
        coordinates,
        address,
        isAccurate,
        lastUpdate: Date.now(),
      };

      this.currentLocation = locationData;
      this.gpsStatus = 'acquired';
      this.notifyStatusListeners('acquired');
      this.notifyListeners(locationData);

      return locationData;
    } catch (error) {
      this.gpsStatus = 'error';
      this.notifyStatusListeners('error');

      if (error instanceof Error) {
        if (error.message.includes('Permission')) {
          this.gpsStatus = 'denied';
          this.notifyStatusListeners('denied');
        }
      }

      throw error;
    }
  }

  /**
   * Get current position with timeout
   */
  private async getCurrentPosition(): Promise<Position> {
    return Promise.race([
      Geolocation.getCurrentPosition(),
      new Promise<Position>((_, reject) =>
        setTimeout(
          () => reject(new Error('GPS acquisition timeout')),
          this.acquireTimeout
        )
      ),
    ]);
  }

  /**
   * Parse native position to our coordinate format
   */
  private parsePosition(position: Position): LocationCoordinates {
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy || 100,
      altitude: position.coords.altitude || undefined,
      altitudeAccuracy: position.coords.altitudeAccuracy || undefined,
      heading: position.coords.heading || undefined,
      speed: position.coords.speed || undefined,
      timestamp: position.timestamp,
    };
  }

  /**
   * Reverse geocode coordinates to address
   * Fallback: return formatted coordinates if service fails
   */
  private async reverseGeocode(
    coordinates: LocationCoordinates
  ): Promise<LocationAddress | undefined> {
    try {
      // Using Open Street Map Nominatim (free, no key required)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coordinates.latitude}&lon=${coordinates.longitude}`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Reverse geocoding failed');
      }

      const data = await response.json();
      const address = data.address || {};

      return {
        street: address.road || address.footway,
        city: address.city || address.town || address.village,
        postalCode: address.postcode,
        country: address.country,
        formatted: data.display_name || this.formatCoordinates(coordinates),
      };
    } catch (error) {
      console.warn('Failed to reverse geocode:', error);
      // Return formatted coordinates as fallback
      return {
        formatted: this.formatCoordinates(coordinates),
      };
    }
  }

  /**
   * Format coordinates as readable string
   */
  private formatCoordinates(coords: LocationCoordinates): string {
    return `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)} (±${Math.round(coords.accuracy)}m)`;
  }

  /**
   * Start watching location updates (for continuous tracking)
   */
  async startWatching(
    onUpdate: (location: LocationData) => void
  ): Promise<void> {
    try {
      this.watchId = await Geolocation.watchPosition(
        {},
        (position, error) => {
          if (error) {
            console.error('Watch position error:', error);
            this.gpsStatus = 'error';
            this.notifyStatusListeners('error');
            return;
          }

          if (position) {
            const coordinates = this.parsePosition(position);
            const isAccurate = coordinates.accuracy <= this.minAccuracy;

            const locationData: LocationData = {
              coordinates,
              address: this.currentLocation?.address,
              isAccurate,
              lastUpdate: Date.now(),
            };

            this.currentLocation = locationData;
            onUpdate(locationData);
            this.notifyListeners(locationData);
          }
        }
      );
    } catch (error) {
      console.error('Failed to start watching position:', error);
      throw error;
    }
  }

  /**
   * Stop watching location
   */
  async stopWatching(): Promise<void> {
    if (this.watchId) {
      await Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
      this.gpsStatus = 'idle';
      this.notifyStatusListeners('idle');
    }
  }

  /**
   * Get last known location without acquiring new one
   */
  getLastLocation(): LocationData | null {
    return this.currentLocation;
  }

  /**
   * Get current GPS status
   */
  getStatus(): GPSStatus {
    return this.gpsStatus;
  }

  /**
   * Check if last location is still valid (within time window)
   */
  isLocationValid(maxAgeMs: number = 60000): boolean {
    if (!this.currentLocation) return false;
    return Date.now() - this.currentLocation.lastUpdate <= maxAgeMs;
  }

  /**
   * Subscribe to location changes
   */
  onLocationChange(
    callback: (location: LocationData) => void
  ): () => void {
    const key = `listener_${Date.now()}`;
    this.listeners.set(key, callback);

    return () => {
      this.listeners.delete(key);
    };
  }

  /**
   * Subscribe to GPS status changes
   */
  onStatusChange(
    callback: (status: GPSStatus) => void
  ): () => void {
    const key = `status_${Date.now()}`;
    this.statusListeners.set(key, callback);

    return () => {
      this.statusListeners.delete(key);
    };
  }

  private notifyListeners(location: LocationData): void {
    for (const listener of this.listeners.values()) {
      try {
        listener(location);
      } catch (error) {
        console.error('Error in location listener:', error);
      }
    }
  }

  private notifyStatusListeners(status: GPSStatus): void {
    for (const listener of this.statusListeners.values()) {
      try {
        listener(status);
      } catch (error) {
        console.error('Error in status listener:', error);
      }
    }
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private static toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const locationService = new LocationService();
export default LocationService;