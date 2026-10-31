# Nyāya Grantha Sarvasvam

*A complete digital ecosystem for Nyāya knowledge, research and AI-assisted learning.* **न्यायः परमं बलम्**

A mobile-first web app built with **React (Vite)** on the front end and **Node.js (Express)** on the back end, using **MongoDB**. It installs on phones as a PWA. All data goes through a JSON REST API, so a native Android/iOS app (Flutter / React Native) can use the same backend.

---

## Quick start

Requirements: Node.js 22.13 or newer, and MongoDB 6 or newer (a local `mongod`, or a MongoDB Atlas cluster).

```bash
# 1. Install dependencies
npm run install:all

# 2. Configure: edit server/.env (database, API keys). A copy of .env.example is already there.

# 3. Make sure MongoDB is running, then create the indexes and starter content
npm run setup

# 4a. Development: API on :5070 with auto-reload, React on :5185 with hot reload
npm run dev            # open http://localhost:5185

# 4b. Production: build the React app; the Node server serves it with the API
npm run build
npm start              # open http://localhost:5070
```

**Starter logins** (change them after the first login):

| Role    | Email                        | Password     |
|---------|------------------------------|--------------|
| Admin   | `admin@nyayagrantha.local`   | `admin123`   |
| Editor  | `editor@nyayagrantha.local`  | `editor123`  |
| Student | `student@nyayagrantha.local` | `student123` |
| Researcher | `researcher@nyayagrantha.local` | `researcher123` |
| Faculty | `faculty@nyayagrantha.local` | `faculty123` |
| Vendor (demo shop) | `vendor@nyayagrantha.local` | `vendor123` |
| Practitioner | `practitioner@nyayagrantha.local` | `practitioner123` |
| Enthusiast | `enthusiast@nyayagrantha.local` | `enthusiast123` |

**Database.** Data lives in the `nayagranth` MongoDB database (change it with `MONGODB_URI` in `server/.env`). Records keep numeric ids from a `counters` collection, so API URLs such as `/api/texts/3` stay short and stable; Mongo's own `_id` is never sent to clients.

`npm run setup:fresh` drops the whole `nayagranth` database and reloads the starter content.

**Dummy data.** `npm run seed:dummy` adds sample members (14 users with subscriptions and Razorpay/Stripe payments), 10 inbox tickets and 8 playable audio tracks spoken with the Windows text-to-speech voices. Dummy users log in as `<name>@example.com` / `dummy123` (e.g. `aarav.sharma@example.com`). Every dummy record is tagged `dummy: 1`; `npm run seed:dummy -- --remove` deletes them and their audio files without touching real data.

> This folder sits inside XAMPP's `www`, but the app is **not** served by Apache. The `.htaccess` file blocks Apache from the whole folder so that `server/.env` can never be downloaded.

---

## Configuration (`server/.env`)

