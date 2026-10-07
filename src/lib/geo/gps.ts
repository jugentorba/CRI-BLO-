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

function webTimeoutError(): GeolocationPositionError {
  return {
    code: 3,
    message: "CRI BLO GPS watchdog timeout",
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

function attemptCurrentPosition(
  options: PositionOptions,
  hardTimeoutMs: number,
): Promise<GeolocationPosition> {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(webTimeoutError());
    }, hardTimeoutMs);

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      callback();
    };

    navigator.geolocation.getCurrentPosition(
      (position) => finish(() => resolve(position)),
      (error) => finish(() => reject(error)),
      options,
    );
  });
}

function attemptWatchPosition(
  options: PositionOptions,
  hardTimeoutMs: number,
): Promise<GeolocationPosition> {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    let settled = false;
    let watchId: number | null = null;

    const cleanup = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(timer);
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const timer = window.setTimeout(() => {
      finish(() => reject(webTimeoutError()));
    }, hardTimeoutMs);

    watchId = navigator.geolocation.watchPosition(
      (position) => finish(() => resolve(position)),
      (error) => finish(() => reject(error)),
      options,
    );
  });
}

function isIosWebApp(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  const ios = /iphone|ipad|ipod/.test(ua);
  const standalone =
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)) ||
    window.matchMedia?.("(display-mode: standalone)").matches;
  return ios && Boolean(standalone);
}

async function getWebPosition(): Promise<GpsCoords> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw {
      code: "unsupported",
      message: "La géolocalisation n'est pas disponible dans ce navigateur.",
    } satisfies GpsError;
  }

  // Do not query navigator.permissions before the location request. WebKit has
  // historically reported stale geolocation permission state, and in an iOS
  // standalone PWA the native geolocation callback itself can also hang. Calling
  // the API immediately preserves the user's tap as the permission-triggering
  // action; our watchdog guarantees that CRI BLO never waits forever.
  try {
    return readPosition(
      await attemptCurrentPosition(
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
        18000,
      ),
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
      // watchPosition is a useful second path on iOS/WebKit when a one-shot
      // getCurrentPosition request never produces a callback in standalone mode.
      return readPosition(
        await attemptWatchPosition(
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
          18000,
        ),
      );
    } catch (second) {
      const e = second as GeolocationPositionError;
      if (e.code === 1) {
        throw {
          code: "denied",
          message: "Localisation refusée. Autorisez la position pour CRI BLO puis réessayez.",
        } satisfies GpsError;
      }

      const iosHelp = isIosWebApp()
        ? " Sur iPhone, vérifiez Réglages > Confidentialité et sécurité > Service de localisation et autorisez Safari/CRI BLO, puis rouvrez l'app."
        : "";
      throw {
        code: e.code === 3 ? "timeout" : "unavailable",
        message:
          e.code === 3
            ? `Le GPS n'a pas répondu.${iosHelp}`
            : `Position indisponible. Vérifiez que la localisation de l'appareil est activée.${iosHelp}`,
      } satisfies GpsError;
    }
  }
}

export async function getCurrentPosition(): Promise<GpsCoords> {
  return Capacitor.isNativePlatform() ? getNativePosition() : getWebPosition();
}
