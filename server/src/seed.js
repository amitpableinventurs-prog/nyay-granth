// Starter content. Sanskrit passages are standard opening sūtras/kārikās; English renderings and notes are
// editorial study aids written for this app — replace or extend them from the admin panel.
import bcrypt from 'bcryptjs';
import { findOne, insert, now, daysFromNow } from './db.js';
import { devaToIast } from '../../shared/translit.js';
import { productNorm, sectionNorms, textNorms } from './services.js';
import { SECTION_TRANSLATIONS } from './section-translations.js';
import { syncDictionary } from './dictionary.js';

const CATEGORIES = [
  ['Sūtra Texts', 'sutra', 'Foundational aphoristic texts of the Nyāya and Vaiśeṣika schools.'],
  ['Bhāṣya & Commentaries', 'bhashya', 'Classical commentaries and sub-commentaries.'],
  ['Prakaraṇa (Manuals)', 'prakarana', 'Introductory manuals and handbooks for students.'],
  ['Navya-Nyāya', 'navya-nyaya', 'The "new logic" tradition beginning with Gaṅgeśa Upādhyāya.'],
  ['Independent Treatises', 'treatise', 'Original works defending and developing Nyāya positions.'],
  ['Contemporary Studies', 'contemporary', 'Modern study guides, introductions and research.'],
];

