import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

let bad = 0;
for (const s of ['check-inventory', 'check-provenance', 'check-catalog']) {
  const r = spawnSync(process.execPath, [`${root}scripts/${s}.mjs`], { stdio: 'inherit', cwd: root });
  if (r.status !== 0) bad = 1;
}
process.exit(bad);
