import { Capacitor } from "@capacitor/core";
import { downloadBlob, pickExportFolder, writeFileToExportFolder } from "@/lib/export/folder";

/** Android must confirm a complete native write before reporting backup success. */
export async function saveLocalBackup(name: string, blob: Blob): Promise<void> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    if ((await writeFileToExportFolder(name, blob)).wrote) return;
    const folder = await pickExportFolder();
    if (!folder) throw new Error("Sauvegarde annulée : aucun dossier sélectionné.");
    if (!(await writeFileToExportFolder(name, blob)).wrote) {
      throw new Error("Impossible d’enregistrer la sauvegarde. Choisissez un dossier accessible et réessayez.");
    }
    return;
  }
  downloadBlob(name, blob);
}
