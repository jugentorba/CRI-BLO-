import { useEffect, useRef, useState } from "react";
import {
  Pen,
  ArrowUpRight,
  Circle as CircleIcon,
  Square,
  Type,
  Undo2,
  X,
  Check,
} from "lucide-react";

type Tool = "pen" | "arrow" | "rect" | "circle" | "text";

interface Point {
  x: number;
  y: number;
}

type Shape =
  | { type: "pen"; color: string; width: number; points: Point[] }
  | { type: "arrow"; color: string; width: number; from: Point; to: Point }
  | { type: "rect"; color: string; width: number; from: Point; to: Point }
  | { type: "circle"; color: string; width: number; from: Point; to: Point }
  | { type: "text"; color: string; size: number; at: Point; text: string };

const COLORS = ["#FF0000", "#FFD400", "#00A651", "#1E90FF", "#000000", "#FFFFFF"];

/**
 * Simple photo annotator. Draws the source image on a canvas, lets the
 * technician overlay pen strokes / arrows / shapes / text, then returns a
 * JPEG blob that replaces the original photo in storage.
 */
export function PhotoAnnotator({
  blob,
  onCancel,
  onSave,
}: {
  blob: Blob;
  onCancel: () => void;
  onSave: (edited: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>("#FF0000");
  const [width, setWidth] = useState<number>(4);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);

  // Load the source image once.
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setReady(true);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  // Redraw every time shapes or draft change.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !ready) return;
    // Fit canvas to image intrinsic size (max 2000 on longest edge).
    const maxDim = 2000;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    for (const s of shapes) drawShape(ctx, s);
    if (draft) drawShape(ctx, draft);
  }, [shapes, draft, ready]);

  function canvasPoint(ev: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * canvas.width,
      y: ((ev.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function onPointerDown(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "text") return; // handled on pointer up
    (ev.target as Element).setPointerCapture(ev.pointerId);
    const p = canvasPoint(ev);
    if (tool === "pen") setDraft({ type: "pen", color, width, points: [p] });
    else setDraft({ type: tool, color, width, from: p, to: p });
  }

  function onPointerMove(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (!draft) return;
    const p = canvasPoint(ev);
    if (draft.type === "pen") setDraft({ ...draft, points: [...draft.points, p] });
    else if (draft.type !== "text") setDraft({ ...draft, to: p });
  }

  function onPointerUp(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "text") {
      const p = canvasPoint(ev);
      const text = prompt("Texte à ajouter :");
      if (text && text.trim()) {
        setShapes((s) => [
          ...s,
          { type: "text", color, size: Math.max(18, width * 6), at: p, text: text.trim() },
        ]);
      }
      return;
    }
    if (!draft) return;
    setShapes((s) => [...s, draft]);
    setDraft(null);
  }

  function undo() {
    setShapes((s) => s.slice(0, -1));
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (b) => {
        if (b) onSave(b);
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/10 bg-black/70 p-2 text-white">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold active:scale-95"
        >
          <X className="h-3.5 w-3.5" /> Annuler
        </button>
        <span className="text-xs font-bold uppercase tracking-wide opacity-70">
          Annoter la photo
        </span>
        <button
          type="button"
          onClick={undo}
          disabled={shapes.length === 0}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold active:scale-95 disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" /> Annuler
        </button>
      </div>

      {/* Canvas area */}
      <div className="flex flex-1 items-center justify-center overflow-hidden p-2">
        {ready ? (
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="max-h-full max-w-full touch-none rounded"
            style={{ background: "#111" }}
          />
        ) : (
          <div className="text-white/70">Chargement…</div>
        )}
      </div>

      {/* Tool bar */}
      <div className="border-t border-white/10 bg-black/80 p-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
        <div className="mb-2 grid grid-cols-5 gap-2">
          <ToolBtn active={tool === "pen"} onClick={() => setTool("pen")} icon={Pen} label="Stylo" />
          <ToolBtn active={tool === "arrow"} onClick={() => setTool("arrow")} icon={ArrowUpRight} label="Flèche" />
          <ToolBtn active={tool === "rect"} onClick={() => setTool("rect")} icon={Square} label="Rect." />
          <ToolBtn active={tool === "circle"} onClick={() => setTool("circle")} icon={CircleIcon} label="Cercle" />
          <ToolBtn active={tool === "text"} onClick={() => setTool("text")} icon={Type} label="Texte" />
        </div>
        <div className="mb-2 flex items-center gap-2 overflow-x-auto">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Couleur ${c}`}
              className={
                "h-8 w-8 shrink-0 rounded-full border-2 " +
                (color === c ? "border-white" : "border-white/30")
              }
              style={{ background: c }}
            />
          ))}
          <div className="ml-auto flex items-center gap-2 text-white/90">
            <span className="text-xs">Trait</span>
            <input
              type="range"
              min={2}
              max={16}
              step={1}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              className="w-24 accent-[color:var(--color-primary)]"
            />
            <span className="w-6 text-right text-xs tabular-nums">{width}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-xs font-bold text-primary-foreground active:scale-[0.98]"
        >
          <Check className="h-3.5 w-3.5" /> Enregistrer la photo annotée
        </button>
      </div>
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Pen;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex h-10 flex-col items-center justify-center gap-0.5 rounded-md border text-[9px] font-bold uppercase active:scale-95 " +
        (active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-white/20 bg-white/5 text-white")
      }
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.type === "text") {
    ctx.fillStyle = s.color;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = Math.max(2, s.size / 10);
    ctx.font = `bold ${s.size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.textBaseline = "top";
    ctx.strokeText(s.text, s.at.x, s.at.y);
    ctx.fillText(s.text, s.at.x, s.at.y);
    return;
  }
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.fillStyle = s.color;
  if (s.type === "pen") {
    ctx.beginPath();
    s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  } else if (s.type === "rect") {
    const w = s.to.x - s.from.x;
    const h = s.to.y - s.from.y;
    ctx.strokeRect(s.from.x, s.from.y, w, h);
  } else if (s.type === "circle") {
    const cx = (s.from.x + s.to.x) / 2;
    const cy = (s.from.y + s.to.y) / 2;
    const rx = Math.abs(s.to.x - s.from.x) / 2;
    const ry = Math.abs(s.to.y - s.from.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.type === "arrow") {
    const { from, to } = s;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const head = Math.max(12, s.width * 4);
    const angle = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x - (dx / len) * head * 0.6, to.y - (dy / len) * head * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - head * Math.cos(angle - Math.PI / 6),
      to.y - head * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      to.x - head * Math.cos(angle + Math.PI / 6),
      to.y - head * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
  }
}
