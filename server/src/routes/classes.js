// Faculty workspace: classes that students join with a code, announcements and questions, assignments
// with graded submissions, class sessions (live classes), a progress report per student and the Faculty Desk.
import { Router } from 'express';
import crypto from 'node:crypto';
import { aggregate, attach, count, countBy, find, findOne, insert, remove, update, now, daysFromNow } from '../db.js';
import { HttpError, fields, requireAuth } from '../middleware.js';
import { isFaculty, isStaff, notify, notifyMany } from '../services.js';

const r = Router();
r.use(requireAuth);

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I, which are easy to misread
const STUDENT = { name: 'name', email: 'email', institution: 'institution', avatar: 'avatar', user_type: 'user_type' };

async function newJoinCode() {
  for (;;) {
    const code = Array.from(crypto.randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
    if (!(await findOne('classes', { join_code: code }))) return code;
  }
}

/** 'YYYY-MM-DDTHH:MM' from a datetime-local input → the stored 'YYYY-MM-DD HH:MM:SS'. */
function dbDate(v, label) {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(v)) throw new HttpError(422, `${label} must be a date and time.`);
  const s = v.replace('T', ' ');
  return s.length === 16 ? s + ':00' : s;
}

const flag = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
const memberIds = async (classId) => (await find('class_members', { class_id: classId }, { fields: ['user_id'] })).map((m) => m.user_id);

/** Loads the class in the URL; the teacher (or staff) is the owner, everyone else must have joined. */
async function loadClass(req, { owner = false } = {}) {
  const c = await findOne('classes', { id: Number(req.params.id) });
  if (!c) throw new HttpError(404, 'Class not found.');
  const isOwner = c.faculty_id === req.user.id || isStaff(req.user);
  if (owner && !isOwner) throw new HttpError(403, 'Only the teacher of this class can do this.');
  if (!isOwner && !(await findOne('class_members', { class_id: c.id, user_id: req.user.id }))) throw new HttpError(403, 'Join this class with its code to open it.');
  return { c, isOwner };
}

async function loadAssignment(c, aid) {
  const a = await findOne('assignments', { id: Number(aid), class_id: c.id });
  if (!a) throw new HttpError(404, 'Assignment not found.');
  return a;
}

/** Adds the titles of the linked text, PDF and presentation. */
const withMaterial = async (rows) => {
  await attach(rows, 'texts', 'text_id', { title: 'text_title' });
  await attach(rows, 'pdfs', 'pdf_id', { title: 'pdf_title' });
  return attach(rows, 'presentations', 'presentation_id', { title: 'presentation_title' });
};

// ---- My classes ----
r.get('/', async (req, res) => {
  const uid = req.user.id;
  const teaching = isFaculty(req.user) || (await count('classes', { faculty_id: uid }))
    ? await find('classes', { faculty_id: uid }, { sort: { status: 1, id: -1 } }) : [];
  const tIds = { class_id: { $in: teaching.map((c) => c.id) } };
  const [students, toGrade] = await Promise.all([countBy('class_members', 'class_id', tIds), countBy('submissions', 'class_id', { ...tIds, status: 'submitted' })]);
  for (const c of teaching) Object.assign(c, { students: students.get(c.id) ?? 0, to_grade: toGrade.get(c.id) ?? 0 });

  const joined = await find('class_members', { user_id: uid }, { fields: ['class_id', 'joined_at'] });
  const enrolled = await attach(await find('classes', { id: { $in: joined.map((m) => m.class_id) } }, { sort: { status: 1, title: 1 }, exclude: ['join_code'] }), 'users', 'faculty_id', { name: 'faculty' });
  const eIds = enrolled.map((c) => c.id);
  const [assignments, mine] = await Promise.all([
    find('assignments', { class_id: { $in: eIds } }, { fields: ['id', 'class_id', 'due_at'] }),
    find('submissions', { user_id: uid, class_id: { $in: eIds }, status: { $ne: 'returned' } }, { fields: ['assignment_id'] }),
  ]);
  const done = new Set(mine.map((s) => s.assignment_id));
  for (const c of enrolled) {
    const open = assignments.filter((a) => a.class_id === c.id && !done.has(a.id));
    c.pending = open.length;
    c.next_due = open.map((a) => a.due_at).filter((d) => d && d >= now()).sort()[0] ?? null;
  }
  res.json({ canTeach: isFaculty(req.user), teaching, enrolled });
});

