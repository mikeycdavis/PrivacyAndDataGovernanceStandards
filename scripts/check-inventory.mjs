// Deterministic inventory: requires planned root files and forbids a LICENSE file (owner decision).
import { fileURLToPath } from 'node:url';
import { listFiles, readJson, isMain, report } from './lib/util.mjs';

export const REQUIRED = ['README.md', 'VERSION', 'CHANGELOG.md', 'package.json', 'docs/charter.md',
  'docs/adr/0001-owner-decisions-d01-d14.md', 'docs/adr/0002-rule-id-grammar.md'];

const LICENSE_NAME = /licen[cs]e|copying|copyright|^notice([._-].*)?$|^patents?([._-].*)?$/i;

export function checkPackageLicense(pkg, path) {
  return pkg && typeof pkg === 'object' && ('license' in pkg || 'licenses' in pkg) ? [`${path} declares a license field (no license without owner decision)`] : [];
}

export function checkInventory(files, readPkg = () => ({})) {
  const errors = [];
  for (const need of REQUIRED) if (!files.includes(need)) errors.push(`missing ${need}`);
  for (const f of files) {
    if (f.split('/').includes('node_modules')) errors.push(`node_modules present: ${f} (zero dependencies; vendored files are not inventoried)`);
    if (f.split('/').some(seg => LICENSE_NAME.test(seg))) errors.push(`license file present: ${f} (no license without owner decision)`);
  }
  for (const f of files.filter(f => f.split('/').pop() === 'package.json')) errors.push(...checkPackageLicense(readPkg(f), f));
  return errors;
}

if (isMain(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  process.chdir(root);
  const errors = checkInventory(listFiles('.', ['.git']), readJson);
  report(errors, 'inventory ok');
}
