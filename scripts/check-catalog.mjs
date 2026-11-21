// Validates rules/*.json against the pdg-* grammar (ADR 0002). An empty or absent catalog is valid.
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readJson, listFiles, isMain, report } from './lib/util.mjs';

export const DOMAINS = ['pdg-inventory', 'pdg-purpose', 'pdg-basis', 'pdg-lifecycle', 'pdg-lineage', 'pdg-risk', 'pdg-telemetry', 'pdg-testdata', 'pdg-evidence'];
export const ID_RE = /^(pdg-[a-z][a-z0-9]*)\.([a-z][a-z0-9]*(-[a-z0-9]+)*)$/;
export const LEVELS = ['required', 'recommended', 'optional', 'forbidden'];
export const ASSURANCE = ['full', 'partial', 'none'];
const COMPLIANCE_WORDING = /compl(y|ies|ied|iant|iance)|conform|satisf|lawful|legally|permitted by law|meets?|adher|certif|approved|in line with|\b(vcdpa|cpa|pipl|appi|nis2|dpdpa|dpa|ukgdpr)\b|\b(gdpr|ccpa|cpra|hipaa|lgpd|pipeda|pdpa|coppa|ferpa|glba|pci|sox)\b/i;

export function checkRules(rules) {
  const errors = [];
  const seen = new Set();
  for (const r of rules) {
    const w = `${r && r._file ? r._file + ': ' : ''}${r && r.id}`;
    const m = typeof (r && r.id) === 'string' ? ID_RE.exec(r.id) : null;
    if (!m) { errors.push(`${w}: id outside pdg-* grammar`); continue; }
    if (!DOMAINS.includes(m[1])) errors.push(`${w}: unknown domain ${m[1]}`);
    if (seen.has(r.id)) errors.push(`${w}: duplicate id`);
    seen.add(r.id);
    if (!LEVELS.includes(r.level)) errors.push(`${w}: bad level`);
    if (!ASSURANCE.includes(r.assurance)) errors.push(`${w}: bad assurance`);
    if (r.criteriaStatus !== 'Proposed') errors.push(`${w}: criteriaStatus must be Proposed (nothing is frozen)`);
    if (typeof r.title !== 'string' || !r.title) errors.push(`${w}: missing title`);
    if (!Array.isArray(r.crossReferences)) errors.push(`${w}: crossReferences must be an array`);
    for (const [k, v] of Object.entries(r)) if (hit(k) || hasLegalWording(v)) errors.push(`${w}: legal-compliance wording is not permitted (field ${k})`);
  }
  return errors;
}

// Best-effort denylist, NOT proof of absence: it scans every string at any depth (also object keys) but only knows listed terms.
// Text is NFKC-normalised and format/zero-width/control characters are removed before matching; cross-script homoglyphs are not folded.
const fold = s => s.normalize('NFKC').replace(new RegExp('['+String.fromCharCode(92)+'p{Cf}'+String.fromCharCode(92)+'p{Cc}]','gu'), '');
const hit = s => COMPLIANCE_WORDING.test(s) || COMPLIANCE_WORDING.test(fold(s));
function hasLegalWording(v, depth = 0) {
  if (depth > 20) return true; // too deep to examine: fail closed
  if (typeof v === 'string') return hit(v);
  if (Array.isArray(v)) return v.some(x => hasLegalWording(x, depth + 1));
  if (v && typeof v === 'object') return Object.entries(v).some(([k, x]) => hit(k) || hasLegalWording(x, depth + 1));
  return false;
}

export function loadCatalog(dir = 'rules') {
  if (!existsSync(dir)) return [];
  // Fail closed: every file under rules/ at any depth must be a lowercase .json catalog file; anything else is an error, not skipped.
  const files = listFiles(dir, []);
  const bad = files.filter(f => !/^[a-z0-9][a-z0-9._-]*[.]json$/.test(f.split('/').pop()) || f.includes('/'));
  if (bad.length) throw new Error('unexpected files under ' + dir + ': ' + bad.join(', ') + ' (only flat lowercase .json files are allowed)');
  return files.flatMap(f => {
    const doc = readJson(dir + '/' + f);
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.rules)) throw new Error(dir + '/' + f + ': rules must be an array');
    return doc.rules.map(r => ({ ...r, _file: f }));
  });
}

if (isMain(import.meta.url)) {
  try { report(checkRules(loadCatalog(fileURLToPath(new URL('../rules', import.meta.url)))), 'catalog ok'); }
  catch (e) { console.error('FAIL: ' + e.message); process.exit(1); }
}
