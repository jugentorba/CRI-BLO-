import ExcelJS from "exceljs";
import fs from "node:fs";

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(fs.readFileSync("public/cri_blo_template.xlsx"));

function safeValue(cell) {
  if (cell.isMerged && cell.master && cell.master.address !== cell.address) return "";
  const value = cell.value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text ?? "").join("");
    if (typeof value.text === "string") return value.text;
    if (value.result != null) return String(value.result);
    if (typeof value.formula === "string") return "=" + value.formula;
    if (typeof value.hyperlink === "string") return value.text ?? value.hyperlink;
    return "";
  }
  return String(value);
}

for (const ws of workbook.worksheets) {
  console.log("\n=== SHEET " + ws.name + " ===");
  const mergeKeys = Object.keys(ws._merges ?? {}).sort();
  if (mergeKeys.length) console.log("MERGES: " + mergeKeys.join(", "));
  const maxRow = ws.name === "FICHE SAV BLO" ? 60 : Math.min(ws.rowCount, 60);
  const maxCol = ws.name === "FICHE SAV BLO" ? 10 : Math.min(ws.columnCount, 12);
  for (let row = 1; row <= maxRow; row += 1) {
    const parts = [];
    for (let col = 1; col <= maxCol; col += 1) {
      const cell = ws.getCell(row, col);
      const value = safeValue(cell).trim();
      if (value) parts.push(cell.address + "=" + JSON.stringify(value));
    }
    if (parts.length) console.log(parts.join(" | "));
  }
}
