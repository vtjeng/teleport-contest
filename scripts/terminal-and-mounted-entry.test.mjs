import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runJsSession, compareSessionOutputs} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {is_lava} from '../js/dbridge.js';
import {PM_PONY} from '../js/monsters.js';
import {TT_LAVA} from '../js/const.js';

const root = new URL('../', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

test('mixed recursive explosion stops at C terminal boundary despite excluded attribution mismatch', async () => {
    const c = json('experiments/backlog-terminal-lava/recordings/mixed-fire-blind-fatal.session.json');
    const workspace = createScoringWorkspace(root.pathname, []);
    try {
        const result = compareSessionOutputs(c, await runJsSession(c, workspace));
        assert.equal(result.error, null);
        assert.equal(result.rngMismatch, null);
        assert.equal(result.cursorMismatch, null);
        assert.equal(result.animMismatch, null);
        for (const values of Object.values(result.lengths))
            assert.equal(values.c, values.js);
        // This asserts only terminal continuation. It does not certify full
        // screen parity: the retained bad-window exclusion leaves attribution
        // different on the tombstone. The complete failing result is preserved.
    } finally {
        removeScoringWorkspace(workspace);
    }
});

for (const [name, lava] of [['mounted-lava-entry', true], ['mounted-ground-dismount', false]]) {
    test(`native dismount state after ${name}`, async () => {
        const c = json(`recordings/steed/${name}.session.json`);
        const boundaries = [];
        await runSegment(c.segments[0], {onBoundary: error => boundaries.push(error.message)});
        assert.deepEqual(boundaries, []);
        assert.equal(game.u.usteed, null);
        assert.equal(is_lava(game.u.ux, game.u.uy, game), lava);
        if (lava) {
            assert.ok(game.u.utrap > 0);
            assert.equal(game.u.utraptype, TT_LAVA);
        } else {
            assert.equal(game.u.utrap, 0);
        }
        const livingPonies = [];
        for (let m = game.level.monlist; m; m = m.nmon)
            if (m.mnum === PM_PONY && m.mhp > 0) livingPonies.push(m);
        assert.equal(livingPonies.length, lava ? 0 : 1);
    });
}

test('C rechecks the mount after liquid death before moving the hero', () => {
    const c = readFileSync(new URL('nethack-c/upstream/src/steed.c', root), 'utf8');
    const start = c.indexOf('/* [ALI] No need to move the player if the steed died. */');
    assert.ok(start > 0);
    assert.match(c.slice(start, start + 1100), /if \(!DEADMONSTER\(mtmp\)\) \{[\s\S]*?teleds\(cc.x, cc.y, TELEDS_ALLOW_DRAG\)/u);
});
