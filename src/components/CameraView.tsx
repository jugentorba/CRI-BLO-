import React, { useRef, useState, useEffect } from 'react';
import { Camera, Settings, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CameraPhoto, cameraService } from '@/lib/camera/CameraService';
import { permissionManager } from '@/lib/permissions/PermissionManager';

interface CameraViewProps {
  onPhotoCapture: (photo: CameraPhoto) => void;
  onClose: () => void;
  onError: (error: Error) => void;
  photoCount?: number;
}

export function CameraView({
  onPhotoCapture,
  onClose,
  onError,
  photoCount = 0,
}: CameraViewProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    initializeCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const initializeCamera = async () => {
    try {
      // Check permission
      const granted = permissionManager.isGranted('camera');
      if (!granted) {
        setHasPermission(false);
        setError('Camera permission denied. Please enable it in settings.');
        return;
      }

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Camera initialization failed');
      setError(error.message);
      onError(error);
      setHasPermission(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      setError(null);

      // Draw video frame to canvas
      const context = canvasRef.current.getContext('2d');
      if (!context) throw new Error('Canvas context unavailable');

      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvasRef.current?.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to create image blob'));
          },
          'image/jpeg',
          0.9
        );
      });

      // Convert to base64
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const photo: CameraPhoto = {
            id: `photo_${Date.now()}`,
            path: `photos/photo_${Date.now()}.jpg`,
            base64,
            width: canvasRef.current?.width ?? 0,
            height: canvasRef.current?.height ?? 0,
            format: 'jpeg',
            timestamp: Date.now(),
            mimeType: 'image/jpeg',
            size: blob.size,
          };

          onPhotoCapture(photo);
        } catch (err) {
          const error = err instanceof Error ? err : new Error('Photo processing failed');
          setError(error.message);
          onError(error);
        }
      };
      reader.onerror = () => {
        const error = new Error('Failed to read image data');
        setError(error.message);
        onError(error);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Photo capture failed');
      setError(error.message);
      onError(error);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    initializeCamera();
  };

  if (!hasPermission) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <div className="p-6 space-y-4">
            <div className="flex justify-center">
              <Camera className="w-12 h-12 text-red-600" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold mb-2">Camera Permission Denied</h2>
              <p className="text-gray-600 text-sm mb-4">
                Camera access is required to capture evidence photos. Please enable it in your device settings.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Close
              </Button>
              <Button
                onClick={handleRetry}
                className="flex-1 bg-orange-600 hover:bg-orange-700"
              >
                <Settings className="w-4 h-4 mr-2" />
                Open Settings
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Camera View */}
      <div className="flex-1 relative bg-black overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Status overlay */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/50 to-transparent p-4">
          <div className="flex justify-between items-center">
            <div className="text-white font-semibold">
              Photo {photoCount + 1}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="w-6 h-6" />
            </Button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <Alert variant="destructive" className="max-w-sm">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        );
      </div>

      {/* Controls - Bottom bar */}
      <div className="bg-black border-t border-gray-800 p-6 flex justify-center gap-4">
        <Button
          variant="outline"
          onClick={onClose}
          className="text-white border-gray-600 hover:bg-gray-900"
        >
          <X className="w-5 h-5 mr-2" />
          Cancel
        </Button>

        <Button
          onClick={capturePhoto}
          disabled={isCapturing}
          className="bg-orange-600 hover:bg-orange-700 text-white rounded-full p-0 w-16 h-16 flex items-center justify-center"
          size="lg"
        >
          <Camera className="w-8 h-8" />
        </Button>

        <Button
          onClick={handleRetry}
          variant="outline"
          className="text-white border-gray-600 hover:bg-gray-900"
        >
          <RotateCcw className="w-5 h-5 mr-2" />
          Retry
        </Button>
      </div>
    </div>
  );
}

export default CameraView;