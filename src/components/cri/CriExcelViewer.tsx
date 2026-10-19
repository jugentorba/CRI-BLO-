import { useEffect, useState } from "react";
import { X, FileSpreadsheet } from "lucide-react";
import { loadCriWorkbook } from "@/lib/import/workbook";

type SheetPreview = {name:string; rows:string[][]; images:string[]};
function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toLocaleString("fr-FR");
  if (typeof v === "object") {
    const rich = v as {text?:string;richText?:Array<{text:string}>;result?:unknown};
    if (rich.text) return rich.text;
    if (rich.richText) return rich.richText.map(x=>x.text).join("");
    if (rich.result != null) return String(rich.result);
    return "";
  }
  return String(v);
}
export function CriExcelViewer({file,onClose}:{file:File;onClose:()=>void}) {
  const [sheets,setSheets] = useState<SheetPreview[]>([]);
  const [active,setActive] = useState(0);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    let cancelled=false;
    void (async ()=>{
      try {
        const wb = await loadCriWorkbook(await file.arrayBuffer());
        const output:SheetPreview[]=[];
        for (const ws of wb.worksheets) {
          const rows:string[][]=[];
          const lastRow=Math.min(ws.rowCount,500);
          const lastCol=Math.min(ws.columnCount||12,35);
          for(let r=1;r<=lastRow;r++){
            const row:string[]=[];
            for(let c=1;c<=lastCol;c++) row.push(cellText(ws.getCell(r,c).value));
            rows.push(row);
          }
          const images:string[]=[];
          for(const img of ws.getImages()){
            const entry=wb.getImage(img.imageId);
            if (!entry?.buffer) continue;
            const type=entry.extension==="png"?"image/png":"image/jpeg";
            const bytes=new Uint8Array(entry.buffer);
            const blob=new Blob([bytes],{type});
            images.push(URL.createObjectURL(blob));
          }
          output.push({name:ws.name,rows,images});
        }
        if(cancelled){output.forEach(s=>s.images.forEach(URL.revokeObjectURL));return;}
        setSheets(output);
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:String(e));}
      finally{if(!cancelled)setLoading(false);}
    })();
    return ()=>{cancelled=true;};
  },[file]);
  useEffect(()=>()=>{sheets.forEach(s=>s.images.forEach(URL.revokeObjectURL));},[sheets]);
  const sheet=sheets[active];
  return <div className="fixed inset-0 z-[95] flex flex-col bg-background">
    <div className="flex items-center gap-2 border-b p-3"><FileSpreadsheet className="h-5 w-5"/><div className="min-w-0 flex-1"><div className="truncate font-semibold">{file.name}</div><div className="text-xs text-muted-foreground">Aperçu Excel en lecture seule</div></div><button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg border p-2"><X className="h-4 w-4"/></button></div>
    {loading?<p className="p-4">Ouverture du classeur…</p>:error?<p className="m-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>:<>
      <div className="flex gap-2 overflow-x-auto border-b p-2">{sheets.map((s,i)=><button key={i} type="button" onClick={()=>setActive(i)} className={"shrink-0 rounded-lg px-3 py-2 text-xs "+(active===i?"bg-primary text-primary-foreground":"bg-muted")}>{s.name}</button>)}</div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <table className="border-collapse text-xs"><tbody>{sheet?.rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j} className="min-w-20 max-w-64 whitespace-pre-wrap break-words border px-2 py-1 align-top">{v}</td>)}</tr>)}</tbody></table>
        {!!sheet?.images.length&&<div className="mt-4 grid grid-cols-2 gap-2">{sheet.images.map((url,i)=><img key={i} src={url} alt={"Image "+(i+1)} className="w-full rounded border object-contain"/>)}</div>}
      </div>
    </>}
  </div>;
}
