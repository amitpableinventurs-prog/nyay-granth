// PDF indexing (pdf-index.js): heading words, verse-number structure, and whole PDFs through pdf.js.
// Run: npm test (in server/)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTER_RX, LESSON_RX, verseRefSections, analysePdf, cleanLine, formatOf } from '../src/pdf-index.js';
import { makePdf, prose, dev } from './fixtures.js';

describe('heading words', () => {
  test('chapter-level words in Roman and Devanagari', () => {
    for (const t of ['Mandala 3', 'Maṇḍala 10', 'मण्डलम् २', 'मण्डल ४', 'मंडल ५', 'Kanda 2', 'Kāṇḍa 6', 'Skandha 10', 'स्कन्धः ३', 'Parva 5', 'पर्व ७', 'Chapter 1', 'अध्याय ३', 'अध्यायः ४']) {
      assert.ok(CHAPTER_RX.test(t), t);
    }
  });
  test('lesson-level words in Roman and Devanagari', () => {
    for (const t of ['Sukta 2', 'Sūkta 2', 'Suktam 3', 'Sūktam 1.4', 'सूक्तम् १.१', 'सूक्त ५', 'Sarga 12', 'सर्गः ४', 'Anuvāka 3', 'अनुवाक ५', 'Pāda 2', 'पादः १', 'Adhikaraṇa 4', 'अधिकरणम् २', 'Lesson 1.1', 'पाठ ३']) {
      assert.ok(LESSON_RX.test(t), t);
    }
  });
  test('ordinary words that merely start the same way are prose', () => {
    const prose = ['Parvati went to the hill', 'Kandahar is a city', 'Mandalas are drawn', 'Sargam is a scale', 'Suktas are hymns',
      'Partly cloudy', 'Partial results', 'Bookish', 'Unity of the self', 'Topical remarks', 'Sections remain'];
    assert.deepEqual(prose.filter((t) => CHAPTER_RX.test(t) || LESSON_RX.test(t)), []);
  });
  test('a word after the heading word is not read as a Roman numeral', () => {
    // "i", "c", "d", "l", "m", "v", "x" start many words; only a numeral standing alone is a number.
    for (const t of ['Chapter in summary', 'Part civil law', 'Lesson design', 'Book making']) {
      const m = t.match(CHAPTER_RX) || t.match(LESSON_RX);
      assert.equal(m?.[1] ?? null, null, t);
    }
    assert.equal('Chapter IV: Doubt'.match(CHAPTER_RX)[1], 'IV');
    assert.equal('Book ii'.match(CHAPTER_RX)[1], 'ii');
    assert.equal('अध्याय १२। आरम्भः'.match(CHAPTER_RX)[1], '१२');
    assert.equal('Chapter 3.2 Means'.match(CHAPTER_RX)[1], '3.2');
    assert.equal('Chapter12'.match(CHAPTER_RX)[1], '12');
  });
});

describe('verse-number structure', () => {
  const bodies = (n, ref) => Array.from({ length: n }, (_, i) => ref(i));

  test('trailing "॥ m.s.v ॥" numbers: mandalas and suktas', () => {
    const verses = [];
    for (let s = 1; s <= 3; s++) for (let v = 1; v <= 8; v++) verses.push(`अग्निमीळे पुरोहितम् ॥ १.${dev(s)}.${dev(v)} ॥`);
    const secs = verseRefSections([verses.join('\n')]);
    assert.deepEqual(secs.map((s) => [s.level, s.number]), [[1, '१'], [2, '१.१'], [2, '१.२'], [2, '१.३']]);
    assert.ok(secs[1].text.startsWith('अग्निमीळे'), 'the first verse keeps its first letter');
  });

  test('leading "m.s.v" numbers at line starts', () => {
    const text = bodies(24, (i) => `${1 + Math.floor(i / 12)}.${1 + Math.floor((i % 12) / 4)}.${1 + (i % 4)} verse text ${i}`).join('\n');
    const secs = verseRefSections([text]);
    assert.deepEqual(secs.filter((s) => s.level === 1).map((s) => s.title), ['1 (1.1 – 1.3)', '2 (2.1 – 2.3)']);
    assert.equal(secs.filter((s) => s.level === 2).length, 6);
    assert.equal(secs[1].text, '1.1.1 verse text 0\n1.1.2 verse text 1\n1.1.3 verse text 2\n1.1.4 verse text 3');
  });

  test('numbers out of order are not verses', () => {
    assert.equal(verseRefSections([bodies(30, (i) => `${(i * 7) % 10}.${(i * 3) % 10} kg rice`).join('\n')]), null);
  });

  test('too few numbers are not a structure', () => {
    assert.equal(verseRefSections([bodies(10, (i) => `1.${i + 1} text`).join('\n')]), null);
  });
});

