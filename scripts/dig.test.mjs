import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    COLNO,
    CORR,
    DBWALL,
    AM_LAWFUL,
    ALTAR,
    BEAR_TRAP,
    DIGCHECK_FAILED,
    DIGCHECK_FAIL_AIRLEVEL,
    DIGCHECK_FAIL_ALTAR,
    DIGCHECK_FAIL_BOULDER,
    DIGCHECK_FAIL_CANTDIG,
    DIGCHECK_FAIL_OBJ_POOL_OR_TRAP,
    DIGCHECK_FAIL_ONLADDER,
    DIGCHECK_FAIL_ONSTAIRS,
    DIGCHECK_FAIL_THRONE,
    DIGCHECK_FAIL_TOOHARD,
    DIGCHECK_FAIL_UNDESTROYABLETRAP,
    DIGCHECK_FAIL_WATERLEVEL,
    DIGCHECK_PASSED,
    DIGCHECK_PASSED_DESTROY_TRAP,
    DIGCHECK_PASSED_PITONLY,
    DIGTYP_BOULDER,
    DIGTYP_DOOR,
    DIGTYP_ROCK,
    DIGTYP_STATUE,
    DIGTYP_TREE,
    DIGTYP_UNDIGGABLE,
    DOOR,
    D_BROKEN,
    D_CLOSED,
    D_LOCKED,
    D_NODOOR,
    DRAWBRIDGE_DOWN,
    DRAWBRIDGE_UP,
    DB_FLOOR,
    DB_UNDER,
    FUMBLING,
    FLYING,
    FORCETRAP,
    FOUNTAIN,
    COULD_SEE,
    GRAVE,
    IN_SIGHT,
    LEVITATION,
    IRONBARS,
    MAGIC_PORTAL,
    IS_WALL,
    OBJ_DELETED,
    OBJ_BURIED,
    OBJ_CONTAINED,
    OBJ_FLOOR,
    OBJ_INVENT,
    POOL,
    MOAT,
    LAVAPOOL,
    LAST_PROP,
    PIT,
    HOLE,
    ROOM,
    IS_ROOM,
    IS_FURNITURE,
    ROOMOFFSET,
    u_at,
    ROT_ORGANIC,
    ROWNO,
    SDOOR,
    STONE,
    STEALTH,
    TT_PIT,
    TT_INFLOOR,
    TREE,
    VWALL,
    W_NONDIGGABLE,
    THRONE,
    TIMER_OBJECT,
} from '../js/const.js';
import {
    adj_pit_checks, dig, dig_check, dig_typ, digactualhole, dighole,
    fillholetyp, is_digging,
    mdig_tunnel, pick_can_reach,
    rot_corpse, unportedRotCorpseReason,
} from '../js/dig.js';
import { GameMap } from '../js/game.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at, newMonster } from '../js/monst.js';
import { newObject, mksobj, place_object, weight } from '../js/obj.js';
import { add_to_buried, addinv, sobj_at } from '../js/invent.js';
import { addtobill, shop_keeper } from '../js/shk.js';
import { Can_dig_down, dunlevs_in_dungeon, on_level } from '../js/dungeon.js';
import { grounded } from '../js/mondata.js';
import {
    PM_CAVE_SPIDER,
    PM_DWARF,
    PM_JACKAL,
    PM_ORC,
    monst_globals_init,
} from '../js/monsters.js';
import {
    AXE,
    APPLE, ORANGE, PEAR, BANANA, EUCALYPTUS_LEAF,
    BOULDER,
    CORPSE,
    DAGGER,
    DWARVISH_MATTOCK,
    LONG_SWORD,
    PICK_AXE,
    ROCK,
    SACK,
    STATUE,
    objects_globals_init,
} from '../js/objects.js';
import { run_timers, start_timer, timeout_globals_init } from '../js/timeout.js';
import { RECORDER_SEGMENT_LIMIT } from './fresh-matrix.mjs';
import { loadCorpseRotRecipe } from './run-corpse-rot.mjs';

// dig_typ() reads a level and an object catalog and nothing else, so a bare
// map plus objects[] is the whole world it needs.
function digState() {
    const state = { level: new GameMap() };
    objects_globals_init(state);
    return state;
}

// obj.h is_pick() and is_axe() read an object's oclass and the oc_skill field
// that js/objects.js stores as oc_subtyp; nothing else about the tool reaches
// dig_typ().
function tool(otyp, state) {
    return { otyp, oclass: state.objects[otyp].oc_class };
}

// An arbitrary square away from the map's edges, so that isok() is true and
// the case is about the terrain rather than the bounds. <1,0> is the first
// square isok() accepts and is used only by the bounds case below.
const X = 10;
const Y = 5;

function digCheckState() {
    const state = digState();
    state.u = { ux: X, uy: Y, uz: { dnum: 0, dlevel: 1 },
        // Match the initialized C property array: no movement or perception
        // property is active until a case turns its own one on.
        uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
            intrinsic: 0, extrinsic: 0, blocked: 0,
        })),
    };
    state.youmonst = {};
    state.dungeons = [{ num_dunlevs: 20, flags: { hellish: false } }];
    state.air_level = { dnum: 0, dlevel: 9 };
    state.water_level = { dnum: 0, dlevel: 10 };
    state.level.at(X, Y).typ = ROOM;
    state.level.flags.hardfloor = false;
    return state;
}

function downDigState() {
    const state = digCheckState();
    state.u.ulevel = 10;
    state.uwep = { ...tool(PICK_AXE, state), spe: 0 };
    state.u.uprops[FUMBLING] = { intrinsic: 1 };
    state.context = {
        digging: {
            down: true,
            pos: { x: X, y: Y },
            level: { ...state.u.uz },
            effort: 0,
        },
    };
    return state;
}

