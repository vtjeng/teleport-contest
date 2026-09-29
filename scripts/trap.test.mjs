import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { HOLE, MAX_NUM_WORMS, Trap_Effect_Finished } from '../js/const.js';
import { game } from '../js/gstate.js';
import { MZ_HUGE, monst_globals_init, PM_LONG_WORM } from '../js/monsters.js';
import { trapeffect_selector } from '../js/trap_effects.js';
import { count_wsegs } from '../js/worm.js';

const C_TRAP = readFileSync(
    new URL('../nethack-c/upstream/src/trap.c', import.meta.url), 'utf8',
);
const C_PICKUP = readFileSync(
    new URL('../nethack-c/upstream/src/pickup.c', import.meta.url), 'utf8',
);
const JS_TRAP = readFileSync(new URL('../js/trap.js', import.meta.url), 'utf8');
const JS_TRAP_EFFECTS = readFileSync(
    new URL('../js/trap_effects.js', import.meta.url), 'utf8',
);
const JS_PICKUP = readFileSync(
    new URL('../js/pickup.js', import.meta.url), 'utf8',
);

function cFunction(source, declaration, endMarker) {
    const start = source.indexOf(declaration);
    assert.notEqual(start, -1, `missing C declaration: ${declaration}`);
    const end = source.indexOf(endMarker, start);
    assert.notEqual(end, -1, `missing C function boundary: ${endMarker}`);
    return source.slice(start, end);
}

test('chest_trap flushes its trigger message before the Luck roll', () => {
    const cChestTrap = cFunction(
        C_TRAP,
        'chest_trap(\n    struct obj *obj,',
        '\nstruct trap *\nt_at(',
    );
    const jsStart = JS_TRAP.indexOf('export async function chest_trap(');
    assert.notEqual(jsStart, -1);
    const jsChestTrap = JS_TRAP.slice(jsStart);

    const cMessage = cChestTrap.indexOf(
        'You(disarm ? "set it off!" : "trigger a trap!");',
    );
    const cFlush = cChestTrap.indexOf(
        'display_nhwindow(WIN_MESSAGE, FALSE);', cMessage,
    );
    const cLuck = cChestTrap.indexOf(
        'if (Luck > -13 && rn2(13 + Luck) > 7)', cMessage,
    );
    assert.ok(cMessage >= 0 && cMessage < cFlush && cFlush < cLuck);

    const jsMessage = jsChestTrap.indexOf('await ttyPline(');
    const jsFlush = jsChestTrap.indexOf(
        'await displayPendingTtyMessageWindow(state);', jsMessage,
    );
    const jsLuck = jsChestTrap.indexOf(
        'if (Luck > -13 && rn2(13 + Luck) > 7)', jsMessage,
    );
    assert.ok(jsMessage >= 0 && jsMessage < jsFlush && jsFlush < jsLuck);
});

test('electric chest resistance animates before its resistance message', () => {
    const cChestTrap = cFunction(
        C_TRAP,
        'chest_trap(\n    struct obj *obj,',
        '\nstruct trap *\nt_at(',
    );
    const cBranchStart = cChestTrap.indexOf('case 8:');
    const cBranchEnd = cChestTrap.indexOf('} /* case 6 */', cBranchStart);
    const cBranch = cChestTrap.slice(cBranchStart, cBranchEnd);
    const cCharge = cBranch.indexOf('You("are jolted by a surge of electricity!");');
    const cResistance = cBranch.indexOf('if (Shock_resistance)', cCharge);
    const cShield = cBranch.indexOf('shieldeff(u.ux, u.uy);', cResistance);
    const cUnaffected = cBranch.indexOf('You("don\'t seem to be affected.");', cShield);
    const cPerception = cBranch.indexOf('monstseesu(M_SEEN_ELEC);', cUnaffected);
    const cDestroy = cBranch.indexOf(
        'destroy_items(&gy.youmonst, AD_ELEC, orig_dmg);', cPerception,
    );
    assert.ok(cCharge >= 0 && cCharge < cResistance
        && cResistance < cShield && cShield < cUnaffected
        && cUnaffected < cPerception && cPerception < cDestroy);

    const jsStart = JS_TRAP.indexOf('export async function chest_trap(');
    const jsChestTrap = JS_TRAP.slice(jsStart);
    const jsBranchStart = jsChestTrap.indexOf('case 8: case 7: case 6:');
    const jsBranchEnd = jsChestTrap.indexOf('\n        case 5: case 4: case 3:', jsBranchStart);
    const jsBranch = jsChestTrap.slice(jsBranchStart, jsBranchEnd);
    const jsCharge = jsBranch.indexOf("await ttyPline('You are jolted by a surge of electricity!', state);");
    const jsResistance = jsBranch.indexOf('if (Shock_resistance(state))', jsCharge);
    const jsShield = jsBranch.indexOf('await shieldeff(u.ux, u.uy, state);', jsResistance);
    const jsUnaffected = jsBranch.indexOf('await ttyPline("You don\'t seem to be affected.", state);', jsShield);
    const jsPerception = jsBranch.indexOf('monstseesu(M_SEEN_ELEC, state);', jsUnaffected);
    const jsDestroy = jsBranch.indexOf(
        'await destroy_items(state.youmonst, AD_ELEC, orig_dmg, {', jsPerception,
    );
    const jsRandom = jsBranch.indexOf(
        'random: { d, rn1, rn2, rnd, rne, rnl },', jsDestroy,
    );
    assert.ok(jsCharge >= 0 && jsCharge < jsResistance
        && jsResistance < jsShield && jsShield < jsUnaffected
        && jsUnaffected < jsPerception && jsPerception < jsDestroy
        && jsDestroy < jsRandom);
});

