import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export function readJson(path) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { throw new Error(`cannot read ${path}: ${e.code}`); }
  try { return JSON.parse(text); } catch { throw new Error(`invalid JSON in ${path}`); }
}

export function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

/** Deterministic, sorted, forward-slash file list under root, skipping .git and node_modules. */
export function listFiles(root, skip = ['.git', 'node_modules']) {
  const out = [];
  // `skip` applies to names directly under root only, so a nested .git or node_modules is never hidden.
  (function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      if (dir === root && skip.includes(name)) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p); else out.push(relative(root, p).split(sep).join('/'));
    }
  })(root);
  return out;
}

/** True when the module is the process entry point (Windows and POSIX safe). */
export function isMain(metaUrl) {
  return process.argv[1] && metaUrl === pathToFileURL(process.argv[1]).href;
}

export function report(errors, okMessage) {
  if (errors.length) { errors.forEach(e => console.error('FAIL: ' + e)); process.exit(1); }
  console.log(okMessage);
}
