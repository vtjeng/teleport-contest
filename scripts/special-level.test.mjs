import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { newgame_pre_mklev } from '../js/allmain.js';
import { game, resetGame } from '../js/gstate.js';
import { mklev } from '../js/mklev.js';
import { monst_globals_init } from '../js/monsters.js';
import { TIN, EGG, APPLE, CORPSE, STATUE, FIGURINE, objects_globals_init } from '../js/objects.js';
import { PM_CHAMELEON, PM_CAVE_DWELLER, PM_ALIGNED_CLERIC } from '../js/monsters.js';
import { initRng, enableRngLog, getRngLog } from '../js/rng.js';
import { ICE, ICED_POOL, ICED_MOAT, ROOM } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import {
    str2align,
    str2gend,
    str2race,
    str2role,
} from '../js/roles.js';
import { timeout_globals_init } from '../js/timeout.js';

class LoaderDone extends Error {}

test('C map selection excludes skipped cells before callback and frame reset', () => {
    const source = readFileSync('nethack-c/upstream/src/sp_lev.c', 'utf8');
    const map = source.slice(source.indexOf('lspo_map(lua_State *L)\n{'));
    // These source gates precede selection_setpoint, then contents executes
    // before reset_xystart_size and the copied selection is returned.
    assert.match(map, /if \(mptyp == INVALID_TYPE\)[\s\S]*?continue;[\s\S]*?if \(mptyp >= MAX_TYPE\)[\s\S]*?continue;[\s\S]*?selection_setpoint\(x, y, sel, 1\)/u);
    assert.match(map, /nhl_pcall_handle\(L, 1, 0, "lspo_map", NHLpa_panic\);\s*reset_xystart_size\(\);[\s\S]*?l_selection_push_copy\(L, sel\)/u);
});

async function runLoader(body) {
    resetGame();
    objects_globals_init(game);
    monst_globals_init(game);
    timeout_globals_init(game);
    light_globals_init(game);
    initRng(0x5eed);
    game.fixedDatetime = '20400314015926';
    game.recorderIsDst = false;
    game.moves = 0;
    game.plname = 'SpecialLevelTest';
    game.flags = {
        initrole: str2role('Tourist'),
        initrace: str2race('human'),
        initgend: str2gend('female'),
        initalign: str2align('neutral'),
        female: true,
        bones: false,
    };
    game.iflags = {};
    game.u = { uroleplay: {} };
    game.context = { move: 0 };
    await newgame_pre_mklev(game);

    await assert.rejects(
        mklev({
            specialLevelLoader: async (des) => {
                await body(des);
                throw new LoaderDone();
            },
        }),
        (error) => error instanceof LoaderDone,
    );
}

test('special-level API waits for map, room, and region contents callbacks',
    async () => {
        const events = [];
        await runLoader(async (des) => {
            const delayed = () => Promise.resolve().then(() => {});

            const mapResult = des.map({
                map: '...\n...\n...',
                halign: 'center',
                valign: 'center',
                async contents() {
                    events.push('map:start');
                    await delayed();
                    events.push('map:end');
                },
            });
            assert.equal(typeof mapResult.then, 'function');
            assert.equal(des.frame.xsize, 3);
            await mapResult;
            events.push('map:return');

            const roomResult = des.room({
                type: 'ordinary',
                x: 1,
                y: 1,
                w: 3,
                h: 3,
                async contents() {
                    events.push('room:start');
                    await delayed();
                    events.push('room:end');
                },
            });
            assert.equal(typeof roomResult.then, 'function');
            await roomResult;
            events.push('room:return');

            const regionResult = des.region({
                region: [8, 1, 10, 3],
                type: 'ordinary',
                irregular: true,
                async contents() {
                    events.push('region:start');
                    await delayed();
                    events.push('region:end');
                },
            });
            assert.equal(typeof regionResult.then, 'function');
            await regionResult;
            events.push('region:return');
        });

        assert.deepEqual(events, [
            'map:start', 'map:end', 'map:return',
            'room:start', 'room:end', 'room:return',
            'region:start', 'region:end', 'region:return',
        ]);
    });

