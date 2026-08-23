import { useState, useCallback } from 'react';
import { StoredIntervention, StoredPhoto } from '@/lib/storage/database';
import { reportExportService } from '@/lib/export/ReportExportService';

export interface UseExportResult {
  exportPDF: (
    intervention: StoredIntervention,
    photos: StoredPhoto[]
  ) => Promise<Blob>;
  exportJSON: (
    intervention: StoredIntervention,
    photos: StoredPhoto[]
  ) => Promise<string>;
  exportCSV: (
    intervention: StoredIntervention,
    photos: StoredPhoto[]
  ) => Promise<string>;
  saveFile: (
    fileName: string,
    content: string | Blob
  ) => Promise<string>;
  isExporting: boolean;
  error: Error | null;
}

export function useExport(): UseExportResult {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const wrapAsync = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        setIsExporting(true);
        setError(null);
        return await fn();
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Export error');
        setError(error);
        throw error;
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  return {
    exportPDF: (intervention, photos) =>
      wrapAsync(() => reportExportService.exportInterventionPDF(intervention, photos)),
    exportJSON: (intervention, photos) =>
      wrapAsync(() => reportExportService.exportAsJSON(intervention, photos)),
    exportCSV: (intervention, photos) =>
      wrapAsync(() => reportExportService.exportAsCSV(intervention, photos)),
    saveFile: (fileName, content) =>
      wrapAsync(() => reportExportService.saveFile(fileName, content)),
    isExporting,
    error,
  };
}

export default useExport;