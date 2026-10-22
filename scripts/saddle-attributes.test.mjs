import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

test('public saddle application uses the worn Dexterity bonus in its success chance', async () => {
  const recording = JSON.parse(readFileSync(new URL('../recordings/steed.c/saddle-effective-dexterity.session.json', import.meta.url)));
  assert.ok(recording.segments[0].steps.some(step => step.screen.includes('Dx:25')));
  assert.ok(recording.segments[0].steps.some(step => step.screen.includes('You put the saddle on the pony.')));
  const replay = await runJsSession(recording, process.cwd());
  assert.equal(compareSessionOutputs(recording, replay).passed, true);
});
