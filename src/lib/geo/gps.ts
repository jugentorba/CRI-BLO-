import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import type { GpsCoords } from "@/lib/cri/types";

export interface GpsError {
  code: "denied" | "unavailable" | "timeout" | "unsupported";
  message: string;
}

type PositionLike = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  };
  timestamp?: number;
};

function readPosition(pos: PositionLike): GpsCoords {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? undefined,
    capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
  };
}

async function getNativePosition(): Promise<GpsCoords> {
  try {
    let permission = await Geolocation.checkPermissions();
    if (permission.location !== "granted") {
      if (permission.location === "denied") {
        throw {
          code: "denied",
          message: "Localisation refusée. Autorisez la position pour CRI BLO dans les réglages du téléphone puis réessayez.",
        } satisfies GpsError;
      }
      permission = await Geolocation.requestPermissions({ permissions: ["location"] });
      if (permission.location !== "granted") {
        throw {
          code: "denied",
          message: "Localisation refusée. CRI BLO peut continuer, mais la preuve GPS restera indisponible.",
        } satisfies GpsError;
      }
    }

    try {
      return readPosition(
        await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 5000,
        }),
      );
    } catch {
      return readPosition(
        await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 30000,
          maximumAge: 60000,
        }),
      );
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "denied"
    ) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error ?? "");
    const timeout = /timeout|timed out/i.test(message);
    throw {
      code: timeout ? "timeout" : "unavailable",
      message: timeout
        ? "Le GPS n'a pas répondu. Réessayez à l'extérieur ou avec une meilleure vue du ciel."
        : "Position indisponible. Vérifiez que la localisation de l'appareil est activée.",
    } satisfies GpsError;
  }
}

async function getWebPosition(): Promise<GpsCoords> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw {
      code: "unsupported",
      message: "La géolocalisation n'est pas disponible dans ce navigateur.",
    } satisfies GpsError;
  }

  const permission = await navigator.permissions
    ?.query?.({ name: "geolocation" as PermissionName })
    .catch(() => null);
  if (permission?.state === "denied") {
    throw {
      code: "denied",
      message: "L'autorisation de localisation est refusée. Autorisez la localisation pour CRI BLO puis réessayez.",
    } satisfies GpsError;
  }

  const attempt = (options: PositionOptions) =>
    new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, options),
    );

  try {
    return readPosition(
      await attempt({ enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }),
    );
  } catch (first) {
    const err = first as GeolocationPositionError;
    if (err.code === 1) {
      throw {
        code: "denied",
        message: "Localisation refusée. Autorisez la position pour CRI BLO puis réessayez.",
      } satisfies GpsError;
    }
    try {
      return readPosition(
        await attempt({ enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 }),
      );
    } catch (second) {
      const e = second as GeolocationPositionError;
      throw {
        code: e.code === 3 ? "timeout" : "unavailable",
        message:
          e.code === 3
            ? "Le GPS n'a pas répondu. Réessayez à l'extérieur ou avec une meilleure vue du ciel."
            : "Position indisponible. Vérifiez que la localisation de l'appareil est activée.",
      } satisfies GpsError;
    }
  }
}

export async function getCurrentPosition(): Promise<GpsCoords> {
  return Capacitor.isNativePlatform() ? getNativePosition() : getWebPosition();
}