r.post('/', async (req, res) => {
  if (!isFaculty(req.user)) throw new HttpError(403, 'Only faculty accounts can create classes. Set "I am a" to Faculty in your profile.');
  const d = fields(req.body, ['title'], ['subject', 'description', 'schedule']);
  const id = await insert('classes', {
    faculty_id: req.user.id, title: d.title.slice(0, 160), subject: (d.subject || '').slice(0, 120) || null, description: d.description || null,
    schedule: (d.schedule || '').slice(0, 160) || null, join_code: await newJoinCode(), status: 'active', created_at: now(),
  });
  res.status(201).json({ id });
});

r.post('/join', async (req, res) => {
  const { code } = fields(req.body, ['code']);
  const c = await findOne('classes', { join_code: code.toUpperCase().replace(/[^A-Z0-9]/g, '') });
  if (!c) throw new HttpError(404, 'No class has this code. Please check it with your teacher.');
  if (c.status !== 'active') throw new HttpError(422, 'This class is archived and no longer accepts students.');
  if (c.faculty_id === req.user.id) throw new HttpError(422, 'You teach this class.');
  if (!(await findOne('class_members', { class_id: c.id, user_id: req.user.id }))) {
    await insert('class_members', { class_id: c.id, user_id: req.user.id, joined_at: now() });
    await notify(c.faculty_id, 'New student in your class', `${req.user.name} joined "${c.title}".`, `/classes/${c.id}`);
  }
  res.json({ id: c.id });
});

// ---- Faculty Desk ----
r.get('/dashboard', async (req, res) => {
  if (!isFaculty(req.user)) throw new HttpError(403, 'The Faculty Desk is for faculty accounts.');
  const classes = await find('classes', { faculty_id: req.user.id, status: 'active' }, { sort: { title: 1 }, fields: ['id', 'title', 'subject', 'join_code'] });
  const inMine = { class_id: { $in: classes.map((c) => c.id) } };
  const titles = (rows) => attach(rows, 'classes', 'class_id', { title: 'class_title' });

  const [students, toGradeBy, members] = await Promise.all([
    countBy('class_members', 'class_id', inMine), countBy('submissions', 'class_id', { ...inMine, status: 'submitted' }),
    find('class_members', inMine, { fields: ['user_id'] }),
  ]);
  for (const c of classes) Object.assign(c, { students: students.get(c.id) ?? 0, to_grade: toGradeBy.get(c.id) ?? 0 });

  const toGrade = await find('submissions', { ...inMine, status: 'submitted' }, { sort: { submitted_at: 1 }, limit: 30, fields: ['id', 'class_id', 'assignment_id', 'user_id', 'submitted_at', 'is_late'] });
  await attach(toGrade, 'users', 'user_id', { name: 'student' });
  await attach(toGrade, 'assignments', 'assignment_id', { title: 'assignment' });

  const dueSoon = await find('assignments', { ...inMine, due_at: { $gte: now(), $lte: daysFromNow(7) } }, { sort: { due_at: 1 }, limit: 10, fields: ['id', 'class_id', 'title', 'due_at'] });
  const submitted = await countBy('submissions', 'assignment_id', { assignment_id: { $in: dueSoon.map((a) => a.id) }, status: { $ne: 'returned' } });
  for (const a of dueSoon) Object.assign(a, { submitted: submitted.get(a.id) ?? 0, students: students.get(a.class_id) ?? 0 });

  // Student questions without a reply from the teacher yet.
  const questions = await find('class_posts', { ...inMine, kind: 'question', parent_id: null }, { sort: { id: -1 }, limit: 30 });
  const answered = new Set((await find('class_posts', { parent_id: { $in: questions.map((q) => q.id) }, user_id: req.user.id }, { fields: ['parent_id'] })).map((p) => p.parent_id));
  const openQuestions = await attach(questions.filter((q) => !answered.has(q.id)).slice(0, 10), 'users', 'user_id', { name: 'author' });

  res.json({
    totals: {
      classes: classes.length,
      students: new Set(members.map((m) => m.user_id)).size,
      toGrade: await count('submissions', { ...inMine, status: 'submitted' }),
      sessions: await count('events', { ...inMine, starts_at: { $gte: now(), $lte: daysFromNow(7) } }),
    },
    classes,
    toGrade: await titles(toGrade),
    dueSoon: await titles(dueSoon),
    questions: await titles(openQuestions),
    sessions: await titles(await find('events', { ...inMine, starts_at: { $gte: now() } }, { sort: { starts_at: 1 }, limit: 8 })),
    recentJoins: await titles(await attach(await find('class_members', inMine, { sort: { joined_at: -1 }, limit: 8 }), 'users', 'user_id', { name: 'name' }, { inner: true })),
  });
});

