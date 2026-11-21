import { test } from 'node:test';
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
  assert.deepEqual(checkInventory(listFiles('.')), []);
  assert.ok(checkInventory(REQUIRED.filter(f => f !== 'VERSION')).some(e => /missing VERSION/.test(e)));
  assert.ok(checkInventory([...REQUIRED, 'LICENSE']).some(e => /license file present/.test(e)));
  assert.ok(checkInventory([...REQUIRED, 'docs/COPYING.txt']).some(e => /license file present/.test(e)));
});

test('VERSION is 0.1.0 and package has no runtime dependencies', () => {
  assert.equal(readJson('package.json').version, '0.1.0');
  assert.equal(readJson('package.json').dependencies, undefined);
});