const TEXTS = [
  {
    cat: 'sutra', title: 'Nyāya Sūtra', title_sanskrit: 'न्यायसूत्रम्', author: 'Maharṣi Gautama (Akṣapāda)', author_sanskrit: 'महर्षि गौतमः',
    era: 'ancient', period: 'c. 2nd century BCE – 2nd century CE', cover_color: '#7a2e12', is_featured: 1,
    description: 'The root text of the Nyāya school in five books. It sets out the sixteen topics (padārthas) whose true knowledge leads to the highest good, the four means of valid knowledge, and the methods of debate.',
    sections: [
      ['Book 1, Chapter 1', '1.1.1', 'The sixteen topics', 'प्रमाणप्रमेयसंशयप्रयोजनदृष्टान्तसिद्धान्तावयवतर्कनिर्णयवादजल्पवितण्डाहेत्वाभासच्छलजातिनिग्रहस्थानानां तत्त्वज्ञानान्निःश्रेयसाधिगमः ॥',
        'The highest good (niḥśreyasa) is attained through true knowledge of: the means of valid knowledge, the objects of knowledge, doubt, purpose, example, established tenet, the members of an argument, hypothetical reasoning, ascertainment, discussion, disputation, wrangling, fallacious reasons, quibble, futile rejoinder and points of defeat.',
        'The opening sūtra announces both the subject matter (the sixteen padārthas) and the purpose of the śāstra (niḥśreyasa, liberation). The first two items — pramāṇa and prameya — form the epistemology and ontology; the rest concern the method of rational inquiry and debate.'],
      ['Book 1, Chapter 1', '1.1.2', 'The path to liberation', 'दुःखजन्मप्रवृत्तिदोषमिथ्याज्ञानानामुत्तरोत्तरापाये तदनन्तरापायादपवर्गः ॥',
        'Liberation (apavarga) follows from the successive removal of false knowledge, faults, activity, birth and suffering — each one ceasing when the one immediately before it in the chain is removed.',
        'The causal chain runs from false knowledge (mithyājñāna) to faults (doṣa: attachment, aversion, delusion), to activity (pravṛtti), to birth (janma), to suffering (duḥkha). Right knowledge cuts the chain at its root.'],
      ['Book 1, Chapter 1', '1.1.3', 'The four pramāṇas', 'प्रत्यक्षानुमानोपमानशब्दाः प्रमाणानि ॥',
        'Perception, inference, comparison and verbal testimony are the means of valid knowledge.',
        'Nyāya accepts four pramāṇas, contrasting with the Cārvāka (perception only), Buddhists and Vaiśeṣikas (perception and inference), and Mīmāṃsakas/Vedāntins (who add postulation and non-cognition).'],
      ['Book 1, Chapter 1', '1.1.4', 'Definition of perception', 'इन्द्रियार्थसन्निकर्षोत्पन्नं ज्ञानमव्यपदेश्यमव्यभिचारि व्यवसायात्मकं प्रत्यक्षम् ॥',
        'Perception is cognition produced by contact of a sense organ with its object, which is not dependent on words, non-deviating, and determinate in nature.',
        'Later Nyāya reads "avyapadeśya" and "vyavasāyātmaka" as pointing to the two stages of perception: indeterminate (nirvikalpaka) and determinate (savikalpaka).'],
      ['Book 1, Chapter 1', '1.1.5', 'Definition of inference', 'अथ तत्पूर्वकं त्रिविधमनुमानं पूर्ववच्छेषवत्सामान्यतोदृष्टं च ॥',
        'Next, inference, which is preceded by perception, is of three kinds: pūrvavat, śeṣavat and sāmānyatodṛṣṭa.',
        'Vātsyāyana gives alternative explanations of the three kinds; on one reading they are inference from cause to effect, from effect to cause, and from general correlation.'],
      ['Book 1, Chapter 1', '1.1.6', 'Definition of comparison', 'प्रसिद्धसाधर्म्यात्साध्यसाधनमुपमानम् ॥',
        'Comparison (upamāna) is the means of establishing something through its similarity to a well-known thing.',
        'The classic example: one who has been told "a gavaya is like a cow" recognises a gavaya in the forest and learns that the word "gavaya" denotes this animal.'],
      ['Book 1, Chapter 1', '1.1.7', 'Definition of testimony', 'आप्तोपदेशः शब्दः ॥',
        'Verbal testimony (śabda) is the instruction of a reliable person (āpta).',
        'An āpta is one who has direct knowledge of the matter and wishes to communicate it truthfully — the authority of the word rests on the reliability of the speaker.'],
      ['Book 1, Chapter 1', '1.1.8', 'Two kinds of testimony', 'स द्विविधो दृष्टादृष्टार्थत्वात् ॥',
        'It is of two kinds, as its object is seen or unseen.', ''],
      ['Book 1, Chapter 1', '1.1.9', 'The objects of knowledge', 'आत्मशरीरेन्द्रियार्थबुद्धिमनःप्रवृत्तिदोषप्रेत्यभावफलदुःखापवर्गास्तु प्रमेयम् ॥',
        'Self, body, sense organs, sense objects, cognition, mind, activity, faults, rebirth, fruition, suffering and liberation are the objects of valid knowledge (prameya).',
        'These twelve prameyas are the objects whose true knowledge is soteriologically relevant, not an exhaustive ontology (for which Nyāya draws on the Vaiśeṣika categories).'],
    ],
  },
  {
    cat: 'prakarana', title: 'Tarkasaṅgraha', title_sanskrit: 'तर्कसंग्रहः', author: 'Annaṃbhaṭṭa', author_sanskrit: 'अन्नंभट्टः',
    era: 'medieval', period: '17th century CE', cover_color: '#1e3a8a', is_featured: 1,
    description: 'The most widely studied introductory manual of the syncretic Nyāya-Vaiśeṣika school, presenting the seven categories, the qualities and the means of knowledge in compact prose.',
    sections: [
      ['Maṅgalācaraṇa', '1', 'Invocation', 'निधाय हृदि विश्वेशं विधाय गुरुवन्दनम् । बालानां सुखबोधाय क्रियते तर्कसंग्रहः ॥',
        'Placing the Lord of the universe in my heart and paying homage to my teacher, I compose the Tarkasaṅgraha for the easy understanding of beginners.',
        'A classic example of the anuṣṭubh metre — try it in the Śloka Analyzer under Tools.'],
      ['Padārtha-nirūpaṇa', '2', 'The seven categories', 'द्रव्यगुणकर्मसामान्यविशेषसमवायाभावाः सप्त पदार्थाः ।',
        'Substance, quality, action, universal, particularity, inherence and absence — these are the seven categories.',
        'Kaṇāda listed six positive categories; absence (abhāva) was added as the seventh by later authors.'],
      ['Dravya-nirūpaṇa', '3', 'The nine substances', 'तत्र द्रव्याणि पृथिव्यप्तेजोवाय्वाकाशकालदिगात्ममनांसि नवैव ।',
        'Of these, the substances are only nine: earth, water, fire, air, ether, time, space, self and mind.', ''],
      ['Guṇa-nirūpaṇa', '4', 'The twenty-four qualities', 'रूपरसगन्धस्पर्शसङ्ख्यापरिमाणपृथक्त्वसंयोगविभागपरत्वापरत्वगुरुत्वद्रवत्वस्नेहशब्दबुद्धिसुखदुःखेच्छाद्वेषप्रयत्नधर्माधर्मसंस्काराश्चतुर्विंशतिर्गुणाः ।',
        'Colour, taste, smell, touch, number, dimension, separateness, conjunction, disjunction, remoteness, proximity, heaviness, fluidity, viscidity, sound, cognition, pleasure, pain, desire, aversion, effort, merit, demerit and disposition — these are the twenty-four qualities.', ''],
      ['Karma-nirūpaṇa', '5', 'The five actions', 'उत्क्षेपणापक्षेपणाकुञ्चनप्रसारणगमनानि पञ्च कर्माणि ।',
        'Throwing upward, throwing downward, contraction, expansion and going — these are the five actions.', ''],
      ['Buddhi-nirūpaṇa', '6', 'Definition of cognition', 'सर्वव्यवहारहेतुर्गुणो बुद्धिर्ज्ञानम् । सा द्विविधा स्मृतिरनुभवश्च ।',
        'Cognition (buddhi), the quality that is the cause of all verbal and practical usage, is knowledge. It is of two kinds: memory and experience.', ''],
    ],
  },
  {
    cat: 'bhashya', title: 'Nyāya Bhāṣya', title_sanskrit: 'न्यायभाष्यम्', author: 'Vātsyāyana (Pakṣilasvāmin)', author_sanskrit: 'वात्स्यायनः',
    era: 'ancient', period: 'c. 5th century CE', cover_color: '#6b4f12',
    description: 'The oldest surviving commentary on the Nyāya Sūtra, indispensable for understanding the sūtras and the early debates with Buddhist philosophers.',
    sections: [
      ['Introduction', '0.1', 'Opening of the Bhāṣya', 'प्रमाणतोऽर्थप्रतिपत्तौ प्रवृत्तिसामर्थ्यादर्थवत् प्रमाणम् ।',
        'A means of knowledge is fruitful, since when an object is apprehended through a means of knowledge, activity directed towards it is successful.',
        'The Bhāṣya opens by grounding the validity of pramāṇas in pragmatic success (pravṛtti-sāmarthya) — a theme later developed in the Nyāya theory of extrinsic validity (parataḥ-prāmāṇya).'],
    ],
  },
  {
    cat: 'sutra', title: 'Vaiśeṣika Sūtra', title_sanskrit: 'वैशेषिकसूत्रम्', author: 'Maharṣi Kaṇāda', author_sanskrit: 'महर्षि कणादः',
    era: 'ancient', period: 'c. 2nd century BCE', cover_color: '#0f5d4e',
    description: 'The foundational text of the Vaiśeṣika school, sister system of Nyāya, setting out the categories of reality and an atomist account of the physical world.',
    sections: [
      ['Book 1, Chapter 1', '1.1.1', 'Statement of purpose', 'अथातो धर्मं व्याख्यास्यामः ॥', 'Now, therefore, we shall explain dharma.', ''],
      ['Book 1, Chapter 1', '1.1.2', 'Definition of dharma', 'यतोऽभ्युदयनिःश्रेयससिद्धिः स धर्मः ॥',
        'Dharma is that from which comes the attainment of worldly prosperity and the highest good.', ''],
    ],
  },
  {
    cat: 'treatise', title: 'Nyāyamañjarī', title_sanskrit: 'न्यायमञ्जरी', author: 'Jayanta Bhaṭṭa', author_sanskrit: 'जयन्तभट्टः',
    era: 'medieval', period: '9th century CE', cover_color: '#5b1f5e',
    description: 'A brilliant and witty defence of Nyāya realism by the Kashmiri scholar Jayanta, engaging Buddhist, Mīmāṃsā and Cārvāka opponents.',
    sections: [
      ['Overview', '1', 'Structure of the work', '', 'The Nyāyamañjarī is organised around the Nyāya Sūtras dealing with pramāṇa and prameya. Its twelve chapters (āhnikas) treat perception, inference, testimony and the authority of the Veda at great length before turning to the objects of knowledge.',
        'Editorial overview. Add the Sanskrit text and translation from the admin panel.'],
    ],
  },
  {
    cat: 'navya-nyaya', title: 'Tattvacintāmaṇi', title_sanskrit: 'तत्त्वचिन्तामणिः', author: 'Gaṅgeśa Upādhyāya', author_sanskrit: 'गङ्गेशोपाध्यायः',
    era: 'medieval', period: '14th century CE', cover_color: '#8a1c1c', is_premium: 1, is_featured: 1,
    description: 'The founding text of Navya-Nyāya ("new logic"), organised in four books on the four pramāṇas. Its technical language of relations and limitors became the lingua franca of later Indian scholarship.',
    sections: [
      ['Pratyakṣa-khaṇḍa', 'I', 'Book on perception', '', 'The first book analyses perception, including the theory of validity (prāmāṇyavāda), sense-object contact (sannikarṣa) and the distinction between indeterminate and determinate perception.', 'Editorial overview.'],
      ['Anumāna-khaṇḍa', 'II.1', 'Vyāptipañcaka — the first definition of pervasion', 'साध्याभाववदवृत्तित्वम्',
        'Pervasion (vyāpti) is the non-occurrence of the reason in any locus that possesses the absence of the property to be proved.',
        'The first of five provisional definitions of vyāpti examined and rejected in the Vyāptipañcaka; working through them is the traditional entrance into Navya-Nyāya technique.'],
      ['Upamāna-khaṇḍa', 'III', 'Book on comparison', '', 'The third book defends comparison as an independent means of knowledge against those who would reduce it to perception or inference.', 'Editorial overview.'],
      ['Śabda-khaṇḍa', 'IV', 'Book on testimony', '', 'The fourth book treats verbal knowledge: expectancy (ākāṅkṣā), semantic fitness (yogyatā), contiguity (āsatti) and the speaker\'s intention (tātparya).', 'Editorial overview.'],
    ],
  },
  {
    cat: 'contemporary', title: 'Introduction to Indian Logic', title_sanskrit: 'भारतीयतर्कप्रवेशः', author: 'Nyāya Grantha Editorial Team', author_sanskrit: '',
    era: 'contemporary', period: '21st century', cover_color: '#b45309',
    description: 'A modern study guide to the core ideas of Nyāya logic: the five-membered argument, pervasion and the fallacies of reason.',
    sections: [
      ['The Five-Membered Argument', '1', 'Pañcāvayava', 'पर्वतो वह्निमान् । धूमात् । यो यो धूमवान् स स वह्निमान् यथा महानसः । तथा चायम् । तस्मात्तथा ।',
        'The hill has fire (thesis, pratijñā). Because it has smoke (reason, hetu). Whatever has smoke has fire, like a kitchen (example, udāharaṇa). This hill is likewise (application, upanaya). Therefore it is so (conclusion, nigamana).',
        'The "inference for others" (parārthānumāna) is stated in five members. The example step states the pervasion together with an instance, showing that Nyāya logic is both deductive and grounded in observation.'],
      ['Pervasion', '2', 'Vyāpti', '', 'Inference rests on pervasion (vyāpti): an invariable concomitance between the reason (hetu) and the property to be proved (sādhya). Where there is smoke there is fire; but not conversely — fire can be present without smoke (e.g. a red-hot iron ball).',
        'The asymmetry is why the hetu must be pervaded by the sādhya, not the other way round.'],
      ['Fallacies', '3', 'Hetvābhāsa', 'सव्यभिचारविरुद्धसत्प्रतिपक्षासिद्धबाधिताः पञ्च हेत्वाभासाः ।',
        'The deviating, the contradictory, the counter-balanced, the unestablished and the sublated — these are the five fallacious reasons.',
        'This formulation follows the Tarkasaṅgraha. Each fallacy marks a specific failure of the conditions a good reason must satisfy.'],
    ],
  },
];

