'use client';
import { useEffect, useRef, useState } from 'react';
import PhotoCropper from './PhotoCropper';

/**
 * Profile photo file input. Same <input type="file"> the page and app.js already use (preview, validation), but a chosen
 * picture first opens the crop dialog (square frame with a circle guide, because avatars are round). The cropped 512x512
 * JPEG is what ends up in the input.
 */
export default function CropInput({ id, name, className, accept, required }: { id: string; name: string; className?: string; accept?: string; required?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const skip = useRef(false);
  const [pending, setPending] = useState<File | null>(null);

  function commit(file: File | null) {
    const input = inputRef.current;
    if (!input) return;
    skip.current = true;
    try {
      if (file) { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; } else input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } finally { skip.current = false; }
  }

  // Capture phase: runs before app.js's own "change" listener and holds the picture back until it is cropped.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onChange = (e: Event) => {
      if (skip.current) return;
      const f = input.files?.[0];
      if (!(f instanceof File)) return;
      e.stopImmediatePropagation();
      setPending(f);
    };
    input.addEventListener('change', onChange, true);
    return () => input.removeEventListener('change', onChange, true);
  }, []);

  return (
    <>
      <input ref={inputRef} type="file" id={id} name={name} className={className} accept={accept} required={required} data-photo-input />
      {pending ? (
        <PhotoCropper file={pending} ratio={1} outWidth={512} round frameMaxWidth={400}
          title="Adjust profile photo" hint="Drag to move and use the slider to zoom. The circle shows how your photo appears as your avatar."
          onDone={(cropped) => { setPending(null); commit(cropped); }}
          onCancel={() => { setPending(null); commit(null); }}
          onUnreadable={() => { const f = pending; setPending(null); commit(f instanceof File ? f : null); }} />
      ) : null}
    </>
  );
}