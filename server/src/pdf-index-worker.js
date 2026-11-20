// Runs PDF and document analysis in a child process (forked by pdf-index.js), one file per process.
// pdf.js parsing is CPU-heavy, and a separate process means a crash in a parser can never take the API down,
// and all memory the parse used is returned to the system when the process exits.
import { analysePdf } from './pdf-index.js';
import { analyseDocument } from './doc-index.js';

process.once('message', async ({ bytes, manualIndex, format }) => {
  let reply;
  try {
    const data = new Uint8Array(bytes);
    reply = { ok: true, result: await (format === 'pdf' ? analysePdf(data, { manualIndex }) : analyseDocument(data, format, { manualIndex })) };
  } catch (e) {
    reply = { ok: false, error: String(e?.message || e) };
  }
  process.send(reply, () => process.exit(0));
});
