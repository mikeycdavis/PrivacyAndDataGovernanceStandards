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
  assert.equal(status(run(d), 'pdg-evidence.envelope-valid'), 'fail');
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
  d.datasets = []; d.evidence = [];
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
  d.exceptions = [{ id: 'X1', ruleId: 'pdg-lifecycle.retention-declared', datasetRef: 'orders', owner: 'team-example', rationale: 'legal hold', scope: 'orders', evidenceRef: 'E3', expiresAt: '2027-01-01T00:00:00Z' }];
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
    d.exceptions = [{ id: 'X1', ruleId: 'pdg-lifecycle.retention-declared', datasetRef: 'orders', owner: 'o', rationale: 'r', scope: 's', evidenceRef: 'E3', expiresAt: '2027-01-01T00:00:00Z' }];
    delete d.exceptions[0][k];
    assert.equal(status(run(d), 'pdg-evidence.exception-complete'), 'fail', k);
    assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'fail', k);
  }
});
test('exceptions: expired exception fails the exception rule', () => {
  const d = base(); d.exceptions = [{ id: 'X1', ruleId: 'pdg-lifecycle.retention-declared', datasetRef: 'orders', owner: 'o', rationale: 'r', scope: 's', evidenceRef: 'E3', expiresAt: '2026-01-01T00:00:00Z' }];
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

// ---- Codex review findings (exact head 3526e9f) ----
const withIndef = (mut) => {
  const d = base(); d.datasets[0].retention.period = 'indefinite';
  d.evidence.push({ ...structuredClone(d.evidence[1]), id: 'EX' }); mut(d.evidence[d.evidence.length - 1]);
  d.exceptions = [{ id: 'X1', ruleId: 'pdg-lifecycle.retention-declared', datasetRef: 'orders', owner: 'o', rationale: 'r', scope: 's', evidenceRef: 'EX', expiresAt: '2027-01-01T00:00:00Z' }];
  return d;
};
test('exception evidence must be usable: contradicting, expired, future or other-dataset evidence grants nothing', () => {
  assert.equal(status(run(withIndef(() => {})), 'pdg-lifecycle.retention-declared'), 'pass');
  for (const mut of [e => { e.result = 'contradicts'; }, e => { e.validUntil = '2020-01-01T00:00:00Z'; e.retrievedAt = '2019-01-01T00:00:00Z'; },
    e => { e.retrievedAt = '2027-10-01T00:00:00Z'; e.validUntil = '2028-01-01T00:00:00Z'; }, e => { e.datasetRef = 'other'; }]) {
    const d = withIndef(mut);
    assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'fail');
    assert.equal(status(run(d), 'pdg-evidence.exception-complete'), 'fail');
  }
});
test('deletion evidence is bound to its dataset by datasetRef', () => {
  const d = base(); d.datasets.push({ ...structuredClone(d.datasets[0]), id: 'unrelated-payroll' });
  assert.equal(status(run(d), 'pdg-lifecycle.deletion-evidenced'), 'fail');
  const e = base(); delete e.evidence[0].datasetRef;
  assert.equal(status(run(e), 'pdg-evidence.envelope-valid'), 'fail');
});
test('future retrievedAt, reversed validity and impossible calendar dates are rejected', () => {
  for (const mut of [e => { e.retrievedAt = '2027-10-01T00:00:00Z'; }, e => { e.validUntil = '2026-10-01T00:00:00Z'; }, e => { e.validUntil = '2027-02-30T00:00:00Z'; }]) {
    const d = base(); mut(d.evidence[0]);
    assert.equal(status(run(d), 'pdg-lifecycle.deletion-evidenced'), 'fail');
  }
});
test('purposes without text and fields without names do not pass', () => {
  let d = base(); d.purposes = [{ id: 'P1' }, { id: 'P2' }];
  assert.equal(status(run(d), 'pdg-purpose.purpose-declared'), 'fail');
  d = base(); d.datasets[0].fields = [{ purposeRefs: ['P1'] }];
  assert.equal(status(run(d), 'pdg-purpose.field-use-mapped'), 'fail');
});

// ---- second Codex review (exact head 6e01744) ----
test('attestation dated in the future does not establish not-applicable', () => {
  const d = base(); d.applicability = { declared: false, attestation: { by: 'human', name: 'a reviewer', basis: 'no data held', attestedAt: '2027-01-01T00:00:00Z' } };
  assert.equal(run(d).verdict, 'REVIEW_REQUIRED');
});
test('duplicate dataset or purpose ids fail and cannot share evidence', () => {
  let d = base(); const x = structuredClone(d.datasets[0]); x.owner = 'other-team'; d.datasets.push(x);
  assert.equal(status(run(d), 'pdg-inventory.dataset-declared'), 'fail');
  d = base(); d.purposes.push({ id: 'P1', text: 'dup' });
  assert.equal(status(run(d), 'pdg-purpose.purpose-declared'), 'fail');
});
test('non-string hash is not coerced', () => {
  const d = base(); d.evidence[0].retention.hash = [d.evidence[0].retention.hash];
  assert.equal(status(run(d), 'pdg-evidence.envelope-valid'), 'fail');
});
test('unknown fields inside declarations are refused at gate 0 without echo', () => {
  const muts = [d => { d.datasets[0].retention.extra = true; }, d => { d.datasets[0].zzz = 1; }, d => { d.datasets[0].fields[0].zzz = 1; },
    d => { d.purposes[0].zzz = 1; }, d => { d.applicability.zzz = 1; }];
  for (const m of muts) { const d = base(); m(d); const r = run(d); assert.ok(r.gate0); assert.equal(r.verdict, null); assert.ok(!JSON.stringify(r).includes('zzz')); }
});

// ---- third Codex review (exact head e991e11) ----
test('exception evidence must target the excepted rule', () => {
  const d = base(); d.datasets[0].retention.period = 'indefinite';
  d.exceptions = [{ id: 'X1', ruleId: 'pdg-lifecycle.retention-declared', datasetRef: 'orders', owner: 'o', rationale: 'r', scope: 's', evidenceRef: 'E1', expiresAt: '2027-01-01T00:00:00Z' }];
  assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'fail');
  assert.equal(status(run(d), 'pdg-evidence.exception-complete'), 'fail');
});
test('not-applicable does not bypass evidence-envelope refusal', () => {
  for (const m of [e => { e.surface = 'live-platform'; }, e => { e.unknown = true; }]) {
    const d = base(); d.applicability = { declared: false, attestation: { by: 'human', name: 'reviewer', basis: 'no data held', attestedAt: '2026-11-01T00:00:00Z' } };
    m(d.evidence[0]);
    assert.notEqual(run(d).verdict, 'NOT_APPLICABLE');
  }
});

