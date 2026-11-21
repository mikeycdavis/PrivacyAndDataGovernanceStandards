// Validates artifacts/external-standards-provenance.json. Refuses unknown statuses and unhashed OPENED sources.
import { readJson, isMain, report } from './lib/util.mjs';

export const STATUSES = ['OPENED', 'NOT-OPENED', 'ABSTRACT-ONLY', 'INACCESSIBLE', 'PAYWALLED'];

export function checkProvenance(doc) {
  const errors = [];
  if (!doc || !Array.isArray(doc.sources)) return ['sources must be an array'];
  const seen = new Set();
  for (const s of doc.sources) {
    if (s === null || typeof s !== 'object' || Array.isArray(s)) { errors.push('source entry is not an object'); continue; }
    const where = `source ${s.id}`;
    for (const k of ['id', 'title', 'publisher', 'url', 'status', 'retrieved']) {
      if (typeof s[k] !== 'string' || !s[k]) errors.push(`${where}: missing ${k}`);
    }
    if (typeof s.scope !== 'string' || !s.scope) errors.push(`${where}: missing scope`);
    if (!(typeof s.version === 'string' && s.version) && !(typeof s.date === 'string' && s.date)) errors.push(`${where}: missing version or date`);
    if (seen.has(s.id)) errors.push(`${where}: duplicate id`);
    seen.add(s.id);
    if (!STATUSES.includes(s.status)) errors.push(`${where}: unknown status ${s.status}`);
    if (s.status === 'OPENED' && !/^[0-9a-f]{64}$/.test(s.sha256 || '')) errors.push(`${where}: OPENED requires sha256`);
    if (s.status !== 'OPENED' && s.sha256) errors.push(`${where}: only OPENED sources may carry a content hash`);
    if (s.url && !/^https:\/\//.test(s.url)) errors.push(`${where}: url must be https`);
  }
  return errors;
}

if (isMain(import.meta.url)) {
  report(checkProvenance(readJson('artifacts/external-standards-provenance.json')), 'provenance ok');
}
