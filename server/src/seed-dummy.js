// Dummy data for trying the app: members with subscriptions and payments, inbox tickets and playable audio.
//   npm run seed:dummy             – (re)create the dummy data
//   npm run seed:dummy -- --remove – delete it again
// Every record is tagged `dummy: 1`, so removal never touches real data. Audio files are spoken with the
// Windows text-to-speech voices when available, otherwise a soft generated tone is used.
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config } from './config.js';
import { closeDb, find, findOne, insert, remove, toSqlDate } from './db.js';

const TAG = { dummy: 1 };
const AUDIO_DIR = path.join(config.uploadsDir, 'audio');
const ago = (days, hours = 0) => toSqlDate(new Date(Date.now() - (days * 24 + hours) * 3600000));
const after = (date, days) => toSqlDate(new Date(new Date(date.replace(' ', 'T')).getTime() + days * 86400000));

// [name, user_type, institution, joined days ago]
const USERS = [
  ['Aarav Sharma', 'student', 'Banaras Hindu University', 38],
  ['Priya Iyer', 'researcher', 'University of Madras', 41],
  ['Rohan Deshpande', 'practitioner', 'Bombay High Court', 13],
  ['Ananya Mishra', 'student', 'Sampurnanand Sanskrit University', 9],
  ['Dr. Venkatesh Rao', 'faculty', 'National Sanskrit University, Tirupati', 60],
  ['Meera Joshi', 'enthusiast', null, 26],
  ['Karthik Subramanian', 'researcher', 'Adyar Library and Research Centre', 46],
  ['Sneha Kulkarni', 'student', 'Deccan College, Pune', 21],
  ['Arjun Patel', 'practitioner', 'Gujarat High Court', 7],
  ['Dr. Lakshmi Narayanan', 'faculty', 'Madras Sanskrit College', 4],
  ['Vikram Singh', 'enthusiast', null, 3],
  ['Kavya Bhatt', 'student', 'Shree Somnath Sanskrit University', 2],
  ['Siddharth Menon', 'researcher', 'Kerala University Oriental Research Institute', 11],
  ['Ishita Ghosh', 'faculty', 'Jadavpur University', 9],
];

// [user, plan slug, gateway, started days ago, status] — each paid subscription gets a matching payment.
const SUBSCRIPTIONS = [
  ['Aarav Sharma', 'scholar-monthly', 'razorpay', 36, 'active'], // expired; renewed below
  ['Aarav Sharma', 'scholar-monthly', 'razorpay', 5, 'active'],
  ['Priya Iyer', 'scholar-annual', 'razorpay', 40, 'active'],
  ['Rohan Deshpande', 'scholar-annual', 'stripe', 12, 'active'],
  ['Dr. Venkatesh Rao', 'institution', 'razorpay', 58, 'active'],
  ['Sneha Kulkarni', 'scholar-monthly', 'razorpay', 20, 'active'],
  ['Karthik Subramanian', 'scholar-monthly', 'razorpay', 45, 'active'], // expired 15 days ago
  ['Dr. Lakshmi Narayanan', 'scholar-annual', 'stripe', 3, 'active'],
  ['Kavya Bhatt', 'scholar-monthly', 'razorpay', 1, 'active'],
  ['Siddharth Menon', 'scholar-monthly', 'razorpay', 10, 'cancelled'],
  ['Ishita Ghosh', 'institution', 'stripe', 8, 'active'],
  ['Meera Joshi', 'scholar-monthly', 'razorpay', 25, 'active'],
];
// Checkouts that never completed: [user, plan slug, gateway, days ago, status]
const OPEN_PAYMENTS = [
  ['Vikram Singh', 'scholar-monthly', 'razorpay', 2, 'created'],
  ['Arjun Patel', 'scholar-annual', 'stripe', 6, 'failed'],
];

