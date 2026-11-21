// Deterministic inventory: requires planned root files and forbids a LICENSE file (owner decision).
import { listFiles, readJson, isMain, report } from './lib/util.mjs';

export const REQUIRED = ['README.md', 'VERSION', 'CHANGELOG.md', 'package.json', 'docs/charter.md',
  'docs/adr/0001-owner-decisions-d01-d14.md', 'docs/adr/0002-rule-id-grammar.md'];

const LICENSE_NAME = /^((un)?licen[cs]es?|copying)([._-].*)?$/i;

export function checkInventory(files, pkg = {}) {
  const errors = [];
  for (const need of REQUIRED) if (!files.includes(need)) errors.push(`missing ${need}`);
  for (const f of files) {
    if (f.split('/').some(seg => LICENSE_NAME.test(seg))) errors.push(`license file present: ${f} (no license without owner decision)`);
  }
  if (pkg && ('license' in pkg || 'licenses' in pkg)) errors.push('package.json declares a license field (no license without owner decision)');
  return errors;
}

if (isMain(import.meta.url)) report(checkInventory(listFiles('.'), readJson('package.json')), 'inventory ok');