describe('whole PDFs', () => {
  test('a book with "Chapter" headings in larger type', async () => {
    const pdf = makePdf([
      [{ text: 'Chapter 1: Perception', size: 20, y: 720 }, ...prose(680, 20)],
      [...prose(740, 25)],
      [{ text: 'Chapter 2: Inference', size: 20, y: 720 }, ...prose(680, 20)],
      [{ text: 'Chapter 3: Testimony', size: 20, y: 720 }, ...prose(680, 20)],
    ]);
    const r = await analysePdf(pdf);
    assert.equal(r.numPages, 4);
    assert.equal(r.method, 'headings');
    assert.deepEqual(r.sections.map((s) => [s.title, s.page_start, s.page_end]), [['Chapter 1: Perception', 1, 2], ['Chapter 2: Inference', 3, 3], ['Chapter 3: Testimony', 4, 4]]);
    assert.match(r.sections[0].text, /^The means of knowledge are perception/);
    assert.equal(r.pages.length, 4);
  });

  test('a Veda PDF with "Mandala" and "Sukta" headings', async () => {
    const pdf = makePdf([
      [{ text: 'Mandala 1', size: 22, y: 720 }, { text: 'Sukta 1', size: 15, y: 690 }, ...prose(660, 12)],
      [{ text: 'Sukta 2', size: 15, y: 720 }, ...prose(690, 15)],
      [{ text: 'Mandala 2', size: 22, y: 720 }, { text: 'Sukta 1', size: 15, y: 690 }, ...prose(660, 12)],
    ]);
    const r = await analysePdf(pdf);
    assert.equal(r.method, 'headings');
    assert.deepEqual(r.sections.map((s) => [s.level, s.kind, s.title]), [[1, 'chapter', 'Mandala 1'], [2, 'lesson', 'Sukta 1'], [2, 'lesson', 'Sukta 2'], [1, 'chapter', 'Mandala 2'], [2, 'lesson', 'Sukta 1']]);
    assert.equal(r.sections[0].page_end, 2, 'a chapter spans its lessons');
  });

  test('running headers and page numbers are removed', async () => {
    const page = (n) => [{ text: 'Nyaya Sutra Commentary', size: 9, y: 770 }, ...prose(700, 10), { text: String(n), size: 9, y: 30 }];
    const r = await analysePdf(makePdf([page(1), page(2), page(3), page(4)]));
    assert.ok(r.removedFurniture >= 8, `removed ${r.removedFurniture}`);
    assert.doesNotMatch(r.pages.map((p) => p.text).join('\n'), /Nyaya Sutra Commentary/);
  });

  test('a PDF without structure falls back to page ranges', async () => {
    const r = await analysePdf(makePdf([prose(740, 20), prose(740, 20)]));
    assert.equal(r.method, 'pages');
    assert.equal(r.sections[0].title, 'Pages 1–2');
  });
});

describe('helpers', () => {
  test('cleanLine fixes ligatures, soft hyphens and the visual-order short i', () => {
    assert.equal(cleanLine('ﬁrst  ﬂow­er'), 'first flower');
    assert.equal(cleanLine('िक'), 'कि');
  });
  test('formatOf', () => {
    assert.equal(formatOf('/uploads/document/a.DOCX'), 'docx');
    assert.equal(formatOf('/uploads/document/a.txt?x=1'), 'txt');
    assert.equal(formatOf('https://x/y.pdf'), 'pdf');
    assert.equal(formatOf('/uploads/document/a.exe'), 'pdf');
  });
});