// ---- fourth Codex review (exact head 6dd0d65) ----
test('inherited property names as ids do not defeat duplicate detection', () => {
  const d = base(); d.datasets[0].id = 'constructor'; for (const e of d.evidence) e.datasetRef = 'constructor';
  d.exceptions = []; d.datasets.push(structuredClone(d.datasets[0]));
  assert.equal(status(run(d), 'pdg-inventory.dataset-declared'), 'fail');
});
test('not-applicable is not accepted when exceptions or evidence are malformed or duplicated', () => {
  const na = () => { const d = base(); d.applicability = { declared: false, attestation: { by: 'human', name: 'reviewer', basis: 'no data held', attestedAt: '2026-11-01T00:00:00Z' } }; return d; };
  let d = na(); d.exceptions = [{ unknown: true }];
  assert.equal(run(d).verdict, 'FAIL');
  d = na(); d.evidence.push(structuredClone(d.evidence[0]));
  assert.equal(run(d).verdict, 'FAIL');
  d = na(); d.datasets = []; d.evidence = [];
  assert.equal(run(d).verdict, 'NOT_APPLICABLE');
});
test('malformed entries in classes, purposes, datasets, fields, evidence or exceptions are refused at gate 0', () => {
  const muts = [d => d.classes.push({ unknown: true }), d => d.purposes.push(42), d => d.datasets.push('x'), d => d.datasets[0].fields.push(7),
    d => d.evidence.push(null), d => d.exceptions.push('x')];
  for (const m of muts) { const d = base(); m(d); assert.ok(run(d).gate0); assert.equal(run(d).verdict, null); }
});