| Setting | Purpose | When left blank |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string, including the database name | `mongodb://127.0.0.1:27017/nayagranth` |
| `JWT_SECRET` | Signs login tokens. A random value was generated. | — |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | AI Assistance. Works with any OpenAI-compatible endpoint, including local LM Studio or Ollama. | Offline mode: answers come from the dictionary and library |
| `AI_FREE_DAILY_QUOTA` | AI requests per day for free accounts | 5 |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay payments (UPI, cards, net banking, wallets) | — |
| `STRIPE_SECRET_KEY` | Stripe Checkout (cards, international payments). When Razorpay is also set, users choose the gateway at checkout | — |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook at `<APP_URL>/api/payments/stripe/webhook` (event `checkout.session.completed`), which activates the plan even if the user closes the tab before returning | Plans activate when the user returns from Stripe |
| `CLIENT_URLS` | Extra web origins that Stripe may redirect back to (comma-separated) | `http://localhost:5185` |
| _(no gateway keys)_ | | **Demo mode**: checkout simulates payment, and the admin panel marks it as demo |
| `WHATSAPP_SUPPORT_NUMBER` | Floating WhatsApp support button and Contact page | — |
| `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business Cloud API, so admins can broadcast notifications on WhatsApp | Notifications are in-app only |
| `GOOGLE_CLIENT_ID` | "Continue with Google" social login | Button hidden |
| `SUPPORT_EMAIL`, `CONTACT_ADDRESS` | Shown on the Contact page | Defaults |

---

## Features → where they live

| Blueprint item | Implementation |
|---|---|
| **Text Library** (ancient / medieval / contemporary) | `/library`, reader at `/text/:id`: Sanskrit, IAST, translation and commentary layers, font size, contents, progress tracking, premium preview and lock |
| **AI Assistance** | `/ai`: Chat Tutor, Explain, Summary Generator, Translate, Q&A, Question Generator, Learning Path. In the reader, each passage has Explain, Summary and Translate. Daily quota depends on the plan. |
| **Search** (text, author, topic, Sanskrit word, voice) | `/search`: Devanagari, IAST and plain spellings all match (`प्रमाण` = `pramāṇa` = `pramana`); mic voice search; trending searches |
| **Audio Support** | `/audio` (uploaded recitations, lectures, audiobooks) plus **Listen** (read aloud) on every passage |
| **PDF Library** | `/pdfs`, reader at `/pdfs/:id`: in-app PDF viewer built on pdf.js (continuous scroll, page jump, zoom / fit width / fit page, full screen, download, keyboard). Works on Android, where browsers have no built-in PDF viewer. Members-only PDFs and download permission per file. Admins and editors upload in **Admin → PDF Library** (drag and drop, up to 100 MB, with an upload progress bar); the title, page count and a cover from page 1 are filled in automatically. PDFs linked to a text appear in its reader. |
| **PDF indexing** (`server/src/pdf-index.js`) | Every uploaded PDF is indexed in the background. Its text is cleaned (running headers/footers and page numbers removed, ligatures and Devanagari vowel order fixed, hyphenated words re-joined, lines joined into paragraphs) and split **chapter-wise and lesson-wise** using, in order: an index typed in the admin form (`# Chapter | page`, `## Lesson | page`), the PDF's bookmarks, or detected headings (font size, numbering, and words such as Chapter / Lesson / Unit / अध्याय / पाठ / प्रकरण / आह्निक), or verse numbers (`॥ १.००१.०१ ॥` → chapter १, lesson १.००१ named by its opening words); otherwise by page ranges. Bookmarks that cover half the book or more are treated as too coarse. Indexing runs in a worker thread so the API stays responsive. Readers get a Contents sidebar, a Text mode that reads one chapter or lesson at a time, and search inside the PDF; chapters also appear in the site-wide search. Admin → PDF Library shows the status and the detected index, with Re-index. Scanned PDFs without a text layer are flagged "No text". Data: `pdf_sections`, `pdf_pages`. |
| **PPT Viewer** | `/presentations`: swipe or keyboard slide viewer with full screen; PDF attachments open in the same PDF viewer, PPTX attachments download |
| **Print & Share** | Print / Save as PDF (print stylesheet); share with Web Share, falling back to clipboard and WhatsApp |
| **Bookmarks & Notes** | `/bookmarks`, `/notes`: per-passage bookmarks, coloured annotations, export to Markdown |
| **User / Subscription / Membership / Payment** | Registration, profiles, roles (user / editor / admin), `/plans` with Razorpay checkout and signature verification, subscription history |
| **Admin Panel** | `/admin`: dashboard with stat tiles and 14-day trends, an activity chart (sign-ups, reading, AI requests, payments; switchable to a table), library inventory, most read texts and PDFs, research trends, recent uploads, tickets and payments, and integration status. A grouped sidebar (a drawer on phones) leads to CRUD for texts, sections, categories, PDFs, audio, presentations, dictionary, quotes, events, notifications, forum, reviews, inbox, users, plans, subscriptions, payments, AI logs |
| **Faculty workspace** | `/faculty` (Faculty Desk) and `/classes`. Accounts whose type is *Faculty* (and admins/editors) create classes; students join with a 6-character code or an invite link (`/classes/join/:code`). Each class has a **stream** (teacher announcements, student questions, replies), **assignments** linked to a library text, PDF or presentation with a due date, marks and an optional written answer, **grading** (marks, feedback, return for revision; late work is flagged), **live sessions** that appear under Live Classes only for the class, and a **student report** (submitted, missing, average score, reading progress on assigned texts, sections read this week, last active) with CSV download. The Faculty Desk lists work to grade, unanswered questions, deadlines in the next 7 days, upcoming sessions and new students. Students and teachers get in-app notifications for each step. Admins see every class under **Admin → Faculty Classes**. The demo faculty login teaches *Tarkasaṅgraha — Foundations* (code `NYAYA1`), which the demo student has joined. |
| **Marketplace (vendors)** | `/shop`, product pages at `/shop/:id`, storefronts at `/shop/vendor/:id`, and the **Vendor Panel** at `/vendor`. Any user can apply to sell (shop name, phone/WhatsApp, city, logo, optional GSTIN and address, which stay private); an admin approves the shop in **Admin → Vendors**, and the vendor is notified. Approved vendors add products (books, e-books, manuscripts & prints, courses, audio, study aids) with up to 6 photos, price and MRP, stock, author/publisher/ISBN and an optional buy link, and can keep a product as a draft. There is no checkout: buyers tap WhatsApp, call, email or the seller's buy link, and each tap counts as a lead in the Vendor Panel next to views. Admins can hide a product (the vendor sees the reason) or suspend a shop, which hides all its products. The newest products appear on the home page. Everything is served by the public JSON API (`GET /products`, `/products/:id`, `/vendors/:id`), so the mobile app shows the same catalogue. |
| **Social / WhatsApp** | Google login, share buttons, WhatsApp support button, WhatsApp broadcast |
| **Basic modules** | Home, About, Contact, Login/Signup, Feedback, Share App, Reviews, Archives, Notifications, Publication Help Desk, Tools & Techniques, More |
| **Nyāya Terminology Dictionary** | `/dictionary`, entries at `/dictionary/:slug`: 110 terms in Sanskrit alphabetical order with a letter index and categories. Each entry has gender, meaning (English and Hindi; Marathi and Gujarati can be added), the classical definition (lakṣaṇa) with IAST and a link to its source sūtra, explanation, example, etymology, related terms (linked both ways) and the library passages that use it. Search works in Devanagari, IAST, plain spelling or English, with voice input. Flashcards mode for learning. Texts in the reader show their key terms. Edit in **Admin → Dictionary**; `npm run setup` adds new starter terms without overwriting edits (data in `server/src/dictionary-data.js`). |
| **Additional features** | Sanskrit OCR (Tesseract.js, runs on the device), Śloka Analyzer (laghu/guru, gaṇas, metre identification), Nyāya Terminology Dictionary, Citation Generator (MLA/APA/Chicago), Research Paper Templates, Discussion Forum, Live Classes & Webinars, Scholar Profiles, AI Chat Tutor, Voice-to-Text Sanskrit input, Personalized Learning Path, Reading Analytics, Subscription Analytics, Research Trend Analysis, Admin Analytics Dashboard |
| **Security** | bcrypt password hashing, JWT auth, role-based access, payment signature verification, upload type whitelist, Apache deny rule, content moderation (reviews, forum lock and delete) |
| **Offline reading** | PWA service worker keeps opened texts readable offline; the cache is cleared on logout |