const QUOTES = [
  ['यतो धर्मस्ततो जयः', 'Where there is Dharma, there is victory.', 'Mahābhārata'],
  ['न्यायः परमं बलम्', 'Reason is the supreme strength.', 'App motto'],
  ['सत्यमेव जयते', 'Truth alone triumphs.', 'Muṇḍaka Upaniṣad 3.1.6'],
  ['विद्या ददाति विनयम्', 'Knowledge gives humility.', 'Hitopadeśa'],
];

// [name, slug, price, duration_days, ai_daily_quota, features, sort_order, description, is_popular]
const PLANS = [
  ['Free', 'free', 0, 36500, 5, 'Access to all free texts\nSearch, bookmarks & notes\n5 AI requests per day\nCommunity forum', 1, 'Limited texts, basic search', 0],
  ['Scholar Monthly', 'scholar-monthly', 199, 30, 50, 'All premium texts & commentaries\nAudio recitations & lectures\nPresentations & study slides\n50 AI requests per day\nLive classes & webinars', 2, 'Full library, audio, notes, 50 AI queries a day', 1],
  ['Scholar Annual', 'scholar-annual', 1999, 365, 100, 'Everything in Scholar Monthly\n100 AI requests per day\nPriority Publication Help Desk\nSave 16% vs monthly', 3, 'Everything in Scholar, 100 AI queries a day, save 16%', 0],
  ['Institution', 'institution', 9999, 365, 0, 'Unlimited AI assistance\nAll premium content\nFaculty & research tools\nDedicated WhatsApp support', 4, 'Unlimited AI, PPT viewer, print and share, multi-user access', 0],
];

