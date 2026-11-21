// Pure evaluator for pdg-declarations/0.1.0-proposed (first slice). Nothing here is frozen.
// Findings carry only a rule ID and an index-only JSON pointer. Declared values, ids and unknown keys are never echoed.

export const SCHEMA = 'pdg-declarations/0.1.0-proposed';
const TOP_KEYS = ['schema', 'applicability', 'classes', 'purposes', 'datasets', 'evidence', 'exceptions'];
const ENVELOPE_KEYS = ['id', 'ruleId', 'subject', 'scope', 'surface', 'evidence', 'producer', 'retrievedAt', 'validUntil', 'retention', 'result', 'limitations'];
const SURFACES = ['static', 'ingested', 'attested'];
const RESULTS = ['supports', 'contradicts', 'inconclusive'];
const EXC_KEYS = ['id', 'ruleId', 'datasetRef', 'owner', 'rationale', 'scope', 'evidenceRef', 'expiresAt'];
const DURATION = /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const HASH = /^[0-9a-f]{64}$/;
export const RULE_IDS = [
  'pdg-inventory.dataset-declared', 'pdg-inventory.class-declared',
  'pdg-purpose.purpose-declared', 'pdg-purpose.field-use-mapped',
  'pdg-lifecycle.retention-declared', 'pdg-lifecycle.backup-statement', 'pdg-lifecycle.deletion-evidenced',
  'pdg-evidence.envelope-valid', 'pdg-evidence.exception-complete',
];

export const LIMITATIONS = [
  'This is not a legal conclusion and no law or regulation was evaluated.',
  'Declarations were checked for presence and internal consistency only; their truth, accuracy and completeness were not examined.',
  'Only the declared, examinable surface was checked. A pass means no finding on that surface, not that the system is safe or compliant.',
  'No live platform, production system or real personal data was accessed.',
];

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = v => typeof v === 'string' && v.trim() !== '';
const arr = v => (Array.isArray(v) ? v : []);
const validDate = v => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(v));
const rank = { fail: 3, 'not-evaluated': 2, pass: 0 };

class Acc {
  constructor(id) { this.id = id; this.status = 'pass'; this.findings = []; }
  raise(status, ptr) {
    if (rank[status] > rank[this.status]) this.status = status;
    if (ptr && this.findings.length < 50) this.findings.push(ptr);
  }
  out() { return { ruleId: this.id, status: this.status, findings: this.findings }; }
}

function gate0(doc) {
  if (!isObj(doc)) return 'input is not a JSON object';
  if (doc.schema !== SCHEMA) return 'unsupported or missing schema version';
  if (Object.keys(doc).some(k => !TOP_KEYS.includes(k))) return 'unknown top-level field present';
  for (const k of ['classes', 'purposes', 'datasets', 'evidence', 'exceptions']) {
    if (k in doc && !Array.isArray(doc[k])) return `${k} must be an array`;
  }
  return null;
}

function envelopeProblems(e) {
  if (!isObj(e)) return true;
  if (Object.keys(e).some(k => !ENVELOPE_KEYS.includes(k))) return true;
  for (const k of ['id', 'ruleId', 'subject', 'scope']) if (!str(e[k])) return true;
  if (!SURFACES.includes(e.surface)) return true;
  if (!isObj(e.evidence) || !['automated', 'manual'].includes(e.evidence.kind)) return true;
  if (Object.keys(e.evidence).some(k => k !== 'kind')) return true;
  const p = e.producer;
  if (!isObj(p) || !str(p.name) || !str(p.version)) return true;
  if (Object.keys(p).some(k => !['kind', 'name', 'version'].includes(k))) return true;
  if (e.surface === 'attested') {
    if (e.evidence.kind !== 'manual' || !['human', 'legal'].includes(p.kind)) return true;
  } else if (e.evidence.kind === 'automated') {
    if (!['tool', 'agent'].includes(p.kind)) return true;
  } else if (p.kind !== 'human') return true;
  if (!validDate(e.retrievedAt) || !validDate(e.validUntil)) return true;
  if (!isObj(e.retention) || !str(e.retention.location) || !HASH.test(e.retention.hash || '')) return true;
  if (Object.keys(e.retention).some(k => !['location', 'hash'].includes(k))) return true;
  if (!RESULTS.includes(e.result)) return true;
  if (!Array.isArray(e.limitations) || e.limitations.length === 0 || !e.limitations.every(str)) return true;
  return false;
}

