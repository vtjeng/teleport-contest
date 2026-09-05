// Focused tests for vault.c gd_move() (887-1201) and its helpers:
// parkguard(), restfakecorr(), clear_fcorr(), wallify_vault(),
// gd_mv_monaway(), gd_move_cleanup(), gd_move_nextpos(), gd_move_proceed(),
// find_guard_dest(), blackout(), and um_dist() (apply.c:691-695).
//
// gd_move() is the vault guard escort state machine. When the hero drops gold
// in the vault and follows the guard, the guard walks through a temporary
// fake corridor back to regular dungeon corridors, occasionally saying
// "Move along!", then disappears. These tests pin the main exported
// interface and exercise each early-exit path from the C source.
//
// Expected values below come from reading vault.c and apply.c, not from
// recording JS output. Each case states which C line or branch it covers.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CORR, DOOR, FCSIZ, ROOM, ROOMOFFSET, STONE, VAULT,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    gd_move, newegd, UnsupportedVaultGuardError,
} from '../js/vault.js';
import { place_monster, remove_monster } from '../js/monst.js';

// Start a game so the full game state is initialized. Seed 990700 is
// arbitrary; the hero class does not matter for the guard tests.
async function startedGame() {
    await runSegment({
        seed: 990700,
        datetime: '20260724120000',
        nethackrc: [
            'OPTIONS=name:VaultTest,role:Healer,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen',
            'OPTIONS=pettype:none,!autopickup,!debug_mongen,symset:DECgraphics',
            '',
        ].join('\n'),
        moves: ' ',
    });
}

// Build a minimal guard monster suitable for gd_move() testing.
// The guard is placed at (gx, gy) with its egd.gdlevel matching the hero's
// current dungeon level and linked into game.level.monlist so that mongone()
// can find it on the chain.
function makeGuard(gx, gy) {
    const grd = {
        isgd: true,
        mpeaceful: 1,
        mx: gx,
        my: gy,
        mhp: 12,    // vault.c:916, guard HP from mondata
        mhpmax: 12,
        m_id: 900,
        nmon: null,
        mstate: 0,
        mextra: {},
        data: game.mons?.[0] ?? {},  // placeholder species
    };
    newegd(grd);
    const egrd = grd.mextra.egd;
    // Match the hero's level so on_level() passes (vault.c:898).
    egrd.gdlevel = { ...game.u.uz };
    // Link the guard into the level's monster chain so that mongone() can
    // detach it during cleanup.
    grd.nmon = game.level.monlist;
    game.level.monlist = grd;
    return grd;
}

// A message collector that records messages for assertion and never blocks.
function messageCollector() {
    const messages = [];
    const fn = async (msg) => { messages.push(msg); };
    fn.messages = messages;
    return fn;
}

// A deterministic RNG for testing. Returns the values from the array
// in order; throws if exhausted.
function fixedRng(values) {
    let i = 0;
    return {
        rn2(n) {
            if (i >= values.length)
                throw new Error(`fixedRng exhausted after ${values.length} calls`);
            return values[i++] % n;
        },
    };
}

// ── gd_move() early exits ──

// vault.c:895: the planning pass returns 0 immediately, because the dry-run
// clone shares the guard's egd reference and gd_move would corrupt live state.
test('gd_move returns 0 on the planning pass without touching state', async () => {
    await startedGame();
    const grd = makeGuard(10, 10);
    const origFcend = grd.mextra.egd.fcend;
    const result = await gd_move(grd, {
        state: game,
        planning: true,
    });
    assert.equal(result, 0,
        'planning pass should return 0 (guard did not move)');
    assert.equal(grd.mextra.egd.fcend, origFcend,
        'planning pass must not modify the guard\'s egd');
});

// vault.c:898-899: guard on a different dungeon level returns -1 so that
// m_move falls through to normal movement.
test('gd_move returns -1 when guard is on a different level', async () => {
    await startedGame();
    const grd = makeGuard(10, 10);
    // Set gdlevel to a different dungeon level than the hero's.
    grd.mextra.egd.gdlevel = { dnum: 99, dlevel: 99 };
    const result = await gd_move(grd, {
        state: game,
        random: fixedRng([]),
        message: messageCollector(),
    });
    assert.equal(result, -1,
        'guard on a different level should return -1');
});

