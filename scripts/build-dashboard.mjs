#!/usr/bin/env node

// Generates a self-contained HTML dashboard by injecting data into the template.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const data = execSync('node scripts/dashboard-data.mjs', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

let pipelineData = '[]';
try {
  pipelineData = execSync('node scripts/pipeline-candidates.mjs --status-json', { encoding: 'utf8', timeout: 30000 });
} catch {
  console.error('Warning: pipeline candidates unavailable, using empty list');
}

const template = readFileSync(join(__dirname, 'dashboard.template.html'), 'utf8');

const html = template
  .replace('/*DATA_PLACEHOLDER*/null', data)
  .replace('/*PIPELINE_PLACEHOLDER*/null', pipelineData.trim());

const outPath = process.argv[2] || 'dashboard.html';
writeFileSync(outPath, html);
console.error('Dashboard written to ' + outPath);
