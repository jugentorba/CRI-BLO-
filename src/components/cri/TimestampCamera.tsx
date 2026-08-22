import { useEffect, useRef, useState } from "react";
import { Camera, Check, X, MapPin, ZoomIn, Loader2 } from "lucide-react";
import { getCurrentPosition } from "@/lib/geo/gps";
import { watermarkImage } from "@/lib/photos/watermark";
import type { Address } from "@/lib/cri/types";

export interface TimestampCameraProps {
  open: boolean;
  address?: Address;
  watermarkEnabled?: boolean;
  saveToGallery?: boolean;
  onCancel: () => void;
  onCapture: (blob: Blob) => Promise<void> | void;
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
  const [gps, setGps] = useState<{ latitude: number; longitude: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        setError(null);
        const stream = await navigator.mediaDevices?.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
          audio: false,
        });
        if (cancelled) {
          stream?.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream ?? null;
        if (videoRef.current && stream) videoRef.current.srcObject = stream;
        const track = stream?.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as MediaTrackCapabilities & { zoom?: { min: number; max: number; step: number } };
        if (caps?.zoom) {
          const min = caps.zoom.min;
          const max = caps.zoom.max;
          const step = caps.zoom.step || 0.1;
          const candidates = [0.5, 0.6, 1, 1.5, 2, 3, 4].filter((v) => v >= min && v <= max);
          if (!candidates.includes(1) && min <= 1 && max >= 1) candidates.push(1);
          setSupportedZooms([...new Set(candidates)].sort((a, b) => a - b));
        } else {
          setSupportedZooms([1]);
        }
        try {
          const p = await getCurrentPosition();
          if (!cancelled) setGps({ latitude: p.latitude, longitude: p.longitude });
        } catch {
          // Camera remains usable without GPS; the photo still gets date/time.
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Caméra indisponible. Vérifiez l'autorisation caméra.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  async function applyZoom(value: number) {
    setZoom(value);
    const track = streamRef.current?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() as MediaTrackCapabilities & { zoom?: { min: number; max: number; step: number } };
    if (track && caps?.zoom && value >= caps.zoom.min && value <= caps.zoom.max) {
      try {
        await track.applyConstraints({ advanced: [{ zoom: value }] } as MediaTrackConstraints);
      } catch {
        // Some Android WebViews expose the capability but reject the constraint.
      }
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponible");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const raw = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Capture impossible"))), "image/jpeg", 0.95),
      );
      const now = new Date();
      let blob = raw;
      if (watermarkEnabled) {
        blob = await watermarkImage(new File([raw], "capture.jpg", { type: "image/jpeg" }), {
          date: now,
          address: gps
            ? { ...address, coordinates: `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}` } as Address
            : address,
        });
      }
      await onCapture(blob);
      if (saveToGallery) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `Criblo-${now.toISOString().replace(/[:.]/g, "-")}.jpg`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
      onCancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Capture impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-3">
        <button type="button" onClick={onCancel} className="rounded-full bg-white/10 p-2"><X className="h-5 w-5" /></button>
        <div className="text-center">
          <div className="text-sm font-bold">Caméra CRI BLO</div>
          <div className="text-[10px] opacity-70">Date · heure · localisation — sans nom</div>
        </div>
        <span className="w-9" />
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-xl bg-black/45 p-2 text-[11px]">
          <div>{new Date().toLocaleString("fr-FR")}</div>
          {gps && <div className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}</div>}
        </div>
        {error && <div className="absolute left-3 right-3 top-3 rounded-xl bg-red-600/90 p-3 text-xs">{error}</div>}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          <ZoomIn className="h-4 w-4 shrink-0 opacity-70" />
          {supportedZooms.map((v) => (
            <button key={v} type="button" onClick={() => void applyZoom(v)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${zoom === v ? "bg-white text-black" : "bg-white/10"}`}>
              {v}×
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void capture()} disabled={busy || !!error && !streamRef.current}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40">
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-7 w-7" />}
        </button>
      </div>
    </div>
  );
}