// Each row is one path through dig.c dig_typ() (167-192). `arboreal` sets
// svl.level.flags.arboreal, which rm.h IS_TREE() and dig.c:189 both read.
const DIG_TYP_CASES = [
    // 173, the first test: no tool at all, and a tool that is neither.
    {
        why: 'no wielded object', otyp: null, typ: VWALL,
        expected: DIGTYP_UNDIGGABLE,
    },
    {
        why: 'a long sword is neither a pick nor an axe',
        otyp: LONG_SWORD, typ: VWALL, expected: DIGTYP_UNDIGGABLE,
    },

    // 177-180, the axe arm. A door first, whatever the terrain under it.
    {
        why: 'an axe at a shut door', otyp: AXE, typ: DOOR, doormask: D_CLOSED,
        expected: DIGTYP_DOOR,
    },
    {
        why: 'an axe at a locked door', otyp: AXE, typ: DOOR,
        doormask: D_LOCKED, expected: DIGTYP_DOOR,
    },
    {
        // monmove.c closed_door() answers FALSE for a doorway with no door,
        // and DOOR terrain is not IS_TREE(), so the arm falls to its else.
        why: 'an axe at an empty doorway', otyp: AXE, typ: DOOR,
        doormask: D_NODOOR, expected: DIGTYP_UNDIGGABLE,
    },
    { why: 'an axe at a tree', otyp: AXE, typ: TREE, expected: DIGTYP_TREE },
    {
        // rm.h IS_TREE() is true for STONE on an arboreal level, which is the
        // one way an axe can answer DIGTYP_TREE at something that is not TREE.
        why: 'an axe at arboreal stone', otyp: AXE, typ: STONE,
        arboreal: true, expected: DIGTYP_TREE,
    },
    {
        // 180. The axe arm has no rock case at all, which is the divergence
        // this file was written for: C swings at the wall instead of digging.
        why: 'an axe at a wall', otyp: AXE, typ: VWALL,
        expected: DIGTYP_UNDIGGABLE,
    },
    {
        why: 'an axe at unmapped rock', otyp: AXE, typ: STONE,
        expected: DIGTYP_UNDIGGABLE,
    },
    {
        why: 'an axe at room floor', otyp: AXE, typ: ROOM,
        expected: DIGTYP_UNDIGGABLE,
    },

    // 186-191, the pick arm.
    {
        why: 'a pick at a shut door', otyp: PICK_AXE, typ: DOOR,
        doormask: D_CLOSED, expected: DIGTYP_DOOR,
    },
    {
        // 187. A pick cannot fell a tree, and the tree test sits above the
        // IS_OBSTRUCTED() one that would otherwise call TREE rock.
        why: 'a pick at a tree', otyp: PICK_AXE, typ: TREE,
        expected: DIGTYP_UNDIGGABLE,
    },
    {
        // The same ordering seen through IS_TREE()'s arboreal half: without
        // the tree test, 188-189 would answer DIGTYP_ROCK for this square.
        why: 'a pick at arboreal stone', otyp: PICK_AXE, typ: STONE,
        arboreal: true, expected: DIGTYP_UNDIGGABLE,
    },
    {
        why: 'a pick at a wall', otyp: PICK_AXE, typ: VWALL,
        expected: DIGTYP_ROCK,
    },
    {
        why: 'a pick at unmapped rock', otyp: PICK_AXE, typ: STONE,
        expected: DIGTYP_ROCK,
    },
    {
        // 189's arboreal conjunct needs an IS_OBSTRUCTED() type that is
        // neither a wall nor IS_TREE(); a secret door is one, and a secret
        // corridor is the only other.
        why: 'a pick at a secret door', otyp: PICK_AXE, typ: SDOOR,
        expected: DIGTYP_ROCK,
    },
    {
        why: 'a pick at an arboreal secret door', otyp: PICK_AXE, typ: SDOOR,
        arboreal: true, expected: DIGTYP_UNDIGGABLE,
    },
    {
        // IS_WALL() is what keeps a wall diggable on an arboreal level.
        why: 'a pick at an arboreal wall', otyp: PICK_AXE, typ: VWALL,
        arboreal: true, expected: DIGTYP_ROCK,
    },
    {
        why: 'a pick at room floor', otyp: PICK_AXE, typ: ROOM,
        expected: DIGTYP_UNDIGGABLE,
    },
    {
        why: 'a pick in a corridor', otyp: PICK_AXE, typ: CORR,
        expected: DIGTYP_UNDIGGABLE,
    },
    {
        // IS_OBSTRUCTED() is `typ < POOL`, so water is the boundary value on
        // its far side.
        why: 'a pick at water', otyp: PICK_AXE, typ: POOL,
        expected: DIGTYP_UNDIGGABLE,
    },
    {
        // is_pick() is a skill test, so the mattock takes the pick arm too.
        why: 'a mattock at a wall', otyp: DWARVISH_MATTOCK, typ: VWALL,
        expected: DIGTYP_ROCK,
    },
];

test('dig_typ answers what each tool would break', () => {
    for (const row of DIG_TYP_CASES) {
        const state = digState();
        state.level.flags.arboreal = row.arboreal ?? false;
        const location = state.level.at(X, Y);
        location.typ = row.typ;
        // rm.h:213-218 aliases doormask onto the field js/game.js calls
        // `flags`; js/hack.js doorMask() reads that one first.
        location.flags = row.doormask ?? 0;
        assert.equal(
            dig_typ(row.otyp === null ? null : tool(row.otyp, state),
                X, Y, state),
            row.expected,
            row.why,
        );
    }
});

test('dig_typ answers undiggable for a square off the map', () => {
    // 173's isok(). Column 0 is off the map for NetHack's purposes even
    // though the array has a slot for it, and dig.c asks before it reads
    // levl[x][y], so the answer cannot depend on what that slot holds.
    const state = digState();
    const location = state.level.at(0, Y);
    location.typ = VWALL;
    assert.equal(
        dig_typ(tool(PICK_AXE, state), 0, Y, state), DIGTYP_UNDIGGABLE,
    );
});

test('pick_can_reach follows pit, bimanual, and flight rules', () => {
    const state = digState();
    const pick = tool(PICK_AXE, state);
    const mattock = tool(DWARVISH_MATTOCK, state);
    const target = { tx: X + 1, ty: Y, ttyp: PIT, tseen: false, conjoined: 0 };
    const heroPit = { tx: X, ty: Y, ttyp: PIT, tseen: true, conjoined: 0 };
    state.level.traps = [target, heroPit];
    state.u = {
        ux: X, uy: Y, utrap: 0, utraptype: 0,
        uprops: { [FLYING]: { intrinsic: 0, extrinsic: 0, blocked: 0 } },
    };

    assert.equal(pick_can_reach(pick, X + 1, Y, state), true,
        'a grounded one-handed pick reaches a statue outside a pit');
    target.tseen = true;
    assert.equal(pick_can_reach(pick, X + 1, Y, {
        ...state,
        level: { ...state.level, traps: [target] },
    }), false, 'a one-handed pick cannot reach into a known pit');
    assert.equal(pick_can_reach(mattock, X + 1, Y, {
        ...state,
        level: { ...state.level, traps: [target] },
    }), true, 'a two-handed mattock reaches into a pit from outside');
    assert.equal(pick_can_reach(pick, X + 1, Y, {
        ...state,
        u: {
            ...state.u,
            uprops: {
                [FLYING]: { intrinsic: 1, extrinsic: 0, blocked: 0 },
            },
        },
        level: { ...state.level, traps: [target] },
    }), true, 'a flying hero can reach a target in a known pit');

    state.u.utrap = 1;
    state.u.utraptype = TT_PIT;
    assert.equal(pick_can_reach(pick, X + 1, Y, state), false,
        'two unjoined pits cannot be reached through');
    heroPit.conjoined = 1 << 4;
    target.conjoined = 1 << 0;
    assert.equal(pick_can_reach(pick, X + 1, Y, state), true,
        'conjoined pits permit reaching through');
});

test('dig_typ prefers reachable statues and boulders before terrain', () => {
    const state = digState();
    state.u = {
        ux: X, uy: Y, utrap: 0, utraptype: 0,
        uprops: { [FLYING]: { intrinsic: 0, extrinsic: 0, blocked: 0 } },
    };
    const pick = tool(PICK_AXE, state);
    const pile = { otyp: STATUE, nexthere: null };
    state.level.objects[X][Y] = pile;
    assert.equal(dig_typ(pick, X, Y, state), DIGTYP_STATUE);

    pile.otyp = BOULDER;
    assert.equal(dig_typ(pick, X, Y, state), DIGTYP_BOULDER);
    state.level.at(X, Y).typ = VWALL;
    assert.equal(dig_typ(pick, X, Y, state), DIGTYP_BOULDER);
});

test('fillholetyp preserves liquid counts, weighting and draw order', () => {
    const state = digState();
    state.u = { uz: { dnum: 0, dlevel: 1 } };
    state.level.at(X - 1, Y - 1).typ = LAVAPOOL;
    state.level.at(X - 1, Y).typ = MOAT;
    state.level.at(X, Y - 1).typ = LAVAPOOL;
    state.level.at(X + 1, Y - 1).typ = POOL;

    const draws = [];
    const random = { rn2: (bound) => { draws.push(bound); return 0; } };
    assert.equal(fillholetyp(X, Y, false, state, random), ROOM);
    assert.deepEqual(draws, [3, 2]);

    draws.length = 0;
    assert.equal(fillholetyp(X, Y, true, state, random), LAVAPOOL);
    assert.deepEqual(draws, []);
});