const PRESENTATIONS = [
  ['The Sixteen Padārthas', 'A slide overview of the sixteen topics of Nyāya Sūtra 1.1.1.', 0,
    `# The Sixteen Padārthas\nNyāya Sūtra 1.1.1\n- Knowledge of these leads to niḥśreyasa\n---\n# Epistemology & Ontology\n- **Pramāṇa** — means of valid knowledge\n- **Prameya** — objects of knowledge\n---\n# Method of Inquiry\n- Saṃśaya (doubt) · Prayojana (purpose)\n- Dṛṣṭānta (example) · Siddhānta (tenet)\n- Avayava (members) · Tarka · Nirṇaya\n---\n# Debate\n- Vāda · Jalpa · Vitaṇḍā\n---\n# Defects in Argument\n- Hetvābhāsa · Chala · Jāti · Nigrahasthāna`],
  ['Pramāṇas at a Glance', 'The four means of valid knowledge according to Nyāya.', 0,
    `# Four Pramāṇas\nप्रत्यक्षानुमानोपमानशब्दाः प्रमाणानि\n---\n# Pratyakṣa — Perception\n- Sense–object contact (sannikarṣa)\n- Nirvikalpaka & savikalpaka\n---\n# Anumāna — Inference\n- Based on vyāpti (pervasion)\n- Svārtha & parārtha\n---\n# Upamāna — Comparison\n- "A gavaya is like a cow"\n---\n# Śabda — Testimony\n- Statement of a reliable person (āpta)`],
  ['The Five-Membered Argument', 'Pratijñā, hetu, udāharaṇa, upanaya, nigamana with the classic hill–fire example.', 1,
    `# Pañcāvayava\nThe inference for others\n---\n# 1. Pratijñā\n- The hill has fire\n---\n# 2. Hetu\n- Because it has smoke\n---\n# 3. Udāharaṇa\n- Whatever has smoke has fire, like a kitchen\n---\n# 4. Upanaya\n- This hill is likewise (smoky)\n---\n# 5. Nigamana\n- Therefore the hill has fire`],
];