// ---- One class ----
r.get('/:id', async (req, res) => {
  const { c, isOwner } = await loadClass(req);
  const teacher = await findOne('users', { id: c.faculty_id }, { fields: ['name', 'institution', 'avatar'] });
  const posts = await attach(await find('class_posts', { class_id: c.id }, { sort: { id: -1 }, limit: 200 }), 'users', 'user_id', { name: 'author', avatar: 'avatar' });
  const assignments = await withMaterial(await find('assignments', { class_id: c.id }, { sort: { due_at: -1, id: -1 } }));
  if (isOwner) {
    const subs = await find('submissions', { class_id: c.id }, { fields: ['assignment_id', 'status'] });
    for (const a of assignments) {
      const mine = subs.filter((s) => s.assignment_id === a.id);
      Object.assign(a, { submitted: mine.filter((s) => s.status !== 'returned').length, to_grade: mine.filter((s) => s.status === 'submitted').length });
    }
  } else {
    const mine = new Map((await find('submissions', { class_id: c.id, user_id: req.user.id })).map((s) => [s.assignment_id, s]));
    for (const a of assignments) a.submission = mine.get(a.id) ?? null;
  }
  const { join_code, ...info } = c;
  res.json({
    class: { ...info, ...(isOwner && { join_code }), teacher: teacher?.name ?? null, teacher_institution: teacher?.institution ?? null, students: await count('class_members', { class_id: c.id }) },
    isOwner,
    posts,
    assignments,
    sessions: await find('events', { class_id: c.id }, { sort: { starts_at: -1 } }),
  });
});

r.put('/:id', async (req, res) => {
  const { c } = await loadClass(req, { owner: true });
  const d = fields(req.body, ['title'], ['subject', 'description', 'schedule', 'status']);
  await update('classes', {
    title: d.title.slice(0, 160), subject: (d.subject || '').slice(0, 120) || null, description: d.description || null,
    schedule: (d.schedule || '').slice(0, 160) || null, status: d.status === 'archived' ? 'archived' : 'active',
  }, { id: c.id });
  res.json({ ok: true });
});

r.delete('/:id', async (req, res) => {
  const { c } = await loadClass(req, { owner: true });
  for (const table of ['class_members', 'class_posts', 'assignments', 'submissions', 'events']) await remove(table, { class_id: c.id });
  await remove('classes', { id: c.id });
  res.json({ ok: true });
});

r.post('/:id/code', async (req, res) => {
  const { c } = await loadClass(req, { owner: true });
  const join_code = await newJoinCode();
  await update('classes', { join_code }, { id: c.id });
  res.json({ join_code });
});

r.post('/:id/leave', async (req, res) => {
  const { c, isOwner } = await loadClass(req);
  if (isOwner) throw new HttpError(422, 'A teacher cannot leave their own class. Archive it instead.');
  await remove('class_members', { class_id: c.id, user_id: req.user.id });
  res.json({ ok: true });
});

