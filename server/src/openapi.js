// OpenAPI 3 description of the REST API, served at /api/openapi.json with Swagger UI at /api/docs.
// Keep it in step with the routers in ./routes when endpoints change.
import { config } from './config.js';
import { ENTITIES } from './admin-entities.js';
import { AI_MODES } from './ai.js';
import { USER_TYPES } from './services.js';
const ERAS = ['ancient', 'medieval', 'contemporary'];

const str = (extra = {}) => ({ type: 'string', ...extra });
const int = (extra = {}) => ({ type: 'integer', ...extra });
const obj = (properties, required) => ({ type: 'object', properties, ...(required && { required }) });
const json = (schema) => ({ content: { 'application/json': { schema } } });
const body = (properties, required) => ({ required: true, ...json(obj(properties, required)) });
const multipart = (properties, required) => ({ required: true, content: { 'multipart/form-data': { schema: obj(properties, required) }, 'application/json': { schema: obj(properties, required) } } });
const idParam = (name = 'id', description = 'Numeric id') => ({ name, in: 'path', required: true, schema: int(), description });
const query = (name, schema, description) => ({ name, in: 'query', schema, description });
const OK = { 200: { description: 'OK', ...json({ type: 'object' }) } };
const OK_FLAG = { 200: { description: 'OK', ...json(obj({ ok: { type: 'boolean' } })) } };

/**
 * Builds one operation. `auth`: 'none' (public), 'optional' (a token unlocks premium or personal data),
 * 'user' (login required) or 'staff' (admin or editor).
 */
function op(tag, summary, { auth = 'none', params, requestBody, responses = OK, description } = {}) {
  const errors = { 404: { $ref: '#/components/responses/Error' }, 422: { $ref: '#/components/responses/Error' } };
  if (auth === 'user' || auth === 'staff') errors[401] = { $ref: '#/components/responses/Error' };
  if (auth === 'staff') errors[403] = { $ref: '#/components/responses/Error' };
  const note = { optional: 'Login optional: with a token the response includes personal or premium data.', user: 'Requires login.', staff: 'Requires an admin or editor token.' }[auth];
  return {
    tags: [tag], summary,
    ...((description || note) && { description: [description, note].filter(Boolean).join('\n\n') }),
    ...(auth === 'none' ? { security: [] } : auth === 'optional' ? { security: [{}, { bearerAuth: [] }] } : {}),
    ...(params && { parameters: params }),
    ...(requestBody && { requestBody }),
    responses: { ...responses, ...errors },
  };
}

const AuthResult = { 200: { description: 'Logged in', ...json({ $ref: '#/components/schemas/AuthResult' }) } };

