import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../scripts/lib/evaluate.mjs';
import { loadCatalog, checkRules } from '../scripts/check-catalog.mjs';
import { readJson, listFiles } from '../scripts/lib/util.mjs';
import { readFileSync } from 'node:fs';

const NOW = '2026-11-21T00:00:00Z';
const base = () => structuredClone(readJson('fixtures/synthetic-compliant.json'));
const run = (doc, opts = {}) => evaluate(doc, { now: NOW, ...opts });
const status = (r, id) => r.results.find(x => x.ruleId === id)?.status;

test('compliant synthetic fixture: every first-slice rule passes, verdict PASS, limitations stated', () => {
  const r = run(base());
  assert.equal(r.gate0, null);
  assert.equal(r.verdict, 'PASS');
  for (const x of r.results) assert.equal(x.status, 'pass', x.ruleId);
  assert.ok(r.limitations.length > 0);
  assert.ok(!/compliant/i.test(JSON.stringify(r.verdict)));
});

test('every evaluated rule id exists in the catalog and the catalog is valid', () => {
  const ids = new Set(loadCatalog().map(x => x.id));
  assert.deepEqual(checkRules(loadCatalog()), []);
  for (const x of run(base()).results) assert.ok(ids.has(x.ruleId), x.ruleId);
  for (const id of ids) assert.ok(run(base()).results.some(x => x.ruleId === id), `catalog rule ${id} is never evaluated`);
});

// ---- Gate 0: refuse, never guess ----
test('gate 0: wrong schema, unknown top-level key, non-object, live-platform are refused with no verdict', () => {
  for (const bad of [{ ...base(), schema: 'other/1' }, { ...base(), surprise: 1 }, [], null, 'text']) {
    const r = run(bad);
    assert.ok(r.gate0, JSON.stringify(bad)?.slice(0, 40));
    assert.equal(r.verdict, null);
  }
  const d = base(); d.evidence[0].surface = 'live-platform';
  assert.ok(run(d).gate0 || status(run(d), 'pdg-evidence.envelope-valid') === 'fail');
});

test('gate 0 message never echoes the unknown key name or value', () => {
  const d = base(); d['canary.person@example.com'] = 'CANARY-VALUE-123';
  const out = JSON.stringify(run(d));
  assert.ok(!out.includes('canary.person'));
  assert.ok(!out.includes('CANARY-VALUE-123'));
});

// ---- applicability ----
test('applicability absent -> INDETERMINATE, never silent NOT_APPLICABLE', () => {
  const d = base(); delete d.applicability;
  assert.equal(run(d).verdict, 'INDETERMINATE');
});
test('not-applicable needs declared basis AND a human attestation', () => {
  const d = base(); d.applicability = { declared: false };
  assert.equal(run(d).verdict, 'REVIEW_REQUIRED');
  d.applicability = { declared: false, attestation: { by: 'human', name: 'a reviewer', basis: 'no data held', attestedAt: '2026-11-01T00:00:00Z' } };
  assert.equal(run(d).verdict, 'NOT_APPLICABLE');
  d.applicability.attestation.by = 'agent';
  assert.equal(run(d).verdict, 'REVIEW_REQUIRED');
});

// ---- inventory / classification ----
test('inventory: missing owner or source fails; missing classes fails; undeclared class fails', () => {
  let d = base(); delete d.datasets[0].owner;
  assert.equal(status(run(d), 'pdg-inventory.dataset-declared'), 'fail');
  d = base(); delete d.datasets[0].source;
  assert.equal(status(run(d), 'pdg-inventory.dataset-declared'), 'fail');
  d = base(); d.datasets[0].classes = [];
  assert.equal(status(run(d), 'pdg-inventory.class-declared'), 'fail');
  d = base(); d.datasets[0].classes = ['secret-level-9'];
  assert.equal(status(run(d), 'pdg-inventory.class-declared'), 'fail');
});
test('inventory: no datasets declared is not a pass', () => {
  const d = base(); d.datasets = [];
  assert.notEqual(run(d).verdict, 'PASS');
});

