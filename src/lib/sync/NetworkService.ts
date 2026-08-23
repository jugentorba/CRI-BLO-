import { Network } from '@capacitor/network';

export type NetworkStatus = 'online' | 'offline' | 'unknown';

interface NetworkListener {
  (status: NetworkStatus): void;
}

class NetworkService {
  private currentStatus: NetworkStatus = 'unknown';
  private listeners: Map<string, NetworkListener> = new Map();
  private unsubscribe: (() => void) | null = null;

  /**
   * Initialize network monitoring
   */
  async initialize(): Promise<void> {
    try {
      // Get initial status
      const status = await Network.getStatus();
      this.currentStatus = status.connected ? 'online' : 'offline';

      // Listen for changes
      this.unsubscribe = Network.addListener('networkStatusChange', (status) => {
        this.currentStatus = status.connected ? 'online' : 'offline';
        this.notifyListeners();
      });
    } catch (error) {
      console.error('Failed to initialize network monitoring:', error);
    }
  }

  /**
   * Get current network status
   */
  getStatus(): NetworkStatus {
    return this.currentStatus;
  }

  /**
   * Check if online
   */
  isOnline(): boolean {
    return this.currentStatus === 'online';
  }

  /**
   * Subscribe to network changes
   */
  onStatusChange(callback: NetworkListener): () => void {
    const key = `listener_${Date.now()}`;
    this.listeners.set(key, callback);

    return () => {
      this.listeners.delete(key);
    };
  }

  /**
   * Wait for network to be online
   */
  async waitForOnline(timeoutMs: number = 30000): Promise<void> {
    if (this.isOnline()) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error('Network timeout'));
      }, timeoutMs);

      const unsubscribe = this.onStatusChange((status) => {
        if (status === 'online') {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      });
    });
  }

  private notifyListeners(): void {
    for (const listener of this.listeners.values()) {
      try {
        listener(this.currentStatus);
      } catch (error) {
        console.error('Error in network listener:', error);
      }
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}

export const networkService = new NetworkService();
export default NetworkService;