const paths = {
  // ---- System ----
  '/config': { get: op('System', 'Public client configuration (app name, currency, enabled integrations)') },
  '/health': { get: op('System', 'Health check') },

  // ---- Auth ----
  '/auth/user-types': { get: op('Auth', 'User types for the "I am a" field', {
    responses: { 200: { description: 'OK', ...json({ type: 'array', items: obj({ value: str({ enum: USER_TYPES }), label: str() }) }) } },
  }) },
  '/auth/register': { post: op('Auth', 'Register a new account', {
    description: '`user_type` defaults to `student`; an unknown value is rejected with 422. `phone` is stored as `+<country><number>` (10 digits get +91). '
      + 'To verify the number, call `/auth/otp/send` and `/auth/otp/verify` with the returned token.',
    requestBody: body({ name: str(), email: str({ format: 'email' }), password: str({ minLength: 6 }), phone: str({ example: '+919876543210' }), user_type: str({ enum: USER_TYPES, default: 'student' }), institution: str() }, ['name', 'email', 'password']),
    responses: { 201: { description: 'Account created', ...json({ $ref: '#/components/schemas/AuthResult' }) }, 409: { $ref: '#/components/responses/Error' } },
  }) },
  '/auth/otp/send': { post: op('Auth', 'Send a 6-digit code to a mobile number (WhatsApp)', { auth: 'optional',
    description: 'Without a token: OTP login, the number must belong to an account (404 otherwise). With a token: verifies the logged-in user\'s number (409 if another account verified it). '
      + 'Codes expire in 5 minutes; resend after 30 s, at most 5 per hour (429). When WhatsApp is not configured and the server is not in production, the code comes back as `dev_code`.',
    requestBody: body({ phone: str({ example: '9876543210' }) }, ['phone']),
    responses: { 200: { description: 'Code sent', ...json({ $ref: '#/components/schemas/OtpSent' }) }, 429: { $ref: '#/components/responses/Error' } },
  }) },
  '/auth/otp/verify': { post: op('Auth', 'Check a mobile code: log in, or verify the logged-in user\'s number', { auth: 'optional',
    description: 'Without a token returns `{ token, user }`. With a token returns `{ user }` with `phone_verified: true`. 5 wrong tries use the code up.',
    requestBody: body({ phone: str(), code: str({ example: '482913' }) }, ['phone', 'code']),
    responses: { ...AuthResult, 429: { $ref: '#/components/responses/Error' } },
  }) },
  '/auth/password/forgot': { post: op('Auth', 'Forgot password: send a reset code to the email or mobile', {
    description: '`identifier` is the registered email (code by email) or mobile number (code by WhatsApp). Same limits and `dev_code` behaviour as `/auth/otp/send`.',
    requestBody: body({ identifier: str({ example: 'student@nyayagrantha.local' }) }, ['identifier']),
    responses: { 200: { description: 'Code sent', ...json({ $ref: '#/components/schemas/OtpSent' }) }, 429: { $ref: '#/components/responses/Error' } },
  }) },
  '/auth/password/verify-code': { post: op('Auth', 'Check a reset code without using it up', {
    description: 'Optional step so the app can confirm the code before asking for the new password.',
    requestBody: body({ identifier: str(), code: str() }, ['identifier', 'code']), responses: OK_FLAG,
  }) },
  '/auth/password/reset': { post: op('Auth', 'Set a new password with the reset code (logs in)', {
    requestBody: body({ identifier: str(), code: str(), new_password: str({ minLength: 6 }) }, ['identifier', 'code', 'new_password']),
    responses: AuthResult,
  }) },
  '/auth/login': { post: op('Auth', 'Log in with email and password', {
    description: 'Copy the returned `token` into **Authorize** to call protected endpoints.',
    requestBody: { required: true, ...json({ ...obj({ email: str({ format: 'email' }), password: str() }, ['email', 'password']), example: { email: 'admin@nyayagrantha.local', password: 'admin123' } }) },
    responses: { ...AuthResult, 401: { $ref: '#/components/responses/Error' }, 403: { $ref: '#/components/responses/Error' } },
  }) },
  '/auth/google': { post: op('Auth', 'Log in with a Google ID token', { requestBody: body({ credential: str({ description: 'Google Identity Services ID token' }) }, ['credential']), responses: AuthResult }) },
  '/auth/me': { get: op('Auth', 'Current user, membership, AI quota and unread count', { auth: 'user',
    description: '`membership` is the same object as GET /membership/me (plan card, `subscription.ends_at`, `days_left`), for the profile header line.',
  }) },
  '/auth/logout': { post: op('Auth', 'Log out', { auth: 'user',
    description: 'Tokens are stateless: the app logs out by deleting its token. Send `{ "all": true }` to also cancel every token on every device.',
    requestBody: { required: false, ...json(obj({ all: { type: 'boolean', default: false } })) }, responses: OK_FLAG,
  }) },
  '/auth/profile': { put: op('Auth', 'Update profile (optional avatar upload)', { auth: 'user',
    requestBody: multipart({ name: str(), phone: str(), user_type: str({ enum: USER_TYPES }), institution: str(), bio: str(), is_public: str({ enum: ['0', '1'] }), avatar: str({ format: 'binary' }) }, ['name']),
  }) },
  '/auth/password': { put: op('Auth', 'Change password', { auth: 'user', requestBody: body({ current_password: str(), new_password: str({ minLength: 6 }) }, ['new_password']), responses: OK_FLAG }) },

  // ---- Library ----
  '/home': { get: op('Library', 'Home feed: quotes, featured texts, continue reading, events, word of the day, stats', { auth: 'optional' }) },
  '/categories': { get: op('Library', 'Text categories with text counts') },
  '/texts': { get: op('Library', 'List published texts', { params: [
    query('q', str(), 'Title or author (diacritic-insensitive)'), query('category', int(), 'Category id'), query('era', str({ enum: ERAS })),
    query('access', str({ enum: ['free', 'premium'] })), query('sort', str({ enum: ['popular', 'title', 'newest'] })),
  ] }) },
  '/texts/{id}': { get: op('Library', 'Read a text with its sections, audio, presentations and your bookmarks, notes and progress', {
    auth: 'optional', params: [idParam()], description: 'Premium texts return only the first 2 sections and `locked: true` without an active membership.',
  }) },
  '/texts/{id}/progress': { post: op('Library', 'Save reading progress', { auth: 'user', params: [idParam()], requestBody: body({ section_id: int() }, ['section_id']) }) },
  '/continue': { get: op('Library', 'Continue-reading list (up to 20 texts)', { auth: 'user' }) },
  '/archives': { get: op('Library', 'All texts by era and past events') },
  '/glossary': { get: op('Library', 'Nyāya terminology dictionary, in Sanskrit alphabetical order (best matches first when searching)', { params: [query('q', str(), 'Term in Devanagari, IAST or plain spelling, or words of the meaning'), query('category', str())] }) },
  '/glossary/{slug}': { get: op('Library', 'One dictionary entry with its classical definition, related terms, passages in the library that use it, and the previous / next terms', {
    params: [{ name: 'slug', in: 'path', required: true, schema: str(), example: 'vyaapti' }],
  }) },

  // ---- Search ----
  '/search': { get: op('Search', 'Search texts, authors, Sanskrit passages and terms', { auth: 'optional', params: [
    query('q', str(), 'Devanagari, IAST or plain ASCII'), query('scope', str({ enum: ['all', 'text', 'author', 'sanskrit', 'topic'] })), query('era', str({ enum: ERAS })),
  ] }) },
  '/search/trending': { get: op('Search', 'Most searched terms in the last 30 days') },

  // ---- My study (bookmarks, notes, notifications, analytics) ----
  '/me/bookmarks': { get: op('My study', 'My bookmarks', { auth: 'user' }) },
  '/me/bookmarks/toggle': { post: op('My study', 'Add or remove a bookmark', { auth: 'user', requestBody: body({ text_id: int(), section_id: int({ nullable: true }) }, ['text_id']) }) },
  '/me/bookmarks/{id}': { delete: op('My study', 'Delete a bookmark', { auth: 'user', params: [idParam()], responses: OK_FLAG }) },
  '/me/notes': {
    get: op('My study', 'My notes and annotations', { auth: 'user' }),
    post: op('My study', 'Create a note', { auth: 'user', requestBody: body({ content: str(), title: str(), highlight: str(), color: str({ enum: ['yellow', 'green', 'blue', 'pink', 'purple'] }), text_id: int(), section_id: int() }, ['content']), responses: { 201: { description: 'Created', ...json({ type: 'object' }) } } }),
  },
  '/me/notes/{id}': {
    put: op('My study', 'Update a note', { auth: 'user', params: [idParam()], requestBody: body({ content: str(), title: str(), highlight: str(), color: str({ enum: ['yellow', 'green', 'blue', 'pink', 'purple'] }) }, ['content']) }),
    delete: op('My study', 'Delete a note', { auth: 'user', params: [idParam()], responses: OK_FLAG }),
  },
  '/me/notifications': { get: op('My study', 'My notifications (latest 100)', { auth: 'user' }) },
  '/me/notifications/read-all': { post: op('My study', 'Mark all notifications read', { auth: 'user' }) },
  '/me/notifications/{id}/read': { post: op('My study', 'Mark one notification read', { auth: 'user', params: [idParam()], responses: OK_FLAG }) },
  '/me/analytics': { get: op('My study', 'Reading analytics: daily activity, streak, totals, AI usage', { auth: 'user' }) },
  '/me/learning-path': { get: op('My study', 'Personalized learning path with progress', { auth: 'user' }) },

  // ---- AI ----
  '/ai/modes': { get: op('AI', 'AI modes and your daily quota', { auth: 'optional' }) },
  '/ai': { post: op('AI', 'Ask the AI assistant', {
    auth: 'user', description: 'Returns 429 when the daily quota is used up.',
    requestBody: body({
      input: str({ maxLength: 6000 }), mode: str({ enum: Object.keys(AI_MODES), default: 'explain' }), section_id: int({ description: 'Use a text section as context' }),
      history: { type: 'array', description: 'Earlier chat turns (tutor mode)', items: obj({ role: str({ enum: ['user', 'assistant'] }), content: str() }) },
    }, ['input']),
    responses: { ...OK, 429: { $ref: '#/components/responses/Error' } },
  }) },
  '/ai/history': { get: op('AI', 'My last 30 AI requests', { auth: 'user' }) },

  // ---- Media ----
  '/audio': { get: op('Media', 'Audio: recitations, lectures, audiobooks', { auth: 'optional', params: [query('kind', str({ enum: ['recitation', 'lecture', 'audiobook'] }))] }) },
  '/audio/{id}/play': { post: op('Media', 'Count a play', { params: [idParam()], responses: OK_FLAG }) },
  '/presentations': { get: op('Media', 'Presentations (PPT viewer)') },
  '/presentations/{id}': { get: op('Media', 'One presentation with its slides', { auth: 'optional', params: [idParam()] }) },
  '/pdfs': { get: op('Media', 'PDF Library: published PDFs (members-only files are returned with `file: null, locked: true` to non-members)', {
    auth: 'optional',
    params: [query('q', str()), query('category', int()), query('text', int({ description: 'Related text id' })), query('access', str({ enum: ['free', 'premium'] })), query('sort', str({ enum: ['newest', 'popular', 'title'] }))],
  }) },
  '/pdfs/{id}': { get: op('Media', 'One PDF with its file URL and its index of chapters and lessons (counts a view)', { auth: 'optional', params: [idParam()] }) },
  '/pdfs/{id}/sections/{sid}': { get: op('Media', 'One chapter or lesson of a PDF as clean text, with its lessons and the previous / next section (text withheld from non-members for premium PDFs)', {
    auth: 'optional', params: [idParam(), { name: 'sid', in: 'path', required: true, schema: int() }],
  }) },
  '/pdfs/{id}/search': { get: op('Media', 'Full-text search inside one PDF: matching pages with an excerpt and their chapter/lesson', { auth: 'optional', params: [idParam(), query('q', str())] }) },
  '/pdfs/{id}/download': { post: op('Media', 'Count a download', { params: [idParam()], responses: OK_FLAG }) },

  // ---- Community ----
  '/forum': {
    get: op('Community', 'Discussion forum threads', { params: [query('category', str())] }),
    post: op('Community', 'Start a thread', { auth: 'user', requestBody: body({ title: str(), body: str(), category: str({ default: 'General' }) }, ['title', 'body']), responses: { 201: { description: 'Created', ...json(obj({ id: int() })) } } }),
  },
  '/forum/{id}': { get: op('Community', 'A thread with its replies', { params: [idParam()] }) },
  '/forum/{id}/reply': { post: op('Community', 'Reply to a thread', { auth: 'user', params: [idParam()], requestBody: body({ body: str() }, ['body']), responses: { 201: { description: 'Created', ...json(obj({ ok: { type: 'boolean' } })) } } }) },
  '/forum/posts/{id}': { delete: op('Community', 'Delete a reply (own post, or any post for staff)', { auth: 'user', params: [idParam()], responses: OK_FLAG }) },
  '/events': { get: op('Community', 'Live classes and webinars (upcoming and past)', { auth: 'optional' }) },
  '/reviews': {
    get: op('Community', 'Approved reviews with average rating'),
    post: op('Community', 'Add or update my review', { auth: 'user', requestBody: body({ rating: int({ minimum: 1, maximum: 5 }), comment: str() }, ['rating']), responses: OK_FLAG }),
  },
  '/feedback': { post: op('Community', 'Send feedback, a contact message or a publication help desk request', {
    auth: 'optional', description: '`name` and `email` are taken from the account when logged in.',
    requestBody: body({ message: str(), kind: str({ enum: ['feedback', 'contact', 'helpdesk'], default: 'feedback' }), name: str(), email: str({ format: 'email' }), phone: str(), subject: str() }, ['message']),
    responses: { 201: { description: 'Sent', ...json(obj({ ok: { type: 'boolean' } })) } },
  }) },
  '/feedback/mine': { get: op('Community', 'My messages and admin replies', { auth: 'user' }) },
  '/scholars': { get: op('Community', 'Public scholar profiles') },
  '/scholars/{id}': { get: op('Community', 'A scholar profile with threads and reading', { params: [idParam()] }) },

  // ---- Faculty articles ----
  '/articles': {
    get: op('Classes', 'My uploaded articles (faculty)', { auth: 'user', description: 'Each article lists the classes it is assigned in.' }),
    post: op('Classes', 'Upload a PDF article (faculty)', { auth: 'user', description: 'Multipart form: `file` (PDF, required), optional `cover` image, `title`, `title_sanskrit`, `author`, `description`, `language`, `category_id`, and `status` — `draft` keeps it internal (author + students of classes it is assigned in), `pending` submits it to the Document Library for review.' }),
  },
  '/articles/{id}': {
    put: op('Classes', 'Edit, replace, submit or withdraw my article', { auth: 'user', params: [idParam()], description: 'Same multipart fields as upload, all optional. A new file on a published article sends it back for review.' }),
    delete: op('Classes', 'Delete my article', { auth: 'user', params: [idParam()], responses: OK_FLAG }),
  },

  // ---- Classes (faculty workspace) ----
  '/classes': {
    get: op('Classes', 'Classes I teach and classes I have joined', { auth: 'user' }),
    post: op('Classes', 'Create a class (faculty)', { auth: 'user', description: 'Needs `user_type: faculty` (or an admin/editor role). A join code is generated.', requestBody: body({ title: str(), subject: str(), schedule: str(), description: str() }, ['title']), responses: { 201: { description: 'Created', ...json(obj({ id: int() })) } } }),
  },
  '/classes/join': { post: op('Classes', 'Join a class with its code', { auth: 'user', requestBody: body({ code: str({ example: 'NYAYA1' }) }, ['code']), responses: { 200: { description: 'Joined', ...json(obj({ id: int() })) } } }) },
  '/classes/dashboard': { get: op('Classes', 'Faculty Desk: work to grade, deadlines, open questions, sessions, recent joins', { auth: 'user' }) },
  '/classes/{id}': {
    get: op('Classes', 'A class with its posts, assignments and sessions', { auth: 'user', params: [idParam()], description: 'Teachers also get the join code and submission counts; students get their own submission for each assignment.' }),
    put: op('Classes', 'Update or archive a class (teacher)', { auth: 'user', params: [idParam()], requestBody: body({ title: str(), subject: str(), schedule: str(), description: str(), status: str({ enum: ['active', 'archived'] }) }, ['title']), responses: OK_FLAG }),
    delete: op('Classes', 'Delete a class with all its work (teacher)', { auth: 'user', params: [idParam()], responses: OK_FLAG }),
  },
  '/classes/{id}/code': { post: op('Classes', 'Generate a new join code (teacher)', { auth: 'user', params: [idParam()] }) },
  '/classes/{id}/leave': { post: op('Classes', 'Leave a class (student)', { auth: 'user', params: [idParam()], responses: OK_FLAG }) },
  '/classes/{id}/students': { get: op('Classes', 'Students with a progress report: submitted, missing, average score, reading of assigned texts, activity', { auth: 'user', params: [idParam()] }) },
  '/classes/{id}/students/{uid}': { delete: op('Classes', 'Remove a student (teacher)', { auth: 'user', params: [idParam(), idParam('uid', 'User id')], responses: OK_FLAG }) },
  '/classes/{id}/posts': { post: op('Classes', 'Post an announcement (teacher), a question (student) or a reply (`parent_id`)', { auth: 'user', params: [idParam()], requestBody: body({ body: str(), parent_id: int() }, ['body']) }) },
  '/classes/{id}/posts/{pid}': { delete: op('Classes', 'Delete a post and its replies', { auth: 'user', params: [idParam(), idParam('pid', 'Post id')], responses: OK_FLAG }) },
  '/classes/{id}/assignments': { post: op('Classes', 'Create an assignment (teacher)', { auth: 'user', params: [idParam()],
    requestBody: body({ title: str(), instructions: str(), due_at: str({ example: '2026-11-01 18:00:00' }), max_marks: int({ description: '0 = not marked' }), answer_required: { type: 'boolean' }, text_id: int(), pdf_id: int(), presentation_id: int() }, ['title']) }) },
  '/classes/{id}/assignments/{aid}': {
    get: op('Classes', "An assignment; the teacher also gets every student's submission", { auth: 'user', params: [idParam(), idParam('aid', 'Assignment id')] }),
    put: op('Classes', 'Update an assignment (teacher)', { auth: 'user', params: [idParam(), idParam('aid', 'Assignment id')], responses: OK_FLAG }),
    delete: op('Classes', 'Delete an assignment and its submissions (teacher)', { auth: 'user', params: [idParam(), idParam('aid', 'Assignment id')], responses: OK_FLAG }),
  },
  '/classes/{id}/assignments/{aid}/submit': { post: op('Classes', 'Submit or resubmit my work (student)', { auth: 'user', params: [idParam(), idParam('aid', 'Assignment id')], requestBody: body({ answer: str() }) }) },
  '/classes/{id}/submissions/{sid}': { put: op('Classes', 'Grade a submission or return it for revision (teacher)', { auth: 'user', params: [idParam(), idParam('sid', 'Submission id')], requestBody: body({ status: str({ enum: ['graded', 'returned'] }), marks: { type: 'number' }, feedback: str() }), responses: OK_FLAG }) },
  '/classes/{id}/sessions': { post: op('Classes', 'Schedule a live class for this class (teacher)', { auth: 'user', params: [idParam()], requestBody: body({ title: str(), starts_at: str(), duration_minutes: int(), join_link: str(), recording_link: str(), description: str() }, ['title', 'starts_at']) }) },
  '/classes/{id}/sessions/{eid}': {
    put: op('Classes', 'Update a session, e.g. add the recording link (teacher)', { auth: 'user', params: [idParam(), idParam('eid', 'Event id')], responses: OK_FLAG }),
    delete: op('Classes', 'Cancel a session (teacher)', { auth: 'user', params: [idParam(), idParam('eid', 'Event id')], responses: OK_FLAG }),
  },

  // ---- Marketplace ----
  '/products': { get: op('Marketplace', 'Products of approved vendors (paged)', { params: [
    query('q', str(), 'Search title, author, publisher, description'), query('category', str({ enum: ['books', 'ebooks', 'manuscripts', 'courses', 'audio', 'study-aids', 'other'] })),
    query('vendor', int(), 'Vendor id'), query('sort', str({ enum: ['featured', 'newest', 'price_low', 'price_high', 'popular'] })), query('page', int({ minimum: 1 })), query('limit', int({ minimum: 1, maximum: 60 })),
  ], description: 'Returns `{ products, total, page, perPage, categories }`. Image paths are relative to the server (e.g. `/uploads/image/…`).' }) },
  '/products/{id}': { get: op('Marketplace', 'One product with its seller and more from the same shop', { auth: 'optional', params: [idParam()], description: 'Counts a view. Vendors and staff can also open unpublished products (`preview: true`).' }) },
  '/products/{id}/contact': { post: op('Marketplace', 'Record a lead (buyer tapped WhatsApp, call, email or the buy link)', { params: [idParam()], responses: OK_FLAG }) },
  '/vendors/{id}': { get: op('Marketplace', 'A vendor storefront with its products', { params: [idParam()] }) },
  '/vendor/me': {
    get: op('Vendor', 'My vendor profile (null if I have not applied) and shop statistics', { auth: 'user' }),
    put: op('Vendor', 'Update my shop profile', { auth: 'user', requestBody: multipart({ name: str(), phone: str(), email: str(), city: str(), website: str(), address: str(), gstin: str(), description: str(), logo: str({ format: 'binary' }) }, ['name', 'phone']) }),
  },
  '/vendor/apply': { post: op('Vendor', 'Apply to become a vendor (an admin approves it)', { auth: 'user', requestBody: multipart({ name: str(), phone: str(), email: str(), city: str(), website: str(), address: str(), gstin: str(), description: str(), logo: str({ format: 'binary' }) }, ['name', 'phone']) }) },
  '/vendor/products': {
    get: op('Vendor', 'My products, in every status', { auth: 'user' }),
    post: op('Vendor', 'Add a product (approved vendors)', { auth: 'user', requestBody: { required: true, content: { 'multipart/form-data': { schema: obj({
      title: str(), category: str(), price: { type: 'number' }, mrp: { type: 'number' }, stock: int(), description: str(), author: str(), publisher: str(), language: str(), isbn: str(), pages: int(),
      buy_link: str(), status: str({ enum: ['published', 'draft'] }), images: { type: 'array', items: str({ format: 'binary' }), maxItems: 6 },
    }, ['title', 'category', 'price']) } } } }),
  },
  '/vendor/products/{id}': {
    put: op('Vendor', 'Edit a product', { auth: 'user', params: [idParam()], description: 'Same fields as POST, plus `keep_images`: a JSON array of the existing image paths to keep, in order. New `images` are added after them.', responses: OK_FLAG }),
    delete: op('Vendor', 'Delete a product', { auth: 'user', params: [idParam()], responses: OK_FLAG }),
  },

  // ---- App info (profile menu) ----
  '/app/about': { get: op('App', 'About Us: description, website and contact details') },
  '/app/contact': { get: op('App', 'Contact Us details (email, WhatsApp link, address, hours)', {
    description: 'Send a contact message with POST /feedback and `kind: "contact"`.',
  }) },
  '/app/share': { get: op('App', 'Share App: message and links for the share sheet', {
    description: 'Store links come from ANDROID_APP_URL / IOS_APP_URL in the server .env; `text` is ready to pass to the share sheet.',
  }) },
  '/app/help-topics': { get: op('App', 'Subject choices for the Feedback, Contact and Publication Help Desk forms', {
    description: 'Submit with POST /feedback and `kind` = feedback | contact | helpdesk; list your requests and replies with GET /feedback/mine.',
  }) },

  // ---- Tools and Techniques ----
  '/tools': { get: op('Tools', 'List of tools') },
  '/tools/transliterate': { post: op('Tools', 'Devanagari ⇄ IAST', {
    description: 'Without `to`, the script is detected and converted to the other one.',
    requestBody: body({ text: str({ example: 'प्रत्यक्षानुमानोपमानशब्दाः प्रमाणानि' }), to: str({ enum: ['iast', 'devanagari'] }) }, ['text']),
  }) },
  '/tools/sloka': { post: op('Tools', 'Śloka analyzer: syllables, laghu/guru, gaṇas and metre', {
    requestBody: body({ verse: str({ description: 'Devanagari or IAST; separate pādas with new lines or daṇḍas' }) }, ['verse']),
  }) },
  '/tools/citation': { post: op('Tools', 'MLA, APA and Chicago citations', {
    description: 'Each style has `text` (plain) and `marked` (title in *asterisks* for italics). `publisher` defaults to the app name, `year` and `accessed` to today.',
    requestBody: body({ author: str(), title: str(), translator: str(), editor: str(), publisher: str(), city: str(), year: str(), edition: str(), pages: str(), url: str(), accessed: str({ format: 'date' }) }, ['author', 'title']),
  }) },
  '/tools/templates': { get: op('Tools', 'Research paper templates (Markdown)') },
  '/tools/templates/{slug}': { get: op('Tools', 'One template; add ?download=1 for a .md file', { params: [{ name: 'slug', in: 'path', required: true, schema: str() }, query('download', str(), 'Any value returns the file as an attachment')] }) },

  // ---- Membership ----
  '/membership/plans': { get: op('Membership', 'Plan cards for the membership screen', { auth: 'optional',
    description: 'Each plan has `price_label` (e.g. "₹199/mo"), a one-line `description`, `features`, `is_popular` (highlight it) and, with a token, `is_current`. '
      + '`gateways` lists the payment options (`demo` when no gateway keys are set).',
    responses: { 200: { description: 'OK', ...json(obj({ plans: { type: 'array', items: { $ref: '#/components/schemas/PlanCard' } }, gateways: { type: 'array', items: str({ enum: ['razorpay', 'stripe', 'demo'] }) }, currency: str() })) } },
  }) },
  '/membership/me': { get: op('Membership', 'My membership: plan, expiry, premium access and AI quota', { auth: 'user',
    responses: { 200: { description: 'OK', ...json(obj({
      plan: { $ref: '#/components/schemas/PlanCard' }, status: str({ enum: ['active', 'free'] }),
      subscription: obj({ id: int(), starts_at: str(), ends_at: str(), days_left: int() }), is_premium: { type: 'boolean' },
      ai: obj({ quota: int({ description: '0 = unlimited' }), used: int(), left: int({ nullable: true }) }),
    })) } },
  }) },
  '/membership/subscribe': { post: op('Membership', 'Choose a plan', { auth: 'user',
    description: 'Free plan: returns `{ mode: "free", membership }` (409 while a paid membership is still running). '
      + 'Paid plan: returns the same checkout as POST /payments/checkout. Open Razorpay with `key_id` + `order_id` then call /payments/verify, '
      + 'open `url` for Stripe then call /payments/stripe/verify, or for `mode: "demo"` call /payments/demo-confirm. The membership is active once that succeeds.',
    requestBody: body({ plan_id: int(), gateway: str({ enum: ['razorpay', 'stripe'] }) }, ['plan_id']),
    responses: { ...OK, 409: { $ref: '#/components/responses/Error' } },
  }) },

  // ---- Payments ----
  '/payments/plans': { get: op('Payments', 'Membership plans and my current subscription', { auth: 'optional' }) },
  '/payments/checkout': { post: op('Payments', 'Start a payment for a plan', {
    auth: 'user', description: 'Returns `mode: "razorpay"` with an order to open Razorpay Checkout, `mode: "stripe"` with a Stripe Checkout `url` to redirect to, or `mode: "demo"` when no gateway keys are set. `gateway` picks one of the configured gateways listed by GET /payments/plans.',
    requestBody: body({ plan_id: int(), gateway: str({ enum: ['razorpay', 'stripe'] }) }, ['plan_id']),
  }) },
  '/payments/verify': { post: op('Payments', 'Verify a Razorpay payment signature and activate the plan', {
    auth: 'user', requestBody: body({ payment_id: int(), razorpay_order_id: str(), razorpay_payment_id: str(), razorpay_signature: str() }, ['payment_id', 'razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature']), responses: OK_FLAG,
  }) },
  '/payments/stripe/verify': { post: op('Payments', 'Confirm a Stripe Checkout Session after the redirect back and activate the plan', {
    auth: 'user', requestBody: body({ session_id: str({ description: 'The session_id query parameter Stripe appends to the success URL' }) }, ['session_id']),
    responses: { 200: { description: 'OK', ...json(obj({ ok: { type: 'boolean' }, paid: { type: 'boolean' } })) } },
  }) },
  '/payments/stripe/webhook': { post: op('Payments', 'Stripe webhook (called by Stripe, not by apps)', {
    description: 'Verifies the `Stripe-Signature` header with STRIPE_WEBHOOK_SECRET. Handles checkout.session.completed, checkout.session.async_payment_succeeded and checkout.session.async_payment_failed.',
    requestBody: { required: true, ...json({ type: 'object', description: 'Stripe event' }) },
    responses: { 200: { description: 'Received', ...json(obj({ received: { type: 'boolean' } })) }, 400: { $ref: '#/components/responses/Error' } },
  }) },
  '/payments/demo-confirm': { post: op('Payments', 'Demo mode only: mark a payment paid', { auth: 'user', requestBody: body({ payment_id: int() }, ['payment_id']), responses: OK_FLAG }) },
  '/payments/mine': { get: op('Payments', 'My payments and subscriptions', { auth: 'user' }) },

  // ---- Admin ----
  '/admin/dashboard': { get: op('Admin', 'Analytics dashboard: users, revenue, reading, AI usage, search trends', { auth: 'staff' }) },
  '/admin/entities': { get: op('Admin', 'Entity definitions (fields, filters, options) that drive the admin UI', { auth: 'staff' }) },
};

