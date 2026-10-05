import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    COLNO,
    COULD_SEE,
    D_CLOSED,
    DETECT_MONSTERS,
    DOOR,
    DUST,
    FIRE_RES,
    FLYING,
    GP_AVOID_MONPOS,
    GP_ALLOW_U,
    GP_CHECKSCARY,
    HALLUC,
    HALLUC_RES,
    IN_SIGHT,
    LAVAPOOL,
    LEVITATION,
    LR_MONGEN,
    MAX_NUM_WORMS,
    MON_FLOOR,
    MON_MIGRATING,
    OBJ_FLOOR,
    POOL,
    RLOC_MSG,
    RLOC_NOMSG,
    ROOM,
    ROWNO,
    SWIMMING,
    TELEPORT_CONTROL,
    WWALKING,
    OBJ_FREE,
    STONE,
    STRAT_APPEARMSG,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    M2_LORD,
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_LONG_WORM,
    PM_ORCUS,
    PM_JUIBLEX,
    PM_PONY,
    PM_SEWER_RAT,
    PM_WIZARD_OF_YENDOR,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import { POTION_CLASS, POT_WATER, objects_globals_init } from '../js/objects.js';
import { normalizeSession } from '../frozen/session_loader.mjs';
import { InMemoryStorage } from '../js/storage.js';
import {
    add_rect_to_reg,
    add_region,
    create_region,
} from '../js/region.js';
import { mnexto } from '../js/mon.js';
import {
    collect_coords,
    enexto_core,
    goodpos,
    noteleport_level,
    random_teleport_level,
    rloco,
    rloc,
    rloc_to,
    rloc_to_flag,
    scrolltele,
    stairway_find_forwiz,
    tele,
    tele_restrict,
    u_teleport_mon,
} from '../js/teleport.js';
import { planningState } from '../js/unported_monster_actions.js';
import { resetGame } from '../js/gstate.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { BOULDER, ROCK, SCR_SCARE_MONSTER } from '../js/objects.js';
import { newObject, place_object } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';

const C_TELEPORT_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/teleport.c', import.meta.url), 'utf8',
);
const JS_TELEPORT_SOURCE = readFileSync(
    new URL('../js/teleport.js', import.meta.url), 'utf8',
);
const C_MON_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/mon.c', import.meta.url), 'utf8',
);
const JS_MON_SOURCE = readFileSync(
    new URL('../js/mon.js', import.meta.url), 'utf8',
);

function sourceScrolltele(source, start, end) {
    const startIndex = source.indexOf(start);
    assert.notEqual(startIndex, -1, `source contains ${start}`);
    const endIndex = source.indexOf(end, startIndex);
    assert.notEqual(endIndex, -1, `source contains ${end}`);
    return source.slice(startIndex, endIndex);
}

function positionState() {
    const state = {
        astral_level: { dnum: 9, dlevel: 1 },
        dungeons: [{ flags: { hellish: false } }],
        level: new GameMap(),
        moves: 1,
        u: {
            ux: 10,
            uy: 10,
            uz: { dnum: 0, dlevel: 1 },
        },
    };
    monst_globals_init(state);
    reset_mvitals(state);
    objects_globals_init(state);
    state.level.flags.stasis_until = 0;
    return state;
}

// Set up a viz_array where every cell within `radius` squared distance of the
// hero is visible (IN_SIGHT | COULD_SEE). Cells outside that radius have
// neither bit set, so both cansee() and couldsee() return false for them.
function setupVision(state, radiusSq = 10000) {
    const vizArray = [];
    for (let y = 0; y < ROWNO; ++y) {
        const row = new Uint8Array(COLNO);
        for (let x = 0; x < COLNO; ++x) {
            const dx = x - state.u.ux;
            const dy = y - state.u.uy;
            const dist = dx * dx + dy * dy;
            row[x] = dist <= radiusSq ? (IN_SIGHT | COULD_SEE) : 0;
        }
        vizArray.push(row);
    }
    state.viz_array = vizArray;
}

function boundsRandom(result = 0) {
    const bounds = [];
    return {
        random: {
            rn2(bound) {
                bounds.push(bound);
                return result;
            },
        },
        bounds,
    };
}

function descending(from) {
    return Array.from({ length: from - 1 }, (_, index) => from - index);
}

test('decide_to_shapeshift awaits closed-door vampire relocation in C order', () => {
    const cShift = sourceScrolltele(
        C_MON_SOURCE,
        'void\ndecide_to_shapeshift(struct monst *mon)',
        'staticfn int\npickvampshape',
    );
    const jsShift = sourceScrolltele(
        JS_MON_SOURCE,
        'export async function decide_to_shapeshift(',
        '// C ref: were.c counter_were().',
    );

    // C relocates an amorphous shifted vampire before calling newcham(); the
    // async port must finish that same-square change before its form change.
    assert.ok(cShift.indexOf('rloc_to(mon, new_xy.x, new_xy.y)')
        < cShift.indexOf('newcham(mon, ptr, NC_SHOW_MSG)'));
    assert.ok(jsShift.indexOf('await rloc_to(monster, destination.x, destination.y')
        < jsShift.indexOf('await newcham_distress(monster, target, shapeEnv)'));
});

test('scrolltele keeps C discovery and control decisions in source order', () => {
    const cScrolltele = sourceScrolltele(
        C_TELEPORT_SOURCE,
        'void\nscrolltele(struct obj *scroll)',
        '/* the #teleport command;',
    );
    const jsScrolltele = sourceScrolltele(
        JS_TELEPORT_SOURCE,
        'export async function scrolltele(scroll, state = game, rawEnv = {})',
        '// C ref: teleport.c tele()',
    );

    // C discovers a blocked teleport scroll after its refusal message.
    const blockedCheck = cScrolltele.indexOf('noteleport_level(');
    const blockedLearn = cScrolltele.indexOf('learnscroll(scroll)', blockedCheck);
    assert.ok(blockedCheck < blockedLearn);
    assert.ok(blockedLearn < cScrolltele.indexOf('return;', blockedLearn));
    assert.ok(jsScrolltele.indexOf('learnscroll(scroll, state)')
        < jsScrolltele.indexOf('if (!heroBlind(state))'));

    // C lets a wizard override disorientation and treats a blessed scroll as
    // teleport control when the hero is not stunned.
    assert.match(cScrolltele, /!wizard\s*\|\|\s*y_n\("Override\?"\) != 'y'/u);
    assert.match(cScrolltele,
        /Teleport_control\s*\|\|\s*\(scroll\s*&&\s*scroll->blessed\)/u);
    assert.match(jsScrolltele,
        /teleportInput\(env,\s*'y_n',\s*y_n\)[\s\S]*?askYesNo\('Override\?'[\s\S]*?'y'\.charCodeAt\(0\)/u);
    assert.match(jsScrolltele,
        /Teleport_control_prop\(state\)\s*\|\|\s*Boolean\(scroll\?\.blessed\)/u);

    // C learns a controlled scroll after its prompt and before getpos(), then
    // keeps the ordinary fallback learnscroll after an invalid destination.
    const cControlledLearn = cScrolltele.indexOf(
        'learnscroll(scroll)', cScrolltele.indexOf('Where do %s want'),
    );
    const cGetpos = cScrolltele.indexOf('getpos(&cc');
    const jsControlledLearn = jsScrolltele.indexOf(
        'learnscroll(scroll, state)', jsScrolltele.indexOf('`Where do ${whobuf}'),
    );
    const jsGetpos = jsScrolltele.indexOf('await selectPosition(');
    assert.ok(cControlledLearn < cGetpos);
    assert.ok(jsControlledLearn < jsGetpos);
    assert.ok(jsGetpos < jsScrolltele.lastIndexOf('learnscroll(scroll, state)'));
});

test('planned teleport uses its cloned RNG and map redraw seams', async () => {
    // This independently chosen initialized game supplies a real map; the
    // cloned amulet forces C's rn2(3) gate before safe_teleds uses rnd/rn2.
    await runSegment({
        seed: 29,
        datetime: '20420101090000',
        nethackrc: 'OPTIONS=name:PlannedTeleport,role:Valkyrie,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen\n',
        moves: '',
        storage: new InMemoryStorage(),
    });
    const livePosition = { x: game.u.ux, y: game.u.uy };
    const liveCoreContext = structuredClone(game.coreCtx);
    const liveScreen = game.nhDisplay.serialize();
    const planned = planningState(game);
    planned.u.uhave.amulet = true;

    const sourceType = planned.level.at(planned.u.ux, planned.u.uy).typ;
    let destination = null;
    for (let x = 1; x < COLNO && !destination; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const location = planned.level.at(x, y);
            if ((x === planned.u.ux && y === planned.u.uy)
                || location.typ !== sourceType
                || planned.level.monsters[x][y]
                || planned.level.traps.some(
                    (trap) => trap.tx === x && trap.ty === y,
                )
                || !goodpos(x, y, planned.youmonst, 0, { state: planned }))
                continue;
            destination = { x, y };
            break;
        }
    }
    assert.ok(destination, 'the map has a free same-terrain square');

    const randomCalls = [];
    const redrawCalls = [];
    const messages = [];
    await tele(planned, {
        state: planned,
        planning: true,
        random: {
            rn2(bound) {
                randomCalls.push(['rn2', bound]);
                if (bound === 3) return 1; // Decline C's disorientation branch.
                if (bound === ROWNO) return destination.y;
                return 0;
            },
            rnd(bound) {
                randomCalls.push(['rnd', bound]);
                if (bound === COLNO - 1) return destination.x;
                return 1;
            },
            d: () => 1,
        },
        message: async (line) => messages.push(line),
        redraw: (x, y) => redrawCalls.push([x, y]),
        displayRandom: () => 0,
    });

    assert.deepEqual(randomCalls.slice(0, 3), [
        ['rn2', 3],
        ['rnd', COLNO - 1],
        ['rn2', ROWNO],
    ]);
    assert.deepEqual([planned.u.ux, planned.u.uy], [
        destination.x, destination.y,
    ]);
    assert.deepEqual([game.u.ux, game.u.uy], [livePosition.x, livePosition.y]);
    assert.deepEqual(game.coreCtx, liveCoreContext,
        'the planning pass leaves live gameplay RNG unchanged');
    assert.equal(game.nhDisplay.serialize(), liveScreen,
        'the planning redraw seam does not paint the live terminal');
    assert.ok(redrawCalls.length > 0,
        'the cloned teleds path uses the caller-owned redraw seam');
    assert.ok(messages.includes('You materialize in the same location!'),
        'the clone message is captured by its caller-owned message seam');

    // Controlled teleport takes getpos from the same planning environment.
    planned.u.uprops[TELEPORT_CONTROL] = { intrinsic: 1, extrinsic: 0 };
    const controlledMessages = [];
    const selected = { ...livePosition };
    let getposCalls = 0;
    await scrolltele(null, planned, {
        state: planned,
        planning: true,
        random: { rn2: () => 1, rnd: () => 1, d: () => 1 },
        message: async (line) => controlledMessages.push(line),
        getpos: async (coordinate) => {
            getposCalls++;
            coordinate.x = selected.x;
            coordinate.y = selected.y;
            return 0;
        },
        redraw: (x, y) => redrawCalls.push([x, y]),
        displayRandom: () => 0,
    });
    assert.equal(getposCalls, 1);
    assert.ok(controlledMessages.some((line) =>
        line.startsWith('Where do you want to be teleported?')));
    assert.deepEqual([game.u.ux, game.u.uy], [livePosition.x, livePosition.y]);
    assert.deepEqual(game.coreCtx, liveCoreContext);
    assert.equal(game.nhDisplay.serialize(), liveScreen);
});

