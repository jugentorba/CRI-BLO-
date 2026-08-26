import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Image as ImageIcon,
  Eye,
  RefreshCw,
  Trash2,
  Pencil,
  FolderOpen,
} from "lucide-react";
import {
  deletePhoto,
  getPhoto,
  replacePhotoEvidence,
  savePhoto,
} from "@/lib/photos/repository";
import { watermarkImage } from "@/lib/photos/watermark";
import { downloadBlob } from "@/lib/export/folder";
import { PhotoAnnotator } from "@/components/cri/PhotoAnnotator";
import type { Address, GpsCoords } from "@/lib/cri/types";
import { TimestampCamera } from "@/components/cri/TimestampCamera";

function captureDateFromFile(file: File): Date {
  if (Number.isFinite(file.lastModified) && file.lastModified > 0) {
    const date = new Date(file.lastModified);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function coordinateText(gps: GpsCoords | null | undefined): string | undefined {
  return gps ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}` : undefined;
}

export function PhotoSlot({
  criId,
  slot,
  label,
  hint,
  address,
  gps,
  watermarkEnabled,
  saveToGallery,
  hasPhoto,
  onChange,
}: {
  criId: string;
  slot: string;
  label: string;
  hint?: string;
  address: Address;
  gps?: GpsCoords | null;
  watermarkEnabled: boolean;
  saveToGallery: boolean;
  hasPhoto: boolean;
  onChange: (hasPhoto: boolean) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const [annotating, setAnnotating] = useState<Blob | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let url: string | null = null;
    if (hasPhoto) {
      void getPhoto(criId, slot).then((photo) => {
        if (photo) {
          url = URL.createObjectURL(photo.blob);
          setPreview(url);
        }
      });
    } else {
      setPreview(null);
    }

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [criId, slot, hasPhoto]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const scrollY = window.scrollY;
    const capturedAt = captureDateFromFile(file);
    const isImage =
      file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name);
    const evidenceBlob =
      watermarkEnabled && isImage
        ? await watermarkImage(file, {
            date: capturedAt,
            address,
            coordinates: coordinateText(gps),
          })
        : file;

    await savePhoto(criId, slot, evidenceBlob, {
      originalBlob: file,
      capturedAt: capturedAt.toISOString(),
      gps: gps ?? null,
      address,
      watermarked: watermarkEnabled && isImage,
    });
    onChange(true);

    if (saveToGallery && isImage) {
      downloadBlob(`${slot}-${capturedAt.toISOString().replace(/[:.]/g, "-")}.jpg`, evidenceBlob);
    }

    requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
    setTimeout(() => window.scrollTo({ top: scrollY }), 120);
  }

  async function handleDelete() {
    if (!confirm("Supprimer cette photo ?")) return;
    await deletePhoto(criId, slot);
    onChange(false);
  }

  async function openAnnotate() {
    const photo = await getPhoto(criId, slot);
    if (photo) setAnnotating(photo.blob);
  }

  async function handleAnnotatedSave(edited: Blob) {
    await replacePhotoEvidence(criId, slot, edited);
    setAnnotating(null);
    onChange(false);
    setTimeout(() => onChange(true), 0);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)]">
      <div className="mb-2">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>

      {preview ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setViewing(true)}
            className="block w-full overflow-hidden rounded-lg border border-border"
          >
            <img
              src={preview}
              alt={label}
              loading="lazy"
              decoding="async"
              className="h-40 w-full object-cover"
            />
          </button>
          <div className="grid grid-cols-2 gap-2">
            <SlotBtn icon={Eye} label="Voir" onClick={() => setViewing(true)} />
            <SlotBtn icon={Pencil} label="Annoter" onClick={() => void openAnnotate()} primary />
            <SlotBtn icon={RefreshCw} label="Remplacer" onClick={() => setCameraOpen(true)} />
            <SlotBtn icon={Trash2} label="Supprimer" onClick={() => void handleDelete()} danger />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          <SlotBtn icon={Camera} label="Caméra" onClick={() => setCameraOpen(true)} primary />
          <SlotBtn icon={ImageIcon} label="Galerie" onClick={() => galleryRef.current?.click()} />
          <SlotBtn icon={FolderOpen} label="Fichiers" onClick={() => fileRef.current?.click()} />
        </div>
      )}

      <input
        ref={galleryRef}
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      {viewing && preview && (
        <div
          role="button"
          tabIndex={0}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setViewing(false)}
        >
          <img src={preview} alt={label} className="max-h-full max-w-full" />
        </div>
      )}

      <TimestampCamera
        open={cameraOpen}
        address={address}
        watermarkEnabled={watermarkEnabled}
        saveToGallery={saveToGallery}
        onCancel={() => setCameraOpen(false)}
        onCapture={async (capture) => {
          await savePhoto(criId, slot, capture.evidenceBlob, {
            originalBlob: capture.originalBlob,
            capturedAt: capture.capturedAt,
            gps: capture.gps,
            address: capture.address,
            watermarked: capture.watermarked,
          });
          onChange(true);
        }}
      />

      {annotating && (
        <PhotoAnnotator
          blob={annotating}
          onCancel={() => setAnnotating(null)}
          onSave={(blob) => void handleAnnotatedSave(blob)}
        />
      )}
    </div>
  );
}

function SlotBtn({
  icon: Icon,
  label,
  onClick,
  primary,
  danger,
}: {
  icon: typeof Camera;
  label: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex h-8 items-center justify-center gap-1 rounded-md border px-1 text-[11px] font-bold transition active:scale-95 " +
        (primary
          ? "border-primary bg-primary text-primary-foreground"
          : danger
            ? "border-destructive/50 bg-destructive/10 text-destructive"
            : "border-border bg-card text-foreground hover:border-primary/40")
      }
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </button>
  );
}
