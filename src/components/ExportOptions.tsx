import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  FileText,
  Download,
  Loader,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { StoredIntervention, StoredPhoto } from '@/lib/storage/database';

interface ExportOptionsProps {
  intervention: StoredIntervention;
  photos: StoredPhoto[];
  onExportPDF: () => Promise<void>;
  onExportJSON: () => Promise<void>;
  onExportCSV: () => Promise<void>;
  isExporting: boolean;
  error?: Error | null;
}

export function ExportOptions({
  intervention,
  photos,
  onExportPDF,
  onExportJSON,
  onExportCSV,
  isExporting,
  error,
}: ExportOptionsProps) {
  const [completed, setCompleted] = useState<string | null>(null);

  const handleExport = async (
    format: string,
    exportFn: () => Promise<void>
  ) => {
    try {
      await exportFn();
      setCompleted(format);
      setTimeout(() => setCompleted(null), 3000);
    } catch (err) {
      console.error(`Export failed:`, err);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Export Evidence
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Button
            onClick={() => handleExport('PDF', onExportPDF)}
            disabled={isExporting || photos.length === 0}
            className="w-full bg-red-600 hover:bg-red-700"
            size="sm"
          >
            {completed === 'PDF' ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                PDF Exported
              </>
            ) : isExporting ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export as PDF
              </>
            )}
          </Button>

          <Button
            onClick={() => handleExport('JSON', onExportJSON)}
            disabled={isExporting}
            variant="outline"
            className="w-full"
            size="sm"
          >
            {completed === 'JSON' ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                JSON Exported
              </>
            ) : isExporting ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export as JSON
              </>
            )}
          </Button>

          <Button
            onClick={() => handleExport('CSV', onExportCSV)}
            disabled={isExporting}
            variant="outline"
            className="w-full"
            size="sm"
          >
            {completed === 'CSV' ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                CSV Exported
              </>
            ) : isExporting ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export as CSV
              </>
            )}
          </Button>
        </div>

        <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-700">
          <strong>{photos.length}</strong> photo(s) with GPS watermarks ready to
          export
        </div>
      </CardContent>
    </Card>
  );
}

export default ExportOptions;