test('planning relocation records the discarded swallowed-map redraw gap',
    async () => {
        await runSegment({
            seed: 29,
            datetime: '20420101090000',
            nethackrc: 'OPTIONS=name:SwallowedRelocation,role:Valkyrie,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen\n',
            moves: '',
            storage: new InMemoryStorage(),
        });
        const liveScreen = game.nhDisplay.serialize();
        const priorUnported = new Set(game.unported ?? []);
        const state = planningState(game);
        const oldx = state.u.ux + 1;
        const oldy = state.u.uy;
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mnum: PM_SEWER_RAT,
            m_id: 98765,
            mx: oldx,
            my: oldy,
            mhp: 8,
            mhpmax: 8,
        });
        place_monster(monster, oldx, oldy, state);
        state.u.ustuck = monster;
        state.u.uswallow = true;
        let destination = null;
        for (let x = 1; x < COLNO && !destination; ++x) {
            for (let y = 0; y < ROWNO; ++y) {
                if (goodpos(x, y, monster, 0, { state })
                    && !(x === oldx && y === oldy)) {
                    destination = { x, y };
                    break;
                }
            }
        }
        assert.ok(destination);
        const redraws = [];
        const result = rloc_to(monster, destination.x, destination.y, {
            state,
            planning: true,
            random: { rn2: () => 0, rnd: () => 1, d: () => 1 },
            redraw: (x, y) => redraws.push([x, y]),
            message: async () => {},
            setApparxy: () => {},
        });
        if (result && typeof result.then === 'function') await result;

        assert.equal(game.nhDisplay.serialize(), liveScreen,
            'the clone does not call global docrt or paint the live display');
        assert.ok(redraws.length > 0,
            'the clone still performs its owned monster redraws');
        assert.ok(game.unported.has('display.c docrt'),
            'the discarded C redraw is named instead of running live docrt');
        game.unported = priorUnported;
    });

test('wizard can decline scrolltele disorientation after the C rn2(3) gate',
    async () => {
        // Seed 1 makes the next ISAAC draw rn2(3)=0, selecting teleport.c's
        // Amulet disorientation branch. The queued n declines Override? and
        // checks that scrolltele returns before getpos or movement.
        await runSegment({
            seed: 1,
            datetime: '20420101090000',
            nethackrc: 'OPTIONS=name:OverrideCheck,role:Valkyrie,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen\n',
            moves: '',
            storage: new InMemoryStorage(),
        });
        game.wizard = true;
        game.u.uhave.amulet = true;
        clearTtyMessageWindow(game);
        const start = { x: game.u.ux, y: game.u.uy };
        initRng(1);
        enableRngLog();
        game.nhDisplay.pushKey(' '.charCodeAt(0));
        // The first key dismisses the disorientation message page; the next
        // key declines C's Override? prompt.
        game.nhDisplay.pushKey('n'.charCodeAt(0));

        await scrolltele(null, game);

        assert.deepEqual(getRngLog(), ['rn2(3)=0']);
        assert.match(game._ttyToplines, /Override\? \[yn\] \(n\) n/u);
        assert.deepEqual({ x: game.u.ux, y: game.u.uy }, start);
    });

test('collect_coords shuffles every complete interior ring in source order', () => {
    const state = positionState();
    const draws = boundsRandom();
    const coordinates = collect_coords(
        40,
        10,
        3,
        0,
        null,
        { state, random: draws.random },
    );

    assert.equal(coordinates.length, 48);
    assert.deepEqual(draws.bounds, [
        ...descending(8),
        ...descending(16),
        ...descending(24),
    ]);
    assert.deepEqual(coordinates.slice(0, 8), [
        { x: 39, y: 9 }, { x: 40, y: 9 }, { x: 41, y: 9 },
        { x: 39, y: 10 }, { x: 41, y: 10 },
        { x: 39, y: 11 }, { x: 40, y: 11 }, { x: 41, y: 11 },
    ]);
});

test('noteleport_level applies natural levels and stasis in source order', () => {
    const state = positionState();
    const ordinary = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
    });
    const covetous = newMonster({
        data: state.mons[PM_WIZARD_OF_YENDOR],
        mhp: 1,
    });

    state.level.flags.noteleport = true;
    assert.equal(noteleport_level(ordinary, state), true);
    assert.equal(noteleport_level(covetous, state), false);

    state.level.flags.stasis_until = state.moves;
    assert.equal(noteleport_level(covetous, state), true);
});

test('tele_restrict returns the C block result and only messages when seen', async () => {
    const cHelper = sourceScrolltele(
        C_TELEPORT_SOURCE,
        'boolean\ntele_restrict(struct monst *mon)',
        'void\nmtele_trap(struct monst *mtmp, struct trap *trap, int in_sight)',
    );
    const jsHelper = sourceScrolltele(
        JS_TELEPORT_SOURCE,
        'export async function tele_restrict(mon, state = game, rawEnv = {})',
        '// C ref: teleport.c teleport_pet()',
    );
    assert.match(cHelper,
        /if \(noteleport_level\(mon\)\)[\s\S]*?if \(canseemon\(mon\)\)[\s\S]*?pline\([\s\S]*?return TRUE;[\s\S]*?return FALSE;/u);
    assert.match(jsHelper,
        /if \(noteleport_level\(mon, state\)\)[\s\S]*?if \(canseemon\(mon, state\)\)[\s\S]*?await message\([\s\S]*?return true;[\s\S]*?return false;/u);

    const state = positionState();
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 4,
        mhpmax: 4,
        m_id: 120, // Unique id for this direct teleport-restriction fixture.
        mcansee: true,
        mx: 10,
        my: 11,
    });
    state.level.at(10, 11).typ = ROOM;
    place_monster(monster, 10, 11, state);
    state.level.flags.noteleport = true;
    setupVision(state);

    const messages = [];
    const env = { message: async (line) => messages.push(line) };
    assert.equal(await tele_restrict(monster, state, env), true);
    assert.deepEqual(messages, [
        'A mysterious force prevents the sewer rat from teleporting!',
    ]);

    // Keep the same source block but remove sight to exercise C's silent gate.
    setupVision(state, 0);
    messages.length = 0;
    assert.equal(await tele_restrict(monster, state, env), true);
    assert.deepEqual(messages, []);

    // A visible monster on a level without either C restriction returns false.
    setupVision(state);
    state.level.flags.noteleport = false;
    assert.equal(await tele_restrict(monster, state, env), false);
    assert.deepEqual(messages, []);
});

test('mtele_trap uses the canonical RLOC_MSG relocation caller', () => {
    const cTrap = sourceScrolltele(
        C_TELEPORT_SOURCE,
        'void\nmtele_trap(struct monst *mtmp, struct trap *trap, int in_sight)',
        'int\nmlevel_tele_trap(',
    );
    const jsTrap = sourceScrolltele(
        JS_TELEPORT_SOURCE,
        'export async function mtele_trap(',
        '// C ref: teleport.c mlevel_tele_trap()',
    );
    assert.match(cTrap,
        /rloc_to_core\(mtmp, trap->teledest\.x, trap->teledest\.y,\s*RLOC_MSG\)/u);
    assert.match(jsTrap,
        /await rloc_to_flag\([\s\S]*?destinationX,[\s\S]*?destinationY,\s*RLOC_MSG,\s*env,\s*\)/u);
    assert.doesNotMatch(jsTrap, /relocateToFixedDestination/u);
});

