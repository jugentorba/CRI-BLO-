export interface GpsCoords {
  latitude: number;
  longitude: number;
  accuracy?: number;
  capturedAt: string;
}

export interface Address {
  streetNumber?: string;
  street?: string;
  postalCode?: string;
  commune?: string;
  region?: string;
  country?: string;
  formatted?: string;
}

export type AddressStatus = "resolved" | "pending" | "manual" | "failed";

export interface TechnicianSnapshot {
  company?: string;
  lastName?: string;
  fullName?: string;
  matricule?: string;
  team?: string;
  sector?: string;
}

export type CriStatus = "draft" | "exported";

export interface CriRecord {
  id: string;
  createdAt: string;
  interventionAt: string;
  reference: string; // équivalent values.referenceOrange — gardé pour le tri historique
  gps: GpsCoords | null;
  address: Address;
  addressStatus: AddressStatus;
  technician: TechnicianSnapshot;
  notes?: string;
  status?: CriStatus;
  values?: Record<string, unknown>; // toutes les valeurs des champs officiels CRI BLO
  photos?: Record<string, string>; // slotId -> photoId (clé dans store photos)
  exportedAt?: string;
  exported?: boolean;
}

export interface TechnicianProfile {
  id: "me";
  company?: string;
  lastName?: string;
  fullName?: string;
  matricule?: string;
  team?: string;
  sector?: string;
  updatedAt: string;
}
