import jsPDF from 'jspdf';
import { StoredIntervention, StoredPhoto } from '@/lib/storage/database';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

class ReportExportService {
  /**
   * Export intervention as PDF report
   */
  async exportInterventionPDF(
    intervention: StoredIntervention,
    photos: StoredPhoto[]
  ): Promise<Blob> {
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPosition = 20;

    // Header
    doc.setFontSize(20);
    doc.text('CRI-BLO Evidence Report', pageWidth / 2, yPosition, {
      align: 'center',
    });
    yPosition += 20;

    // Intervention Info
    doc.setFontSize(12);
    doc.text('Intervention Details', 20, yPosition);
    yPosition += 10;

    doc.setFontSize(10);
    const interventionInfo = [
      ['ID:', intervention.id],
      ['Date:', new Date(intervention.createdAt).toLocaleDateString('fr-FR')],
      ['Status:', intervention.status],
      ['Type:', intervention.data.type || 'N/A'],
    ];

    for (const [label, value] of interventionInfo) {
      doc.text(`${label} ${value}`, 20, yPosition);
      yPosition += 8;
    }

    yPosition += 10;

    // Photos
    if (photos.length > 0) {
      doc.setFontSize(12);
      doc.text(`Evidence Photos (${photos.length})`, 20, yPosition);
      yPosition += 10;

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];

        // Check if we need a new page
        if (yPosition > pageHeight - 80) {
          doc.addPage();
          yPosition = 20;
        }

        // Photo info
        doc.setFontSize(9);
        const photoDate = new Date(photo.metadata.timestamp);
        doc.text(
          `Photo ${i + 1} - ${photoDate.toLocaleTimeString('fr-FR')}`,
          20,
          yPosition
        );
        yPosition += 6;

        if (photo.metadata.coordinates) {
          doc.text(
            `GPS: ${photo.metadata.coordinates.latitude.toFixed(6)}, ${photo.metadata.coordinates.longitude.toFixed(6)}`,
            20,
            yPosition
          );
          yPosition += 6;
        }

        // Add thumbnail if watermarked
        if (photo.watermarked) {
          try {
            doc.addImage(
              photo.watermarked,
              'JPEG',
              20,
              yPosition,
              170,
              127
            );
            yPosition += 135;
          } catch (error) {
            console.warn('Failed to add photo to PDF:', error);
          }
        }

        yPosition += 10;
      }
    }

    return doc.output('blob');
  }

  /**
   * Export as JSON
   */
  async exportAsJSON(
    intervention: StoredIntervention,
    photos: StoredPhoto[]
  ): Promise<string> {
    const exportData = {
      intervention: {
        ...intervention,
        photos: photos.map((p) => ({
          id: p.id,
          metadata: p.metadata,
          timestamp: p.createdAt,
        })),
      },
      exportedAt: new Date().toISOString(),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export as CSV for spreadsheet
   */
  async exportAsCSV(
    intervention: StoredIntervention,
    photos: StoredPhoto[]
  ): Promise<string> {
    const rows: string[] = [];

    // Header
    rows.push(
      'Photo #,Timestamp,GPS Latitude,GPS Longitude,GPS Accuracy (m),Address,Section'
    );

    // Data rows
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const row = [
        i + 1,
        new Date(photo.metadata.timestamp).toISOString(),
        photo.metadata.coordinates?.latitude || '',
        photo.metadata.coordinates?.longitude || '',
        photo.metadata.coordinates?.accuracy || '',
        photo.metadata.address || '',
        photo.metadata.section || '',
      ];
      rows.push(row.map((v) => `"${v}"`).join(','));
    }

    return rows.join('\n');
  }

  /**
   * Save file to device storage
   */
  async saveFile(
    fileName: string,
    content: string | Blob,
    directory: 'documents' | 'downloads' = 'documents'
  ): Promise<string> {
    try {
      let data: string;

      if (content instanceof Blob) {
        // Convert blob to base64
        data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(content);
        });
      } else {
        // Already a string, convert to base64
        data = btoa(content);
      }

      const path = `reports/${fileName}`;
      const dirEnum = directory === 'downloads' ? Directory.Documents : Directory.Documents;

      const result = await Filesystem.writeFile({
        path,
        data,
        directory: dirEnum,
        encoding: Encoding.UTF8,
      });

      return result.uri;
    } catch (error) {
      console.error('Failed to save file:', error);
      throw error;
    }
  }

  /**
   * Share file (native share intent)
   */
  async shareFile(filePath: string, mimeType: string): Promise<void> {
    try {
      // Note: This would require Capacitor Share plugin
      // Placeholder for implementation
      console.log(`Sharing file: ${filePath} (${mimeType})`);
    } catch (error) {
      console.error('Failed to share file:', error);
      throw error;
    }
  }
}

export const reportExportService = new ReportExportService();
export default ReportExportService;