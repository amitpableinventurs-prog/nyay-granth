// Document indexing (doc-index.js): raw uploads in every supported format become chapters → lessons with clean HTML.
// Run: npm test (in server/)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { analyseDocument, sanitizeHtml, rtfToText } from '../src/doc-index.js';
import { rawVedaLines, makeDocx, makeOdt, makeRtf, dev } from './fixtures.js';

const level = (r, l) => r.sections.filter((s) => s.level === l);
const byTitle = (r, title) => r.sections.find((s) => s.title === title);
const utf8 = (lines) => Buffer.from(lines.join('\n'), 'utf8');

/** The structure every format of the raw Veda fixture must produce: front matter, 2 Mandalas, 6 Suktas. */
function assertVedaStructure(r) {
  assert.equal(r.method, 'headings');
  assert.deepEqual(r.sections.map((s) => s.title), ['Front matter',
    'Mandala 1', `सूक्तम् ${dev(1)}.${dev(1)}`, `सूक्तम् ${dev(1)}.${dev(2)}`, `सूक्तम् ${dev(1)}.${dev(3)}`,
    'Mandala 2', `सूक्तम् ${dev(2)}.${dev(1)}`, `सूक्तम् ${dev(2)}.${dev(2)}`, `सूक्तम् ${dev(2)}.${dev(3)}`]);
  assert.deepEqual(r.sections.map((s) => s.level), [1, 1, 2, 2, 2, 1, 2, 2, 2]);
  assert.deepEqual(r.sections.map((s) => s.kind), ['front', 'chapter', 'lesson', 'lesson', 'lesson', 'chapter', 'lesson', 'lesson', 'lesson']);
  const sukta = byTitle(r, 'सूक्तम् १.२');
  assert.equal(sukta.number, '१.२');
  // The ऋषि line is set apart, each verse keeps its two lines and its number.
  assert.match(sukta.html, /^<p class="doc-meta">ऋषिः: मधुच्छन्दा वैश्वामित्रः । अनुक्रमणिका: दे\. अग्निः। गायत्री<\/p>/);
  assert.equal((sukta.html.match(/<p class="verse numbered">/g) || []).length, 4);
  assert.match(sukta.html, /<span class="verse-no">1\.2\.1<\/span>अग्निमीळे पुरोहितं यज्ञस्य देवमृत्विजम् 1 ।<br>होतारं रत्नधातमम् 1<\/p>/);
  assert.match(sukta.text, /1\.2\.1 अग्निमीळे पुरोहितं यज्ञस्य देवमृत्विजम् 1 ।\nहोतारं रत्नधातमम् 1/);
  // Chapters hold no text of their own: their content is in the lessons.
  assert.equal(byTitle(r, 'Mandala 1').text, '');
  // No banner or underline survives anywhere.
  for (const s of r.sections) assert.doesNotMatch(s.text, /^[=\-]{3,}$/m, s.title);
}