test('digactualhole preserves the old visible furniture label in its fall message', async () => {
    // C dig.c:674-718 captures surface(x,y) and old_aligntyp before maketrap
    // changes furniture to floor, then prints the captured label afterward.
    const cases = [
        {
            typ: GRAVE,
            flags: 0, // A fresh grave tile has no altar alignment bits.
            furniture: 'headstone',
            // The first result names the grave surface from before pitTerrain.
            messages: [
                'You dig a pit in the floor.',
                'The headstone falls into the pit!',
            ],
        },
        {
            typ: ALTAR,
            flags: AM_LAWFUL,
            furniture: 'lawful altar',
            heroFault: false, // Keep this case focused on the label captured before maketrap.
            // The altar label must keep the alignment that C reads before maketrap.
            messages: [
                'The lawful altar falls into the pit!',
            ],
        },
    ];

    for (const row of cases) {
        const state = digCheckState();
        state.u.ulevel = 1; // wake_nearby uses the hero level to bound its source scan.
        // Zero-valued intrinsic, extrinsic and blocked fields mean the test
        // hero starts without flight, levitation or stealth effects.
        state.u.uprops = {
            [FLYING]: { intrinsic: 0, extrinsic: 0, blocked: 0 },
            [LEVITATION]: { intrinsic: 0, extrinsic: 0, blocked: 0 },
            [STEALTH]: { intrinsic: 0, extrinsic: 0, blocked: 0 },
        };
        state.youmonst = {};
        state.level.at(X, Y).typ = row.typ;
        state.level.at(X, Y).flags = row.flags;
        state.viz_array = Array.from({ length: ROWNO }, () => []);
        state.viz_array[Y][X] = IN_SIGHT;
        const messages = [];
        const rngBounds = [];

        const madeby = row.heroFault === false ? { mx: 0, my: 0 } : state.youmonst;
        await digactualhole(X, Y, madeby, PIT, state, {
            message: async (line) => messages.push(line),
            random: {
                rn1: (range, base) => {
                    rngBounds.push([range, base]);
                    return base;
                },
                rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
            },
        });

        assert.deepEqual(messages, row.messages, row.furniture);
        assert.deepEqual(rngBounds, [[4, 2]],
            'the hero enters the new pit with the C rn1(4,2) duration');
        assert.equal(state.level.at(X, Y).typ, ROOM,
            'maketrap changes furniture to room floor before the fall message');
    }
});

test('digactualhole calls desecrate_altar after hero-caused altar damage', () => {
    const cSource = readFileSync('nethack-c/upstream/src/dig.c', 'utf8');
    const jsSource = readFileSync('js/dig.js', 'utf8');
    const cDig = cSource.match(
        /void\s+digactualhole\(coordxy x, coordxy y, struct monst \*madeby, int ttyp\)\s*\{([\s\S]*?)^\}/mu,
    );
    const jsDig = jsSource.match(
        /export async function digactualhole\([\s\S]*?\) \{([\s\S]*?)^\}/mu,
    );
    assert.ok(cDig, 'C digactualhole definition');
    assert.ok(jsDig, 'JavaScript digactualhole definition');
    assert.match(cDig[1], /if \(heros_fault && old_typ == ALTAR\)\s*desecrate_altar\(FALSE, old_aligntyp\);/u);
    assert.match(jsDig[1], /if \(herosFault && oldType === ALTAR\)\s*await desecrate_altar\(false, oldAlignment, state\);/u);
});

test('dig_up_grave keeps the C selector values for zombie and mummy creation', () => {
    const cSource = readFileSync('nethack-c/upstream/src/dig.c', 'utf8');
    const jsSource = readFileSync('js/dig.js', 'utf8');
    const cStart = cSource.indexOf('dig_up_grave(coord *cc)');
    const cEnd = cSource.indexOf('\nint\nuse_pick_axe', cStart);
    const jsStart = jsSource.indexOf('// C ref: dig.c dig_up_grave()');
    const jsEnd = jsSource.indexOf('\n// C ref: dig.c dighole()', jsStart);
    assert.ok(cStart >= 0 && cEnd > cStart, 'dig.c defines dig_up_grave');
    assert.ok(jsStart >= 0 && jsEnd > jsStart, 'dig.js documents dig_up_grave');

    const cGrave = cSource.slice(cStart, cEnd);
    const jsGrave = jsSource.slice(jsStart, jsEnd);
    // C's case 2 chooses S_ZOMBIE; case 3 chooses S_MUMMY. The matching JS
    // branches use the same class symbols and pass the C MM_NOMSG call shape.
    assert.match(cGrave,
        /what_happens\s*=\s*levl\[dig_x\]\[dig_y\]\.emptygrave\s*\?\s*-1\s*:\s*rn2\(5\)/u);
    assert.match(cGrave,
        /case 2:[\s\S]*?mkclass\(S_ZOMBIE,\s*0\)[\s\S]*?case 3:/u);
    assert.match(cGrave,
        /case 3:[\s\S]*?mkclass\(S_MUMMY,\s*0\)[\s\S]*?default:/u);
    assert.match(jsGrave,
        /case 2:[\s\S]*?mkclass\(S_ZOMBIE,\s*0,\s*\{\s*state,\s*random\s*\}\)[\s\S]*?MM_NOMSG[\s\S]*?case 3:/u);
    assert.match(jsGrave,
        /case 3:[\s\S]*?mkclass\(S_MUMMY,\s*0,\s*\{\s*state,\s*random\s*\}\)[\s\S]*?MM_NOMSG[\s\S]*?default:/u);
});

test('dighole returns the drawbridge refusal after source-ordered spot checks', async () => {
    const state = digCheckState();
    const location = state.level.at(X, Y);
    location.typ = DRAWBRIDGE_UP;
    location.flags = DB_UNDER | DB_FLOOR;
    const effects = [];
    const messages = [];
    const result = await dighole(false, false, null, {
        state,
        random: { rn2: (bound) => assert.fail(`unexpected rn2(${bound})`) },
        message: async (text) => messages.push(text),
        spotTimeLeft: () => { effects.push('time-left'); return true; },
        spotStopTimers: () => effects.push('stop-timer'),
        objIceEffects: () => effects.push('ice-effects'),
    });

    assert.equal(result, false);
    assert.deepEqual(messages, ['The ground here is too hard to dig in.']);
    assert.deepEqual(effects, ['time-left', 'stop-timer', 'ice-effects']);
});

test('dighole removes a settled floor boulder through the object lifecycle', async () => {
    const state = digCheckState();
    const trap = { tx: X, ty: Y, ttyp: PIT };
    const boulder = newObject({
        otyp: BOULDER,
        oclass: state.objects[BOULDER].oc_class,
        where: OBJ_FLOOR,
        ox: X,
        oy: Y,
        quan: 1,
    });
    state.level.traps = [trap];
    state.level.objects[X][Y] = boulder;
    state.level.objlist = boulder;

    const draws = [];
    const messages = [];
    const result = await dighole(false, false, null, {
        state,
        random: {
            rn2(bound) {
                draws.push(bound);
                return bound === 2 ? 1 : 50;
            },
        },
        message: async text => messages.push(text),
        redraw: () => {},
    });

    assert.equal(result, false);
    assert.equal(trap.ttyp, PIT, 'the C boulder-settling arm crushes the spikes');
    assert.equal(state.level.objects[X][Y], null,
        'the settled boulder leaves the per-square floor pile');
    assert.equal(state.level.objlist, null,
        'the deletion also unlinks the level-wide object chain');
    assert.equal(boulder.where, OBJ_DELETED);
    assert.deepEqual(draws, [2, 100],
        'pit settling precedes invent.c delobj() object resistance');
    assert.deepEqual(messages, ['The boulder settles into the pit.']);
});

