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
    COULD_SEE, CORR, FAINTED, FAINTING, GD_EATGOLD, MON_DETACH,
    ROOM, ROOMOFFSET, VAULT,
} from '../js/const.js';
import { unfaint } from '../js/eat.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mondead, mongone } from '../js/mon.js';
import { PM_GUARD } from '../js/monsters.js';
import {
    findgd, gd_move, gd_sound, grddead, in_fcorridor, invault, newegd,
    vault_gd_watching, vault_summon_gd, UnsupportedVaultGuardError,
} from '../js/vault.js';
import {
    place_monster, remove_monster,
} from '../js/monst.js';

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

function guardInCorridor() {
    const gx = game.u.ux + 2;
    const gy = game.u.uy;
    const guard = makeGuard(gx, gy);
    guard.data = game.mons[PM_GUARD];
    place_monster(guard, gx, gy, game);
    const egrd = guard.mextra.egd;
    egrd.fcend = 1;
    egrd.fakecorr[0] = {
        fx: gx,
        fy: gy,
        ftyp: ROOM,
        flags: 0,
    };
    game.level.at(gx, gy).typ = CORR;
    return { guard, gx, gy, egrd };
}

function markHeroInsideVault() {
    game.level.rooms[0].rtype = VAULT;
    game.u.urooms = [ROOMOFFSET, 0, 0, 0, 0];
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

// vault.c:in_fcorridor() (192-201). C scans [fcbeg, fcend), so entries before
// the active begin index and at the end index do not count as corridor tiles.
test('in_fcorridor checks only the active half-open fake-corridor range', () => {
    const grd = { mextra: { egd: {
        fcbeg: 1,
        fcend: 3,
        fakecorr: [
            { fx: 1, fy: 2 },
            { fx: 4, fy: 5 },
            { fx: 6, fy: 7 },
            { fx: 8, fy: 9 },
        ],
    } } };

    assert.equal(in_fcorridor(grd, 1, 2), false, 'before fcbeg');
    assert.equal(in_fcorridor(grd, 4, 5), true, 'at fcbeg');
    assert.equal(in_fcorridor(grd, 6, 7), true, 'before fcend');
    assert.equal(in_fcorridor(grd, 8, 9), false, 'at fcend');
    assert.equal(in_fcorridor(grd, 9, 8), false, 'unlisted square');
});

// vault.c:findgd() (204-234): if no local guard matches, remove the guard
// from gm.migrating_mons, attach it to fmon and use parkguard() at <0,0>.
test('findgd pulls a matching migrating guard onto the level list', async () => {
    await startedGame();
    const guard = makeGuard(game.u.ux + 2, game.u.uy);
    remove_monster(guard.mx, guard.my, game);
    game.level.monlist = guard.nmon;
    guard.mtrack = [];
    guard.mx = 0;
    guard.my = 0;
    guard.nmon = null;
    game.gm.migrating_mons = guard;

    assert.equal(findgd(game), guard);
    assert.equal(game.gm.migrating_mons, null);
    assert.equal(game.level.monlist, guard);
    assert.equal(game.level.monsters[0][0], guard);
    assert.deepEqual([guard.mux, guard.muy], [game.u.ux, game.u.uy]);
});

test('vault_summon_gd and gd_sound follow vault occupancy and guard state', async () => {
    await startedGame();
    markHeroInsideVault();
    game.level.monlist = null;
    game.gm.migrating_mons = null;
    game.u.uinvault = 0;

    vault_summon_gd(game);
    assert.equal(game.u.uinvault, 29,
        'a missing guard starts the countdown at VAULT_GUARD_TIME - 1');
    assert.equal(gd_sound(game), false,
        'vault occupation suppresses footsteps independently of a guard');

    game.u.urooms = [0, 0, 0, 0, 0];
    assert.equal(gd_sound(game), true,
        'an empty level outside a vault permits the guard sound');
});

test('invault wakes a fainted hero when a guard is created', async () => {
    await startedGame();
    const room = game.level.rooms[0];
    game.u.ux = room.lx + 1;
    game.u.uy = room.ly + 1;
    markHeroInsideVault();
    game.level.monlist = null;
    game.gm.migrating_mons = null;
    game.u.uinvault = 29;
    game.multi = -9;
    game.afternmv = unfaint;
    game.u.uhs = FAINTED;
    game.u.usleep = 1;
    game.u.uswallow = 1;
    game.u.ustuck = { data: game.mons[0] };
    const messages = [];
    let guardCreated = false;
    await assert.rejects(invault(game, {
        random: { rn2: () => 0 },
        message: async (line) => messages.push(line),
        makemon_runtime: async (_species, x, y) => {
            const guard = { data: game.mons[PM_GUARD], mx: x, my: y,
                mhp: 12, mhpmax: 12, mpeaceful: 1, mtame: 0,
                mstate: 0, nmon: null, mextra: {} };
            newegd(guard);
            game.level.monlist = guard;
            place_monster(guard, x, y, game);
            guardCreated = true;
            return guard;
        },
    }), /invault\(\) removing guard while hero is swallowed/u);
    assert.equal(guardCreated, true);
    assert.equal(game.multi, 0);
    assert.equal(game.afternmv, null);
    assert.equal(game.u.uhs, FAINTING);
    assert.equal(game.u.usleep, 0);
    assert.ok(messages.includes('You revive.'));
});

test('vault_gd_watching records only visible on-map gold activity', async () => {
    await startedGame();
    const guard = makeGuard(game.u.ux + 1, game.u.uy);
    guard.mcansee = 1;
    place_monster(guard, guard.mx, guard.my, game);
    game.viz_array[guard.my][guard.mx] |= COULD_SEE;

    vault_gd_watching(GD_EATGOLD, game);
    assert.equal(guard.mextra.egd.witness, GD_EATGOLD);
    vault_gd_watching(0x40, game);
    assert.equal(guard.mextra.egd.witness, GD_EATGOLD,
        'unrelated activity does not replace the witness code');
});

// vault.c:grddead() (175-188) retries corridor removal after the dead guard
// is parked away from the fake-corridor square. relobj()'s void effects run
// before the guard is parked.
test('grddead parks a dead guard then removes its fake corridor', async () => {
    await startedGame();
    const { guard: grd, gx, gy, egrd } = guardInCorridor();
    grd.mhp = 0;
    const message = messageCollector();

    const dispose = await grddead(grd, game, {
        message,
        unsupported: (operation) => { throw new Error(operation); },
    });

    assert.equal(dispose, true, 'second corridor clear succeeds');
    assert.equal(grd.isgd, 0, 'guard is eligible for detach');
    assert.equal(grd.mhp, 0, 'dead guard remains dead');
    assert.deepEqual([grd.mx, grd.my], [0, 0], 'guard was parked off-map');
    assert.equal(egrd.fcbeg, 1, 'fake corridor entry consumed');
    assert.equal(game.level.at(gx, gy).typ, ROOM, 'original terrain restored');
});

// mon.c's two active callers both use grddead's return to decide whether the
// guard can leave the monster chain. These exercise the direct production
// call wiring for death and disappearance, including its promise boundary.
test('mondead waits for grddead before detaching a vault guard', async () => {
    await startedGame();
    const { guard, gx, gy, egrd } = guardInCorridor();
    const beforeDied = game.svm.mvitals[PM_GUARD].died;
    const message = messageCollector();

    await mondead(guard, game, {
        message,
        unsupported: (reason) => { throw new Error(reason); },
    });

    assert.equal(guard.isgd, 0, 'grddead permits removal');
    assert.equal(guard.mstate & MON_DETACH, MON_DETACH, 'guard is detached');
    assert.equal(game.level.at(gx, gy).typ, ROOM, 'corridor restored first');
    assert.equal(egrd.fcbeg, 1, 'corridor clear finished before detach');
    assert.equal(game.svm.mvitals[PM_GUARD].died, beforeDied + 1);
    assert.equal(game.level.monsters[0][0], null, 'parked guard was detached');
});

test('mongone waits for grddead before disappearing a vault guard', async () => {
    await startedGame();
    const { guard, gx, gy, egrd } = guardInCorridor();
    const message = messageCollector();

    await mongone(guard, {
        state: game,
        message,
        unsupported: (operation) => { throw new Error(operation); },
    });

    assert.equal(guard.isgd, 0, 'grddead permits removal');
    assert.equal(guard.mstate & MON_DETACH, MON_DETACH, 'guard is detached');
    assert.equal(game.level.at(gx, gy).typ, ROOM, 'corridor restored first');
    assert.equal(egrd.fcbeg, 1, 'corridor clear finished before detach');
    assert.equal(game.level.monsters[0][0], null, 'parked guard was detached');
});

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
    // gd_move_cleanup returns -2 for a dead guard: semi_dead is true so
    // the (!semi_dead && ...) branch at vault.c:863 is skipped (vault.c:865).
    assert.equal(result, -2);
    assert.equal(egrd.gddone, 1,
        'gddone should be set to 1 for a dead guard');

    // Restore room state so other tests are not affected.
    room.rtype = savedRtype;
    room.lx = savedLx; room.hx = savedHx;
    room.ly = savedLy; room.hy = savedHy;
    // Clean up guard from (0,0) if parked there.
    try { remove_monster(0, 0, game); } catch { /* already gone */ }
});

