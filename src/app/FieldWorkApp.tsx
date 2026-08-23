import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocation } from '@/hooks/useLocation';
import { useSync } from '@/hooks/useSync';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { useFieldCamera } from '@/hooks/useFieldCamera';
import { usePhotoWatermark } from '@/hooks/usePhotoWatermark';
import { useExport } from '@/hooks/useExport';
import { useAIAssistant } from '@/hooks/useAIAssistant';
import FieldWorkDashboard from '@/components/FieldWorkDashboard';
import CameraView from '@/components/CameraView';
import PhotoEvidenceView from '@/components/PhotoEvidenceView';
import GPSStatusIndicator from '@/components/GPSStatusIndicator';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import AIAssistantView from '@/components/AIAssistantView';
import ExportOptions from '@/components/ExportOptions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  MessageCircle,
  Settings,
  Database,
  LogOut,
} from 'lucide-react';

export function FieldWorkApp() {
  const location = useLocation();
  const sync = useSync();
  const storage = useOfflineStorage();
  const camera = useFieldCamera();
  const watermark = usePhotoWatermark();
  const exportHook = useExport();
  const aiAssistant = useAIAssistant(process.env.REACT_APP_OPENAI_KEY);

  const [currentIntervention, setCurrentIntervention] = useState<any>(null);
  const [showAI, setShowAI] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Load intervention on mount
  useEffect(() => {
    const loadIntervention = async () => {
      const interventions = await storage.getAllInterventions();
      if (interventions.length > 0) {
        const lastIntervention = interventions[interventions.length - 1];
        setCurrentIntervention(lastIntervention);
        await aiAssistant.updateContext(lastIntervention);
      }
    };

    loadIntervention();
  }, []);

  // Update AI context when location changes
  useEffect(() => {
    if (location.location && currentIntervention) {
      aiAssistant.setLocationContext(
        location.location.coordinates,
        location.location.address?.formatted
      );
    }
  }, [location.location]);

  // Auto-watermark photos
  useEffect(() => {
    const watermarkPhotos = async () => {
      if (!camera.photos.length || !location.location) return;

      for (const photo of camera.photos) {
        if (!photo.watermarked) {
          try {
            await watermark.watermarkPhoto(photo, {
              timestamp: location.location.lastUpdate,
              coordinates: location.location.coordinates,
              address: location.location.address,
            });
          } catch (error) {
            console.error('Failed to watermark photo:', error);
          }
        }
      }
    };

    watermarkPhotos();
  }, [camera.photos, location.location]);

  const handleStartWork = async () => {
    try {
      // Acquire GPS first
      await location.acquireLocation();

      // Create new intervention
      const intervention = await storage.createIntervention({
        type: 'Fiber Intervention',
        location: location.location?.address?.formatted,
        createdAt: Date.now(),
      });

      setCurrentIntervention(intervention);
      await aiAssistant.updateContext(intervention);
    } catch (error) {
      console.error('Failed to start work:', error);
    }
  };

  const handleExport = async () => {
    if (!currentIntervention) return;

    try {
      const pdf = await exportHook.exportPDF(
        currentIntervention,
        camera.photos
      );
      const fileName = `intervention_${currentIntervention.id.slice(0, 8)}_${new Date().toISOString().split('T')[0]}.pdf`;
      await exportHook.saveFile(fileName, pdf);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-orange-600">CRI-BLO</h1>
            <p className="text-xs text-gray-600">Field Evidence System</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAI(!showAI)}
            >
              <MessageCircle className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="bg-white border-b px-4 py-2 flex gap-2 overflow-x-auto">
        <GPSStatusIndicator
          status={location.status}
          accuracy={location.accuracy}
          isCompact
        />
        <SyncStatusIndicator
          networkStatus={sync.networkStatus}
          isSyncing={sync.isSyncing}
          pendingCount={sync.pendingSyncCount}
          isCompact
        />
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-4">
        {showSettings ? (
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">Storage Stats</h3>
                <div
                  className="text-sm text-gray-600 space-y-1"
                  onClick={async () => {
                    const stats = await storage.getStorageStats();
                    console.log('Storage stats:', stats);
                  }}
                >
                  <div>Click to view storage statistics</div>
                </div>
              </div>
              <Button variant="destructive" className="w-full">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </CardContent>
          </Card>
        ) : showAI ? (
          <AIAssistantView
            messages={aiAssistant.messages}
            isLoading={aiAssistant.isLoading}
            error={aiAssistant.error}
            onSendMessage={aiAssistant.sendMessage}
            onClose={() => setShowAI(false)}
          />
        ) : (
          <Tabs defaultValue="work" className="w-full">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="work">Work</TabsTrigger>
              <TabsTrigger value="photos">Photos</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>

            <TabsContent value="work" className="space-y-4">
              <FieldWorkDashboard
                intervention={currentIntervention}
                photos={camera.photos}
                onStartWork={handleStartWork}
                onOpenCamera={camera.openCamera}
                onViewPhotos={() => {}} // Navigate to photos tab
                onExport={handleExport}
              />
            </TabsContent>

            <TabsContent value="photos" className="space-y-4">
              {camera.photos.length === 0 ? (
                <Card className="border-2 border-dashed">
                  <CardContent className="pt-8 pb-8 text-center">
                    <p className="text-gray-600 mb-4">No photos yet</p>
                    <Button
                      onClick={camera.openCamera}
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      Take First Photo
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                camera.photos.map((photo) => (
                  <PhotoEvidenceView
                    key={photo.id}
                    photo={photo}
                    watermarkData={{
                      timestamp: location.location?.lastUpdate || Date.now(),
                      coordinates: location.location?.coordinates,
                      address: location.location?.address,
                    }}
                    onDelete={() => camera.deletePhoto(photo.id)}
                    onExport={() => {}}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="export" className="space-y-4">
              {currentIntervention ? (
                <ExportOptions
                  intervention={currentIntervention}
                  photos={camera.photos}
                  onExportPDF={() =>
                    exportHook.exportPDF(currentIntervention, camera.photos)
                  }
                  onExportJSON={() =>
                    exportHook.exportJSON(currentIntervention, camera.photos)
                  }
                  onExportCSV={() =>
                    exportHook.exportCSV(currentIntervention, camera.photos)
                  }
                  isExporting={exportHook.isExporting}
                  error={exportHook.error}
                />
              ) : (
                <Card className="border-2 border-dashed">
                  <CardContent className="pt-8 pb-8 text-center">
                    <p className="text-gray-600">Start an intervention first</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Camera overlay */}
      {camera.renderCameraView()}
    </div>
  );
}

export default FieldWorkApp;