// ---- purpose / minimization ----
test('purpose: dataset with no purpose or unknown purpose fails', () => {
  let d = base(); d.datasets[0].purposes = [];
  assert.equal(status(run(d), 'pdg-purpose.purpose-declared'), 'fail');
  d = base(); d.datasets[0].purposes = ['P99'];
  assert.equal(status(run(d), 'pdg-purpose.purpose-declared'), 'fail');
});
test('minimization: a field mapped to no purpose, or to an undeclared dataset purpose, fails', () => {
  let d = base(); d.datasets[0].fields.push({ name: 'extra', purposeRefs: [] });
  assert.equal(status(run(d), 'pdg-purpose.field-use-mapped'), 'fail');
  d = base(); d.datasets[0].fields[0].purposeRefs = ['P2x'];
  assert.equal(status(run(d), 'pdg-purpose.field-use-mapped'), 'fail');
  d = base(); delete d.datasets[0].fields;
  assert.equal(status(run(d), 'pdg-purpose.field-use-mapped'), 'not-evaluated');
});

// ---- retention / deletion ----
test('retention: missing period/trigger/mechanism fails; indefinite needs a live exception', () => {
  for (const k of ['period', 'trigger', 'mechanism']) {
    const d = base(); delete d.datasets[0].retention[k];
    assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'fail', k);
  }
  let d = base(); delete d.datasets[0].retention;
  assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'fail');
  d = base(); d.datasets[0].retention.period = 'indefinite';
  assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'fail');
  d.exceptions = [{ id: 'X1', ruleId: 'pdg-lifecycle.retention-declared', datasetRef: 'orders', owner: 'team-example', rationale: 'legal hold', scope: 'orders', evidenceRef: 'E1', expiresAt: '2027-01-01T00:00:00Z' }];
  assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'pass');
  d.exceptions[0].expiresAt = '2026-11-20T00:00:00Z';
  assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'fail');
});
test('retention: a malformed period is not guessed', () => {
  const d = base(); d.datasets[0].retention.period = 'two years or so';
  assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'fail');
});
test('backup statement missing fails', () => {
  const d = base(); delete d.datasets[0].retention.backupStatement;
  assert.equal(status(run(d), 'pdg-lifecycle.backup-statement'), 'fail');
});
test('deletion evidence: absent ref is not-evaluated (never pass); unknown, contradicting, wrong-rule or expired evidence fails', () => {
  let d = base(); delete d.datasets[0].retention.testEvidenceRef;
  assert.equal(status(run(d), 'pdg-lifecycle.deletion-evidenced'), 'not-evaluated');
  assert.equal(run(d).verdict, 'REVIEW_REQUIRED');
  d = base(); d.datasets[0].retention.testEvidenceRef = 'E404';
  assert.equal(status(run(d), 'pdg-lifecycle.deletion-evidenced'), 'fail');
  d = base(); d.evidence[0].result = 'contradicts';
  assert.equal(status(run(d), 'pdg-lifecycle.deletion-evidenced'), 'fail');
  d = base(); d.evidence[0].result = 'inconclusive';
  assert.equal(status(run(d), 'pdg-lifecycle.deletion-evidenced'), 'fail');
  d = base(); d.evidence[0].ruleId = 'pdg-inventory.dataset-declared';
  assert.equal(status(run(d), 'pdg-lifecycle.deletion-evidenced'), 'fail');
  d = base(); d.evidence[0].validUntil = '2026-11-20T00:00:00Z';
  assert.equal(status(run(d), 'pdg-lifecycle.deletion-evidenced'), 'fail');
});

