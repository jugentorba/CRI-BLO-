import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  CheckCircle2,
  Loader,
  Download,
  Trash2,
} from 'lucide-react';
import { CameraPhoto } from '@/lib/camera/CameraService';
import {
  photoWatermarkService,
  WatermarkData,
} from '@/lib/photo/PhotoWatermarkService';
import { LocationCoordinates, LocationAddress } from '@/lib/location/LocationService';

interface PhotoEvidenceViewProps {
  photo: CameraPhoto;
  watermarkData: WatermarkData;
  onDelete: () => void;
  onExport: (watermarked: string) => void;
}

interface PhotoEvidenceState {
  status: 'original' | 'watermarking' | 'watermarked' | 'error';
  error: string | null;
  watermarkedImage: string | null;
  thumbnail: string | null;
}

export function PhotoEvidenceView({
  photo,
  watermarkData,
  onDelete,
  onExport,
}: PhotoEvidenceViewProps) {
  const [state, setState] = useState<PhotoEvidenceState>({
    status: 'original',
    error: null,
    watermarkedImage: null,
    thumbnail: null,
  });

  const applyWatermark = async () => {
    setState((prev) => ({
      ...prev,
      status: 'watermarking',
      error: null,
    }));

    try {
      if (!photo.base64) {
        throw new Error('Photo data unavailable');
      }

      const watermarked = await photoWatermarkService.watermarkPhoto(
        photo.base64,
        watermarkData
      );

      const thumbnail = await photoWatermarkService.createThumbnail(
        watermarked
      );

      setState((prev) => ({
        ...prev,
        status: 'watermarked',
        watermarkedImage: watermarked,
        thumbnail,
      }));
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Watermarking failed';
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: errorMsg,
      }));
    }
  };

  const getStatusIcon = () => {
    switch (state.status) {
      case 'watermarking':
        return <Loader className="w-5 h-5 text-blue-600 animate-spin" />;
      case 'watermarked':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return null;
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {getStatusIcon()}
            Evidence Photo
          </CardTitle>
          <div className="text-xs text-gray-600">
            {new Date(photo.timestamp).toLocaleTimeString('fr-FR')}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Watermark Data Summary */}
        <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
          <div>
            <span className="font-medium">Time: </span>
            {new Date(watermarkData.timestamp).toLocaleString('fr-FR')}
          </div>
          {watermarkData.coordinates && (
            <div>
              <span className="font-medium">GPS: </span>
              {watermarkData.coordinates.latitude.toFixed(6)},
              {watermarkData.coordinates.longitude.toFixed(6)} (
              ±{Math.round(watermarkData.coordinates.accuracy)}m)
            </div>
          )}
          {watermarkData.address?.formatted && (
            <div>
              <span className="font-medium">Address: </span>
              {watermarkData.address.formatted}
            </div>
          )}
        </div>

        {/* Image Preview */}
        {state.thumbnail && (
          <div className="rounded-lg overflow-hidden border-2 border-gray-200">
            <img
              src={state.thumbnail}
              alt="Evidence preview"
              className="w-full h-auto"
            />
          </div>
        )}

        {/* Error Message */}
        {state.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {state.status === 'original' && (
            <Button
              onClick={applyWatermark}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
              size="sm"
            >
              Apply Watermark
            </Button>
          )}

          {state.status === 'watermarked' && (
            <>
              <Button
                onClick={() => onExport(state.watermarkedImage!)}
                className="flex-1 bg-green-600 hover:bg-green-700"
                size="sm"
              >
                <Download className="w-4 h-4 mr-1" />
                Export
              </Button>
              <Button
                onClick={applyWatermark}
                variant="outline"
                size="sm"
              >
                Refresh
              </Button>
            </>
          )}

          <Button
            onClick={onDelete}
            variant="destructive"
            size="sm"
            className="ml-auto"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default PhotoEvidenceView;