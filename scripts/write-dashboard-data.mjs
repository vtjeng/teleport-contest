#!/usr/bin/env node
// Generate one complete, compressed dashboard packet from an exact local commit.
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {workerWork} from './worker-backlog.mjs';
import {DASHBOARD_PACKET_VERSION, validateDashboardPacket} from './dashboard-packet.mjs';

export function makeDashboardPacket({data, queue, trial, sourceSha, generatedAt}) {
  const payload = {...data};
  const workQueue = {...queue};
  if (payload.workerReservations) workQueue.workerWork = workerWork(payload.workerReservations, workQueue);
  return validateDashboardPacket({schemaVersion: DASHBOARD_PACKET_VERSION, sourceSha,
    generatedAt, data: payload, queue: workQueue, trial: {...trial, buildSha: sourceSha}});
}

export function dashboardPacketBytes(packet) {
  return gzipSync(Buffer.from(JSON.stringify(validateDashboardPacket(packet))), {level: 9});
}

export function deriveDashboardData({root = process.cwd(), sourceSha, generatedAt}) {
  const run = (bin, args, env = process.env) => execFileSync(bin, args,
    {cwd: root, env, encoding:'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 600000}).trim();
  const env = {...process.env, DASHBOARD_SOURCE_SHA:sourceSha, DASHBOARD_GENERATED_AT:generatedAt};
  const data = JSON.parse(run(process.execPath, ['scripts/dashboard-data.mjs'], env));
  const queue = JSON.parse(run(process.execPath, ['scripts/mismatch-queue.mjs', '--work', '--json']));
  const trial = {builtAt: run('git', ['show', '-s', '--format=%cI', sourceSha]),
    manifest: JSON.parse(readFileSync(resolve(root, 'trial-monitor/manifest.json'))),
    register: JSON.parse(readFileSync(resolve(root, 'trial-monitor/repairs.json')))};
  const packet = makeDashboardPacket({data, queue, trial, sourceSha, generatedAt});
  return packet;
}

export function writeDashboardData(output = 'dashboard-data.json.gz', root = process.cwd()) {
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root, encoding:'utf8'}).trim();
  const generatedAt = new Date().toISOString();
  const packet = deriveDashboardData({root, sourceSha, generatedAt});
  const bytes = dashboardPacketBytes(packet);
  writeFileSync(resolve(root, output), bytes);
  return {sourceSha, generatedAt, bytes: bytes.length};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(writeDashboardData(process.argv[2])));
}
