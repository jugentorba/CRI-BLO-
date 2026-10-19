import ExcelJS from "exceljs";
import JSZip from "jszip";

// ExcelJS does not always parse workbook XML generated using <x:sheets>
// instead of the default OOXML namespace.
export async function loadCriWorkbook(data: ArrayBuffer): Promise<ExcelJS.Workbook> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data);
    if (workbook.worksheets?.length) return workbook;
  } catch {
    // Try an equivalent namespace representation without changing cell data.
  }
  const zip = await JSZip.loadAsync(data, { checkCRC32: true });
  let modified = false;
  for (const name of Object.keys(zip.files)) {
    if (!name.endsWith(".xml")) continue;
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async("string");
    if (!xml.includes('xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')) continue;
    const normalized = xml
      .replace(/(<\/?)x:/g, "$1")
      .replace(/xmlns:x="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main"/g,
        'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"');
    if (normalized !== xml) { zip.file(name, normalized); modified = true; }
  }
  if (!modified) throw new Error("Classeur Excel illisible : format non reconnu.");
  const bytes = await zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  if (!workbook.worksheets?.length) throw new Error("Classeur Excel sans feuilles lisibles.");
  return workbook;
}