test('dighole runs magical-trap explosions before deleting and redrawing the trap', () => {
    const cSource = readFileSync('nethack-c/upstream/src/dig.c', 'utf8');
    const jsSource = readFileSync('js/dig.js', 'utf8');
    const cStart = cSource.indexOf('\ndighole(boolean pit_only');
    const cEnd = cSource.indexOf('\nstaticfn void\ndig_up_grave', cStart);
    const jsStart = jsSource.indexOf('export async function dighole(');
    const jsEnd = jsSource.indexOf('\n// C ref: dig.c adj_pit_checks()', jsStart);
    assert.ok(cStart >= 0 && cEnd > cStart, 'C dighole definition');
    assert.ok(jsStart >= 0 && jsEnd > jsStart, 'JavaScript dighole definition');

    const cDig = cSource.slice(cStart, cEnd);
    const jsDig = jsSource.slice(jsStart, jsEnd);
    assert.match(cDig,
        /explode\(dig_x,\s*dig_y,\s*0,\s*20\s*\+\s*d\(3,\s*6\),\s*TRAP_EXPLODE,\s*EXPL_MAGICAL\);\s*deltrap\(ttmp\);\s*newsym\(dig_x,\s*dig_y\);/u);
    assert.match(jsDig,
        /const damage = 20 \+ random\.d\(3, 6\);\s*const \{ explode \} = await import\('\.\/explode\.js'\);\s*await explode\(\s*x, y, 0, damage, TRAP_EXPLODE, EXPL_MAGICAL, state,/u);
    assert.match(jsDig,
        /\{ \.\.\.rawEnv, random, message \},\s*\);\s*await deltrap\(trap, state\);\s*newsym\(x, y, state\);/u);
});

test('adj_pit_checks reports hard foundations and supporting structures', () => {
    const state = digState();
    state.u = { uz: { dnum: 0, dlevel: 1 } };
    const location = state.level.at(X, Y);
    location.typ = SDOOR;
    location.flags = D_CLOSED;
    const secret = adj_pit_checks({ x: X, y: Y }, state);
    assert.equal(secret.allowed, false);
    assert.equal(secret.message,
        'The foundation is too hard to dig through from this angle.');
    assert.equal(location.flags, 0);

    location.typ = IRONBARS;
    assert.deepEqual(adj_pit_checks({ x: X, y: Y }, state), {
        allowed: false,
        message: 'The bars go much deeper than your pit.',
    });
    location.typ = FOUNTAIN;
    assert.deepEqual(adj_pit_checks({ x: X, y: Y }, state), {
        allowed: false,
        message: "The fountain's supporting structures remain intact.",
    });

    location.typ = ROOM;
    state.stairs = { sx: X, sy: Y, isladder: false, next: null };
    assert.deepEqual(adj_pit_checks({ x: X, y: Y }, state), {
        allowed: false,
        message: "The stairs' supporting structures remain intact.",
    });
    state.stairs.isladder = true;
    assert.deepEqual(adj_pit_checks({ x: X, y: Y }, state), {
        allowed: false,
        message: 'The ladder is unaffected.',
    });

    state.stairs = null;
    location.typ = ROOM;
    assert.deepEqual(adj_pit_checks({ x: X, y: Y }, state), {
        allowed: true,
        message: '',
    });
    location.typ = DRAWBRIDGE_DOWN;
    assert.deepEqual(adj_pit_checks({ x: X, y: Y }, state), {
        allowed: false,
        message: "The drawbridge's supporting structures remain intact.",
    });
    location.typ = DBWALL;
    assert.deepEqual(adj_pit_checks({ x: X, y: Y }, state), {
        allowed: false,
        message: 'The foundation is too hard to dig through from this angle.',
    });
});

// rot_corpse() reads the floor indexes, the monster grid, and the object
// catalog that obfree() prices merges from; timeout_globals_init() is there
// because dealloc_obj() clears gt.thrownobj.
function rotState(moves = 254) {
    const state = {
        level: new GameMap(),
        moves,
        program_state: { gameover: false },
        u: { ux: 1, uy: 1, uundetected: false },
        youmonst: {},
    };
    objects_globals_init(state);
    monst_globals_init(state);
    timeout_globals_init(state);
    return state;
}

let nextRotObjectId = 2;

// A corpse whose only ROT_CORPSE timer has fired: run_timers decrements
// timed before the callback. Separate timeout tests cover canonical removal
// of residual timers when the corpse originally carried more than one.
function floorCorpse(state, x, y, corpsenm = PM_ORC) {
    const corpse = newObject({
        age: 0,
        corpsenm,
        o_id: nextRotObjectId++,
        oclass: state.objects[CORPSE].oc_class,
        otyp: CORPSE,
        quan: 1,
        timed: 0,
    });
    place_object(corpse, x, y, { state });
    return corpse;
}

// A second object under the corpse, so OBJ_AT() is still true once the corpse
// is extracted. The witness session's three due corpses all sit on such a
// pile, which is why they cannot prove the exposure arm on their own.
function floorRock(state, x, y) {
    const rock = newObject({
        o_id: nextRotObjectId++,
        oclass: state.objects[ROCK].oc_class,
        otyp: ROCK,
        quan: 1,
    });
    place_object(rock, x, y, { state });
    return rock;
}

test('ROT_ORGANIC buries container contents before freeing the container',
    async () => {
        const state = rotState();
        const sack = newObject({
            o_id: nextRotObjectId++,
            oclass: state.objects[SACK].oc_class,
            otyp: SACK,
            quan: 1,
            ox: 13,
            oy: 7,
        });
        const dagger = newObject({
            o_id: nextRotObjectId++,
            oclass: state.objects[DAGGER].oc_class,
            otyp: DAGGER,
            quan: 1,
        });
        const pickAxe = newObject({
            o_id: nextRotObjectId++,
            oclass: state.objects[PICK_AXE].oc_class,
            otyp: PICK_AXE,
            quan: 1,
        });
        sack.cobj = dagger;
        dagger.where = OBJ_CONTAINED;
        dagger.ocontainer = sack;
        dagger.nobj = pickAxe;
        pickAxe.where = OBJ_CONTAINED;
        pickAxe.ocontainer = sack;
        add_to_buried(sack, { state });

        const draws = [];
        start_timer(0, TIMER_OBJECT, ROT_ORGANIC, sack, state);
        await run_timers(state, {
            random: {
                rn2(bound) {
                    draws.push(bound);
                    return bound - 1;
                },
                rnd: () => assert.fail('metal dagger burial has no rnd call'),
                rn1: () => assert.fail('metal dagger burial has no rn1 call'),
                rne: () => assert.fail('metal dagger burial has no rne call'),
            },
        });

        assert.equal(state.gt.timer_base, null);
        assert.equal(state.level.buriedobjlist, pickAxe);
        assert.equal(pickAxe.nobj, dagger);
        assert.equal(pickAxe.where, OBJ_BURIED);
        assert.equal(dagger.where, OBJ_BURIED);
        assert.deepEqual([dagger.ox, dagger.oy], [sack.ox, sack.oy]);
        assert.deepEqual([pickAxe.ox, pickAxe.oy], [sack.ox, sack.oy]);
        assert.equal(sack.where, OBJ_DELETED);
        assert.deepEqual(draws, [100, 100]);
    });

// dig.c:2186 calls newsym(x, y) as the OBJ_FLOOR arm's last statement, after
// obfree() and after `mtmp->mundetected = 0`. That ordering is the arm's only
// observable -- it writes no message and draws no random number -- and a
// recorder that keeps coordinates alone cannot see it: drawing first would
// repaint the corpse glyph being deleted and leave a stale '%' behind, which
// is exactly the cell change seed 334 records at <52,17> on turn 236. So each
// row keeps the square as newsym saw it: the pile top and the hider's flag at
// call time.
function recordingNewsym(state) {
    const drawn = [];
    return {
        drawn,
        newsym: (x, y) => drawn.push([
            x,
            y,
            state.level.objects[x][y]?.otyp ?? null,
            state.level.monsters[x][y]?.mundetected ?? null,
        ]),
    };
}