export function evaluate(doc, { now = new Date().toISOString() } = {}) {
  const g = gate0(doc);
  if (g) return { gate0: g, verdict: null, results: [], limitations: LIMITATIONS };
  const nowMs = Date.parse(now);
  const live = iso => validDate(iso) && Date.parse(iso) >= nowMs;

  // Applicability: unknown is never silently not-applicable.
  const ap = doc.applicability;
  if (!isObj(ap) || typeof ap.declared !== 'boolean') {
    return { gate0: null, verdict: 'INDETERMINATE', results: [], limitations: LIMITATIONS, note: 'applicability not declared' };
  }
  if (ap.declared === false) {
    const a = ap.attestation;
    const ok = isObj(a) && ['human', 'legal'].includes(a.by) && str(a.name) && str(a.basis) && validDate(a.attestedAt);
    return { gate0: null, verdict: ok ? 'NOT_APPLICABLE' : 'REVIEW_REQUIRED', results: [], limitations: LIMITATIONS,
      note: ok ? 'not-applicable on a declared and attested basis' : 'not-applicable lacks a human attestation' };
  }

  const classes = new Set(arr(doc.classes).filter(str));
  const purposes = new Set(arr(doc.purposes).filter(isObj).map(p => p.id).filter(str));
  const datasets = arr(doc.datasets);
  const evidence = arr(doc.evidence);
  const exceptions = arr(doc.exceptions);
  const evById = new Map();
  for (const e of evidence) if (isObj(e) && str(e.id) && !evById.has(e.id)) evById.set(e.id, e);

  const R = Object.fromEntries(RULE_IDS.map(id => [id, new Acc(id)]));
  const noData = () => { for (const id of RULE_IDS.slice(0, 7)) R[id].raise('not-evaluated', '/datasets'); };

  // Exceptions
  const excProblem = x => {
    if (!isObj(x) || Object.keys(x).some(k => !EXC_KEYS.includes(k))) return true;
    for (const k of EXC_KEYS.filter(k => k !== 'expiresAt')) if (!str(x[k])) return true;
    if (!evById.has(x.evidenceRef)) return true;
    return !live(x.expiresAt);
  };
  exceptions.forEach((x, i) => { if (excProblem(x)) R['pdg-evidence.exception-complete'].raise('fail', `/exceptions/${i}`); });
  const granted = (ruleId, datasetId) => exceptions.some(x => !excProblem(x) && x.ruleId === ruleId && x.datasetRef === datasetId);

  // Envelopes
  const seen = new Set();
  evidence.forEach((e, i) => {
    let bad = envelopeProblems(e);
    if (!bad) { if (seen.has(e.id)) bad = true; seen.add(e.id); }
    if (bad) R['pdg-evidence.envelope-valid'].raise('fail', `/evidence/${i}`);
  });

  if (datasets.length === 0) noData();

  datasets.forEach((d, i) => {
    const at = `/datasets/${i}`;
    if (!isObj(d) || !str(d.id) || !str(d.owner) || !str(d.source)) R['pdg-inventory.dataset-declared'].raise('fail', at);
    if (!isObj(d)) return;
    const cls = arr(d.classes);
    if (cls.length === 0 || !cls.every(c => classes.has(c))) R['pdg-inventory.class-declared'].raise('fail', at);

    const dp = arr(d.purposes);
    if (dp.length === 0 || !dp.every(p => purposes.has(p))) R['pdg-purpose.purpose-declared'].raise('fail', at);

    if (!Array.isArray(d.fields) || d.fields.length === 0) R['pdg-purpose.field-use-mapped'].raise('not-evaluated', at);
    else d.fields.forEach((f, j) => {
      const refs = isObj(f) ? arr(f.purposeRefs) : [];
      if (refs.length === 0 || !refs.every(r => dp.includes(r))) R['pdg-purpose.field-use-mapped'].raise('fail', `${at}/fields/${j}`);
    });

    const ret = d.retention;
    if (!isObj(ret)) {
      R['pdg-lifecycle.retention-declared'].raise('fail', at);
      R['pdg-lifecycle.backup-statement'].raise('not-evaluated', at);
      R['pdg-lifecycle.deletion-evidenced'].raise('not-evaluated', at);
      return;
    }
    const periodOk = str(ret.period) && (DURATION.test(ret.period) || (ret.period === 'indefinite' && granted('pdg-lifecycle.retention-declared', d.id)));
    if (!periodOk || !str(ret.trigger) || !str(ret.mechanism)) R['pdg-lifecycle.retention-declared'].raise('fail', `${at}/retention`);
    if (!str(ret.backupStatement)) R['pdg-lifecycle.backup-statement'].raise('fail', `${at}/retention`);

    const ref = ret.testEvidenceRef;
    if (ref === undefined) R['pdg-lifecycle.deletion-evidenced'].raise('not-evaluated', `${at}/retention`);
    else {
      const e = evById.get(ref);
      const ok = e && e.ruleId === 'pdg-lifecycle.deletion-evidenced' && e.result === 'supports' && live(e.validUntil) && !envelopeProblems(e);
      if (!ok) R['pdg-lifecycle.deletion-evidenced'].raise('fail', `${at}/retention`);
    }
  });

  const results = RULE_IDS.map(id => R[id].out());
  const verdict = results.some(r => r.status === 'fail') ? 'FAIL'
    : results.some(r => r.status === 'not-evaluated') ? 'REVIEW_REQUIRED' : 'PASS';
  return { gate0: null, verdict, results, limitations: LIMITATIONS };
}
