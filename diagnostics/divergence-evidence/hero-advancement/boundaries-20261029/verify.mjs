import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeScreen } from '../../../../frozen/screen-decode.mjs';
import { compareSessionOutputs } from '../../../../scripts/diff-fresh.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const read = path => JSON.parse(gunzipSync(readFileSync(resolve(here, path))));
const expected = {
 control: [1, 2, 3],
 'race-roundtrip': [1, 2, 3, 4, 3, 4],
 'cutoff-roundtrip': [1,2,3,4,5,6,7,8,9,10,11,12,11,12,13],
 'role-roundtrip': [1,2,3,4,5,6,7,6,7],
};
for (const [name, levels] of Object.entries(expected)) {
 const recording = read(`${name}/recorded.session.json.gz`);
 const actual = read(`${name}/js-output.json.gz`);
 const result = compareSessionOutputs(recording, actual);
 assert.equal(result.passed, true, `${name}: complete C/JS parity`);
 const transitions = [], messages = [];
 for (const [step, s] of recording.segments[0].steps.entries()) {
  const rows = decodeScreen(s.screen).map(row => row.map(cell => cell.ch).join('').trimEnd());
  messages.push(rows[0]);
  const status = rows.find(row => /Xp:\d+\//u.test(row));
  if (!status) continue;
  const level = Number(status.match(/Xp:(\d+)\//u)[1]);
  if (level !== transitions.at(-1)?.level) transitions.push({step,level,status});
 }
 assert.deepEqual(transitions.map(row => row.level), levels, `${name}: reached intended transitions`);
 if (name === 'race-roundtrip') {
  assert.equal(messages.filter(x => x.includes('You feel awake!')).length, 2);
  assert.ok(messages.some(x => x.includes('You feel tired!')));
 }
 if (name === 'role-roundtrip') {
  assert.equal(messages.filter(x => x.includes('You feel quick!')).length, 2);
  assert.ok(messages.some(x => x.includes('You feel slow!')));
 }
 console.log(JSON.stringify({name, passed: true, transitions}));
}
