import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { config } from './config.js';
import { findOne } from './db.js';
import { isStaff } from './services.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// `tv` is the user's token_version: raising it (logout from all devices, password reset) cancels older tokens.
export const signToken = (user) => jwt.sign({ uid: user.id, tv: user.token_version ?? 0 }, config.jwtSecret, { expiresIn: '30d' });

export const publicUser = (u) => u && ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, phone_verified: !!u.phone_verified, role: u.role, user_type: u.user_type,
  institution: u.institution, bio: u.bio, avatar: u.avatar, is_public: !!u.is_public, created_at: u.created_at,
});

/** Attaches req.user when a valid bearer token is present; never rejects. */
export async function authOptional(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token) {
    try {
      const { uid, tv = 0 } = jwt.verify(token, config.jwtSecret);
      const u = await findOne('users', { id: uid });
      if (u && u.status === 'active' && (u.token_version ?? 0) === tv) req.user = u;
    } catch { /* invalid/expired token → anonymous */ }
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'Please log in to continue.');
  next();
}

export function requireStaff(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'Please log in to continue.');
  if (!isStaff(req.user)) throw new HttpError(403, 'Access denied.');
  next();
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') throw new HttpError(403, 'Administrator access required.');
  next();
}

/** Reads and trims string fields; throws 422 listing missing required ones. */
export function fields(body, required = [], optional = []) {
  const out = {};
  const missing = [];
  for (const k of [...required, ...optional]) {
    const v = body?.[k];
    out[k] = typeof v === 'string' ? v.trim() : v;
    if (required.includes(k) && (out[k] === undefined || out[k] === null || out[k] === '')) missing.push(k);
  }
  if (missing.length) throw new HttpError(422, `Please fill in: ${missing.join(', ')}`);
  return out;
}

const UPLOAD_TYPES = {
  image: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  audio: ['.mp3', '.m4a', '.ogg', '.wav', '.aac'],
  document: ['.pdf', '.pptx', '.ppt', '.docx', '.doc', '.odt', '.rtf', '.txt', '.md'],
};
const ALL_EXT = Object.values(UPLOAD_TYPES).flat();

export const upload = multer({
  storage: multer.diskStorage({
    destination(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const sub = Object.entries(UPLOAD_TYPES).find(([, exts]) => exts.includes(ext))?.[0] ?? 'misc';
      const dir = path.join(config.uploadsDir, sub);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(_req, file, cb) {
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = ALL_EXT.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new HttpError(422, `File type not allowed. Allowed: ${ALL_EXT.join(' ')}`), ok);
  },
});

/** Public URL path for an uploaded file. */
export const uploadedPath = (file) => '/uploads/' + path.relative(config.uploadsDir, file.path).replace(/\\/g, '/');

/** Deletes a file we stored in uploads/ (external URLs and missing files are ignored). */
export function removeUpload(p) {
  if (!p || !String(p).startsWith('/uploads/')) return;
  const file = path.resolve(config.uploadsDir, String(p).slice('/uploads/'.length));
  if (file.startsWith(path.resolve(config.uploadsDir) + path.sep)) fs.promises.unlink(file).catch(() => {});
}

export function errorHandler(err, _req, res, _next) {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  // Messages we wrote ourselves (HttpError, e.g. a payment gateway's 502) are safe to show; unexpected crashes are not.
  const message = status < 500 || err instanceof HttpError ? err.message : 'Something went wrong on the server.';
  res.status(status).json({ error: message, ...(err.extra || {}) });
}