// ---- Students and progress report ----
r.get('/:id/students', async (req, res) => {
  const { c } = await loadClass(req, { owner: true });
  const members = await attach(await find('class_members', { class_id: c.id }, { sort: { joined_at: 1 } }), 'users', 'user_id', { ...STUDENT, last_login_at: 'last_login_at' }, { inner: true });
  const ids = members.map((m) => m.user_id);
  const assignments = await find('assignments', { class_id: c.id }, { fields: ['id', 'due_at', 'max_marks', 'text_id'] });
  const subs = await find('submissions', { class_id: c.id, user_id: { $in: ids } }, { fields: ['user_id', 'assignment_id', 'status', 'marks', 'submitted_at'] });
  const textIds = [...new Set(assignments.map((a) => a.text_id).filter(Boolean))];
  const progress = textIds.length ? await find('reading_progress', { user_id: { $in: ids }, text_id: { $in: textIds } }, { fields: ['user_id', 'text_id', 'percent'] }) : [];
  const activity = new Map((await aggregate('reading_events', [{ $match: { user_id: { $in: ids } } }, { $group: { _id: '$user_id', last: { $max: '$created_at' } } }])).map((x) => [x._id, x.last]));
  const week = await countBy('reading_events', 'user_id', { user_id: { $in: ids }, created_at: { $gte: daysFromNow(-7) } });
  const maxMarks = new Map(assignments.map((a) => [a.id, Number(a.max_marks) || 0]));

  const students = members.map((m) => {
    const mine = subs.filter((s) => s.user_id === m.user_id);
    const handedIn = new Set(mine.filter((s) => s.status !== 'returned').map((s) => s.assignment_id));
    const scores = mine.filter((s) => s.status === 'graded' && maxMarks.get(s.assignment_id) > 0).map((s) => (Number(s.marks) / maxMarks.get(s.assignment_id)) * 100);
    const reading = textIds.map((t) => Number(progress.find((p) => p.user_id === m.user_id && p.text_id === t)?.percent ?? 0));
    const lastActive = [activity.get(m.user_id), m.last_login_at, ...mine.map((s) => s.submitted_at)].filter(Boolean).sort().pop() ?? null;
    return {
      user_id: m.user_id, name: m.name, email: m.email, institution: m.institution, avatar: m.avatar, joined_at: m.joined_at,
      submitted: handedIn.size,
      graded: mine.filter((s) => s.status === 'graded').length,
      missing: assignments.filter((a) => a.due_at && a.due_at < now() && !handedIn.has(a.id)).length,
      average: scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null,
      reading: reading.length ? Math.round(reading.reduce((x, y) => x + y, 0) / reading.length) : null,
      sections_week: week.get(m.user_id) ?? 0,
      last_active: lastActive,
    };
  });
  res.json({ assignments: assignments.length, students });
});

r.delete('/:id/students/:uid', async (req, res) => {
  const { c } = await loadClass(req, { owner: true });
  await remove('class_members', { class_id: c.id, user_id: Number(req.params.uid) });
  res.json({ ok: true });
});

// ---- Announcements (teacher) and questions (students), with replies ----
r.post('/:id/posts', async (req, res) => {
  const { c, isOwner } = await loadClass(req);
  const d = fields(req.body, ['body'], ['parent_id']);
  const parent = d.parent_id ? await findOne('class_posts', { id: Number(d.parent_id), class_id: c.id, parent_id: null }) : null;
  if (d.parent_id && !parent) throw new HttpError(404, 'Post not found.');
  if (!parent && c.status !== 'active') throw new HttpError(422, 'This class is archived.');
  const id = await insert('class_posts', {
    class_id: c.id, user_id: req.user.id, parent_id: parent?.id ?? null, kind: parent ? 'reply' : isOwner ? 'announcement' : 'question',
    body: d.body.slice(0, 5000), created_at: now(),
  });
  const link = `/classes/${c.id}`;
  const excerpt = d.body.length > 140 ? d.body.slice(0, 137) + '…' : d.body;
  if (parent) {
    const to = new Set([parent.user_id, ...(isOwner ? [] : [c.faculty_id])]);
    to.delete(req.user.id);
    await notifyMany([...to], `New reply in ${c.title}`, `${req.user.name}: ${excerpt}`, link);
  } else if (isOwner) {
    await notifyMany(await memberIds(c.id), `${c.title}: announcement`, excerpt, link);
  } else {
    await notify(c.faculty_id, `Question in ${c.title}`, `${req.user.name}: ${excerpt}`, link);
  }
  res.status(201).json({ id });
});

r.delete('/:id/posts/:pid', async (req, res) => {
  const { c, isOwner } = await loadClass(req);
  const p = await findOne('class_posts', { id: Number(req.params.pid), class_id: c.id });
  if (!p) throw new HttpError(404, 'Post not found.');
  if (!isOwner && p.user_id !== req.user.id) throw new HttpError(403, 'You can only delete your own posts.');
  await remove('class_posts', { $or: [{ id: p.id }, { parent_id: p.id }] });
  res.json({ ok: true });
});

