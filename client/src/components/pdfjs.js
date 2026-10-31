// pdf.js setup, imported lazily (it is large) by the PDF viewer and the admin upload form.
// The legacy build also runs on older mobile browsers.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const openPdf = (src, onProgress) => {
  const task = pdfjs.getDocument({ ...(typeof src === 'string' ? { url: src } : { data: src }), isEvalSupported: false });
  if (onProgress) task.onProgress = ({ loaded, total }) => total && onProgress(Math.min(1, loaded / total));
  return task;
};

/** Page count and a JPEG of page 1 (used as the cover) for a PDF chosen in the admin form. */
export async function inspectPdf(file, coverWidth = 600) {
  const doc = await openPdf(new Uint8Array(await file.arrayBuffer())).promise;
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: coverWidth / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const cover = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return { pages: doc.numPages, cover };
  } finally {
    doc.destroy();
  }
}
