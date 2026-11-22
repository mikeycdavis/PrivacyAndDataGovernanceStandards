// Pure evaluator for pdg-declarations/0.1.0 (freeze CANDIDATE; not frozen until the owner decides).
// Findings carry only a rule ID and an index-only JSON pointer. Declared values, ids and unknown keys are never echoed.

export const SCHEMA = 'pdg-declarations/0.1.0';
const TOP_KEYS = ['schema', 'applicability', 'classes', 'purposes', 'datasets', 'evidence', 'exceptions'];
const ENVELOPE_KEYS = ['id', 'ruleId', 'datasetRef', 'subject', 'scope', 'surface', 'evidence', 'producer', 'retrievedAt', 'validUntil', 'retention', 'result', 'limitations'];
const SURFACES = ['static', 'ingested', 'attested'];
const RESULTS = ['supports', 'contradicts', 'inconclusive'];
const EXC_KEYS = ['id', 'ruleId', 'datasetRef', 'owner', 'rationale', 'scope', 'evidenceRef', 'expiresAt'];
const DURATION = /^P(?!$)([0-9]+Y)?([0-9]+M)?([0-9]+D)?(T(?=[0-9])([0-9]+H)?([0-9]+M)?([0-9]+S)?)?$/;
const WEEKS = /^P[0-9]+W$/;
// Finite periods above MAX_DAYS (about 100 years) are effectively indefinite and are refused like any malformed period.
const MAX_DAYS = 36500;
function periodDays(p) {
  if (WEEKS.test(p)) return Number(p.slice(1, -1)) * 7;
  const m = DURATION.exec(p);
  return Number(m[1] ? m[1].slice(0, -1) : 0) * 365 + Number(m[2] ? m[2].slice(0, -1) : 0) * 31 + Number(m[3] ? m[3].slice(0, -1) : 0)
    + Number(m[5] ? m[5].slice(0, -1) : 0) / 24 + Number(m[6] ? m[6].slice(0, -1) : 0) / 1440 + Number(m[7] ? m[7].slice(0, -1) : 0) / 86400;
}
const durationOk = p => (WEEKS.test(p) || DURATION.test(p)) && /[1-9]/.test(p) && periodDays(p) <= MAX_DAYS;
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
// A 64-hex string made of one repeated character is a placeholder, not a hash.
const HASH = /^[0-9a-f]{64}$/;
// Hashes built by repeating a block of 16 or fewer characters are placeholders.
const hashOk = h => HASH.test(h) && !new RegExp('^(.{1,16})'+String.fromCharCode(92)+'1+$').test(h);
// Bounded windows keep "unexpired" meaningful: no never-expiring exceptions or evidence.
const DAY = 86400000, EXC_MAX_MS = 400 * DAY, EVID_MAX_MS = 1830 * DAY;
export const RULE_IDS = [
  'pdg-inventory.dataset-declared', 'pdg-inventory.class-declared',
  'pdg-purpose.purpose-declared', 'pdg-purpose.field-use-mapped',
  'pdg-lifecycle.retention-declared', 'pdg-lifecycle.backup-statement', 'pdg-lifecycle.deletion-evidenced',
  'pdg-basis.notice-evidenced', 'pdg-basis.consent-record-evidenced', 'pdg-basis.withdrawal-path-evidenced',
  'pdg-risk.impact-analysis-evidenced', 'pdg-risk.review-recorded', 'pdg-risk.transfer-restriction-declared',
  'pdg-evidence.envelope-valid', 'pdg-evidence.exception-complete',
];

const BASIS_RISK = RULE_IDS.filter(x => x.startsWith('pdg-basis.') || x.startsWith('pdg-risk.'));

