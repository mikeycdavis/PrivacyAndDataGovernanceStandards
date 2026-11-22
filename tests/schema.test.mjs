import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, SCHEMA } from '../scripts/lib/evaluate.mjs';
import { readJson } from '../scripts/lib/util.mjs';
import { render, sha256 } from '../scripts/gen-schema.mjs';

const NOW = '2026-11-21T00:00:00Z';
const base = () => structuredClone(readJson('fixtures/synthetic-compliant.json'));
const FILE = 'schemas/pdg-declarations-0.1.0.schema.json';
const schema = readJson(FILE);

// Minimal validator for the keywords this schema uses: type, const, properties, additionalProperties:false, items, required, if/then, not.
const typeOk = (t, v) => t === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v) : t === 'array' ? Array.isArray(v) : typeof v === t;
function valid(s, v) {
  if (s.type && !typeOk(s.type, v)) return false;
  if ('const' in s && v !== s.const) return false;
  if (s.not && valid(s.not, v)) return false;
  const isO = typeOk('object', v);
  if (s.required && isO && !s.required.every(k => k in v)) return false;
  if (s.properties && isO) {
    for (const k of Object.keys(v)) {
      if (k in s.properties) { if (!valid(s.properties[k], v[k])) return false; }
      else if (s.additionalProperties === false) return false;
    }
  }
  if (s.items && Array.isArray(v) && !v.every(x => valid(s.items, x))) return false;
  if (s.if && valid(s.if, v) && s.then && !valid(s.then, v)) return false;
  return true;
}
const gate0Ok = d => evaluate(d, { now: NOW }).gate0 === null;

test('schema file is the generated output, carries the candidate revision, and its digest is pinned', () => {
  assert.equal(readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n'), render());
  assert.equal(schema.$id, 'pdg-declarations/0.1.0');
  assert.equal(schema.properties.schema.const, SCHEMA);
  assert.equal(SCHEMA, 'pdg-declarations/0.1.0');
  const pinned = readFileSync('schemas/pdg-declarations-0.1.0.schema.sha256', 'utf8').trim().split(/\s+/)[0];
  assert.match(pinned, /^[0-9a-f]{64}$/);
  assert.equal(sha256(readFileSync(FILE, 'utf8')), pinned);
});

test('basis.kind and basis.overlays are not in the schema and are refused by Gate 0', () => {
  const props = schema.properties.datasets.items.properties.basis.properties;
  assert.ok(!('kind' in props) && !('overlays' in props));
  for (const [k, v] of [['kind', 'consent'], ['overlays', ['x']]]) {
    const d = base(); d.datasets[0].basis[k] = v;
    assert.equal(gate0Ok(d), false);
    assert.equal(valid(schema, d), false);
    assert.ok(!JSON.stringify(evaluate(d, { now: NOW })).includes('overlays'));
  }
});

test('the superseded -proposed revision is refused (exit-2 path), not silently accepted', () => {
  const d = base(); d.schema = 'pdg-declarations/0.1.0-proposed';
  assert.equal(gate0Ok(d), false);
  assert.equal(valid(schema, d), false);
});

test('JSON Schema and evaluator Gate 0 agree on valid and malformed documents', () => {
  const muts = [
    d => d, d => { delete d.applicability; }, d => { d.applicability = { declared: true, attestation: {} }; },
    d => { d.applicability = { declared: false, attestation: { by: 'human', name: 'n', basis: 'b', attestedAt: 'x' } }; },
    d => { d.applicability = []; }, d => { d.applicability = { declared: false, extra: 1 }; }, d => { d.applicability.attestation = 'x'; },
    d => { d.extra = 1; }, d => { d.classes = 'personal'; }, d => { d.classes = [1, null]; }, d => { d.purposes = [1]; }, d => { d.purposes[0].extra = 1; },
    d => { d.purposes[0].id = 1; }, d => { d.datasets[0].extra = 1; }, d => { d.datasets[0].id = 1; }, d => { d.datasets[0].purposes = [1]; },
    d => { d.datasets[0].fields = {}; }, d => { d.datasets[0].fields[0].extra = 1; }, d => { d.datasets[0].fields[0].purposeRefs = [1]; },
    d => { d.datasets[0].retention = []; }, d => { d.datasets[0].retention.extra = 1; }, d => { d.datasets[0].retention.period = 1; },
    d => { d.datasets[0].basis = []; }, d => { d.datasets[0].basis.noticeRef = 1; }, d => { d.datasets[0].basis.consentNotRelied = 'yes'; },
    d => { d.datasets[0].basis.withdrawalPath = 'x'; }, d => { d.datasets[0].basis.withdrawalPath.extra = 1; }, d => { d.datasets[0].basis.withdrawalPath.mechanism = 1; },
    d => { d.datasets[0].risk = 1; }, d => { d.datasets[0].risk.reviewRef = 1; }, d => { d.datasets[0].risk.extra = 1; },
    d => { d.datasets[0].risk.transferRestrictions = {}; }, d => { d.datasets[0].risk.transferRestrictions.declared = 'yes'; },
    d => { d.datasets[0].risk.transferRestrictions.extra = 1; }, d => { d.datasets[0].risk.transferRestrictions.statementRef = 1; },
    d => { d.evidence = [1]; }, d => { d.exceptions = {}; }, d => { d.datasets = [1]; }, d => { d.datasets = {}; }, d => { delete d.schema; },
    d => { delete d.datasets[0].basis; delete d.datasets[0].risk; }, d => { d.datasets[0].basis = { consentNotRelied: true }; },
  ];
  let ok = 0;
  for (const [i, m] of muts.entries()) {
    const d = base(); m(d);
    assert.equal(valid(schema, d), gate0Ok(d), `mutation ${i}`);
    if (gate0Ok(d)) ok++;
  }
  assert.ok(ok >= 5 && ok < muts.length);
});

test('freeze candidate keeps the six basis/risk rules recommended/partial and does not implement prohibited derivations', () => {
  const rules = readJson('rules/first-slice.json').rules.filter(r => /^pdg-(basis|risk)\./.test(r.id));
  assert.equal(rules.length, 6);
  for (const r of rules) { assert.equal(r.level, 'recommended'); assert.equal(r.assurance, 'partial'); }
  assert.ok(!readJson('rules/first-slice.json').rules.some(r => r.id === 'pdg-purpose.prohibited-derivations-declared'));
});

test('a missing basis/risk declaration on a personal dataset still cannot pass under the candidate revision', () => {
  const d = base(); delete d.datasets[0].basis; delete d.datasets[0].risk;
  const r = evaluate(d, { now: NOW });
  assert.equal(r.verdict, 'REVIEW_REQUIRED');
  assert.notEqual(r.verdict, 'PASS');
});