// One demo login per remaining user type: <type>@nyayagrantha.local / <type>123
export const DEMO_USERS = [
  ['researcher', 'Demo Researcher', 'Bhandarkar Oriental Research Institute', 'Working on Nyāya manuscripts and comparative studies.'],
  ['faculty', 'Demo Faculty', 'Banaras Hindu University', 'Teaches Nyāya and uses the app for course material.'],
  ['practitioner', 'Demo Practitioner', 'Allahabad High Court', 'Applies Nyāya principles of reasoning in legal practice.'],
  ['enthusiast', 'Demo Enthusiast', null, 'A general reader exploring Indian philosophy and classical wisdom.'],
];

export async function seed() {
  const t = now();
  for (const [skey, svalue] of [['site_name', 'Nyāya Grantha Sarvasvam'], ['about', 'Nyāya Grantha Sarvasvam is a cross-platform application offering a comprehensive platform for legal and scriptural texts, knowledge tools, subscriptions and AI-based assistance for researchers, students and practitioners.'], ['address', 'Varanasi, Uttar Pradesh, India']]) {
    await insert('settings', { skey, svalue });
  }
  await insert('users', { name: 'Administrator', email: 'admin@nyayagrantha.local', password_hash: bcrypt.hashSync('admin123', 10), role: 'admin', user_type: 'faculty', institution: 'Nyāya Grantha Sarvasvam', status: 'active', is_public: 0, created_at: t });
  await insert('users', { name: 'Demo Student', email: 'student@nyayagrantha.local', password_hash: bcrypt.hashSync('student123', 10), role: 'user', user_type: 'student', institution: 'Sampurnanand Sanskrit University', bio: 'Studying Tarkasaṅgraha and the Nyāya Sūtra.', status: 'active', is_public: 1, created_at: t });
  await insert('users', { name: 'Content Editor', email: 'editor@nyayagrantha.local', password_hash: bcrypt.hashSync('editor123', 10), role: 'editor', user_type: 'faculty', institution: 'Nyāya Grantha Sarvasvam', status: 'active', is_public: 0, created_at: t });
  for (const [user_type, name, institution, bio] of DEMO_USERS) {
    await insert('users', { name, email: `${user_type}@nyayagrantha.local`, password_hash: bcrypt.hashSync(`${user_type}123`, 10), role: 'user', user_type, institution, bio, status: 'active', is_public: 1, created_at: t });
  }

  for (const [name, slug, price, duration_days, ai_daily_quota, features, sort_order, description, is_popular] of PLANS) {
    await insert('plans', { name, slug, description, price, duration_days, ai_daily_quota, features, sort_order, is_popular, is_active: 1, created_at: t });
  }
  const catIds = {};
  for (const [i, [name, slug, description]] of CATEGORIES.entries()) catIds[slug] = await insert('categories', { name, slug, description, sort_order: i });

  const textIds = {};
  for (const tx of TEXTS) {
    const { sections, cat, ...data } = tx;
    const row = { category_id: catIds[cat], ...data, language: 'Sanskrit', is_premium: data.is_premium ?? 0, is_featured: data.is_featured ?? 0, status: 'published', created_at: t };
    const id = await insert('texts', { ...row, ...textNorms(row) });
    textIds[tx.title] = id;
    for (const [i, [chapter, ref, title, content_sanskrit, translation, commentary]] of sections.entries()) {
      const s = { text_id: id, chapter, ref, title, content_sanskrit, transliteration: content_sanskrit ? devaToIast(content_sanskrit) : '', translation, commentary, sort_order: i + 1, created_at: t };
      const tr = SECTION_TRANSLATIONS[`${tx.title}|${ref}`] || {};
      Object.assign(s, { translation_hi: tr.hi || '', translation_sa: tr.sa || '', translation_mr: tr.mr || '', translation_gu: tr.gu || '' });
      await insert('sections', { ...s, ...sectionNorms(s) });
    }
  }
  await syncDictionary();
  for (const [sanskrit, translation, source] of QUOTES) await insert('quotes', { sanskrit, translation, source });
  for (const [title, description, is_premium, slides] of PRESENTATIONS) await insert('presentations', { title, description, is_premium, slides, created_at: t, text_id: textIds['Nyāya Sūtra'] });

  await insert('events', { title: 'Introduction to Tarkasaṅgraha', description: 'A live beginner class covering the seven padārthas with Q&A.', speaker: 'Dr. Acharya (Faculty)', kind: 'class', starts_at: daysFromNow(3), duration_minutes: 60, join_link: 'https://meet.google.com/', is_premium: 0, created_at: t });
  await insert('events', { title: 'Webinar: Vyāpti in Navya-Nyāya', description: 'Reading the Vyāptipañcaka of the Tattvacintāmaṇi.', speaker: 'Guest Scholar', kind: 'webinar', starts_at: daysFromNow(10), duration_minutes: 90, join_link: 'https://zoom.us/', is_premium: 1, created_at: t });
  await insert('events', { title: 'Nyāya and Buddhist Epistemology', description: 'Recorded webinar on the Nyāya–Buddhist debates on perception.', speaker: 'Guest Scholar', kind: 'webinar', starts_at: daysFromNow(-20), duration_minutes: 75, recording_link: 'https://www.youtube.com/', is_premium: 0, created_at: t });

  const tid = await insert('forum_threads', { user_id: 2, title: 'Why does Nyāya need upamāna as a separate pramāṇa?', body: 'Vaiśeṣikas reduce comparison to inference. What is the strongest Nyāya reply?', category: 'Pramāṇa', replies: 1, last_post_at: t, created_at: t });
  await insert('forum_posts', { thread_id: tid, user_id: 1, body: 'Good question! See Nyāya Sūtra 1.1.6 and the Upamāna-khaṇḍa of the Tattvacintāmaṇi — the key point is that the cognition "this is what is called gavaya" is about a word–referent relation, which neither perception nor inference delivers.', created_at: t });
  await insert('forum_threads', { user_id: 1, title: 'Welcome to the Discussion Forum', body: 'Introduce yourself and share what you are studying.', category: 'General', replies: 0, last_post_at: t, created_at: t });
  await insert('reviews', { user_id: 2, rating: 5, comment: 'The search across Devanagari and IAST is wonderful — I can type "pramana" and find प्रमाण.', is_approved: 1, created_at: t });
  await insert('notifications', { user_id: null, title: 'Welcome to Nyāya Grantha Sarvasvam', body: 'Explore the library, try the AI assistant and join the upcoming live class.', link: '/events', created_at: t });
  await seedClass();
  await seedShop();
}