// ---- evidence envelope ----
test('envelope: unknown field, bad hash, empty limitations, bad surface are refused', () => {
  const mutate = f => { const d = base(); f(d.evidence[0]); return status(run(d), 'pdg-evidence.envelope-valid'); };
  assert.equal(mutate(e => { e.extra = 1; }), 'fail');
  assert.equal(mutate(e => { e.retention.hash = 'xyz'; }), 'fail');
  assert.equal(mutate(e => { e.limitations = []; }), 'fail');
  assert.equal(mutate(e => { e.surface = 'live-platform'; }), 'fail');
  assert.equal(mutate(e => { delete e.subject; }), 'fail');
  assert.equal(mutate(e => { e.retrievedAt = 'yesterday'; }), 'fail');
});
test('envelope: agent or tool evidence can never be an attestation or legal review', () => {
  const mutate = f => { const d = base(); f(d.evidence[0]); return status(run(d), 'pdg-evidence.envelope-valid'); };
  assert.equal(mutate(e => { e.surface = 'attested'; e.evidence.kind = 'manual'; e.producer.kind = 'agent'; }), 'fail');
  assert.equal(mutate(e => { e.surface = 'attested'; e.evidence.kind = 'manual'; e.producer.kind = 'tool'; }), 'fail');
  assert.equal(mutate(e => { e.producer.kind = 'legal'; }), 'fail');
  assert.equal(mutate(e => { e.surface = 'attested'; e.evidence.kind = 'automated'; e.producer.kind = 'human'; }), 'fail');
  assert.equal(mutate(e => { e.surface = 'attested'; e.evidence.kind = 'manual'; e.producer.kind = 'human'; }), 'pass');
});

// ---- exceptions ----
test('exceptions: missing owner/rationale/scope/evidence/expiry is invalid and grants nothing', () => {
  for (const k of ['owner', 'rationale', 'scope', 'evidenceRef', 'expiresAt']) {
    const d = base(); d.datasets[0].retention.period = 'indefinite';
    d.exceptions = [{ id: 'X1', ruleId: 'pdg-lifecycle.retention-declared', datasetRef: 'orders', owner: 'o', rationale: 'r', scope: 's', evidenceRef: 'E1', expiresAt: '2027-01-01T00:00:00Z' }];
    delete d.exceptions[0][k];
    assert.equal(status(run(d), 'pdg-evidence.exception-complete'), 'fail', k);
    assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'fail', k);
  }
});
test('exceptions: expired exception fails the exception rule', () => {
  const d = base(); d.exceptions = [{ id: 'X1', ruleId: 'pdg-lifecycle.retention-declared', datasetRef: 'orders', owner: 'o', rationale: 'r', scope: 's', evidenceRef: 'E1', expiresAt: '2026-01-01T00:00:00Z' }];
  assert.equal(status(run(d), 'pdg-evidence.exception-complete'), 'fail');
});

// ---- no-echo (T1) ----
test('no-echo: findings never contain declared values, ids or names', () => {
  const d = base();
  d.datasets[0].id = 'CANARY-ID-777'; d.datasets[0].owner = 'CANARY-OWNER-888';
  d.datasets[0].fields.push({ name: 'CANARY-FIELD-999', purposeRefs: [] });
  d.datasets[0].purposes = ['CANARY-PURPOSE-555'];
  d.datasets[0].classes = ['CANARY-CLASS-444'];
  const out = JSON.stringify(run(d));
  for (const c of ['CANARY-ID-777', 'CANARY-OWNER-888', 'CANARY-FIELD-999', 'CANARY-PURPOSE-555', 'CANARY-CLASS-444']) assert.ok(!out.includes(c), c);
  assert.equal(run(d).verdict, 'FAIL');
});

// ---- determinism and honesty ----
test('deterministic: same input and now give identical output', () => {
  assert.equal(JSON.stringify(run(base())), JSON.stringify(run(base())));
});
test('report states what was not examined', () => {
  const r = run(base());
  assert.ok(r.limitations.some(l => /legal/i.test(l)));
  assert.ok(r.limitations.some(l => /truth|accuracy|complete/i.test(l)));
});

// ---- fixtures are synthetic only ----
test('fixtures contain only obviously synthetic values (reserved domains, no digit-runs resembling identifiers)', () => {
  for (const f of listFiles('fixtures')) {
    const text = readFileSync(`fixtures/${f}`, 'utf8');
    for (const m of text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g) || []) assert.match(m, /@(example\.(com|org|net)|[a-z0-9.-]+\.(test|invalid|example))$/i, m);
    assert.ok(!/\b\d{3}-\d{2}-\d{4}\b/.test(text), 'SSN-like value');
    assert.ok(!/\b(?:\d[ -]?){13,16}\b/.test(text.replace(/"hash": "[0-9a-f]+"/g, '')), 'card-like number');
  }
});
