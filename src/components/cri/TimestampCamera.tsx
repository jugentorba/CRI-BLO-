import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  Camera as NativeCamera,
  CameraResultType,
  CameraSource,
} from "@capacitor/camera";
import { Camera as CameraIcon, X, MapPin, ZoomIn, Loader2 } from "lucide-react";
import { getCurrentPosition } from "@/lib/geo/gps";
import { reverseGeocode } from "@/lib/geo/geocode.functions";
import { watermarkImage } from "@/lib/photos/watermark";
import type { Address, GpsCoords } from "@/lib/cri/types";

export interface TimestampCameraCapture {
  originalBlob: Blob;
  evidenceBlob: Blob;
  capturedAt: string;
  gps: GpsCoords | null;
  address: Address;
  watermarked: boolean;
}

export interface TimestampCameraProps {
  open: boolean;
  address?: Address;
  watermarkEnabled?: boolean;
  saveToGallery?: boolean;
  onCancel: () => void;
  onCapture: (capture: TimestampCameraCapture) => Promise<void> | void;
}

function hasAddress(address: Address): boolean {
  return Boolean(
    address.streetNumber ||
      address.street ||
      address.postalCode ||
      address.commune ||
      address.region ||
      address.country,
  );
}

function isUserCancelled(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /cancel|cancelled|canceled|annul/i.test(message) || code === "OS-PLUG-CAMR-0004";
}

