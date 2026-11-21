// CLI: node scripts/evaluate.mjs <declarations.json> [--now ISO]
// Exit: 0 PASS/NOT_APPLICABLE, 1 FAIL, 2 refused (Gate 0, no verdict), 3 INDETERMINATE/REVIEW_REQUIRED.
import { readFileSync } from 'node:fs';
import { evaluate } from './lib/evaluate.mjs';
import { isMain } from './lib/util.mjs';

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const ni = args.indexOf('--now');
  const now = ni >= 0 ? args.splice(ni, 2)[1] : undefined;
  if (ni >= 0 && typeof now !== 'string') { console.log(JSON.stringify({ gate0: '--now must be an ISO 8601 UTC timestamp', verdict: null })); process.exit(2); }
  const file = args[0];
  if (!file) { console.error('usage: evaluate.mjs <file> [--now ISO]'); process.exit(2); }
  let doc;
  try { doc = JSON.parse(readFileSync(file, 'utf8')); } catch { console.log(JSON.stringify({ gate0: 'input is not readable JSON', verdict: null })); process.exit(2); }
  const r = evaluate(doc, now ? { now } : {});
  console.log(JSON.stringify(r, null, 2));
  process.exitCode = r.gate0 ? 2 : { PASS: 0, NOT_APPLICABLE: 0, FAIL: 1 }[r.verdict] ?? 3;
}
