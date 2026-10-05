import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { OBJ_INVENT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mksobj } from '../js/obj.js';
import { DAGGER } from '../js/objects.js';
import {
    AD_RUST,
    AD_SLIM,
    AT_NONE,
    AT_WEAP,
    PM_GIANT_EEL,
    PM_GRID_BUG,
    PM_HUMAN,
    PM_PONY,
    PM_STONE_GIANT,
    MZ_TINY,
} from '../js/monsters.js';
import { can_ride } from '../js/steed.js';
import { monnear } from '../js/monmove.js';
import { passive, passive_obj } from '../js/uhitm.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const POLYSELF_C = readFileSync(
    new URL('../nethack-c/upstream/src/polyself.c', import.meta.url), 'utf8',
);
const STEED_C = readFileSync(
    new URL('../nethack-c/upstream/src/steed.c', import.meta.url), 'utf8',
);
const MON_C = readFileSync(
    new URL('../nethack-c/upstream/src/mon.c', import.meta.url), 'utf8',
);
const POLYSELF_JS = readFileSync(
    new URL('../js/polyself.js', import.meta.url), 'utf8',
);
const UHITM_JS = readFileSync(
    new URL('../js/uhitm.js', import.meta.url), 'utf8',
);
const STEED_JS = readFileSync(
    new URL('../js/steed.js', import.meta.url), 'utf8',
);
const MONMOVE_JS = readFileSync(
    new URL('../js/monmove.js', import.meta.url), 'utf8',
);
const YOU_PROP_H = readFileSync(
    new URL('../nethack-c/upstream/include/youprop.h', import.meta.url), 'utf8',
);

async function startGame() {
    // This fixed seed and date provide the ordinary initialized inventory state;
    // the passive-object source branches below do not read either value.
    await runSegment({
        seed: 771223,
        datetime: '20311014091500',
        nethackrc: [
            'OPTIONS=name:PassiveObjectTest,role:Wizard,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen',
            'OPTIONS=pettype:none',
            '',
        ].join('\n'),
        moves: '',
    });
    game.program_state.in_moveloop = true;
    game.iflags.perm_invent = false;
    return game;
}

function scripted(values) {
    const queue = [...values];
    const calls = [];
    return {
        calls,
        rn2(bound) {
            calls.push(bound);
            assert.ok(queue.length, 'only C-listed passive draws may run');
            return queue.shift();
        },
        remaining: () => queue.length,
    };
}

function sourceFunction(name) {
    const start = UHITM_C.indexOf(`\n${name}(\n`);
    const end = UHITM_C.indexOf('\n}\n', start);
    assert.ok(start >= 0 && end > start, `${name} C body is present`);
    return UHITM_C.slice(start, end);
}

function functionFrom(source, name) {
    const start = source.indexOf(`\n${name}(`);
    const end = source.indexOf('\n}', start);
    assert.ok(start >= 0 && end > start, `${name} body is present`);
    return source.slice(start, end);
}

function exportedFunctionFrom(source, declaration) {
    const start = source.indexOf(declaration);
    const end = source.indexOf('\n}', start);
    assert.ok(start >= 0 && end > start, `${declaration} body is present`);
    return source.slice(start, end);
}