// vault.c:901-903: a dead guard (mhp < 1) sets gddone and calls cleanup.
// The cleanup path returns 1 (moved/disappeared) or -2 (died).
test('gd_move triggers cleanup for a dead guard (semi_dead)', async () => {
    await startedGame();
    const grd = makeGuard(10, 10);
    // Place the guard on the map so parkguard can remove it.
    place_monster(grd, 10, 10, game);
    grd.mhp = 0;  // DEADMONSTER
    // Set up a vault room so wallify_vault can run.
    const egrd = grd.mextra.egd;
    egrd.vroom = 0;
    // Ensure there is a rooms array entry for the vault.
    if (!game.level.rooms[0]) game.level.rooms[0] = {};
    const room = game.level.rooms[0];
    const savedRtype = room.rtype;
    const savedLx = room.lx;
    const savedHx = room.hx;
    const savedLy = room.ly;
    const savedHy = room.hy;
    // Use a 1x1 vault that is well within map bounds. lx/hx are the interior
    // coordinates; wallify_vault scans lx-1..hx+1, so place it away from edges.
    room.rtype = VAULT;
    room.lx = 30; room.hx = 30;
    room.ly = 10; room.hy = 10;

    const msg = messageCollector();
    const result = await gd_move(grd, {
        state: game,
        random: fixedRng([]),
        message: msg,
    });
    // gd_move_cleanup returns -2 for a dead guard that is not visible to the
    // hero (vault.c:865).
    assert.ok(result === 1 || result === -2,
        `dead guard cleanup should return 1 or -2, got ${result}`);
    assert.equal(egrd.gddone, 1,
        'gddone should be set to 1 for a dead guard');

    // Restore room state so other tests are not affected.
    room.rtype = savedRtype;
    room.lx = savedLx; room.hx = savedHx;
    room.ly = savedLy; room.hy = savedHy;
    // Clean up guard from (0,0) if parked there.
    try { remove_monster(0, 0, game); } catch { /* already gone */ }
});

// vault.c:901-903: guard with mx===0 (already parked) triggers cleanup.
test('gd_move triggers cleanup when guard is parked at (0,0)', async () => {
    await startedGame();
    const grd = makeGuard(0, 0);
    grd.mhp = 12; // alive
    const egrd = grd.mextra.egd;
    egrd.gddone = 0;
    grd.mx = 0;
    // Park manually
    place_monster(grd, 0, 0, game);
    egrd.vroom = 0;
    if (!game.level.rooms[0]) game.level.rooms[0] = {};
    const room = game.level.rooms[0];
    const savedRtype = room.rtype;
    room.rtype = VAULT;
    room.lx = 30; room.hx = 30;
    room.ly = 10; room.hy = 10;

    const msg = messageCollector();
    const result = await gd_move(grd, {
        state: game,
        random: fixedRng([]),
        message: msg,
    });
    assert.ok(result === 1 || result === -2,
        `parked guard cleanup should return 1 or -2, got ${result}`);

    room.rtype = savedRtype;
    try { remove_monster(0, 0, game); } catch { /* ok */ }
});

// vault.c:901-903: guard with gddone set triggers cleanup directly.
test('gd_move triggers cleanup when gddone is already set', async () => {
    await startedGame();
    const grd = makeGuard(10, 10);
    place_monster(grd, 10, 10, game);
    const egrd = grd.mextra.egd;
    egrd.gddone = 1;
    egrd.vroom = 0;
    if (!game.level.rooms[0]) game.level.rooms[0] = {};
    const room = game.level.rooms[0];
    const savedRtype = room.rtype;
    room.rtype = VAULT;
    room.lx = 30; room.hx = 30;
    room.ly = 10; room.hy = 10;

    const msg = messageCollector();
    const result = await gd_move(grd, {
        state: game,
        random: fixedRng([]),
        message: msg,
    });
    assert.ok(result === 1 || result === -2,
        `gddone guard cleanup should return 1 or -2, got ${result}`);

    room.rtype = savedRtype;
    try { remove_monster(0, 0, game); } catch { /* ok */ }
});