/** A demo class taught by the demo faculty, with the demo student enrolled (join code NYAYA1). */
export async function seedClass() {
  const t = now();
  const faculty = await findOne('users', { email: 'faculty@nyayagrantha.local' });
  const student = await findOne('users', { email: 'student@nyayagrantha.local' });
  if (!faculty || !student || (await findOne('classes', { join_code: 'NYAYA1' }))) return false;
  const text = await findOne('texts', { title: 'Tarkasaṅgraha' }, { fields: ['id'] });
  const cid = await insert('classes', { faculty_id: faculty.id, title: 'Tarkasaṅgraha — Foundations', subject: 'Tarkasaṅgraha', description: 'A first course in Nyāya–Vaiśeṣika: the seven padārthas, the qualities and the four pramāṇas.', schedule: 'Mon & Thu, 6 pm', join_code: 'NYAYA1', status: 'active', created_at: t });
  await insert('class_members', { class_id: cid, user_id: student.id, joined_at: t });
  await insert('class_posts', { class_id: cid, user_id: faculty.id, parent_id: null, kind: 'announcement', body: 'Welcome to the class! Read the opening of the Tarkasaṅgraha before our first session, and post your questions here.', created_at: t });
  await insert('assignments', { class_id: cid, created_by: faculty.id, title: 'Read the seven padārthas', instructions: 'Read the opening sections of the Tarkasaṅgraha and list the seven categories with one example of each.', due_at: daysFromNow(5), max_marks: 10, answer_required: 1, text_id: text?.id ?? null, pdf_id: null, presentation_id: null, created_at: t });
  await insert('events', { title: 'Session 1: Dravya and Guṇa', description: 'The nine substances and the twenty-four qualities.', speaker: faculty.name, kind: 'class', starts_at: daysFromNow(2), duration_minutes: 60, join_link: 'https://meet.google.com/', is_premium: 0, class_id: cid, created_by: faculty.id, created_at: t });
  return true;
}

