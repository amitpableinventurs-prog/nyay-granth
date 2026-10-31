// Development runner: restarts the API only when the *contents* of a source file (or .env) change.
// It replaces `node --watch`, which on Windows also restarts on file access and attribute notifications
// (antivirus scans, editors indexing files). Those came in bursts of restarts, and every API call made
// during a burst failed.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const WATCH_DIRS = [path.join(here, 'src'), path.join(here, '..', 'shared')];
const ENV_FILE = path.join(here, '.env');
const isSource = (f) => /\.(m?js|json)$/.test(f) || f === ENV_FILE;

const digest = (file) => {
  try { return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex'); } catch { return null; }
};
const hashes = new Map();
const scan = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else if (isSource(p)) hashes.set(p, digest(p));
  }
};
WATCH_DIRS.forEach(scan);
hashes.set(ENV_FILE, digest(ENV_FILE));

const PORT_IN_USE = 75; // exit code from src/index.js when its port is taken
let child = null;
let stopping = false;
let retry = null;
const start = () => {
  clearTimeout(retry);
  const proc = spawn(process.execPath, ['src/index.js'], { cwd: here, stdio: 'inherit' });
  child = proc;
  proc.on('exit', (code) => {
    if (stopping || child !== proc) return;
    // The port frees up when the other process ends, so keep trying instead of waiting for a file save.
    if (code === PORT_IN_USE) retry = setTimeout(start, 3000);
    else if (code) console.log(`API stopped (exit code ${code}). Fix the error and save a file to restart it.`);
  });
};
const restart = (files) => {
  clearTimeout(retry);
  console.log(`Restarting API: ${files.map((f) => path.relative(here, f)).join(', ')} changed`);
  if (child && child.exitCode === null && child.signalCode === null) {
    child.once('exit', start);
    child.kill();
  } else start();
};

// Collect events for a moment (editors save in several steps), then restart only for real content changes.
const pending = new Set();
let timer = null;
const onEvent = (dir) => (_event, name) => {
  if (!name) return;
  pending.add(path.join(dir, String(name)));
  clearTimeout(timer);
  timer = setTimeout(() => {
    const changed = [...pending].filter((f) => {
      if (!isSource(f)) return false;
      const h = digest(f);
      if (h === (hashes.get(f) ?? null)) return false;
      hashes.set(f, h);
      return true;
    });
    pending.clear();
    if (changed.length) restart(changed);
  }, 300);
};
for (const dir of WATCH_DIRS) fs.watch(dir, { recursive: true }, onEvent(dir));
fs.watch(here, (event, name) => name === '.env' && onEvent(here)(event, name));

start();
const stop = () => { stopping = true; child?.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