describe('raw Veda edition in every format', () => {
  test('.txt (blank lines between blocks)', async () => {
    const r = await analyseDocument(utf8(rawVedaLines()), 'txt');
    assertVedaStructure(r);
    const front = r.sections[0];
    assert.match(front.html, /<p>Rigveda<br>The Vedic seers \(attributed\)<\/p>/);
    // The link is clickable, its & escaped, and the full stop after it stays outside.
    assert.match(front.html, /<a href="https:\/\/sa\.wikisource\.org\/w\/index\.php\?title=x&amp;oldid=1" target="_blank" rel="noopener noreferrer">[^<]+<\/a>\./);
    // Hard-wrapped prose is one paragraph joined with a space, not a line break.
    assert.match(front.text, /without any translation, and keeps the verse numbering/);
  });

  test('.txt with Windows line endings', async () => {
    assertVedaStructure(await analyseDocument(Buffer.from(rawVedaLines().join('\r\n')), 'txt'));
  });

  test('.txt saved as UTF-16 ("Unicode" in Notepad)', async () => {
    const body = Buffer.from(rawVedaLines().join('\r\n'), 'utf16le');
    assertVedaStructure(await analyseDocument(Buffer.concat([Buffer.from([0xff, 0xfe]), body]), 'txt'));
  });

  test('.docx typed without styles, one paragraph per line and no empty paragraphs', async () => {
    const r = await analyseDocument(await makeDocx(rawVedaLines().filter(Boolean)), 'docx');
    assertVedaStructure(r);
    // Without blank lines, a ==== banner under a longer line is still not taken for an underline.
    assert.ok(!r.sections.some((s) => /Vedic seers/.test(s.title)));
  });

  test('.docx typed without styles, with empty paragraphs as blank lines', async () => {
    assertVedaStructure(await analyseDocument(await makeDocx(rawVedaLines()), 'docx'));
  });

  test('.odt (self-closing empty paragraphs)', async () => {
    assertVedaStructure(await analyseDocument(await makeOdt(rawVedaLines()), 'odt'));
  });

  test('.rtf (Unicode escapes)', async () => {
    assertVedaStructure(await analyseDocument(Buffer.from(makeRtf(rawVedaLines()), 'latin1'), 'rtf'));
  });

  // Blocks typed as one paragraph each, with Shift+Enter between their lines: heading + ऋषि line, verse halves.
  const softBlocks = () => {
    const blocks = [];
    let block = [];
    for (const l of rawVedaLines()) {
      if (l) block.push(l);
      else if (block.length) { blocks.push(block.join('\n')); block = []; }
    }
    return blocks;
  };

  test('.docx with Shift+Enter line breaks inside paragraphs', async () => {
    assertVedaStructure(await analyseDocument(await makeDocx(softBlocks()), 'docx'));
  });

  test('.odt with line breaks inside paragraphs', async () => {
    assertVedaStructure(await analyseDocument(await makeOdt(softBlocks()), 'odt'));
  });

  test('.rtf wrapped by the writer in the middle of a \\uN fallback', async () => {
    // Word wraps RTF source lines at about 255 characters, wherever that falls.
    const wrapped = makeRtf(rawVedaLines()).replace(/(\\u-?\d+)\?/g, (m, u, at) => (at % 3 ? `${u}\\'3f` : `${u}\r\n\\'3f`));
    const r = await analyseDocument(Buffer.from(wrapped, 'latin1'), 'rtf');
    assertVedaStructure(r);
    assert.doesNotMatch(r.sections.map((s) => s.text).join(''), /[ऀ-ॿ]\?|\?[ऀ-ॿ]/, 'no Devanagari letter replaced by "?"');
  });

  test('a long edition: 10 mandalas, numbering continues correctly', async () => {
    const r = await analyseDocument(utf8(rawVedaLines({ mandalas: 10, suktas: 5, verses: 3 })), 'txt');
    assert.equal(level(r, 1).filter((s) => s.kind === 'chapter').length, 10);
    assert.equal(level(r, 2).length, 50);
    assert.equal(r.sections.at(-1).title, `सूक्तम् ${dev(10)}.${dev(5)}`);
  });
});

describe('verse numbers without headings', () => {
  const bare = rawVedaLines({ mandalas: 2, suktas: 4, verses: 4 }).filter((l) => !/^(सूक्तम्|ऋषिः|Mandala|-{3,}$)/.test(l));

  test('leading numbers "1.1.1 …" build mandalas and suktas', async () => {
    const r = await analyseDocument(utf8(bare), 'txt');
    assert.equal(r.method, 'verses');
    assert.deepEqual(level(r, 1).map((s) => s.title), ['Front matter', '1 (1.1 – 1.4)', '2 (2.1 – 2.4)']);
    assert.equal(level(r, 2).length, 8);
    assert.match(level(r, 2)[0].title, /^1\.1 — अग्निमीळे पुरोहितं यज्ञस्य देवमृत्विजम्…$/);
    assert.match(level(r, 2)[0].html, /<p class="verse numbered"><span class="verse-no">1\.1\.1<\/span>अग्निमीळे[^<]*<br>होतारं/);
    assert.doesNotMatch(level(r, 2)[0].text, /1\.2\.1/, 'a sukta stops where the next begins');
  });

  test('trailing numbers "… ॥ १-१ ॥" without any blank line keep the first letter', async () => {
    const lines = [];
    for (let i = 1; i <= 24; i++) lines.push(`श्लोकस्य प्रथमः पादः ${dev(i)} ।`, `श्लोकस्य द्वितीयः पादः ॥ ${dev(i <= 12 ? 1 : 2)}-${dev(i)} ॥`);
    const r = await analyseDocument(utf8(lines), 'txt');
    assert.equal(r.method, 'verses');
    assert.equal(level(r, 1).length, 2);
    assert.ok(r.sections[0].text.startsWith('श्लोकस्य प्रथमः'), r.sections[0].text.slice(0, 20));
    // The two halves of each verse stay together, on two lines.
    assert.match(r.sections[0].html, /<p class="verse">श्लोकस्य प्रथमः पादः १ ।<br>श्लोकस्य द्वितीयः पादः ॥ १-१ ॥<\/p>/);
  });

  test('stray decimals at line starts are not verse numbers', async () => {
    const lines = [];
    for (let i = 0; i < 30; i++) lines.push(`${(i * 7) % 10}.${(i * 3) % 10} kg of rice was bought on day ${i} at the market.`);
    const r = await analyseDocument(utf8(lines), 'txt');
    assert.notEqual(r.method, 'verses');
  });
});

