import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { checkProvenance } from '../scripts/check-provenance.mjs';
import { checkRules, loadCatalog, ID_RE, DOMAINS } from '../scripts/check-catalog.mjs';
import { checkInventory, REQUIRED } from '../scripts/check-inventory.mjs';
import { readJson, listFiles } from '../scripts/lib/util.mjs';

const goodRule = { id: 'pdg-inventory.dataset-declared', title: 'Datasets are declared', level: 'required', assurance: 'partial', criteriaStatus: 'Proposed', crossReferences: [] };

test('shipped provenance is valid', () => {
  assert.deepEqual(checkProvenance(readJson('artifacts/external-standards-provenance.json')), []);
});

test('provenance: OPENED without hash is refused', () => {
  const doc = { sources: [{ id: 'X', title: 't', publisher: 'p', url: 'https://x', status: 'OPENED', retrieved: '2026-11-20' }] };
  assert.ok(checkProvenance(doc).some(e => /requires sha256/.test(e)));
});

test('provenance: unknown status and paywalled hash are refused', () => {
  const doc = { sources: [
    { id: 'A', title: 't', publisher: 'p', url: 'https://x', status: 'MAYBE', retrieved: 'd' },
    { id: 'B', title: 't', publisher: 'p', url: 'https://x', status: 'PAYWALLED', retrieved: 'd', sha256: 'a'.repeat(64) }] };
  const e = checkProvenance(doc);
  assert.ok(e.some(x => /unknown status/.test(x)));
  assert.ok(e.some(x => /only OPENED/.test(x)));
});

test('provenance: no non-OPENED source is hashed in the shipped file', () => {
  for (const s of readJson('artifacts/external-standards-provenance.json').sources) {
    if (s.status !== 'OPENED') assert.equal(s.sha256, null, s.id);
  }
});

test('catalog: good rule passes; grammar and domain violations fail', () => {
  assert.deepEqual(checkRules([goodRule]), []);
  assert.ok(checkRules([{ ...goodRule, id: 'privacy.retention-declared' }]).some(e => /grammar/.test(e)));
  assert.ok(checkRules([{ ...goodRule, id: 'data.provenance' }]).some(e => /grammar/.test(e)));
  assert.ok(checkRules([{ ...goodRule, id: 'pdg-unknown.x' }]).some(e => /unknown domain/.test(e)));
  assert.ok(checkRules([goodRule, goodRule]).some(e => /duplicate/.test(e)));
});

test('catalog: criteria cannot be frozen and compliance wording is refused', () => {
  assert.ok(checkRules([{ ...goodRule, criteriaStatus: 'Frozen' }]).some(e => /Proposed/.test(e)));
  assert.ok(checkRules([{ ...goodRule, title: 'System is GDPR compliant' }]).some(e => /compliance wording/.test(e)));
});

test('catalog: shipped catalog is valid and never reuses another pack namespace', () => {
  const rules = loadCatalog();
  assert.deepEqual(checkRules(rules), []);
  for (const r of rules) {
    assert.ok(ID_RE.test(r.id));
    assert.ok(!/^(privacy|data|evidence)\./.test(r.id));
    assert.ok(DOMAINS.includes(r.id.split('.')[0]));
  }
});

test('inventory: shipped tree passes; missing file and license are refused', () => {
  assert.deepEqual(checkInventory(listFiles('.'), readJson), []);
  assert.ok(checkInventory(REQUIRED.filter(f => f !== 'VERSION')).some(e => /missing VERSION/.test(e)));
  assert.ok(checkInventory([...REQUIRED, 'LICENSE']).some(e => /license file present/.test(e)));
  assert.ok(checkInventory([...REQUIRED, 'docs/COPYING.txt']).some(e => /license file present/.test(e)));
});

test('VERSION is 0.1.0 and package has no runtime dependencies', () => {
  assert.equal(readJson('package.json').version, '0.1.0');
  assert.equal(readJson('package.json').dependencies, undefined);
});

