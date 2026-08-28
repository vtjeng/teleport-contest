#!/usr/bin/env node

// One-time migration: extract evidence and auditMetrics from QUALITY.json
// passes into QUALITY-evidence.json, then rewrite QUALITY.json without them.

import { existsSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QUALITY_PATH = resolve(REPO_ROOT, 'QUALITY.json');
const HISTORY_PATH = resolve(REPO_ROOT, 'QUALITY-evidence.json');

if (existsSync(HISTORY_PATH)) {
  console.error('QUALITY-evidence.json already exists; migration already ran.');
  process.exit(1);
}

const config = JSON.parse(readFileSync(QUALITY_PATH, 'utf8'));
const history = config.passes.map((pass) => ({ ...pass }));

const stripped = {
  ...config,
  passes: config.passes.map(({ evidence, auditMetrics, ...rest }) => rest),
};

function atomicWrite(path, data) {
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    renameSync(tmp, path);
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}

atomicWrite(HISTORY_PATH, history);
atomicWrite(QUALITY_PATH, stripped);

const origSize = readFileSync(QUALITY_PATH, 'utf8').length;
const histSize = readFileSync(HISTORY_PATH, 'utf8').length;
console.log(`QUALITY.json: ${(origSize / 1024).toFixed(0)} KB`);
console.log(`QUALITY-evidence.json: ${(histSize / 1024).toFixed(0)} KB`);
console.log(`${history.length} passes migrated.`);