describe('prose documents', () => {
  test('hard-wrapped English: chapters, a numbered sub-heading, paragraphs joined with spaces', async () => {
    const text = ['My Book', '', 'Chapter 1: The Means of Knowledge', '',
      'Perception is the first of the means of knowledge. It arises from the contact',
      'of a sense organ with its object, and it is not verbal, it is unerring and',
      'it is determinate.', '', 'Inference comes next. It is preceded by perception and is of three kinds.', '',
      'Chapter 2: Inference', '', 'Inference proceeds from a sign to what it signifies, as smoke shows fire on',
      'the hill. The text continues here on the next wrapped line of this paragraph.', '',
      '1.1 Kinds of inference', 'There are three kinds of inference, as the old texts on this subject say; the',
      'first is from cause to effect and the second from effect to cause, the third.'];
    const r = await analyseDocument(utf8(text), 'txt');
    assert.equal(r.method, 'headings');
    assert.deepEqual(r.sections.map((s) => [s.level, s.title]), [[1, 'Chapter 1: The Means of Knowledge'], [1, 'Chapter 2: Inference'], [2, '1.1 Kinds of inference']]);
    assert.equal(r.sections[0].html, '<p>Perception is the first of the means of knowledge. It arises from the contact of a sense organ with its object, and it is not verbal, it is unerring and it is determinate.</p>\n<p>Inference comes next. It is preceded by perception and is of three kinds.</p>');
  });

  test('Hindi, one line per paragraph: अध्याय headings, paragraphs ending in । are not merged', async () => {
    const text = ['अध्याय १', 'यह पहला वाक्य है। यह दूसरा वाक्य है।', 'यह दूसरा अनुच्छेद है। इसमें भी वाक्य हैं।', 'अध्याय २', 'तीसरा अनुच्छेद है।', 'चौथा अनुच्छेद है।'];
    const r = await analyseDocument(utf8(text), 'txt');
    assert.deepEqual(r.sections.map((s) => s.title), ['अध्याय १', 'अध्याय २']);
    assert.equal(r.sections[0].html, '<p>यह पहला वाक्य है। यह दूसरा वाक्य है।</p>\n<p>यह दूसरा अनुच्छेद है। इसमें भी वाक्य हैं।</p>');
  });

  test('a heading underlined with ==== (Markdown style) in a text file', async () => {
    const text = ['Introduction', '============', '', 'Some opening words that run on for a while to make a paragraph of text here.', '',
      'Method', '======', '', 'How the work was done, explained in a paragraph of ordinary prose for the reader.'];
    const r = await analyseDocument(utf8(text), 'txt');
    assert.deepEqual(r.sections.map((s) => s.title), ['Introduction', 'Method']);
  });

  test('text with no structure is split into parts', async () => {
    const r = await analyseDocument(utf8(Array.from({ length: 300 }, (_, i) => `Sentence number ${i} of a long text without any headings at all.`)), 'txt');
    assert.equal(r.method, 'parts');
    assert.ok(r.sections.length >= 2);
    assert.match(r.sections[0].title, /^Part 1 — Sentence number 0/);
  });

  test('an empty file gives no sections', async () => {
    const r = await analyseDocument(Buffer.from(''), 'txt');
    assert.equal(r.hasText, false);
    assert.deepEqual(r.sections, []);
  });
});