export const LIMITATIONS = [
  'This is not a legal conclusion and no law or regulation was evaluated.',
  'Declarations were checked for presence and internal consistency only; their truth, accuracy and completeness were not examined.',
  'Only the declared, examinable surface was checked. A pass means no finding on that surface, not that the system is safe or compliant.',
  'No live platform, production system or real personal data was accessed.',
];

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = v => typeof v === 'string' && v.trim() !== '';
const validDate = v => {
  if (typeof v !== 'string' || !DATE.test(v)) return false;
  const t = Date.parse(v);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 19) + 'Z' === v;
};
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
  for (const k of ['purposes', 'datasets', 'evidence', 'exceptions']) if (arr(doc[k]).some(x => !isObj(x))) return 'malformed entry in declarations';
  if (arr(doc.datasets).some(d => Array.isArray(d.fields) && d.fields.some(f => !isObj(f)))) return 'malformed entry in declarations';
  if ('applicability' in doc) {
    if (!isObj(doc.applicability)) return 'malformed applicability';
    if (doc.applicability.declared === true && 'attestation' in doc.applicability) return 'malformed applicability';
    if ('attestation' in doc.applicability && !isObj(doc.applicability.attestation)) return 'malformed applicability';
  }
  for (const d of arr(doc.datasets)) {
    if (('classes' in d && !Array.isArray(d.classes)) || ('purposes' in d && !Array.isArray(d.purposes)) || ('fields' in d && !Array.isArray(d.fields)) || ('retention' in d && !isObj(d.retention))) return 'malformed entry in declarations';
    if (arr(d.purposes).some(c => typeof c !== 'string')) return 'malformed entry in declarations';
    if (arr(d.fields).some(f => 'purposeRefs' in f && (!Array.isArray(f.purposeRefs) || f.purposeRefs.some(x => typeof x !== 'string')))) return 'malformed entry in declarations';
  }
  const bad = (o, keys) => isObj(o) && keys.some(k => k in o && typeof o[k] !== 'string');
  if (arr(doc.purposes).some(p => bad(p, ['id', 'text']))) return 'malformed entry in declarations';
  if (isObj(doc.applicability) && isObj(doc.applicability.attestation) && bad(doc.applicability.attestation, ['by', 'name', 'basis', 'attestedAt'])) return 'malformed applicability';
  for (const d of arr(doc.datasets)) {
    if (bad(d, ['id', 'owner', 'source'])) return 'malformed entry in declarations';
    if (arr(d.fields).some(f => bad(f, ['name']))) return 'malformed entry in declarations';
    if (isObj(d.retention) && bad(d.retention, ['period', 'trigger', 'mechanism', 'backupStatement', 'testEvidenceRef'])) return 'malformed entry in declarations';
  }
  const only = (o, keys) => !isObj(o) || Object.keys(o).every(k => keys.includes(k));
  if (isObj(doc.applicability)) {
    if (!only(doc.applicability, ['declared', 'attestation'])) return 'unknown field in declarations';
    if (isObj(doc.applicability.attestation) && !only(doc.applicability.attestation, ['by', 'name', 'basis', 'attestedAt'])) return 'unknown field in declarations';
  }
  if (arr(doc.purposes).some(p => !only(p, ['id', 'text']))) return 'unknown field in declarations';
  for (const d of arr(doc.datasets)) {
    if (!only(d, ['id', 'owner', 'source', 'classes', 'purposes', 'fields', 'retention', 'basis', 'risk'])) return 'unknown field in declarations';
    const shape = shapeProblem(d);
    if (shape) return shape;
    if (isObj(d) && Array.isArray(d.fields) && d.fields.some(f => !only(f, ['name', 'purposeRefs']))) return 'unknown field in declarations';
    if (isObj(d) && isObj(d.retention) && !only(d.retention, ['period', 'trigger', 'mechanism', 'backupStatement', 'testEvidenceRef'])) return 'unknown field in declarations';
  }
  return null;
}

