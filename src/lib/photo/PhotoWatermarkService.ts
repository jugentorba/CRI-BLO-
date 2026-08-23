import { LocationCoordinates, LocationAddress } from '@/lib/location/LocationService';

export interface WatermarkData {
  timestamp: number;
  coordinates?: LocationCoordinates;
  address?: LocationAddress;
  technician?: string;
  interventionId?: string;
}

export interface WatermarkConfig {
  fontSize: number;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  padding: number;
  opacity: number;
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
}

const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  fontSize: 14,
  fontFamily: 'Arial, sans-serif',
  textColor: '#FFFFFF',
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  padding: 12,
  opacity: 0.95,
  position: 'bottom-left',
};

class PhotoWatermarkService {
  /**
   * Apply watermark to image and return new image data
   * Preserves original image, creates watermarked version
   */
  async watermarkPhoto(
    imageBase64: string,
    watermarkData: WatermarkData,
    config: Partial<WatermarkConfig> = {}
  ): Promise<string> {
    const finalConfig = { ...DEFAULT_WATERMARK_CONFIG, ...config };

    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const watermarkedBase64 = this.drawWatermark(
              img,
              watermarkData,
              finalConfig
            );
            resolve(watermarkedBase64);
          } catch (error) {
            reject(error);
          }
        };
        img.onerror = () => {
          reject(new Error('Failed to load image for watermarking'));
        };
        img.src = imageBase64;
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Draw watermark on canvas
   */
  private drawWatermark(
    img: HTMLImageElement,
    watermarkData: WatermarkData,
    config: WatermarkConfig
  ): string {
    // Create canvas with same dimensions as image
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to get canvas context');
    }

    // Draw original image
    ctx.drawImage(img, 0, 0);

    // Prepare watermark text
    const watermarkText = this.formatWatermarkText(watermarkData);
    const lines = watermarkText.split('\n');

    // Calculate watermark box dimensions
    ctx.font = `${config.fontSize}px ${config.fontFamily}`;
    let maxWidth = 0;
    for (const line of lines) {
      const metrics = ctx.measureText(line);
      maxWidth = Math.max(maxWidth, metrics.width);
    }

    const boxWidth = maxWidth + config.padding * 2;
    const lineHeight = config.fontSize + 4;
    const boxHeight = lines.length * lineHeight + config.padding * 2;

    // Get position
    const pos = this.calculatePosition(
      canvas.width,
      canvas.height,
      boxWidth,
      boxHeight,
      config.position
    );

    // Draw background box
    ctx.fillStyle = config.backgroundColor;
    ctx.globalAlpha = config.opacity;
    ctx.fillRect(pos.x, pos.y, boxWidth, boxHeight);

    // Draw text
    ctx.fillStyle = config.textColor;
    ctx.globalAlpha = config.opacity;
    ctx.font = `${config.fontSize}px ${config.fontFamily}`;
    ctx.textBaseline = 'top';

    let currentY = pos.y + config.padding;
    for (const line of lines) {
      ctx.fillText(line, pos.x + config.padding, currentY);
      currentY += lineHeight;
    }

    // Reset alpha
    ctx.globalAlpha = 1.0;

    // Return as base64
    return canvas.toDataURL('image/jpeg', 0.95);
  }

  /**
   * Format watermark text from data
   */
  private formatWatermarkText(data: WatermarkData): string {
    const parts: string[] = [];

    // Date and Time
    const date = new Date(data.timestamp);
    const dateStr = date.toLocaleDateString('fr-FR');
    const timeStr = date.toLocaleTimeString('fr-FR', { hour12: false });
    parts.push(`${dateStr} ${timeStr}`);

    // GPS Coordinates
    if (data.coordinates) {
      const lat = data.coordinates.latitude.toFixed(6);
      const lon = data.coordinates.longitude.toFixed(6);
      const accuracy = Math.round(data.coordinates.accuracy);
      parts.push(`GPS: ${lat}, ${lon} (±${accuracy}m)`);
    } else {
      parts.push('GPS: Not available');
    }

    // Address
    if (data.address?.formatted) {
      parts.push(`Lieu: ${data.address.formatted}`);
    }

    return parts.join('\n');
  }

  /**
   * Calculate watermark position
   */
  private calculatePosition(
    canvasWidth: number,
    canvasHeight: number,
    boxWidth: number,
    boxHeight: number,
    position: string
  ): { x: number; y: number } {
    const padding = 10;

    switch (position) {
      case 'bottom-right':
        return {
          x: canvasWidth - boxWidth - padding,
          y: canvasHeight - boxHeight - padding,
        };
      case 'top-left':
        return { x: padding, y: padding };
      case 'top-right':
        return { x: canvasWidth - boxWidth - padding, y: padding };
      case 'bottom-left':
      default:
        return {
          x: padding,
          y: canvasHeight - boxHeight - padding,
        };
    }
  }

  /**
   * Batch watermark multiple photos
   */
  async watermarkBatch(
    photos: Array<{ base64: string; id: string }>,
    watermarkData: WatermarkData,
    config?: Partial<WatermarkConfig>,
    onProgress?: (current: number, total: number) => void
  ): Promise<Array<{ id: string; watermarked: string }>> {
    const results: Array<{ id: string; watermarked: string }> = [];

    for (let i = 0; i < photos.length; i++) {
      try {
        const watermarked = await this.watermarkPhoto(
          photos[i].base64,
          watermarkData,
          config
        );
        results.push({
          id: photos[i].id,
          watermarked,
        });
      } catch (error) {
        console.error(`Failed to watermark photo ${photos[i].id}:`, error);
        // Continue with next photo
      }
      onProgress?.(i + 1, photos.length);
    }

    return results;
  }

  /**
   * Create thumbnail from watermarked photo
   */
  async createThumbnail(
    watermarkedBase64: string,
    maxWidth: number = 200,
    maxHeight: number = 200
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate dimensions maintaining aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Unable to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => {
        reject(new Error('Failed to load image for thumbnail'));
      };
      img.src = watermarkedBase64;
    });
  }
}

export const photoWatermarkService = new PhotoWatermarkService();
export default PhotoWatermarkService;