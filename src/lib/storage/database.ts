import Dexie, { Table } from 'dexie';

export interface StoredIntervention {
  id: string;
  externalId?: string;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;
  status: 'draft' | 'pending' | 'synced' | 'error';
  data: Record<string, any>;
  metadata?: {
    technician?: string;
    location?: string;
    type?: string;
  };
}

export interface StoredPhoto {
  id: string;
  interventionId: string;
  base64: string;
  watermarked?: string;
  watermarkedSyncedAt?: number;
  metadata: {
    timestamp: number;
    coordinates?: {
      latitude: number;
      longitude: number;
      accuracy: number;
    };
    address?: string;
    section?: string; // e.g., 'before', 'after', 'support'
  };
  createdAt: number;
  syncedAt?: number;
  status: 'local' | 'queued' | 'synced' | 'error';
}

export interface SyncQueue {
  id: string;
  interventionId: string;
  type: 'intervention' | 'photo';
  dataId: string;
  attempts: number;
  lastAttempt?: number;
  nextRetry: number;
  error?: string;
  createdAt: number;
}

class CriBloDB extends Dexie {
  interventions!: Table<StoredIntervention>;
  photos!: Table<StoredPhoto>;
  syncQueue!: Table<SyncQueue>;

  constructor() {
    super('CriBloDB');
    this.version(1).stores({
      interventions: '++id, status, syncedAt, createdAt',
      photos: '++id, interventionId, status, syncedAt, createdAt',
      syncQueue: '++id, interventionId, type, nextRetry, createdAt',
    });
  }
}

export const db = new CriBloDB();
export default CriBloDB;