// [kind, name (user or visitor), email for visitors, subject, message, status, hours ago, admin reply]
const TICKETS = [
  ['helpdesk', 'Priya Iyer', null, 'Submitting a paper on vyāpti for review', 'I have a 6,000-word paper comparing the vyāpti definitions in the Tattvacintāmaṇi with Dharmakīrti. Could the editorial board review it for the research section? What citation style do you prefer?', 'open', 20],
  ['contact', 'Rohan Deshpande', null, 'Institutional licence for our chambers', 'We are a group of 12 advocates who use Nyāya methods of argument in practice. Is there an institutional plan with a single invoice and GST details?', 'in_progress', 70],
  ['feedback', 'Aarav Sharma', null, 'Audio recitation is a little fast', 'The Nyāya Sūtra recitation is lovely, but beginners would benefit from a slower version or a speed control.', 'open', 50],
  ['feedback', 'Meera Joshi', null, 'The dictionary is wonderful', 'Searching "pramana" and getting प्रमाण with a clear meaning is exactly what I needed. Thank you!', 'closed', 216, 'Thank you, Meera! We are adding 200 more terms next month.'],
  ['helpdesk', 'Dr. Venkatesh Rao', null, 'Typesetting Devanagari footnotes', 'Our department journal needs Devanagari footnotes with IAST in the main text. Do your paper templates support this?', 'closed', 290, 'Yes — the Research Paper Template in Tools includes a footnote style with Tiro Devanagari. We have emailed you a sample.'],
  ['contact', 'Rahul Verma', 'rahul.verma@example.com', 'Payment deducted but plan not active', 'I paid ₹199 for Scholar Monthly via UPI this morning but my account still shows the Free plan. Transaction reference ends with 4821.', 'open', 5],
  ['feedback', 'Sneha Kulkarni', null, 'Notes not syncing on my phone', 'Notes I write on the laptop take a while to appear on my phone. Refreshing fixes it. Is this expected?', 'in_progress', 96],
  ['contact', 'Anjali Nair', 'anjali.nair@example.com', 'Partnership for manuscript digitisation', 'Our trust holds about 300 palm-leaf manuscripts on Nyāya and Mīmāṃsā. We would like to discuss digitising and publishing them on your platform.', 'open', 150],
  ['helpdesk', 'Ishita Ghosh', null, 'ISBN and copyright for a translation', 'I am finishing an English translation of the Nyāyamañjarī, book 1. Can the Publication Help Desk advise on ISBN registration and copyright for a translation of a classical text?', 'open', 7],
  ['feedback', 'Kavya Bhatt', null, 'Gujarati translations for Tarkasaṅgraha', 'Please add Gujarati translations for all sections of the Tarkasaṅgraha. Many students at our university would use them.', 'closed', 330, 'Good news, Kavya — Gujarati is now available for the opening sections, with the rest in progress.'],
];

// [title, kind, speaker, text title, premium, plays, days ago, voice, spoken text]
const AUDIO = [
  ['Nyāya Sūtra 1.1.1 — Recitation', 'recitation', 'Pt. Ramakrishna Shastri', 'Nyāya Sūtra', 0, 142, 30, 'David',
    'Sample recording. Nyaya Sutra, chapter one, sutra one. Pramana, prameya, samshaya, prayojana, drishtanta, siddhanta, avayava, tarka, nirnaya, vada, jalpa, vitanda, hetvabhasa, chala, jati, nigrahasthana. Knowledge of the true nature of these sixteen leads to the highest good.'],
  ['Tarkasaṅgraha — Maṅgalācaraṇa and the Seven Padārthas', 'recitation', 'Vidushi Gayatri Devi', 'Tarkasaṅgraha', 0, 96, 26, 'Zira',
    'Sample recording. The Tarkasangraha of Annambhatta opens with a salutation to the teacher, and then names seven categories of reality: substance, quality, action, universal, particularity, inherence, and absence.'],
  ['Introduction to the Four Pramāṇas', 'lecture', 'Dr. Venkatesh Rao', 'Nyāya Sūtra', 0, 88, 21, 'David',
    'Sample lecture. Welcome. Today we introduce the four means of valid knowledge accepted by the Nyaya school. Perception arises from contact between a sense and its object. Inference depends on a known pervasion, as fire with smoke. Comparison teaches the meaning of a word through similarity. And testimony is the statement of a reliable person. In the next session we will look at perception in detail.'],
  ['Vyāpti in Navya-Nyāya', 'lecture', 'Dr. Lakshmi Narayanan', 'Tattvacintāmaṇi', 1, 41, 14, 'Zira',
    'Sample lecture for members. Gangesha devotes a whole section of the Tattvacintamani to pervasion. He tests five early definitions, shows why each fails, and then offers his own. In this lecture we read those five definitions slowly and ask what each one misses.'],
  ['Nyāya Bhāṣya on Perception', 'lecture', 'Prof. S. Mukherjee', 'Nyāya Bhāṣya', 1, 27, 9, 'David',
    'Sample lecture for members. Vatsyayana explains sutra one point one point four, the definition of perception. Perception is knowledge produced by sense object contact, which is not verbal, which does not wander, and which is determinate. We will take each qualification in turn.'],
  ['Tarkasaṅgraha Audiobook — Part 1', 'audiobook', 'Narrated by Meera Joshi', 'Tarkasaṅgraha', 0, 64, 18, 'Zira',
    'Sample audiobook. Part one. Substances are nine: earth, water, fire, air, ether, time, space, self, and mind. Qualities are twenty four, beginning with colour, taste, smell and touch. In this part we listen to the definitions of the first four substances.'],
  ['Vaiśeṣika Sūtra — Audiobook Part 1', 'audiobook', 'Narrated by Arjun Patel', 'Vaiśeṣika Sūtra', 1, 19, 6, 'David',
    'Sample audiobook for members. Now, therefore, we shall explain dharma. Dharma is that from which comes prosperity and the highest good. So begins the Vaisheshika Sutra of Kanada.'],
  ['Nyāyamañjarī — Jayanta on Testimony', 'lecture', 'Dr. Ishita Ghosh', 'Nyāyamañjarī', 1, 12, 2, 'Zira',
    'Sample lecture for members. Jayanta Bhatta writes with wit and force. In the Nyayamanjari he defends verbal testimony as an independent means of knowledge, answering both the Buddhist and the Mimamsa critic.'],
];

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const emailOf = (name) => `${slug(name.replace(/^Dr\.\s*/, '')).replace(/-/g, '.')}@example.com`;

