'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** The item cards show photos in a 4:3 frame, so the cropper uses the same frame: what you see here is what the card shows. */
const RATIO = 3 / 4;
const OUT_W = 1280;
const OUT_H = Math.round(OUT_W * RATIO);

interface Props {
  file: File;
  onDone: (cropped: File) => void;
  onCancel: () => void;
  /** The browser could not read this image (for example HEIC). The original is passed on so the server can answer. */
  onUnreadable: () => void;
}

/**
 * Crop dialog: drag to move, slider / mouse wheel / pinch to zoom. "Fit whole photo" shrinks the picture until all of it
 * is visible (white bars fill the rest), so nothing is cut off. The result is a ready-to-upload 1280x960 JPEG.
 */
export default function PhotoCropper({ file, onDone, onCancel, onUnreadable }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [url, setUrl] = useState('');
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [fw, setFw] = useState(0);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const fh = fw * RATIO;

  // keep the latest values readable from the native/pointer handlers
  const live = useRef({ scale, pos, fw, fh, nat });
  live.current = { scale, pos, fw, fh, nat };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const pinch = useRef<number | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFw(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scales = useCallback((w: number, h: number, nw: number, nh: number) => ({
    fit: Math.min(w / nw, h / nh),
    cover: Math.max(w / nw, h / nh),
  }), []);

  /** Keep the picture inside the frame: no gaps when it is larger than the frame, no cut when it is smaller. */
  const clamp = useCallback((x: number, y: number, s: number) => {
    const { fw: w, fh: h, nat: n } = live.current;
    if (!n) return { x, y };
    const dw = n.w * s, dh = n.h * s;
    const cx = dw >= w ? Math.min(0, Math.max(w - dw, x)) : Math.min(w - dw, Math.max(0, x));
    const cy = dh >= h ? Math.min(0, Math.max(h - dh, y)) : Math.min(h - dh, Math.max(0, y));
    return { x: cx, y: cy };
  }, []);

  const place = useCallback((s: number) => {
    const { fw: w, fh: h, nat: n } = live.current;
    if (!n || !w) return;
    setScale(s);
    setPos({ x: (w - n.w * s) / 2, y: (h - n.h * s) / 2 });
  }, []);

  // first fit: fill the frame, centred (same as the card). Runs again if the frame is resized.
  useEffect(() => {
    if (nat && fw) place(scales(fw, fh, nat.w, nat.h).cover);
  }, [nat, fw, fh, place, scales]);

  /** Zoom to `next`, keeping the picture point under (cx, cy) in place. */
  const zoomTo = useCallback((next: number, cx: number, cy: number) => {
    const { scale: s, pos: p, nat: n, fw: w, fh: h } = live.current;
    if (!n) return;
    const { fit, cover } = scales(w, h, n.w, n.h);
    const ns = Math.min(cover * 4, Math.max(fit, next));
    const ix = (cx - p.x) / s, iy = (cy - p.y) / s;
    setScale(ns);
    setPos(clamp(cx - ix * ns, cy - iy * ns, ns));
  }, [clamp, scales]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(live.current.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) drag.current = { px: e.clientX, py: e.clientY, x: live.current.pos.x, y: live.current.pos.y };
    else { drag.current = null; pinch.current = null; }
  };
  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const r = frameRef.current!.getBoundingClientRect();
      if (pinch.current) zoomTo(live.current.scale * (dist / pinch.current), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch.current = dist;
    } else if (drag.current) {
      const d = drag.current;
      setPos(clamp(d.x + e.clientX - d.px, d.y + e.clientY - d.py, live.current.scale));
    }
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    drag.current = null;
    const rest = [...pointers.current.values()][0];
    if (rest) drag.current = { px: rest.x, py: rest.y, x: live.current.pos.x, y: live.current.pos.y };
  };

  const finish = () => {
    const img = imgRef.current;
    if (!img || !nat || !fw) return;
    const r = OUT_W / fw;
    const canvas = document.createElement('canvas');
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, pos.x * r, pos.y * r, nat.w * scale * r, nat.h * scale * r);
    canvas.toBlob((blob) => {
      if (!blob) { onUnreadable(); return; }
      const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
      onDone(new File([blob], `${base}-cropped.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.88);
  };

  const range = nat && fw ? scales(fw, fh, nat.w, nat.h) : null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Crop photo"
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(20,24,18,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 16, width: 'min(560px, 100%)', maxHeight: '96vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <h2 className="h5 mb-1">Crop photo</h2>
        <p className="small text-muted mb-3">Drag to move and use the slider to zoom. The frame shows exactly how the photo appears on the item card.</p>

        <div ref={frameRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          style={{ position: 'relative', width: '100%', height: fw ? fh : undefined, aspectRatio: '4 / 3', overflow: 'hidden', background: '#fff', border: '1px solid #d9d4c3', borderRadius: 12, touchAction: 'none', cursor: 'grab', userSelect: 'none' }}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img ref={imgRef} src={url} alt="Photo to crop" draggable={false}
              onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onError={onUnreadable}
              style={{ position: 'absolute', left: pos.x, top: pos.y, width: nat ? nat.w * scale : 'auto', height: nat ? nat.h * scale : 'auto', maxWidth: 'none', pointerEvents: 'none', visibility: nat ? 'visible' : 'hidden' }} />
          ) : null}
        </div>

        {range ? (
          <div className="mt-3">
            <label htmlFor="fi-crop-zoom" className="form-label small mb-1">Zoom</label>
            <input id="fi-crop-zoom" type="range" className="form-range" min={range.fit} max={range.cover * 4} step={(range.cover * 4 - range.fit) / 200} value={scale}
              onChange={(e) => zoomTo(parseFloat(e.target.value), fw / 2, fh / 2)} />
          </div>
        ) : null}

        <div className="d-flex flex-wrap gap-2 mt-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={finish} disabled={!nat} autoFocus>Use photo</button>
          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={!range} onClick={() => range && place(range.fit)}>Fit whole photo</button>
          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={!range} onClick={() => range && place(range.cover)}>Fill frame</button>
          <button type="button" className="btn btn-outline-secondary btn-sm ms-auto" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
