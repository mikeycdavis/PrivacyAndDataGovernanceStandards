// Validates rules/*.json against the pdg-* grammar (ADR 0002). An empty or absent catalog is valid.
import { readdirSync, existsSync } from 'node:fs';
import { readJson, isMain, report } from './lib/util.mjs';

export const DOMAINS = ['pdg-inventory', 'pdg-purpose', 'pdg-basis', 'pdg-lifecycle', 'pdg-lineage', 'pdg-risk', 'pdg-telemetry', 'pdg-testdata', 'pdg-evidence'];
export const ID_RE = /^(pdg-[a-z][a-z0-9]*)\.([a-z][a-z0-9]*(-[a-z0-9]+)*)$/;
export const LEVELS = ['required', 'recommended', 'optional', 'forbidden'];
export const ASSURANCE = ['full', 'partial', 'none'];
const COMPLIANCE_WORDING = /\b(compliant with|gdpr[- ]compliant|ccpa[- ]compliant|hipaa[- ]compliant)\b/i;

export function checkRules(rules) {
  const errors = [];
  const seen = new Set();
  for (const r of rules) {
    const w = `${r && r._file ? r._file + ': ' : ''}${r && r.id}`;
    const m = ID_RE.exec((r && r.id) || '');
    if (!m) { errors.push(`${w}: id outside pdg-* grammar`); continue; }
    if (!DOMAINS.includes(m[1])) errors.push(`${w}: unknown domain ${m[1]}`);
    if (seen.has(r.id)) errors.push(`${w}: duplicate id`);
    seen.add(r.id);
    if (!LEVELS.includes(r.level)) errors.push(`${w}: bad level`);
    if (!ASSURANCE.includes(r.assurance)) errors.push(`${w}: bad assurance`);
    if (r.criteriaStatus !== 'Proposed') errors.push(`${w}: criteriaStatus must be Proposed (nothing is frozen)`);
    if (typeof r.title !== 'string' || !r.title) errors.push(`${w}: missing title`);
    if (!Array.isArray(r.crossReferences)) errors.push(`${w}: crossReferences must be an array`);
    if (COMPLIANCE_WORDING.test(`${r.title} ${r.rationale || ''}`)) errors.push(`${w}: legal-compliance wording is not permitted`);
  }
  return errors;
}

export function loadCatalog(dir = 'rules') {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort().flatMap(f => {
    const doc = readJson(`${dir}/${f}`);
    if (!Array.isArray(doc.rules)) throw new Error(`${dir}/${f}: rules must be an array`);
    return doc.rules.map(r => ({ ...r, _file: f }));
  });
}

if (isMain(import.meta.url)) report(checkRules(loadCatalog()), 'catalog ok');