test('level_tele evaluates next_to_u before a forced wizard destination', () => {
    // teleport.c:1304 uses !next_to_u() && !force_dest. Since && evaluates
    // left to right, companion scanning runs even when force_dest is true.
    assert.match(
        C_TELEPORT_SOURCE,
        /if\s*\(!next_to_u\(\)\s*&&\s*!force_dest\)/u,
    );
    assert.match(
        JS_TELEPORT_SOURCE,
        /if\s*\(!next_to_u\(state\)\s*&&\s*!force_dest\)/u,
    );
});

test('rloco moves a floor object after its source-ordered destination draws', async () => {
    const state = positionState();
    state.level.at(12, 10).typ = ROOM;
    state.level.at(14, 10).typ = ROOM;
    const obj = newObject({
        otyp: POT_WATER,
        oclass: POTION_CLASS,
        quan: 1,
        where: OBJ_FREE,
    });
    place_object(obj, 12, 10, objectGenerationEnv({ state }));
    const calls = [];
    const random = {
        rn1(bound, offset) {
            calls.push(['rn1', bound, offset]);
            return 14;
        },
        rn2(bound) {
            calls.push(['rn2', bound]);
            return 10;
        },
    };

    assert.equal(await rloco(obj, {
        state,
        random,
        redraw() {},
    }), true);
    assert.deepEqual(calls, [['rn1', COLNO - 3, 2], ['rn2', ROWNO]]);
    assert.deepEqual([obj.where, obj.ox, obj.oy], [OBJ_FLOOR, 14, 10]);
    assert.equal(state.level.objects[12][10], null);
    assert.equal(state.level.objects[14][10], obj);
});

test('noteleport_level counts only living on-map demon-court blockers', () => {
    // C teleport.c:m_blocks_teleporting() blocks both M2_LORD and M2_PRINCE.
    const cBlocker = sourceScrolltele(
        C_TELEPORT_SOURCE,
        'staticfn boolean\nm_blocks_teleporting(struct monst *mtmp)',
        '\n/* teleporting is prevented',
    );
    assert.match(
        cBlocker,
        /is_dlord\(mtmp->data\)\s*\|\|\s*is_dprince\(mtmp->data\)/u,
    );
    const cNoteleport = sourceScrolltele(
        C_TELEPORT_SOURCE,
        'boolean\nnoteleport_level(struct monst *mon)',
        '\n/* this is an approximation',
    );
    const jsPredicate = sourceScrolltele(
        JS_TELEPORT_SOURCE,
        'function m_blocks_teleporting(monster)',
        '\n// C ref: teleport.c noteleport_level()',
    );
    const jsNoteleport = sourceScrolltele(
        JS_TELEPORT_SOURCE,
        'export function noteleport_level(monster, state = game)',
        '\nfunction monsterTeleportOperation',
    );
    assert.match(cNoteleport,
        /In_hell\(&u\.uz\)[\s\S]*get_iter_mons\(m_blocks_teleporting\)/u);
    assert.match(jsPredicate,
        /is_dlord\(monster\.data\)\s*\|\|\s*is_dprince\(monster\.data\)/u);
    assert.match(jsNoteleport,
        /get_iter_mons\(m_blocks_teleporting, state\)/u);
    assert.ok(jsNoteleport.indexOf('get_iter_mons(m_blocks_teleporting, state)')
        < jsNoteleport.indexOf('state.level?.flags?.noteleport'));
    assert.ok(jsNoteleport.indexOf('state.level?.flags?.noteleport')
        < jsNoteleport.indexOf('stasis_until'));

    const state = positionState();
    state.dungeons[0].flags.hellish = true;
    const ordinary = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
    });
    const prince = newMonster({
        data: state.mons[PM_ORCUS],
        mhp: 0,
        mstate: MON_FLOOR,
    });
    state.level.monlist = prince;

    assert.equal(noteleport_level(ordinary, state), false);
    prince.mhp = 1;
    prince.mstate = MON_MIGRATING;
    assert.equal(noteleport_level(ordinary, state), false);
    prince.mstate = MON_FLOOR;
    assert.equal(noteleport_level(ordinary, state), true);
    assert.equal(noteleport_level(prince, state), false);

    // C teleport.c:m_blocks_teleporting() has a separate M2_LORD arm. Juiblex
    // is selected here because Asmodeus is M2_PRINCE, like the Orcus above.
    const lord = newMonster({
        data: state.mons[PM_JUIBLEX],
        mhp: 1, // A living demon is needed for get_iter_mons() to retain it.
        mstate: MON_FLOOR, // Keep the lord on-map for the court scan.
    });
    assert.notEqual(lord.data.mflags2 & M2_LORD, 0);
    state.level.monlist = lord;
    assert.equal(noteleport_level(ordinary, state), true);
    assert.equal(noteleport_level(lord, state), false);
});

test('rloc enforces inclusive down and up destination bounds', () => {
    // C teleport.c:tele_jump_ok() compares both source and target with the
    // inclusive dndest/updest boxes. Drive it through rloc_pos_ok() so these
    // private checks remain tested at their production caller.
    const cStart = C_TELEPORT_SOURCE.indexOf(
        'staticfn boolean\ntele_jump_ok(coordxy x1, coordxy y1, coordxy x2, coordxy y2)',
    );
    const cEnd = C_TELEPORT_SOURCE.indexOf(
        '\nstaticfn boolean\nteleok(', cStart,
    );
    assert.notEqual(cStart, -1);
    assert.notEqual(cEnd, -1);
    const cTeleJump = C_TELEPORT_SOURCE.slice(cStart, cEnd);
    assert.match(cTeleJump, /svd\.dndest\.nlx/u);
    assert.match(cTeleJump, /svu\.updest\.nlx/u);
    assert.match(cTeleJump, /within_bounded_area\(/u);

    const jsStart = JS_TELEPORT_SOURCE.indexOf('function tele_jump_ok(');
    const jsEnd = JS_TELEPORT_SOURCE.indexOf(
        '\n\n// C ref: teleport.c rloc_pos_ok()', jsStart,
    );
    assert.notEqual(jsStart, -1);
    assert.notEqual(jsEnd, -1);
    const jsTeleJump = JS_TELEPORT_SOURCE.slice(jsStart, jsEnd);
    assert.match(jsTeleJump, /state\.dndest/u);
    assert.match(jsTeleJump, /state\.updest/u);
    assert.match(jsTeleJump, /wasInside !== isInside/u);

    const run = ({ boundsName, start, candidates }) => {
        const state = positionState();
        // The 30..40 by 4..12 rectangle is an ordinary room-sized test box;
        // these endpoints pin the source's inclusive lower and upper edges.
        state[boundsName] = { nlx: 30, nly: 4, nhx: 40, nhy: 12 };
        const points = [start, ...candidates];
        for (const [x, y] of points) state.level.at(x, y).typ = ROOM;
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 2, // A live monster is required by the coordinate index.
            mhpmax: 2,
            m_id: 92, // A nonzero id exercises the live-monster position path.
        });
        place_monster(monster, start[0], start[1], state);
        const draws = [];
        let candidateIndex = 0;
        const relocated = rloc(monster, 0, {
            state,
            random: {
                rnd(bound) {
                    assert.equal(bound, COLNO - 1);
                    const x = candidates[candidateIndex][0];
                    draws.push(['rnd', bound, x]);
                    return x;
                },
                rn2(bound) {
                    assert.equal(bound, ROWNO);
                    const y = candidates[candidateIndex][1];
                    draws.push(['rn2', bound, y]);
                    candidateIndex += 1;
                    return y;
                },
            },
            newsym: () => {},
            onscary: () => false,
            setApparxy: () => {},
        });
        return { relocated, monster, draws };
    };

    // The source begins on dndest's lower corner. It rejects an outside
    // point, then permits the opposite upper corner because it stays inside.
    const down = run({
        boundsName: 'dndest',
        start: [30, 4],
        candidates: [[12, 9], [40, 12]],
    });
    assert.equal(down.relocated, true);
    assert.deepEqual([down.monster.mx, down.monster.my], [40, 12]);
    assert.deepEqual(down.draws, [
        ['rnd', COLNO - 1, 12], ['rn2', ROWNO, 9],
        ['rnd', COLNO - 1, 40], ['rn2', ROWNO, 12],
    ]);

    // The source starts outside updest. Its upper corner is inside and is
    // rejected; the second outside point remains on the starting side.
    const up = run({
        boundsName: 'updest',
        start: [12, 9],
        candidates: [[40, 12], [13, 9]],
    });
    assert.equal(up.relocated, true);
    assert.deepEqual([up.monster.mx, up.monster.my], [13, 9]);
    assert.deepEqual(up.draws, [
        ['rnd', COLNO - 1, 40], ['rn2', ROWNO, 12],
        ['rnd', COLNO - 1, 13], ['rn2', ROWNO, 9],
    ]);
});

test('collect_coords clips edge rings before deriving shuffle bounds', () => {
    const state = positionState();
    const draws = boundsRandom();
    const coordinates = collect_coords(
        3,
        2,
        3,
        0,
        null,
        { state, random: draws.random },
    );

    assert.equal(coordinates.length, 35);
    assert.deepEqual(draws.bounds, [
        ...descending(8),
        ...descending(16),
        ...descending(11),
    ]);
});