test('rot_corpse deletes a floor corpse and redraws its square', async () => {
    const state = rotState();
    // An arbitrary interior square; the witness session's head timer names
    // <40,5>, and rot_corpse() reads the coordinates off the object rather
    // than from the caller.
    const x = 40;
    const y = 5;
    const rock = floorRock(state, x, y);
    const corpse = floorCorpse(state, x, y);
    const { drawn, newsym } = recordingNewsym(state);

    await rot_corpse(corpse, state.moves, { state, hooks: { newsym } });

    // Both floor indexes: the per-square pile and the level object list.
    assert.equal(state.level.objects[x][y], rock);
    assert.equal(state.level.objlist, rock);
    assert.equal(rock.nobj, null);
    // obfree() -> dealloc_obj() marks the object deleted rather than freeing
    // memory, which is how this port spells C's free().
    assert.equal(corpse.where, OBJ_DELETED);
    // The rock, not the corpse: the square is already clear when it is drawn.
    assert.deepEqual(drawn, [[x, y, rock.otyp, null]]);
});

test('rot_corpse exposes a hider only once nothing is left to hide under',
    async () => {
        // dig.c:2179-2182. The monster is a cave spider, one of the eight
        // hides_under() species (M1_CONCEAL); a jackal is not.
        for (const row of [
            { why: 'lone corpse, hider', under: false, mnum: PM_CAVE_SPIDER,
                expected: 0 },
            { why: 'pile under corpse, hider', under: true,
                mnum: PM_CAVE_SPIDER, expected: 1 },
            { why: 'lone corpse, non-hider', under: false,
                mnum: PM_JACKAL, expected: 1 },
        ]) {
            const state = rotState();
            const x = 30;
            const y = 8;
            if (row.under) floorRock(state, x, y);
            const corpse = floorCorpse(state, x, y);
            const monster = { mnum: row.mnum, mundetected: 1,
                data: state.mons[row.mnum] };
            state.level.monsters[x][y] = monster;
            const { drawn, newsym } = recordingNewsym(state);

            await rot_corpse(corpse, state.moves, { state, hooks: { newsym } });

            assert.equal(monster.mundetected, row.expected, row.why);
            // The flag is already at its final value when the square is
            // drawn, which is what puts newsym() last.
            assert.deepEqual(
                drawn,
                [[x, y, row.under ? ROCK : null, row.expected]],
                row.why,
            );
        }
    });

test('unportedRotCorpseReason names the arm each corpse is waiting on', () => {
    const state = rotState();
    const seam = { state, hooks: { newsym: () => {} } };
    const floor = floorCorpse(state, 12, 6);
    assert.equal(unportedRotCorpseReason(floor, seam), null);

    // dig.c:2158-2178 now dispatches carried, monster and migrating corpses.
    const carried = newObject({ otyp: CORPSE, where: OBJ_INVENT });
    assert.equal(unportedRotCorpseReason(carried, seam), null);

    // rot_organic()'s contents loop at dig.c:2129-2136.
    const holder = floorCorpse(state, 13, 6);
    holder.cobj = newObject({ otyp: ROCK });
    assert.match(
        unportedRotCorpseReason(holder, seam),
        /a rotting corpse to hold nothing/u,
    );

    // Billing is owned by canonical obfree; the discarded hero hideunder
    // call updates concealment without refusing corpse deletion.
    const owed = floorCorpse(state, 14, 6);
    owed.unpaid = true;
    assert.equal(unportedRotCorpseReason(owed, seam), null);
    const underfoot = floorCorpse(state, 20, 9);
    state.u.ux = 20;
    state.u.uy = 9;
    state.u.uundetected = 1;
    state.youmonst.data = state.mons[PM_CAVE_SPIDER];
    assert.equal(unportedRotCorpseReason(underfoot, seam), null);
});

test('unportedRotCorpseReason demands the newsym seam it will draw through',
    () => {
        const state = rotState();
        const corpse = floorCorpse(state, 15, 7);
        assert.throws(
            () => unportedRotCorpseReason(corpse, { state }),
            /rot_corpse requires a newsym seam/u,
        );
    });

test('the corpse rot matrix rests long enough for a corpse to come due', () => {
    // loadCorpseRotRecipe() runs validateCleanRecipe(), so calling it is the
    // cleanliness check as well.
    const { segments } = loadCorpseRotRecipe();
    assert.ok(segments.length <= RECORDER_SEGMENT_LIMIT,
        'the matrix records in one chunk');
    for (const segment of segments) {
        // mkobj.c start_corpse_timeout() gives a corpse mklev() placed at
        // least ROT_AGE - rot_adjust turns, which is 250 - 25. A segment that
        // stopped short of that would record a game in which nothing rots.
        const turns = segment.moves.length / 2;
        assert.ok(turns > 225, `${segment.seed} rests past the earliest expiry`);
        assert.match(segment.moves, /^(?:m\.)+$/u,
            `${segment.seed} rests with the no-op prefix throughout`);
        // The turn counter is what dates each map change, and a pet would be
        // free to eat the corpse the segment is waiting for.
        assert.match(segment.nethackrc, /(?:^|,)time(?:,|\n)/u);
        assert.match(segment.nethackrc, /pettype:none/u);
    }
});

// ---- dig.c mdig_tunnel() (1413-1490), the wall arm ----

async function tunnelGame(options) {
    await runSegment({
        seed: 771040,
        datetime: '20260724120000',
        nethackrc: 'OPTIONS=name:Digger,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + `pettype:none${options}`,
        moves: ' ',
    });
}

// Any diggable wall of the generated level: mdig_tunnel() reads only the
// terrain under the monster, so which wall it is does not matter, but the
// level's outer walls carry W_NONDIGGABLE and return before the rn2(5).
// IS_WALL rather than IS_STWALL, which also admits STONE.
function firstWall() {
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const location = game.level.at(x, y);
            if (IS_WALL(location?.typ)
                && !((location.wall_info ?? 0) & W_NONDIGGABLE)) {
                return { x, y };
            }
        }
    }
    return assert.fail('the level has a diggable wall');
}

// dig.c:1533-1536 is `if (flags.verbose && !rn2(5)) You_hear("crashing
// rock.")`. pline.c You_hear() (435-451) prints nothing when the hero is deaf
// or the acoustics option is off, after the rn2(5) has already been spent.
for (const [label, options, expected] of [
    ['prints under the default options', '', ['You hear crashing rock.']],
    ['stays silent under !acoustics', ',!acoustics', []],
]) {
    test(`the crashing-rock line of a dug wall ${label}`, async () => {
        await tunnelGame(options);
        const { x, y } = firstWall();
        const dwarf = newMonster({ data: game.mons[PM_DWARF], mx: x, my: y });
        game.flags.verbose = true;
        const drawn = [];
        const messages = [];
        const random = {
            // rnd(12) is the pile roll; 6 leaves no boulder or rock behind.
            rnd: (bound) => { drawn.push(['rnd', bound]); return 6; },
            // 0 is the one-in-five result that reaches You_hear().
            rn2: (bound) => { drawn.push(['rn2', bound]); return 0; },
        };

        const died = await mdig_tunnel(dwarf, {
            state: game,
            random,
            message: async (text) => { messages.push(text); },
            redraw: () => {},
        });

        assert.equal(died, false);
        assert.deepEqual(messages, expected);
        // Both draws are spent whether or not the line prints.
        assert.deepEqual(drawn, [['rnd', 12], ['rn2', 5]]);
        assert.equal(IS_WALL(game.level.at(x, y).typ), false,
            'the wall is dug away');
    });
}