test('map returns only its own written cells across awaited contents and reset', async () => {
    await runLoader(async (des) => {
        // sp_lev.c:6280–6293: x is transparent; ? is unrecognized. They
        // preserve underlying terrain but do not enter the return selection.
        const x = 10, y = 6;
        game.level.at(x + 1, y).typ = 1; // Stone wall sentinel under x.
        game.level.at(x + 2, y).typ = 1; // Same sentinel under unrecognized ?.
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        let entered = false;
        const pending = des.map({ map: '.x?\n...', x, y,
            async contents() {
                entered = true;
                // This callback changes the transparent square. C's map
                // selection was captured before contents, so it stays absent.
                await des.terrain(1, 0, '.');
                await gate;
            },
        });
        await Promise.resolve();
        assert.equal(entered, true);
        assert.equal(des.frame.xstart, x);
        assert.equal(des.frame.ystart, y);
        release();
        const placed = await pending;
        assert.equal(placed.xstart, x);
        assert.equal(placed.ystart, y);
        assert.equal(placed.xsize, 3); // Source literal width, including skipped cells.
        assert.equal(placed.ysize, 2); // Source literal height.
        assert.equal(placed.selection.absolute, true);
        assert.equal(placed.selection.numpoints(), 4); // One first-row + three second-row writes.
        assert.equal(placed.selection.get(x, y), true);
        assert.equal(placed.selection.get(x + 1, y), false);
        assert.equal(placed.selection.get(x + 2, y), false);
        assert.equal(placed.selection.get(x + 2, y + 1), true);
        assert.equal(des.frame.xstart, 1); // reset_xystart_size: column0 is off limits.
        assert.equal(des.frame.ystart, 0);
        // A later map cannot mutate the earlier returned C selection copy.
        const later = await des.map({ map: '..\n..', x: x + 1, y });
        assert.equal(later.selection.get(x + 1, y), true);
        assert.equal(placed.selection.get(x + 1, y), false);
        assert.equal(placed.selection.numpoints(), 4);
    });
});

test('map return selection clips writes to the C level bounds', async () => {
    await runLoader(async des => {
        // sp_lev.c:6279–6281 stops at min(COLNO,xstart+xsize). The third
        // literal square would be column 80, outside the 80-column map.
        const placed = await des.map({ map: '...', x: 78, y: 10 });
        assert.equal(placed.xsize, 3);
        assert.equal(placed.selection.numpoints(), 2);
        assert.deepEqual(placed.selection.bounds(), { lx: 78, ly: 10, hx: 79, hy: 10 });
    });
});

test('array map returns its nontransparent and valid written selection', async () => {
    await runLoader(async des => {
        // The port's rows adapter implements C's string-form lspo_map.
        // A one-row 3-column fragment has exactly one real source square.
        const placed = await des.map(['.x?']);
        assert.equal(placed.selection.absolute, true);
        assert.equal(placed.selection.numpoints(), 1);
        assert.equal(placed.selection.get(placed.xstart, placed.ystart), true);
        assert.equal(placed.selection.get(placed.xstart + 1, placed.ystart), false);
        assert.equal(placed.selection.get(placed.xstart + 2, placed.ystart), false);
    });
});

test('mines finish_map stores source pool and moat ice flags', async () => {
    const source = readFileSync('nethack-c/upstream/src/mkmap.c', 'utf8');
    assert.match(source, /levl\[x\]\[y\]\.icedpool = icedpools \? ICED_POOL : ICED_MOAT/u);
    for (const icedpools of [false, true]) { // Both source branches share the same cave generator.
        await runLoader(async des => {
            await des.level_init({style:'solidfill', fg:' '});
            if (icedpools) await des.level_flags('icedpools');
            await des.level_init({style:'mines', fg:'.', bg:'I', smoothed:true,
                joined:false, lit:1, walled:false});
            let ice = 0;
            for (let x=1; x<80; ++x) for (let y=0; y<21; ++y) { // mkmap.c whole playable grid.
                const location = game.level.at(x,y);
                if (location.typ === ICE) {
                    ++ice;
                    assert.equal(location.icedpool, icedpools ? ICED_POOL : ICED_MOAT);
                }
            }
            assert.ok(ice > 0); // Source background I must reach the finish-map assignment.
        });
    }
});