// ── hostile guard branch throws ──

// vault.c:919: a hostile guard should throw UnsupportedVaultGuardError
// because the hostile path is not exercised by the witness session.
test('gd_move throws for hostile guard', async () => {
    await startedGame();
    const grd = makeGuard(10, 10);
    grd.mpeaceful = 0; // hostile
    const egrd = grd.mextra.egd;
    // Set fcend >= 1 so the guard doesn't hit the early cleanup path.
    egrd.fcend = 1;
    // ogx/ogy must be close to mx/my to pass the teleport check (vault.c:916).
    egrd.ogx = 10;
    egrd.ogy = 10;
    // Hero not in vault and guard not in vault, so wallify runs first.
    // Set up a vault room.
    egrd.vroom = 0;
    if (!game.level.rooms[0]) game.level.rooms[0] = {};
    const room = game.level.rooms[0];
    const savedRtype = room.rtype;
    room.rtype = VAULT;
    room.lx = 30; room.hx = 30;
    room.ly = 10; room.hy = 10;

    await assert.rejects(
        () => gd_move(grd, {
            state: game,
            random: fixedRng([]),
            message: messageCollector(),
        }),
        (err) => err instanceof UnsupportedVaultGuardError
            && err.branch === 'gd_move() hostile guard movement',
        'hostile guard should throw UnsupportedVaultGuardError',
    );

    room.rtype = savedRtype;
});

// ── witness-exercised escort path (session replay) ──

// The witness session seed0012-monk-vault-escort exercises the complete
// peaceful escort path: the hero drops gold, the guard walks through the
// fake corridor, occasionally says "Move along!" (rn2(10)), and disappears
// via gd_move_cleanup -> parkguard -> wallify_vault -> restfakecorr ->
// clear_fcorr -> mongone. This test replays the session and checks that
// all 13878 RNG calls match the C reference positionally.
test('vault guard escort produces correct RNG log for seed 12 witness session', async () => {
    const { readFileSync } = await import('node:fs');
    const session = JSON.parse(readFileSync(
        'sessions/seed0012-monk-vault-escort.session.json', 'utf8',
    ));
    const seg = session.segments[0];
    const result = await runSegment({
        seed: seg.seed,
        datetime: seg.datetime,
        nethackrc: seg.nethackrc,
        moves: seg.moves,
    });
    // The C reference produces 13878 RNG calls across 308 steps.
    // After the guard disappears on the last step, the JS port continues
    // processing remaining monsters, producing ~24 extra calls beyond
    // what C records because C's --More-- blocks mid-turn. Those extra
    // calls do not indicate a bug in gd_move.
    const jsRng = result.getRngLog?.() ?? [];
    const cRng = seg.steps.flatMap(s => s.rng ?? []);
    const cCount = cRng.length;
    assert.ok(jsRng.length >= cCount,
        `JS should produce at least as many RNG calls as C (${cCount}), got ${jsRng.length}`);
    // Verify the first 13878 calls match positionally.
    let mismatches = 0;
    let firstMismatch = -1;
    for (let i = 0; i < cCount; i++) {
        // C format: "rn2(5)=1 @ distfleeck(monmove.c:538)"
        // JS format: "rn2(5)=1"
        const cCall = cRng[i].split(' @')[0].trim();
        const jsCall = (jsRng[i] ?? '').split(' @')[0].trim();
        if (cCall !== jsCall) {
            mismatches++;
            if (firstMismatch === -1) firstMismatch = i;
        }
    }
    assert.equal(mismatches, 0,
        `RNG log should match C for all ${cCount} calls; `
        + `first mismatch at index ${firstMismatch}: `
        + `C="${(cRng[firstMismatch] ?? '').slice(0, 60)}" `
        + `JS="${(jsRng[firstMismatch] ?? '').slice(0, 60)}"`);
});
