import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    SPFX_SEARCH,
} from '../js/artifacts.js';
import {
    ANTI_MAGIC,
    ARTICLE_NONE,
    BLINDED,
    COLNO,
    COULD_SEE,
    CORR,
    DETECT_MONSTERS,
    DOOR,
    D_CLOSED,
    D_LOCKED,
    D_TRAPPED,
    DUST,
    ECMD_TIME,
    ENGRAVE,
    GPCOORDS_MAP,
    HALLUC,
    IN_SIGHT,
    I_SPECIAL,
    M_AP_F_DKNOWN,
    M_AP_OBJECT,
    M_AP_TYPE,
    OBJ_FLOOR,
    ROOM,
    ROWNO,
    SCORR,
    SDOOR,
    STATUE_TRAP,
    SVALL,
    TELEPAT,
    SV0,
    SV1,
    SV2,
    SV3,
    SV4,
    SV5,
    SV6,
    SV7,
    W_BALL,
    W_CHAIN,
    WARNING,
} from '../js/const.js';
import {
    check_map_spot,
    cvt_sdoor_to_door,
    detecting,
    do_vicinity_map,
    dosearch,
    dosearch0,
    food_detect,
    findit,
    foundone,
    findone,
    gold_detect,
    monster_detect,
    object_detect,
    o_in,
    o_material,
    openone,
    reconstrain_map,
    UnsupportedSearchError,
    unconstrain_map,
    warnreveal,
} from '../js/detect.js';
import { def_char_is_furniture } from '../js/drawing.js';
import { distant_monnam } from '../js/do_name.js';
import {
    back_to_glyph,
    feel_location,
    GLYPH_INVISIBLE,
    glyph_is_cmap,
    glyph_is_invisible,
    trap_to_glyph,
    map_glyphinfo,
    monster_glyph_info,
    newsym,
    object_glyph_info,
    map_invisible_planning,
    objnum_to_glyph,
    remembered_glyph_from_presentation,
    trap_glyph_info,
    warning_of,
} from '../js/display.js';
import {
    GLYPH_OBJ_OFF,
    GLYPH_UNEXPLORED_OFF,
} from '../js/glyph_offsets.js';
import { game } from '../js/gstate.js';
import { nomul } from '../js/hack.js';

const DETECT_C = readFileSync(
    new URL('../nethack-c/upstream/src/detect.c', import.meta.url), 'utf8',
);

function cDefinition(startMarker, endMarker) {
    const start = DETECT_C.indexOf(startMarker);
    assert.notEqual(start, -1, `missing C source marker: ${startMarker}`);
    const end = DETECT_C.indexOf(endMarker, start);
    assert.notEqual(end, -1, `missing C source marker: ${endMarker}`);
    return DETECT_C.slice(start, end);
}

const UNCONSTRAIN_MAP_C = cDefinition(
    'staticfn boolean\nunconstrain_map(void)',
    '\n/* put hero back underwater',
);
const MONSTER_DETECT_C = cDefinition(
    'int\nmonster_detect(struct obj *otmp,',
    '\nstaticfn void\nsense_trap(',
);
const DO_VICINITY_MAP_C = cDefinition(
    'void\ndo_vicinity_map(',
    '\n/* convert a secret door into a normal door',
);

test('detecting matches only the two C detection callback identities', () => {
    // detect.c:1931 compares function pointers directly. Keep this predicate
    // tied to findone/openone identity instead of a caller-selected label.
    assert.match(DETECT_C, /return \(func == findone \|\| func == openone\);/u);
    assert.equal(detecting(findone), true);
    assert.equal(detecting(openone), true);
    assert.equal(detecting(() => {}), false);
});

test('do_vicinity_map preserves the C reveal, browse, restore and redraw order',
    () => {
        assert.match(
            DO_VICINITY_MAP_C,
            /lo_y = \(\(u\.uy - 5 < 0\) \? 0 : u\.uy - 5\)/u,
        );
        assert.match(
            DO_VICINITY_MAP_C,
            /lo_x = \(\(u\.ux - 9 < 1\) \? 1 : u\.ux - 9\)/u,
        );
        assert.ok(
            DO_VICINITY_MAP_C.indexOf('oldglyph = glyph_at(zx, zy)')
                < DO_VICINITY_MAP_C.indexOf(
                    'show_map_spot(zx, zy, Confusion)',
                ),
            'the remembered glyph is read before show_map_spot clears it',
        );
        for (const source of [
            'if (OBJ_AT(zx, zy))',
            'if ((mtmp = m_at(zx, zy)) != 0',
            'if (random_farsight && flags.quick_farsight)',
            'browse_map(ter_typ, "anything of interest")',
            'reconstrain_map();',
            'EDetect_monsters = save_EDetect_mons;',
            'gv.viz_array[u.uy][u.ux] = save_viz_uyux;',
            'see_monsters();',
            'if (refresh)\n        docrt();',
        ]) assert.ok(DO_VICINITY_MAP_C.includes(source), source);
        assert.match(
            DO_VICINITY_MAP_C,
            /extended = \(sobj && \(sobj->blessed \|\| Clairvoyant\)\)/u,
        );
        assert.equal(typeof do_vicinity_map, 'function');
    });
import { runSegment } from '../js/jsmain.js';
import { planningState } from '../js/unported_monster_actions.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import {
    CHEST,
    CORPSE,
    FOOD_CLASS,
    GOLD,
    IRON,
    LARGE_BOX,
    LENSES,
    TOOL_CLASS,
    SCR_FOOD_DETECTION,
    SCR_GOLD_DETECTION,
    SCROLL_CLASS,
} from '../js/objects.js';
import { DEFAULT_PRIMARY_SYMBOLS } from '../js/symbol_data.js';
import {
    M1_CONCEAL,
    M1_HIDE,
    PM_CAVE_SPIDER,
    S_EEL,
    S_FELINE,
} from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import { create_region } from '../js/region.js';

import { ATR_INVERSE, CLR_WHITE } from '../js/terminal.js';
import {
    enableBrowserGlyphProjection,
} from './browser-projection-test-support.mjs';
import { canspotmon } from '..//js/display.js';

function searchState() {
    const locations = new Map();
    const key = (x, y) => `${x},${y}`;
    return {
        moves: 2,
        multi: 4,
        context: {
            run: 1,
            travel: 1,
            travel1: 1,
            mv: 1,
        },
        disp: {},
        iflags: {},
        a11y: { accessiblemsg: false },
        u: {
            ux: 10,
            uy: 10,
            uswallow: false,
            uinvulnerable: true,
            usleep: 3,
            uz: { dnum: 0, dlevel: 1 },
            uprops: [],
            acurr: { a: [10, 10, 10, 10, 10, 10] },
            abon: [0, 0, 0, 0, 0, 0],
            atemp: [0, 0, 0, 0, 0, 0],
            aexe: [0, 0, 0, 0, 0, 0],
        },
        level: {
            traps: [],
            at(x, y) {
                const coordinate = key(x, y);
                if (!locations.has(coordinate)) {
                    locations.set(coordinate, {
                        typ: ROOM,
                        flags: 0,
                        doormask: 0,
                        candig: false,
                    });
                }
                return locations.get(coordinate);
            },
        },
    };
}

test('detect.c object-chain searches preserve class, material, and Schrödinger order', () => {
    const match = { oclass: TOOL_CLASS, otyp: 3, cobj: null, nobj: null };
    const nested = { oclass: FOOD_CLASS, otyp: 4, cobj: match, nobj: null };
    const root = { oclass: FOOD_CLASS, otyp: 5, cobj: nested, nobj: null };
    const state = {
        objects: [
            {}, {}, {}, { oc_material: IRON }, { oc_material: GOLD },
            { oc_material: 0 },
        ],
    };

    assert.equal(o_in(root, TOOL_CLASS, state), match);
    assert.equal(o_material(root, IRON, state), match);
    assert.equal(o_material(root, GOLD, state), nested);

    const unresolvedBox = {
        oclass: 0,
        otyp: LARGE_BOX,
        spe: 1,
        cobj: match,
    };
    assert.equal(o_in(unresolvedBox, TOOL_CLASS, state), null);
});

test('detect.c check_map_spot preserves the stale-gold map exception', () => {
    const x = 2;
    const y = 3;
    const location = { disp_glyph: { glyph: objnum_to_glyph(3) } };
    const objects = Array.from({ length: 5 }, () => ({}));
    objects[3] = { oc_class: TOOL_CLASS, oc_material: GOLD };
    objects[4] = { oc_material: IRON };

    function spotState(floorObject = null) {
        const levelObjects = [];
        if (floorObject) {
            levelObjects[x] = [];
            levelObjects[x][y] = floorObject;
        }
        return {
            objects,
            level: {
                objects: levelObjects,
                monsters: [],
                at: () => location,
            },
        };
    }

    assert.equal(check_map_spot(x, y, TOOL_CLASS, 0, spotState()), true);
    assert.equal(check_map_spot(
        x, y, TOOL_CLASS, GOLD, spotState({ otyp: 4, cobj: null }),
    ), true);
    const goldObjects = Array.from({ length: 5 }, () => ({}));
    goldObjects[3] = { oc_class: TOOL_CLASS, oc_material: GOLD };
    goldObjects[4] = { oc_material: GOLD };
    const carryingGold = spotState({ otyp: 4, cobj: null });
    carryingGold.objects = goldObjects;
    assert.equal(check_map_spot(x, y, TOOL_CLASS, GOLD, carryingGold), false);
});

test('drawing.c furniture lookup uses the compiled symbol table', () => {
    const upStair = String.fromCharCode(DEFAULT_PRIMARY_SYMBOLS[25]);
    assert.equal(upStair, '<');
    assert.equal(def_char_is_furniture(upStair), 25);
    assert.equal(def_char_is_furniture('#'), -1);
});

test('detect.c unconstrain/reconstrain saves and restores every constraint', () => {
    // detect.c computes this Boolean before it overwrites any of the three
    // C fields, then unconditionally saves and clears each field.
    assert.match(UNCONSTRAIN_MAP_C,
        /boolean res = u\.uinwater \|\| u\.uburied \|\| u\.uswallow;/u);
    for (const assignment of [
        'iflags.save_uinwater = u.uinwater, u.uinwater = 0;',
        'iflags.save_uburied  = u.uburied,  u.uburied  = 0;',
        'iflags.save_uswallow = u.uswallow, u.uswallow = 0;',
        'return res;',
    ]) {
        assert.ok(UNCONSTRAIN_MAP_C.includes(assignment), assignment);
    }

    // These bit patterns exercise no constraint, each individual C state
    // field, and combinations; nonzero values stand for active C constraints.
    for (let bits = 0; bits < 8; ++bits) {
        const original = [
            bits & 1 ? 2 : 0,
            bits & 2 ? 1 : 0,
            bits & 4 ? 3 : 0,
        ];
        const state = {
            u: {
                uinwater: original[0],
                uburied: original[1],
                uswallow: original[2],
            },
            iflags: {
                save_uinwater: 91,
                save_uburied: 92,
                save_uswallow: 93,
            },
        };
        assert.equal(unconstrain_map(state), bits !== 0);
        assert.deepEqual(
            [state.u.uinwater, state.u.uburied, state.u.uswallow],
            [0, 0, 0],
        );
        assert.deepEqual(
            [state.iflags.save_uinwater, state.iflags.save_uburied,
                state.iflags.save_uswallow],
            original,
        );
        reconstrain_map(state);
        assert.deepEqual(
            [state.u.uinwater, state.u.uburied, state.u.uswallow],
            original,
        );
        assert.deepEqual(
            [state.iflags.save_uinwater, state.iflags.save_uburied,
                state.iflags.save_uswallow],
            [0, 0, 0],
        );
    }
});