test('enexto_core finishes all nearby shuffles before selecting first good spot', () => {
    const state = positionState();
    state.level.at(9, 9).typ = ROOM;
    state.level.at(10, 9).typ = ROOM;
    const firstDraws = boundsRandom();
    assert.deepEqual(
        enexto_core(10, 10, state.mons[PM_LITTLE_DOG], 0, {
            state,
            random: firstDraws.random,
        }),
        { x: 9, y: 9 },
    );
    assert.equal(firstDraws.bounds.length, 45);

    const blocker = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
        mhpmax: 1,
        m_id: 20,
    });
    place_monster(blocker, 9, 9, state);
    const secondDraws = boundsRandom();
    assert.deepEqual(
        enexto_core(10, 10, state.mons[PM_LITTLE_DOG], 0, {
            state,
            random: secondDraws.random,
        }),
        { x: 10, y: 9 },
    );
    assert.deepEqual(secondDraws.bounds, firstDraws.bounds);
});

test('goodpos applies startup pet terrain, occupant, object, and scary checks', () => {
    for (const pettype of [PM_LITTLE_DOG, PM_KITTEN, PM_PONY]) {
        const state = positionState();
        const x = 12;
        const y = 10;
        const location = state.level.at(x, y);
        const fake = {
            data: state.mons[pettype],
            m_id: 0,
            mundetected: false,
            wormno: 0,
        };
        const env = { state, random: { rn2: () => 0 } };
        const flags = GP_CHECKSCARY | GP_AVOID_MONPOS;

        location.typ = ROOM;
        assert.equal(goodpos(x, y, fake, flags, env), true);
        assert.equal(goodpos(state.u.ux, state.u.uy, fake, flags, env), false);

        const blocker = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 1,
            mhpmax: 1,
            m_id: 40,
        });
        place_monster(blocker, x, y, state);
        assert.equal(goodpos(x, y, fake, flags, env), false);
        state.level.monsters[x][y] = null;

        for (const typ of [STONE, POOL, LAVAPOOL]) {
            location.typ = typ;
            assert.equal(goodpos(x, y, fake, flags, env), false);
        }
        location.typ = DOOR;
        location.flags = D_CLOSED;
        assert.equal(goodpos(x, y, fake, flags, env), false);

        location.typ = ROOM;
        location.flags = 0;
        state.level.objects[x][y] = { otyp: BOULDER, nexthere: null };
        assert.equal(goodpos(x, y, fake, flags, env), false);
        state.level.objects[x][y] = {
            otyp: SCR_SCARE_MONSTER,
            nexthere: null,
        };
        assert.equal(goodpos(x, y, fake, flags, env), false);
        state.level.objects[x][y] = null;

        state.head_engr = {
            nxt_engr: null,
            engr_x: x,
            engr_y: y,
            engr_txt: ['eLbErEtH'],
            engr_time: 0,
            engr_type: DUST,
        };
        assert.equal(goodpos(x, y, fake, flags, env), false);
        state.head_engr.engr_txt[0] = 'Elbereth!';
        assert.equal(goodpos(x, y, fake, flags, env), true);
        state.head_engr.engr_txt[0] = 'The word Elbereth is here';
        assert.equal(goodpos(x, y, fake, flags, env), true);
        state.head_engr = null;

        state.level.traps.push({ tx: x, ty: y });
        assert.equal(goodpos(x, y, fake, flags, env), true);
        state.exclusion_zones = {
            zonetype: LR_MONGEN,
            lx: x,
            ly: y,
            hx: x,
            hy: y,
            next: null,
        };
        assert.equal(goodpos(x, y, fake, flags, env), false);
    }
});

test('goodpos wires C-owned scary, air, and exclusion checks directly', () => {
    const cScaryStart = C_TELEPORT_SOURCE.indexOf('goodpos_onscary(\n');
    const cScaryEnd = C_TELEPORT_SOURCE.indexOf('\n/*\n * Is (x,y)', cScaryStart);
    assert.ok(cScaryStart >= 0 && cScaryEnd > cScaryStart);
    const cGoodposStart = C_TELEPORT_SOURCE.indexOf('\ngoodpos(\n', cScaryEnd);
    const cGoodposEnd = C_TELEPORT_SOURCE.indexOf('\n/*\n * "entity next to"', cGoodposStart);
    const cGoodpos = C_TELEPORT_SOURCE.slice(cGoodposStart, cGoodposEnd);
    const jsScaryStart = JS_TELEPORT_SOURCE.indexOf(
        'export function goodpos_onscary(',
    );
    const jsGoodposStart = JS_TELEPORT_SOURCE.indexOf(
        'export function goodpos(', jsScaryStart,
    );
    const jsGoodposEnd = JS_TELEPORT_SOURCE.indexOf(
        '// C ref: teleport.c collect_coords()', jsGoodposStart,
    );
    const jsGoodpos = JS_TELEPORT_SOURCE.slice(jsScaryStart, jsGoodposEnd);

    assert.match(C_TELEPORT_SOURCE.slice(cScaryStart, cScaryEnd),
        /sengr_at\("Elbereth", x, y, TRUE\)/u);
    assert.match(JS_TELEPORT_SOURCE, /import \{ sengr_at \} from '\.\/engrave\.js'/u);
    assert.match(JS_TELEPORT_SOURCE,
        /import \{[\s\S]*?accessible,[\s\S]*?closed_door,[\s\S]*?onscary,[\s\S]*?\} from '\.\/monmove\.js'/u);
    assert.match(jsGoodpos, /sengr_at\('Elbereth', x, y, true, state\)/u);
    assert.match(cGoodpos, /m_in_air\(mtmp\)/u);
    assert.match(jsGoodpos, /m_in_air\(monster, state\)/u);
    assert.match(cGoodpos, /accessible\(x, y\)/u);
    assert.match(jsGoodpos, /accessible\(x, y, state\)/u);
    assert.match(cGoodpos, /closed_door\(x, y\)/u);
    assert.match(jsGoodpos, /closed_door\(x, y, state\)/u);
    assert.match(cGoodpos, /is_exclusion_zone\(LR_MONGEN, x, y\)/u);
    assert.match(jsGoodpos, /is_exclusion_zone\(LR_MONGEN, x, y, state\)/u);
    assert.match(cGoodpos,
        /Fire_resistance && Wwalking && uarmf\s*&& uarmf->oerodeproof/u);
    assert.match(jsGoodpos,
        /propertyPresent\(state, FIRE_RES\) && waterWalking[\s\S]*?boots && boots\.oerodeproof/u);
    assert.doesNotMatch(jsGoodpos,
        /heroCanOccupy(?:Pool|Lava).*hook|isExclusionZone|normalized\.onscary/u);
});