async function removeDummy() {
  let n = 0;
  for (const table of ['subscriptions', 'payments', 'feedback', 'audio', 'notifications', 'users']) n += await remove(table, TAG);
  if (fs.existsSync(AUDIO_DIR)) for (const f of fs.readdirSync(AUDIO_DIR)) if (f.startsWith('dummy-')) fs.unlinkSync(path.join(AUDIO_DIR, f));
  return n;
}

/** Speaks each [file, voice, text] to a 16 kHz mono WAV with System.Speech (Windows). Returns false if unavailable. */
function speakAll(jobs) {
  if (process.platform !== 'win32') return false;
  const list = path.join(os.tmpdir(), `ng-tts-${process.pid}.json`);
  fs.writeFileSync(list, JSON.stringify(jobs.map(([file, voice, text]) => ({ file, voice: `Microsoft ${voice} Desktop`, text }))));
  const ps = `
    Add-Type -AssemblyName System.Speech
    $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    foreach ($j in (Get-Content -Raw -Encoding UTF8 $env:NG_TTS_LIST | ConvertFrom-Json)) {
      $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
      try { $s.SelectVoice($j.voice) } catch {}
      $s.Rate = -1
      $s.SetOutputToWaveFile($j.file, $fmt)
      $s.Speak($j.text)
      $s.Dispose()
    }`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { env: { ...process.env, NG_TTS_LIST: list }, stdio: 'pipe' });
    return jobs.every(([file]) => fs.existsSync(file) && fs.statSync(file).size > 1000);
  } catch {
    return false;
  } finally {
    fs.rmSync(list, { force: true });
  }
}