// ---- fifth Codex review (exact head 893b16d) ----
test('wrongly typed nested containers are refused at gate 0', () => {
  const muts = [d => { d.applicability.attestation = [{ unknown: true }]; }, d => { d.datasets[0].fields = { unknown: true }; },
    d => { d.applicability = 'yes'; }, d => { d.datasets[0].retention = []; }, d => { d.datasets[0].classes = 'personal'; }, d => { d.datasets[0].purposes = {}; },
    d => { d.datasets[0].fields[0].purposeRefs = 'P1'; }];
  for (const m of muts) { const d = base(); m(d); assert.ok(run(d).gate0, String(m)); assert.equal(run(d).verdict, null); }
});
test('unknown applicability still reports invalid evidence as FAIL, never INDETERMINATE alone', () => {
  for (const m of [e => { e.surface = 'live-platform'; }, e => { e.unknown = true; }]) {
    const d = base(); delete d.applicability; m(d.evidence[0]);
    assert.equal(run(d).verdict, 'FAIL');
  }
  const d = base(); delete d.applicability; assert.equal(run(d).verdict, 'INDETERMINATE');
});

// ---- independent review (exact head f0aafb7) ----
const naDoc = (att = true) => { const d = base(); d.applicability = att ? { declared: false, attestation: { by: 'human', name: 'reviewer', basis: 'no data held', attestedAt: '2026-11-01T00:00:00Z' } } : { declared: false }; return d; };
test('unattested not-applicable with invalid evidence is FAIL, not a soft state', () => {
  const d = naDoc(false); d.evidence[0].surface = 'live-platform';
  assert.equal(run(d).verdict, 'FAIL');
});
test('attested not-applicable that still declares datasets is a contradiction: REVIEW_REQUIRED', () => {
  assert.equal(run(naDoc()).verdict, 'REVIEW_REQUIRED');
  const d = naDoc(); d.datasets = []; d.evidence = []; assert.equal(run(d).verdict, 'NOT_APPLICABLE');
});
test('durations: zero and mixed week forms are not accepted', () => {
  for (const p of ['P0D', 'P0Y', 'PT0S', 'P1W2D']) { const d = base(); d.datasets[0].retention.period = p; assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'fail', p); }
  for (const p of ['P1W', 'P2Y', 'P1Y6M', 'PT36H']) { const d = base(); d.datasets[0].retention.period = p; assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'pass', p); }
});
test('envelope ruleId and datasetRef must be known; exception refs and ids must be valid and unique', () => {
  let d = base(); d.evidence[0].ruleId = 'pdg-bogus.nothing'; assert.equal(status(run(d), 'pdg-evidence.envelope-valid'), 'fail');
  d = base(); d.evidence[0].datasetRef = 'ghost'; assert.equal(status(run(d), 'pdg-evidence.envelope-valid'), 'fail');
  const ex = { id: 'X1', ruleId: 'pdg-lifecycle.retention-declared', datasetRef: 'orders', owner: 'o', rationale: 'r', scope: 's', evidenceRef: 'E3', expiresAt: '2027-01-01T00:00:00Z' };
  d = base(); d.exceptions = [ex]; assert.equal(status(run(d), 'pdg-evidence.exception-complete'), 'pass');
  d = base(); d.exceptions = [ex, { ...ex }]; assert.equal(status(run(d), 'pdg-evidence.exception-complete'), 'fail');
  d = base(); d.exceptions = [{ ...ex, ruleId: 'pdg-bogus.nothing' }]; assert.equal(status(run(d), 'pdg-evidence.exception-complete'), 'fail');
});
test('a purpose entry lacking id or text is reported even if unused', () => {
  const d = base(); d.purposes.push({ id: 'P9' }); assert.equal(status(run(d), 'pdg-purpose.purpose-declared'), 'fail');
});
test('CLI refuses a bad or missing --now and exits cleanly', async () => {
  const { spawnSync } = await import('node:child_process');
  for (const a of [['--now', '2026-11-21'], ['--now']]) assert.equal(spawnSync('node', ['scripts/evaluate.mjs', 'fixtures/synthetic-compliant.json', ...a]).status, 2);
  assert.equal(spawnSync('node', ['scripts/evaluate.mjs', 'fixtures/synthetic-compliant.json', '--now', '2026-11-21T00:00:00Z']).status, 0);
});

