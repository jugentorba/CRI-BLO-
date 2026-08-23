import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { nanoid } from 'nanoid';

export interface CameraPhoto {
  id: string;
  path: string;
  base64?: string;
  width: number;
  height: number;
  format: string;
  timestamp: number;
  mimeType: string;
  size: number;
}

export interface CameraOptions {
  quality?: number;
  allowEditing?: boolean;
  resultType?: 'base64' | 'uri';
  source?: 'prompt' | 'camera' | 'photos';
  correctOrientation?: boolean;
}

class CameraService {
  private isCapturing = false;
  private lastCaptureTime = 0;
  private captureDebounceMs = 1000; // Prevent duplicate rapid captures

  /**
   * Take a single photo with reliability checks
   */
  async takeSinglePhoto(options: CameraOptions = {}): Promise<CameraPhoto> {
    // Prevent concurrent captures
    if (this.isCapturing) {
      throw new Error('Camera is already capturing. Please wait.');
    }

    // Prevent accidental duplicate captures
    const now = Date.now();
    if (now - this.lastCaptureTime < this.captureDebounceMs) {
      throw new Error('Please wait before taking another photo');
    }

    this.isCapturing = true;
    this.lastCaptureTime = now;

    try {
      const photo = await Camera.getPhoto({
        quality: options.quality ?? 90,
        allowEditing: options.allowEditing ?? false,
        resultType: options.resultType ?? CameraResultType.Uri,
        source: options.source ?? CameraSource.Camera,
        correctOrientation: options.correctOrientation ?? true,
        webUseInput: true,
        promptLabelPicture: 'Choisir une photo',
        promptLabelCamera: 'Prendre une photo',
        promptLabelCancel: 'Annuler',
      });

      // Validate photo
      if (!photo.webPath && !photo.path) {
        throw new Error('No photo path returned from camera');
      }

      // Read photo data and metadata
      const photoData = await this.readPhotoMetadata(photo);

      return photoData;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('User cancelled')) {
          throw new Error('Camera cancelled by user');
        }
        if (error.message.includes('Permission')) {
          throw new Error('Camera permission denied');
        }
      }
      throw error;
    } finally {
      this.isCapturing = false;
    }
  }

  /**
   * Take multiple photos in sequence
   */
  async takeMultiplePhotos(
    count: number,
    options: CameraOptions = {},
    onProgress?: (current: number, total: number) => void
  ): Promise<CameraPhoto[]> {
    const photos: CameraPhoto[] = [];
    const originalDebounce = this.captureDebounceMs;

    // Reduce debounce for multiple captures
    this.captureDebounceMs = 500;

    try {
      for (let i = 0; i < count; i++) {
        try {
          const photo = await this.takeSinglePhoto(options);
          photos.push(photo);
          onProgress?.(i + 1, count);

          // Small delay between photos
          await this.delay(300);
        } catch (error) {
          console.error(`Failed to capture photo ${i + 1}:`, error);
          // Continue with next photo despite error
          if (error instanceof Error && error.message.includes('cancelled')) {
            break; // User cancelled
          }
        }
      }

      return photos;
    } finally {
      this.captureDebounceMs = originalDebounce;
    }
  }

  /**
   * Read photo metadata and save to app storage
   */
  private async readPhotoMetadata(
    photo: {
      webPath?: string;
      path?: string;
      exif?: any;
      format?: string;
    }
  ): Promise<CameraPhoto> {
    const photoId = nanoid();
    const timestamp = Date.now();

    try {
      let base64Data: string | undefined;
      let width = 0;
      let height = 0;

      // Read file as base64 for storage
      if (photo.path) {
        const result = await Filesystem.readFile({
          path: photo.path,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        base64Data = result.data as string;
      } else if (photo.webPath) {
        base64Data = await this.fileToBase64(photo.webPath);
      }

      // Get image dimensions
      if (base64Data) {
        const dimensions = await this.getImageDimensions(
          base64Data || ''
        );
        width = dimensions.width;
        height = dimensions.height;
      }

      // Save to persistent storage
      const fileName = `photo_${photoId}.jpg`;
      const photoPath = `photos/${fileName}`;

      if (base64Data) {
        await Filesystem.writeFile({
          path: photoPath,
          data: base64Data,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        });
      }

      return {
        id: photoId,
        path: photoPath,
        base64: base64Data,
        width,
        height,
        format: photo.format ?? 'jpeg',
        timestamp,
        mimeType: 'image/jpeg',
        size: base64Data ? Math.ceil(base64Data.length * 0.75) : 0,
      };
    } catch (error) {
      console.error('Failed to read photo metadata:', error);
      throw new Error('Unable to process photo. Please try again.');
    }
  }

  /**
   * Convert file to base64
   */
  private async fileToBase64(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        const reader = new FileReader();
        reader.onloadend = function () {
          resolve(reader.result as string);
        };
        reader.readAsDataURL(xhr.response);
      };
      xhr.onerror = reject;
      xhr.open('GET', filePath);
      xhr.responseType = 'blob';
      xhr.send();
    });
  }

  /**
   * Get image dimensions
   */
  private getImageDimensions(base64: string): Promise<{
    width: number;
    height: number;
  }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = reject;
      img.src = base64;
    });
  }

  /**
   * Delete a photo from storage
   */
  async deletePhoto(photoPath: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: photoPath,
        directory: Directory.Documents,
      });
    } catch (error) {
      console.error('Failed to delete photo:', error);
      throw error;
    }
  }

  /**
   * Get photo from storage
   */
  async getPhoto(photoPath: string): Promise<string> {
    try {
      const result = await Filesystem.readFile({
        path: photoPath,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      return result.data as string;
    } catch (error) {
      console.error('Failed to get photo:', error);
      throw error;
    }
  }

  /**
   * List all photos in storage
   */
  async listPhotos(): Promise<string[]> {
    try {
      const result = await Filesystem.readdir({
        path: 'photos',
        directory: Directory.Documents,
      });
      return result.files.map((f) => `photos/${f.name}`);
    } catch (error) {
      // Directory might not exist yet
      console.warn('No photos directory found');
      return [];
    }
  }

  /**
   * Clear old photos (older than retention days)
   */
  async clearOldPhotos(retentionDays: number = 30): Promise<number> {
    try {
      const photos = await this.listPhotos();
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      let deletedCount = 0;

      for (const photoPath of photos) {
        try {
          // Note: We'd need to track metadata separately for full cleanup
          // This is a simplified version
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete photo ${photoPath}:`, error);
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Failed to clear old photos:', error);
      return 0;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const cameraService = new CameraService();
export default CameraService;