/** Fallback: a quiet tanpura-like drone (Sa–Pa) of the given length, as a 16 kHz mono WAV. */
function writeTone(file, seconds) {
  const rate = 16000;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.min(1, t / 2, (seconds - t) / 2) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 0.25 * t));
    const v = (Math.sin(2 * Math.PI * 138.6 * t) + 0.6 * Math.sin(2 * Math.PI * 207.9 * t) + 0.3 * Math.sin(2 * Math.PI * 277.2 * t)) / 1.9;
    buf.writeInt16LE(Math.round(v * env * 9000), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

/** "m:ss" from a WAV file: walks the RIFF chunks for the byte rate (fmt) and the audio length (data). */
const wavDuration = (file) => {
  const b = fs.readFileSync(file);
  let byteRate = 32000, dataBytes = b.length - 44;
  for (let pos = 12; pos + 8 <= b.length;) {
    const id = b.toString('ascii', pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') byteRate = b.readUInt32LE(pos + 16);
    if (id === 'data') { dataBytes = Math.min(size, b.length - pos - 8); break; }
    pos += 8 + size + (size % 2);
  }
  const secs = Math.max(1, Math.round(dataBytes / byteRate));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
};

async function seedDummy() {
  const removed = await removeDummy();
  if (removed) console.log(`Removed ${removed} earlier dummy records.`);

  const plans = new Map((await find('plans', {})).map((p) => [p.slug, p]));
  const texts = new Map((await find('texts', {}, { fields: ['id', 'title'] })).map((t) => [t.title, t.id]));
  if (!plans.size) throw new Error('No membership plans found. Run npm run setup first.');

  const users = new Map();
  const hash = bcrypt.hashSync('dummy123', 10);
  for (const [i, [name, user_type, institution, days]] of USERS.entries()) {
    const email = emailOf(name);
    if (await findOne('users', { email })) continue; // never touch a real account with the same email
    const id = await insert('users', {
      ...TAG, name, email, phone: `+9198${String(76543210 + i * 1111).slice(0, 8)}`, password_hash: hash, role: 'user', user_type, institution,
      bio: null, status: 'active', is_public: i % 3 === 0 ? 1 : 0, created_at: ago(days, i % 7),
    });
    users.set(name, id);
  }

  let subs = 0, pays = 0;
  for (const [i, [name, planSlug, gateway, days, status]] of SUBSCRIPTIONS.entries()) {
    const plan = plans.get(planSlug);
    const userId = users.get(name);
    if (!plan || !userId) continue;
    const start = ago(days, i % 5);
    const paymentId = await insert('payments', {
      ...TAG, user_id: userId, plan_id: plan.id, amount: plan.price, currency: config.currency, gateway, status: 'paid',
      order_id: `${gateway === 'stripe' ? 'cs_dummy' : 'order_dummy'}_${1000 + i}`, gateway_payment_id: `${gateway === 'stripe' ? 'pi_dummy' : 'pay_dummy'}_${5000 + i}`,
      created_at: start, paid_at: start,
    });
    await insert('subscriptions', { ...TAG, user_id: userId, plan_id: plan.id, payment_id: paymentId, starts_at: start, ends_at: after(start, plan.duration_days), status, created_at: start });
    subs++; pays++;
  }
  for (const [i, [name, planSlug, gateway, days, status]] of OPEN_PAYMENTS.entries()) {
    const plan = plans.get(planSlug);
    if (!plan || !users.get(name)) continue;
    await insert('payments', { ...TAG, user_id: users.get(name), plan_id: plan.id, amount: plan.price, currency: config.currency, gateway, status, order_id: `order_dummy_${2000 + i}`, created_at: ago(days, 3) });
    pays++;
  }

  for (const [kind, name, email, subject, message, status, hours, reply] of TICKETS) {
    const userId = users.get(name) ?? null;
    await insert('feedback', {
      ...TAG, user_id: userId, kind, name, email: email || emailOf(name), phone: null, subject, message, status,
      admin_reply: reply || null, created_at: ago(0, hours),
    });
  }

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const files = AUDIO.map(([title]) => path.join(AUDIO_DIR, `dummy-${slug(title)}.wav`));
  const spoken = speakAll(AUDIO.map(([, , , , , , , voice, text], i) => [files[i], voice, text]));
  if (!spoken) files.forEach((f, i) => writeTone(f, 20 + i * 5));
  for (const [i, [title, kind, speaker, textTitle, is_premium, plays, days]] of AUDIO.entries()) {
    await insert('audio', {
      ...TAG, title, kind, speaker, text_id: texts.get(textTitle) ?? null, file: `/uploads/audio/${path.basename(files[i])}`,
      duration: wavDuration(files[i]), description: `Sample audio (dummy data${spoken ? ', synthetic voice' : ', placeholder tone'}).`,
      is_premium, plays, created_at: ago(days),
    });
  }

  console.log(`Dummy data added: ${users.size} users, ${subs} subscriptions, ${pays} payments, ${TICKETS.length} inbox tickets, ${AUDIO.length} audio files (${spoken ? 'spoken with Windows text-to-speech' : 'placeholder tones'}).`);
  console.log('Dummy users log in with <email>@example.com / dummy123, e.g. aarav.sharma@example.com');
}

const run = process.argv.includes('--remove')
  ? removeDummy().then((n) => console.log(`Removed ${n} dummy records and their audio files.`))
  : seedDummy();

run.catch((e) => { console.error('Dummy data failed:', e.message); process.exitCode = 1; }).finally(closeDb);
