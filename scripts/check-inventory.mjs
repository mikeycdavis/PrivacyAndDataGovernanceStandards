// Deterministic inventory: requires planned root files and forbids a LICENSE file (owner decision).
import { listFiles, isMain, report } from './lib/util.mjs';

export const REQUIRED = ['README.md', 'VERSION', 'CHANGELOG.md', 'package.json', 'docs/charter.md',
  'docs/adr/0001-owner-decisions-d01-d14.md', 'docs/adr/0002-rule-id-grammar.md'];

export function checkInventory(files) {
  const errors = [];
  for (const need of REQUIRED) if (!files.includes(need)) errors.push(`missing ${need}`);
  for (const f of files) {
    if (/^(license|licence|copying)(\.|$)/i.test(f.split('/').pop())) errors.push(`license file present: ${f} (no license without owner decision)`);
  }
  return errors;
}

if (isMain(import.meta.url)) report(checkInventory(listFiles('.')), 'inventory ok');