// Basis and risk declarations hold only references to evidence and an explicit consent-not-relied flag. basis.kind and basis.overlays were removed: no rule consumes them.
function shapeProblem(d) {
  const only = (o, keys) => Object.keys(o).every(k => keys.includes(k));
  const strs = (o, keys) => keys.every(k => !(k in o) || typeof o[k] === 'string');
  if (!isObj(d)) return null;
  const BAD = 'malformed entry in declarations';
  if ('basis' in d) {
    const b = d.basis;
    if (!isObj(b) || !only(b, ['noticeRef', 'consentRecordRef', 'consentNotRelied', 'withdrawalPath']) || !strs(b, ['noticeRef', 'consentRecordRef']) || ('consentNotRelied' in b && typeof b.consentNotRelied !== 'boolean')) return BAD;
    if ('withdrawalPath' in b && (!isObj(b.withdrawalPath) || !only(b.withdrawalPath, ['mechanism', 'testEvidenceRef']) || !strs(b.withdrawalPath, ['mechanism', 'testEvidenceRef']))) return BAD;
  }
  if ('risk' in d) {
    const r = d.risk;
    if (!isObj(r) || !only(r, ['impactAnalysisRef', 'reviewRef', 'transferRestrictions']) || !strs(r, ['impactAnalysisRef', 'reviewRef'])) return BAD;
    if ('transferRestrictions' in r) {
      const t = r.transferRestrictions;
      if (!isObj(t) || !only(t, ['declared', 'statementRef']) || typeof t.declared !== 'boolean' || !strs(t, ['statementRef'])) return BAD;
    }
  }
  return null;
}

// Class labels: the contract recognises exactly public, internal and personal (trimmed, lower-cased); personal is the canonical classification and no alias is defined.
// Any other label (pii, personal-data, invisible, combining, lookalike or non-ASCII spellings) is unrecognized and makes the basis/risk rules not-evaluated (REVIEW_REQUIRED), never a pass.
const KNOWN_LABELS = ['public', 'internal'];
const labelKind = c => { if (typeof c !== 'string') return 'unexaminable'; const t = c.trim().toLowerCase(); return t === 'personal' ? 'personal' : KNOWN_LABELS.includes(t) ? 'other' : 'unexaminable'; };

function arr(v) { return Array.isArray(v) ? v : []; }

function envelopeProblems(e) {
  if (!isObj(e)) return true;
  if (Object.keys(e).some(k => !ENVELOPE_KEYS.includes(k))) return true;
  for (const k of ['id', 'ruleId', 'datasetRef', 'subject', 'scope']) if (!str(e[k])) return true;
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
  if (!validDate(e.retrievedAt) || !validDate(e.validUntil) || e.retrievedAt > e.validUntil || Date.parse(e.validUntil) - Date.parse(e.retrievedAt) > EVID_MAX_MS) return true;
  if (!isObj(e.retention) || !str(e.retention.location) || typeof e.retention.hash !== 'string' || !hashOk(e.retention.hash)) return true;
  if (Object.keys(e.retention).some(k => !['location', 'hash'].includes(k))) return true;
  if (!RESULTS.includes(e.result)) return true;
  if (!Array.isArray(e.limitations) || e.limitations.length === 0 || !e.limitations.every(str)) return true;
  return false;
}

