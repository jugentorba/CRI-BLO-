import { useState, useCallback } from 'react';
import { CameraPhoto } from '@/lib/camera/CameraService';
import {
  photoWatermarkService,
  WatermarkData,
} from '@/lib/photo/PhotoWatermarkService';

export interface UsePhotoWatermarkResult {
  watermarkPhoto: (
    photo: CameraPhoto,
    data: WatermarkData
  ) => Promise<string>;
  watermarkBatch: (
    photos: CameraPhoto[],
    data: WatermarkData,
    onProgress?: (current: number, total: number) => void
  ) => Promise<Array<{ id: string; watermarked: string }>>;
  createThumbnail: (base64: string) => Promise<string>;
  isProcessing: boolean;
  error: Error | null;
}

export function usePhotoWatermark(): UsePhotoWatermarkResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const watermarkPhoto = useCallback(
    async (photo: CameraPhoto, data: WatermarkData): Promise<string> => {
      try {
        setIsProcessing(true);
        setError(null);

        if (!photo.base64) {
          throw new Error('Photo data not available');
        }

        const watermarked = await photoWatermarkService.watermarkPhoto(
          photo.base64,
          data
        );

        return watermarked;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Watermarking failed');
        setError(error);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const watermarkBatch = useCallback(
    async (
      photos: CameraPhoto[],
      data: WatermarkData,
      onProgress?: (current: number, total: number) => void
    ): Promise<Array<{ id: string; watermarked: string }>> => {
      try {
        setIsProcessing(true);
        setError(null);

        const photoData = photos
          .filter((p) => p.base64)
          .map((p) => ({
            id: p.id,
            base64: p.base64!,
          }));

        const results = await photoWatermarkService.watermarkBatch(
          photoData,
          data,
          undefined,
          onProgress
        );

        return results;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Batch watermarking failed');
        setError(error);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const createThumbnail = useCallback(
    async (base64: string): Promise<string> => {
      try {
        return await photoWatermarkService.createThumbnail(base64);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Thumbnail creation failed');
        setError(error);
        throw error;
      }
    },
    []
  );

  return {
    watermarkPhoto,
    watermarkBatch,
    createThumbnail,
    isProcessing,
    error,
  };
}

export default usePhotoWatermark;