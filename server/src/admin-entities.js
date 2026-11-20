// Admin panel entity definitions (`table` is the MongoDB collection). The generic CRUD API (routes/admin.js) and the React admin UI are both driven by these.
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { devaToIast, iastToDeva, searchNorm } from '../../shared/translit.js';
import { uniqueSlug } from './dictionary.js';
import { formatOf, queuePdfIndex } from './pdf-index.js';
import { PRODUCT_CATEGORIES, USER_TYPES, USER_TYPE_LABELS, productNorm, sectionNorms, textNorms, notify, whatsappBroadcast, whatsappConfigured } from './services.js';
import { notifyVendorStatus } from './routes/shop.js';
import { findOne, now } from './db.js';
import { config } from './config.js';
import { HttpError } from './middleware.js';

const yesNo = (name, label) => ({ name, label, type: 'checkbox' });
/** Size in bytes of a file in uploads/ (null for external URLs). */
const uploadSize = (p) => {
  if (!String(p).startsWith('/uploads/')) return null;
  try { return fs.statSync(path.join(config.uploadsDir, p.slice('/uploads/'.length))).size; } catch { return null; }
};
const GLOSSARY_CATEGORIES = ['Epistemology', 'Pramāṇa', 'Logic', 'Fallacies', 'Debate', 'Ontology', 'Causation', 'Semantics', 'Soteriology', 'Navya-Nyāya'];
const ERAS = [['ancient', 'Ancient'], ['medieval', 'Medieval'], ['contemporary', 'Contemporary']];