// ---- seventh Codex review (exact head 761b86f) ----
test('scalar types in declarations are checked at gate 0, including under not-applicable', () => {
  const muts = [d => { d.purposes[0].id = { u: 1 }; }, d => { d.purposes[0].text = 5; }, d => { d.datasets[0].owner = 5; }, d => { d.datasets[0].fields[0].name = {}; },
    d => { d.datasets[0].retention.period = 5; }, d => { d.datasets[0].id = []; }];
  for (const m of muts) {
    const d = base(); m(d); assert.ok(run(d).gate0);
    d.applicability = { declared: false, attestation: { by: 'human', name: 'reviewer', basis: 'no data held', attestedAt: '2026-11-01T00:00:00Z' } };
    assert.ok(run(d).gate0);
  }
});
test('evaluation clock is validated strictly in the library and the CLI', async () => {
  for (const now of ['2026-11-31T00:00:00Z', ['2026-11-21T00:00:00Z'], { toString: null }, 5, '']) {
    const r = evaluate(base(), { now }); assert.ok(r.gate0); assert.equal(r.verdict, null);
  }
  const { spawnSync } = await import('node:child_process');
  assert.equal(spawnSync('node', ['scripts/evaluate.mjs', 'fixtures/synthetic-compliant.json', '--now', '2026-11-31T00:00:00Z']).status, 2);
});

// ---- eighth Codex review (exact head 76e080e): strict CLI arguments ----
test('CLI refuses empty --now, --now=value, duplicate flags, unknown options and extra arguments', async () => {
  const { spawnSync } = await import('node:child_process');
  const f = 'fixtures/synthetic-compliant.json', ok = '2026-11-21T00:00:00Z';
  const cases = [[f, '--now', ''], [f, '--now=2099-01-01T00:00:00Z'], [f, '--now', ok, '--now', 'garbage'], [f, '--bogus'], [f, 'extra.json'], ['--now', ok], []];
  for (const a of cases) assert.equal(spawnSync('node', ['scripts/evaluate.mjs', ...a]).status, 2, JSON.stringify(a));
  assert.equal(spawnSync('node', ['scripts/evaluate.mjs', f, '--now', ok]).status, 0);
});

// ---- independent review of PR 4 (head 266d007) ----
test('exception evidence must be a human or legal attestation, not tool output', () => {
  const d = base(); d.datasets[0].retention.period = 'indefinite';
  d.exceptions = [{ id: 'X1', ruleId: 'pdg-lifecycle.retention-declared', datasetRef: 'orders', owner: 'o', rationale: 'r', scope: 's', evidenceRef: 'E3', expiresAt: '2027-01-01T00:00:00Z' }];
  assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'pass');
  const e3 = d.evidence.find(e => e.id === 'E3');
  e3.surface = 'ingested'; e3.evidence.kind = 'automated'; e3.producer.kind = 'tool';
  assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'fail');
  assert.equal(status(run(d), 'pdg-evidence.exception-complete'), 'fail');
});
test('an attestation alongside declared:true is refused at gate 0', () => {
  const d = base(); d.applicability = { declared: true, attestation: {} };
  assert.ok(run(d).gate0);
});
test('CLI exit-code contract: 1 for FAIL, 3 for REVIEW_REQUIRED/INDETERMINATE, with a pinned clock', async () => {
  const { spawnSync } = await import('node:child_process');
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'pdg-'));
  const put = (name, d) => { const p = join(dir, name); writeFileSync(p, JSON.stringify(d)); return p; };
  const now = ['--now', NOW];
  const fail = base(); fail.datasets[0].owner = '';
  const review = base(); delete review.datasets[0].retention.testEvidenceRef;
  const indet = base(); delete indet.applicability;
  assert.equal(spawnSync('node', ['scripts/evaluate.mjs', put('f.json', fail), ...now]).status, 1);
  assert.equal(spawnSync('node', ['scripts/evaluate.mjs', put('r.json', review), ...now]).status, 3);
  assert.equal(spawnSync('node', ['scripts/evaluate.mjs', put('i.json', indet), ...now]).status, 3);
});

// ---- independent review round 2 ----
test('placeholder hashes and effectively-indefinite finite periods do not reach PASS', () => {
  let d = base(); d.evidence.forEach(e => { e.retention.hash = '0'.repeat(64); });
  assert.notEqual(run(d).verdict, 'PASS');
  d = base(); d.evidence.forEach(e => { e.retention.hash = 'a'.repeat(64); });
  assert.notEqual(run(d).verdict, 'PASS');
  for (const p of ['P99999999Y', 'P101Y', 'P40000D', 'P6000W', 'PT999999999999999999999999S', 'PT999999999H', 'PT99999999999M', 'P100YT9999999H', 'P99999D'+'T1H']) {
    d = base(); d.datasets[0].retention.period = p;
    assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'fail', p);
  }
  d = base(); d.datasets[0].retention.period = 'P100Y';
  assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'pass');
});