test('teleds awaits spoteffects on an occupied destination', () => {
    const cStart = C_TELEPORT_SOURCE.indexOf('\nteleds(coordxy nux, coordxy nuy, int teleds_flags)');
    const cEnd = C_TELEPORT_SOURCE.indexOf(
        '\n/* teleport the hero via some method other than scroll of teleport */',
        cStart,
    );
    const jsStart = JS_TELEPORT_SOURCE.indexOf(
        'export async function teleds(',
    );
    const jsEnd = JS_TELEPORT_SOURCE.indexOf(
        '// fixed-destination trap can drop the hero onto a second teleport trap',
        jsStart,
    );
    assert.ok(cStart >= 0 && cEnd > cStart);
    assert.ok(jsStart >= 0 && jsEnd > jsStart);
    const cTeleds = C_TELEPORT_SOURCE.slice(cStart, cEnd);
    const jsTeleds = JS_TELEPORT_SOURCE.slice(jsStart, jsEnd);

    assert.match(cTeleds, /u_on_newpos\(nux, nuy\)/u);
    assert.match(cTeleds, /spoteffects\(TRUE\)/u);
    assert.doesNotMatch(cTeleds, /m_at\(nux, nuy\)/u);
    assert.match(jsTeleds, /u_on_newpos\(nux, nuy, state, \{/u);
    assert.match(jsTeleds, /await spoteffects\(true, state, env\)/u);
    assert.doesNotMatch(jsTeleds, /m_at\(nux, nuy, state\)/u);
    assert.ok(jsTeleds.indexOf('u_on_newpos(nux, nuy, state, {')
        < jsTeleds.indexOf('await spoteffects(true, state, env)'),
    'the hero arrives before the surprise effects are awaited');
});

test('goodpos reads hero pool and lava properties directly from source state', () => {
    const state = positionState();
    const hero = {
        data: state.mons[PM_SEWER_RAT],
        m_id: 0,
        wormno: 0,
        mundetected: false,
    };
    state.youmonst = hero;
    const x = 12;
    const y = 10;
    state.level.at(x, y).typ = POOL;
    state.u.uprops = {};

    assert.equal(goodpos(x, y, hero, 0, { state }), false);
    state.u.uprops[SWIMMING] = { intrinsic: 1 };
    assert.equal(goodpos(x, y, hero, 0, { state }), true);
    delete state.u.uprops[SWIMMING];
    state.u.uprops[LEVITATION] = { intrinsic: 1, blocked: 1 };
    assert.equal(goodpos(x, y, hero, 0, { state }), false);
    state.u.uprops[LEVITATION].blocked = 0;
    assert.equal(goodpos(x, y, hero, 0, { state }), true);

    state.u.uprops = {
        [FIRE_RES]: { intrinsic: 1 },
        [WWALKING]: { intrinsic: 1 },
    };
    state.uarmf = { oerodeproof: 1 };
    assert.equal(state.u.uarmf, undefined);
    state.level.at(x, y).typ = LAVAPOOL;
    assert.equal(goodpos(x, y, hero, 0, { state }), true);
    delete state.uarmf;
    assert.equal(goodpos(x, y, hero, 0, { state }), false);
    state.uarmf = { oerodeproof: 0 };
    assert.equal(goodpos(x, y, hero, 0, { state }), false);
    state.uarmf = { oerodeproof: 1 };
    delete state.u.uprops[FIRE_RES];
    assert.equal(goodpos(x, y, hero, 0, { state }), false);

    state.u.uprops = { [FLYING]: { intrinsic: 1 } };
    assert.equal(goodpos(x, y, hero, 0, { state }), true);
});

test('goodpos uses canonical scary owners for both fake and live monsters', () => {
    const state = positionState();
    const x = state.u.ux;
    const y = state.u.uy;
    const species = state.mons[PM_LITTLE_DOG];
    const fake = { data: species, m_id: 0, mundetected: false, wormno: 0 };
    const live = {
        data: species,
        m_id: 91,
        mcansee: true,
        mpeaceful: false,
        mundetected: false,
        wormno: 0,
        mx: x,
        my: y,
    };
    state.level.at(x, y).typ = ROOM;
    state.head_engr = {
        nxt_engr: null,
        engr_x: x,
        engr_y: y,
        engr_txt: ['Elbereth'],
        engr_time: state.moves,
        engr_type: DUST,
    };
    const env = { state, random: { rn2: () => 0 } };
    assert.equal(goodpos(x, y, fake, GP_CHECKSCARY | GP_ALLOW_U, env), false);
    assert.equal(goodpos(x, y, live, GP_CHECKSCARY | GP_ALLOW_U, env), false);

    state.head_engr.engr_txt[0] = 'Not quite Elbereth';
    assert.equal(goodpos(x, y, fake, GP_CHECKSCARY | GP_ALLOW_U, env), true);
    assert.equal(goodpos(x, y, live, GP_CHECKSCARY | GP_ALLOW_U, env), true);
});

test('stairway_find_forwiz returns the first matching stair on this dungeon', () => {
    // C teleport.c:1786-1798 scans the linked list in order and requires an
    // exact ladder/upward/dungeon match. These nodes isolate each predicate.
    const cHelper = sourceScrolltele(
        C_TELEPORT_SOURCE,
        'staticfn stairway *\nstairway_find_forwiz(boolean isladder, boolean up)',
        '\n/* place a monster at a random location',
    );
    const jsHelper = sourceScrolltele(
        JS_TELEPORT_SOURCE,
        'export function stairway_find_forwiz(',
        '\n\nfunction thenResult(',
    );
    assert.match(cHelper,
        /stway->isladder == isladder[\s\S]*stway->up == up[\s\S]*stway->tolev\.dnum == u\.uz\.dnum/u);
    assert.match(jsHelper,
        /stairway\.isladder === isladder[\s\S]*stairway\.up === up[\s\S]*stairway\.tolev\?\.dnum === state\.u\?\.uz\?\.dnum/u);

    const state = positionState();
    const wrongDungeon = {
        isladder: false, // C compares this flag before accepting a stair.
        up: true,
        tolev: { dnum: 1 }, // The current dungeon in positionState is 0.
        next: null,
    };
    const wrongDirection = {
        isladder: false,
        up: false, // A down stair does not match the requested up stair.
        tolev: { dnum: 0 },
        next: null,
    };
    const firstMatch = {
        isladder: false,
        up: true,
        tolev: { dnum: 0 },
        sx: 7, // The returned pointer must be the first matching stair.
        next: null,
    };
    const laterMatch = {
        isladder: false,
        up: true,
        tolev: { dnum: 0 },
        sx: 8,
        next: null,
    };
    wrongDungeon.next = wrongDirection;
    wrongDirection.next = firstMatch;
    firstMatch.next = laterMatch;
    state.stairs = wrongDungeon;

    assert.equal(stairway_find_forwiz(false, true, state), firstMatch);
    assert.equal(stairway_find_forwiz(true, true, state), null);
});

test('mnexto preserves monster identity and list linkage while relocating', async () => {
    const state = positionState();
    for (let x = 1; x < 80; ++x)
        for (let y = 0; y < 21; ++y) state.level.at(x, y).typ = ROOM;
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
        mhpmax: 1,
        m_id: 80,
        mtrack: Array.from({ length: 4 }, (_, index) => ({
            x: index + 1,
            y: index + 2,
        })),
    });
    state.level.monlist = monster;
    place_monster(monster, state.u.ux, state.u.uy, state);
    const draws = boundsRandom();

    const relocated = await mnexto(monster, 0, {
        state,
        random: draws.random,
    });
    assert.equal(relocated, undefined);
    assert.equal(state.level.monlist, monster);
    assert.equal(state.level.monsters[10][10], null);
    assert.equal(state.level.monsters[9][9], monster);
    assert.deepEqual([monster.mx, monster.my], [9, 9]);
    assert.deepEqual([monster.mux, monster.muy], [10, 10]);
    assert.deepEqual(
        monster.mtrack,
        Array.from({ length: 4 }, () => ({ x: 0, y: 0 })),
    );
    // enexto's 45 candidate draws are followed by set_apparxy's C-source
    // displacement roll for a monster that cannot see the hero.
    assert.equal(draws.bounds.length, 46);
    assert.equal(draws.bounds.at(-1), 3);
});

test('rloc keeps random coordinate and relocation side effects in source order',
    async () => {
        const state = positionState();
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 2, // A live monster is required for the coordinate index.
            mhpmax: 2,
            m_id: 81, // A nonzero id selects live-monster scary checks.
        });
        state.level.at(10, 11).typ = ROOM;
        state.level.at(12, 9).typ = ROOM;
        place_monster(monster, 10, 11, state);
        const calls = [];

        assert.equal(await rloc(monster, 0, {
            state,
            random: {
                rnd(bound) {
                    calls.push(`rnd(${bound})`);
                    return 12; // Selects the prepared accessible column.
                },
                rn2(bound) {
                    calls.push(`rn2(${bound})`);
                    return 9; // Selects the prepared accessible row.
                },
            },
            newsym(x, y) {
                calls.push(`newsym(${x},${y})`);
                if (x === 10 && y === 11) {
                    assert.equal(state.level.monsters[x][y], null);
                    assert.equal(state.level.monsters[12][9], null);
                } else {
                    assert.equal(state.level.monsters[x][y], monster);
                }
            },
            onscary: () => false,
            setApparxy: () => calls.push('set_apparxy'),
        }), true);

        assert.deepEqual([monster.mx, monster.my], [12, 9]);
        assert.deepEqual(calls, [
            'rnd(79)',
            'rn2(21)',
            'newsym(10,11)',
            'newsym(12,9)',
            'set_apparxy',
        ]);
        assert.equal(state.level.monsters[10][11], null);
        assert.equal(state.level.monsters[12][9], monster);
    });

test('rloc returns immediately when random selection finds the current square',
    () => {
        const state = positionState();
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 2, // A live monster is required for rloc_to_core().
            mhpmax: 2,
            m_id: 82, // A nonzero id selects live-monster scary checks.
        });
        state.level.at(12, 9).typ = ROOM;
        place_monster(monster, 12, 9, state);
        const calls = [];

        assert.equal(rloc(monster, 0, {
            state,
            random: {
                rnd(bound) {
                    calls.push(`rnd(${bound})`);
                    return 12; // Select the monster's current column.
                },
                rn2(bound) {
                    calls.push(`rn2(${bound})`);
                    return 9; // Select the monster's current row.
                },
            },
            newsym: () => calls.push('newsym'),
            onscary: () => false,
            setApparxy: () => calls.push('set_apparxy'),
        }), true);

        assert.deepEqual(calls, ['rnd(79)', 'rn2(21)']);
        assert.equal(state.level.monsters[12][9], monster);
    });

test('rloc carries ordinary inventory and clears no-charge status after placement',
    async () => {
        const state = positionState();
        const carried = {
            no_charge: true,
            unpaid: false,
            nobj: null,
        };
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 2, // A live carrier is required for relocation.
            mhpmax: 2,
            m_id: 88, // A nonzero id selects live-monster scary checks.
            minvent: carried,
        });
        state.level.at(10, 11).typ = ROOM;
        state.level.at(12, 9).typ = ROOM;
        place_monster(monster, 10, 11, state);

        assert.equal(await rloc(monster, 0, {
            state,
            random: {
                rnd: () => 12, // The prepared accessible destination column.
                rn2: () => 9, // The prepared accessible destination row.
            },
            newsym: () => {},
            onscary: () => false,
            setApparxy: () => {},
        }), true);

        assert.deepEqual([monster.mx, monster.my], [12, 9]);
        assert.equal(monster.minvent, carried);
        assert.equal(carried.no_charge, 0);
        assert.equal(carried.unpaid, false);
    });