test('mdig_tunnel supplies object hooks for a boulder on stone', async () => {
    await tunnelGame('');
    const { x, y } = firstWall();
    // dig.c's non-wall arm drops a boulder when rnd(12) returns one. Setting
    // the terrain directly reaches that source branch without depending on a
    // particular generated level layout.
    game.level.at(x, y).typ = STONE;
    const dwarf = newMonster({ data: game.mons[PM_DWARF], mx: x, my: y });
    const drawn = [];
    const random = {
        rnd: (bound) => {
            drawn.push(['rnd', bound]);
            return 1;
        },
        rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
        rn1: (bound) => assert.fail(`unexpected rn1(${bound})`),
        rne: (bound) => assert.fail(`unexpected rne(${bound})`),
    };

    const died = await mdig_tunnel(dwarf, {
        state: game,
        random,
        message: async () => {},
        redraw: () => {},
    });

    assert.equal(died, false);
    assert.deepEqual(drawn, [['rnd', 12], ['rnd', 2]]);
    const boulder = sobj_at(BOULDER, x, y, game);
    assert.ok(boulder, 'digging stone should place the rolled boulder');
});

test('digcheck_result values match the C enum and failure alias', () => {
    const header = readFileSync('nethack-c/upstream/include/hack.h', 'utf8');
    const sourceEnum = header.match(/enum digcheck_result\s*\{([\s\S]*?)\}/u)?.[1];
    assert.ok(sourceEnum, 'hack.h defines enum digcheck_result');
    assert.match(sourceEnum, /DIGCHECK_PASSED\s*=\s*1/u);
    assert.match(sourceEnum, /DIGCHECK_PASSED_DESTROY_TRAP\s*=\s*2/u);
    assert.match(sourceEnum, /DIGCHECK_PASSED_PITONLY\s*=\s*3/u);
    assert.match(sourceEnum, /DIGCHECK_FAIL_ONSTAIRS\s*=\s*DIGCHECK_FAILED/u);
    assert.deepEqual([
        DIGCHECK_PASSED,
        DIGCHECK_PASSED_DESTROY_TRAP,
        DIGCHECK_PASSED_PITONLY,
        DIGCHECK_FAILED,
        DIGCHECK_FAIL_ONSTAIRS,
        DIGCHECK_FAIL_ONLADDER,
        DIGCHECK_FAIL_THRONE,
        DIGCHECK_FAIL_ALTAR,
        DIGCHECK_FAIL_AIRLEVEL,
        DIGCHECK_FAIL_WATERLEVEL,
        DIGCHECK_FAIL_TOOHARD,
        DIGCHECK_FAIL_UNDESTROYABLETRAP,
        DIGCHECK_FAIL_CANTDIG,
        DIGCHECK_FAIL_BOULDER,
        DIGCHECK_FAIL_OBJ_POOL_OR_TRAP,
    ], [1, 2, 3, 4, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
});

test("dig_check follows C's ordered terrain, trap, and actor tests", () => {
    const state = digCheckState();
    const location = state.level.at(X, Y);
    assert.equal(dig_check(state.youmonst, X, Y, state), DIGCHECK_PASSED);

    state.stairs = { sx: X, sy: Y, isladder: false, next: null };
    assert.equal(dig_check(state.youmonst, X, Y, state), DIGCHECK_FAIL_ONSTAIRS);
    state.stairs.isladder = true;
    assert.equal(dig_check(state.youmonst, X, Y, state), DIGCHECK_FAIL_ONLADDER);
    state.stairs = null;

    location.typ = THRONE;
    assert.equal(dig_check(state.youmonst, X, Y, state), DIGCHECK_FAIL_THRONE);
    location.typ = ALTAR;
    assert.equal(dig_check(state.youmonst, X, Y, state), DIGCHECK_FAIL_ALTAR);
    assert.equal(dig_check(null, X, Y, state), DIGCHECK_PASSED);

    location.typ = ROOM;
    state.u.uz = { ...state.air_level };
    assert.equal(dig_check(state.youmonst, X, Y, state), DIGCHECK_FAIL_AIRLEVEL);
    state.u.uz = { ...state.water_level };
    assert.equal(dig_check(state.youmonst, X, Y, state), DIGCHECK_FAIL_WATERLEVEL);
    state.u.uz = { dnum: 0, dlevel: 1 };

    location.typ = VWALL;
    location.wall_info = W_NONDIGGABLE;
    assert.equal(dig_check(state.youmonst, X, Y, state), DIGCHECK_FAIL_TOOHARD);
    location.typ = ROOM;
    location.wall_info = 0;
    state.level.traps.push({ tx: X, ty: Y, ttyp: MAGIC_PORTAL });
    assert.equal(dig_check(state.youmonst, X, Y, state), DIGCHECK_FAIL_UNDESTROYABLETRAP);
    state.level.traps.length = 0;

    state.level.flags.hardfloor = true;
    assert.equal(dig_check(state.youmonst, X, Y, state), DIGCHECK_PASSED_PITONLY);
    state.level.traps.push({ tx: X, ty: Y, ttyp: BEAR_TRAP });
    assert.equal(dig_check(state.youmonst, X, Y, state), DIGCHECK_PASSED_DESTROY_TRAP);
    state.level.traps[0].ttyp = PIT;
    assert.equal(dig_check(state.youmonst, X, Y, state), DIGCHECK_FAIL_CANTDIG);
    state.level.traps.length = 0;
    state.level.flags.hardfloor = false;

    state.level.objects[X][Y] = { otyp: BOULDER, nexthere: null };
    assert.equal(dig_check(state.youmonst, X, Y, state), DIGCHECK_FAIL_BOULDER);
    state.level.objects[X][Y] = null;
    location.typ = POOL;
    assert.equal(dig_check(null, X, Y, state), DIGCHECK_FAIL_OBJ_POOL_OR_TRAP);
});

test('dig preserves the C fumbling gate and outcome-selection draw', async () => {
    const cSource = readFileSync('nethack-c/upstream/src/dig.c', 'utf8');
    assert.match(
        cSource,
        /if\s*\(Fumbling && !rn2\(3\)\)\s*\{\s*switch\s*\(rn2\(3\)\)/u,
    );
    const state = downDigState();
    const draws = [];
    const values = [1, 2]; // no stumble, then the ordinary effort roll
    const result = await dig(state, {
        random: {
            rn2: (bound) => {
                draws.push(bound);
                return values.shift();
            },
        },
    });

    assert.equal(result, 1);
    assert.deepEqual(draws, [3, 5]);
    assert.ok(state.context.digging.effort > 0);
});

test('dig uses the second fumbling draw to select the C swing-miss arm', async () => {
    const state = downDigState();
    const draws = [];
    const values = [0, 2]; // stumble, then select a C switch arm
    const messages = [];
    const result = await dig(state, {
        random: {
            rn2: (bound) => {
                draws.push(bound);
                return values.shift();
            },
        },
        message: async (text) => messages.push(text),
    });

    assert.equal(result, 0);
    assert.deepEqual(draws, [3, 3]);
    assert.equal(state.context.digging.effort, 0);
    assert.deepEqual(messages, ['Your swing misses its mark.']);
});

test('lateral digging breaks a secret door and finishes the occupation', async () => {
    const state = digCheckState();
    const x = X + 1;
    const y = Y;
    state.u.ulevel = 10;
    state.uwep = { ...tool(PICK_AXE, state), spe: 0 };
    state.youmonst = { data: state.mons?.[PM_ORC] ?? null };
    state.level.at(x, y).typ = SDOOR;
    state.context = {
        digging: {
            down: false,
            pos: { x, y },
            level: { ...state.u.uz },
            effort: 100,
            quiet: false,
            lastdigtime: 0,
        },
    };
    const messages = [];

    const result = await dig(state, {
        random: { rn2: () => 0 },
        message: async (text) => messages.push(text),
    });

    assert.equal(result, 0);
    assert.equal(state.level.at(x, y).typ, DOOR);
    assert.equal(state.level.at(x, y).doormask, D_BROKEN);
    assert.equal(state.context.digging.level.dlevel, -1);
    assert.equal(state.context.digging.quiet, false);
    assert.ok(messages.includes('You break through a secret door!'));
});

test('tree chopping wires the canonical fruit generator after clearing terrain', async () => {
    const cSource = readFileSync('nethack-c/upstream/src/dig.c', 'utf8');
    assert.match(cSource, /lev->typ = ROOM, lev->flags = 0;\s*if \(!rn2\(5\)\)\s*\(void\) rnd_treefruit_at\(dpx, dpy\);/u);
    // mkobj.c treefruits[] definition order pins every selection, while the
    // failed dig.c fruit gate must spend no generation or identifier draws.
    const fruits = [APPLE, ORANGE, PEAR, BANANA, EUCALYPTUS_LEAF];
    for (const selection of [-1, ...fruits.keys()]) {
        const state = digCheckState();
        const x = X + 1; // Adjacent tree satisfies next2u() without movement.
        const y = Y;
        state.uwep = { ...tool(AXE, state), spe: 0 };
        state.context = { ident: 1, digging: {
            down: false, pos: { x, y }, level: { ...state.u.uz },
            effort: 100, quiet: false,
        } }; // The next source effort increment finishes chopping.
        state.level.at(x, y).typ = TREE;
        state.level.at(x, y).flags = 1; // Old tree flags must clear before fruit.
        const events = [];
        const values = [0, selection < 0 ? 1 : 0, selection, 5];
        const result = await dig(state, {
            random: {
                rn2(bound) {
                    events.push(['rn2', bound]);
                    if (events.length > 2)
                        assert.equal(state.level.at(x, y).typ, ROOM);
                    return values.shift();
                },
                rnd(bound) { events.push(['rnd', bound]); return 2; },
            },
            message: async text => events.push(['message', text]),
        });
        assert.equal(result, 0);
        assert.equal(state.level.at(x, y).typ, ROOM);
        assert.equal(state.level.at(x, y).flags, 0);
        assert.equal(state.context.digging.level.dlevel, -1);
        if (selection < 0) {
            assert.equal(state.level.objlist, null);
            assert.equal(state.context.ident, 1);
            assert.deepEqual(events, [['rn2', 5], ['rn2', 5],
                ['message', 'You cut down the tree.']]);
        } else {
            const fruit = sobj_at(fruits[selection], x, y, state);
            assert.ok(fruit, 'canonical generation places the selected fruit');
            assert.equal(fruit.where, OBJ_FLOOR);
            assert.equal(fruit.o_id, 1);
            assert.equal(fruit.quan, 1); // mksobj_init rn2(6)=5 avoids doubling.
            assert.equal(fruit.owt, weight(fruit, { state }));
            assert.equal(state.context.ident, 3); // next_ident adds rnd(2)=2.
            assert.deepEqual(events, [['rn2', 5], ['rn2', 5], ['rn2', 5],
                ['rnd', 2], ['rn2', 6], ['message', 'You cut down the tree.']]);
        }
    }
});

test('dig triggers a set trap with the C FORCETRAP flag', () => {
    const cSource = readFileSync('nethack-c/upstream/src/dig.c', 'utf8');
    const cHeader = readFileSync('nethack-c/upstream/include/hack.h', 'utf8');
    const jsSource = readFileSync('js/dig.js', 'utf8');
    assert.match(cSource, /dotrap\(ttmp,\s*FORCETRAP\);/u);
    assert.match(cHeader, /#define\s+FORCETRAP\s+0x01U\b/u);
    assert.match(jsSource, /await dotrap\(trap,\s*FORCETRAP,\s*state\);/u);
    assert.equal(FORCETRAP, 0x01);
});

test('digging into a pit schedules the flattened vision recalculation', async () => {
    const cSource = readFileSync('nethack-c/upstream/src/dig.c', 'utf8');
    const mainSource = readFileSync('js/allmain.js', 'utf8');
    assert.match(
        cSource,
        /set_utrap\(rn1\(4, 2\), TT_PIT\);\s*gv\.vision_full_recalc = 1;/u,
    );
    assert.match(mainSource, /if \(g\.vision_full_recalc\) vision_recalc\(0\);/u);

    const recipe = JSON.parse(readFileSync(
        'recipes/vision.c/pit-sight-archeologist-independent-a19.session.json',
        'utf8',
    ));
    await runSegment(recipe.segments[0]);

    const { ux, uy, utrap, utraptype } = game.u;
    assert.equal(utraptype, TT_PIT);
    assert.ok(utrap > 0);
    assert.equal(game.vision_full_recalc, 0,
        'allmain consumed the pit recalculation request');
    assert.equal(game.gv.vision_full_recalc, undefined,
        'the C gv flag is represented by the flattened JS state field');

    for (let y = uy - 1; y <= uy + 1; ++y) {
        for (let x = ux - 1; x <= ux + 1; ++x) {
            assert.equal(game.viz_array[y][x] & (IN_SIGHT | COULD_SEE),
                IN_SIGHT | COULD_SEE);
        }
    }
    assert.equal(game.viz_array[uy + 2][ux + 1] & COULD_SEE, 0,
        'the recalculated pit view excludes the next row');
});

// C ref: dig.c is_digging() (195-201). C compares the occupation pointer with
// dig(), which is the callback installed by use_pick_axe2().
test('is_digging compares the active occupation with dig', () => {
    const state = { go: { occupation: null } };
    assert.equal(is_digging(state), false);
    state.go.occupation = dig;
    assert.equal(is_digging(state), true);
    state.go.occupation = () => 0;
    assert.equal(is_digging(state), false);
});

// dig.c:690 and 753-780: even a hovering hero creates a real hole and its
// destination before deciding not to descend. The source hole_destination
// advances one floor, consumes rn2(4), and stops on a nonzero value.
test('digactualhole creates a hole before the levitation fall check', async () => {
    const state = digCheckState();
    state.youmonst = {};
    state.u.uprops[LEVITATION] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    state.viz_array = Array.from({ length: ROWNO }, () => []);
    state.viz_array[Y][X] = IN_SIGHT;
    const messages = [];
    const draws = [];
    await digactualhole(X, Y, state.youmonst, HOLE, state, {
        message: async line => messages.push(line),
        random: { rn2: bound => { draws.push(bound); return 1; } },
    });
    const trap = state.level.traps[0];
    assert.ok(trap);
    assert.equal(trap.ttyp, HOLE);
    assert.deepEqual(trap.dst, { dnum: 0, dlevel: 2 });
    assert.deepEqual(draws, [4]);
    assert.deepEqual(messages, ['You dig a hole through the floor.']);
    assert.equal(trap.madeby_u, true);
    assert.equal(trap.tseen, true);
    assert.equal(state.u.uz.dlevel, 1, 'levitation prevents the source descent');
});

// dig.c:665-669 changes an impossible HOLE to PIT before trap creation.
// A floating hero avoids the pit duration, isolating the fallback decision.
test('digactualhole downgrades forbidden holes but honors candig', async () => {
    for (const candig of [false, true]) {
        const state = digCheckState();
        state.youmonst = {};
        state.level.flags.hardfloor = true;
        state.level.at(X, Y).candig = candig;
        state.u.uprops[LEVITATION] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
        const bounds = [];
        await digactualhole(X, Y, null, HOLE, state, {
            message: async () => {},
            random: { rn2: bound => { bounds.push(bound); return 1; } },
        });
        assert.equal(state.level.traps[0].ttyp, candig ? HOLE : PIT);
        assert.equal(state.level.traps[0].madeby_u, true, 'BY_OBJECT blames the hero');
        assert.deepEqual(bounds, candig ? [4] : []);
        assert.equal(state.u.uz.dlevel, 1);
    }
});

// dig.c:697-713 sees a trap only when visible, or feels it only for BY_YOU.
// An adjacent broken-wand pit does not assign the hero a pit duration.
test('digactualhole keeps unseen object-created adjacent pits out of hero trap state', async () => {
    const state = digCheckState();
    state.youmonst = {};
    state.level.at(X + 1, Y).typ = ROOM; // Adjacent to the arbitrary hero square.
    const messages = [];
    await digactualhole(X + 1, Y, null, PIT, state, {
        message: async line => messages.push(line),
        random: { rn1: () => assert.fail('adjacent pit cannot trap the hero') },
    });
    const trap = state.level.traps[0];
    assert.equal(trap.tseen, false);
    assert.equal(trap.madeby_u, true);
    assert.equal(state.u.utrap ?? 0, 0);
    assert.deepEqual(messages, []);
});

// dig.c:654-659 releases floor entrapment before making the trap, and the
// hero-created PIT then uses rn1(4,2) and publishes the vision change.
test('digactualhole releases solid-floor entrapment before trapping the hero in a pit', async () => {
    const state = digCheckState();
    state.youmonst = {};
    state.u.ulevel = 1; // Bounds wake_nearby's ordinary source scan.
    state.u.utrap = 3; // Any positive duration activates TT_INFLOOR release.
    state.u.utraptype = TT_INFLOOR;
    const calls = [];
    await digactualhole(X, Y, state.youmonst, PIT, state, {
        message: async () => {},
        random: { rn1: (range, base) => { calls.push([range, base]); return base; } },
    });
    assert.deepEqual(calls, [[4, 2]]);
    assert.deepEqual([state.u.utrap, state.u.utraptype], [2, TT_PIT]);
    assert.equal(state.vision_full_recalc, 1);
});

test('real nonhero HOLE settles the shopkeeper before the unchanged migration refusal', async () => {
    const recipe = JSON.parse(readFileSync(
        'recipes/do.c/dodrop-in-generated-shop-cancel-9701133.session.json',
        'utf8',
    ));
    await runSegment(recipe.segments[0]);
    const state = game;
    const roomNo = state.level.at(state.u.ux, state.u.uy).roomno;
    assert.ok(roomNo >= ROOMOFFSET);
    assert.ok(state.level.flags.has_shop);
    assert.equal(state.u.ushops[0], roomNo);
    const keeper = shop_keeper(roomNo, state);
    assert.ok(keeper?.isshk && keeper.mextra?.eshk);
    const eshk = keeper.mextra.eshk;
    const target = { x: keeper.mx, y: keeper.my };
    const location = state.level.at(target.x, target.y);
    assert.ok(IS_ROOM(location.typ) && !IS_FURNITURE(location.typ));
    assert.equal(state.level.objects?.[target.x]?.[target.y] ?? null, null);
    assert.equal((state.level.traps ?? []).some((trap) =>
        trap.tx === target.x && trap.ty === target.y), false);
    assert.equal(Can_dig_down(state.u.uz, state), true);
    assert.ok(state.u.uz.dlevel < dunlevs_in_dungeon(state.u.uz, state));
    assert.equal(on_level(state.u.uz, state.stronghold_level), false);
    assert.equal(u_at(target.x, target.y, state), false);
    assert.equal(state.u.ustuck ?? null, null);
    assert.equal(state.u.usteed ?? null, null);
    assert.equal(state.youmonst.mleashed ?? false, false);

    const targetMonster = m_at(target.x, target.y, state);
    assert.equal(targetMonster, keeper);
    assert.ok(grounded(keeper.data, state));
    assert.equal(keeper.wormno ?? 0, 0);
    assert.ok(keeper.data.msize < 4);
    assert.notEqual(keeper, state.u.ustuck);
    assert.notEqual(keeper, state.u.usteed);
    assert.equal(keeper.mleashed ?? false, false);
    const maker = (() => {
        for (let y = 0; y < 21; y++) for (let x = 0; x < 80; x++) {
            const candidate = m_at(x, y, state);
            if (candidate && candidate !== keeper) return candidate;
        }
        return null;
    })();
    assert.ok(maker, 'the initialized level supplies an actual nonhero maker');

    const item = mksobj(DAGGER, false, false, { state });
    await addtobill(item, true, false, true, state);
    addinv(item, { state });
    const bill = eshk.bill_p[0];
    assert.equal(item.unpaid, 1);
    assert.equal(eshk.billct, 1);
    assert.equal(bill.bo_id, item.o_id);
    assert.equal(bill.bquan, 1);
    assert.equal(bill.price, 6);
    assert.equal(item.no_charge ?? false, false);

    const before = {
        billct: eshk.billct,
        bill: eshk.bill_p.slice(0, eshk.billct).map(({ bo_id, bquan, price }) =>
            ({ bo_id, bquan, price })),
        debit: eshk.debit, credit: eshk.credit, loan: eshk.loan,
        robbed: eshk.robbed, peaceful: keeper.mpeaceful,
        customer: eshk.customer, following: eshk.following,
        unpaid: item.unpaid, noCharge: item.no_charge ?? false,
        inventory: (() => {
            const ids = [];
            for (let it = state.invent; it; it = it.nobj) ids.push(it.o_id);
            return ids;
        })(),
        gameUnported: [...(state.unported ?? [])],
    };
    const display = state.nhDisplay;
    const oldOnEmptyQueue = display.onEmptyQueue;
    const acknowledgements = [];
    display.onEmptyQueue = () => {
        const screen = display.serialize();
        assert.ok(state._pending_message);
        assert.ok(screen.includes('--More--'));
        assert.ok(acknowledgements.length < 16);
        acknowledgements.push({ message: state._pending_message,
            screen, waitEpoch: display.waitEpoch });
        return 32;
    };
    let refusal;
    try {
        await assert.rejects(
            digactualhole(target.x, target.y, maker, HOLE, state),
            (error) => {
                refusal = { name: error.name, message: error.message };
                return error instanceof RangeError
                    && error.message === 'shopkeeper migration is future work';
            },
        );
    } finally {
        display.onEmptyQueue = oldOnEmptyQueue;
    }
    assert.deepEqual(refusal, {
        name: 'RangeError', message: 'shopkeeper migration is future work',
    });
    assert.equal(eshk.billct, 0);
    assert.equal(eshk.robbed, before.robbed + 6);
    assert.equal(eshk.debit, 0);
    assert.equal(eshk.credit, 0);
    assert.equal(eshk.loan, 0);
    assert.equal(item.unpaid, 0);
    assert.equal(item.no_charge ?? false, false);
    assert.equal(keeper.mpeaceful, false);
    assert.equal(eshk.customer, state.plname);
    assert.equal(eshk.following, true);
    assert.equal(eshk.surcharge, true);
    const inventory = [];
    for (let it = state.invent; it; it = it.nobj) inventory.push(it.o_id);
    assert.deepEqual(inventory, before.inventory);
    assert.equal(state.unported.has('shk.c make_angry_shk'), false);
    assert.match(state._ttyToplines, /gets angry!/u);
    assert.match(state._ttyToplines, /A hole appears in the floor/u);
    assert.equal((state.level.traps ?? []).filter((trap) =>
        trap.tx === target.x && trap.ty === target.y).length, 1);
    assert.ok(Array.isArray(acknowledgements));
});