export const ENTITIES = {
  texts: {
    group: 'Content', label: 'Texts', icon: 'bi-book', table: 'texts', order: { id: -1 }, search: ['title', 'author', 'title_sanskrit'], normSearch: 'search_norm',
    list: ['id', 'title', 'author', 'era', 'is_premium', 'status', 'views'], filters: ['era', 'status'],
    child: { entity: 'sections', key: 'text_id', label: 'Sections' },
    cascade: [['sections', 'text_id'], ['bookmarks', 'text_id'], ['reading_progress', 'text_id'], ['reading_events', 'text_id']],
    fields: [
      { name: 'title', label: 'Title (IAST/English)', type: 'text', required: true },
      { name: 'title_sanskrit', label: 'Title (Devanagari)', type: 'text' },
      { name: 'author', label: 'Author', type: 'text' },
      { name: 'author_sanskrit', label: 'Author (Devanagari)', type: 'text' },
      { name: 'category_id', label: 'Category', type: 'select', optionsFrom: ['categories', 'id', 'name', { sort_order: 1, name: 1 }] },
      { name: 'era', label: 'Era', type: 'select', options: ERAS, required: true },
      { name: 'period', label: 'Period / century', type: 'text' },
      { name: 'language', label: 'Language', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'cover', label: 'Cover image', type: 'image' },
      { name: 'cover_color', label: 'Cover colour (when no image)', type: 'color' },
      yesNo('is_premium', 'Premium (members only)'),
      yesNo('is_featured', 'Featured on home'),
      { name: 'status', label: 'Status', type: 'select', options: [['published', 'Published'], ['draft', 'Draft']], required: true },
    ],
    beforeSave: (d, old) => Object.assign(d, textNorms({ ...old, ...d })),
  },
  sections: {
    group: 'Content', label: 'Sections', icon: 'bi-journal-text', table: 'sections', order: { text_id: 1, sort_order: 1, id: 1 }, search: ['ref', 'title', 'translation'], normSearch: 'search_norm',
    list: ['id', 'text_id', 'ref', 'chapter', 'title', 'sort_order'], filters: ['text_id'], hidden: true,
    cascade: [['bookmarks', 'section_id'], ['reading_events', 'section_id']],
    fields: [
      { name: 'text_id', label: 'Text', type: 'select', required: true, optionsFrom: ['texts', 'id', 'title', { title: 1 }] },
      { name: 'chapter', label: 'Book / chapter', type: 'text' },
      { name: 'ref', label: 'Reference (e.g. 1.1.4)', type: 'text' },
      { name: 'title', label: 'Section title', type: 'text' },
      { name: 'content_sanskrit', label: 'Sanskrit (Devanagari)', type: 'textarea', className: 'sanskrit' },
      { name: 'transliteration', label: 'Transliteration (IAST) — leave blank to generate automatically', type: 'textarea' },
      { name: 'translation', label: 'Translation (English)', type: 'textarea' },
      { name: 'translation_hi', label: 'Translation (हिन्दी)', type: 'textarea' },
      { name: 'translation_sa', label: 'Translation (संस्कृतम्)', type: 'textarea' },
      { name: 'translation_mr', label: 'Translation (मराठी)', type: 'textarea' },
      { name: 'translation_gu', label: 'Translation (ગુજરાતી)', type: 'textarea' },
      { name: 'commentary', label: 'Commentary / notes', type: 'textarea' },
      { name: 'sort_order', label: 'Order', type: 'number' },
    ],
    beforeSave(d, old) {
      const merged = { ...old, ...d };
      if (!merged.transliteration && merged.content_sanskrit) d.transliteration = merged.transliteration = devaToIast(merged.content_sanskrit);
      Object.assign(d, sectionNorms(merged));
    },
  },
  categories: {
    group: 'Content', label: 'Categories', icon: 'bi-tags', table: 'categories', order: { sort_order: 1, name: 1 }, search: ['name'], list: ['id', 'name', 'slug', 'sort_order'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'slug', label: 'Slug', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'sort_order', label: 'Order', type: 'number' },
    ],
    beforeSave: (d, old) => { if (!d.slug && !old?.slug) d.slug = searchNorm(d.name).replace(/ /g, '-'); },
  },
  audio: {
    group: 'Media', label: 'Audio', icon: 'bi-music-note-beamed', table: 'audio', order: { id: -1 }, search: ['title', 'speaker'], list: ['id', 'title', 'speaker', 'kind', 'is_premium', 'plays'], filters: ['kind'],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'speaker', label: 'Speaker / reciter', type: 'text' },
      { name: 'kind', label: 'Type', type: 'select', options: [['recitation', 'Recitation'], ['lecture', 'Lecture'], ['audiobook', 'Audiobook']], required: true },
      { name: 'text_id', label: 'Related text', type: 'select', optionsFrom: ['texts', 'id', 'title', { title: 1 }] },
      { name: 'file', label: 'Audio file (mp3, m4a, ogg, wav) or URL', type: 'file', accept: 'audio/*' },
      { name: 'duration', label: 'Duration (e.g. 12:30)', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      yesNo('is_premium', 'Premium'),
    ],
  },
  presentations: {
    group: 'Media', label: 'Presentations', icon: 'bi-easel', table: 'presentations', order: { id: -1 }, search: ['title'], list: ['id', 'title', 'is_premium', 'views'],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'text_id', label: 'Related text', type: 'select', optionsFrom: ['texts', 'id', 'title', { title: 1 }] },
      { name: 'slides', label: 'Slides', type: 'textarea', rows: 14, help: 'Separate slides with a line containing ---. Start a slide with "# Title"; use "- " for bullet points and **bold**.' },
      { name: 'file', label: 'Attachment (PDF / PPTX)', type: 'file', accept: '.pdf,.ppt,.pptx' },
      yesNo('is_premium', 'Premium'),
    ],
  },
  pdfs: {
    group: 'Content', label: 'Document Library', icon: 'bi-file-earmark-text', table: 'pdfs', order: { id: -1 }, search: ['title', 'author', 'title_sanskrit'], normSearch: 'search_norm',
    list: ['id', 'title', 'author', 'pages', 'size', 'index_status', 'is_premium', 'status', 'views'], filters: ['category_id', 'status', 'index_status'],
    ownsFiles: true, // replaced or deleted PDFs and covers are removed from uploads/
    cascade: [['pdf_sections', 'pdf_id'], ['pdf_pages', 'pdf_id']],
    fields: [
      { name: 'file', label: 'Document file', type: 'file', accept: '.pdf,.docx,.doc,.odt,.rtf,.txt,.md',
        help: 'PDF, Word (.docx / .doc), OpenDocument (.odt), RTF, plain text or Markdown — up to 100 MB. For a PDF the page count and a cover from page 1 are filled in automatically. Every file is cleaned and split into chapters and lessons after upload.' },
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'title_sanskrit', label: 'Title (Devanagari)', type: 'text' },
      { name: 'author', label: 'Author / editor', type: 'text' },
      { name: 'category_id', label: 'Category', type: 'select', optionsFrom: ['categories', 'id', 'name', { sort_order: 1, name: 1 }] },
      { name: 'text_id', label: 'Related text (shown in the reader)', type: 'select', optionsFrom: ['texts', 'id', 'title', { title: 1 }] },
      { name: 'language', label: 'Language', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'cover', label: 'Cover image (leave blank to use page 1)', type: 'image' },
      { name: 'pages', label: 'Pages', type: 'number' },
      yesNo('is_premium', 'Premium (members only)'),
      { ...yesNo('is_downloadable', 'Allow readers to download the file'), default: 1 },
      { name: 'status', label: 'Status', type: 'select', options: [['published', 'Published'], ['draft', 'Draft / internal'], ['pending', 'Submitted by faculty — awaiting review']], required: true },
      { name: 'uploaded_by', label: 'Uploaded by (faculty article)', type: 'select', readonly: true, optionsFrom: ['users', 'id', 'name', { name: 1 }] },
      { name: 'toc', label: 'Index (optional — overrides automatic detection)', type: 'textarea', rows: 6,
        help: 'One entry per line: "#" for a chapter, "##" for a lesson, then the title — and for a PDF, "|" and the page number. Example:\n# Chapter 1: Pramāṇa | 5\n## Lesson 1.1: Perception | 7\nLeave empty to use the file\'s own headings, bookmarks or verse numbers.' },
      { name: 'index_status', label: 'Indexing', type: 'select', readonly: true, options: [['queued', 'Queued'], ['processing', 'Processing'], ['ready', 'Indexed'], ['no_text', 'No text (scanned)'], ['failed', 'Failed']] },
    ],
    beforeSave(d, old) {
      const merged = { ...old, ...d };
      if (!merged.file) throw new HttpError(422, 'Please choose a file.');
      if (!/\.(pdf|docx|doc|odt|rtf|txt|md)([?#]|$)/i.test(merged.file)) throw new HttpError(422, 'The file must be a PDF, Word, ODT, RTF, text or Markdown file.');
      d.format = formatOf(merged.file);
      if (d.file !== undefined && d.file !== old?.file) d.size = uploadSize(d.file);
      d.search_norm = searchNorm([merged.title, merged.author, merged.title_sanskrit].filter(Boolean).join(' '));
      if (!old) Object.assign(d, { views: 0, downloads: 0 });
      // A new file or a changed index means the chapters and lessons must be rebuilt.
      if (!old || (d.file !== undefined && d.file !== old.file) || (d.toc !== undefined && (d.toc || '') !== (old.toc || ''))) d.index_status = 'queued';
    },
    async afterSave(id, d, _isNew, _body, old) {
      // Tell a faculty author when their submitted article is published or sent back.
      if (old?.uploaded_by && old.status === 'pending' && d.status && d.status !== 'pending') {
        const title = d.title || old.title;
        await notify(old.uploaded_by, d.status === 'published' ? 'Your article is published' : 'Your article was not published',
          d.status === 'published' ? `"${title}" is now in the Document Library.` : `"${title}" was returned to your internal articles.`, d.status === 'published' ? `/pdfs/${id}` : '/faculty/articles');
      }
      if (d.index_status !== 'queued') return null;
      queuePdfIndex(id);
      return `Saved. The ${formatOf(d.file || old?.file) === 'pdf' ? 'PDF' : 'document'} is being indexed — its chapters and lessons will appear in a moment.`;
    },
  },
  glossary: {
    group: 'Content', label: 'Dictionary', icon: 'bi-translate', table: 'glossary', order: { term: 1 }, search: ['term', 'meaning', 'term_devanagari', 'meaning_hi'], normSearch: 'search_norm',
    list: ['id', 'term', 'term_devanagari', 'category', 'gender', 'definition_source'], filters: ['category'],
    fields: [
      { name: 'term', label: 'Term (IAST)', type: 'text', help: 'Leave one of the two spellings blank to fill it in automatically.' },
      { name: 'term_devanagari', label: 'Term (Devanagari)', type: 'text', className: 'sanskrit' },
      { name: 'category', label: 'Category', type: 'select', required: true, options: GLOSSARY_CATEGORIES.map((c) => [c, c]) },
      { name: 'gender', label: 'Gender', type: 'select', options: [['m.', 'Masculine (m.)'], ['f.', 'Feminine (f.)'], ['n.', 'Neuter (n.)']] },
      { name: 'meaning', label: 'Meaning (English)', type: 'textarea', rows: 2, required: true },
      { name: 'meaning_hi', label: 'Meaning (हिन्दी)', type: 'textarea', rows: 2 },
      { name: 'meaning_mr', label: 'Meaning (मराठी)', type: 'textarea', rows: 2 },
      { name: 'meaning_gu', label: 'Meaning (ગુજરાતી)', type: 'textarea', rows: 2 },
      { name: 'definition', label: 'Classical definition (lakṣaṇa) in Sanskrit', type: 'textarea', rows: 2, className: 'sanskrit' },
      { name: 'definition_source', label: 'Source of the definition', type: 'text', help: 'e.g. "Nyāya Sūtra 1.1.4" — a library text title followed by a section reference links to that section.' },
      { name: 'etymology', label: 'Etymology (vyutpatti)', type: 'text' },
      { name: 'explanation', label: 'Explanation', type: 'textarea', rows: 5, help: 'Markdown: **bold**, *italic*, "- " for lists.' },
      { name: 'example', label: 'Example', type: 'textarea', rows: 2 },
      { name: 'related', label: 'Related terms', type: 'text', help: 'Comma-separated IAST terms, e.g. "vyāpti, hetu, sādhya".' },
    ],
    async beforeSave(d, old) {
      const m = { ...old, ...d };
      if (!m.term && !m.term_devanagari) throw new HttpError(422, 'Enter the term in IAST or Devanagari.');
      if (!m.term) d.term = m.term = devaToIast(m.term_devanagari);
      if (!m.term_devanagari) d.term_devanagari = m.term_devanagari = iastToDeva(m.term);
      if (d.term !== undefined && d.term !== old?.term && (await findOne('glossary', { term: d.term, id: { $ne: old?.id ?? 0 } }))) {
        throw new HttpError(409, `"${d.term}" is already in the dictionary.`);
      }
      d.search_norm = searchNorm(m.term);
      if (!old?.slug || d.term !== old.term) d.slug = await uniqueSlug(m.term, old?.id);
    },
  },
  quotes: {
    group: 'Content', label: 'Home Quotes', icon: 'bi-quote', table: 'quotes', order: { id: 1 }, search: ['sanskrit', 'translation'], list: ['id', 'sanskrit', 'translation', 'source'],
    fields: [
      { name: 'sanskrit', label: 'Sanskrit', type: 'text', required: true },
      { name: 'translation', label: 'Translation', type: 'text' },
      { name: 'source', label: 'Source', type: 'text' },
    ],
  },
  events: {
    group: 'Community', label: 'Classes & Webinars', icon: 'bi-camera-video', table: 'events', order: { starts_at: -1 }, search: ['title', 'speaker'], list: ['id', 'title', 'kind', 'starts_at', 'class_id', 'is_premium'], filters: ['kind'],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'kind', label: 'Type', type: 'select', options: [['class', 'Live class'], ['webinar', 'Webinar']], required: true },
      { name: 'speaker', label: 'Speaker', type: 'text' },
      { name: 'starts_at', label: 'Starts at', type: 'datetime', required: true },
      { name: 'duration_minutes', label: 'Duration (minutes)', type: 'number' },
      { name: 'join_link', label: 'Join link (Zoom / Meet / YouTube Live)', type: 'text' },
      { name: 'recording_link', label: 'Recording link (after the event)', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      yesNo('is_premium', 'Members only'),
    ],
  },
  classes: {
    group: 'Community', label: 'Faculty Classes', icon: 'bi-mortarboard', table: 'classes', order: { id: -1 }, search: ['title', 'subject', 'join_code'], list: ['id', 'title', 'faculty_id', 'join_code', 'status', 'created_at'], filters: ['status'],
    noCreate: true, cascade: [['class_members', 'class_id'], ['class_posts', 'class_id'], ['assignments', 'class_id'], ['submissions', 'class_id'], ['events', 'class_id']],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'subject', label: 'Subject / text', type: 'text' },
      { name: 'faculty_id', label: 'Teacher', type: 'select', required: true, optionsFrom: ['users', 'id', 'name', { name: 1 }] },
      { name: 'schedule', label: 'Schedule', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'join_code', label: 'Join code', type: 'text', readonly: true },
      { name: 'status', label: 'Status', type: 'select', options: [['active', 'Active'], ['archived', 'Archived']], required: true },
    ],
  },
  notifications: {
    group: 'Community', label: 'Notifications', icon: 'bi-bell', table: 'notifications', order: { id: -1 }, search: ['title'], list: ['id', 'title', 'user_id', 'created_at'],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'body', label: 'Message', type: 'textarea' },
      { name: 'link', label: 'Link inside the app (e.g. /events)', type: 'text' },
      { name: 'user_id', label: 'Recipient', type: 'select', emptyLabel: 'Everyone (broadcast)', optionsFrom: ['users', 'id', 'name', { name: 1 }] },
      { name: 'send_whatsapp', label: 'Also send to all users via WhatsApp (Cloud API)', type: 'checkbox', virtual: true, createOnly: true },
    ],
    async afterSave(id, d, isNew, raw) {
      if (!isNew || !['1', 'true', true].includes(raw.send_whatsapp) || d.user_id) return null;
      if (!whatsappConfigured()) return 'WhatsApp Cloud API is not configured — notification saved in-app only.';
      const r = await whatsappBroadcast(`${d.title}\n\n${d.body || ''}`);
      return `WhatsApp message sent to ${r.sent} of ${r.total} users with phone numbers.`;
    },
  },
  forum_threads: {
    group: 'Community', label: 'Forum', icon: 'bi-chat-square-text', table: 'forum_threads', order: { last_post_at: -1 }, search: ['title'], list: ['id', 'title', 'category', 'replies', 'is_locked'],
    noCreate: true, cascade: [['forum_posts', 'thread_id']],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'text' },
      { name: 'body', label: 'Body', type: 'textarea' },
      yesNo('is_locked', 'Locked (no new replies)'),
    ],
  },
  reviews: {
    group: 'Community', label: 'Reviews', icon: 'bi-star', table: 'reviews', order: { id: -1 }, search: ['comment'], list: ['id', 'user_id', 'rating', 'comment', 'is_approved'], noCreate: true,
    fields: [
      { name: 'rating', label: 'Rating', type: 'number' },
      { name: 'comment', label: 'Comment', type: 'textarea' },
      yesNo('is_approved', 'Approved (visible)'),
    ],
  },
  feedback: {
    group: 'Community', label: 'Inbox', icon: 'bi-inbox', table: 'feedback', order: { id: -1 }, search: ['name', 'email', 'subject', 'message'], list: ['id', 'kind', 'name', 'subject', 'status', 'created_at'], filters: ['kind', 'status'], noCreate: true,
    fields: [
      { name: 'kind', label: 'Type', type: 'select', options: [['feedback', 'Feedback'], ['contact', 'Contact'], ['helpdesk', 'Publication Help Desk']], readonly: true },
      { name: 'name', label: 'Name', type: 'text', readonly: true },
      { name: 'email', label: 'Email', type: 'text', readonly: true },
      { name: 'phone', label: 'Phone', type: 'text', readonly: true },
      { name: 'subject', label: 'Subject', type: 'text', readonly: true },
      { name: 'message', label: 'Message', type: 'textarea', readonly: true },
      { name: 'status', label: 'Status', type: 'select', options: [['open', 'Open'], ['in_progress', 'In progress'], ['closed', 'Closed']] },
      { name: 'admin_reply', label: 'Reply (shown to the user in the app)', type: 'textarea' },
    ],
    async afterSave(id, d) {
      const f = await findOne('feedback', { id }, { fields: ['user_id', 'subject'] });
      if (f?.user_id && d.admin_reply) {
        await notify(f.user_id, 'Reply from support', `We replied to "${f.subject || 'your message'}".`, '/helpdesk');
      }
      return null;
    },
  },
  users: {
    group: 'Members', label: 'Users', icon: 'bi-people', table: 'users', order: { id: -1 }, search: ['name', 'email', 'phone', 'institution'], list: ['id', 'name', 'email', 'role', 'user_type', 'status', 'created_at'],
    filters: ['role', 'user_type', 'status'], adminOnly: true,
    cascade: [['bookmarks', 'user_id'], ['notes', 'user_id'], ['reading_progress', 'user_id'], ['reading_events', 'user_id'], ['notification_reads', 'user_id'], ['class_members', 'user_id'], ['submissions', 'user_id'], ['class_posts', 'user_id'], ['vendors', 'user_id']],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Phone (WhatsApp)', type: 'text' },
      yesNo('phone_verified', 'Mobile verified by OTP'),
      { name: 'password', label: 'Password (leave blank to keep)', type: 'password', virtual: true },
      { name: 'role', label: 'Role', type: 'select', options: [['user', 'User'], ['editor', 'Editor (content)'], ['admin', 'Administrator']], required: true },
      { name: 'user_type', label: 'User type', type: 'select', options: USER_TYPES.map((t) => [t, USER_TYPE_LABELS[t]]) },
      { name: 'institution', label: 'Institution', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', options: [['active', 'Active'], ['suspended', 'Suspended']], required: true },
      yesNo('is_public', 'Public scholar profile'),
    ],
    async beforeSave(d, old, raw) {
      d.email = String(d.email || old?.email).toLowerCase();
      if (raw.password) d.password_hash = await bcrypt.hash(String(raw.password), 10);
    },
  },
  vendors: {
    group: 'Marketplace', label: 'Vendors', icon: 'bi-shop', table: 'vendors', order: { id: -1 }, search: ['name', 'email', 'phone', 'city', 'gstin'],
    list: ['id', 'name', 'user_id', 'city', 'phone', 'status', 'applied_at'], filters: ['status'], noCreate: true, cascade: [['products', 'vendor_id']],
    fields: [
      { name: 'status', label: 'Status', type: 'select', options: [['pending', 'Pending review'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['suspended', 'Suspended']], required: true },
      { name: 'admin_note', label: 'Note to the vendor (shown when rejected or suspended)', type: 'textarea' },
      { name: 'name', label: 'Shop name', type: 'text', required: true },
      { name: 'user_id', label: 'Account', type: 'select', optionsFrom: ['users', 'id', 'email', { email: 1 }], readonly: true },
      { name: 'phone', label: 'Phone / WhatsApp', type: 'text' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'city', label: 'City', type: 'text' },
      { name: 'address', label: 'Address', type: 'textarea' },
      { name: 'website', label: 'Website', type: 'text' },
      { name: 'gstin', label: 'GSTIN', type: 'text' },
      { name: 'description', label: 'About the shop', type: 'textarea' },
      { name: 'logo', label: 'Logo', type: 'image' },
    ],
    async beforeSave(d, old) {
      if (old && d.status && d.status !== old.status) await notifyVendorStatus(old, d.status, d.admin_note);
    },
  },
  products: {
    group: 'Marketplace', label: 'Products', icon: 'bi-bag', table: 'products', order: { id: -1 }, search: ['title', 'author', 'isbn'], normSearch: 'search_norm',
    list: ['id', 'title', 'vendor_id', 'category', 'price', 'status', 'views', 'contacts'], filters: ['status', 'category', 'vendor_id'], noCreate: true,
    fields: [
      { name: 'status', label: 'Status', type: 'select', options: [['published', 'Published'], ['draft', 'Draft'], ['hidden', 'Hidden by admin']], required: true },
      { name: 'moderation_note', label: 'Reason for hiding (sent to the vendor)', type: 'textarea' },
      yesNo('is_featured', 'Featured (shown first in the shop and on the home page)'),
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'vendor_id', label: 'Vendor', type: 'select', optionsFrom: ['vendors', 'id', 'name', { name: 1 }], readonly: true },
      { name: 'category', label: 'Category', type: 'select', options: PRODUCT_CATEGORIES, required: true },
      { name: 'price', label: 'Price', type: 'number', step: '0.01', required: true },
      { name: 'mrp', label: 'MRP', type: 'number', step: '0.01' },
      { name: 'stock', label: 'Stock (blank = not tracked)', type: 'number' },
      { name: 'author', label: 'Author', type: 'text' },
      { name: 'publisher', label: 'Publisher', type: 'text' },
      { name: 'language', label: 'Language', type: 'text' },
      { name: 'buy_link', label: 'Buy link', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
    ],
    async beforeSave(d, old) {
      d.search_norm = productNorm({ ...old, ...d });
      d.updated_at = now();
      if (old && d.status === 'hidden' && old.status !== 'hidden') {
        const v = await findOne('vendors', { id: old.vendor_id }, { fields: ['user_id'] });
        if (v) await notify(v.user_id, 'A product was hidden', `"${old.title}" was hidden from the shop.${d.moderation_note ? ' Reason: ' + d.moderation_note : ''}`, '/vendor');
      }
    },
  },
  plans: {
    group: 'Members', label: 'Membership Plans', icon: 'bi-gem', table: 'plans', order: { sort_order: 1, price: 1 }, search: ['name'], list: ['id', 'name', 'price', 'duration_days', 'ai_daily_quota', 'is_active'], adminOnly: true,
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'slug', label: 'Slug (use "free" for the free tier)', type: 'text', required: true },
      { name: 'description', label: 'Short description (one line on the plan card)', type: 'text' },
      { name: 'price', label: 'Price', type: 'number', step: '0.01', required: true },
      { name: 'duration_days', label: 'Duration (days)', type: 'number', required: true },
      { name: 'ai_daily_quota', label: 'AI requests per day (0 = unlimited)', type: 'number' },
      { name: 'features', label: 'Features (one per line)', type: 'textarea' },
      { name: 'sort_order', label: 'Order', type: 'number' },
      yesNo('is_popular', 'Highlight as the recommended plan'),
      yesNo('is_active', 'Active'),
    ],
  },
  subscriptions: {
    group: 'Members', label: 'Subscriptions', icon: 'bi-person-check', table: 'subscriptions', order: { id: -1 }, search: [], list: ['id', 'user_id', 'plan_id', 'starts_at', 'ends_at', 'status'], filters: ['status'], adminOnly: true,
    fields: [
      { name: 'user_id', label: 'User', type: 'select', required: true, optionsFrom: ['users', 'id', 'email', { email: 1 }] },
      { name: 'plan_id', label: 'Plan', type: 'select', required: true, optionsFrom: ['plans', 'id', 'name', { sort_order: 1 }] },
      { name: 'starts_at', label: 'Starts', type: 'datetime', required: true },
      { name: 'ends_at', label: 'Ends', type: 'datetime', required: true },
      { name: 'status', label: 'Status', type: 'select', options: [['active', 'Active'], ['cancelled', 'Cancelled']], required: true },
    ],
  },
  payments: {
    group: 'Members', label: 'Payments', icon: 'bi-credit-card', table: 'payments', order: { id: -1 }, search: ['order_id', 'gateway_payment_id'], list: ['id', 'user_id', 'plan_id', 'amount', 'gateway', 'status', 'created_at'],
    filters: ['status', 'gateway'], adminOnly: true, readonly: true,
    // Read-only: these definitions only label the list columns and filters.
    fields: [
      { name: 'user_id', label: 'User', type: 'select', optionsFrom: ['users', 'id', 'email', { email: 1 }] },
      { name: 'plan_id', label: 'Plan', type: 'select', optionsFrom: ['plans', 'id', 'name', { sort_order: 1 }] },
      { name: 'amount', label: 'Amount', type: 'number' },
      { name: 'gateway', label: 'Gateway', type: 'select', options: [['razorpay', 'Razorpay'], ['stripe', 'Stripe'], ['demo', 'Demo']] },
      { name: 'status', label: 'Status', type: 'select', options: [['paid', 'Paid'], ['created', 'Pending'], ['failed', 'Failed']] },
    ],
  },
  ai_logs: {
    group: 'System', label: 'AI Logs', icon: 'bi-robot', table: 'ai_logs', order: { id: -1 }, search: ['prompt'], list: ['id', 'user_id', 'mode', 'source', 'prompt', 'created_at'], filters: ['mode', 'source'],
    adminOnly: true, readonly: true, fields: [],
  },
};
