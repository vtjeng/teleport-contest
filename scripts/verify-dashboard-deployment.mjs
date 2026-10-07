#!/usr/bin/env node

// Compare the served page with the exact build, including every saved score and
// queue entry. Never evaluate JavaScript fetched from the public page.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function verifyDeployment({ url, expected, commit, fetchPage = fetch,
  wait = delay, attempts = 6 }) {
  // Six requests with ten-second timeouts and gaps bound CDN propagation waits
  // to roughly 110 seconds, below the workflow step's three-minute watchdog.
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('Expected a full commit SHA');
  const marker = `<meta name="dashboard-commit" content="${commit}">`;
  if (!expected.toString('utf8').includes(marker)) {
    throw new Error('Expected HTML does not identify the requested commit');
  }
  const target = new URL(url);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Expected an HTTP(S) URL');
  // Cache-bust CDN requests without changing the page path.
  target.searchParams.set('dashboard-commit', commit);
  const sha256 = digest(expected);
  let failure;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchPage(target, {
        cache: 'no-store', signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const actual = Buffer.from(await response.arrayBuffer());
      if (digest(actual) !== sha256) throw new Error('Served HTML differs from the expected build');
      return { passed: true, commit, url: target.href, sha256, attempts: attempt };
    } catch (error) {
      failure = error;
      if (attempt < attempts) await wait(10000);
    }
  }
  throw new Error(`Dashboard verification failed after ${attempts} attempts: ${failure.message}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [url, file, commit, ...extra] = process.argv.slice(2);
  if (!url || !file || !commit || extra.length) {
    console.error('Usage: node scripts/verify-dashboard-deployment.mjs <url> <built-html> <full-commit-sha>');
    process.exitCode = 1;
  } else {
    try {
      console.log(JSON.stringify(await verifyDeployment({ url, expected: readFileSync(file), commit })));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
