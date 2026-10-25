import assert from 'node:assert/strict';
import test from 'node:test';
import {buildDashboardShell} from './build-dashboard.mjs';
import {DASHBOARD_PACKET_VERSION, validateDashboardPacket} from './dashboard-packet.mjs';
import {dashboardPacketBytes, makeDashboardPacket} from './write-dashboard-data.mjs';
import {fetchDashboardPacket, loadDashboardSnapshot} from './dashboard-loader.js';
import {readFileSync} from 'node:fs';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {verifyDashboardData} from './verify-dashboard-data.mjs';
import {verifyPublicationChanges} from './worker-delivery.mjs';

const sha = 'a'.repeat(40);
const packet = makeDashboardPacket({sourceSha:sha, generatedAt:'2026-10-25T00:00:00.000Z',
  data:{scoreHistory:[], progress:[], scores:{}, challenges:{}, activity:{}, workerReservations:null},
  queue:{status:'ready'}, trial:{manifest:{}, register:{}}});

test('one compressed packet preserves all fields and rejects mixed or incomplete versions', async () => {
  const bytes = dashboardPacketBytes(packet);
  const result = await fetchDashboardPacket(async (url, options) => {
    assert.match(url.href, /dashboard-data\.json\.gz\?at=123/u);
    assert.equal(options.cache, 'no-store');
    return new Response(bytes);
  }, 123);
  assert.deepEqual(result, packet);
  for (const wrong of [{...packet, schemaVersion:DASHBOARD_PACKET_VERSION + 1},
    {...packet, sourceSha:'short'}, {...packet, data:{...packet.data, scoreHistory:null}},
    {...packet, trial:{...packet.trial, buildSha:'b'.repeat(40)}}])
    assert.throws(() => validateDashboardPacket(wrong), /Invalid dashboard data/);
});

test('load reports freshness, stale age and fetch failures without mixing data', async () => {
  const status = {textContent:'', children:[], append(value) {this.children.push(value);}};
  const previous = globalThis.document;
  globalThis.document = {getElementById: () => status,
    createElement: () => ({href:'', textContent:''})};
  try {
    const fetcher = async () => new Response(dashboardPacketBytes(packet));
    assert.deepEqual(await loadDashboardSnapshot(fetcher, Date.parse(packet.generatedAt) + 1000), packet);
    assert.match(status.textContent, /Dashboard data captured/u);
    await loadDashboardSnapshot(fetcher, Date.parse(packet.generatedAt) + 2 * 3600000);
    assert.match(status.textContent, /may be stale/u);
    await assert.rejects(loadDashboardSnapshot(async () => new Response('bad', {status:503})), /HTTP 503/u);
    assert.match(status.textContent, /unavailable.*Reload to retry/u);
  } finally {globalThis.document = previous;}
});

test('stable shell keeps the renderer, CSS and every field bound to one packet', () => {
  const template = readFileSync(new URL('./dashboard.template.html', import.meta.url), 'utf8');
  const shell = buildDashboardShell(template, sha);
  assert.match(shell, /const DATA = snapshot\.data;/u);
  assert.match(shell, /const QUEUE = snapshot\.queue;/u);
  assert.match(shell, /const TRIAL_DATA = snapshot\.trial;/u);
  assert.match(shell, /dashboardDataStatus/u);
  assert.ok(!shell.includes('PLACEHOLDER'));
  assert.ok(shell.includes('<style>') && shell.includes('id="developmentChart"'));
});

test('publication accepts only a checked final packet and rejects altered data', t => {
  const root = mkdtempSync(join(tmpdir(), 'dashboard-publication-'));
  t.after(() => rmSync(root, {recursive:true, force:true}));
  const git = (...args) => execFileSync('git', args, {cwd:root, encoding:'utf8'}).trim();
  git('init', '-qb', 'main');
  git('config', 'user.name', 'Dashboard fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(root, 'source.txt'), 'accepted source\n');
  git('add', 'source.txt'); git('commit', '-qm', 'source');
  const sourceSha = git('rev-parse', 'HEAD');
  const complete = {...packet, sourceSha, trial:{...packet.trial, buildSha:sourceSha}};
  writeFileSync(join(root, 'dashboard-data.json.gz'), dashboardPacketBytes(complete));
  git('add', 'dashboard-data.json.gz'); git('commit', '-qm', 'packet');
  const published = git('rev-parse', 'HEAD');
  verifyPublicationChanges(root, sourceSha, published);
  assert.equal(verifyDashboardData(root, {derive:() => complete}).status, 'current');
  assert.throws(() => verifyDashboardData(root, {derive:() => ({...complete, generatedAt:'2026-10-26T00:00:00.000Z'})}),
    /differs from complete source derivation/u);
  const wrong = {...complete, trial:{...complete.trial, buildSha:'b'.repeat(40)}};
  writeFileSync(join(root, 'dashboard-data.json.gz'), dashboardPacketBytes(complete));
  writeFileSync(join(root, 'source.txt'), 'unvalidated game input\n');
  git('add', 'source.txt'); git('commit', '-qm', 'unvalidated source');
  assert.throws(() => verifyPublicationChanges(root, sourceSha, git('rev-parse', 'HEAD')),
    /dashboard data must be the final data-only report commit/u);
  assert.throws(() => validateDashboardPacket(wrong), /Invalid dashboard data/u);
});
