import React from 'react';
import { MapPin, AlertCircle, CheckCircle2, Loader } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { GPSStatus } from '@/lib/location/LocationService';

interface GPSStatusIndicatorProps {
  status: GPSStatus;
  accuracy?: number;
  address?: string;
  onRetry?: () => void;
  isCompact?: boolean;
}

export function GPSStatusIndicator({
  status,
  accuracy,
  address,
  onRetry,
  isCompact = false,
}: GPSStatusIndicatorProps) {
  const getStatusIcon = () => {
    switch (status) {
      case 'acquired':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'acquiring':
        return <Loader className="w-5 h-5 text-blue-600 animate-spin" />;
      case 'error':
      case 'denied':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <MapPin className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'acquired':
        return `GPS Acquired (±${Math.round(accuracy || 0)}m)`;
      case 'acquiring':
        return 'Acquiring GPS...';
      case 'error':
        return 'GPS Error';
      case 'denied':
        return 'GPS Permission Denied';
      default:
        return 'GPS Idle';
    }
  };

  if (isCompact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {getStatusIcon()}
          {getStatusText()}
        </CardTitle>
      </CardHeader>
      {(address || (status === 'error' && onRetry)) && (
        <CardContent className="space-y-3">
          {address && (
            <div className="text-sm">
              <div className="text-gray-600 mb-1">Address:</div>
              <div className="font-medium">{address}</div>
            </div>
          )}

          {status === 'error' && onRetry && (
            <Button
              onClick={onRetry}
              size="sm"
              className="w-full bg-orange-600 hover:bg-orange-700"
            >
              Retry GPS
            </Button>
          )}

          {status === 'denied' && (
            <Alert variant="destructive">
              <AlertDescription>
                Location permission is required for evidence tagging.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default GPSStatusIndicator;