test('loot, disarm, and tip preserve their discarded-result chest_trap calls', () => {
    assert.match(C_PICKUP, /\(void\) chest_trap\(obj, HAND, FALSE\);/u);
    assert.match(C_TRAP, /\(void\) chest_trap\(box, FINGER, TRUE\);/u);
    assert.match(C_PICKUP, /\(void\) chest_trap\(box, HAND, FALSE\);/u);

    assert.match(JS_PICKUP, /await chest_trap\(obj, HAND, false, state\);/u);
    assert.match(JS_TRAP, /await chest_trap\(box, FINGER, true, state\);/u);
    assert.match(JS_PICKUP, /await chest_trap\(box, HAND, false, state\);/u);
});

test('trapeffect_hole reads tail count from the supplied planning state',
    async () => {
        const savedLevel = game.level;
        const liveWormSlots = Array(MAX_NUM_WORMS).fill(null);
        liveWormSlots[1] = {
            // Four visible segments plus its hidden head node stay below the
            // C `count_wsegs(mtmp) > 5` cutoff in the unrelated live game.
            segments: Array.from({ length: 5 }, () => ({})),
            growtime: 0,
        };
        game.level = { worms: liveWormSlots };

        try {
            const state = {
                level: {
                    flags: { hardfloor: false },
                    worms: Array(MAX_NUM_WORMS).fill(null),
                },
                u: {
                    // D:0 level 2 can fall through; the destination is the
                    // next level in the same 20-level test dungeon.
                    uz: { dnum: 0, dlevel: 2 },
                    uprops: [],
                },
                dungeons: [{
                    depth_start: 1,
                    ledger_start: 0,
                    num_dunlevs: 20,
                    flags: { hellish: false },
                }],
            };
            monst_globals_init(state);
            // Real C long worms are already at least MZ_HUGE, so the later
            // msize term masks this tail-count conjunct in valid species
            // records. Lower only the copied species size to test the caller's
            // supplied-state ownership at the earlier expression term.
            const originalSize = state.mons[PM_LONG_WORM].msize;
            assert.ok(originalSize >= MZ_HUGE,
                'C long-worm size independently rejects hole transfer');
            state.mons[PM_LONG_WORM] = {
                ...state.mons[PM_LONG_WORM],
                msize: MZ_HUGE - 1,
            };
            const worm = {
                data: state.mons[PM_LONG_WORM],
                wormno: 1, // C reserves slot zero; this uses the first worm.
                mx: 8, // Interior coordinates; invisibility suppresses output.
                my: 9,
                minvis: true, // Suppress unrelated visible fall messaging.
                mleashed: 0,
            };
            state.level.worms[1] = {
                // Six visible tails plus the hidden head exceed C's >5 test.
                // The count helper reads node count, not these coordinates.
                segments: Array.from({ length: 7 }, () => ({})),
                growtime: 0,
            };
            assert.equal(count_wsegs(worm, state), 6,
                'the planning clone has six visible segments');
            assert.equal(count_wsegs(worm, game), 4,
                'the live singleton independently has four visible segments');
            assert.equal(state.mons[PM_LONG_WORM].msize, MZ_HUGE - 1,
                'the cloned species reaches the tail-count guard first');

            const cHoleStart = C_TRAP.indexOf('trapeffect_hole(\n');
            const cHoleEnd = C_TRAP.indexOf(
                '\nstaticfn int\ntrapeffect_telep_trap(', cHoleStart,
            );
            assert.ok(cHoleStart >= 0 && cHoleEnd > cHoleStart);
            const cHole = C_TRAP.slice(cHoleStart, cHoleEnd);
            assert.match(cHole, /mtmp->wormno && count_wsegs\(mtmp\) > 5/u);
            assert.match(cHole, /mptr->msize >= MZ_HUGE/u);
            assert.match(C_TRAP,
                /case HOLE:\s*case TRAPDOOR:\s*return trapeffect_hole\(mtmp, trap, trflags\);/u);

            const jsHoleStart = JS_TRAP_EFFECTS.indexOf(
                'async function trapeffect_hole(',
            );
            const jsHoleEnd = JS_TRAP_EFFECTS.indexOf(
                '\n// C ref: trap.c trapeffect_telep_trap()', jsHoleStart,
            );
            assert.ok(jsHoleStart >= 0 && jsHoleEnd > jsHoleStart);
            const jsHole = JS_TRAP_EFFECTS.slice(jsHoleStart, jsHoleEnd);
            assert.match(jsHole, /count_wsegs\(mtmp, state\) > 5/u);
            assert.match(JS_TRAP_EFFECTS,
                /if \(trap\.ttyp === HOLE \|\| trap\.ttyp === TRAPDOOR\)\s*return trapeffect_hole\(monster, trap, trflags, env\);/u);

            let migrated = false;
            const result = await trapeffect_selector(
                worm,
                {
                    ttyp: HOLE,
                    madeby_u: true, // Ordinary holes are escapable outside Sokoban.
                    dst: { dnum: 0, dlevel: 3 }, // Next level in the test dungeon.
                },
                0,
                {
                    state,
                    // The helper requires an owner even though this path uses
                    // no unsupported operation; migration is tracked below.
                    unsupported: () => {},
                    migrateToLevel: () => { migrated = true; },
                },
            );
            assert.equal(result, Trap_Effect_Finished);
            assert.equal(migrated, false,
                'the clone’s six tails stop ordinary hole migration');
        } finally {
            if (savedLevel === undefined) delete game.level;
            else game.level = savedLevel;
        }
    });