test('rloc clears no-charge status but preserves unpaid status without a bill owner',
    async () => {
    for (const property of ['no_charge', 'unpaid']) {
        const state = positionState();
        const carried = {
            no_charge: false,
            unpaid: false,
            nobj: null,
            [property]: true,
        };
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 2, // A live carrier is required for relocation.
            mhpmax: 2,
            m_id: 89, // A nonzero id selects live-monster scary checks.
            minvent: carried,
        });
        state.level.at(10, 11).typ = ROOM;
        state.level.at(12, 9).typ = ROOM;
        place_monster(monster, 10, 11, state);
        let draws = 0;

        assert.equal(await rloc(monster, 0, {
            state,
            random: {
                rnd: () => { ++draws; return 12; },
                rn2: () => { ++draws; return 9; },
            },
            newsym: () => {},
            onscary: () => false,
            setApparxy: () => {},
        }), true);
        assert.equal(draws, 2);
        assert.deepEqual([monster.mx, monster.my], [12, 9]);
        assert.equal(carried.no_charge, property === 'no_charge' ? 0 : false);
        assert.equal(carried.unpaid, property === 'unpaid');
    }
});

test('rloc_to_core follows C placement, shop, occupation, and trap tail order', () => {
    const cStart = C_TELEPORT_SOURCE.indexOf('rloc_to_core(\n',
        C_TELEPORT_SOURCE.indexOf('/*\n * rloc_to()'));
    const cEnd = C_TELEPORT_SOURCE.indexOf('\nvoid\nrloc_to(', cStart);
    const jsStart = JS_TELEPORT_SOURCE.indexOf('function rloc_to_core(');
    const jsEnd = JS_TELEPORT_SOURCE.indexOf('\n// C ref: teleport.c rloc_to_flag()', jsStart);
    const cBody = C_TELEPORT_SOURCE.slice(cStart, cEnd);
    const jsBody = JS_TELEPORT_SOURCE.slice(jsStart, jsEnd);
    assert.notEqual(cStart, -1);
    assert.notEqual(cEnd, -1);
    assert.notEqual(jsStart, -1);
    assert.notEqual(jsEnd, -1);
    for (const [source, body] of [['C', cBody], ['JS', jsBody]]) {
        const unhide = body.indexOf('maybe_unhide_at');
        const redraw = body.indexOf(
            source === 'C' ? 'newsym' : 'redraw(', unhide,
        );
        const apparent = body.indexOf('set_apparxy', redraw);
        const occupation = body.indexOf('occupation', apparent);
        const trapped = body.indexOf('mtrapped', occupation);
        assert.ok(unhide >= 0 && redraw > unhide && apparent > redraw,
            `${source} redraws after placement and before apparent-position update`);
        assert.ok(occupation > apparent && trapped > occupation,
            `${source} runs occupation before the trapped-monster tail`);
    }
    assert.match(cBody, /stolen_value\(/u);
    assert.match(jsBody, /stolen_value\(/u);
});

test('rloc exhausts fifty trials before its unshuffled fallback and backup',
    () => {
        const state = positionState();
        const safeX = 12;
        const safeY = 9;
        // The sole accessible fallback square has a level-generated guarded
        // Elbereth and floor object, so the canonical C onscary() rejects it.
        state.head_engr = {
            nxt_engr: null,
            engr_x: safeX,
            engr_y: safeY,
            engr_txt: ['Elbereth'],
            engr_time: 0,
            engr_type: DUST,
            guardobjects: true,
        };
        state.level.objects[safeX][safeY] = { otyp: ROCK };
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 2, // A live monster is required for relocation.
            mhpmax: 2,
            m_id: 86, // A nonzero id selects C's full onscary() check.
            mcansee: true,
            mpeaceful: false,
        });
        state.level.at(10, 11).typ = ROOM;
        state.level.at(safeX, safeY).typ = ROOM;
        place_monster(monster, 10, 11, state);
        const bounds = [];
        let scaryCalls = 0;

        assert.equal(rloc(monster, 0, {
            state,
            random: {
                rnd(bound) {
                    bounds.push(`rnd(${bound})`);
                    return 1; // All fifty trials select inaccessible stone.
                },
                rn2(bound) {
                    bounds.push(`rn2(${bound})`);
                    return 0; // Row zero is stone; fallback keeps source order.
                },
            },
            newsym: () => {},
            onscary() {
                ++scaryCalls;
                return false; // goodpos uses the canonical source owner.
            },
            setApparxy: () => {},
        }), true);

        assert.equal(bounds.length, 101);
        assert.deepEqual(bounds.slice(0, 4), [
            'rnd(79)', 'rn2(21)', 'rnd(79)', 'rn2(21)',
        ]);
        assert.deepEqual(bounds.slice(-3), [
            'rnd(79)', 'rn2(21)', 'rn2(1)',
        ]);
        // Each random trial is inaccessible. The one accessible fallback is
        // scary, so rloc uses backupcc after completing its scan.
        assert.equal(scaryCalls, 0);
        assert.deepEqual([monster.mx, monster.my], [safeX, safeY]);
    });

test('rloc uses canonical relocation display operations when hooks are omitted',
    async () => {
    const state = positionState();
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 2, // A live monster is required for relocation.
        mhpmax: 2,
        m_id: 87, // A nonzero id selects live-monster scary checks.
    });
    state.level.at(10, 11).typ = ROOM;
    state.level.at(12, 9).typ = ROOM;
    place_monster(monster, 10, 11, state);
    let draws = 0;

    assert.equal(await rloc(monster, 0, {
        state,
        random: {
            rnd() {
                ++draws;
                return 12;
            },
            rn2() {
                ++draws;
                return 9;
            },
        },
        // The canonical source operation supplies the omitted redraw hook.
        onscary: () => false,
        setApparxy: () => {},
    }), true);
    assert.equal(draws, 2);
    assert.equal(state.level.monsters[10][11], null);
    assert.equal(state.level.monsters[12][9], monster);
});

// C ref: teleport.c rloc_to_core() lines 1652-1732 -- messaging block.
// The RLOC_MSG flag selects vanish/appear messages; the result depends
// on whether the hero can spot the monster before and after the move.

test('rloc with RLOC_MSG emits "vanishes!" when hero cannot see destination',
    async () => {
        // The hero sees the monster at its old position but not at the new
        // one, so the pre-move "vanishes!" message fires and no appear
        // message follows.
        const state = positionState();
        // Vision: hero at (10,10) can see adjacent cells (dist^2 <= 2).
        // Monster at (10,11) (dist^2=1) is visible, but destination
        // (12,9) (dist^2=5) is out of sight and out of couldsee range.
        setupVision(state, 2);
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 2,
            mhpmax: 2,
            m_id: 101,
        });
        state.level.at(10, 11).typ = ROOM;
        state.level.at(12, 9).typ = ROOM;
        place_monster(monster, 10, 11, state);

        const messages = [];
        const result = await rloc(monster, RLOC_MSG, {
            state,
            random: {
                rnd() { return 12; },
                rn2() { return 9; },
            },
            newsym: () => {},
            onscary: () => false,
            setApparxy: () => {},
            message: async (msg) => { messages.push(msg); },
        });

        assert.equal(result, true);
        assert.deepEqual([monster.mx, monster.my], [12, 9]);
        assert.deepEqual(messages, ['The sewer rat vanishes!']);
    });

test('rloc with RLOC_MSG emits "vanishes and reappears" when hero sees both '
    + 'squares', async () => {
    // The hero can see the monster at both the old and new positions.
    // The pre-move check sets telemsg, and the post-move check emits
    // "vanishes and reappears" with a distance suffix.
    const state = positionState();
    // Vision: hero can see everything nearby.
    setupVision(state);
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 2,
        mhpmax: 2,
        m_id: 102,
    });
    // Monster at (10,11), hero at (10,10). Both are close.
    state.level.at(10, 11).typ = ROOM;
    // Target at (11,10): dist2 = 1+0 = 1, next to hero.
    state.level.at(11, 10).typ = ROOM;
    place_monster(monster, 10, 11, state);

    const messages = [];
    const result = await rloc(monster, RLOC_MSG, {
        state,
        random: {
            rnd() { return 11; },
            rn2() { return 10; },
        },
        newsym: () => {},
        onscary: () => false,
        setApparxy: () => {},
        message: async (msg) => { messages.push(msg); },
    });

    assert.equal(result, true);
    assert.deepEqual([monster.mx, monster.my], [11, 10]);
    assert.deepEqual(messages, [
        'The sewer rat vanishes and reappears next to you.',
    ]);
});

test('rloc with RLOC_NOMSG suppresses all messaging', async () => {
    // RLOC_NOMSG sets preventmsg, which forces domsg to false.
    const state = positionState();
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 2,
        mhpmax: 2,
        m_id: 103,
    });
    state.level.at(10, 11).typ = ROOM;
    state.level.at(12, 9).typ = ROOM;
    place_monster(monster, 10, 11, state);

    const messages = [];
    const result = rloc(monster, RLOC_NOMSG, {
        state,
        random: {
            rnd() { return 12; },
            rn2() { return 9; },
        },
        newsym: () => {},
        onscary: () => false,
        setApparxy: () => {},
        message: async (msg) => { messages.push(msg); },
    });

    // RLOC_NOMSG path is synchronous -- returns a boolean, not a Promise.
    assert.equal(result, true);
    assert.deepEqual([monster.mx, monster.my], [12, 9]);
    assert.deepEqual(messages, []);
});