/** A demo vendor (vendor@nyayagrantha.local / vendor123) with an approved shop and a few products. */
export async function seedShop() {
  if (await findOne('users', { email: 'vendor@nyayagrantha.local' })) return false;
  const t = now();
  const userId = await insert('users', { name: 'Demo Vendor', email: 'vendor@nyayagrantha.local', password_hash: bcrypt.hashSync('vendor123', 10), role: 'user', user_type: 'enthusiast', institution: null, status: 'active', is_public: 0, created_at: t });
  const vendorId = await insert('vendors', { user_id: userId, name: 'Demo Granth Bhandar', description: 'Sanskrit śāstra books, study editions and courses for students of Nyāya. (Demo shop.)', phone: '+91 90000 00000', email: 'vendor@nyayagrantha.local', city: 'Varanasi', website: null, address: null, gstin: null, logo: null, status: 'approved', admin_note: null, applied_at: t, created_at: t });
  const products = [
    { title: 'Tarkasaṅgraha with Dīpikā — study edition', category: 'books', author: 'Annaṃbhaṭṭa', language: 'Sanskrit–Hindi', price: 180, mrp: 220, stock: 40, pages: 224, cover_color: '#7a2e12', is_featured: 1, description: 'Mūla text with the Dīpikā, word meanings and a Hindi explanation. Suitable for first-year students.' },
    { title: 'Nyāya Sūtra with Vātsyāyana Bhāṣya (2 vols)', category: 'books', author: 'Gautama, Vātsyāyana', language: 'Sanskrit–English', price: 650, mrp: 750, stock: 12, pages: 860, cover_color: '#1e3a8a', is_featured: 0, description: 'The root text with the classical commentary, an English translation and notes.' },
    { title: 'Navya-Nyāya Primer — 6-week online course', category: 'courses', author: null, language: 'Hindi / English', price: 1499, mrp: null, stock: null, pages: null, cover_color: '#0f766e', is_featured: 1, description: 'Weekly live classes on avacchedaka, prakāratā and the language of Navya-Nyāya, with recordings and notes.' },
    { title: 'Tarkasaṅgraha pothi — facsimile print', category: 'manuscripts', author: null, language: 'Sanskrit', price: 350, mrp: null, stock: 25, pages: 48, cover_color: '#9a3412', is_featured: 0, description: 'A loose-leaf print of a 19th-century hand-copied pothi, wrapped in cloth.' },
  ];
  for (const p of products) {
    await insert('products', { ...p, vendor_id: vendorId, publisher: 'Demo Granth Bhandar', isbn: null, buy_link: null, images: [], status: 'published', views: 0, contacts: 0, search_norm: productNorm(p), created_at: t, updated_at: t });
  }
  return true;
}
