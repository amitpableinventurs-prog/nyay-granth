// Database adapter: MongoDB via the official driver.
// Documents keep a numeric `id` (from the `counters` collection) so URLs and the REST API stay stable;
// Mongo's own `_id` is never sent to clients. Dates are stored as local 'YYYY-MM-DD HH:MM:SS' strings,
// which sort and compare correctly as plain strings.
import { MongoClient } from 'mongodb';
import { config } from './config.js';

let client = null;
let database = null;

export async function getDb() {
  if (!database) {
    client = new MongoClient(config.db.uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    database = client.db();
  }
  return database;
}

export async function closeDb() {
  await client?.close();
  client = database = null;
}

/** Raw collection access for updates the helpers below don't cover ($inc, aggregations, ...). */
export const col = async (name) => (await getDb()).collection(name);

const clean = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v]));

// Case-insensitive string sorting, as the old MySQL utf8mb4_unicode_ci collation did.
const COLLATION = { locale: 'en', strength: 2 };

function cursorFor(c, filter, { sort, skip, limit, fields, exclude } = {}) {
  const projection = fields ? Object.fromEntries([...fields.map((f) => [f, 1]), ['_id', 0]]) : Object.fromEntries([...(exclude ?? []).map((f) => [f, 0]), ['_id', 0]]);
  let cur = c.find(filter, { projection });
  if (sort) cur = cur.sort(sort).collation(COLLATION);
  if (skip) cur = cur.skip(skip);
  if (limit) cur = cur.limit(limit);
  return cur;
}

/** find('texts', { status: 'published' }, { sort: { title: 1 }, limit: 10, fields: ['id', 'title'] }) */
export async function find(table, filter = {}, opts = {}) {
  return cursorFor(await col(table), filter, opts).toArray();
}

export async function findOne(table, filter = {}, opts = {}) {
  return (await find(table, filter, { ...opts, limit: 1 }))[0] ?? null;
}

export async function count(table, filter = {}) {
  return (await col(table)).countDocuments(filter);
}

export async function aggregate(table, pipeline) {
  return (await col(table)).aggregate(pipeline).toArray();
}

/** Next value of a per-collection auto-increment sequence. */
export async function nextId(table) {
  const r = await (await col('counters')).findOneAndUpdate({ _id: table }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return r.seq;
}

/** Inserts a document and returns its numeric id. Table names must come from code, never from request input. */
export async function insert(table, data) {
  const id = await nextId(table);
  await (await col(table)).insertOne({ id, ...clean(data) });
  return id;
}

/** Sets fields on every matching document; returns how many matched. */
export async function update(table, data, filter) {
  if (!Object.keys(data).length) return 0;
  return (await (await col(table)).updateMany(filter, { $set: clean(data) })).matchedCount;
}

export async function remove(table, filter) {
  return (await (await col(table)).deleteMany(filter)).deletedCount;
}

/** Increments numeric fields: inc('texts', { id }, { views: 1 }). */
export async function inc(table, filter, fields) {
  await (await col(table)).updateMany(filter, { $inc: fields });
}

/**
 * In-memory join: for each row, looks up `table` where `foreignKey` equals row[localKey] and copies
 * fields onto the row under new names, e.g. attach(rows, 'users', 'user_id', { name: 'author' }).
 * Rows without a match get nulls (a LEFT JOIN); pass { inner: true } to drop them instead.
 */
export async function attach(rows, table, localKey, map, { foreignKey = 'id', inner = false } = {}) {
  const keys = [...new Set(rows.map((r) => r[localKey]).filter((k) => k !== null && k !== undefined))];
  const docs = keys.length ? await find(table, { [foreignKey]: { $in: keys } }, { fields: [foreignKey, ...Object.keys(map)] }) : [];
  const byKey = new Map(docs.map((d) => [d[foreignKey], d]));
  const kept = [];
  for (const row of rows) {
    const doc = byKey.get(row[localKey]);
    for (const [field, alias] of Object.entries(map)) row[alias] = doc?.[field] ?? null;
    if (doc || !inner) kept.push(row);
  }
  return kept;
}

/** { key: count } of documents grouped by `field`, e.g. sections per text. */
export async function countBy(table, field, filter = {}) {
  const rows = await aggregate(table, [{ $match: filter }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [r._id, r.n]));
}

/**
 * Awaits every promise in an object (and in nested plain objects) in parallel, keeping the shape:
 * await resolveAll({ users: count('users'), library: { texts: count('texts') } }).
 */
export async function resolveAll(obj) {
  const entries = await Promise.all(Object.entries(obj).map(async ([k, v]) => {
    if (v && typeof v.then === 'function') return [k, await v];
    if (v && Object.getPrototypeOf(v) === Object.prototype) return [k, await resolveAll(v)];
    return [k, v];
  }));
  return Object.fromEntries(entries);
}

/** Local-time 'YYYY-MM-DD HH:MM:SS' string, the format every date field is stored in. */
export const toSqlDate = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export const now = () => toSqlDate(new Date());
export const daysFromNow = (n) => toSqlDate(new Date(Date.now() + n * 86400000));

/** Case-insensitive "contains" match for a user string, with regex metacharacters escaped. */
export const like = (s) => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
