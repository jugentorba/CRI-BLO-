import type { GpsCoords } from "@/lib/cri/types";

export interface GpsError {
  code: "denied" | "unavailable" | "timeout" | "unsupported";
  message: string;
}

function readPosition(pos: GeolocationPosition): GpsCoords {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
  };
}

export async function getCurrentPosition(): Promise<GpsCoords> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw { code: "unsupported", message: "La géolocalisation n'est pas disponible dans cette WebView." } satisfies GpsError;
  }

  const permission = await navigator.permissions?.query?.({ name: "geolocation" as PermissionName }).catch(() => null);
  if (permission?.state === "denied") {
    throw { code: "denied", message: "L'autorisation de localisation est refusée. Autorisez la localisation pour CRI BLO dans les réglages Android puis réessayez." } satisfies GpsError;
  }

  const attempt = (options: PositionOptions) =>
    new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, options),
    );

  try {
    return readPosition(await attempt({ enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }));
  } catch (first) {
    const err = first as GeolocationPositionError;
    if (err.code === 1) {
      throw { code: "denied", message: "Localisation refusée par Android. Autorisez la position précise pour CRI BLO." } satisfies GpsError;
    }
    try {
      return readPosition(await attempt({ enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 }));
    } catch (second) {
      const e = second as GeolocationPositionError;
      throw {
        code: e.code === 3 ? "timeout" : "unavailable",
        message: e.code === 3
          ? "Le GPS n'a pas répondu. Activez la localisation et réessayez à l'extérieur."
          : "Position indisponible. Vérifiez que la localisation de l'appareil est activée.",
      } satisfies GpsError;
    }
  }
}
