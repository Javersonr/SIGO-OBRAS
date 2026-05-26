import { useState, useRef, useEffect, useCallback } from "react";
import { X } from "lucide-react";

export default function DraggableComprovante({ url, onFechar }) {
  const [pos, setPos] = useState({ x: window.innerWidth - 440, y: window.innerHeight - 520 });
  const [size, setSize] = useState({ w: 420, h: 480 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const onMouseDownDrag = useCallback(
    (e) => {
      dragging.current = true;
      dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      e.preventDefault();
    },
    [pos]
  );

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const nx = Math.max(
        0,
        Math.min(window.innerWidth - size.w, e.clientX - dragOffset.current.x)
      );
      const ny = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.current.y));
      setPos({ x: nx, y: ny });
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [size]);

  const isPdf = url.toLowerCase().includes(".pdf") || url.toLowerCase().includes("pdf");

  return (
    <div
      className="fixed z-[9999] bg-white border border-slate-300 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        minWidth: 280,
        minHeight: 200,
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 bg-slate-800 text-white cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onMouseDownDrag}
      >
        <span className="text-xs font-medium truncate">⠿ Comprovante</span>
        <button
          onClick={onFechar}
          onMouseDown={(e) => e.stopPropagation()}
          className="ml-1 hover:text-red-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
        {isPdf ? (
          <iframe
            src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
            className="w-full border-0"
            style={{ height: "100%" }}
            title="Comprovante PDF"
          />
        ) : (
          <img src={url} alt="Comprovante" className="w-full h-auto object-contain" />
        )}
      </div>

      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX,
            startY = e.clientY;
          const startW = size.w,
            startH = size.h;
          const onMove = (ev) =>
            setSize({
              w: Math.max(280, startW + ev.clientX - startX),
              h: Math.max(200, startH + ev.clientY - startY),
            });
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          className="absolute bottom-1 right-1 text-slate-400"
        >
          <path
            d="M13 1 L1 13 M13 7 L7 13 M13 13 L13 13"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
