#!/usr/bin/env node

// Generates a self-contained HTML dashboard by injecting data into the template.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const data = execSync('node scripts/dashboard-data.mjs', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

// The divergence queue replays the development sessions, which takes about
// a quarter of a minute when the scan cache misses.
let queueData = '{"sessions":[],"files":[]}';
try {
  queueData = execSync('node scripts/divergence-queue.mjs --json', {
    encoding: 'utf8', timeout: 600000, maxBuffer: 10 * 1024 * 1024,
  });
} catch {
  console.error('Warning: divergence queue unavailable, using an empty queue');
}

const template = readFileSync(join(__dirname, 'dashboard.template.html'), 'utf8');

const html = template
  .replace('/*DATA_PLACEHOLDER*/null', data)
  .replace('/*QUEUE_PLACEHOLDER*/null', queueData.trim());

const outPath = process.argv[2] || 'dashboard.html';
writeFileSync(outPath, html);
console.error('Dashboard written to ' + outPath);
