// Generates schemas/pdg-declarations-0.1.0.schema.json (the single definition of the declaration shape).
// Scope: structure enforced by evaluator Gate 0 only. Rule semantics (reference resolution, dates, hashes, class labels) are NOT expressed here and are judged by the rules.
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const S = { type: 'string' };
const strObj = (props, extra = {}) => ({ type: 'object', additionalProperties: false, properties: props, ...extra });
const strs = (...ks) => Object.fromEntries(ks.map(k => [k, S]));

export function buildSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'pdg-declarations/0.1.0',
    title: 'PDG declarations 0.1.0 (freeze candidate)',
    description: 'Gate 0 structure only. This is not a legal artifact: no law is evaluated and rule semantics are judged by the evaluator. Absence of a finding is not evidence of compliance.',
    type: 'object',
    additionalProperties: false,
    required: ['schema'],
    properties: {
      schema: { const: 'pdg-declarations/0.1.0' },
      applicability: {
        type: 'object', additionalProperties: false,
        properties: { declared: {}, attestation: strObj(strs('by', 'name', 'basis', 'attestedAt')) },
        if: { required: ['declared'], properties: { declared: { const: true } } },
        then: { not: { required: ['attestation'] } },
      },
      classes: { type: 'array', description: 'Vocabulary labels; label recognition is a rule concern (personal, public, internal).' },
      purposes: { type: 'array', items: strObj(strs('id', 'text')) },
      datasets: {
        type: 'array',
        items: strObj({
          ...strs('id', 'owner', 'source'),
          classes: { type: 'array' },
          purposes: { type: 'array', items: S },
          fields: { type: 'array', items: strObj({ name: S, purposeRefs: { type: 'array', items: S } }) },
          retention: strObj(strs('period', 'trigger', 'mechanism', 'backupStatement', 'testEvidenceRef')),
          basis: strObj({
            noticeRef: S, consentRecordRef: S,
            consentNotRelied: { type: 'boolean', description: 'The only waiver of consent-record evidence.' },
            withdrawalPath: strObj(strs('mechanism', 'testEvidenceRef')),
          }),
          risk: strObj({
            impactAnalysisRef: S, reviewRef: S,
            transferRestrictions: strObj({ declared: { type: 'boolean' }, statementRef: S }, { required: ['declared'] }),
          }),
        }),
      },
      evidence: { type: 'array', items: { type: 'object' } },
      exceptions: { type: 'array', items: { type: 'object' } },
    },
  };
}

export const render = () => JSON.stringify(buildSchema(), null, 2) + '\n';
export const sha256 = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = render();
  writeFileSync(`${root}schemas/pdg-declarations-0.1.0.schema.json`, text);
  writeFileSync(`${root}schemas/pdg-declarations-0.1.0.schema.sha256`, `${sha256(text)}  pdg-declarations-0.1.0.schema.json\n`);
  process.stdout.write(`${sha256(text)}\n`);
}