Not built yet (on the blueprint's *Future Scope* list): native store apps, a collaborative research workspace, certification courses, the manuscript preservation centre, and blockchain copyright.

---

## Languages and PDF

**Five languages:** English, हिन्दी, संस्कृतम्, मराठी and ગુજરાતી. Users pick a language from the language button in the app bar or from the menu. The choice is stored in the browser.

- **Interface:** `client/src/i18n-dict.js` maps each English string to Hindi, Sanskrit, Marathi and Gujarati, and `t('…')` in `client/src/i18n.jsx` looks it up. The app shell, page titles, home, library, reader, search, dictionary, login, profile, bookmarks, notes, notifications and learning path are translated. A string with no translation shows in English. The admin panel stays in English.
- **Content:** every section has `translation` (English) plus `translation_hi`, `translation_sa`, `translation_mr` and `translation_gu`. Edit them in **Admin → Texts → Sections**. When a section has no translation in the chosen language, the reader shows the English one with a note. Search matches all five translations, and Gujarati is matched as Devanagari.
- Starter translations for the seeded sections are in `server/src/section-translations.js`. Have a scholar review them, just like the English ones.

**PDF:** the **Download PDF** button in the reader opens `/text/:id/pdf`. That page has a cover, a contents index with links, and each chapter starting on a new page, with page numbers. You can choose one chapter or all chapters, in any of the five languages. The button opens the browser's print window, where you choose "Save as PDF". The browser shapes Devanagari and Gujarati correctly, which client-side PDF libraries do not. Members-only texts include only the free preview.

---

## Project structure

```
nayagranth/
├── server/                 Node.js + Express REST API
│   ├── src/index.js        app wiring; serves client/dist in production
│   ├── src/schema.js       MongoDB collections and indexes
│   ├── src/seed.js         starter texts, dictionary, plans, slides, events
│   ├── src/setup.js        npm run setup
│   ├── src/ai.js           AI tasks + offline fallback
│   ├── src/services.js     subscriptions, quotas, notifications, WhatsApp
│   ├── src/admin-entities.js  admin panel definitions (drive both API and UI)
│   └── src/routes/         auth, library, search, user, ai, media, pdfs, community, classes, shop, payments, admin
├── client/                 React + Vite front end
│   ├── src/pages/          one file per screen
│   ├── src/admin/Admin.jsx admin panel (dashboard + generic CRUD)
│   ├── src/components/     layout, UI kit, charts, PDF viewer (pdf.js), note editor, AI modal
│   └── public/             PWA manifest, service worker, icons
└── shared/translit.js      Devanagari⇄IAST, search normalisation, metre analysis (used by both sides)
```

## REST API (for the mobile app)

Interactive docs (Swagger UI): http://localhost:5070/api/docs, with the OpenAPI document at `/api/openapi.json`. The spec lives in `server/src/openapi.js`.

Authenticate with `POST /api/auth/login` → `{ token }`, then send `Authorization: Bearer <token>`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/google` · `GET /auth/me` · `PUT /auth/profile`, `/auth/password` |
| Library | `GET /home`, `/categories`, `/texts`, `/texts/:id`, `/archives`, `/glossary` · `POST /texts/:id/progress` |
| Search | `GET /search?q=&scope=all\|text\|author\|topic\|sanskrit&era=` · `GET /search/trending` |
| Personal | `/me/bookmarks`, `/me/notes`, `/me/notifications`, `/me/analytics`, `/me/learning-path` |
| AI | `GET /ai/modes` · `POST /ai {mode, input, section_id?, history?}` · `GET /ai/history` |
| Media | `GET /audio`, `/presentations`, `/presentations/:id`, `/pdfs`, `/pdfs/:id` · `POST /pdfs/:id/download` |
| Community | `/forum`, `/forum/:id`, `/events`, `/reviews`, `/feedback`, `/scholars` |
| Classes | `GET/POST /classes` · `POST /classes/join` · `GET /classes/dashboard` · `/classes/:id` (+ `/students`, `/posts`, `/assignments`, `/assignments/:aid/submit`, `/submissions/:sid`, `/sessions`, `/code`, `/leave`) |
| Marketplace | `GET /products?q=&category=&vendor=&sort=&page=` · `GET /products/:id`, `/vendors/:id` · `POST /products/:id/contact` |
| Vendor | `GET/PUT /vendor/me` · `POST /vendor/apply` · `GET/POST /vendor/products` · `PUT/DELETE /vendor/products/:id` (multipart, `images` up to 6) |
| Payments | `GET /payments/plans` · `POST /payments/checkout`, `/payments/verify` |
| Admin | `GET /admin/dashboard`, `/admin/entities` · CRUD on `/admin/:entity` |

## Content note

The Sanskrit in the starter content consists of the standard opening sūtras and kārikās of each text. The English translations, commentary notes and overviews are editorial study aids written for this app. Have a scholar review them, and replace or extend them from **Admin → Texts → Sections**. When you add a section, the IAST transliteration is generated automatically from the Devanagari.