test('fixed des.stair forces ROOM before a dungeon-end refusal', async () => {
    const source = readFileSync('nethack-c/upstream/src/mklev.c', 'utf8');
    const stairs = source.slice(source.indexOf('mkstairs(\n'), source.indexOf('/* is room a good one'));
    assert.match(stairs, /if \(force\)\s*levl\[x\]\[y\]\.typ = ROOM;[\s\S]*?if \(dunlev\(&u\.uz\)/u);
    await runLoader(async des => {
        await des.level_init({style:'solidfill', fg:'I'}); // All candidate cells are ice.
        const x = des.frame.xstart + 10, y = des.frame.ystart + 10; // Fixed interior coordinate.
        assert.equal(game.u.uz.dlevel, 1); // Up stairs at a dungeon endpoint are refused.
        await des.stair('up', 10, 10);
        assert.equal(game.level.at(x,y).typ, ROOM); // C force precedes the refusal.
    });
    await runLoader(async des => {
        await des.level_init({style:'solidfill', fg:'I'});
        await des.stair('up'); // Random descriptors pass force=false.
        for (let x=1; x<80; ++x) for (let y=0; y<21; ++y)
            assert.notEqual(game.level.at(x,y).typ, ROOM); // C force=false preserves background ice.
    });
});


test('lspo_object non-species descriptors preserve spe and skip species assignment', async () => {
    const source = readFileSync('nethack-c/upstream/src/sp_lev.c', 'utf8');
    // sp_lev.c:3684–3694 recognizes these tokens case-insensitively; egg's
    // later laid_by_you branch overrides the initial zero at 3720–3721.
    assert.match(source, /tmpobj.corpsenm = NON_PM;\s*tmpobj.spe = !strcmpi\(montype, "spinach"\) \? 1 : 0;\s*nonpmobj = TRUE/u);
    const cases = [
        { id: 'tin', montype: 'SpInAcH', spe: 1 },
        { id: 'tin', montype: 'eMpTy', spe: 0 },
        { id: 'egg', montype: 'EmPtY', laid_by_you: true, spe: 1 },
        { id: 'egg', montype: 'empty', laid_by_you: false, spe: 0 },
    ]; // All accepted non-species arms, including the source's egg override.
    for (const { spe, ...descriptor } of cases) {
        await runLoader(async des => {
            await des.level_init({ style: 'solidfill', fg: '.' });
            const object = await des.object({ ...descriptor, x: 5, y: 5,
                quantity: 2, buc: 'blessed' }); // Source Mon-loca's fixed stack/buc.
            assert.equal(object.otyp, descriptor.id === 'tin' ? TIN : EGG);
            assert.equal(object.spe, spe);
            assert.equal(object.quan, 2);
            assert.equal(object.blessed, true);
            assert.equal(typeof object.corpsenm, 'number'); // Never store token as species.
        });
    }
});


test('lspo_object named montype uses exact C species names without gender RNG', async () => {
    const source = readFileSync('nethack-c/upstream/src/sp_lev.c', 'utf8');
    // sp_lev.c:3701–3710 compares all three source names directly.
    assert.match(source, /!strcmpi\(mons\[i\]\.pmnames\[NEUTRAL\], montype\)/u);
    const names = [
        ['ChAmElEoN', PM_CHAMELEON], // Neutral name; Rog-goal's tin dependency.
        ['cAvEmAn', PM_CAVE_DWELLER], ['cAvEwOmAn', PM_CAVE_DWELLER],
        ['pRiEsT', PM_ALIGNED_CLERIC], ['pRiEsTeSs', PM_ALIGNED_CLERIC],
    ]; // Both gender names resolve without parsing; priest first matches aligned cleric, before role cleric.
    for (const [name, species] of names) {
        let numericDraws;
        await runLoader(async des => {
            await des.level_init({ style: 'solidfill', fg: '.' });
            enableRngLog();
            const object = await des.object({ id: TIN, x: 5, y: 5, montype: species });
            numericDraws = getRngLog();
            assert.equal(object.corpsenm, species);
        });
        await runLoader(async des => {
            await des.level_init({ style: 'solidfill', fg: '.' });
            enableRngLog();
            const object = await des.object({ id: 'tin', x: 5, y: 5, montype: name });
            assert.equal(object.corpsenm, species);
            assert.equal(object.spe, 0); // Source overwrites generated tin spe.
            assert.deepEqual(getRngLog(), numericDraws); // No find_montype gender coin flip.
        });
    }
    for (const invalid of ['a chameleon', '#']) { // Parser aliases and invalid class letters are not species names.
        await runLoader(async des => {
            enableRngLog();
            assert.throws(() => des.object({ id: 'tin', montype: invalid }), /Unknown montype/u);
            assert.deepEqual(getRngLog(), []); // Unknown names fail before creation or a gender draw.
        });
    }
    await runLoader(async des => {
        await des.level_init({ style: 'solidfill', fg: '.' });
        const object = await des.object({ id: 'apple', x: 5, y: 5, montype: 'chameleon' });
        assert.equal(object.otyp, APPLE);
        assert.equal(typeof object.corpsenm, 'number'); // Source ignores montype outside its five types.
    });
});


test('named montype reaches each of the five source object types', async () => {
    for (const [name, id] of [['statue', STATUE], ['egg', EGG], ['corpse', CORPSE],
        ['tin', TIN], ['figurine', FIGURINE]]) { // sp_lev.c:3667–3669 exact restriction.
        await runLoader(async des => {
            await des.level_init({ style: 'solidfill', fg: '.' });
            const object = await des.object({ id: name, x: 5, y: 5, montype: 'ChAmElEoN' });
            assert.equal(object.otyp, id);
            assert.equal(object.corpsenm, PM_CHAMELEON);
            assert.equal(object.spe, 0); // Source default flags/laid_by_you and tin/figurine reset.
        });
    }
});


test('montype type checking consumes the object-id callback once', async () => {
    await runLoader(async des => {
        await des.level_init({ style: 'solidfill', fg: '.' });
        let calls = 0;
        const object = await des.object({ id() { ++calls; return 'apple'; },
            x: 5, y: 5, montype: 'chameleon' });
        assert.equal(object.otyp, APPLE);
        assert.equal(calls, 1); // get_table_objtype calls id once; reuse it before normalization.
    });
});


test('named montype consumes its existing Lua string callback once', async () => {
    await runLoader(async des => {
        await des.level_init({ style: 'solidfill', fg: '.' });
        let calls = 0;
        const object = await des.object({ id: 'tin', x: 5, y: 5,
            montype() { ++calls; return 'ChAmElEoN'; } });
        assert.equal(object.corpsenm, PM_CHAMELEON);
        assert.equal(calls, 1); // C get_table_str_opt invokes this field once.
    });
});