test('rloc with STRAT_APPEARMSG emits "suddenly appears" for an unseen '
    + 'monster', async () => {
    // A monster with STRAT_APPEARMSG that the hero could not spot before
    // the move: the pre-move canSpotMonster check fails (monster is
    // invisible), so appearmsg stays true. After placement, the monster
    // lands next to the hero and the "suddenly appears" message fires.
    const state = positionState();
    // Vision: hero can see everything nearby.
    setupVision(state);
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 2,
        mhpmax: 2,
        m_id: 104,
        mstrategy: STRAT_APPEARMSG,
        // Make the monster invisible so canSpotMonster returns false
        // before the move. After placement, the "appears" branch checks
        // appearmsg, which was not cleared because canSpotMonster was
        // false in the pre-move block.
        minvis: true,
    });
    state.level.at(10, 11).typ = ROOM;
    // Destination at (11,10), next to hero (10,10): dist2 = 1.
    state.level.at(11, 10).typ = ROOM;
    place_monster(monster, 10, 11, state);

    const messages = [];
    const result = await rloc(monster, 0, {
        state,
        random: {
            rnd() { return 11; },
            rn2() { return 10; },
        },
        newsym: () => {},
        onscary: () => false,
        setApparxy: () => {},
        message: async (msg) => { messages.push(msg); },
    });

    assert.equal(result, true);
    assert.deepEqual([monster.mx, monster.my], [11, 10]);
    // STRAT_APPEARMSG cleared after the message fires.
    assert.equal(monster.mstrategy & STRAT_APPEARMSG, 0);
    assert.equal(messages.length, 1);
    // The hero cannot see the monster but appearmsg is set, so the
    // "suddenly appears" message fires.
    assert.match(messages[0], /suddenly appears next to you!$/u);
});

// teleport.c rloc_to(), which is rloc_to_core() with RLOC_NOMSG. dog.c
// mon_arrive() reaches it with mtmp->mx == 0, and every tail below the
// placement refuses instead of running.
function arrivingMonster(state) {
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 2,
        mhpmax: 2,
        m_id: 91,
    });
    // dog.c relmon() leaves a monster on either travelling list at <0,0>.
    monster.mx = 0;
    monster.my = 0;
    return monster;
}

test('rloc_to places a monster that holds no square and ignores flag overrides', async () => {
    const state = positionState();
    state.level.at(10, 11).typ = ROOM;
    const monster = arrivingMonster(state);

    const messages = [];
    assert.equal(await rloc_to(monster, 10, 11, {
        state,
        rlocflags: RLOC_MSG, // C rloc_to() hard-codes RLOC_NOMSG.
        newsym: () => {},
        message: async (line) => messages.push(line),
    }), undefined);
    assert.deepEqual([monster.mx, monster.my], [10, 11]);
    assert.equal(state.level.monsters[10][11], monster);
    // set_apparxy() answers the hero's own square for the tame followers
    // mon_arrive() admits.
    assert.deepEqual([monster.mux, monster.muy], [state.u.ux, state.u.uy]);
    assert.deepEqual(messages, [], 'the rloc_to wrapper always suppresses messages');

    // This on-map move would emit a vanish/reappear line if the wrapper
    // allowed a caller-supplied RLOC_MSG to override C's RLOC_NOMSG.
    state.level.at(12, 11).typ = ROOM;
    setupVision(state);
    await rloc_to(monster, 12, 11, {
        state,
        rlocflags: RLOC_MSG,
        newsym: () => {},
        message: async (line) => messages.push(line),
    });
    assert.deepEqual(messages, []);
});

test('rloc_to_flag keeps RLOC_MSG separate from unflagged arrival placement',
    async () => {
        const state = positionState();
        // teleport.c rloc_to_core() gates departure output on oldx. Monster
        // detection can sense this off-map arrival, but it has not vanished
        // from a square and must retain its sudden-appearance message.
        state.u.uprops = { [DETECT_MONSTERS]: { intrinsic: 1 } };
        state.level.at(10, 11).typ = ROOM;
        const monster = arrivingMonster(state);
        monster.mstrategy |= STRAT_APPEARMSG;
        const messages = [];
        const calls = [];
        const result = rloc_to_flag(monster, 10, 11, RLOC_MSG, {
            state,
            newsym: () => {},
            setApparxy: (subject, env) => {
                calls.push([subject, env.random]);
            },
            message: (text) => messages.push(text),
        });
        await result;
        assert.equal(calls.length, 1);
        assert.equal(calls[0][0], monster);
        assert.ok(calls[0][1]);
        assert.equal(messages.length, 1);
        assert.match(messages[0], /suddenly appears/u);
        assert.doesNotMatch(messages[0], /vanishes/u);
        assert.equal(state.level.monsters[10][11], monster);
    });

test('planned hallucinated flagged relocation uses its display RNG seam',
    async () => {
        const state = positionState();
        setupVision(state);
        state.u.uprops = {
            [HALLUC]: { intrinsic: 1, extrinsic: 0 },
            [HALLUC_RES]: { intrinsic: 0, extrinsic: 0 },
        };
        state.level.at(10, 11).typ = ROOM;
        state.level.at(11, 10).typ = ROOM;
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 2,
            mhpmax: 2,
            m_id: 92,
        });
        place_monster(monster, 10, 11, state);
        const displayBounds = [];
        const messages = [];
        await rloc_to_flag(monster, 11, 10, RLOC_MSG, {
            planning: true,
            state,
            newsym: () => {},
            displayRandom: (bound) => {
                displayBounds.push(bound);
                return 0;
            },
            message: async (text) => messages.push(text),
        });
        assert.ok(displayBounds.length > 0);
        assert.equal(state.level.monsters[11][10], monster);
        assert.equal(messages.length, 1);
    });

test('rloc_to moves ordinary and worm monsters in source draw order',
    async () => {
    const state = positionState();
    state.level.at(10, 11).typ = ROOM;

    // hack.c revive_nasty() reaches rloc_to_core()'s "pick up" block for an
    // ordinary monster standing over the corpse.
    const placed = arrivingMonster(state);
    place_monster(placed, 10, 11, state);
    const redraws = [];
    assert.equal(
        await rloc_to(placed, 12, 11, {
            state,
            newsym(x, y) {
                redraws.push([x, y]);
                if (x === 10) {
                    assert.equal(state.level.monsters[10][11], null);
                    assert.equal(state.level.monsters[12][11], null);
                } else {
                    assert.equal(state.level.monsters[x][y], placed);
                }
            },
        }),
        undefined,
    );
    assert.deepEqual(redraws, [[10, 11], [12, 11]]);
    assert.equal(state.level.monsters[10][11], null);
    assert.equal(state.level.monsters[12][11], placed);
    state.level.monsters[12][11] = null;

    // teleport.c:1676-1688 removes and recreates a worm's tail around its
    // destination. The west square begins as the visible tail; the injected
    // shuffle makes the helper choose the first available direction at the
    // new head, pinning occupancy without relying on a random seed.
    for (let x = 8; x <= 15; ++x) {
        for (let y = 7; y <= 15; ++y)
            state.level.at(x, y).typ = ROOM;
    }
    const worm = arrivingMonster(state);
    worm.data = state.mons[PM_LONG_WORM];
    worm.mnum = PM_LONG_WORM;
    worm.wormno = 1;
    worm.mtrapped = 1; // C skips mintrap() for worms at teleport.c:1765.
    state.level.worms = Array(MAX_NUM_WORMS).fill(null);
    state.level.worms[1] = {
        segments: [{ x: 9, y: 11 }, { x: 10, y: 11 }],
        growtime: 0,
    };
    place_monster(worm, 10, 11, state);
    state.level.monsters[9][11] = worm;
    const wormDraws = [];
    assert.equal(await rloc_to(worm, 12, 11, {
        state,
        random: {
            rn2(bound) {
                wormDraws.push(bound);
                return 0;
            },
            rnd: () => 1,
        },
        newsym: () => {},
        setApparxy: () => {},
    }), undefined);
    assert.deepEqual([worm.mx, worm.my], [12, 11]);
    assert.equal(state.level.monsters[9][11], null,
        'the original tail square is cleared before relocation');
    assert.deepEqual(wormDraws, [8, 7, 6, 5, 4, 3, 2, 1],
        'tail placement preserves the source Fisher-Yates draw bounds');
    assert.deepEqual(state.level.worms[1].segments.at(-1),
        { x: 12, y: 11 }, 'the hidden segment follows the new head');
    const visibleTail = state.level.worms[1].segments[0];
    assert.equal(state.level.monsters[visibleTail.x][visibleTail.y], worm,
        'the new visible segment is occupied by the worm');

});

