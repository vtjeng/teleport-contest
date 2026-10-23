// Source-pinned tests for the mkmaze.c fixup-special span.  Expected values
// come from the named C functions, not from recorded sessions.

import assert from 'node:assert/strict';
import {
    copyFileSync,
    constants,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import test from 'node:test';

import {
    COLNO,
    CORR,
    DOOR,
    IRONBARS,
    LAVAWALL,
    MON_BUBBLEMOVE,
    POOL,
    ROOM,
    ROWNO,
    SDOOR,
    STONE,
    VWALL,
    WATER,
    W_NONDIGGABLE,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { MONSTER_TEMPLATES, PM_GIANT_RAT, PM_LONG_WORM } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import {
    baalz_fixup,
    check_ransacked,
    create_maze,
    fixup_special,
    is_solid,
    iswall,
    iswall_or_stone,
    maze_inbounds,
    maze_remove_deadends,
    mazexy,
    movebubbles,
    okay,
} from '../js/mkmaze.js';
import { initworm } from '../js/worm.js';

const C_MKMAZE = readFileSync('nethack-c/upstream/src/mkmaze.c', 'utf8');
const C_SPLEV = readFileSync('nethack-c/upstream/src/sp_lev.c', 'utf8');
const JS_MKMAZE = readFileSync('js/mkmaze.js', 'utf8');
const JS_MKLEV = readFileSync('js/mklev.js', 'utf8');

function sourceBody(source, signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `${signature} is present`);
    return source.slice(start);
}

test('load_special awaits fixup before premapping and leaves room filling to callers', () => {
    const cBody = sourceBody(C_SPLEV, '\nboolean\nload_special(');
    const cFixup = cBody.indexOf('fixup_special();');
    const cPremap = cBody.indexOf('premap_detect();', cFixup);
    assert.ok(cFixup >= 0 && cPremap > cFixup);
    assert.equal(cBody.includes('fill_special_room('), false);

    const jsApi = sourceBody(JS_MKLEV,
        'function createSpecialLevelApi(state) {');
    const jsFinish = jsApi.slice(jsApi.indexOf('async finish() {'),
        jsApi.indexOf('// C ref: sp_lev.c lspo_map(), array form.'));
    const jsFixup = jsFinish.indexOf('await finishFixupSpecial(state);');
    const jsPremap = jsFinish.indexOf('premap_detect(state);', jsFixup);
    assert.ok(jsFixup >= 0 && jsPremap > jsFixup);
    assert.equal(jsFinish.includes('fill_special_room('), false);

    const jsLoader = sourceBody(JS_MKLEV, 'export async function load_special(');
    assert.match(jsLoader, /await specialLevelApi\.finish\(\);/);
    const jsMakelevel = sourceBody(JS_MKLEV, 'async function makelevel(');
    assert.match(jsMakelevel, /await fillSpecialRooms\(\);/);
});

test('mv_bubble waits for mnearto before its zero-result clog and next contents',
    () => {
        const cBody = sourceBody(C_MKMAZE,
            '\nmv_bubble(struct bubble *b, coordxy dx, coordxy dy, boolean ini)');
        const cMove = cBody.indexOf('if (!mnearto(mon, cons->x, cons->y');
        const cClog = cBody.indexOf('elemental_clog(mon);', cMove);
        const cNext = cBody.indexOf('break;', cClog);
        assert.ok(cMove >= 0 && cMove < cClog && cClog < cNext);

        const jsBody = sourceBody(JS_MKMAZE, 'export function mv_bubble(');
        const jsMove = jsBody.indexOf('const moved = await mnearto(');
        const jsClog = jsBody.indexOf(
            'if (!moved) await elemental_clog(contents.list, state);', jsMove,
        );
        const jsNext = jsBody.indexOf('break;', jsClog);
        const jsCollision = jsBody.indexOf('return finishBubble();', jsNext);
        assert.ok(jsMove >= 0 && jsMove < jsClog);
        assert.ok(jsClog < jsNext && jsNext < jsCollision);
        assert.match(jsBody, /if \(!moved\) await elemental_clog\(contents\.list, state\);/);

        const cMoveBubbles = sourceBody(C_MKMAZE, '\nmovebubbles(void)');
        const jsMoveBubbles = sourceBody(JS_MKMAZE,
            'export async function movebubbles(');
        assert.ok(cMoveBubbles.indexOf('mv_bubble(b,') >= 0);
        assert.ok(jsMoveBubbles.indexOf('await mv_bubble(bubble,') >= 0);
    });

function mazeState() {
    const state = resetGame();
    state.level = new GameMap();
    state.u = { uz: { dnum: 1, dlevel: 3 } };
    state.lregions = [];
    return state;
}

test('mkmaze.c movebubbles clears worm wx values before bubble relocation', async () => {
    const state = resetGame();
    // This independent seed only initializes relocation's un-injected
    // tail-position helper; it is not a reference-game seed, and the three
    // movebubbles draws are asserted separately below.
    initRng(610205);
    state.level = new GameMap();
    state.level.monlist = null;
    state.level.traps = [];
    state.mons = MONSTER_TEMPLATES;
    // Water-level identity and the interior bounds make (9,4) and (10,5)
    // valid bubble cells; the hero at (30,10) stays outside the mask.
    state.u = {
        ux: 30,
        uy: 10,
        uz: { dnum: 0, dlevel: 1 },
        uswallow: 0,
        ustuck: null,
    };
    state.water_level = { ...state.u.uz };
    state.waterlevel_bounds = { xmin: 4, ymin: 2, xmax: 77, ymax: 19 };
    // Three stored nodes are two visible tails plus the terminal/head node.
    // The ID 801 and HP 20 only distinguish this independently built worm;
    // neither value selects a special movebubbles branch.
    const worm = newMonster({
        data: state.mons[PM_LONG_WORM],
        mnum: PM_LONG_WORM,
        m_id: 801,
        mhp: 20,
        wormno: 1,
    });
    state.level.monlist = worm;
    place_monster(worm, 11, 5, state);
    initworm(worm, 2, { state });
    const segments = state.level.worms[worm.wormno].segments;
    // These adjacent tail cells and the head at (11,5) give the first set
    // mask bit a worm while the second bit tests that remove_worm cleared all
    // of its occupied squares before the scan reaches that cell.
    segments[0].x = 9;
    segments[0].y = 4;
    segments[1].x = 10;
    segments[1].y = 5;
    state.level.monsters[9][4] = worm;
    state.level.monsters[10][5] = worm;
    const originalY = segments.map(({ y }) => y);
    // C visits columns then rows; 2x2 rows [1,2] set (x=0,y=0) and
    // (x=1,y=1), covering (9,4) and (10,5). The first capture therefore
    // removes the whole worm before the second cell is visited.
    const bubble = {
        x: 9,
        y: 4,
        dx: 0,
        dy: 0,
        mask: { width: 2, height: 2, rows: [1, 2] },
        cons: [],
    };
    state.air_bubbles = [bubble];
    state.air_bubbles_up = false;

    const draws = [];
    const random = (bound) => {
        draws.push(bound);
        if (draws.length === 1) {
            // mkmaze.c collects the monster before drawing movement. C's
            // remove_worm() clears each wx but preserves its wy, and the
            // bubble owns one monster record even when it covered two tails.
            assert.deepEqual(segments.map(({ x }) => x), [0, 0, 0]);
            assert.deepEqual(segments.map(({ y }) => y), originalY);
            assert.deepEqual([9, 10, 11].map((x, i) =>
                state.level.monsters[x][[4, 5, 5][i]]), [null, null, null]);
            assert.equal(bubble.cons.length, 1);
            assert.equal(bubble.cons[0].what, 'monster');
            assert.equal(bubble.cons[0].list, worm);
            assert.ok(worm.mstate & MON_BUBBLEMOVE);
            assert.deepEqual([worm.mx, worm.my], [0, 0]);
        }
        // The first two rn2(3) results are zero, so C's rx/ry expression
        // moves this stationary bubble down-right by (1,1). The later rn2(5)
        // result 1 suppresses a direction reroll. These mappings pin exactly
        // [3,3,5] while leaving tail placement on its independently seeded RNG.
        return bound === 5 ? 1 : 0;
    };

    await movebubbles(state, random);

    assert.deepEqual(draws, [3, 3, 5]);
    assert.deepEqual(bubble.cons, []);
    assert.ok(worm.mx > 0 && worm.my > 0);
    assert.equal(state.level.monsters[worm.mx][worm.my], worm);
    const movedSegments = segments.slice(0, -1);
    for (const segment of movedSegments)
        assert.equal(state.level.monsters[segment.x][segment.y], worm);
});

test('mkmaze.c mv_bubble awaits runtime stacking before releasing Water contents', () => {
    const fixture = '.cache/glob-water-bubble-main-reviewed-qualification-20261019/attempt.mjs';
    const fixtureBytes = readFileSync(fixture);
    assert.equal(fixtureBytes.length, 35594);
    assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'),
        'e44552e6e9bf51945769f29504a3665e945e694aae2b2a1a555f3702d05bd510');

    const evidenceDir = mkdtempSync(join(process.cwd(),
        '.cache/glob-water-bubble-stack-runtime-source-parity-20261019/run-'));
    const childStartedAt = new Date().toISOString();
    const child = spawnSync(process.execPath, [fixture], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });
    const childEndedAt = new Date().toISOString();
    writeFileSync(join(evidenceDir, 'child-stdout.bin'), child.stdout ?? '');
    writeFileSync(join(evidenceDir, 'child-stderr.bin'), child.stderr ?? '');
    const outputLines = (child.stdout ?? '').trim().split(/\r?\n/);
    const summary = outputLines.length ? JSON.parse(outputLines.at(-1)) : null;
    assert.ok(summary?.outputDir, 'child reports its actual receipt directory');
    const childReceiptDir = join(evidenceDir, 'child-receipts');
    mkdirSync(childReceiptDir, { recursive: true });
    const receiptManifest = [];
    for (const name of readdirSync(summary.outputDir).sort()) {
        const source = join(summary.outputDir, name);
        const bytes = readFileSync(source);
        copyFileSync(source, join(childReceiptDir, name), constants.COPYFILE_EXCL);
        receiptManifest.push({ name, bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    const commandRecord = {
        command: [process.execPath, fixture],
        cwd: process.cwd(),
        inheritedEnvironment: true,
        outputDir: summary.outputDir,
        childStartedAt,
        childEndedAt,
        exitCode: child.status,
        signal: child.signal,
        spawnError: child.error ? String(child.error) : null,
        fixtureBytes: fixtureBytes.length,
        fixtureSha256: createHash('sha256').update(fixtureBytes).digest('hex'),
        receiptManifest,
    };
    writeFileSync(join(evidenceDir, 'command-and-capture.json'),
        `${JSON.stringify(commandRecord, null, 2)}\n`, { flag: 'wx' });
    console.log(`Water bubble child evidence: ${evidenceDir}`);

    assert.equal(child.error, undefined, 'fixture process spawned');
    assert.equal(child.signal, null, 'fixture process was not signaled');
    assert.equal(child.status, summary.exitStatus);
    assert.equal(summary.started, true);
    assert.equal(summary.targetCalls, 1, 'selected post-setup movebubbles target ran once');
    assert.equal(summary.handlerRestored, true);
    assert.equal(summary.setupError, null);
    assert.equal(summary.restoreError, null);
    assert.deepEqual(summary.observerErrors, []);
    assert.deepEqual(summary.saveErrors, []);

    const returnReceiptName = receiptManifest.find(({ name }) =>
        /^target-return-or-throw-scalars(?:-\d+)?\.json$/.test(name))?.name;
    const finalCaptureName = receiptManifest.find(({ name }) =>
        /^final-capture(?:-\d+)?\.json$/.test(name))?.name;
    const finalStatusName = receiptManifest.find(({ name }) =>
        /^final-status(?:-\d+)?\.json$/.test(name))?.name;
    assert.ok(returnReceiptName, 'target return or throw scalars were saved');
    assert.ok(finalCaptureName, 'full final state capture was saved');
    assert.ok(finalStatusName, 'final status was saved');
    const returnReceipt = JSON.parse(readFileSync(join(childReceiptDir, returnReceiptName), 'utf8'));
    const targetOutcome = returnReceipt.fields.targetOutcome.fields;
    assert.equal(returnReceipt.fields.targetCalls, 1);
    if (targetOutcome.kind === 'threw') {
        assert.equal(targetOutcome.operation, 'absorbGlob');
        assert.equal(targetOutcome.otyp, 271);
        assert.match(targetOutcome.stack, /stackobj.*finishContents/s);
    }

    // This expected success is deliberately run unchanged against the original
    // source first. The original stack path instead throws absorbGlob/271.
    assert.equal(summary.targetOutcome?.kind, 'returned',
        'Water content relocation completes after the asynchronous glob merge');
    assert.equal(summary.targetError, null);

    const graph = new Map();
    const indexGraph = value => {
        if (!value || typeof value !== 'object') return;
        if (Object.hasOwn(value, 'id')) graph.set(value.id, value);
        for (const childValue of Object.values(value)) indexGraph(childValue);
    };
    const finalCapture = JSON.parse(readFileSync(join(childReceiptDir, finalCaptureName), 'utf8'));
    indexGraph(finalCapture);
    const node = value => value?.ref ? graph.get(value.ref) : value;
    const field = (value, key) => node(node(value)?.fields?.[key]);
    const values = value => node(value)?.array?.map(node) ?? [];
    const scalar = value => {
        const resolved = node(value);
        if (resolved?.tag === 'undefined') return undefined;
        if (resolved?.tag === 'bigint') return BigInt(resolved.value);
        return resolved;
    };
    const after = field(finalCapture, 'afterFinal');
    const hero = field(after, 'hero');
    const refs = field(after, 'refs');
    const bubble = field(after, 'bubble');
    const globs = field(after, 'targetGlobs');
    const first = field(globs, 'first');
    const second = field(globs, 'second');
    const timers = values(field(after, 'timers')).map(row => ({
        argId: scalar(field(row, 'argId')),
        kind: scalar(field(row, 'kind')),
        func_index: scalar(field(row, 'func_index')),
        timeout: scalar(field(row, 'timeout')),
    }));
    const floorGrid = values(field(after, 'floorGrid')).map(cell => ({
        x: scalar(field(cell, 'x')),
        y: scalar(field(cell, 'y')),
        ids: values(field(cell, 'ids')).map(scalar),
    }));
    const levelObjectIds = values(field(after, 'levelObjectIds')).map(scalar);
    const bubbleContents = values(field(bubble, 'cons'));
    const allBubbles = values(field(after, 'waterBubbles'));

    assert.equal(scalar(field(hero, 'hp')), 13);
    assert.equal(scalar(field(hero, 'gameover')), false);
    assert.equal(scalar(field(hero, 'upolyd')), false);
    assert.equal(scalar(field(hero, 'movesEffective')), 1);
    for (const key of ['sameGame', 'sameLiveU', 'sameLevel', 'sameUz', 'sameFloorGrid', 'sameBubbleArray'])
        assert.equal(scalar(field(refs, key)), true, `preserved live reference: ${key}`);
    assert.equal(scalar(field(second, 'o_id')), 172);
    assert.equal(scalar(field(second, 'where')), 1);
    assert.equal(scalar(field(second, 'quan')), 1);
    assert.equal(scalar(field(second, 'owt')), 40);
    assert.equal(scalar(field(second, 'age')), 1);
    assert.equal(scalar(field(second, 'timed')), 1);
    const survivorX = scalar(field(second, 'ox'));
    const survivorY = scalar(field(second, 'oy'));
    assert.deepEqual([survivorX, survivorY],
        [scalar(field(bubble, 'x')), scalar(field(bubble, 'y'))]);
    assert.deepEqual(floorGrid.filter(cell => cell.x === survivorX && cell.y === survivorY)
        .map(cell => cell.ids), [[172]]);
    assert.ok(levelObjectIds.includes(172));
    assert.equal(levelObjectIds.includes(171), false);
    assert.equal(floorGrid.some(cell => cell.ids.includes(171)), false);
    assert.equal(scalar(field(first, 'o_id')), 171);
    assert.equal(scalar(field(first, 'where')), 9);
    assert.equal(scalar(field(first, 'timed')), 0);
    assert.equal(scalar(field(field(first, 'ownerUnion'), 'kind')), 'nobj');
    assert.deepEqual(bubbleContents, []);
    assert.ok(allBubbles.every(item => values(field(item, 'cons')).length === 0));
    assert.deepEqual(timers, [{ argId: 172, kind: 3, func_index: 7, timeout: 27 }]);
});

test('mkmaze.c fixup_special() marks Mine Town before monster setup uses it', async () => {
    const state = mazeState();
    state.specialLevels = [{
        dlevel: { ...state.u.uz },
        flags: { town: true },
    }];

    await fixup_special(state);

    assert.equal(state.level.flags.has_town, true);
    assert.deepEqual(state.lregions, []);
});

test('mkmaze.c iswall() accepts exactly the source wall-join terrain set', () => {
    const state = mazeState();
    const accepted = [VWALL, DOOR, LAVAWALL, WATER, SDOOR, IRONBARS];
    for (const typ of accepted) {
        state.level.at(10, 10).typ = typ;
        assert.equal(iswall(10, 10, state), 1, `terrain ${typ}`);
    }
    for (const typ of [STONE, ROOM]) {
        state.level.at(10, 10).typ = typ;
        assert.equal(iswall(10, 10, state), 0, `terrain ${typ}`);
    }
    assert.equal(iswall(-1, 10, state), 0);
});

test('mkmaze.c iswall_or_stone() treats out-of-bounds as stone', () => {
    const state = mazeState();
    assert.equal(iswall_or_stone(-1, 10, state), 1);
    assert.equal(iswall_or_stone(10, 10, state), 1);
    state.level.at(10, 10).typ = VWALL;
    assert.equal(iswall_or_stone(10, 10, state), 1);
    state.level.at(10, 10).typ = ROOM;
    assert.equal(iswall_or_stone(10, 10, state), 0);
});

test('mkmaze.c is_solid() accepts only stone walls and out-of-bounds', () => {
    const state = mazeState();
    assert.equal(is_solid(-1, 10, state), true);
    assert.equal(is_solid(10, 10, state), true);
    state.level.at(10, 10).typ = VWALL;
    assert.equal(is_solid(10, 10, state), true);
    state.level.at(10, 10).typ = DOOR;
    assert.equal(is_solid(10, 10, state), false);
});

test('mkmaze.c okay() checks the square two cardinal steps away', () => {
    const state = mazeState();
    const bounds = { xMax: 10, yMax: 10 };
    for (const dir of [0, 1, 2, 3])
        assert.equal(okay(5, 5, dir, state, bounds), true);

    state.level.at(7, 5).typ = ROOM;
    assert.equal(okay(5, 5, 1, state, bounds), false);
    assert.equal(okay(3, 3, 0, state, bounds), false);
    assert.equal(okay(9, 9, 2, state, bounds), false);
});

test('mkmaze.c baalz_fixup() consumes markers and resets its protected area', async () => {
    const state = mazeState();
    for (let x = 20; x <= 60; ++x)
        state.level.at(x, Math.trunc(ROWNO / 2)).wall_info = W_NONDIGGABLE;
    for (let y = 3; y <= 17; ++y)
        state.level.at(21, y).wall_info = W_NONDIGGABLE;

    state.level.at(30, 5).typ = POOL;
    state.level.at(30, 15).typ = POOL;
    state.level.at(40, 10).typ = IRONBARS;
    state.level.at(39, 10).wall_info = W_NONDIGGABLE;
    state.level.at(38, 10).wall_info = W_NONDIGGABLE;
    state.level.at(25, 8).typ = VWALL;
    state.level.at(20, 3).typ = VWALL;

    await baalz_fixup(state);

    assert.notEqual(state.level.at(30, 5).typ, POOL);
    assert.notEqual(state.level.at(30, 15).typ, POOL);
    assert.equal(state.level.at(39, 10).wall_info & W_NONDIGGABLE, 0);
    assert.equal(state.level.at(38, 10).wall_info & W_NONDIGGABLE, 0);
    assert.equal(state.level.at(25, 8).typ, VWALL);
    assert.equal(state.level.at(20, 3).typ, STONE);
    assert.deepEqual(state.bughack, {
        inarea: { x1: COLNO, y1: ROWNO, x2: 0, y2: 0 },
        delarea: { x1: COLNO, y1: ROWNO, x2: 0, y2: 0 },
    });
});

test('mkmaze.c check_ransacked() recognizes only minetn-1 in the Mines', () => {
    const state = mazeState();
    state.mines_dnum = 1;
    check_ransacked('minetn-1', state);
    assert.equal(state.ransacked, true);
    check_ransacked('minetn-2', state);
    assert.equal(state.ransacked, false);
    state.u.uz.dnum = 0;
    check_ransacked('minetn-1', state);
    assert.equal(state.ransacked, false);
});

test('mkmaze.c maze_inbounds() uses the source lower and exclusive upper bounds', () => {
    const frame = { xMazeMax: 78, yMazeMax: 20 };
    assert.equal(maze_inbounds(2, 2, frame), true);
    assert.equal(maze_inbounds(1, 2, frame), false);
    assert.equal(maze_inbounds(2, 1, frame), false);
    assert.equal(maze_inbounds(77, 19, frame), true);
    assert.equal(maze_inbounds(78, 19, frame), false);
    assert.equal(maze_inbounds(77, 20, frame), false);
});

test('mkmaze.c maze_remove_deadends() opens one eligible wall toward a corridor', () => {
    const state = mazeState();
    const frame = { xMazeMax: 10, yMazeMax: 10 };
    state.level.at(5, 5).typ = ROOM;
    for (const [x, y] of [[5, 3], [7, 5], [5, 7], [3, 5]])
        state.level.at(x, y).typ = ROOM;

    maze_remove_deadends(ROOM, frame, state, () => 0);

    assert.equal(state.level.at(5, 4).typ, ROOM);
    assert.equal(state.level.at(4, 5).typ, STONE);
});

test('mkmaze.c create_maze() removes dead ends within its reduced bounds', () => {
    // Seed 1 produces two eligible dead ends in this deliberately small map;
    // it tests create_maze() -> maze_remove_deadends() without a session.
    const seed = 1;
    const frame = { xMazeMax: 20, yMazeMax: 12 };
    const runMaze = (removeDeadends) => {
        const state = mazeState();
        state.level.flags.corrmaze = false;
        initRng(seed);
        enableRngLog();
        // BigRM-11 fixes these source settings: corridor width 3, wall 1.
        create_maze(3, 1, removeDeadends, frame, state);
        return [...getRngLog()];
    };

    const withoutDeadends = runMaze(false);
    const withDeadends = runMaze(true);

    assert.deepEqual(withDeadends.slice(0, withoutDeadends.length),
        withoutDeadends);
    // The generated maze has two eligible openings; each C rn2(1) draw
    // chooses the sole direction and proves reduced-bound scanning ran.
    assert.deepEqual(withDeadends.slice(withoutDeadends.length), [
        'rn2(1)=0',
        'rn2(1)=0',
    ]);
});

test('mkmaze.c mazexy() falls back in x-major, then y-major order', () => {
    const state = mazeState();
    state.level.flags.corrmaze = true;
    state.level.at(4, 5).typ = CORR;
    const draws = [];
    const point = mazexy(null, { xMazeMax: 10, yMazeMax: 10 }, state,
        (limit) => {
            draws.push(limit);
            return 1;
        });

    assert.deepEqual(point, { x: 4, y: 5 });
    assert.equal(draws.length, 200);
    assert.ok(draws.every((limit) => limit === 10));
});

// C movebubbles collects from the previous up direction, then reverses it
// for movement. Overlap makes the first collector own a monster once.
for (const up of [false, true]) {
    test('overlapping Water bubbles collect in prior direction ' + up, async () => {
        const state = resetGame();
        initRng(710305);
        state.level = new GameMap();
        state.level.traps = [];
        state.mons = MONSTER_TEMPLATES;
        state.u = { ux: 40, uy: 10, uz: { dnum: 0, dlevel: 1 }, uswallow: 0, ustuck: null };
        state.water_level = { ...state.u.uz };
        state.waterlevel_bounds = { xmin: 4, ymin: 2, xmax: 77, ymax: 19 };
        const monster = newMonster({ data: state.mons[PM_GIANT_RAT],
            mnum: PM_GIANT_RAT, m_id: 901, mhp: 20 });
        state.level.monlist = monster;
        place_monster(monster, 25, 10, state);
        const bubbles = [1, -1].map(dx => ({ x: 25, y: 10, dx, dy: 0,
            mask: { width: 1, height: 1, rows: [1] }, cons: [] }));
        state.air_bubbles = bubbles;
        state.air_bubbles_up = up;
        let draws = 0;
        await movebubbles(state, () => {
            if (draws++ === 0) {
                assert.deepEqual(bubbles.map(b => b.cons.length), up ? [1, 0] : [0, 1]);
                assert.equal(bubbles[up ? 0 : 1].cons[0].list, monster);
                assert.equal(state.level.monsters[25][10], null);
            }
            return 1;
        });
        assert.deepEqual([monster.mx, monster.my], [up ? 26 : 24, 10]);
        assert.equal(state.level.monsters[monster.mx][monster.my], monster);
        assert.ok(bubbles.every(b => b.cons.length === 0));
        assert.equal(state.air_bubbles_up, !up);
    });
}