test('unbounded expiry windows and periodic placeholder hashes do not reach PASS', () => {
  for (const h of ['ab'.repeat(32), '0123456789abcdef'.repeat(4)]) { const d = base(); d.evidence.forEach(e => { e.retention.hash = h; }); assert.notEqual(run(d).verdict, 'PASS', h); }
  let d = base(); d.evidence[0].validUntil = '9999-12-31T23:59:59Z'; d.evidence[0].retrievedAt = '0001-01-01T00:00:00Z';
  assert.notEqual(run(d).verdict, 'PASS');
  d = base(); d.datasets[0].retention.period = 'indefinite';
  const ex = exp => ({ id: 'X', ruleId: 'pdg-lifecycle.retention-declared', datasetRef: d.datasets[0].id, owner: 'o', rationale: 'r', scope: 's', evidenceRef: d.evidence.find(e => e.evidence?.kind === 'manual' && e.surface === 'attested')?.id ?? 'E3', expiresAt: exp });
  d.exceptions = [ex('2027-01-01T00:00:00Z')];
  const near = status(run(d), 'pdg-lifecycle.retention-declared');
  d.exceptions = [ex('9999-12-31T23:59:59Z')];
  assert.equal(status(run(d), 'pdg-lifecycle.retention-declared'), 'fail');
  assert.ok(near === 'pass' || near === 'fail');
});

test('a current contradicting envelope fails its rule even when unreferenced; reports state evaluatedAt', () => {
  const d = base(); const c = structuredClone(d.evidence[0]); c.id = 'E9'; c.result = 'contradicts'; d.evidence.push(c);
  const r = run(d);
  assert.equal(status(r, c.ruleId), 'fail');
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.evaluatedAt, NOW);
  const old = base(); const o = structuredClone(old.evidence[0]); o.id = 'E9'; o.result = 'contradicts'; o.validUntil = '2025-02-01T00:00:00Z'; o.retrievedAt = '2025-01-01T00:00:00Z'; old.evidence.push(o);
  assert.equal(run(old).verdict, 'PASS');
});

