'use client';
import { useEffect, useRef, useState } from 'react';
import PhotoCropper from './PhotoCropper';

/**
 * "Item photo" field. Same markup as the PHP report form (file input + preview box that app.js drives),
 * plus a "Take photo" button that opens the device camera. The captured picture is put into the same
 * <input type="file"> and a "change" event is fired, so app.js's validation/preview and the normal form
 * submit work unchanged. Without camera access (or on a phone) it falls back to the native camera picker.
 * Every chosen or captured picture first goes through the crop dialog (PhotoCropper), so the student decides the framing
 * and nothing is cut off by surprise. The cropped JPEG is what ends up in the file input.
 */
export default function CameraCapture({ id = 'item_photo', name = 'item_photo', label = 'Item photo', help }: {
  id?: string; name?: string; label?: string; help?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [pending, setPending] = useState<File | null>(null);
  const skipCrop = useRef(false);

  const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  useEffect(() => stop, []);

  async function start(mode: 'environment' | 'user') {
    setError('');
    stop();
    if (!navigator.mediaDevices?.getUserMedia) { nativeRef.current?.click(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: mode }, width: { ideal: 1600 } }, audio: false });
      streamRef.current = stream;
      setOpen(true);
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); } });
    } catch {
      setOpen(false);
      setError('The camera could not be opened. Allow camera access, or choose a photo from your device instead.');
    }
  }

  /** Put a file into the form's file input and tell app.js (preview/validation) about it. */
  function commit(file: File | null) {
    const input = inputRef.current;
    if (!input) return;
    skipCrop.current = true;
    try {
      if (file) {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
      } else {
        input.value = '';
      }
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } finally { skipCrop.current = false; }
  }

  /** Camera / native-picker photos go into the input first, then the change handler below opens the crop dialog. */
  function give(file: File) {
    const input = inputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Runs before app.js's own "change" listener (capture phase) and holds the picture back until it is cropped.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onChange = (e: Event) => {
      if (skipCrop.current) return;
      const f = input.files?.[0];
      if (!(f instanceof File)) return;
      e.stopImmediatePropagation();
      setPending(f);
    };
    input.addEventListener('change', onChange, true);
    return () => input.removeEventListener('change', onChange, true);
  }, []);

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      give(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      stop();
      setOpen(false);
    }, 'image/jpeg', 0.88);
  }

  return (
    <div className="col-12">
      <label htmlFor={id} className="form-label">{label}</label>
      <input ref={inputRef} type="file" className="form-control" id={id} name={name} accept="image/jpeg,image/png,image/webp" />
      <div className="d-flex flex-wrap gap-2 mt-2">
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void start(facing)}>Take photo</button>
        <input ref={nativeRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) give(f); e.target.value = ''; }} />
      </div>
      <div className="form-text">{help ?? 'Upload or take a clear photo of the found item. JPG, PNG, or WEBP. You can crop it before it is sent.'}</div>
      <div className="invalid-feedback">Please select a valid image file.</div>
      {error ? <div className="text-danger small mt-2" role="alert">{error}</div> : null}
      {open ? (
        <div className="mt-3">
          <video ref={videoRef} playsInline muted className="img-fluid rounded" style={{ maxHeight: '320px', width: '100%', background: '#000', objectFit: 'contain' }} />
          <div className="d-flex flex-wrap gap-2 mt-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={capture}>Capture</button>
            <button type="button" className="btn btn-outline-secondary btn-sm"
              onClick={() => { const next = facing === 'environment' ? 'user' : 'environment'; setFacing(next); void start(next); }}>Switch camera</button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => { stop(); setOpen(false); }}>Cancel</button>
          </div>
        </div>
      ) : null}
      {pending ? (
        <PhotoCropper file={pending}
          onDone={(cropped) => { setPending(null); commit(cropped); }}
          onCancel={() => { setPending(null); commit(null); }}
          onUnreadable={() => { const f = pending; setPending(null); commit(f instanceof File ? f : null); }} />
      ) : null}
      <div id="photo-preview-container" className="mt-3 d-none">
        <img id="photo-preview" alt="Selected item photo preview" className="img-fluid rounded" style={{ maxHeight: '240px', objectFit: 'contain' }} />
      </div>
    </div>
  );
}