// Runs PDF and document analysis off the main thread: pdf.js parsing is CPU-heavy and would otherwise stall the API
// for every user while a large book is indexed.
import { parentPort, workerData } from 'node:worker_threads';
import { analysePdf } from './pdf-index.js';
import { analyseDocument } from './doc-index.js';

const { bytes, manualIndex, format } = workerData;
(format === 'pdf' ? analysePdf(bytes, { manualIndex }) : analyseDocument(bytes, format, { manualIndex }))
  .then((result) => parentPort.postMessage({ ok: true, result }))
  .catch((e) => parentPort.postMessage({ ok: false, error: String(e?.message || e) }));