// vault.c:725: wallify_vault uses You_hear for an out-of-sight guard's
// incantation. The line is absent when acoustics are disabled, even though
// the wall restoration itself is still announced.
test('distant vault restoration chant respects acoustics', async () => {
    for (const acoustics of [true, false]) {
        await startedGame();
        game.flags.acoustics = acoustics;
        const grd = makeGuard(10, 10);
        place_monster(grd, 10, 10, game);
        grd.mhp = 0;
        const room = game.level.rooms[0];
        room.rtype = VAULT;
        room.lx = room.hx = 30;
        room.ly = room.hy = 10;
        grd.mextra.egd.vroom = 0;
        // Force one boundary tile to require restoration. Cleanup parks the
        // guard at (0,0), outside both sight and the fake corridor.
        game.level.at(29, 9).typ = ROOM;
        const message = messageCollector();
        assert.equal(await gd_move(grd, {
            state: game, random: fixedRng([]), message,
        }), -2);
        assert.equal(message.messages.includes('You hear a distant chant.'),
            acoustics);
        assert.ok(message.messages.includes(
            "The damaged vault's walls are magically restored!"));
    }
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

// vault.c:854-862: pline() runs before gd_move_cleanup() returns. The live
// tty adapter is asynchronous, so the production cleanup must await it rather
// than letting m_move() continue into later monster turns first.
test('gd_move waits for the cleanup disappearance message', async () => {
    await startedGame();
    // startedGame() deliberately ends on the startup screen; retire that
    // unrelated message window so cleanup's display boundary is isolated.
    game._pending_message = '';
    game.nhDisplay.toplin = 0;
    const grd = makeGuard(game.u.ux + 1, game.u.uy);
    const egrd = grd.mextra.egd;
    egrd.gddone = 1;
    egrd.vroom = 0;
    egrd.fcend = 1;
    egrd.fakecorr[0] = {
        fx: game.u.ux,
        fy: game.u.uy,
        ftyp: game.level.at(game.u.ux, game.u.uy).typ,
        flags: game.level.at(game.u.ux, game.u.uy).flags,
    };
    if (!game.level.rooms[0]) game.level.rooms[0] = {};
    const room = game.level.rooms[0];
    room.rtype = VAULT;
    room.lx = 30; room.hx = 30;
    room.ly = 10; room.hy = 10;

    const messages = [];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const message = async (text) => {
        messages.push(`start:${text}`);
        if (text.endsWith('disappears.')) {
            await gate;
            messages.push(`done:${text}`);
        }
    };
    const pending = gd_move(grd, {
        state: game,
        random: fixedRng([]),
        message,
    });
    // wallify_vault() may finish a source-order migration on an awaited
    // cleanup path before the disappearance pline starts.
    for (let i = 0; i < 10
        && !messages.some((text) => text.endsWith('disappears.'));
        ++i)
        await Promise.resolve();
    assert.match(
        messages.at(-1),
        /^start:Suddenly, the .* disappears\.$/,
        'cleanup should start its disappearance message',
    );

    let settled = false;
    pending.then(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, false,
        'gd_move must not return before ttyPline completes');
    release();
    assert.equal(await pending, 1);
    assert.match(
        messages.at(-1),
        /^done:Suddenly, the .* disappears\.$/,
        'cleanup should complete its disappearance message before returning',
    );
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