test('mnexto refreshes every gas-region monster membership after relocation', async () => {
    const state = positionState();
    for (let x = 1; x < 80; ++x)
        for (let y = 0; y < 21; ++y) state.level.at(x, y).typ = ROOM;
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
        mhpmax: 1,
        m_id: 83,
    });
    state.level.monlist = monster;
    place_monster(monster, state.u.ux, state.u.uy, state);
    const second = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
        mhpmax: 1,
        m_id: 84,
    });
    const third = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
        mhpmax: 1,
        m_id: 85,
    });
    place_monster(second, 11, 10, state);
    place_monster(third, 12, 10, state);

    const oldOnly = create_region();
    add_rect_to_reg(oldOnly, { lx: 10, ly: 10, hx: 12, hy: 10 });
    add_region(oldOnly, state);
    const newOnly = create_region();
    add_rect_to_reg(newOnly, { lx: 9, ly: 9, hx: 9, hy: 9 });
    add_region(newOnly, state);
    const both = create_region();
    add_rect_to_reg(both, { lx: 9, ly: 9, hx: 9, hy: 9 });
    add_rect_to_reg(both, { lx: 10, ly: 10, hx: 10, hy: 10 });
    add_region(both, state);
    assert.deepEqual(
        [oldOnly.monsters, newOnly.monsters, both.monsters],
        [[monster.m_id, second.m_id, third.m_id], [], [monster.m_id]],
    );

    await mnexto(monster, 0, {
        state,
        random: boundsRandom().random,
    });

    assert.deepEqual([monster.mx, monster.my], [9, 9]);
    assert.deepEqual(
        [oldOnly.monsters, newOnly.monsters, both.monsters],
        [[third.m_id, second.m_id], [monster.m_id], [monster.m_id]],
    );
});

test('mnexto repeats its hallucinatory name after the prompt', async () => {
    const cControl = sourceScrolltele(
        C_TELEPORT_SOURCE,
        'boolean\ncontrol_mon_tele(',
        'staticfn void\nmvault_tele(',
    );
    const jsControl = sourceScrolltele(
        JS_TELEPORT_SOURCE,
        'export async function control_mon_tele(',
        '// C ref: teleport.c rloc().',
    );
    assert.equal((cControl.match(/noit_mon_nam\(mon\)/gu) ?? []).length, 2);
    assert.equal((jsControl.match(/noit_mon_nam\(monster, state, env\)/gu) ?? []).length, 2);

    const state = positionState();
    state.wizard = true;
    state.iflags = { mon_telecontrol: true };
    state.u.uprops = [];
    state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0 };
    state.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0 };
    for (let x = 1; x < 80; ++x)
        for (let y = 0; y < 21; ++y) state.level.at(x, y).typ = ROOM;
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
        mhpmax: 1,
        m_id: 81,
    });
    state.level.monlist = monster;
    place_monster(monster, state.u.ux, state.u.uy, state);
    const draws = boundsRandom();
    const calls = [];
    const events = [];
    const displayBounds = [];

    const relocated = await mnexto(monster, 37, {
        state,
        random: draws.random,
        message: async (line) => events.push(['message', line]),
        displayRandom(bound) {
            displayBounds.push(bound);
            // The first two values select a killer bee name; the next two
            // select a soldier ant name for C's second noit_mon_nam call.
            if (displayBounds.length === 1) return 1;
            if (displayBounds.length === 2) return 0;
            if (displayBounds.length === 3) return 2;
            return 1;
        },
        getpos: async (coordinate, force, goal, currentState) => {
            calls.push([force, goal]);
            events.push(['getpos', goal]);
            coordinate.x = 12;
            coordinate.y = 10;
            return 0;
        },
    });
    assert.equal(relocated, undefined);
    assert.deepEqual([monster.mx, monster.my], [12, 10]);
    assert.equal(state.level.monsters[10][10], null);
    assert.equal(state.level.monsters[12][10], monster);
    assert.equal(displayBounds.length, 4,
        'both noit_mon_nam calls draw name and gender from display RNG');
    assert.match(events[0][1], /Teleport the killer bee @ <10,10> where\?/u);
    assert.deepEqual(calls, [[false, 'where to teleport the soldier ant']]);
    assert.deepEqual(events.map(([kind]) => kind), ['message', 'getpos']);
});

test('mnexto keeps the derived square when wizard control is unavailable', async () => {
    const state = positionState();
    state.iflags = { mon_telecontrol: true };
    for (let x = 1; x < 80; ++x)
        for (let y = 0; y < 21; ++y) state.level.at(x, y).typ = ROOM;
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
        mhpmax: 1,
        m_id: 82,
    });
    state.level.monlist = monster;
    place_monster(monster, state.u.ux, state.u.uy, state);

    await mnexto(monster, 0, {
        state,
        random: boundsRandom().random,
    });
    assert.deepEqual([monster.mx, monster.my], [9, 9]);
    assert.equal(state.level.monsters[9][9], monster);
});

// ── random_teleport_level ──

// Minimal state for random_teleport_level(). The function reads dungeon
// topology, the hero's current level, and the PRNG, but makes no screen or
// state changes itself. Is_botlevel() and In_quest() in const.js access the
// global `game` object, so this helper writes dungeon topology there too.
function randomTeleportState({
    dnum = 0,
    dlevel = 1,
    depth_start = 1,
    num_dunlevs = 10,
    hellish = false,
    invoked = false,
} = {}) {
    const state = resetGame();
    state.astral_level = { dnum: 9, dlevel: 1 };
    state.dungeons = [{
        depth_start,
        num_dunlevs,
        ledger_start: 0,
        flags: { hellish },
    }];
    state.u = {
        uz: { dnum, dlevel },
        uevent: { invoked },
    };
    state.branches = [];
    state.quest_dnum = 99; // not reachable from dnum 0
    return state;
}

test('random_teleport_level returns cur_depth when rn2(5) is 0', () => {
    // C ref: teleport.c:2196, `!rn2(5)`. Seed 1 gives rn2(5)=0 on the
    // first draw, so the function returns without picking a destination.
    const state = randomTeleportState({ dlevel: 3 });
    initRng(1);
    enableRngLog();
    // depth(u.uz) = depth_start + dlevel - 1 = 1 + 3 - 1 = 3
    assert.equal(random_teleport_level(state), 3);
    assert.deepEqual(getRngLog(), ['rn2(5)=0']);
});

test('random_teleport_level picks a different level when rn2(5) is nonzero',
    () => {
    // C ref: teleport.c:2239. Seed 2 on D:1 (depth 1) of a 10-level main
    // dungeon: rn2(5)=3 (continues), rn2(3)=0 (nlev = 0+1 = 1, then 1>=1
    // so nlev++ = 2). The result is depth 2, one level below the hero.
    const state = randomTeleportState({ dlevel: 1, num_dunlevs: 10 });
    initRng(2);
    enableRngLog();
    assert.equal(random_teleport_level(state), 2);
    assert.deepEqual(getRngLog(), ['rn2(5)=3', 'rn2(3)=0']);
});

test('random_teleport_level clamps and adjusts at the bottom level', () => {
    // C ref: teleport.c:2243-2248. Seed 6 on D:10 (depth 10, the bottom):
    // rn2(5)=4 (continues), rn2(12)=9, nlev = 9+1 = 10, 10>=10 so nlev=11,
    // 11 > max_depth (10) so nlev = 10, then Is_botlevel so nlev -= rnd(3)=3,
    // final nlev = 7. The hero teleports three levels up.
    const state = randomTeleportState({ dlevel: 10, num_dunlevs: 10 });
    initRng(6);
    enableRngLog();
    assert.equal(random_teleport_level(state), 7);
    assert.deepEqual(getRngLog(), ['rn2(5)=4', 'rn2(12)=9', 'rnd(3)=3']);
});

test('u_teleport_mon returns false before relocation on a stasis level', async () => {
    // teleport.c:2263-2302 returns FALSE at the stasis gate before any RNG or
    // relocation call, and zap.c:bhitm consumes that result for visibility.
    const state = positionState();
    state.moves = 1;
    state.level.flags.stasis_until = 1;
    const monster = { mx: 11, my: 10, ispriest: false };
    const draws = [];
    const result = await u_teleport_mon(monster, false, {
        state,
        random: { rn2: (bound) => { draws.push(bound); return 0; } },
    });
    assert.equal(result, false);
    assert.deepEqual(draws, []);
    assert.deepEqual([monster.mx, monster.my], [11, 10]);
});

test('teleds drags the punished ball through the holdout teleport', async () => {
    // teleport.c teleds():481-528. The explicit local-holdout prefix reaches
    // the previously refused call at recorded step 789, where drag_ball()
    // and move_bc() put both objects on the destination before the existing
    // vision and spoteffects tail runs.
    const recording = normalizeSession(JSON.parse(readFileSync(
        new URL('../sessions/holdout/seed4500-knight-coverage.session.json',
            import.meta.url),
        'utf8',
    )));
    const segment = recording.segments[0];
    const moves = segment.steps.slice(1, 790)
        .map(({ key }) => key ?? '')
        .join('');
    let boundary = null;
    // Recorder startup creates an empty scorefile. Supply the same storage
    // contract as the scorer so topten.c can open it and draw a rank.
    const storage = new InMemoryStorage();
    const replay = await runSegment(
        { ...segment, moves, storage },
        { onBoundary: (error) => { boundary ??= error; } },
    );

    assert.equal(boundary, null,
        'the teleds() ball branch consumes the recorded step');
    assert.equal(replay.getScreens().length, 790,
        'the prefix emits one screen for every input and its launch screen');
    // The C recording's step 789 lands at (65,17). Both punishment objects
    // are floor objects there after move_bc() and the teleds() tail.
    assert.deepEqual([game.u.ux0, game.u.uy0], [33, 5]);
    assert.deepEqual([game.u.ux, game.u.uy], [65, 17]);
    assert.deepEqual([game.uball.ox, game.uball.oy], [65, 17]);
    assert.deepEqual([game.uchain.ox, game.uchain.oy], [65, 17]);
    assert.equal(game.uball.where, OBJ_FLOOR);
    assert.equal(game.uchain.where, OBJ_FLOOR);
});
