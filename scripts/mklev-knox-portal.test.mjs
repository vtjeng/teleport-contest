import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BR_PORTAL, MAGIC_PORTAL } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import { mk_knox_portal } from '../js/mklev.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { t_at } from '../js/trap.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/mklev.c', 'utf8');

function initializedState() {
    resetGame();
    game.level = new GameMap();
    game.u = { uz: { dnum: 0, dlevel: 12 } };
    game.dungeons = [
        { dname: 'The Dungeons of Doom', depth_start: 1 },
        { dname: 'Fort Ludios', depth_start: 30 },
        { dname: 'The Quest', depth_start: 40 },
    ];
    game.n_dgns = game.dungeons.length;
    game.branches = [
        {
            end1: { dnum: game.n_dgns, dlevel: 0 },
            end2: { dnum: 1, dlevel: 1 },
            type: BR_PORTAL,
        },
        {
            end1: { dnum: 0, dlevel: 20 },
            end2: { dnum: 2, dlevel: 1 },
            type: 0,
        },
    ];
    game.knox_level = { dnum: 99, dlevel: 1 };
    game.oracle_level = { dnum: 0, dlevel: 1 };
    game.medusa_level = { dnum: 0, dlevel: 20 };
}

test('mk_knox_portal mirrors the C wizard acceptance branch', () => {
    const start = C_SOURCE.indexOf('mk_knox_portal(coordxy x, coordxy y)');
    const source = C_SOURCE.slice(start, C_SOURCE.indexOf('\n}', start) + 2);
    assert.match(
        source,
        /source->dnum < svn\.n_dgns \|\| \(rn2\(3\) && !wizard\)/,
    );

    initializedState();
    initRng(2); // This seed makes the first rn2(3) return 1 if consumed.
    enableRngLog();
    game.wizard = true;

    mk_knox_portal(20, 10);
    // The accepted witness is D:12, so C replaces the sentinel source with
    // this level before reinserting the branch.
    assert.deepEqual(game.branches[0].end1, { dnum: 0, dlevel: 12 });
    assert.equal(game.branches[0].type, BR_PORTAL);
    assert.equal(game.branches[0].end2.dnum, 1);
    assert.equal(game.branches[0].end2.dlevel, 1);
    assert.equal(game.branches[0].next, game.branches[1]);
    assert.equal(game.svb.branches, game.branches[0]);
    // The supplied coordinates are the vault corner passed by makelevel(),
    // and Fort Ludios is its one-level destination at K:1.
    const portal = t_at(20, 10);
    assert.equal(portal.ttyp, MAGIC_PORTAL);
    assert.deepEqual(portal.dst, { dnum: 1, dlevel: 1 });
    assert.deepEqual(
        getRngLog(),
        ['rn2(3)=1'],
        'wizard mode consumes rn2(3) but ignores its deferral result',
    );
});

test('mk_knox_portal retains the deferral draw for non-wizard play', () => {
    initializedState();
    initRng(2); // The nonzero result defers before any placement path.
    enableRngLog();
    game.wizard = false;

    mk_knox_portal(20, 10);

    assert.deepEqual(getRngLog(), ['rn2(3)=1']);
});