const entityParam = { name: 'entity', in: 'path', required: true, schema: str({ enum: Object.keys(ENTITIES) }), description: 'Entities marked admin-only (users, plans, subscriptions, payments, AI logs…) need the admin role.' };
const adminOnly = Object.entries(ENTITIES).filter(([, e]) => e.adminOnly).map(([k]) => k).join(', ');
const recordBody = { required: true, content: {
  'application/json': { schema: { type: 'object', additionalProperties: true, description: 'Field names come from GET /admin/entities' } },
  'multipart/form-data': { schema: { type: 'object', additionalProperties: true, description: 'Use for image/file fields' } },
} };
paths['/admin/{entity}'] = {
  get: op('Admin', 'List records (25 per page)', { auth: 'staff', description: `Admin-only entities: ${adminOnly}.`, params: [entityParam, query('q', str(), 'Search'), query('page', int({ minimum: 1 })), { name: 'filters', in: 'query', style: 'form', explode: true, schema: { type: 'object', additionalProperties: { type: 'string' } }, description: 'Any filter listed for the entity, e.g. `role=editor`' }] }),
  post: op('Admin', 'Create a record', { auth: 'staff', params: [entityParam], requestBody: recordBody, responses: { 200: { description: 'Saved', ...json(obj({ id: int(), message: str({ nullable: true }) })) } } }),
};
paths['/admin/{entity}/{id}'] = {
  get: op('Admin', 'Get one record', { auth: 'staff', params: [entityParam, idParam()] }),
  put: op('Admin', 'Update a record', { auth: 'staff', params: [entityParam, idParam()], requestBody: recordBody, responses: { 200: { description: 'Saved', ...json(obj({ id: int(), message: str({ nullable: true }) })) } } }),
  delete: op('Admin', 'Delete a record (and its children)', { auth: 'staff', params: [entityParam, idParam()], responses: OK_FLAG }),
};

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: `${config.appName} API`,
    version: '1.0.0',
    description: 'REST API for the web app and future mobile apps.\n\n1. Call **POST /auth/login** (try `admin@nyayagrantha.local` / `admin123`).\n2. Click **Authorize** and paste the `token`.\n3. Protected endpoints now send `Authorization: Bearer <token>`.',
  },
  servers: [{ url: '/api' }],
  security: [{ bearerAuth: [] }],
  tags: ['System', 'Auth', 'Library', 'Search', 'My study', 'AI', 'Media', 'Community', 'Classes', 'Marketplace', 'Vendor', 'Membership', 'Payments', 'App', 'Tools', 'Admin'].map((name) => ({ name })),
  paths,
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      User: obj({ id: int(), name: str(), email: str(), phone: str({ nullable: true }), phone_verified: { type: 'boolean' }, role: str({ enum: ['user', 'editor', 'admin'] }), user_type: str({ enum: USER_TYPES }), institution: str({ nullable: true }), bio: str({ nullable: true }), avatar: str({ nullable: true }), is_public: int() }),
      AuthResult: obj({ token: str(), user: { $ref: '#/components/schemas/User' } }),
      PlanCard: obj({
        id: int(), name: str(), slug: str(), description: str(), price: { type: 'number' }, currency: str(), period: str({ enum: ['month', 'year', 'lifetime', 'days'] }),
        duration_days: int(), price_label: str({ example: '₹199/mo' }), features: { type: 'array', items: str() }, ai_daily_quota: int(), ai_unlimited: { type: 'boolean' },
        is_free: { type: 'boolean' }, is_popular: { type: 'boolean' }, is_current: { type: 'boolean' }, sort_order: int(),
      }),
      OtpSent: obj({ ok: { type: 'boolean' }, channel: str({ enum: ['whatsapp', 'email'] }), sent_to: str({ example: '+91 98XXXXXX10' }), expires_in: int({ description: 'Seconds' }), resend_in: int({ description: 'Seconds' }), dev_code: str({ description: 'Only when no delivery channel is configured, outside production' }) }),
      Error: obj({ error: str() }),
    },
    responses: { Error: { description: 'Error', ...json({ $ref: '#/components/schemas/Error' }) } },
  },
};

export const swaggerHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${config.appName} API Docs</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css">
</head>
<body>
<div id="swagger"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger', persistAuthorization: true, docExpansion: 'none' });</script>
</body>
</html>`;
