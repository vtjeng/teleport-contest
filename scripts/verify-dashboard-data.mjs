#!/usr/bin/env node
// Hosted proof that the public packet matches all derived data at its source.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {deriveDashboardData, dashboardPacketBytes} from './write-dashboard-data.mjs';
import {validateDashboardPacket} from './dashboard-packet.mjs';

export function verifyDashboardData(root = process.cwd(), {derive = deriveDashboardData} = {}) {
  const run = (...args) => execFileSync('git', args, {cwd:root, encoding:'utf8'}).trim();
  const head = run('rev-parse', 'HEAD');
  const bytes = readFileSync(`${root}/dashboard-data.json.gz`);
  const packet = validateDashboardPacket(JSON.parse(gunzipSync(bytes)));
  const path = run('diff', '--name-only', packet.sourceSha, head);
  if (path === 'dashboard-data.json.gz') {
    if (run('rev-parse', 'HEAD^') !== packet.sourceSha)
      throw new Error('Dashboard packet must follow its source commit directly');
    const expected = dashboardPacketBytes(derive({root, sourceSha:packet.sourceSha,
      generatedAt:packet.generatedAt}));
    if (!bytes.equals(expected)) throw new Error('Dashboard packet differs from complete source derivation');
    return {status:'current', sourceSha:packet.sourceSha, bytes:bytes.length};
  }
  // Snapshot-only observer reports do not alter accepted score or gameplay
  // data. Their separate dated activity projection is explicitly stale here.
  if (path.split('\n').sort().join('\n') === 'dashboard-data.json.gz\ndashboard-snapshot.json')
    return {status:'stale-snapshot-only', sourceSha:packet.sourceSha, bytes:bytes.length};
  throw new Error(`Dashboard data missing for current publication: ${path}`);
}

if (process.argv[1]?.endsWith('/verify-dashboard-data.mjs')) {
  try {console.log(JSON.stringify(verifyDashboardData()));}
  catch (error) {console.error(error.message); process.exitCode = 1;}
}
