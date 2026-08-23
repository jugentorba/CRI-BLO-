import { useRef, useState } from 'react';
import { CameraPhoto, cameraService } from '@/lib/camera/CameraService';
import { CameraView } from '@/components/CameraView';

export interface UseFieldCameraResult {
  photos: CameraPhoto[];
  isOpen: boolean;
  isCapturing: boolean;
  error: Error | null;
  openCamera: () => void;
  closeCamera: () => void;
  capturePhoto: () => Promise<void>;
  deletePhoto: (photoId: string) => void;
  clearAllPhotos: () => void;
  renderCameraView: () => JSX.Element | null;
}

/**
 * React hook for field-optimized camera operations
 */
export function useFieldCamera(): UseFieldCameraResult {
  const [photos, setPhotos] = useState<CameraPhoto[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout>();

  const openCamera = () => {
    setError(null);
    setIsOpen(true);
  };

  const closeCamera = () => {
    setIsOpen(false);
  };

  const capturePhoto = async () => {
    try {
      setIsCapturing(true);
      setError(null);

      const photo = await cameraService.takeSinglePhoto({
        quality: 90,
        allowEditing: false,
        source: 'camera',
      });

      setPhotos((prev) => [...prev, photo]);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Camera error');
      setError(error);

      // Clear error after 5 seconds
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = setTimeout(() => setError(null), 5000);
    } finally {
      setIsCapturing(false);
    }
  };

  const deletePhoto = (photoId: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  const clearAllPhotos = () => {
    setPhotos([]);
  };

  const renderCameraView = () => {
    if (!isOpen) return null;

    return (
      <CameraView
        onPhotoCapture={(photo) => {
          setPhotos((prev) => [...prev, photo]);
        }}
        onClose={closeCamera}
        onError={setError}
        photoCount={photos.length}
      />
    );
  };

  return {
    photos,
    isOpen,
    isCapturing,
    error,
    openCamera,
    closeCamera,
    capturePhoto,
    deletePhoto,
    clearAllPhotos,
    renderCameraView,
  };
}

export default useFieldCamera;