test('polymon preserves its C return and post-form branch order', () => {
    const c = functionFrom(POLYSELF_C, 'polymon');
    const js = exportedFunctionFrom(
        POLYSELF_JS, 'export async function polymon(',
    );
    assert.match(c,
        /if \(svm\.mvitals\[mntmp\]\.mvflags & G_GENOD\)[\s\S]*?return 0;/u);
    assert.match(c,
        /if \(Stoned && poly_when_stoned\(&mons\[mntmp\]\)\)[\s\S]*?mntmp = PM_STONE_GOLEM;[\s\S]*?make_stoned/u);
    assert.match(c,
        /was_hiding_under = u\.uundetected && hides_under\(gy\.youmonst\.data\)/u);
    assert.match(c,
        /if \(u\.uswallow\)[\s\S]*?expels\(u\.ustuck, u\.ustuck->data, expels_mesg\);[\s\S]*?was_expelled = TRUE/u);
    assert.match(c,
        /else if \(sticking && !sticks\(gy\.youmonst\.data\)\)[\s\S]*?uunstick\(\)/u);
    assert.match(c,
        /if \(u\.usteed\)[\s\S]*?if \(!can_ride\(u\.usteed\)\)\s*dismount_steed\(DISMOUNT_POLY\)/u);
    assert.match(c,
        /if \(Passes_walls && u\.utrap[\s\S]*?reset_utrap\(TRUE\)/u);
    assert.match(c,
        /if \(u\.utrap && \(u\.utraptype == TT_WEB \|\| u\.utraptype == TT_BEARTRAP\)[\s\S]*?reset_utrap\(TRUE\)/u);
    assert.match(c, /return 1;/u);
    assert.match(js,
        /if \(u\.uprops\[STONED\]\.intrinsic[\s\S]*?poly_when_stoned\(mdat, state\)[\s\S]*?mntmp = M\.PM_STONE_GOLEM;[\s\S]*?make_stoned/u);
    assert.match(js, /if \(wasHidingUnder\)\s*note_unported\('mon\.c hideunder hero'\)/u);
    assert.match(js,
        /if \(u\.uswallow\)[\s\S]*?await expels\(engulfer[\s\S]*?wasExpelled = true/u);
    assert.match(js, /else if \(sticking && !sticks\(state\.youmonst\.data\)\)\s*\{\s*await uunstick/u);
    assert.match(js, /if \(!can_ride\(u\.usteed, state\)\)\s*note_unported\('steed\.c dismount_steed'\)/u);
    assert.match(js, /note_unported\('dig\.c buried_ball_to_freedom'\)/u);
    assert.match(js, /return 0;[\s\S]*?return 1;/u);
    assert.match(js,
        /if \(state\.multi < 0 && M_AP_TYPE\(state\.youmonst\) === M_AP_OBJECT\s*&& state\.youmonst\.data\.mlet !== M\.S_MIMIC\s*&& mdat\.mlet !== M\.S_MIMIC\)\s*\{\s*await unmul/u);
    assert.match(YOU_PROP_H,
        /#define Swimming[\s\S]*?HSwimming \|\| ESwimming \|\| \(u\.usteed && is_swimmer\(u\.usteed->data\)\)/u);
    assert.match(YOU_PROP_H,
        /#define Passes_walls \(HPasses_walls \|\| EPasses_walls\)/u);
    assert.match(js,
        /const swimming = u\.uprops\[SWIMMING\];\s*const isSwimming = swimming\.intrinsic \|\| swimming\.extrinsic\s*\|\| \(u\.usteed && is_swimmer\(u\.usteed\.data\)\);\s*const unsafeUnderwater = u\.uinwater && !isSwimming/u);
    assert.match(js,
        /const passesWalls = u\.uprops\[PASSES_WALLS\]\.intrinsic\s*\|\| u\.uprops\[PASSES_WALLS\]\.extrinsic/u);
    const passiveJs = exportedFunctionFrom(
        UHITM_JS, 'export async function passive(',
    );
    assert.match(passiveJs,
        /poly_when_stoned\(state\.youmonst\.data, state\)\s*&& await polymon\(PM_STONE_GOLEM, state, effectEnv\)/u);
});

test('can_ride pins all C gates without drawing or changing state', async () => {
    const c = functionFrom(STEED_C, 'can_ride');
    const js = exportedFunctionFrom(STEED_JS, 'export function can_ride(');
    assert.match(c,
        /mtmp->mtame && humanoid\(gy\.youmonst\.data\)\s*&& !verysmall\(gy\.youmonst\.data\) && !bigmonst\(gy\.youmonst\.data\)\s*&& \(!Underwater \|\| is_swimmer\(mtmp->data\)\)/u);
    assert.match(js,
        /Boolean\(mtmp\.mtame\) && humanoid\(you\)\s*&& !verysmall\(you\) && !bigmonst\(you\)\s*&& \(!state\.u\.uinwater \|\| is_swimmer\(mtmp\.data\)\)/u);

    const state = await startGame();
    state.youmonst.data = state.mons[PM_HUMAN];
    // C treats any nonzero mtame as true; this source-shaped pony exercises that gate.
    const pony = { mtame: 1, data: state.mons[PM_PONY] };
    assert.equal(can_ride(pony, state), true);
    // uinwater is C's Underwater macro; a non-swimming mount fails this clause.
    state.u.uinwater = 1;
    assert.equal(can_ride(pony, state), false);
    // Giant eels satisfy C's is_swimmer() exception while underwater.
    assert.equal(can_ride({ ...pony, data: state.mons[PM_GIANT_EEL] }, state),
        true);
    state.u.uinwater = 0;
    // MZ_TINY keeps the humanoid gate true while verysmall() rejects the form.
    state.youmonst.data = {
        ...state.mons[PM_HUMAN],
        msize: MZ_TINY,
    };
    assert.equal(can_ride(pony, state), false);
    state.youmonst.data = state.mons[PM_STONE_GIANT];
    assert.equal(can_ride(pony, state), false);
    assert.equal(can_ride({ ...pony, mtame: 0 }, state), false);
});

test('monnear uses squared distance and the grid-bug diagonal exception', async () => {
    const c = functionFrom(MON_C, 'monnear');
    const js = exportedFunctionFrom(MONMOVE_JS, 'export function monnear(');
    assert.match(c,
        /int distance = dist2\(mon->mx, mon->my, x, y\);\s*if \(distance == 2 && NODIAG\(mon->data - mons\)\)\s*return 0;\s*return \(boolean\) \(distance < 3\)/u);
    assert.match(js,
        /const distance = dist2\(monster\.mx, monster\.my, x, y\);\s*if \(distance === 2 && isSpecies\(monster, PM_GRID_BUG, state\)\)\s*return false;\s*return distance < 3/u);
    assert.match(sourceFunction('passive'),
        /case AD_COLD:[\s\S]*?if \(monnear\(mon, u\.ux, u\.uy\)\)/u);

    const state = await startGame();
    // This ordinary monster and coordinate pair have squared diagonal distance 2.
    const ordinary = { mx: 5, my: 5, data: state.mons[PM_HUMAN] };
    const gridBug = { mx: 5, my: 5, data: state.mons[PM_GRID_BUG] };
    assert.equal(monnear(ordinary, 6, 6, state), true);
    assert.equal(monnear(gridBug, 6, 6, state), false);
    // A one-square orthogonal step has squared distance 1 for either species.
    assert.equal(monnear(gridBug, 6, 5, state), true);
    // Two orthogonal squares have squared distance 4 and are outside the C limit.
    assert.equal(monnear(ordinary, 7, 5, state), false);
});

test('passive preserves both C switches, their order, and early return', () => {
    const c = sourceFunction('passive');
    const js = exportedFunctionFrom(
        UHITM_JS, 'export async function passive(',
    );
    // These are the complete C damage-type arms, repeated across the two switches.
    for (const damageType of [
        'AD_FIRE', 'AD_ACID', 'AD_STON', 'AD_RUST', 'AD_CORR', 'AD_MAGM',
        'AD_ENCH', 'AD_PLYS', 'AD_COLD', 'AD_STUN', 'AD_ELEC',
    ]) {
        assert.match(c, new RegExp(`case ${damageType}:`, 'u'));
        assert.match(js, new RegExp(`case ${damageType}:`, 'u'));
    }
    assert.match(c,
        /for \(i = 0;; i\+\+\)[\s\S]*?if \(i >= NATTK\)[\s\S]*?if \(ptr->mattk\[i\]\.aatyp == AT_NONE\)[\s\S]*?if \(ptr->mattk\[i\]\.damn\)[\s\S]*?switch \(ptr->mattk\[i\]\.adtyp\)/u);
    assert.match(js,
        /for \(;; i\+\+\)[\s\S]*?if \(i >= NATTK\)[\s\S]*?if \(ptr\.mattk\[i\]\.aatyp === AT_NONE\)[\s\S]*?if \(mattk\.damn\)[\s\S]*?switch \(mattk\.adtyp\)/u);
    assert.match(c,
        /if \(malive && !mon->mcan && rn2\(3\)\)[\s\S]*?switch \(ptr->mattk\[i\]\.adtyp\)[\s\S]*?return \(malive \| mhit\)/u);
    assert.match(js,
        /if \(maliveb && !mon\.mcan && random\.rn2\(3\)\)[\s\S]*?switch \(mattk\.adtyp\)[\s\S]*?return malive \| mhit/u);
    assert.match(c,
        /poly_when_stoned\(gy\.youmonst\.data\)\s*&& polymon\(PM_STONE_GOLEM\)/u);
    assert.match(js,
        /poly_when_stoned\(state\.youmonst\.data, state\)\s*&& await polymon\(PM_STONE_GOLEM, state, effectEnv\)/u);
});

test('passive_obj source preserves each switch arm and final carried refresh', () => {
    const source = sourceFunction('passive_obj');
    assert.match(source, /if \(!obj\)[\s\S]*?u\.twoweap[\s\S]*?if \(!mattk\)[\s\S]*?NATTK/u);
    assert.match(source, /case AD_FIRE:[\s\S]*?rn2\(6\)[\s\S]*?\(void\) erode_obj\(obj, NULL, ERODE_BURN, EF_NONE\)/u);
    assert.match(source, /case AD_ACID:[\s\S]*?rn2\(6\)[\s\S]*?ERODE_CORRODE, EF_GREASE/u);
    assert.match(source, /case AD_RUST:[\s\S]*?if \(!mon->mcan\)[\s\S]*?ERODE_RUST, EF_GREASE/u);
    assert.match(source, /case AD_CORR:[\s\S]*?if \(!mon->mcan\)[\s\S]*?ERODE_CORRODE, EF_GREASE/u);
    assert.match(source, /case AD_ENCH:[\s\S]*?drain_item\(obj, TRUE\)[\s\S]*?obj->known \|\| obj->oclass == ARMOR_CLASS/u);
    assert.match(source, /default:\s*break;[\s\S]*?if \(carried\(obj\)\)\s*update_inventory\(\)/u);

    const caller = sourceFunction('passive');
    assert.match(caller, /case AD_RUST:[\s\S]*?passive_obj\(mon, weapon, &\(ptr->mattk\[i\]\)\)/u);
    assert.match(caller, /case AD_CORR:[\s\S]*?passive_obj\(mon, weapon, &\(ptr->mattk\[i\]\)\)/u);
    assert.match(caller, /if \(malive && !mon->mcan && rn2\(3\)\)/u);
});

test('passive_obj leaves unsupported damage types as C no-ops and refreshes carried items',
    async () => {
        const state = await startGame();
        const object = mksobj(DAGGER, false, false, { state });
        object.where = OBJ_INVENT;
        const random = scripted([]);
        let inventoryRefreshes = 0;

        // AD_SLIM has no case body in passive_obj; C reaches update_inventory
        // because the selected dagger is carried.
        await passive_obj({ data: {} }, object, { adtyp: AD_SLIM }, state, {
            random,
            hooks: {
                updateInventory: () => { inventoryRefreshes++; },
            },
        });

        assert.deepEqual(random.calls, []);
        assert.equal(random.remaining(), 0);
        assert.equal(inventoryRefreshes, 1);
    });

test('passive wires the rust-object arm before its source trailing roll', async () => {
    const state = await startGame();
    const weapon = mksobj(DAGGER, false, false, { state });
    weapon.where = OBJ_INVENT;
    const random = scripted([1]); // rn2(3)=1 selects C's empty rust follow-up.
    const events = [];
    const monster = {
        data: {
            mattk: [{ aatyp: AT_NONE, adtyp: AD_RUST, damn: 0, damd: 0 }],
        },
        mcan: false,
    };

    await passive(monster, weapon, true, true, AT_WEAP, false, state, {
        random,
        message: async (line) => { events.push(`message:${line}`); },
        hooks: {
            updateInventory: () => { events.push('inventory'); },
        },
    });

    assert.equal(weapon.oeroded, 1);
    assert.deepEqual(random.calls, [3]);
    assert.equal(random.remaining(), 0);
    assert.ok(events.some((event) => event.includes('rusts!')));
    assert.ok(events.includes('inventory'));
});