export function TimestampCamera({
  open,
  address = {},
  watermarkEnabled = true,
  saveToGallery = false,
  onCancel,
  onCapture,
}: TimestampCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeLaunchRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [supportedZooms, setSupportedZooms] = useState<number[]>([1]);
  const [gps, setGps] = useState<GpsCoords | null>(null);
  const [photoAddress, setPhotoAddress] = useState<Address>(address);
  const [error, setError] = useState<string | null>(null);

  // Native iOS/Android: use the actual phone camera instead of getUserMedia in
  // WKWebView/WebView. This avoids black previews and gives the user the normal
  // flash/focus/camera controls. CRI-BLO still creates its own evidence blob and
  // watermark after the system camera returns the original image.
  useEffect(() => {
    if (!open) {
      nativeLaunchRef.current = false;
      return;
    }
    if (!Capacitor.isNativePlatform() || nativeLaunchRef.current) return;

    nativeLaunchRef.current = true;
    let cancelled = false;
    setBusy(true);
    setError(null);
    setGps(null);
    setPhotoAddress(address);

    void (async () => {
      try {
        let captureGps: GpsCoords | null = null;
        let captureAddress: Address = address;

        // Ask for location before presenting the system camera so the iOS
        // location permission sheet cannot be hidden behind the camera screen.
        try {
          captureGps = await getCurrentPosition();
          if (!cancelled) setGps(captureGps);
          if (navigator.onLine) {
            try {
              const resolved = await reverseGeocode({
                data: {
                  latitude: captureGps.latitude,
                  longitude: captureGps.longitude,
                },
              });
              if (hasAddress(resolved)) captureAddress = resolved;
            } catch {
              // Keep the intervention address if reverse geocoding is unavailable.
            }
          }
          if (!cancelled) setPhotoAddress(captureAddress);
        } catch {
          // Camera remains usable and the evidence explicitly records GPS as unavailable.
        }

        const photo = await NativeCamera.getPhoto({
          source: CameraSource.Camera,
          resultType: CameraResultType.Uri,
          quality: 95,
          correctOrientation: true,
          allowEditing: false,
          saveToGallery,
          presentationStyle: "fullscreen",
        });
        if (cancelled) return;
        if (!photo.webPath) throw new Error("La caméra n'a pas retourné la photo.");

        const response = await fetch(photo.webPath);
        if (!response.ok) throw new Error(`Lecture photo impossible (${response.status}).`);
        const originalBlob = await response.blob();
        const capturedAt = new Date();
        const coordinates = captureGps
          ? `${captureGps.latitude.toFixed(6)}, ${captureGps.longitude.toFixed(6)}`
          : undefined;
        const evidenceBlob = watermarkEnabled
          ? await watermarkImage(originalBlob, {
              date: capturedAt,
              address: captureAddress,
              coordinates,
            })
          : originalBlob;

        await onCapture({
          originalBlob,
          evidenceBlob,
          capturedAt: capturedAt.toISOString(),
          gps: captureGps,
          address: captureAddress,
          watermarked: watermarkEnabled,
        });
        if (!cancelled) onCancel();
      } catch (cause) {
        if (cancelled) return;
        if (isUserCancelled(cause)) {
          onCancel();
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "Caméra indisponible. Vérifiez les autorisations caméra et photos.",
        );
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Launch exactly once for each transition to open=true. Capture options and
    // callbacks are read from the render that opened the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // PWA/web fallback. Native apps never enter this getUserMedia path.
  useEffect(() => {
    if (!open || Capacitor.isNativePlatform()) return;
    let cancelled = false;
    setPhotoAddress(address);
    setGps(null);

    async function attachStream(stream: MediaStream) {
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        await new Promise<void>((resolve) => {
          const finish = () => {
            video.removeEventListener("loadedmetadata", finish);
            void video.play().finally(resolve);
          };
          video.addEventListener("loadedmetadata", finish, { once: true });
          window.setTimeout(finish, 1200);
        });
      }
    }

    void (async () => {
      try {
        setError(null);
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("La caméra web n'est pas disponible sur cet appareil.");
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false,
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        await attachStream(stream);

        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & {
          zoom?: { min: number; max: number; step: number };
        };
        if (capabilities?.zoom) {
          const candidates = [0.5, 0.6, 1, 1.5, 2, 3, 4].filter(
            (value) => value >= capabilities.zoom!.min && value <= capabilities.zoom!.max,
          );
          if (
            !candidates.includes(1) &&
            capabilities.zoom.min <= 1 &&
            capabilities.zoom.max >= 1
          ) {
            candidates.push(1);
          }
          setSupportedZooms([...new Set(candidates)].sort((a, b) => a - b));
        } else {
          setSupportedZooms([1]);
        }

        try {
          const position = await getCurrentPosition();
          if (cancelled) return;
          setGps(position);
          if (navigator.onLine) {
            try {
              const resolved = await reverseGeocode({
                data: { latitude: position.latitude, longitude: position.longitude },
              });
              if (!cancelled && hasAddress(resolved)) setPhotoAddress(resolved);
            } catch {
              // Keep the intervention address.
            }
          }
        } catch {
          // Camera remains usable; watermark explicitly marks GPS unavailable.
        }
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Caméra indisponible. Vérifiez l'autorisation caméra.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [open, address]);

  async function applyZoom(value: number) {
    setZoom(value);
    const track = streamRef.current?.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & {
      zoom?: { min: number; max: number; step: number };
    };
    if (
      track &&
      capabilities?.zoom &&
      value >= capabilities.zoom.min &&
      value <= capabilities.zoom.max
    ) {
      try {
        await track.applyConstraints({ advanced: [{ zoom: value }] } as MediaTrackConstraints);
      } catch {
        // Some WebViews expose zoom but reject the constraint.
      }
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || busy) return;

    setBusy(true);
    try {
      const capturedAt = new Date();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponible");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const originalBlob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Capture impossible"))),
          "image/jpeg",
          0.95,
        ),
      );

      const coordinates = gps
        ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`
        : undefined;
      const evidenceBlob = watermarkEnabled
        ? await watermarkImage(originalBlob, {
            date: capturedAt,
            address: photoAddress,
            coordinates,
          })
        : originalBlob;

      await onCapture({
        originalBlob,
        evidenceBlob,
        capturedAt: capturedAt.toISOString(),
        gps,
        address: photoAddress,
        watermarked: watermarkEnabled,
      });

      if (saveToGallery) {
        const link = document.createElement("a");
        const objectUrl = URL.createObjectURL(evidenceBlob);
        link.href = objectUrl;
        link.download = `CRI-BLO-${capturedAt.toISOString().replace(/[:.]/g, "-")}.jpg`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      }
      onCancel();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Capture impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  // The native system camera normally covers this view. It remains as a safe,
  // correctly inset processing/error surface when the camera is opening/closing.
  if (Capacitor.isNativePlatform()) {
    return (
      <div className="fixed inset-0 z-[100] flex h-[100dvh] flex-col bg-black text-white">
        <div
          className="flex items-center justify-between px-3 pb-3"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        >
          <button type="button" onClick={onCancel} className="rounded-full bg-white/15 p-2.5">
            <X className="h-5 w-5" />
          </button>
          <div className="text-center">
            <div className="text-sm font-bold">Caméra CRI BLO</div>
            <div className="text-[10px] opacity-70">Caméra native · GPS · adresse</div>
          </div>
          <span className="w-10" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : <CameraIcon className="h-8 w-8" />}
          <p className="text-sm opacity-80">{busy ? "Préparation de la photo…" : "Caméra fermée"}</p>
          {gps ? (
            <p className="text-xs opacity-70">
              {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}
            </p>
          ) : null}
          {error ? <div className="rounded-xl bg-red-600/90 p-3 text-xs">{error}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex h-[100dvh] flex-col bg-black text-white">
      <div
        className="flex items-center justify-between px-3 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <button type="button" onClick={onCancel} className="rounded-full bg-white/10 p-2.5">
          <X className="h-5 w-5" />
        </button>
        <div className="text-center">
          <div className="text-sm font-bold">Caméra CRI BLO</div>
          <div className="text-[10px] opacity-70">Date · heure · GPS · adresse</div>
        </div>
        <span className="w-10" />
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-xl bg-black/50 p-2 text-[11px]">
          <div>{new Date().toLocaleString("fr-FR")}</div>
          {gps ? (
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}
              {gps.accuracy ? ` · ±${Math.round(gps.accuracy)} m` : ""}
            </div>
          ) : (
            <div>GPS : indisponible</div>
          )}
          <div>
            Adresse : {hasAddress(photoAddress) ? photoAddress.formatted || photoAddress.commune || "disponible" : "indisponible"}
          </div>
        </div>
        {error && (
          <div className="absolute left-3 right-3 rounded-xl bg-red-600/90 p-3 text-xs" style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
            {error}
          </div>
        )}
      </div>

      <div
        className="space-y-3 px-4 pt-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      >
        <div className="flex items-center gap-2 overflow-x-auto">
          <ZoomIn className="h-4 w-4 shrink-0 opacity-70" />
          {supportedZooms.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => void applyZoom(value)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${zoom === value ? "bg-white text-black" : "bg-white/10"}`}
            >
              {value}×
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void capture()}
          disabled={busy || (!!error && !streamRef.current)}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <CameraIcon className="h-7 w-7" />}
        </button>
      </div>
    </div>
  );
}