describe('Word, Markdown and RTF structure', () => {
  test('Word heading styles, bold, tables', async () => {
    const r = await analyseDocument(await makeDocx([
      { text: 'Tarkasaṅgraha', style: 'Title' },
      { text: 'Padārtha', style: 'Heading1' }, 'There are seven categories.', { text: 'Dravya', style: 'Heading2' },
      { text: 'Substance is the first.', bold: true }, { table: [['Dravya', 'Substance'], ['Guṇa', 'Quality']] },
      { text: 'Guṇa', style: 'Heading2' }, 'Quality inheres in substance.',
      { text: 'Pramāṇa', style: 'Heading1' }, { text: 'Pratyakṣa', style: 'Heading2' }, 'Perception.',
    ]), 'docx');
    assert.equal(r.method, 'styles');
    assert.deepEqual(r.sections.map((s) => [s.level, s.title]), [[1, 'Padārtha'], [2, 'Dravya'], [2, 'Guṇa'], [1, 'Pramāṇa'], [2, 'Pratyakṣa']]);
    const dravya = byTitle(r, 'Dravya');
    assert.match(dravya.html, /<p><strong>Substance is the first\.<\/strong><\/p>/);
    assert.match(dravya.html, /<table>.*<td>.*Guṇa.*<\/td>.*<\/table>/s);
    assert.match(dravya.text, /Dravya \| Substance/);
  });

  test('Word lines: a typed web address becomes a link, wrapped English lines become one paragraph', async () => {
    const r = await analyseDocument(await makeDocx(['Chapter 1', 'Source: https://example.org/a?b=1&c=2.', 'Text as transcribed at the pinned revisions;',
      'variant readings resolved to the base reading; editors’', 'footnotes excluded.', 'Chapter 2', 'More.']), 'docx');
    // "Source: …" right under the heading is its metadata line.
    assert.match(r.sections[0].html, /<p class="doc-meta">Source: <a href="https:\/\/example\.org\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">https:\/\/example\.org\/a\?b=1&amp;c=2<\/a>\.<\/p>/);
    assert.match(r.sections[0].html, /<p>Text as transcribed at the pinned revisions; variant readings resolved to the base reading; editors’ footnotes excluded\.<\/p>/);
  });

  test('a link Word already made is kept, not linked twice', async () => {
    const html = sanitizeHtml(parse('<p>See <a href="https://example.org/x">https://example.org/x</a></p>').childNodes[0]);
    assert.equal((html.match(/<a /g) || []).length, 1);
  });

  test('a damaged .docx gives an error an editor can understand', async () => {
    await assert.rejects(analyseDocument(Buffer.from('not a zip'), 'docx'), /This \.docx file could not be read — it may be damaged/);
  });

  test('bold one-line paragraphs as chapter headings in Word', async () => {
    const r = await analyseDocument(await makeDocx([{ text: 'Chapter 1', bold: true }, 'First text that is long enough.', { text: 'Chapter 2', bold: true }, 'Second text.']), 'docx');
    assert.deepEqual(r.sections.map((s) => s.title), ['Chapter 1', 'Chapter 2']);
  });

  test('Markdown headings, lists and emphasis', async () => {
    const md = '# Rigveda\n\n## Mandala 1\n\n### सूक्तम् १.१\n\nThe **first** hymn, to *Agni*.\n\n- one\n- two\n\n### सूक्तम् १.२\n\nText.\n\n## Mandala 2\n\n### सूक्तम् २.१\n\nMore text.\n';
    const r = await analyseDocument(Buffer.from(md), 'md');
    assert.equal(r.method, 'styles');
    assert.deepEqual(r.sections.map((s) => [s.level, s.title]), [[1, 'Mandala 1'], [2, 'सूक्तम् १.१'], [2, 'सूक्तम् १.२'], [1, 'Mandala 2'], [2, 'सूक्तम् २.१']]);
    assert.match(byTitle(r, 'सूक्तम् १.१').html, /<p>The <strong>first<\/strong> hymn, to <em>Agni<\/em>\.<\/p>\n<ul><li>one<\/li><li>two<\/li><\/ul>/);
  });

  test('a typed-in index overrides detection', async () => {
    const r = await analyseDocument(utf8(rawVedaLines()), 'txt', { manualIndex: '# Mandala 1\n## सूक्तम् १.३\n# Mandala 2' });
    assert.equal(r.method, 'manual');
    assert.deepEqual(r.sections.map((s) => s.title), ['Front matter', 'Mandala 1', 'सूक्तम् १.३', 'Mandala 2']);
  });

  test('RTF decoding: \\uN escapes, \\\'hh, skipped groups', () => {
    assert.equal(rtfToText('{\\rtf1{\\fonttbl{\\f0 Arial;}}{\\*\\generator X;}Caf\\\'e9 \\u2309?\\u2327?\\par next}'), 'Café अग\nnext');
  });
});

describe('safe HTML', () => {
  test('script, event handlers, javascript: links and outside images are removed from Word HTML', () => {
    const html = sanitizeHtml(parse('<p onclick="steal()">Hi <a href="javascript:alert(1)">x</a><a href="https://ok.example/a">y</a>'
      + '<img src="http://evil.example/t.png" onerror="x()"><img src="/uploads/image/a.png"><script>alert(1)</script><iframe src="//e"></iframe></p>').childNodes[0]);
    assert.doesNotMatch(html, /onclick|onerror|javascript:|<script|<iframe|evil\.example/);
    assert.match(html, /<a href="https:\/\/ok\.example\/a" target="_blank" rel="noopener noreferrer">y<\/a>/);
    assert.match(html, /<img src="\/uploads\/image\/a\.png"/);
  });

  test('HTML typed into a text file is shown as text, never run', async () => {
    const r = await analyseDocument(utf8(['Chapter 1', '<script>alert(1)</script> <img src=x onerror=alert(2)>', 'Chapter 2', 'javascript:alert(3) "quoted" & more']), 'txt');
    const html = r.sections.map((s) => s.html).join('');
    assert.doesNotMatch(html, /<script|<img|<a /);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &lt;img src=x onerror=alert\(2\)&gt;/);
    assert.match(html, /&quot;quoted&quot; &amp; more/);
  });
});
