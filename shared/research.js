// Research helpers shared by the server (the /tools API) and the React client:
// MLA / APA / Chicago citations and research paper templates.

/**
 * Citations for a book or translation. Titles are wrapped in *asterisks* for italics;
 * strip them for plain text. `accessed` is a YYYY-MM-DD date.
 */
export function citations(f) {
  const acc = new Date(f.accessed);
  const accLong = isNaN(acc) ? '' : acc.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const accUS = isNaN(acc) ? '' : acc.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return {
    MLA: `${f.author}. *${f.title}*.${f.translator ? ` Translated by ${f.translator},` : ''}${f.editor ? ` Edited by ${f.editor},` : ''}${f.edition ? ` ${f.edition} ed.,` : ''} ${f.publisher}, ${f.year}${f.pages ? `, pp. ${f.pages}` : ''}.${f.url ? ` ${f.url}. Accessed ${accLong}.` : ''}`,
    APA: `${f.author}. (${f.year}). *${f.title}*${f.translator || f.editor ? ` (${[f.translator && `${f.translator}, Trans.`, f.editor && `${f.editor}, Ed.`].filter(Boolean).join('; ')})` : ''}${f.edition ? ` (${f.edition} ed.)` : ''}. ${f.publisher}.${f.url ? ` ${f.url}` : ''}`,
    Chicago: `${f.author}. *${f.title}*.${f.translator ? ` Translated by ${f.translator}.` : ''}${f.editor ? ` Edited by ${f.editor}.` : ''}${f.edition ? ` ${f.edition} ed.` : ''} ${f.city ? `${f.city}: ` : ''}${f.publisher}, ${f.year}.${f.url ? ` ${f.url} (accessed ${accUS}).` : ''}`,
  };
}

export const TEMPLATES = [
  {
    slug: 'research-article-indian-philosophy', name: 'Research article (Indian philosophy)', icon: 'bi-file-earmark-richtext',
    body: `# Title\n\nAuthor · Affiliation · Email\n\n## Abstract (150–250 words)\nProblem, texts examined, method, main claim.\n\nKeywords: Nyāya; pramāṇa; …\n\n## 1. Introduction\n- The philosophical problem and why it matters\n- State of scholarship (cite key studies)\n- Thesis statement and outline\n\n## 2. Textual Background\n- Primary texts and editions used (with sigla)\n- Historical context of the authors\n\n## 3. Analysis\n### 3.1 Pūrvapakṣa (the opponent's view)\n### 3.2 Siddhānta (the established view)\n### 3.3 Evaluation\n\n## 4. Comparative / Contemporary Relevance\n\n## 5. Conclusion\n\n## Abbreviations\nNS = Nyāya Sūtra; NBh = Nyāya Bhāṣya; TC = Tattvacintāmaṇi; TS = Tarkasaṅgraha\n\n## References\nPrimary sources\nSecondary sources\n`,
  },
  {
    slug: 'annotated-translation', name: 'Annotated translation', icon: 'bi-translate',
    body: `# Annotated Translation of [Text], [Section]\n\n## Introduction\n- The text, author and date\n- Manuscripts and printed editions consulted\n- Conventions (transliteration: IAST; brackets for supplied words)\n\n## Text and Translation\n### [Ref]\nSanskrit (Devanagari)\nIAST\nTranslation\nNotes\n- Grammatical notes\n- Technical terms (with Navya-Nyāya analysis where relevant)\n- Parallels in other texts\n\n## Glossary of Technical Terms\n\n## Bibliography\n`,
  },
  {
    slug: 'thesis-chapter-outline', name: 'Thesis chapter outline', icon: 'bi-journal-bookmark',
    body: `# Chapter N: [Title]\n\n## N.1 Aim of the chapter\n## N.2 Sources\n## N.3 Exposition of the concept in the Sūtra and Bhāṣya\n## N.4 Development in Vārttika, Tātparyaṭīkā and Nyāyamañjarī\n## N.5 Reformulation in Navya-Nyāya (Tattvacintāmaṇi and commentaries)\n## N.6 Objections from rival schools (Bauddha, Mīmāṃsā, Vedānta)\n## N.7 Summary and link to next chapter\n`,
  },
  {
    slug: 'conference-abstract', name: 'Conference abstract', icon: 'bi-megaphone',
    body: `# Title\n\nName, Institution\n\n(300 words)\n- Context: …\n- Question: …\n- Texts: …\n- Argument: …\n- Contribution: …\n`,
  },
];
