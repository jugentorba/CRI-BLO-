import { useEffect, useRef, useState } from "react";
import { Camera, X, MapPin, ZoomIn, Loader2 } from "lucide-react";
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
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [supportedZooms, setSupportedZooms] = useState<number[]>([1]);
  const [gps, setGps] = useState<GpsCoords | null>(null);
  const [photoAddress, setPhotoAddress] = useState<Address>(address);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhotoAddress(address);
    setGps(null);

    void (async () => {
      try {
        setError(null);
        const stream = await navigator.mediaDevices?.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 3840 },
            height: { ideal: 2160 },
          },
          audio: false,
        });
        if (cancelled) {
          stream?.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream ?? null;
        if (videoRef.current && stream) videoRef.current.srcObject = stream;

        const track = stream?.getVideoTracks()[0];
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

          // Resolve an address for this photo's own coordinates when online.
          // Failure never blocks capture and the known intervention address is retained.
          if (navigator.onLine) {
            try {
              const resolved = await reverseGeocode({
                data: { latitude: position.latitude, longitude: position.longitude },
              });
              if (!cancelled && hasAddress(resolved)) setPhotoAddress(resolved);
            } catch {
              // Keep the intervention address or explicitly show unavailable in watermark.
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
        // Some Android WebViews expose zoom but reject the constraint.
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
        const url = URL.createObjectURL(evidenceBlob);
        link.href = url;
        link.download = `CRI-BLO-${capturedAt.toISOString().replace(/[:.]/g, "-")}.jpg`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      onCancel();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Capture impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-3">
        <button type="button" onClick={onCancel} className="rounded-full bg-white/10 p-2">
          <X className="h-5 w-5" />
        </button>
        <div className="text-center">
          <div className="text-sm font-bold">Caméra CRI BLO</div>
          <div className="text-[10px] opacity-70">Date · heure · GPS · adresse</div>
        </div>
        <span className="w-9" />
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
          <div className="absolute left-3 right-3 top-3 rounded-xl bg-red-600/90 p-3 text-xs">
            {error}
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
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
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-7 w-7" />}
        </button>
      </div>
    </div>
  );
}
