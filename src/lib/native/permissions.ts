import { Capacitor } from "@capacitor/core";
import { Camera } from "@capacitor/camera";
import { Geolocation } from "@capacitor/geolocation";

export type NativePermissionState = "granted" | "denied" | "unavailable";

export interface NativePermissionSnapshot {
  native: boolean;
  location: NativePermissionState;
  camera: NativePermissionState;
  microphone: NativePermissionState;
}

function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function requestMicrophone(): Promise<NativePermissionState> {
  if (!navigator.mediaDevices?.getUserMedia) return "unavailable";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
    stopStream(stream);
    return "granted";
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") return "denied";
    return "unavailable";
  }
}

async function requestCamera(): Promise<NativePermissionState> {
  try {
    const current = await Camera.checkPermissions();
    if (current.camera === "granted") return "granted";
    if (current.camera === "denied") return "denied";
    const requested = await Camera.requestPermissions({ permissions: ["camera"] });
    return requested.camera === "granted" ? "granted" : "denied";
  } catch {
    return "unavailable";
  }
}

async function requestLocation(): Promise<NativePermissionState> {
  try {
    const current = await Geolocation.checkPermissions();
    if (current.location === "granted") return "granted";
    if (current.location === "denied") return "denied";
    const requested = await Geolocation.requestPermissions({ permissions: ["location"] });
    return requested.location === "granted" ? "granted" : "denied";
  } catch {
    return "unavailable";
  }
}

/**
 * Native startup permission coordinator.
 *
 * Android/iOS only: request each permission one at a time so native dialogs do
 * not overlap. A denial never prevents CRI-BLO from opening; the related
 * feature can explain/retry later when the technician actually uses it.
 *
 * PWA/web deliberately does nothing here. Browser permissions remain
 * feature-triggered so installing/using the PWA does not show a wall of prompts.
 */
export async function requestNativeStartupPermissions(): Promise<NativePermissionSnapshot> {
  if (!Capacitor.isNativePlatform()) {
    return {
      native: false,
      location: "unavailable",
      camera: "unavailable",
      microphone: "unavailable",
    };
  }

  const location = await requestLocation();
  const camera = await requestCamera();
  const microphone = await requestMicrophone();

  const snapshot: NativePermissionSnapshot = {
    native: true,
    location,
    camera,
    microphone,
  };

  try {
    window.dispatchEvent(new CustomEvent("criblo:native-permissions", { detail: snapshot }));
  } catch {
    /* optional status event only */
  }

  return snapshot;
}
