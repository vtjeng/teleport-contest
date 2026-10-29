import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runDifferential } from '../../../../scripts/diff-fresh.mjs';
import { runSegment } from '../../../../js/jsmain.js';
import { game } from '../../../../js/gstate.js';
import { CONFUSION, BLINDED, DEAF, DISPLACED, TIMEOUT, NORMAL_SPEED } from '../../../../js/const.js';
const base = JSON.parse(readFileSync('recipes/timeout.c/displacement-expiry.session.json'));
const properties = [['confusion', 'g', CONFUSION], ['blindness', 'i', BLINDED], ['deafness', 'j', DEAF], ['displacement', '>e', DISPLACED]];
const out = resolve(process.argv[2]);
mkdirSync(out, { recursive: true });
const matrix = [];
for (let a = 0; a < properties.length; a++) for (let b = a + 1; b < properties.length; b++) {
    for (const counts of [[1, 1], [1, 2], [2, 1]]) matrix.push({ id: `${properties[a][0]}-${properties[b][0]}-${counts.join('-')}`, props: [properties[a], properties[b]], counts });
}
matrix.push({ id: 'all-four-1', props: properties, counts: [1, 1, 1, 1] });
const rows = [];
for (const entry of matrix) {
    const recipe = structuredClone(base);
    const selections = entry.props.map((p, i) => p[1].startsWith('>') ? `>${entry.counts[i]}${p[1].slice(1)}` : `${entry.counts[i]}${p[1]}`).join('');
    recipe.segments[0].moves = `.#wizintrinsic\n${selections}\n    #timeout\n ` + '.     '.repeat(4) + '#timeout\n ';
    recipe.comment = `Public wizard menu interaction ${entry.id}; fixed seed from existing clean displacement control.`;
    const result = await runDifferential(recipe, process.env, { evidenceDir: resolve(out, entry.id) });
    const recording = JSON.parse(readFileSync(resolve(out, entry.id, 'recorded.session.json')));
    const screens = recording.segments[0].steps.map(step => step.screen.replace(/\x1b\[(\d+)C/gu, (_, count) => ' '.repeat(Number(count))).replace(/\x1b\[[0-9;]*m/gu, ''));
    assert.ok(screens.some(screen => screen.includes('No timed properties.')), 'C public timeout display confirms expiry');
    for (let i = 0; i < entry.props.length; i++) {
        const name = { confusion: 'confused', blindness: 'blinded', deafness: 'deafness', displacement: 'displaced' }[entry.props[i][0]];
        assert.ok(screens.some(screen => new RegExp(name + '\\s+' + entry.counts[i] + '(?:\\s|$)').test(screen)), `C timed setup: ${name}`);
    }
    let boundary;
    await runSegment(recipe.segments[0], { onBoundary: e => { boundary = String(e); } });
    const state = { boundary, moves: game.moves, movement: game.u.umovement, properties: entry.props.map(p => ({ name: p[0], intrinsic: game.u.uprops[p[2]].intrinsic })), toplines: game._ttyToplines };
    assert.equal(boundary, undefined);
    for (const p of entry.props) assert.equal(game.u.uprops[p[2]].intrinsic & TIMEOUT, 0);
    assert.ok(state.movement >= NORMAL_SPEED);
    const row = { id: entry.id, counts: entry.counts, state, result };
    rows.push(row);
    writeFileSync(resolve(out, 'results.json'), JSON.stringify(rows, null, 2) + '\n');
    console.log(entry.id, result.passed ? 'PASS' : 'DIFFERENCE', JSON.stringify(result.firstDivergence ?? result.lengths));
}
process.exitCode = rows.every(r => r.result.passed) ? 0 : 1;