// ---- Proposed basis and risk declarations: a missing declaration can never pass ----
const BR = ['pdg-basis.notice-evidenced', 'pdg-basis.consent-record-evidenced', 'pdg-basis.withdrawal-path-evidenced', 'pdg-risk.impact-analysis-evidenced', 'pdg-risk.review-recorded', 'pdg-risk.transfer-restriction-declared'];
test('personal dataset with no basis or risk declaration: every basis/risk rule is not-evaluated and the verdict is REVIEW_REQUIRED, never PASS', () => {
  const d = base(); delete d.datasets[0].basis; delete d.datasets[0].risk;
  const r = run(d);
  assert.equal(r.verdict, 'REVIEW_REQUIRED');
  for (const id of BR) assert.equal(status(r, id), 'not-evaluated', id);
});
test('each single missing declaration alone prevents a passing overall verdict', () => {
  const cuts = [d => delete d.datasets[0].basis.noticeRef, d => { delete d.datasets[0].basis.consentRecordRef; },
    d => delete d.datasets[0].basis.withdrawalPath, d => delete d.datasets[0].risk.impactAnalysisRef, d => delete d.datasets[0].risk.reviewRef, d => delete d.datasets[0].risk.transferRestrictions];
  cuts.forEach((cut, i) => {
    const d = base(); cut(d);
    const r = run(d);
    assert.equal(r.verdict, 'REVIEW_REQUIRED', `cut ${i}`);
    assert.equal(status(r, BR[i]), 'not-evaluated', BR[i]);
  });
});
test('a reference that does not resolve to current supporting evidence fails; agent output is never a review', () => {
  const ev = (d, id) => d.evidence.find(e => e.id === id);
  for (const mut of [d => { d.datasets[0].basis.noticeRef = 'nope'; }, d => { ev(d, 'N2').validUntil = '2026-11-20T00:00:00Z'; ev(d, 'N2').retrievedAt = '2026-11-01T00:00:00Z'; },
    d => { ev(d, 'N2').ruleId = 'pdg-basis.consent-record-evidenced'; }, d => { ev(d, 'N2').result = 'inconclusive'; }]) {
    const d = base(); mut(d);
    const r = run(d);
    assert.equal(status(r, 'pdg-basis.notice-evidenced'), 'fail');
    assert.notEqual(r.verdict, 'PASS');
  }
  const a = base(); const e6 = a.evidence.find(e => e.id === 'N6'); e6.surface = 'ingested'; e6.evidence = { kind: 'automated' }; e6.producer = { kind: 'agent', name: 'synthetic-agent', version: '1.0.0' };
  const r = run(a);
  assert.equal(status(r, 'pdg-risk.review-recorded'), 'fail');
  assert.equal(r.verdict, 'FAIL');
});
test('transfer restrictions declared false need no statement; declared true needs usable evidence', () => {
  const a = base(); a.datasets[0].risk.transferRestrictions = { declared: false };
  assert.equal(run(a).verdict, 'PASS');
  const b = base(); delete b.datasets[0].risk.transferRestrictions.statementRef;
  assert.equal(status(run(b), 'pdg-risk.transfer-restriction-declared'), 'fail');
  const c = base(); c.datasets[0].risk.transferRestrictions = { declared: false, statementRef: 'missing' };
  assert.equal(status(run(c), 'pdg-risk.transfer-restriction-declared'), 'fail');
  assert.notEqual(run(c).verdict, 'PASS');
});
test('a dataset that declares no personal class is not asked for basis or risk', () => {
  const d = base(); d.datasets[0].classes = ['internal']; delete d.datasets[0].basis; delete d.datasets[0].risk;
  const r = run(d);
  for (const id of BR) assert.equal(status(r, id), 'pass', id);
});
test('gate 0: malformed or unknown basis/risk fields are refused without echoing them', () => {
  for (const mut of [d => { d.datasets[0].basis.surprise = 'SECRET-VALUE'; }, d => { d.datasets[0].basis = []; }, d => { d.datasets[0].risk.transferRestrictions.declared = 'yes'; }, d => { d.datasets[0].basis.overlays = [1]; }]) {
    const d = base(); mut(d);
    const r = run(d);
    assert.ok(r.gate0);
    assert.equal(r.verdict, null);
    assert.ok(!JSON.stringify(r).includes('SECRET-VALUE') && !JSON.stringify(r).includes('surprise'));
  }
});

test('a basis.kind label alone never waives the consent evidence; only an explicit consentNotRelied declaration does', () => {
  const a = base(); delete a.datasets[0].basis.consentRecordRef; a.datasets[0].basis.kind = 'consent';
  assert.equal(status(run(a), 'pdg-basis.consent-record-evidenced'), 'not-evaluated');
  assert.equal(run(a).verdict, 'REVIEW_REQUIRED');
  const b = base(); delete b.datasets[0].basis.consentRecordRef; b.datasets[0].basis.consentNotRelied = true;
  assert.equal(status(run(b), 'pdg-basis.consent-record-evidenced'), 'pass');
  const c = base(); c.datasets[0].basis.consentNotRelied = 'yes';
  assert.ok(run(c).gate0);
});
test('personal label: case/space variants trigger the rules; any unexaminable label (invisible, combining, lookalike, inner space) is not-evaluated, never PASS', () => {
  const u = n => String.fromCharCode(n);
  const labels = ['Personal', ' PERSONAL ', 'pers' + u(0x200b) + 'onal', 'personal' + u(0), u(0xff30) + 'ERSONAL', 'pers' + u(0xfe0f) + 'onal', 'pers' + u(0x34f) + 'onal', 'pers' + u(0x3164) + 'onal', 'pers' + u(0x2028) + 'onal',
    'p' + u(0x435) + 'rsonal', u(0x1d18) + 'ersonal', 'per sonal', 'personal' + u(0x307)];
  for (const label of labels) {
    const d = base(); d.classes = [label]; d.datasets[0].classes = [label]; delete d.datasets[0].basis; delete d.datasets[0].risk;
    const r = run(d);
    assert.notEqual(r.verdict, 'PASS', JSON.stringify(label));
    assert.equal(r.verdict, 'REVIEW_REQUIRED', JSON.stringify(label));
  }
});
