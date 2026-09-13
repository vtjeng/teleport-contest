#!/usr/bin/env node

// Generates a self-contained HTML dashboard by injecting data into the template.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// JSON is placed inside a classic script element. Escape characters that can
// be interpreted as markup or JavaScript line terminators at that boundary.
export function escapeJsonForScript(json) {
  return String(json)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function main() {
  const data = execSync('node scripts/dashboard-data.mjs', {
    encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
  });

  // The mismatch queue replays the fixed development workload, which takes about
  // a quarter of a minute when the scan cache misses.
  let queueData = 'null';
  try {
    queueData = execSync('node scripts/mismatch-queue.mjs --json', {
      encoding: 'utf8', timeout: 600000, maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    console.error('Warning: mismatch queue unavailable; completion is unknown');
  }

  const template = readFileSync(join(__dirname, 'dashboard.template.html'), 'utf8');

  const html = template
    .replace('/*DATA_PLACEHOLDER*/null', escapeJsonForScript(data))
    .replace('/*QUEUE_PLACEHOLDER*/null', escapeJsonForScript(queueData.trim()));

  const outPath = process.argv[2] || 'dashboard.html';
  writeFileSync(outPath, html);
  console.error('Dashboard written to ' + outPath);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
