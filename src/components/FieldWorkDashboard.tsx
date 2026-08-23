import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Clock,
  MapPin,
  Camera,
  FileText,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { StoredIntervention, StoredPhoto } from '@/lib/storage/database';
import { useLocation } from '@/hooks/useLocation';

interface FieldWorkDashboardProps {
  intervention?: StoredIntervention;
  photos: StoredPhoto[];
  onStartWork: () => void;
  onOpenCamera: () => void;
  onViewPhotos: () => void;
  onExport: () => void;
}

export function FieldWorkDashboard({
  intervention,
  photos,
  onStartWork,
  onOpenCamera,
  onViewPhotos,
  onExport,
}: FieldWorkDashboardProps) {
  const { location, status: gpsStatus } = useLocation();
  const [workProgress, setWorkProgress] = useState(0);

  // Calculate progress
  useEffect(() => {
    if (!intervention) {
      setWorkProgress(0);
      return;
    }

    let progress = 0;

    // 20% for intervention created
    progress += 20;

    // 20% for GPS acquired
    if (location) {
      progress += 20;
    }

    // 20% for photos taken
    if (photos.length > 0) {
      progress += 20;
    }

    // 20% for watermarking
    const watermarkedCount = photos.filter((p) => p.watermarked).length;
    if (watermarkedCount === photos.length && photos.length > 0) {
      progress += 20;
    }

    setWorkProgress(Math.min(progress, 100));
  }, [intervention, photos, location]);

  if (!intervention) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="pt-8 pb-8 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">No active intervention</p>
          <Button
            onClick={onStartWork}
            className="bg-orange-600 hover:bg-orange-700"
          >
            Start New Intervention
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">
                {intervention.data.type || 'Intervention'}
              </CardTitle>
              <p className="text-xs text-gray-600 mt-1">
                ID: {intervention.id.slice(0, 8)}
              </p>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                intervention.status === 'synced'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {intervention.status === 'synced' ? 'Synced' : 'Draft'}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Work Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={workProgress} className="h-2" />
          <p className="text-xs text-gray-600">Overall: {workProgress}% complete</p>

          {/* Progress items */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span>Intervention created</span>
            </div>

            <div
              className={`flex items-center gap-2 ${
                location ? 'text-green-600' : 'text-gray-400'
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span>GPS acquired ({gpsStatus})</span>
            </div>

            <div
              className={`flex items-center gap-2 ${
                photos.length > 0 ? 'text-green-600' : 'text-gray-400'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Photos captured ({photos.length})</span>
            </div>

            <div
              className={`flex items-center gap-2 ${
                photos.every((p) => p.watermarked) && photos.length > 0
                  ? 'text-green-600'
                  : 'text-gray-400'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>
                Watermarked ({photos.filter((p) => p.watermarked).length}/
                {photos.length})
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Location Info */}
      {location && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Location
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div>
              <span className="text-gray-600">Coordinates:</span>
              <p className="font-mono text-xs">
                {location.coordinates.latitude.toFixed(6)},
                {location.coordinates.longitude.toFixed(6)}
              </p>
            </div>
            <div>
              <span className="text-gray-600">Accuracy:</span>
              <p>±{Math.round(location.coordinates.accuracy)}m</p>
            </div>
            {location.address?.formatted && (
              <div>
                <span className="text-gray-600">Address:</span>
                <p>{location.address.formatted}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={onOpenCamera}
          variant="outline"
          className="border-orange-600 text-orange-600 hover:bg-orange-50"
        >
          <Camera className="w-4 h-4 mr-2" />
          Take Photo
        </Button>
        <Button
          onClick={onViewPhotos}
          disabled={photos.length === 0}
          variant="outline"
        >
          <FileText className="w-4 h-4 mr-2" />
          View ({photos.length})
        </Button>
      </div>

      {/* Export button */}
      {workProgress === 100 && (
        <Button
          onClick={onExport}
          className="w-full bg-green-600 hover:bg-green-700"
        >
          <FileText className="w-4 h-4 mr-2" />
          Export Evidence
        </Button>
      )}
    </div>
  );
}

export default FieldWorkDashboard;