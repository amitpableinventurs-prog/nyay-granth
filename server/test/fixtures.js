// Builds test documents in memory: raw text in the shapes people actually upload, and minimal .docx / .odt / .pdf
// files around it, so the indexer can be tested without binary fixtures in the repository.
import JSZip from 'jszip';

const DEV = '०१२३४५६७८९';
export const dev = (n) => String(n).replace(/[0-9]/g, (d) => DEV[d]);

/**
 * A raw plain-text Veda edition like the ones on Wikisource exports: a ==== banner, front matter with a link,
 * "Mandala N" underlined with ----, "सूक्तम् m.s" headings with a ऋषिः line, and "m.s.v" numbered two-line verses.
 */
export function rawVedaLines({ mandalas = 2, suktas = 3, verses = 4 } = {}) {
  const lines = ['='.repeat(60), 'Rigveda', 'The Vedic seers (attributed)', '='.repeat(60), '',
    'Source text:', 'https://sa.wikisource.org/w/index.php?title=x&oldid=1.', '',
    'This edition gives the complete source text in the original language without any translation, and keeps',
    'the verse numbering of the printed editions so that every hymn can be cited by mandala, sukta and verse.', ''];
  for (let m = 1; m <= mandalas; m++) {
    lines.push(`Mandala ${m}`, '-'.repeat(`Mandala ${m}`.length), '');
    for (let s = 1; s <= suktas; s++) {
      lines.push(`सूक्तम् ${dev(m)}.${dev(s)}`, 'ऋषिः: मधुच्छन्दा वैश्वामित्रः । अनुक्रमणिका: दे. अग्निः। गायत्री', '');
      for (let v = 1; v <= verses; v++) lines.push(`${m}.${s}.${v} अग्निमीळे पुरोहितं यज्ञस्य देवमृत्विजम् ${v} ।`, `होतारं रत्नधातमम् ${v}`, '');
    }
  }
  return lines;
}

const xmlEscape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * A .docx from paragraphs: a string is a plain paragraph ('' = empty paragraph); { text, style: 'Heading1' },
 * { text, bold: true } and { table: [[cells]] } add Word structure.
 */
export async function makeDocx(paras) {
  // "\n" inside a paragraph is a Shift+Enter line break (<w:br/>).
  const runs = (s) => s.split('\n').map((l) => `<w:r><w:t xml:space="preserve">${xmlEscape(l)}</w:t></w:r>`).join('<w:r><w:br/></w:r>');
  const body = paras.map((p) => {
    if (typeof p === 'string') return p ? `<w:p>${runs(p)}</w:p>` : '<w:p/>';
    if (p.table) {
      return `<w:tbl>${p.table.map((row) => `<w:tr>${row.map((c) => `<w:tc><w:p><w:r><w:t>${xmlEscape(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
    }
    const ppr = p.style ? `<w:pPr><w:pStyle w:val="${p.style}"/></w:pPr>` : '';
    const rpr = p.bold ? '<w:rPr><w:b/></w:rPr>' : '';
    return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${xmlEscape(p.text)}</w:t></w:r></w:p>`;
  }).join('');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const style = (id, name) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/></w:style>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="${W}">${style('Title', 'Title')}${style('Heading1', 'heading 1')}${style('Heading2', 'heading 2')}</w:styles>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: 'uint8array' });
}

/**
 * An .odt from raw lines, one text:p per line; empty lines become empty (self-closing) paragraphs, as editors write
 * them, and "\n" inside a line is a line break within the paragraph.
 */
export async function makeOdt(lines) {
  const body = lines.map((l) => (l ? `<text:p text:style-name="P1">${l.split('\n').map(xmlEscape).join('<text:line-break/>')}</text:p>` : '<text:p text:style-name="P1"/>')).join('');
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text');
  zip.file('content.xml', '<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
    + `xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:text>${body}</office:text></office:body></office:document-content>`);
  return zip.generateAsync({ type: 'uint8array' });
}

/** RTF from raw lines, with non-ASCII characters as \uN escapes (as Word writes them). */
export function makeRtf(lines) {
  const esc = (s) => [...s].map((ch) => {
    const c = ch.codePointAt(0);
    if (ch === '\\' || ch === '{' || ch === '}') return `\\${ch}`;
    return c < 128 ? ch : `\\u${c > 32767 ? c - 65536 : c}?`;
  }).join('');
  return `{\\rtf1\\ansi\\uc1{\\fonttbl{\\f0 Nirmala UI;}}\\f0 ${lines.map((l) => `${esc(l)}\\par\n`).join('')}}`;
}

/**
 * A text PDF with the standard Helvetica font: pages of { text, size, y } lines (y from the bottom of a 612×792 page).
 * Offsets in the xref table are exact, so pdf.js reads it without repairs.
 */
export function makePdf(pages) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const objs = [null, '<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  const kids = [];
  for (const lines of pages) {
    const stream = lines.map((l) => `BT /F1 ${l.size} Tf 72 ${l.y} Td (${esc(l.text)}) Tj ET`).join('\n');
    const pageNo = objs.length;
    kids.push(`${pageNo} 0 R`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageNo + 1} 0 R >>`);
    objs.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
  }
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = Buffer.byteLength(out, 'latin1');
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
    + `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

/** Body lines of prose for a PDF page, starting at y and going down. */
export function prose(y, n, words = 'The means of knowledge are perception, inference, comparison and testimony as the sutra says') {
  return Array.from({ length: n }, (_, i) => ({ text: `${words} ${i + 1}.`, size: 11, y: y - i * 15 }));
}
