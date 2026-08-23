import React, { useState, useEffect } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { permissionManager, PermissionType } from '@/lib/permissions/PermissionManager';
import { PermissionFlow } from '@/lib/permissions/PermissionFlow';

interface PermissionScreenProps {
  onPermissionsGranted: () => void;
  onPermissionsFailed: (denied: string[]) => void;
}

export function PermissionScreen({
  onPermissionsGranted,
  onPermissionsFailed,
}: PermissionScreenProps) {
  const [permissionStatus, setPermissionStatus] = useState<
    Record<PermissionType, 'granted' | 'denied' | 'pending'>
  >({
    camera: 'pending',
    geolocation: 'pending',
    microphone: 'pending',
  });

  const [showRetryDialog, setShowRetryDialog] = useState(false);
  const [retryPermission, setRetryPermission] = useState<PermissionType | null>(null);
  const [canContinue, setCanContinue] = useState(false);

  useEffect(() => {
    initializePermissions();
  }, []);

  const initializePermissions = async () => {
    try {
      const result = await PermissionFlow.initializeAppPermissions();

      const newStatus = {
        camera: 'pending' as const,
        geolocation: 'pending' as const,
        microphone: 'pending' as const,
      };

      for (const [type, status] of result.granted.entries()) {
        newStatus[type] = status.state === 'granted' ? 'granted' : 'denied';
      }

      setPermissionStatus(newStatus);
      setCanContinue(result.success);

      if (result.success) {
        // All permissions granted, proceed immediately
        setTimeout(() => onPermissionsGranted(), 1000);
      } else if (result.denied) {
        // Some permissions denied
        onPermissionsFailed(result.denied);
      }
    } catch (error) {
      console.error('Permission initialization failed:', error);
    }
  };

  const handleRetryPermission = async () => {
    if (!retryPermission) return;

    try {
      const request = {
        type: retryPermission,
        critical: retryPermission !== 'microphone',
        description: permissionManager.getPermissionDescription(retryPermission),
        retryable: true,
      };

      const status = await permissionManager.retryPermission(request);

      setPermissionStatus((prev) => ({
        ...prev,
        [retryPermission]: status.state === 'granted' ? 'granted' : 'denied',
      }));

      setShowRetryDialog(false);
      setRetryPermission(null);

      // Check if we can now proceed
      if (PermissionFlow.canProceedToFieldWork()) {
        setCanContinue(true);
        setTimeout(() => onPermissionsGranted(), 500);
      }
    } catch (error) {
      console.error('Retry failed:', error);
    }
  };

  const handleContinueWithoutMicrophone = () => {
    if (PermissionFlow.canProceedToFieldWork()) {
      onPermissionsGranted();
    } else {
      alert('Camera and Location are required to continue');
    }
  };

  const getPermissionIcon = (status: 'granted' | 'denied' | 'pending') => {
    switch (status) {
      case 'granted':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'denied':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'pending':
        return <div className="w-5 h-5 rounded-full border-2 border-gray-400 border-t-orange-500 animate-spin" />;
    }
  };

  return (
    <div className="w-full h-screen bg-gradient-to-br from-orange-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-t-lg">
          <CardTitle>CRI-BLO Setup</CardTitle>
          <CardDescription className="text-orange-100">
            Initializing field application
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6 space-y-4">
          {/* Alert if something is wrong */}
          {Object.values(permissionStatus).some((s) => s === 'denied') && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Some permissions are required for field work
              </AlertDescription>
            </Alert>
          )}

          {/* Permission items */}
          <div className="space-y-3">
            {/* Camera */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3 flex-1">
                {getPermissionIcon(permissionStatus.camera)}
                <div>
                  <div className="font-medium">Camera</div>
                  <div className="text-sm text-gray-600">
                    Evidence photos
                  </div>
                </div>
              </div>
              {permissionStatus.camera === 'denied' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRetryPermission('camera');
                    setShowRetryDialog(true);
                  }}
                >
                  Retry
                </Button>
              )}
            </div>

            {/* Location */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3 flex-1">
                {getPermissionIcon(permissionStatus.geolocation)}
                <div>
                  <div className="font-medium">Location</div>
                  <div className="text-sm text-gray-600">
                    GPS coordinates
                  </div>
                </div>
              </div>
              {permissionStatus.geolocation === 'denied' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRetryPermission('geolocation');
                    setShowRetryDialog(true);
                  }}
                >
                  Retry
                </Button>
              )}
            </div>

            {/* Microphone (optional) */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3 flex-1">
                {getPermissionIcon(permissionStatus.microphone)}
                <div>
                  <div className="font-medium">Microphone</div>
                  <div className="text-sm text-gray-600">
                    Voice notes (optional)
                  </div>
                </div>
              </div>
              {permissionStatus.microphone === 'denied' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRetryPermission('microphone');
                    setShowRetryDialog(true);
                  }}
                >
                  Retry
                </Button>
              )}
            </div>
          </div>

          {/* Continue button */}
          {canContinue && (
            <Button
              onClick={handleContinueWithoutMicrophone}
              className="w-full bg-orange-600 hover:bg-orange-700"
              size="lg"
            >
              Continue to Field Work
            </Button>
          )}

          {!canContinue && permissionStatus.microphone === 'denied' && (
            <Button
              onClick={handleContinueWithoutMicrophone}
              className="w-full bg-orange-600 hover:bg-orange-700"
              size="lg"
            >
              Continue without Microphone
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Retry Dialog */}
      <AlertDialog open={showRetryDialog} onOpenChange={setShowRetryDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Enable {retryPermission} Permission?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {retryPermission === 'camera' &&
                'Camera access is required to capture evidence photos for your interventions.'}
              {retryPermission === 'geolocation' &&
                'Location access is needed to tag interventions with GPS coordinates.'}
              {retryPermission === 'microphone' &&
                'Microphone access allows you to record voice notes during interventions.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRetryPermission}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Enable Permission
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default PermissionScreen;