// ---- Assignments ----
async function assignmentData(body, user) {
  const d = fields(body, ['title'], ['instructions', 'due_at', 'max_marks', 'answer_required', 'text_id', 'pdf_id', 'presentation_id']);
  const data = {
    title: d.title.slice(0, 190), instructions: d.instructions || null, due_at: dbDate(d.due_at, 'Due date'),
    max_marks: Math.max(0, Math.min(1000, Math.round(Number(d.max_marks) || 0))), answer_required: flag(d.answer_required),
  };
  for (const [key, table, label] of [['text_id', 'texts', 'Text'], ['pdf_id', 'pdfs', 'PDF'], ['presentation_id', 'presentations', 'Presentation']]) {
    data[key] = d[key] ? Number(d[key]) : null;
    if (data[key] && !(await findOne(table, { id: data[key] }))) throw new HttpError(422, `${label} not found.`);
  }
  // An unpublished PDF can be set as material only by its author (it is then shared with the class) or by staff.
  if (data.pdf_id) {
    const pdf = await findOne('pdfs', { id: data.pdf_id }, { fields: ['status', 'uploaded_by'] });
    if (pdf.status !== 'published' && pdf.uploaded_by !== user.id && !isStaff(user)) throw new HttpError(422, 'PDF not found.');
  }
  return data;
}

r.post('/:id/assignments', async (req, res) => {
  const { c } = await loadClass(req, { owner: true });
  if (c.status !== 'active') throw new HttpError(422, 'This class is archived.');
  const data = await assignmentData(req.body, req.user);
  const id = await insert('assignments', { ...data, class_id: c.id, created_by: req.user.id, created_at: now() });
  const due = data.due_at ? ` Due ${data.due_at.slice(0, 16)}.` : '';
  await notifyMany(await memberIds(c.id), `New assignment in ${c.title}`, `${data.title}.${due}`, `/classes/${c.id}?a=${id}`);
  res.status(201).json({ id });
});

r.put('/:id/assignments/:aid', async (req, res) => {
  const { c } = await loadClass(req, { owner: true });
  const a = await loadAssignment(c, req.params.aid);
  await update('assignments', await assignmentData(req.body, req.user), { id: a.id });
  res.json({ ok: true });
});

r.delete('/:id/assignments/:aid', async (req, res) => {
  const { c } = await loadClass(req, { owner: true });
  const a = await loadAssignment(c, req.params.aid);
  await remove('submissions', { assignment_id: a.id });
  await remove('assignments', { id: a.id });
  res.json({ ok: true });
});

/** The assignment; the teacher also gets every student's submission and reading progress on the linked text. */
r.get('/:id/assignments/:aid', async (req, res) => {
  const { c, isOwner } = await loadClass(req);
  const [a] = await withMaterial([await loadAssignment(c, req.params.aid)]);
  if (!isOwner) return res.json({ assignment: a, submission: await findOne('submissions', { assignment_id: a.id, user_id: req.user.id }) });
  const members = await attach(await find('class_members', { class_id: c.id }), 'users', 'user_id', { name: 'name', email: 'email' }, { inner: true });
  const subs = new Map((await find('submissions', { assignment_id: a.id })).map((s) => [s.user_id, s]));
  const progress = a.text_id ? new Map((await find('reading_progress', { text_id: a.text_id, user_id: { $in: members.map((m) => m.user_id) } }, { fields: ['user_id', 'percent'] })).map((p) => [p.user_id, p.percent])) : null;
  const roster = members.map((m) => ({ user_id: m.user_id, name: m.name, email: m.email, reading: progress ? Number(progress.get(m.user_id) ?? 0) : null, submission: subs.get(m.user_id) ?? null }));
  roster.sort((x, y) => (x.submission?.status === 'submitted' ? 0 : 1) - (y.submission?.status === 'submitted' ? 0 : 1) || x.name.localeCompare(y.name));
  res.json({ assignment: a, roster });
});

r.post('/:id/assignments/:aid/submit', async (req, res) => {
  const { c, isOwner } = await loadClass(req);
  if (isOwner) throw new HttpError(422, 'Teachers do not submit assignments.');
  const a = await loadAssignment(c, req.params.aid);
  const answer = String(req.body?.answer ?? '').trim().slice(0, 20000);
  if (a.answer_required && !answer) throw new HttpError(422, 'Please write your answer before submitting.');
  const existing = await findOne('submissions', { assignment_id: a.id, user_id: req.user.id });
  if (existing?.status === 'graded') throw new HttpError(409, 'This work has already been graded.');
  const data = { answer: answer || null, status: 'submitted', submitted_at: now(), is_late: a.due_at && now() > a.due_at ? 1 : 0 };
  if (existing) await update('submissions', data, { id: existing.id });
  else await insert('submissions', { ...data, assignment_id: a.id, class_id: c.id, user_id: req.user.id, marks: null, feedback: null, graded_at: null });
  res.json({ submission: await findOne('submissions', { assignment_id: a.id, user_id: req.user.id }) });
});

