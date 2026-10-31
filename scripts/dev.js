// Runs the API (with auto-reload) and the Vite dev server together: npm run dev
import { execSync, spawn } from 'node:child_process';

const run = (name, cwd, color) => {
  const p = spawn('npm', ['run', 'dev'], { cwd, shell: true });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => stream.on('data', (d) => out.write(d.toString().split('\n').filter(Boolean).map((l) => tag + l).join('\n') + '\n'));
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  return p;
};

const procs = [run('api', 'server', 36), run('web', 'client', 35)];
// On Windows, kill() only ends the npm shell and leaves the servers holding their ports, so end the whole tree.
const killTree = (p) => {
  if (process.platform === 'win32') { try { execSync(`taskkill /pid ${p.pid} /T /F`, { stdio: 'ignore' }); } catch { /* already gone */ } } else p.kill();
};
const stop = () => { procs.forEach(killTree); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