test('detect.c monster_detect pins the complete live, return and display order', () => {
    assert.match(MONSTER_DETECT_C,
        /for \(mtmp = fmon; mtmp; mtmp = mtmp->nmon\)/u);
    assert.match(MONSTER_DETECT_C,
        /if \(DEADMONSTER\(mtmp\) \|\| \(mtmp->isgd && !mtmp->mx\)\)\s*continue;/u);
    assert.match(MONSTER_DETECT_C,
        /if \(!mcnt\) \{[\s\S]*?if \(otmp\)[\s\S]*?strange_feeling\([\s\S]*?return 1;/u);
    assert.match(MONSTER_DETECT_C,
        /unsigned swallowed = u\.uswallow; \/\* before unconstrain_map\(\) \*\/[\s\S]*?unconstrained = unconstrain_map\(\);/u);
    assert.match(MONSTER_DETECT_C,
        /!mclass \|\| mtmp->data->mlet == mclass[\s\S]*?mclass == S_WORM_TAIL/u);
    assert.ok(MONSTER_DETECT_C.indexOf('map_monst(mtmp, TRUE);')
        < MONSTER_DETECT_C.indexOf('otmp && otmp->cursed && helpless(mtmp)'));
    assert.match(MONSTER_DETECT_C,
        /if \(!swallowed\)\s*display_self\(\);[\s\S]*?You\("sense the presence of monsters\."\);[\s\S]*?if \(woken\)\s*pline\("Monsters sense the presence of you\."\);/u);
    assert.match(MONSTER_DETECT_C,
        /if \(\(otmp && otmp->blessed\) && !unconstrained\) \{[\s\S]*?display_nhwindow\(WIN_MAP, TRUE\);[\s\S]*?EDetect_monsters \|= I_SPECIAL;[\s\S]*?browse_map\(TER_DETECT \| TER_MON, "monster of interest"\);[\s\S]*?EDetect_monsters &= ~I_SPECIAL;/u);
    assert.match(MONSTER_DETECT_C,
        /map_redisplay\(\);\s*\}\s*return 0;/u);
});

function monsterDetectionFixture() {
    const state = searchState();
    const monster = newMonster({
        mx: 40,
        my: 15,
        mhp: 5,
        data: {
            pmnames: ['newt', 'newt', 'newt'],
            mflags1: 0,
            mflags2: 0,
            mflags3: 0,
        },
    });
    state.level.monlist = monster;
    const env = {
        cls: async () => {},
        unconstrainMap: () => {},
        mapMonster: () => {},
        displaySelf: () => {},
        message: async () => {},
        mapRedisplay: async () => {},
    };
    return { state, monster, env };
}

test('monster_detect makes remote names perceptible only during map browsing', async () => {
    const { state, monster, env } = monsterDetectionFixture();
    const name = () => distant_monnam(monster, ARTICLE_NONE, undefined, state);
    assert.equal(canspotmon(monster, state), false);
    assert.equal(name(), 'it');
    const events = [];
    env.message = async () => {
        events.push('message');
        assert.equal(name(), 'it');
    };
    env.browseMap = async () => {
        events.push('browse');
        // detect.c:854-856 sets EDetect_monsters before browse_map; the
        // display.h canspotmon predicate and do_name.c both consume it.
        assert.equal(state.u.uprops[DETECT_MONSTERS].extrinsic, I_SPECIAL);
        assert.equal(canspotmon(monster, state), true);
        assert.equal(name(), 'newt');
    };
    env.mapRedisplay = async () => {
        events.push('redisplay');
        assert.equal(state.u.uprops[DETECT_MONSTERS].extrinsic, 0);
        assert.equal(name(), 'it');
    };
    assert.equal(await monster_detect(null, 0, state, env), 0);
    assert.deepEqual(events, ['message', 'browse', 'redisplay']);
});

test('monster_detect returns 1 when the live-monster scan finds no target',
    async () => {
        const { state, env } = monsterDetectionFixture();
        state.level.monlist = null;
        let called = false;
        env.cls = async () => { called = true; };
        assert.equal(await monster_detect(null, 0, state, env), 1);
        assert.equal(called, false);
    });

test('monster_detect consumes unconstrain_map result for blessed persistence',
    async () => {
        for (const unconstrained of [false, true]) {
            const { state, env } = monsterDetectionFixture();
            const events = [];
            env.unconstrainMap = () => unconstrained;
            env.displaySelf = () => events.push('self');
            env.message = async () => events.push('message');
            env.browseMap = async () => events.push('browse');
            env.mapRedisplay = async () => events.push('redisplay');
            assert.equal(await monster_detect(
                { cursed: false, blessed: true }, 0, state, env,
            ), 0);
            assert.deepEqual(events, unconstrained
                ? ['self', 'message', 'browse', 'redisplay']
                : ['self', 'message', 'redisplay']);
        }
    });

test('monster_detect clears only I_SPECIAL, including when browsing suspends', async () => {
    for (const suspended of [false, true]) {
        const { state, env } = monsterDetectionFixture();
        const detection = { intrinsic: 13, extrinsic: W_CHAIN };
        state.u.uprops[DETECT_MONSTERS] = detection;
        const suspension = new Error('input exhausted');
        let redisplayed = false;
        env.browseMap = async () => {
            assert.equal(detection.extrinsic, W_CHAIN | I_SPECIAL);
            assert.equal(detection.intrinsic, 13);
            if (suspended) throw suspension;
        };
        env.mapRedisplay = async () => { redisplayed = true; };
        if (suspended)
            await assert.rejects(monster_detect(null, 0, state, env),
                error => error === suspension);
        else
            assert.equal(await monster_detect(null, 0, state, env), 0);
        assert.deepEqual(detection, { intrinsic: 13, extrinsic: W_CHAIN });
        assert.equal(redisplayed, !suspended);
    }
});

test('monster_detect wakes helpless monsters even outside the selected class',
    async () => {
        const { state, monster, env } = monsterDetectionFixture();
        monster.msleeping = 1;
        monster.mfrozen = 4;
        monster.mcanmove = 0;
        const mapped = [];
        const messages = [];
        env.mapMonster = subject => mapped.push(subject);
        env.message = async line => messages.push(line);
        env.browseMap = async () => {};

        // detect.c:841-846 filters map_monst() by mclass but places cursed
        // object waking outside that filter, so the remote monster still wakes.
        assert.equal(await monster_detect(
            { cursed: true, blessed: false }, 999, state, env,
        ), 0);
        assert.deepEqual(mapped, []);
        assert.deepEqual(
            [monster.msleeping, monster.mfrozen, monster.mcanmove], [0, 0, 1],
        );
        assert.deepEqual(messages, [
            'You sense the presence of monsters.',
            'Monsters sense the presence of you.',
        ]);
    });

// The explicit search reads three things the automatic one never touches: the
// monster grid behind m_at(), the region list behind visible_region_at(), and
// each square's remembered glyph.
function explicitSearchState() {
    const state = searchState();
    state.level.monsters = [];
    state.level.regions = [];
    state.viz_array = [];
    return state;
}

// A fully visible ordinary level for findit(). The open room and empty object,
// monster, and trap indexes make every findone() callback take its empty arm.
function emptyFinditState() {
    const state = explicitSearchState();
    state.level.objects = Array.from(
        { length: COLNO }, () => Array(ROWNO).fill(null),
    );
    state.level.buriedobjlist = null;
    state.level.monsters = Array.from(
        { length: COLNO }, () => Array(ROWNO).fill(null),
    );
    state.viz_array = Array.from(
        { length: ROWNO }, () => Array(COLNO).fill(COULD_SEE),
    );
    state.invent = null;
    return state;
}

// A monster the hero can spot: not invisible, not hidden, not mimicking, and
// standing on a square cansee() reports lit. IN_SIGHT is what canSeeMonster()
// resolves through cansee().
function placeTestMonster(state, x, y, overrides = {}, speciesOverrides = {}) {
    const monster = newMonster({
        mx: x,
        my: y,
        mhp: 5,
        data: {
            // pmnames is what a name formatter would read; the arms this
            // slice reaches never format one.
            pmnames: ['newt', 'newt', 'newt'],
            mlet: speciesOverrides.mlet ?? S_FELINE,
            mflags1: speciesOverrides.mflags1 ?? 0,
            mflags2: 0,
            mflags3: 0,
        },
        ...overrides,
    });
    state.level.monsters[x] ??= [];
    state.level.monsters[x][y] = monster;
    state.viz_array[y] ??= [];
    state.viz_array[y][x] = COULD_SEE | IN_SIGHT;
    return monster;
}

function scriptedRandom(events, rnlResults, rn2Results = []) {
    const rnlQueue = [...rnlResults];
    const rn2Queue = [...rn2Results];
    return {
        rnl(bound) {
            events.push(`rnl(${bound})`);
            assert.ok(rnlQueue.length, `unexpected rnl(${bound})`);
            return rnlQueue.shift();
        },
        rn2(bound) {
            events.push(`rn2(${bound})`);
            assert.ok(rn2Queue.length, `unexpected rn2(${bound})`);
            return rn2Queue.shift();
        },
        done() {
            assert.deepEqual(rnlQueue, []);
            assert.deepEqual(rn2Queue, []);
        },
    };
}

function recordingOperations(state, events) {
    return {
        recalcBlockPoint(x, y) {
            const location = state.level.at(x, y);
            events.push(
                `recalc(${x},${y},${location.typ},${location.flags})`,
            );
        },
        unblockPoint(x, y) {
            events.push(
                `unblock(${x},${y},${state.level.at(x, y).typ})`,
            );
        },
        feelLocation(x, y) {
            events.push(`feelLocation(${x},${y})`);
        },
        feelNewSym(x, y) {
            events.push(`feelNewSym(${x},${y})`);
        },
        displayFoundTrap(trap, x, y) {
            assert.equal(trap.tseen, true);
            events.push(`displayTrap(${x},${y})`);
            return true;
        },
        revealFoundTrap() {},
        waitFoundTrap() {},
        nomulZero(env) {
            events.push('nomul(0)');
            nomul(0, env.state);
        },
        message(text, x, y) {
            events.push(`message(${x},${y},${text})`);
        },
    };
}

async function globalSearchState(extraRc = '', { blind = true } = {}) {
    const replay = await runSegment({
        seed: 2026072301,
        datetime: '20260723120000',
        nethackrc: 'OPTIONS=name:TactileSearch,role:Ranger,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + `!splash_screen${blind ? ',blind' : ''}\n${extraRc}`,
        moves: ' ',
    });
    const target = { x: game.u.ux - 1, y: game.u.uy - 1 };
    for (let x = game.u.ux - 1; x <= game.u.ux + 1; ++x) {
        for (let y = game.u.uy - 1; y <= game.u.uy + 1; ++y) {
            if (x === game.u.ux && y === game.u.uy) continue;
            const location = game.level.at(x, y);
            location.typ = ROOM;
            location.flags = location.doormask = 0;
            location.remembered_glyph = undefined;
            location.seenv = 0;
            game.level.objects[x][y] = null;
            game.level.monsters[x][y] = null;
        }
    }
    game.level.traps = [];
    return { ...target, replay };
}

function installUnseenAntiMagicTrap(target) {
    // ANTI_MAGIC follows the ordinary, non-statue find_trap() branch.
    const trap = {
        tx: target.x,
        ty: target.y,
        ttyp: ANTI_MAGIC,
        tseen: false,
    };
    game.level.traps.push(trap);
    return trap;
}

function installVisibleGasOverlay(target) {
    const region = create_region([{
        lx: target.x,
        ly: target.y,
        hx: target.x,
        hy: target.y,
    }]);
    region.visible = true;
    game.level.regions.push(region);
    return region;
}

function tactileSearchRandom(expectedBound) {
    const calls = [];
    return {
        calls,
        rnl(bound) {
            calls.push(`rnl(${bound})`);
            assert.equal(bound, expectedBound);
            return 0;
        },
        rn2(bound) {
            calls.push(`rn2(${bound})`);
            assert.equal(bound, 19);
            return 18;
        },
    };
}

// Map memory stores C's own levl[x][y].glyph and nothing else, so every
// remembered square is one number. Reading that number back off the
// presentation the call under test returned would compare production output
// with itself, so every caller that can derive the number from the source
// tables does, and this helper only says what the record's shape is.
function rememberedGlyphContract(glyph) {
    return { glyph: typeof glyph === 'number' ? glyph : glyph.glyph };
}

function assertCompleteMappedGlyph(
    location,
    glyph,
    label = '',
) {
    assert.deepEqual({
        ch: location.disp_ch,
        color: location.disp_color,
        dec: Boolean(location.disp_decgfx),
        attr: location.disp_attr ?? 0,
        displayCh: location.disp_browser_ch ?? null,
        displayColor: location.disp_browser_color ?? null,
        displayAttr: location.disp_browser_attr ?? null,
    }, {
        ch: glyph.ch,
        color: glyph.color,
        dec: Boolean(glyph.dec),
        attr: glyph.attr ?? 0,
        displayCh: glyph.displayCh ?? null,
        displayColor: glyph.displayColor
            ?? (glyph.displayCh ? glyph.color : null),
        displayAttr: glyph.displayCh ? glyph.attr ?? 0 : null,
    }, label);
    assert.deepEqual(
        location.remembered_glyph,
        rememberedGlyphContract(glyph),
        label,
    );
}

function captureInputBoundaries() {
    const captures = [];
    const original = game._preNhgetchHook;
    game._preNhgetchHook = async () => {
        captures.push({
            grid: game.nhDisplay.grid.map(
                (row) => row.map((cell) => ({ ...cell })),
            ),
            cursor: [
                game.nhDisplay.cursorCol,
                game.nhDisplay.cursorRow,
                1,
            ],
        });
        if (original) await original();
    };
    return captures;
}

function screenRow(grid, row) {
    return grid[row].map(({ ch }) => ch).join('');
}

function assertTemporaryTrapScreen(capture, trap, hero) {
    const { grid, cursor } = capture;
    assert.equal(
        screenRow(grid, 0).trimEnd(),
        'You find an anti-magic field.--More--',
    );
    const mapCells = [];
    for (let row = 1; row < 22; ++row) {
        for (let column = 0; column < 80; ++column) {
            if (grid[row][column].ch !== ' ')
                mapCells.push([column, row, grid[row][column].ch]);
        }
    }
    assert.deepEqual(mapCells, [
        [trap.x - 1, trap.y + 1, '^'],
        [hero.x - 1, hero.y + 1, '@'],
    ].sort((left, right) => left[1] - right[1] || left[0] - right[0]));
    // The 29-byte message plus the eight-byte tty prompt leaves C's cursor
    // immediately after --More--.
    assert.deepEqual(cursor, [37, 0, 1]);
}

test('automatic search reveals a secret door in source operation order', async () => {
    const state = searchState();
    const location = state.level.at(9, 9);
    location.typ = SDOOR;
    location.flags = D_LOCKED | D_TRAPPED | 0x03;
    location.doormask = location.flags;
    location.candig = true;
    const events = [];
    const random = scriptedRandom(events, [0], [18]);

    await dosearch0(1, {
        state,
        random,
        ...recordingOperations(state, events),
    });

    assert.deepEqual(events, [
        'rnl(7)',
        `recalc(9,9,${DOOR},${D_LOCKED | D_TRAPPED})`,
        'rn2(19)',
        'nomul(0)',
        'feelLocation(9,9)',
        'message(9,9,You find a hidden door.)',
    ]);
    assert.equal(location.typ, DOOR);
    assert.equal(location.flags, D_LOCKED | D_TRAPPED);
    assert.equal(location.doormask, D_LOCKED | D_TRAPPED);
    assert.equal(location.candig, false);
    assert.equal(state.u.aexe[2], 1);
    assert.equal(state.multi, 0);
    assert.equal(state.context.run, 0);
    assert.equal(state.context.travel, 0);
    assert.equal(state.context.travel1, 0);
    assert.equal(state.context.mv, 0);
    assert.equal(state.disp.botl, true);
    assert.equal(state.u.uinvulnerable, false);
    assert.equal(state.u.usleep, 0);
    random.done();
});

test('a secret door found in production ends the turn through nomul(0)',
    async () => {
        // The harness above supplies its own nomul(0), so nothing there
        // exercises the one searchEnv() installs. Seed 8100006 puts an SDOOR
        // at <41,7> next to a Ranger starting at <42,8>, and ten `s` presses
        // find it; four do not. gm.multi_reason and gt.travelmap are written
        // by nomul(0) and end_running() and by nothing else in js/, so they
        // stay undefined until the find and separate a delegated call from a
        // skipped one. The same seed, rc and keys replay against the patched C
        // program with matching random-number calls, screens and cursors.
        const rc = 'OPTIONS=name:Searcher,role:Ranger,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + 'time';
        const segment = (moves) => ({
            seed: 8100006, datetime: '20260807140000', nethackrc: rc, moves,
        });

        await runSegment(segment('ssss'));
        assert.equal(game.level.at(41, 7).typ, SDOOR);
        assert.equal(game.multi_reason, undefined);
        assert.equal(game.travelmap, undefined);

        await runSegment(segment('ssssssssss'));
        assert.equal(game.level.at(41, 7).typ, DOOR);
        assert.equal(game.multi_reason, null);
        assert.equal(game.multireasonbuf, '');
        assert.equal(game.travelmap, null);
    });

test('secret-door conversion closes unlocked doors and opens rogue doors', () => {
    const ordinary = searchState();
    const ordinaryDoor = ordinary.level.at(9, 9);
    ordinaryDoor.typ = SDOOR;
    ordinaryDoor.flags = D_TRAPPED | 0x02;
    ordinaryDoor.candig = true;
    cvt_sdoor_to_door(ordinaryDoor, ordinary);
    assert.equal(ordinaryDoor.typ, DOOR);
    assert.equal(ordinaryDoor.flags, D_TRAPPED | D_CLOSED);
    assert.equal(ordinaryDoor.doormask, D_TRAPPED | D_CLOSED);
    assert.equal(ordinaryDoor.candig, false);

    const rogue = searchState();
    rogue.rogue_level = { ...rogue.u.uz };
    const rogueDoor = rogue.level.at(9, 9);
    rogueDoor.typ = SDOOR;
    rogueDoor.flags = D_LOCKED | D_TRAPPED | 0x03;
    cvt_sdoor_to_door(rogueDoor, rogue);
    assert.equal(rogueDoor.typ, DOOR);
    assert.equal(rogueDoor.flags, 0);
    assert.equal(rogueDoor.doormask, 0);
});

test('automatic search reveals a secret corridor before exercise and display', async () => {
    const state = searchState();
    state.level.at(9, 9).typ = SCORR;
    const events = [];
    const random = scriptedRandom(events, [0], [18]);

    await dosearch0(true, {
        state,
        random,
        ...recordingOperations(state, events),
    });

    assert.deepEqual(events, [
        'rnl(7)',
        `unblock(9,9,${CORR})`,
        'rn2(19)',
        'nomul(0)',
        'feelNewSym(9,9)',
        'message(9,9,You find a hidden passage.)',
    ]);
    assert.equal(state.level.at(9, 9).typ, CORR);
    assert.equal(state.u.aexe[2], 1);
    random.done();
});

test('blind tactile search records all eight source viewing vectors', async () => {
    const origin = await globalSearchState(
        String.raw`SYMBOLS=S_corr:\m#` + '\n',
    );
    // display.c set_seenv() indexes by sign(hero.y - target.y), so the upper
    // row uses SV4..SV6 and the lower row uses SV2..SV0.
    const directions = [
        [-1, -1, SV4], [0, -1, SV5], [1, -1, SV6],
        [-1, 0, SV3],                    [1, 0, SV7],
        [-1, 1, SV2],  [0, 1, SV1],   [1, 1, SV0],
    ];

    for (const [dx, dy, seenv] of directions) {
        const x = game.u.ux + dx;
        const y = game.u.uy + dy;
        const location = game.level.at(x, y);
        location.typ = SCORR;
        const random = tactileSearchRandom(7);

        await dosearch0(1, {
            state: game,
            random,
            message: async () => {},
        });

        const expected = map_glyphinfo(back_to_glyph(x, y, game), game);
        assert.equal(location.typ, CORR);
        assert.equal(location.seenv, seenv, `${dx},${dy}`);
        assert.deepEqual(random.calls, ['rnl(7)', 'rn2(19)']);
        assertCompleteMappedGlyph(location, expected, `${dx},${dy}`);
    }
});

test('glyph-number-to-memory conversion keeps only what C stores', () => {
    // display.h trap_to_glyph() for ANTI_MAGIC is one arbitrary cmap glyph
    // number; the presentation around it carries browser and colour fields
    // that map memory deliberately drops, because map_glyphinfo() rebuilds
    // them from the number at every draw.
    const glyph = map_glyphinfo(
        trap_to_glyph({ ttyp: ANTI_MAGIC }, game), game,
    );
    assert.deepEqual(
        remembered_glyph_from_presentation(glyph),
        { glyph: glyph.glyph },
    );
    assert.throws(
        () => remembered_glyph_from_presentation({
            ch: '^',
            color: 12,
            dec: false,
        }),
        /requires a resolved glyph number/u,
    );
});

test('ordinary trap discovery marks seen before exercise and display', async () => {
    const state = searchState();
    const trap = {
        tx: 9,
        ty: 9,
        ttyp: ANTI_MAGIC,
        tseen: false,
    };
    state.level.traps.push(trap);
    const events = [];
    const random = scriptedRandom(events, [0], [18]);
    const operations = recordingOperations(state, events);
    const originalRn2 = random.rn2;
    random.rn2 = (bound) => {
        assert.equal(trap.tseen, true);
        return originalRn2(bound);
    };

    await dosearch0(1, {
        state,
        random,
        ...operations,
    });

    assert.deepEqual(events, [
        'rnl(8)',
        'nomul(0)',
        'rn2(19)',
        'displayTrap(9,9)',
        'message(9,9,You find an anti-magic field.)',
    ]);
    assert.equal(trap.tseen, true);
    assert.equal(state.u.aexe[2], 1);
    random.done();
});

test('injected trap display must return semantic visibility', async () => {
    const state = searchState();
    const trap = {
        tx: 9,
        ty: 9,
        ttyp: ANTI_MAGIC,
        tseen: false,
    };
    state.level.traps.push(trap);
    const events = [];
    const random = scriptedRandom(events, [0], [18]);

    await assert.rejects(
        dosearch0(1, {
            state,
            random,
            ...recordingOperations(state, events),
            displayFoundTrap() {
                events.push('displayTrapWithoutIdentity');
            },
        }),
        /displayFoundTrap must return a Boolean/u,
    );
    assert.deepEqual(events, [
        'rnl(8)',
        'nomul(0)',
        'rn2(19)',
        'displayTrapWithoutIdentity',
    ]);
    random.done();
});

test('blind global search maps an ordinary trap through tactile defaults', async () => {
    const target = await globalSearchState();
    const trap = installUnseenAntiMagicTrap(target);
    const random = tactileSearchRandom(8);

    await dosearch0(1, { state: game, random });

    const expected = trap_glyph_info(trap, game);
    const location = game.level.at(target.x, target.y);
    assert.equal(trap.tseen, true);
    assert.equal(location.seenv, SV4);
    assert.deepEqual(random.calls, ['rnl(8)', 'rn2(19)']);
    assertCompleteMappedGlyph(location, expected);
});

test('blind tactile mapping delegates unavailable floors to display.c', async () => {
    // display.c feel_location() owns the water-level early return and the
    // independent Punished ball/chain memory terms. The two object fields live
    // on the state root, not on `u`, exactly as youprop.h:77 defines Punished.
    const cases = [
        ['uinwater', (state) => { state.u.uinwater = true; }],
        ['uball', (state) => { state.uball = { owornmask: W_BALL }; }],
        ['uchain', (state) => { state.uchain = { owornmask: W_CHAIN }; }],
    ];
    for (const [label, punish] of cases) {
        const target = await globalSearchState();
        punish(game);
        const square = game.level.at(target.x, target.y);
        feel_location(target.x, target.y, game);
        if (label === 'uinwater') {
            assert.equal(square.seenv ?? 0, 0, label);
        } else {
            assert.notEqual(square.seenv ?? 0, 0, label);
        }
    }
});

test('default trap comparison preserves injected mapping contracts', async () => {
    const cases = [
        {
            label: 'matching logical owner',
            descriptor: (trap) => ({ kind: 'trap', owner: trap }),
            waits: false,
        },
        {
            label: 'different logical owner',
            descriptor: () => ({ kind: 'trap', owner: {} }),
            waits: true,
        },
        {
            label: 'different logical trap type',
            descriptor: () => ({ kind: 'trap', trapType: STATUE_TRAP }),
            waits: true,
        },
        {
            label: 'presentation fallback',
            descriptor: null,
            waits: false,
        },
    ];
    for (const { label, descriptor, waits } of cases) {
        const target = await globalSearchState();
        const trap = installUnseenAntiMagicTrap(target);
        const location = game.level.at(target.x, target.y);
        const expected = trap_glyph_info(trap, game);
        const beforeWait = target.replay.getScreens().length;
        const random = tactileSearchRandom(8);
        const captures = waits ? captureInputBoundaries() : [];
        if (waits) game.nhDisplay.pushKey(' '.charCodeAt(0));

        await dosearch0(1, {
            state: game,
            random,
            feelNewSym() {
                if (descriptor) {
                    // The default path (defaultFeelSearchLocation) calls
                    // map_trap which sets remembered_glyph before returning
                    // the layer descriptor. The hook must do the same so
                    // that docrt()'s newsym redraw finds the trap in memory.
                    location.remembered_glyph
                        = remembered_glyph_from_presentation(expected);
                    return descriptor(trap);
                }
                location.disp_ch = expected.ch;
                location.disp_color = expected.color;
                location.disp_decgfx = expected.dec;
                return undefined;
            },
        });

        assert.equal(trap.tseen, true, label);
        assert.equal(
            target.replay.getScreens().length,
            beforeWait + (waits ? 1 : 0),
            label,
        );
        if (waits) {
            assert.equal(game.nhDisplay.inputQueueLength, 0, label);
            assertTemporaryTrapScreen(
                captures.at(-1),
                target,
                { x: game.u.ux, y: game.u.uy },
            );
            assert.deepEqual(
                [
                    location.disp_ch,
                    location.disp_color,
                    Boolean(location.disp_decgfx),
                ],
                [expected.ch, expected.color, Boolean(expected.dec)],
                `${label}: final redraw`,
            );
        }
        assert.deepEqual(random.calls, ['rnl(8)', 'rn2(19)'], label);
    }
});

test('blind tactile mapping reveals only feelable engravings below a trap', async () => {
    // engrave.c engr_can_be_felt() accepts carved text but rejects dust.
    for (const [engrType, expectedRevealed] of [
        [ENGRAVE, 1],
        [DUST, 0],
    ]) {
        const target = await globalSearchState();
        const engraving = {
            engr_x: target.x,
            engr_y: target.y,
            engr_type: engrType,
            erevealed: 0,
            nxt_engr: null,
        };
        game.head_engr = engraving;
        installUnseenAntiMagicTrap(target);

        await dosearch0(1, {
            state: game,
            random: tactileSearchRandom(8),
            message: async () => {},
            waitFoundTrap: async () => {},
        });

        assert.equal(engraving.erevealed, expectedRevealed);
    }
});

test('trap clutter uses logical layers when custom symbols collide', async () => {
    const target = await globalSearchState(
        'OPTIONS=!color\nSYMBOLS=S_food:^\n',
    );
    const location = game.level.at(target.x, target.y);
    const trap = installUnseenAntiMagicTrap(target);
    const corpse = {
        otyp: CORPSE,
        oclass: FOOD_CLASS,
        corpsenm: 0,
        dknown: true,
        where: OBJ_FLOOR,
        ox: target.x,
        oy: target.y,
        nexthere: null,
    };
    game.level.objects[target.x][target.y] = corpse;
    const engraving = {
        engr_x: target.x,
        engr_y: target.y,
        engr_type: ENGRAVE,
        erevealed: 0,
        nxt_engr: null,
    };
    game.head_engr = engraving;

    const objectGlyph = object_glyph_info(corpse, game);
    const trapGlyph = trap_glyph_info(trap, game);
    assert.deepEqual({
        ch: objectGlyph.ch,
        color: objectGlyph.color,
        dec: objectGlyph.dec,
    }, {
        ch: trapGlyph.ch,
        color: trapGlyph.color,
        dec: trapGlyph.dec,
    }, 'the valid custom configuration creates a presentation collision');

    const beforeWait = target.replay.getScreens().length;
    enableBrowserGlyphProjection(game.nhDisplay);
    const staleBrowserCell = game.level.at(target.x + 2, target.y);
    // Seed stale browser-only presentation so cls() must clear every pending
    // projection field before the temporary trap frame is flushed.
    staleBrowserCell.disp_browser_ch = '✦';
    staleBrowserCell.disp_browser_color = 'rgb(1, 2, 3)';
    staleBrowserCell.disp_browser_attr = 4;
    const captures = captureInputBoundaries();
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    const random = tactileSearchRandom(8);
    await dosearch0(1, { state: game, random });

    assert.equal(trap.tseen, true);
    assert.equal(engraving.erevealed, 1);
    assert.equal(location.seenv, SV4);
    assert.equal(target.replay.getScreens().length, beforeWait + 1);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
    assert.deepEqual(random.calls, ['rnl(8)', 'rn2(19)']);
    // find_trap() calls map_trap(trap, 1) before its wait and docrt(); the
    // temporary frame shows the colliding trap symbol, but the discovered
    // trap owns the final map memory and redraw.
    assertCompleteMappedGlyph(location, trapGlyph);
    assertTemporaryTrapScreen(
        captures.at(-1),
        target,
        { x: game.u.ux, y: game.u.uy },
    );
});

test('sighted trap discovery records trap identity without a map wait', async () => {
    const target = await globalSearchState('', { blind: false });
    assert.ok(game.viz_array[target.y][target.x] & IN_SIGHT);
    const trap = installUnseenAntiMagicTrap(target);
    const beforeWait = target.replay.getScreens().length;
    const random = tactileSearchRandom(8);

    await dosearch0(1, { state: game, random });

    const location = game.level.at(target.x, target.y);
    assert.equal(target.replay.getScreens().length, beforeWait);
    assert.deepEqual(random.calls, ['rnl(8)', 'rn2(19)']);
    assertCompleteMappedGlyph(location, trap_glyph_info(trap, game));
});

test('sighted trap discovery compares memory retained under a gas region', async () => {
    const target = await globalSearchState('', { blind: false });
    assert.ok(game.viz_array[target.y][target.x] & IN_SIGHT);
    const location = game.level.at(target.x, target.y);
    const priorMemory = location.remembered_glyph;
    const trap = installUnseenAntiMagicTrap(target);
    installVisibleGasOverlay(target);
    newsym(target.x, target.y);
    assert.deepEqual(
        location.remembered_glyph,
        priorMemory,
        'newsym leaves levl glyph memory unchanged below the gas overlay',
    );
    const captures = captureInputBoundaries();
    game.nhDisplay.pushKey(' '.charCodeAt(0));

    const beforeWait = target.replay.getScreens().length;
    await dosearch0(1, {
        state: game,
        random: tactileSearchRandom(8),
    });

    assert.equal(trap.tseen, true);
    // find_trap() then follows its source path through map_trap(trap, 1),
    // which owns the final memory used by the later docrt().
    assert.deepEqual(
        location.remembered_glyph,
        rememberedGlyphContract(trap_glyph_info(trap, game)),
    );
    assert.equal(target.replay.getScreens().length, beforeWait + 1);
    assertTemporaryTrapScreen(
        captures.at(-1),
        target,
        { x: game.u.ux, y: game.u.uy },
    );
});

test('a telepathically sensed visible mimic shows real form and remembers disguise', async () => {
    const target = await globalSearchState('', { blind: false });
    assert.ok(game.viz_array[target.y][target.x] & IN_SIGHT);
    const location = game.level.at(target.x, target.y);
    const trap = installUnseenAntiMagicTrap(target);
    installVisibleGasOverlay(target);
    const monster = {
        data: {
            mlet: S_FELINE,
            mcolor: CLR_WHITE,
            mflags1: 0,
            mflags2: 0,
        },
        mhp: 10,
        mtame: 0,
        minvis: false,
        mundetected: false,
        m_ap_type: M_AP_OBJECT,
        mappearance: CHEST,
        mx: target.x,
        my: target.y,
    };
    game.level.monsters[target.x][target.y] = monster;
    // C's docrt() redraws the remembered map and then see_monsters() walks
    // fmon. Keep the synthetic monster in that level-wide chain too, or the
    // final redraw cannot overlay its real form over the remembered disguise.
    monster.nmon = game.level.monlist;
    game.level.monlist = monster;
    game.u.uprops ??= [];
    // The diagonal target has squared distance two, is IN_SIGHT, and is a
    // non-invisible mimic. Range three telepathy therefore adds a
    // non-detection sense to physical visibility, selecting PHYSICALLY_SEEN.
    game.u.uprops[TELEPAT] = {
        intrinsic: 0,
        extrinsic: 1,
        blocked: 0,
    };
    game.u.unblind_telepat_range = 3;
    const captures = captureInputBoundaries();
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    const beforeWait = target.replay.getScreens().length;
    const random = tactileSearchRandom(8);

    await dosearch0(1, { state: game, random });

    const shown = monster_glyph_info({
        ...monster,
        m_ap_type: 0,
    }, game);
    const disguise = monster_glyph_info(monster, game);
    assert.deepEqual({
        ch: location.disp_ch,
        color: location.disp_color,
        dec: Boolean(location.disp_decgfx),
        attr: location.disp_attr ?? 0,
    }, {
        ch: shown.ch,
        color: shown.color,
        dec: Boolean(shown.dec),
        attr: shown.attr ?? 0,
    });
    assert.deepEqual(
        location.remembered_glyph,
        rememberedGlyphContract(disguise),
    );
    assert.equal(target.replay.getScreens().length, beforeWait + 1);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
    assertTemporaryTrapScreen(
        captures.at(-1),
        target,
        { x: game.u.ux, y: game.u.uy },
    );
    assert.deepEqual(random.calls, ['rnl(8)', 'rn2(19)']);
});

test('detect-only mimic presentation retains the underlying trap memory', async () => {
    for (const inverse of [true, false]) {
        const target = await globalSearchState('', { blind: false });
        const location = game.level.at(target.x, target.y);
        const trap = installUnseenAntiMagicTrap(target);
        installVisibleGasOverlay(target);
        const monster = {
            data: {
                mlet: S_FELINE,
                mcolor: CLR_WHITE,
                mflags1: 0,
                mflags2: 0,
            },
            mhp: 10,
            mtame: 0,
            minvis: true,
            mundetected: false,
            m_ap_type: M_AP_OBJECT,
            mappearance: CHEST,
            mx: target.x,
            my: target.y,
        };
        game.level.monsters[target.x][target.y] = monster;
        game.u.uprops ??= [];
        game.u.uprops[DETECT_MONSTERS] = {
            intrinsic: 1,
            extrinsic: 0,
            blocked: 0,
        };
        game.iflags.wc_inverse = inverse;
        const beforeWait = target.replay.getScreens().length;
        const random = tactileSearchRandom(8);

        await dosearch0(1, { state: game, random });

        const shown = monster_glyph_info({
            ...monster,
            m_ap_type: 0,
        }, game);
        assert.deepEqual({
            ch: location.disp_ch,
            color: location.disp_color,
            dec: Boolean(location.disp_decgfx),
            attr: location.disp_attr ?? 0,
        }, {
            ch: shown.ch,
            color: shown.color,
            dec: Boolean(shown.dec),
            attr: inverse ? ATR_INVERSE : 0,
        }, `wc_inverse=${inverse}`);
        // The expected number comes from display.h trap_to_glyph() over
        // rm.h trap_to_defsym(), not from trap_glyph_info()'s own answer, so
        // this fails if the production path stores a different trap's number.
        assert.deepEqual(
            location.remembered_glyph,
            rememberedGlyphContract(trap_to_glyph({ ttyp: trap.ttyp }, game)),
        );
        assert.equal(target.replay.getScreens().length, beforeWait);
        assert.deepEqual(random.calls, ['rnl(8)', 'rn2(19)']);
    }
});

test('disabled hero memory retains prior visible and tactile memory', async () => {
    for (const [label, blind] of [
        ['visible', false],
        ['tactile', true],
    ]) {
        const target = await globalSearchState('', { blind });
        game.level.flags.hero_memory = false;
        const location = game.level.at(target.x, target.y);
        // A glyph number this square would never write for itself, so a
        // record left in place is distinguishable from one rewritten.
        // display.h objnum_to_glyph(0) is the strange-object glyph.
        const retained = { glyph: GLYPH_OBJ_OFF };
        location.remembered_glyph = retained;
        installUnseenAntiMagicTrap(target);
        const beforeWait = target.replay.getScreens().length;
        game.nhDisplay.pushKey(' '.charCodeAt(0));

        await dosearch0(1, {
            state: game,
            random: tactileSearchRandom(8),
        });

        assert.equal(location.remembered_glyph, retained, label);
        assert.equal(
            target.replay.getScreens().length,
            beforeWait + 1,
            label,
        );
        assert.equal(game.nhDisplay.inputQueueLength, 0, label);
    }
});

test('WIN_STOP suppresses trap input waiting but still redraws', async () => {
    const target = await globalSearchState('', { blind: false });
    const location = game.level.at(target.x, target.y);
    const trap = installUnseenAntiMagicTrap(target);
    installVisibleGasOverlay(target);
    game._ttyMessageStopped = true;
    // This rejection key must remain queued, proving that WIN_STOP skipped the
    // --More-- input boundary even though docrt() still restored the map.
    game.nhDisplay.pushKey('x'.charCodeAt(0));
    const beforeWait = target.replay.getScreens().length;
    const random = tactileSearchRandom(8);

    await dosearch0(1, { state: game, random });

    assert.equal(trap.tseen, true);
    assert.equal(location.disp_ch, trap_glyph_info(trap, game).ch);
    assert.equal(game._pending_message, '');
    assert.equal(game._ttyMessageStopped, true);
    assert.equal(game.nhDisplay.inputQueueLength, 1);
    assert.equal(target.replay.getScreens().length, beforeWait);
    assert.deepEqual(random.calls, ['rnl(8)', 'rn2(19)']);
});

test('injected trap messaging requires paired wait ownership', async () => {
    const target = await globalSearchState();
    const trap = installUnseenAntiMagicTrap(target);
    const random = tactileSearchRandom(8);

    await assert.rejects(
        dosearch0(1, {
            state: game,
            random,
            message: async () => {},
        }),
        /injected waitFoundTrap when trap messaging is injected/u,
    );
    assert.equal(trap.tseen, false);
    assert.deepEqual(random.calls, ['rnl(8)']);
});

test('statue discovery activates, conditionally exercises, and returns early', async () => {
    for (const animated of [null, { m_id: 17 }]) {
        const state = searchState();
        const trap = {
            tx: 9,
            ty: 9,
            ttyp: STATUE_TRAP,
            tseen: false,
        };
        state.level.traps.push(trap);
        // A later source-order candidate must not be visited after the
        // unconditional return from the STATUE_TRAP branch.
        state.level.at(11, 11).typ = SDOOR;
        const events = [];
        const random = scriptedRandom(
            events,
            [0],
            animated ? [18] : [],
        );

        await dosearch0(1, {
            state,
            random,
            ...recordingOperations(state, events),
            activateStatueTrap(found, x, y, shatter) {
                assert.equal(found, trap);
                assert.equal(shatter, false);
                events.push(`activate(${x},${y})`);
                return animated;
            },
        });

        assert.deepEqual(events, animated ? [
            'rnl(8)',
            'nomul(0)',
            'activate(9,9)',
            'rn2(19)',
        ] : [
            'rnl(8)',
            'nomul(0)',
            'activate(9,9)',
        ]);
        assert.equal(state.u.aexe[2], animated ? 1 : 0);
        random.done();
    }
});

test('cluttered and hallucinatory trap finds reveal, wait, then redraw', async () => {
    for (const hallucinating of [false, true]) {
        const state = searchState();
        const trap = {
            tx: 9,
            ty: 9,
            ttyp: ANTI_MAGIC,
            tseen: false,
        };
        state.level.traps.push(trap);
        if (hallucinating) {
            state.u.uprops[HALLUC] = {
                intrinsic: 1,
                extrinsic: 0,
                blocked: 0,
            };
        }
        const events = [];
        const random = scriptedRandom(events, [0], [18]);
        await dosearch0(1, {
            state,
            random,
            ...recordingOperations(state, events),
            displayFoundTrap() {
                events.push('displayTrap');
                return hallucinating ? true : false;
            },
            revealFoundTrap() {
                events.push('revealTrap');
            },
            waitFoundTrap() {
                events.push('waitAndRedraw');
            },
            trapName() {
                return 'anti-magic field';
            },
        });

        assert.deepEqual(events, [
            'rnl(8)',
            'nomul(0)',
            'rn2(19)',
            'displayTrap',
            'revealTrap',
            'message(9,9,You find an anti-magic field.)',
            'waitAndRedraw',
        ]);
        random.done();
    }
});

test('automatic search computes artifact and lenses fund before rnl', async () => {
    const state = searchState();
    state.level.at(9, 9).typ = SDOOR;
    state.artilist = [{}, { spfx: SPFX_SEARCH }];
    state.uwep = { oartifact: 1, spe: 4 };
    state.ublindf = { otyp: LENSES };
    let events = [];
    let random = scriptedRandom(events, [1]);

    await dosearch0(1, {
        state,
        random,
        ...recordingOperations(state, events),
    });
    assert.deepEqual(events, ['rnl(2)']);
    random.done();

    const blind = searchState();
    blind.level.at(9, 9).typ = SDOOR;
    blind.artilist = [{}, { spfx: SPFX_SEARCH }];
    blind.uwep = { oartifact: 1, spe: 4 };
    blind.ublindf = { otyp: LENSES };
    blind.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    events = [];
    random = scriptedRandom(events, [1]);
    await dosearch0(1, {
        state: blind,
        random,
        ...recordingOperations(blind, events),
    });
    assert.deepEqual(events, ['rnl(3)']);
    random.done();
});

test('automatic search scans x-major and only draws for source candidates', async () => {
    const state = searchState();
    state.level.at(9, 9).typ = SDOOR;
    state.level.traps.push({
        tx: 9, ty: 10, ttyp: ANTI_MAGIC, tseen: false,
    });
    state.level.at(9, 11).typ = SCORR;
    state.level.traps.push({
        tx: 10, ty: 9, ttyp: ANTI_MAGIC, tseen: true,
    });
    state.level.at(10, 10).typ = SDOOR; // u_at(), so never examined.
    const events = [];
    const random = scriptedRandom(events, [1, 1, 1]);

    await dosearch0(1, {
        state,
        random,
        ...recordingOperations(state, events),
    });

    assert.deepEqual(events, ['rnl(7)', 'rnl(8)', 'rnl(7)']);
    random.done();
});

test('a missed statue search draws before requiring its hit operation', async () => {
    const state = searchState();
    const trap = {
        tx: 9,
        ty: 9,
        ttyp: STATUE_TRAP,
        tseen: false,
    };
    state.level.traps.push(trap);
    const events = [];
    let random = scriptedRandom(events, [1]);
    await dosearch0(1, {
        state,
        random,
        ...recordingOperations(state, events),
    });
    assert.deepEqual(events, ['rnl(8)']);
    assert.equal(trap.tseen, false);
    assert.equal(state.multi, 4);
    random.done();

    events.length = 0;
    random = scriptedRandom(events, [0]);
    await assert.rejects(
        dosearch0(1, {
            state,
            random,
            ...recordingOperations(state, events),
        }),
        /requires activateStatueTrap for a statue trap/,
    );
    assert.deepEqual(events, ['rnl(8)']);
    assert.equal(trap.tseen, false);
    assert.equal(state.multi, 4);
    random.done();
});

test('a blind miss draws before tactile display preflight', async () => {
    const state = searchState();
    state.level.at(9, 9).typ = SDOOR;
    state.u.uprops[BLINDED] = {
        intrinsic: 1,
        extrinsic: 0,
        blocked: 0,
    };
    const events = [];
    const random = scriptedRandom(events, [1]);

    await dosearch0(1, { state, random });

    assert.deepEqual(events, ['rnl(7)']);
    assert.equal(state.level.at(9, 9).typ, SDOOR);
    random.done();
});

// The six events detect.c:2042-2051 produces when rnl(7 - fund) hits on an
// adjacent secret door. Every row below keeps that door, so the automatic arm
// has real work to do on the very state that stops the explicit one.
const FOUND_DOOR_EVENTS = Object.freeze([
    'rnl(7)',
    `recalc(9,9,${DOOR},${D_CLOSED})`,
    'rn2(19)',
    'nomul(0)',
    'feelLocation(9,9)',
    'message(9,9,You find a hidden door.)',
]);

// C keeps the remaining unported explicit-search branches behind the same
// source flag split. The mfind0() discovery arms are implemented below;
// UnsupportedSearchError belongs to the remaining explicit `s` command gaps,
// which js/cmd.js failClosedCommand() converts into a retryable boundary.
// allmain.c:342-344 drives the automatic arm from moveloop_core(), where no
// converting wrapper exists, so a refusal that leaked across the aflag split
// would escape runSegment() and cost the segment every screen it matched.
test('every explicit search refusal leaves the automatic arm intact', async () => {
    const rows = [
        // detect.c:2079-2088 is the one block C does not gate on aflag, so the
        // automatic arm reaches the same two unported branches. It refuses
        // them from preflightTrap() as plain Errors, after the rnl(8) that
        // selects the square -- never as UnsupportedSearchError. A miss here
        // is what lets the automatic row finish; the hit is pinned separately,
        // 'a missed statue search draws before requiring its hit operation'
        // and 'cluttered and hallucinatory trap finds reveal, wait, then
        // redraw'.
        ['an adjacent statue trap', (state) => {
            state.level.traps.push({
                tx: 11, ty: 11, ttyp: STATUE_TRAP, tseen: false,
            });
        }, /activate_statue_trap\(\)/, [0, 1],
        [...FOUND_DOOR_EVENTS, 'rnl(8)']],
        ['a hallucinatory trap find', (state) => {
            state.u.uprops[HALLUC] = {
                intrinsic: 1, extrinsic: 0, blocked: 0,
            };
            state.level.traps.push({
                tx: 11, ty: 11, ttyp: ANTI_MAGIC, tseen: false,
            });
        }, /hallucinatory display/, [0, 1],
        [...FOUND_DOOR_EVENTS, 'rnl(8)']],
        // detect.c:2022-2024 skips the whole loop for both flags and answers
        // only the explicit search, through Norep(). The empty draw list is
        // what separates this row from the ten above.
        ['a swallowed hero', (state) => {
            state.u.uswallow = true;
        }, /searching while swallowed is not ported/, [], []],
    ];

    for (const [label, setup, expected, rnlResults, expectedEvents] of rows) {
        const state = explicitSearchState();
        state.level.at(9, 9).typ = SDOOR;
        setup(state);

        const refusedEvents = [];
        const refusedRandom = scriptedRandom(refusedEvents, []);
        await assert.rejects(dosearch0(0, {
            state,
            random: refusedRandom,
            ...recordingOperations(state, refusedEvents),
            newSym: (x, y) => refusedEvents.push(`newSym(${x},${y})`),
        }), (error) => error instanceof UnsupportedSearchError
            && expected.test(error.message), label);
        assert.deepEqual(refusedEvents, [], label);
        refusedRandom.done();
        assert.equal(state.level.at(9, 9).typ, SDOOR, label);

        const events = [];
        const random = scriptedRandom(events, rnlResults, expectedEvents.length
            ? [18] : []);
        assert.equal(await dosearch0(1, {
            state,
            random,
            ...recordingOperations(state, events),
            newSym: (x, y) => events.push(`newSym(${x},${y})`),
        }), 1, label);
        assert.deepEqual(events, expectedEvents, label);
        random.done();
        assert.equal(
            state.level.at(9, 9).typ,
            expectedEvents.length ? DOOR : SDOOR,
            label,
        );
    }
});

test('dosearch0 rejects a flag that is neither automatic nor explicit', async () => {
    await assert.rejects(
        dosearch0(2, { state: explicitSearchState() }),
        /automatic \(1\) or explicit \(0\) search flag/,
    );
});

// The explicit `s` command. Every case below asserts the recorded event list,
// because detect.c dosearch0() draws rnl() once per adjacent square inside its
// loop: a refusal that reached the loop would leave those draws spent.

test('explicit search reuses the secret-door arm and reconciles bare squares', async () => {
    const state = explicitSearchState();
    const location = state.level.at(9, 9);
    location.typ = SDOOR;
    const events = [];
    const random = scriptedRandom(events, [0], [18]);

    assert.equal(await dosearch0(0, {
        state,
        random,
        ...recordingOperations(state, events),
    }), 1);

    // The same six events the automatic arm records, and nothing more: with
    // no monster and no remembered invisible glyph, unmap_invisible() and
    // mfind0() are both silent on the other seven squares.
    assert.deepEqual(events, [
        'rnl(7)',
        `recalc(9,9,${DOOR},${D_CLOSED})`,
        'rn2(19)',
        'nomul(0)',
        'feelLocation(9,9)',
        'message(9,9,You find a hidden door.)',
    ]);
    assert.equal(location.typ, DOOR);
    random.done();
});

test('explicit search redraws an adjacent spotted monster and draws for its trap', async () => {
    const state = explicitSearchState();
    placeTestMonster(state, 9, 10, { mtame: 1 });
    const trap = {
        tx: 9, ty: 10, ttyp: ANTI_MAGIC, tseen: false,
    };
    state.level.traps.push(trap);
    const events = [];
    const random = scriptedRandom(events, [1]);

    assert.equal(await dosearch0(0, {
        state,
        random,
        ...recordingOperations(state, events),
        newSym: (x, y) => events.push(`newSym(${x},${y})`),
    }), 1);

    // mfind0() returns 0 for a spotted, unhidden monster after its newsym(),
    // and dosearch0() then still tests the trap under it.
    assert.deepEqual(events, ['newSym(9,10)', 'rnl(8)']);
    // The rnl(8) missed, so find_trap() never ran.
    assert.equal(trap.tseen, false);
    random.done();
});

test('explicit search executes every mfind0 discovery arm', async () => {
    const cases = [
        ['a mimic', { m_ap_type: M_AP_OBJECT }],
        ['an unspotted monster', { minvis: 1 }],
        // is_hider()/hides_under()/S_EEL, the three species tests mfind0()
        // applies to a mundetected monster.
        ['an eel', { mundetected: 1, mlet: S_EEL }],
        ['a ceiling hider', { mundetected: 1, mflags1: M1_HIDE }],
        ['an under-hider', { mundetected: 1, mflags1: M1_CONCEAL }],
    ];
    for (const [label, overrides] of cases) {
        const state = explicitSearchState();
        const { mlet, mflags1, ...monsterOverrides } = overrides;
        const monster = placeTestMonster(
            state, 9, 10, monsterOverrides, { mlet, mflags1 },
        );
        const events = [];
        const random = scriptedRandom(events, []);
        const result = await dosearch0(0, {
            state,
            random,
            ...recordingOperations(state, events),
            newSym: (x, y) => events.push(`newSym(${x},${y})`),
            exerciseWisdom: () => events.push('exerciseWisdom'),
            mapInvisible: (x, y) => events.push(`mapInvisible(${x},${y})`),
        });
        assert.equal(result, 1, label);
        assert.equal(Boolean(monster.mundetected), false, label);
        const expectedEvents = monsterOverrides.minvis
            ? [
                'newSym(9,10)',
                'exerciseWisdom',
                'mapInvisible(9,10)',
                'message(9,10,You feel an unseen monster!)',
            ]
            : [
                'newSym(9,10)',
                'exerciseWisdom',
                'message(9,10,You find a newt.)',
            ];
        assert.deepEqual(events, expectedEvents, label);
        random.done();
    }
});

test('mfind0 leaves an already marked invisible monster undiscovered', async () => {
    // detect.c:2000-2002 returns -1 after newsym() when the remembered glyph
    // is already GLYPH_INVISIBLE.  The search keeps scanning without another
    // Wisdom draw or the repeated unseen-monster message.
    const state = explicitSearchState();
    const monster = placeTestMonster(state, 9, 10, { minvis: 1 });
    state.level.at(monster.mx, monster.my).remembered_glyph = {
        glyph: GLYPH_INVISIBLE,
    };
    const events = [];
    const random = scriptedRandom(events, []);
    assert.equal(await dosearch0(0, {
        state,
        random,
        ...recordingOperations(state, events),
        newSym: (x, y) => events.push(`newSym(${x},${y})`),
    }), 1);
    assert.deepEqual(events, ['newSym(9,10)']);
    random.done();
});

test('warning_of matches the source warning predicate and cap', () => {
    const state = explicitSearchState();
    state.context.warnlevel = 1;
    state.u.uprops[WARNING] = { intrinsic: 1, extrinsic: 0 };
    const monster = placeTestMonster(state, 11, 10, { m_lev: 28 });
    assert.equal(warning_of(monster, state), 5);

    monster.mpeaceful = true;
    assert.equal(warning_of(monster, state), 0);
    monster.mpeaceful = false;
    state.context.warnlevel = 8;
    assert.equal(warning_of(monster, state), 0);
});

test('warnreveal scans the adjacent warning monsters through mfind0', async () => {
    const state = explicitSearchState();
    state.u.uprops[WARNING] = { intrinsic: 1, extrinsic: 0 };
    const monster = placeTestMonster(
        state,
        9,
        10,
        { m_lev: 8, mundetected: 1 },
        { mflags1: M1_HIDE },
    );
    const events = [];
    await warnreveal({
        state,
        newSym: (x, y) => events.push(`newSym(${x},${y})`),
        exerciseWisdom: () => events.push('exerciseWisdom'),
        mapInvisible: (x, y) => events.push(`mapInvisible(${x},${y})`),
        displayPendingTtyMessageWindow: () => events.push(
            'displayPendingTtyMessageWindow',
        ),
        message: (text, x, y) => events.push(`message(${x},${y},${text})`),
    });
    assert.equal(Boolean(monster.mundetected), false);
    assert.deepEqual(events, [
        'message(9,10,Your danger sense causes you to take a second look close by.)',
        'displayPendingTtyMessageWindow',
        'newSym(9,10)',
        'exerciseWisdom',
        'message(9,10,You find a newt.)',
    ]);
});

test('warnreveal uses the live default message and WIN_MESSAGE boundary',
    async () => {
    // This reaches the default allmain search environment, rather than the
    // injected event-only path above.  The real warning line carries the
    // source set_msg_xy() coordinate prefix, and the hidden monster is still
    // hidden at the nhgetch boundary which acknowledges WIN_MESSAGE.
    await runSegment({
        seed: 2026091702,
        datetime: '20260917090000',
        nethackrc: 'OPTIONS=name:WarnLive,role:Wizard,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + 'accessiblemsg\n',
        moves: ' ',
    });
    clearTtyMessageWindow(game);
    const x = game.u.ux - 1;
    const y = game.u.uy;
    const monster = placeTestMonster(
        game,
        x,
        y,
        { m_lev: 8, mundetected: 1 },
        { mflags1: M1_HIDE },
    );
    game.u.uprops[WARNING] = { intrinsic: 1, extrinsic: 0 };
    game.context.warnlevel = 1;
    game.iflags.getpos_coords = GPCOORDS_MAP;

    let beforeAcknowledgement;
    const originalHook = game._preNhgetchHook;
    const originalReadKey = game.nhDisplay.readKey;
    game._preNhgetchHook = async () => {
        beforeAcknowledgement = {
            line: screenRow(game.nhDisplay.grid, 0),
            hidden: Boolean(monster.mundetected),
            topline: game.nhDisplay.toplin,
        };
        if (originalHook) await originalHook();
    };
    game.nhDisplay.readKey = async () => ' '.charCodeAt(0);
    try {
        await warnreveal({ state: game });
    } finally {
        game.nhDisplay.readKey = originalReadKey;
        game._preNhgetchHook = originalHook;
    }

    assert.equal(beforeAcknowledgement.hidden, true);
    assert.equal(beforeAcknowledgement.topline, 1);
    assert.match(
        beforeAcknowledgement.line,
        new RegExp(`<${x},${y}>: Your danger sense causes you to take a second look close by\\.--More--`),
    );
    assert.equal(monster.mundetected, 0);
});

test('planning map_invisible writes cloned memory without painting live state',
    async () => {
    await runSegment({
        seed: 2026091701,
        datetime: '20260917090000',
        nethackrc: 'OPTIONS=name:MapMemory,role:Wizard,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
    const x = game.u.ux + 1;
    const y = game.u.uy;
    const liveLocation = game.level.at(x, y);
    const liveMemory = liveLocation.remembered_glyph;
    const liveDisplay = liveLocation.disp_ch;
    const clone = planningState(game);

    // display.c map_invisible() writes levl[].glyph even when its screen half
    // is suppressed by the planning seam. The clone owns a copied location
    // grid, so the live marker and presentation must remain unchanged.
    map_invisible_planning(x, y, clone);
    assert.equal(clone.level.at(x, y).remembered_glyph.glyph,
        GLYPH_INVISIBLE);
    assert.equal(liveLocation.remembered_glyph, liveMemory);
    assert.equal(liveLocation.disp_ch, liveDisplay);
});

test('M_AP_TYPE masks off the display-known flag', () => {
    // monst.h:69-70 splits m_ap_type into a 3-bit type and M_AP_F_DKNOWN at
    // 0x8; monst.h:73 masks before comparing. An unmasked read answers truthy
    // for M_AP_NOTHING with the flag set, which would make mfind0()'s mimic
    // arm swallow a monster C sends down the else arm.
    assert.equal(M_AP_TYPE({ m_ap_type: M_AP_F_DKNOWN }), 0);
    assert.equal(
        M_AP_TYPE({ m_ap_type: M_AP_OBJECT | M_AP_F_DKNOWN }),
        M_AP_OBJECT,
    );
    assert.equal(M_AP_TYPE({ m_ap_type: M_AP_OBJECT }), M_AP_OBJECT);
    assert.equal(M_AP_TYPE(undefined), 0);
});

test('explicit search admits a monster carrying only the dknown flag', async () => {
    // C's mfind0() reads M_AP_TYPE(mtmp), so m_ap_type == M_AP_F_DKNOWN is
    // M_AP_NOTHING and takes the else arm: newsym() and no discovery. The
    // port refused it while M_AP_TYPE() answered the unmasked 8.
    const state = explicitSearchState();
    placeTestMonster(state, 9, 10, { m_ap_type: M_AP_F_DKNOWN });
    const events = [];
    // No draw is expected anywhere: rnl(7 - fund) needs an SDOOR or SCORR and
    // rnl(8) sits behind `t_at(x, y)`, so eight ordinary empty squares consume
    // nothing.
    const random = scriptedRandom(events, []);

    assert.equal(await dosearch0(0, {
        state,
        random,
        ...recordingOperations(state, events),
        newSym: (x, y) => events.push(`newSym(${x},${y})`),
    }), 1);
    // deepEqual, not includes(): mfind0()'s else arm must draw the monster and
    // do nothing else, and only the whole list pins that.
    assert.deepEqual(events, ['newSym(9,10)']);
    random.done();
});

test('explicit search feels blind and visible-region squares before drawing', async () => {
    for (const [label, setup] of [
        ['blind', (state) => {
            state.u.uprops[BLINDED] = {
                intrinsic: 1, extrinsic: 0, blocked: 0,
            };
        }],
        ['visible region', (state) => {
            const region = create_region([
                { lx: 9, ly: 9, hx: 9, hy: 9 },
            ]);
            region.visible = true;
            state.level.regions.push(region);
        }],
    ]) {
        const state = explicitSearchState();
        state.level.at(9, 9).typ = SDOOR;
        setup(state);
        const events = [];
        const random = scriptedRandom(events, [0], [18]);
        assert.equal(await dosearch0(0, {
            state,
            random,
            ...recordingOperations(state, events),
            newSym: (x, y) => events.push(`newSym(${x},${y})`),
        }), 1, label);
        // The tactile call precedes detect.c's secret-door rnl() and the
        // second call is the source's post-conversion display refresh. The
        // blind case then feels the remaining six squares before returning;
        // the visible-region case has no such extra calls.
        assert.equal(events[0], 'feelLocation(9,9)', label);
        assert.equal(events[5], 'feelLocation(9,9)', label);
        assert.match(events[6], /^message\(9,9,You find a hidden door\.\)$/u,
            label);
        random.done();
    }
});

test('explicit search clears a remembered invisible monster', async () => {
    // detect.c:2074-2077, "see if an invisible monster has moved". The marker
    // sits on an adjacent square the monster has left, and unmap_invisible()
    // clears it; the square the hero can still see nothing on keeps its own
    // memory. hero_memory has to be on for unmap_object() to rewrite anything,
    // exactly as C's map_background() does.
    //
    // This reads the memory half alone. unmap_invisible()'s repaint is
    // newsym(), which takes no state and paints the module-global game, while
    // this file drives dosearch0() through a hand-built state; the `events`
    // recorder below sees the operations dosearch0() is handed, not a draw.
    // scripts/display-symbols.test.mjs covers the repaint against the live
    // game.
    const state = explicitSearchState();
    state.level.flags = { hero_memory: true };
    const vacated = state.level.at(11, 11);
    vacated.remembered_glyph = { glyph: GLYPH_INVISIBLE };
    const events = [];
    const random = scriptedRandom(events, []);

    assert.equal(await dosearch0(0, {
        state, random, ...recordingOperations(state, events),
    }), 1);
    assert.equal(glyph_is_invisible(vacated.remembered_glyph?.glyph), false);
    // No secret door and no trap, so the 3x3 asks for no recorded operation.
    assert.deepEqual(events, []);
    random.done();
});

test('findit scans the C BOLT_LIM area and returns its discovery count', async () => {
    // The all-visible room has no traps, objects, monsters, secret terrain, or
    // stale invisible markers, so the source scan returns zero and its final
    // message is the C no-result line. The source assertion pins the radius.
    assert.match(DETECT_C,
        /do_clear_area\(u\.ux, u\.uy, BOLT_LIM, findone, \(genericptr_t\) &found\)/u);
    const state = emptyFinditState();
    const messages = [];
    assert.equal(await findit(state, {
        message(text) { messages.push(text); },
    }), 0);
    assert.deepEqual(messages, ["You don't find anything."]);
});

test('foundone tests its C glyph argument, not remembered square memory', async () => {
    const foundoneStart = DETECT_C.indexOf(
        'foundone(coordxy zx, coordxy zy, int glyph)',
    );
    const foundoneEnd = DETECT_C.indexOf('\n}\n', foundoneStart);
    assert.notEqual(foundoneStart, -1);
    const cFoundone = DETECT_C.slice(foundoneStart, foundoneEnd);
    assert.ok(cFoundone.includes(
        'glyph_is_cmap(glyph) || glyph_is_unexplored(glyph)',
    ));

    const target = await globalSearchState();
    const location = game.level.at(target.x, target.y);
    // C passes the newly displayed glyph, so an object glyph remembered in
    // the map cannot override the supplied unexplored glyph's visibility.
    const rememberedGlyph = GLYPH_OBJ_OFF;
    const suppliedGlyph = GLYPH_UNEXPLORED_OFF;
    assert.equal(glyph_is_cmap(rememberedGlyph), false);
    location.remembered_glyph = { glyph: rememberedGlyph };
    location.seenv = 0;

    foundone(target.x, target.y, suppliedGlyph, game);

    assert.equal(location.seenv, SVALL);
});

test('findit returns a hidden monster count once, following C findit()', async () => {
    const cFindit = DETECT_C.slice(
        DETECT_C.indexOf('\nfindit(void)'),
        DETECT_C.indexOf('\n/*', DETECT_C.indexOf('\nfindit(void)') + 1),
    );
    assert.equal((cFindit.match(/num\s*\+=\s*found\.num_mons;/gu) ?? []).length, 1);

    // Sight is enabled so this visible-cell callback reaches the C hider arm.
    const target = await globalSearchState('', { blind: false });
    for (const column of game.level.objects) column.fill(null);
    for (const column of game.level.monsters) column.fill(null);
    game.level.objlist = null;
    game.level.buriedobjlist = null;
    game.level.monlist = null;
    game.level.traps = [];
    game.invent = null;

    // One live cave spider (mhp 5 keeps it above C's dead-monster filter) is a
    // source-valid hides-under species (monsters.h:940). M1_CONCEAL admits the
    // hidden-monster arm, and the adjacent target cell is explicitly in the
    // COULD_SEE map so the centered C area scan visits it.
    game.viz_array[target.y][target.x] = COULD_SEE | IN_SIGHT;
    const hidden = newMonster({
        mx: target.x,
        my: target.y,
        mhp: 5,
        mnum: PM_CAVE_SPIDER,
        data: game.mons[PM_CAVE_SPIDER],
        mundetected: true,
    });
    game.level.monsters[target.x][target.y] = hidden;
    game.level.at(target.x, target.y).remembered_glyph = {
        glyph: GLYPH_INVISIBLE,
    };
    const messages = [];

    // Exactly one discovered monster contributes one to C findit's total.
    assert.equal(await findit(game, {
        message(text) { messages.push(text); },
    }), 1);
    assert.equal(hidden.mundetected, false);
    assert.deepEqual(messages, ['You reveal a hidden monster!']);
});

test('findone scans global floor order for stacked trapped boxes', async () => {
    const cFindone = DETECT_C.slice(
        DETECT_C.indexOf('\nfindone(coordxy'),
        DETECT_C.indexOf('\nstaticfn ', DETECT_C.indexOf('\nfindone(coordxy') + 1),
    );
    assert.match(cFindone, /detect_obj_traps\(fobj, TRUE, 0, found_p\)/u);

    const target = await globalSearchState();
    const { x, y } = target;
    for (const column of game.level.objects) column.fill(null);
    game.level.objlist = null;
    game.level.buriedobjlist = null;
    game.level.traps = [];
    game.invent = null;

    // Two one-item trapped chests share a square. C threads them by nobj
    // globally and nexthere in the square pile; reverse those orders so a
    // per-square nobj walk misses one trapped box.
    const globalHead = newObject({
        otyp: CHEST, where: OBJ_FLOOR, ox: x, oy: y,
        otrapped: true, quan: 1,
    });
    const pileHead = newObject({
        otyp: CHEST, where: OBJ_FLOOR, ox: x, oy: y,
        otrapped: true, quan: 1,
    });
    globalHead.nobj = pileHead;
    pileHead.nobj = null;
    pileHead.nexthere = globalHead;
    globalHead.nexthere = null;
    game.level.objlist = globalHead;
    game.level.objects[x][y] = pileHead;
    const found = {
        ft_cc: { x: 0, y: 0 },
        num_sdoors: 0,
        num_scorrs: 0,
        num_traps: 0,
        num_mons: 0,
        num_invis: 0,
        num_kept_invis: 0,
        num_cleared_invis: 0,
    };

    await findone(x, y, found, game);

    assert.notEqual(game.level.objlist, game.level.objects[x][y]);
    assert.equal(found.num_traps, 2);
    assert.equal(globalHead.tknown, true);
    assert.equal(pileHead.tknown, true);
});

// Both arms must raise UnsupportedSearchError, not a bare Error: js/cmd.js
// failClosedCommand() converts only that class into the retryable command
// boundary, and anything else escapes runSegment() and costs the segment every
// screen it had already matched. The class assertion is the point of these two
// cases; asserting the message alone passed while the refusal was a bare Error.
test('explicit search refuses an adjacent statue trap before any draw', async () => {
    // The automatic arm refuses the same trap only after its rnl(8) hits.
    const state = explicitSearchState();
    state.level.at(9, 9).typ = SDOOR;
    state.level.traps.push({
        tx: 11, ty: 11, ttyp: STATUE_TRAP, tseen: false,
    });
    const events = [];
    const random = scriptedRandom(events, []);

    await assert.rejects(dosearch0(0, {
        state, random, ...recordingOperations(state, events),
    }), (error) => error instanceof UnsupportedSearchError
        && /activate_statue_trap\(\) is not ported/.test(error.message));
    assert.deepEqual(events, []);
    random.done();
});

test('explicit search refuses a hallucinatory trap find before any draw', async () => {
    const state = explicitSearchState();
    state.level.at(9, 9).typ = SDOOR;
    // find_trap()'s hallucinatory arm clears the screen and waits, which the
    // port does not own. HALLUC is the property hallucinating() reads.
    state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    state.level.traps.push({
        tx: 11, ty: 11, ttyp: 1, tseen: false,
    });
    const events = [];
    const random = scriptedRandom(events, []);

    await assert.rejects(dosearch0(0, {
        state, random, ...recordingOperations(state, events),
    }), (error) => error instanceof UnsupportedSearchError
        && /hallucinatory display is not ported/.test(error.message));
    assert.deepEqual(events, []);
    random.done();
});


test('dosearch answers ECMD_TIME and counts prevented searches', async () => {
    // safe_wait off leaves cmd_safety_prevention() with nothing to test, so
    // the command runs and reports that it consumed time. multi has to be 0
    // for that to mean anything: js/cmd.js cmdSafetyPrevention() tests
    // `safe_wait && !menu_requested && !multi`, so searchState()'s multi of 4
    // skips the whole block whatever safe_wait holds.
    const state = explicitSearchState();
    state.multi = 0;
    state.flags = { safe_wait: false };
    const events = [];
    const random = scriptedRandom(events, []);
    assert.equal(await dosearch(state, {
        random,
        ...recordingOperations(state, events),
    }), ECMD_TIME);
    assert.deepEqual(events, []);
    random.done();
    assert.equal(state.already_found_flag, 0);

    // The reset arm: with safe_wait on, no adjacent monster and no danger
    // property, cmd_safety_prevention() answers FALSE and clears the counter
    // it had accumulated. Seeding the flag at 2 is what makes the final
    // assertion discriminate; it read 0 both before and after when the block
    // was being skipped.
    const cleared = explicitSearchState();
    cleared.multi = 0;
    cleared.flags = { safe_wait: true };
    cleared.already_found_flag = 2;
    const clearedEvents = [];
    const clearedRandom = scriptedRandom(clearedEvents, []);
    assert.equal(await dosearch(cleared, {
        random: clearedRandom,
        ...recordingOperations(cleared, clearedEvents),
    }), ECMD_TIME);
    clearedRandom.done();
    assert.equal(cleared.already_found_flag, 0);

    // A hostile beside the hero on a real level is what makes
    // cmd_safety_prevention() answer TRUE. cmdassist off is the branch that
    // increments ga.already_found_flag; on seed 9300223 a goblin stands next
    // to the hero at the first prompt, so all three searches are prevented
    // and none of them spends a turn.
    await runSegment({
        seed: 9300223,
        datetime: '20310203040506',
        nethackrc: 'OPTIONS=name:Searcher,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen\n'
            + 'OPTIONS=pettype:none,!acoustics,!cmdassist\n',
        moves: 'sss',
    });
    assert.equal(game.already_found_flag, 3);
    assert.equal(game.moves, 1);
});

async function emptyDetectionLevel(seed) {
    await runSegment({
        seed,
        datetime: '20310908070605',
        nethackrc: 'OPTIONS=name:Detect,role:Wizard,race:human,'
            + 'gender:male,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n',
        moves: '.',
    });
    game.level.objlist = null;
    game.level.buriedobjlist = null;
    game.level.monlist = null;
    game.level.traps = [];
    game.fmon = null;
    game.invent = null;
    game.flags.beginner = false;
    clearTtyMessageWindow(game);
    game._pending_message = '';
}

test('detect.c gold_detect preserves the strange-feeling no-gold result', async () => {
    await emptyDetectionLevel(9876501);
    const scroll = {
        otyp: SCR_GOLD_DETECTION,
        oclass: SCROLL_CLASS,
        blessed: false,
        cursed: false,
        dknown: false,
        quan: 20,
        spe: 0,
    };

    assert.equal(await gold_detect(scroll, game), 1);
    assert.equal(scroll.quan, 19);
    assert.equal(game.gk.known, false);
    assert.equal(game._pending_message, 'You feel materially poor.');
});

test('detect.c food_detect consumes its no-food strange-feeling scroll', async () => {
    await emptyDetectionLevel(9876503);
    const scroll = {
        otyp: SCR_FOOD_DETECTION,
        oclass: SCROLL_CLASS,
        blessed: false,
        cursed: false,
        dknown: false,
        quan: 20,
        spe: 0,
    };

    assert.equal(await food_detect(scroll, game), 1);
    assert.equal(scroll.quan, 19);
    assert.equal(game.gk.known, false);
    assert.equal(game._pending_message, 'Your nose twitches.');
});

test('object_detect preserves its C browser and terrain-bit order', () => {
    const source = cDefinition('int\nobject_detect(', '\n/*\n * Used by: crystal balls');
    const js = readFileSync(new URL('../js/detect.js', import.meta.url), 'utf8');
    const start = js.indexOf('export async function object_detect(');
    const implementation = js.slice(start, js.indexOf('\n// C ref: detect.c:monster_detect', start));
    assert.match(source, /ter_typ = TER_DETECT \| TER_OBJ;/u);
    assert.match(source, /newsym\(u\.ux, u\.uy\);\s*ter_typ \|= TER_MON;/u);
    assert.match(source, /browse_map\(ter_typ, "object"\);\s*map_redisplay\(\);/u);
    assert.doesNotMatch(source, /gk\.known/u);
    assert.match(implementation, /let terrainType = TER_DETECT \| TER_OBJ;/u);
    assert.match(implementation, /newsym\(state\.u\.ux, state\.u\.uy\);\s*terrainType \|= TER_MON;/u);
    assert.match(implementation, /await browse_map\(terrainType, 'object', state\);\s*await map_redisplay\(state\);/u);
    assert.doesNotMatch(implementation, /state\.gk/u);
});

test('object_detect does not overwrite scroll knowledge when nothing is found', async () => {
    // An empty detection level reaches C's early return without browsing or
    // a detector message. gk.known belongs to other detection/scroll owners.
    await emptyDetectionLevel(13527001);
    game.gk.known = true;
    assert.equal(await object_detect(null, 0, game), 1);
    assert.equal(game.gk.known, true);
});

test('map_redisplay forwards docrt vision phases around the memory repaint', () => {
    const source = cDefinition('staticfn void\nmap_redisplay(', '\n/* use getpos()');
    const display = readFileSync(new URL('../nethack-c/upstream/src/display.c', import.meta.url), 'utf8');
    const docrt = display.slice(display.indexOf('docrt_flags(int refresh_flags)'), display.indexOf('\nvoid\nredraw_map(', display.indexOf('docrt_flags(int refresh_flags)')));
    assert.match(source, /reconstrain_map\(\);\s*docrt\(\);/u);
    // docrtRecalc paints memory with vision off, then refreshes visible cells.
    assert.match(docrt, /vision_recalc\(2\);[\s\S]*show_glyph\(x, y, lev->glyph\);[\s\S]*vision_recalc\(0\);[\s\S]*see_monsters\(\);/u);
    const js = readFileSync(new URL('../js/detect.js', import.meta.url), 'utf8');
    const implementation = js.slice(js.indexOf('export async function map_redisplay('), js.indexOf('// C ref: detect.c level_distance()'));
    assert.match(implementation, /await docrt\(\{\s*suspendVision: \(\) => vision_recalc\(2, \{ state \}\),\s*restoreVision: \(\) => vision_recalc\(0, \{ state \}\),\s*\}\);/u);
});