export function evaluate(doc, opts = {}) {
  const now = isObj(opts) && 'now' in opts ? opts.now : new Date().toISOString().slice(0, 19) + 'Z';
  if (!validDate(now)) return { gate0: 'evaluation time must be an ISO 8601 UTC timestamp', verdict: null, results: [], limitations: LIMITATIONS };
  const g = gate0(doc);
  if (g) return { gate0: g, verdict: null, results: [], limitations: LIMITATIONS, evaluatedAt: now };
  const nowMs = Date.parse(now);
  const live = iso => validDate(iso) && Date.parse(iso) >= nowMs;

  // Applicability: unknown is never silently not-applicable.
  const ap = doc.applicability;
  let naOk = null;
  const unknownApplicability = !isObj(ap) || typeof ap.declared !== 'boolean';
  if (!unknownApplicability && ap.declared === false) {
    const a = ap.attestation;
    naOk = isObj(a) && ['human', 'legal'].includes(a.by) && str(a.name) && str(a.basis) && validDate(a.attestedAt) && Date.parse(a.attestedAt) <= nowMs;
  }

  const classes = new Set(arr(doc.classes).filter(c => typeof c === 'string').map(c => c.trim().toLowerCase()));
  const purposes = new Set(arr(doc.purposes).filter(p => isObj(p) && str(p.text)).map(p => p.id).filter(str));
  const datasets = arr(doc.datasets);
  const dupe = (list, key) => { const c = new Map(); for (const x of list) if (isObj(x) && str(x[key])) c.set(x[key], (c.get(x[key]) || 0) + 1); return new Set([...c].filter(([, n]) => n > 1).map(([k]) => k)); };
  const dupDatasets = dupe(datasets, 'id');
  const datasetIds = new Set(datasets.filter(isObj).map(d => d.id).filter(str));
  const dupPurposes = dupe(arr(doc.purposes), 'id').size > 0;
  const evidence = arr(doc.evidence);
  const exceptions = arr(doc.exceptions);
  // Evidence is usable only if well-formed, supporting, bound to the dataset, retrieved by now and not expired.
  const usable = (e, datasetId) => isObj(e) && !envelopeProblems(e) && e.result === 'supports' && e.datasetRef === datasetId
    && Date.parse(e.retrievedAt) <= nowMs && live(e.validUntil);
  const evById = new Map();
  for (const e of evidence) if (isObj(e) && str(e.id) && !evById.has(e.id)) evById.set(e.id, e);

  const R = Object.fromEntries(RULE_IDS.map(id => [id, new Acc(id)]));
  if (arr(doc.purposes).some(p => !str(p.id) || !str(p.text))) R['pdg-purpose.purpose-declared'].raise('fail', '/purposes');
  if (dupPurposes) R['pdg-purpose.purpose-declared'].raise('fail', '/purposes');
  const noData = () => { for (const id of RULE_IDS.filter(x => !x.startsWith('pdg-evidence.'))) R[id].raise('not-evaluated', '/datasets'); };

  // Exceptions
  const excProblem = x => {
    if (!isObj(x) || Object.keys(x).some(k => !EXC_KEYS.includes(k))) return true;
    for (const k of EXC_KEYS.filter(k => k !== 'expiresAt')) if (!str(x[k])) return true;
    if (!RULE_IDS.includes(x.ruleId) || !datasetIds.has(x.datasetRef)) return true;
    const ev = evById.get(x.evidenceRef);
    if (!usable(ev, x.datasetRef) || ev.ruleId !== x.ruleId) return true;
    if (ev.surface !== 'attested' || !['human', 'legal'].includes(ev.producer.kind)) return true;
    return !(live(x.expiresAt) && Date.parse(x.expiresAt) - nowMs <= EXC_MAX_MS);
  };
  const dupExc = dupe(exceptions, 'id');
  exceptions.forEach((x, i) => { if (excProblem(x) || dupExc.has(x.id)) R['pdg-evidence.exception-complete'].raise('fail', `/exceptions/${i}`); });
  const granted = (ruleId, datasetId) => exceptions.some(x => !excProblem(x) && x.ruleId === ruleId && x.datasetRef === datasetId);

  // Envelopes
  const seen = new Set();
  evidence.forEach((e, i) => {
    let bad = envelopeProblems(e);
    if (!bad) { if (seen.has(e.id)) bad = true; seen.add(e.id); }
    if (!bad && (!RULE_IDS.includes(e.ruleId) || !datasetIds.has(e.datasetRef))) bad = true;
    if (bad) R['pdg-evidence.envelope-valid'].raise('fail', `/evidence/${i}`);
    else if (e.result === 'contradicts' && Date.parse(e.retrievedAt) <= nowMs && live(e.validUntil)) R[e.ruleId].raise('fail', `/evidence/${i}`); // current contradicting evidence is a finding even when unreferenced
  });

  if (datasets.length === 0) noData();
  // An unrecognized label in the top-level vocabulary also requires review.
  if (arr(doc.classes).some(c => labelKind(c) === 'unexaminable')) for (const id of BASIS_RISK) R[id].raise('not-evaluated', '/classes');

  datasets.forEach((d, i) => {
    const at = `/datasets/${i}`;
    if (!isObj(d) || !str(d.id) || !str(d.owner) || !str(d.source) || dupDatasets.has(d.id)) R['pdg-inventory.dataset-declared'].raise('fail', at);
    if (!isObj(d)) return;
    const cls = arr(d.classes);
    // Normalized matching. A recognized label missing from the vocabulary fails; an unrecognized (or non-string or empty) label is not-evaluated, never a pass.
    if (cls.length === 0 || cls.some(c => labelKind(c) !== 'unexaminable' && !classes.has(c.trim().toLowerCase()))) R['pdg-inventory.class-declared'].raise('fail', at);
    else if (cls.some(c => labelKind(c) === 'unexaminable')) R['pdg-inventory.class-declared'].raise('not-evaluated', at);

    const dp = arr(d.purposes);
    if (dp.length === 0 || !dp.every(p => purposes.has(p))) R['pdg-purpose.purpose-declared'].raise('fail', at);

    if (!Array.isArray(d.fields) || d.fields.length === 0) R['pdg-purpose.field-use-mapped'].raise('not-evaluated', at);
    else d.fields.forEach((f, j) => {
      const refs = isObj(f) ? arr(f.purposeRefs) : [];
      if (!isObj(f) || !str(f.name) || refs.length === 0 || !refs.every(r => dp.includes(r))) R['pdg-purpose.field-use-mapped'].raise('fail', `${at}/fields/${j}`);
    });

    // Basis and risk rules (freeze candidate). A personal dataset without the declaration is not-evaluated (REVIEW_REQUIRED), never a pass.
    // A reference that does not resolve to usable evidence is a fail. Only existence and currency are checked, never legal sufficiency.
    const kinds = cls.map(labelKind);
    if (kinds.includes('unexaminable')) for (const id of BASIS_RISK) R[id].raise('not-evaluated', at);
    if (kinds.includes('personal')) {
      const good = (ref, ruleId) => { const e = evById.get(ref); return !!e && e.ruleId === ruleId && usable(e, d.id); };
      const ruleRef = (ruleId, ref, ptr) => {
        if (ref === undefined) R[ruleId].raise('not-evaluated', ptr);
        else if (!good(ref, ruleId)) R[ruleId].raise('fail', ptr);
      };
      const b = isObj(d.basis) ? d.basis : null, rk = isObj(d.risk) ? d.risk : null;
      ruleRef('pdg-basis.notice-evidenced', b ? b.noticeRef : undefined, `${at}/basis`);
      if (b && b.consentRecordRef !== undefined) ruleRef('pdg-basis.consent-record-evidenced', b.consentRecordRef, `${at}/basis`);
      else if (!b || b.consentNotRelied !== true) R['pdg-basis.consent-record-evidenced'].raise('not-evaluated', `${at}/basis`);
      const wp = b && isObj(b.withdrawalPath) ? b.withdrawalPath : null;
      if (!wp) R['pdg-basis.withdrawal-path-evidenced'].raise('not-evaluated', `${at}/basis`);
      else if (!str(wp.mechanism)) R['pdg-basis.withdrawal-path-evidenced'].raise('fail', `${at}/basis`);
      else ruleRef('pdg-basis.withdrawal-path-evidenced', wp.testEvidenceRef, `${at}/basis`);
      ruleRef('pdg-risk.impact-analysis-evidenced', rk ? rk.impactAnalysisRef : undefined, `${at}/risk`);
      if (!rk || rk.reviewRef === undefined) R['pdg-risk.review-recorded'].raise('not-evaluated', `${at}/risk`);
      else {
        const rv = evById.get(rk.reviewRef);
        if (!(good(rk.reviewRef, 'pdg-risk.review-recorded') && rv.evidence.kind === 'manual' && ['human', 'legal'].includes(rv.producer.kind))) R['pdg-risk.review-recorded'].raise('fail', `${at}/risk`);
      }
      const t = rk ? rk.transferRestrictions : undefined;
      if (!isObj(t)) R['pdg-risk.transfer-restriction-declared'].raise('not-evaluated', `${at}/risk`);
      else if ((t.declared === true || t.statementRef !== undefined) && !(typeof t.statementRef === 'string' && good(t.statementRef, 'pdg-risk.transfer-restriction-declared'))) R['pdg-risk.transfer-restriction-declared'].raise('fail', `${at}/risk`);
    }

    const ret = d.retention;
    if (!isObj(ret)) {
      R['pdg-lifecycle.retention-declared'].raise('fail', at);
      R['pdg-lifecycle.backup-statement'].raise('not-evaluated', at);
      R['pdg-lifecycle.deletion-evidenced'].raise('not-evaluated', at);
      return;
    }
    const periodOk = str(ret.period) && (durationOk(ret.period) || (ret.period === 'indefinite' && granted('pdg-lifecycle.retention-declared', d.id)));
    if (!periodOk || !str(ret.trigger) || !str(ret.mechanism)) R['pdg-lifecycle.retention-declared'].raise('fail', `${at}/retention`);
    if (!str(ret.backupStatement)) R['pdg-lifecycle.backup-statement'].raise('fail', `${at}/retention`);

    const ref = ret.testEvidenceRef;
    if (ref === undefined) R['pdg-lifecycle.deletion-evidenced'].raise('not-evaluated', `${at}/retention`);
    else {
      const e = evById.get(ref);
      const ok = e && e.ruleId === 'pdg-lifecycle.deletion-evidenced' && usable(e, d.id);
      if (!ok) R['pdg-lifecycle.deletion-evidenced'].raise('fail', `${at}/retention`);
    }
  });

  const results = RULE_IDS.map(id => R[id].out());
  if (unknownApplicability) {
    const bad = results.filter(x => x.ruleId.startsWith('pdg-evidence.') && x.status !== 'pass');
    return { gate0: null, verdict: bad.length ? 'FAIL' : 'INDETERMINATE', results: bad, limitations: LIMITATIONS, evaluatedAt: now, note: 'applicability not declared' };
  }
  if (naOk !== null) {
    const structural = results.filter(x => x.ruleId.startsWith('pdg-evidence.')).every(x => x.status === 'pass');
    const classFail = results.some(x => x.ruleId === 'pdg-inventory.class-declared' && x.status === 'fail');
    const contradiction = datasets.length > 0;
    const unrecognized = arr(doc.classes).some(c => labelKind(c) === 'unexaminable') || datasets.some(d => isObj(d) && arr(d.classes).some(c => labelKind(c) === 'unexaminable'));
    return { gate0: null, verdict: !structural || classFail ? 'FAIL' : !naOk || contradiction || unrecognized ? 'REVIEW_REQUIRED' : 'NOT_APPLICABLE', results: structural && !classFail && !contradiction && !unrecognized ? [] : results.filter(x => x.ruleId.startsWith('pdg-evidence.') || (classFail && x.ruleId === 'pdg-inventory.class-declared') || (unrecognized && BASIS_RISK.includes(x.ruleId))), limitations: LIMITATIONS, evaluatedAt: now,
      note: !structural ? 'invalid evidence or exception; not-applicable not accepted' : classFail ? 'class declaration failed; not-applicable not accepted' : !naOk ? 'not-applicable lacks a human attestation' : contradiction ? 'not-applicable contradicts declared datasets' : unrecognized ? 'not-applicable with an unrecognized class label requires review' : 'not-applicable on a declared and attested basis' };
  }
  const verdict = results.some(r => r.status === 'fail') ? 'FAIL'
    : results.some(r => r.status === 'not-evaluated') ? 'REVIEW_REQUIRED' : 'PASS';
  return { gate0: null, verdict, results, limitations: LIMITATIONS, evaluatedAt: now };
}