// ---- independent review of PR 3 ----
test('license guard catches variants and directories, and a package.json license field', () => {
  for (const f of ['LICENSE-MIT', 'LICENSE_APACHE', 'UNLICENSE', 'licenses/MIT.txt', 'LICENCE.md', 'docs/Copying']) {
    assert.ok(checkInventory([...REQUIRED, f]).some(e => /license file present/.test(e)), f);
  }
  assert.ok(checkInventory([...REQUIRED, 'tools/package.json'], () => ({ license: 'MIT' })).some(e => /license/.test(e)));
  assert.ok(checkInventory(REQUIRED, () => ({ licenses: [] })).some(e => /license/.test(e)));
  assert.deepEqual(checkInventory(REQUIRED, () => ({})), []);
});
test('VERSION file matches package.json and no dependency fields exist', () => {
  assert.equal(readFileSync('VERSION', 'utf8').trim(), readJson('package.json').version);
  for (const k of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) assert.equal(readJson('package.json')[k], undefined, k);
});
test('provenance: non-object source entries are reported, not thrown', () => {
  for (const bad of [null, 5, 'x', []]) assert.ok(checkProvenance({ sources: [bad] }).length > 0);
});
test('ADR 0001 does not contradict itself about D-15 and D-16', () => {
  const t = readFileSync('docs/adr/0001-owner-decisions-d01-d14.md', 'utf8');
  assert.ok(!/not yet decided/i.test(t));
});

// ---- Codex review of PR 3 head 707c1b8 ----
import { checkPackageLicense } from '../scripts/check-inventory.mjs';
test('legal-conclusion wording is refused in any string field of a rule', () => {
  for (const t of ['System complies with GDPR', 'Ensures CCPA compliance', 'Legally compliant processing', 'This satisfies HIPAA requirements']) {
    assert.ok(checkRules([{ ...goodRule, title: t }]).length > 0, t);
    assert.ok(checkRules([{ ...goodRule, rationale: t }]).length > 0, t);
    assert.ok(checkRules([{ ...goodRule, notes: t }]).length > 0, t);
  }
  assert.deepEqual(checkRules([goodRule]), []);
});
test('provenance requires scope and a version or date', () => {
  const s = { id: 'X', title: 't', publisher: 'p', url: 'https://x', status: 'OPENED', retrieved: '2026-11-20', sha256: 'a'.repeat(64) };
  assert.ok(checkProvenance({ sources: [s] }).length > 0);
  assert.ok(checkProvenance({ sources: [{ ...s, scope: 'sc' }] }).length > 0);
  assert.deepEqual(checkProvenance({ sources: [{ ...s, scope: 'sc', date: '2020' }] }), []);
});
test('every package.json in the tree is checked for license fields, including nested ones', () => {
  assert.ok(checkPackageLicense({ license: 'MIT' }, 'tools/package.json').length > 0);
  for (const f of listFiles('.').filter(f => f.split('/').pop() === 'package.json')) assert.deepEqual(checkPackageLicense(readJson(f), f), []);
});

// ---- Codex round 2 on PR 3 ----
test('non-string rule ids are rejected; legal-regime names and conclusion verbs are refused', () => {
  assert.ok(checkRules([{ ...goodRule, id: ['pdg-inventory.dataset-declared'] }]).length > 0);
  assert.ok(checkRules([{ ...goodRule, id: ['pdg-inventory.dataset-declared'] }, { ...goodRule, id: ['pdg-inventory.dataset-declared'] }]).length > 0);
  for (const t of ['System satisfies all GDPR requirements', 'System conforms to GDPR', 'Processing is lawful', 'Meets CCPA', 'Covered by HIPAA']) {
    assert.ok(checkRules([{ ...goodRule, title: t }]).length > 0, t);
  }
  assert.deepEqual(checkRules([{ ...goodRule, rationale: 'Legal categories are overlays, not defaults; this is not a legal finding.' }]), []);
});
