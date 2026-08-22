import { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Eye, RefreshCw, Trash2, Pencil, FolderOpen } from "lucide-react";
import { deletePhoto, getPhoto, savePhoto } from "@/lib/photos/repository";
import { watermarkImage } from "@/lib/photos/watermark";
import { downloadBlob } from "@/lib/export/folder";
import { PhotoAnnotator } from "@/components/cri/PhotoAnnotator";
import type { Address } from "@/lib/cri/types";
import { TimestampCamera } from "@/components/cri/TimestampCamera";

export function PhotoSlot({
  criId,
  slot,
  label,
  hint,
  address,
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
  watermarkEnabled: boolean;
  saveToGallery: boolean;
  hasPhoto: boolean;
  onChange: (hasPhoto: boolean) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const [annotating, setAnnotating] = useState<Blob | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let url: string | null = null;
    if (hasPhoto) {
      void getPhoto(criId, slot).then((p) => {
        if (p) {
          url = URL.createObjectURL(p.blob);
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
    const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name);
    const blob = watermarkEnabled && isImage
      ? await watermarkImage(file, { date: new Date(), address })
      : file;
    await savePhoto(criId, slot, blob);
    onChange(true);
    if (saveToGallery) {
      downloadBlob(`${slot}-${Date.now()}.jpg`, blob);
    }
    // Restore scroll position after camera/gallery return (iOS/Android may jump).
    requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
    setTimeout(() => window.scrollTo({ top: scrollY }), 120);
  }

  async function handleDelete() {
    if (!confirm("Supprimer cette photo ?")) return;
    await deletePhoto(criId, slot);
    onChange(false);
  }

  async function openAnnotate() {
    const p = await getPhoto(criId, slot);
    if (p) setAnnotating(p.blob);
  }

  async function handleAnnotatedSave(edited: Blob) {
    await savePhoto(criId, slot, edited);
    setAnnotating(null);
    // Force preview refresh.
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
            <img src={preview} alt={label} loading="lazy" decoding="async" className="h-40 w-full object-cover" />
          </button>
          <div className="grid grid-cols-2 gap-2">
            <SlotBtn icon={Eye} label="Voir" onClick={() => setViewing(true)} />
            <SlotBtn icon={Pencil} label="Annoter" onClick={() => void openAnnotate()} primary />
            <SlotBtn
              icon={RefreshCw}
              label="Remplacer"
              onClick={() => setCameraOpen(true)}
            />
            <SlotBtn icon={Trash2} label="Supprimer" onClick={handleDelete} danger />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          <SlotBtn icon={Camera} label="Camera" onClick={() => setCameraOpen(true)} primary />
          <SlotBtn icon={ImageIcon} label="Galerie" onClick={() => galRef.current?.click()} />
          <SlotBtn icon={FolderOpen} label="Fichiers" onClick={() => fileRef.current?.click()} />
        </div>
      )}

      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <input
        ref={galRef}
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {/* Sélecteur Android complet : Galerie, Téléchargements, Fichiers, Documents, Drive… */}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
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
        onCapture={async (blob) => {
          await savePhoto(criId, slot, blob);
          onChange(true);
        }}
      />

      {annotating && (
        <PhotoAnnotator
          blob={annotating}
          onCancel={() => setAnnotating(null)}
          onSave={(b) => void handleAnnotatedSave(b)}
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
