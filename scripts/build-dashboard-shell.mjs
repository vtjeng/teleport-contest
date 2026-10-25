#!/usr/bin/env node
// Build the stable page. Historical data is supplied by the public packet.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildDashboardShell} from './build-dashboard.mjs';

export function writeDashboardShell(output, root = process.cwd()) {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root, encoding:'utf8'}).trim();
  const template = readFileSync(resolve(root, 'scripts/dashboard.template.html'), 'utf8');
  writeFileSync(resolve(root, output), buildDashboardShell(template, commit));
  return commit;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(writeDashboardShell(process.argv[2] ?? 'dashboard-shell.html'));
}