/** Grade a submission, or return it to the student to redo. */
r.put('/:id/submissions/:sid', async (req, res) => {
  const { c } = await loadClass(req, { owner: true });
  const s = await findOne('submissions', { id: Number(req.params.sid), class_id: c.id });
  if (!s) throw new HttpError(404, 'Submission not found.');
  const a = await loadAssignment(c, s.assignment_id);
  const d = fields(req.body, [], ['marks', 'feedback', 'status']);
  const status = d.status === 'returned' ? 'returned' : 'graded';
  let marks = null;
  if (status === 'graded' && a.max_marks > 0) {
    marks = Number(d.marks);
    if (d.marks === '' || d.marks === null || d.marks === undefined || !Number.isFinite(marks) || marks < 0 || marks > a.max_marks) throw new HttpError(422, `Marks must be between 0 and ${a.max_marks}.`);
  }
  await update('submissions', { status, marks, feedback: d.feedback || null, graded_at: now(), graded_by: req.user.id }, { id: s.id });
  const result = status === 'returned' ? 'was returned for revision' : marks !== null ? `was graded: ${marks}/${a.max_marks}` : 'was reviewed';
  await notify(s.user_id, `${c.title}: ${a.title}`, `Your work ${result}.${d.feedback ? ' See the teacher\'s feedback.' : ''}`, `/classes/${c.id}?a=${a.id}`);
  res.json({ ok: true });
});

// ---- Class sessions (live classes shown only to the class) ----
async function sessionData(body, teacher) {
  const d = fields(body, ['title', 'starts_at'], ['duration_minutes', 'join_link', 'recording_link', 'description']);
  for (const k of ['join_link', 'recording_link']) if (d[k] && !/^https?:\/\//i.test(d[k])) throw new HttpError(422, 'Links must start with http:// or https://');
  return {
    title: d.title.slice(0, 190), starts_at: dbDate(d.starts_at, 'Start time'), duration_minutes: Math.max(5, Math.min(600, Number(d.duration_minutes) || 60)),
    join_link: d.join_link || null, recording_link: d.recording_link || null, description: d.description || null, speaker: teacher,
  };
}

r.post('/:id/sessions', async (req, res) => {
  const { c } = await loadClass(req, { owner: true });
  if (c.status !== 'active') throw new HttpError(422, 'This class is archived.');
  const teacher = (await findOne('users', { id: c.faculty_id }, { fields: ['name'] }))?.name ?? req.user.name;
  const data = await sessionData(req.body, teacher);
  const id = await insert('events', { ...data, kind: 'class', is_premium: 0, class_id: c.id, created_by: req.user.id, created_at: now() });
  await notifyMany(await memberIds(c.id), `Class scheduled: ${c.title}`, `${data.title} on ${data.starts_at.slice(0, 16)}.`, `/classes/${c.id}`);
  res.status(201).json({ id });
});

r.put('/:id/sessions/:eid', async (req, res) => {
  const { c } = await loadClass(req, { owner: true });
  const e = await findOne('events', { id: Number(req.params.eid), class_id: c.id });
  if (!e) throw new HttpError(404, 'Session not found.');
  await update('events', await sessionData(req.body, e.speaker), { id: e.id });
  res.json({ ok: true });
});

r.delete('/:id/sessions/:eid', async (req, res) => {
  const { c } = await loadClass(req, { owner: true });
  const e = await findOne('events', { id: Number(req.params.eid), class_id: c.id });
  if (!e) throw new HttpError(404, 'Session not found.');
  await remove('events', { id: e.id });
  if (e.starts_at > now()) await notifyMany(await memberIds(c.id), `Class cancelled: ${c.title}`, `${e.title} on ${e.starts_at.slice(0, 16)} has been cancelled.`, `/classes/${c.id}`);
  res.json({ ok: true });
});

export default r;
