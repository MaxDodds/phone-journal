// Reads a video's duration and grabs an early frame as a JPEG thumbnail.
const THUMB_MAX = 480;

export function probe(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.setAttribute('playsinline', '');
    v.setAttribute('muted', '');
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.append(v);

    let finished = false;
    const finish = (thumb) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const duration = Number.isFinite(v.duration) ? v.duration : 0;
      v.removeAttribute('src');
      v.load();
      v.remove();
      URL.revokeObjectURL(url);
      resolve({ thumb, duration });
    };

    const grab = () =>
      new Promise((res) => {
        const w = v.videoWidth;
        const h = v.videoHeight;
        if (!w || !h) return res(null);
        const scale = Math.min(1, THUMB_MAX / Math.max(w, h));
        const c = document.createElement('canvas');
        c.width = Math.round(w * scale);
        c.height = Math.round(h * scale);
        try {
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          c.toBlob((b) => res(b), 'image/jpeg', 0.82);
        } catch {
          res(null);
        }
      });

    // iOS sometimes never fires "seeked" for large files; fall back to whatever frame is decoded.
    const timer = setTimeout(() => grab().then(finish, () => finish(null)), 10000);

    v.addEventListener('loadedmetadata', () => {
      const t = Number.isFinite(v.duration) && v.duration > 0 ? Math.min(0.15, v.duration / 2) : 0.1;
      try {
        v.currentTime = t;
      } catch {
        grab().then(finish);
      }
    });
    v.addEventListener('seeked', () => {
      // Give the decoder a frame to paint before reading it.
      requestAnimationFrame(() => grab().then(finish));
    });
    v.addEventListener('error', () => finish(null));

    v.src = url;
    v.load();
  });
}
