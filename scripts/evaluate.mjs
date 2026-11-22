// CLI: node scripts/evaluate.mjs <declarations.json> [--now ISO]
// Exit: 0 PASS/NOT_APPLICABLE, 1 FAIL, 2 refused (Gate 0, no verdict), 3 INDETERMINATE/REVIEW_REQUIRED.
// Strict argument handling: unknown options, duplicate flags, a missing value and leftover arguments are refused.
import { readFileSync } from 'node:fs';
import { evaluate } from './lib/evaluate.mjs';
import { isMain } from './lib/util.mjs';

const refuse = msg => { console.log(JSON.stringify({ gate0: msg, verdict: null })); process.exit(2); };

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  let file;
  let opts = {};
  let seenNow = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--now') {
      if (seenNow) refuse('duplicate --now');
      seenNow = true;
      if (i + 1 >= args.length) refuse('--now requires a value');
      opts = { now: args[++i] };
    } else if (a.startsWith('-')) {
      refuse('unknown option');
    } else if (file === undefined) {
      file = a;
    } else {
      refuse('unexpected extra argument');
    }
  }
  if (file === undefined) refuse('usage: evaluate.mjs <file> [--now ISO]');
  let doc;
  try { doc = JSON.parse(readFileSync(file, 'utf8')); } catch { refuse('input is not readable JSON'); }
  const r = evaluate(doc, opts);
  console.log(JSON.stringify(r, null, 2));
  process.exitCode = r.gate0 ? 2 : { PASS: 0, NOT_APPLICABLE: 0, FAIL: 1 }[r.verdict] ?? 3;
}
