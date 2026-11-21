import { spawnSync } from 'node:child_process';

let bad = 0;
for (const s of ['check-inventory', 'check-provenance', 'check-catalog']) {
  const r = spawnSync(process.execPath, [`scripts/${s}.mjs`], { stdio: 'inherit' });
  if (r.status !== 0) bad = 1;
}
process.exit(bad);
