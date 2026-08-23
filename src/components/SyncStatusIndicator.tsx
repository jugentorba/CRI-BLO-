import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Cloud,
  CloudOff,
  Loader,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { NetworkStatus } from '@/lib/sync/NetworkService';

interface SyncStatusIndicatorProps {
  networkStatus: NetworkStatus;
  isSyncing: boolean;
  pendingCount: number;
  error?: Error | null;
  onRetry?: () => void;
  isCompact?: boolean;
}

export function SyncStatusIndicator({
  networkStatus,
  isSyncing,
  pendingCount,
  error,
  onRetry,
  isCompact = false,
}: SyncStatusIndicatorProps) {
  const getStatusIcon = () => {
    if (isSyncing) {
      return <Loader className="w-5 h-5 text-blue-600 animate-spin" />;
    }
    if (networkStatus === 'offline') {
      return <CloudOff className="w-5 h-5 text-orange-600" />;
    }
    if (error) {
      return <AlertCircle className="w-5 h-5 text-red-600" />;
    }
    if (pendingCount > 0) {
      return <Cloud className="w-5 h-5 text-yellow-600" />;
    }
    return <CheckCircle2 className="w-5 h-5 text-green-600" />;
  };

  const getStatusText = () => {
    if (isSyncing) {
      return 'Syncing...';
    }
    if (networkStatus === 'offline') {
      return `Offline (${pendingCount} pending)`;
    }
    if (error) {
      return 'Sync error';
    }
    if (pendingCount > 0) {
      return `${pendingCount} pending`;
    }
    return 'Synced';
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
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            {getStatusText()}
          </div>
          {(isSyncing || error) && onRetry && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={isSyncing}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>

      {(error || networkStatus === 'offline') && (
        <CardContent className="space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}

          {networkStatus === 'offline' && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You are offline. Work will sync automatically when connectivity
                returns.
              </AlertDescription>
            </Alert>
          )}

          {onRetry && (
            <Button
              onClick={onRetry}
              className="w-full bg-orange-600 hover:bg-orange-700"
              size="sm"
            >
              Retry Sync
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default SyncStatusIndicator;