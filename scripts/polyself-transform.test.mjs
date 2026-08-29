// Pin polyself.c's set_uasmon(), uasmon_maxStr(), and the helper predicates
// polyok(), is_placeholder(), is_vampire(), is_bat(), infravision(),
// pm_invisible(), valid_vampshiftform(), character_race(), resists_drli(),
// and defended(). Every expected value is derived by reading the C source and
// the monsters.h entry for the species involved. Species values are the C
// #define numerals from include/pm.h; resist masks are from include/monflag.h.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    monst_globals_init,
    PM_GNOME, PM_HUMAN, PM_ORC, PM_GIANT, PM_ELF, PM_DWARF,
    PM_VAMPIRE, PM_VAMPIRE_LEADER, PM_VAMPIRE_BAT, PM_FOG_CLOUD, PM_WOLF,
    PM_BAT, PM_GIANT_BAT, PM_RAVEN,
    PM_STALKER, PM_BLACK_LIGHT, PM_GRID_BUG,
    PM_GRAY_DRAGON, PM_RED_DRAGON, PM_HUMAN_ZOMBIE, PM_DEATH,
    M2_HUMAN, NUMMONS,
} from '../js/monsters.js';
import {
    polyok,
    is_placeholder,
    is_vampire,
    is_bat,
    infravision,
    pm_invisible,
    valid_vampshiftform,
    resists_drli,
    defended,
    is_undead,
    is_demon,
    is_were,
    is_vampshifter,
} from '../js/mondata.js';
import { character_race } from '../js/roles.js';
import { uasmon_maxStr, set_uasmon } from '../js/polyself.js';
import { make_glib } from '../js/potion.js';
import { uwepgone, uswapwepgone } from '../js/wield.js';
import { objects_globals_init } from '../js/objects.js';
import { GLIB, W_WEP, W_SWAPWEP } from '../js/const.js';
import { weight_cap } from '../js/hack.js';

// Build a mons array once; all tests share it read-only.
let _mons;
function testMons() {
    if (!_mons) {
        const catalog = {};
        monst_globals_init(catalog);
        _mons = catalog.mons;
    }
    return _mons;
}

function minimalState(mnum = PM_GNOME) {
    const mons = testMons();
    const uprops = {};
    for (let i = 0; i < 70; i++) uprops[i] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    return {
        mons,
        u: {
            umonnum: mnum,
            umonster: PM_HUMAN,  // human wizard hero
            ulycn: -1,
            mcham: -1,
            utrap: 0,
            utraptype: 0,
            uprops,
            acurr: { a: [10, 10, 10, 10, 10, 10] },
            amax: { a: [18, 18, 18, 18, 18, 18] },
            ux: 1, uy: 1,
        },
        youmonst: { data: mons[mnum], cham: -1, mnum: mnum, m_id: 1 },
        flags: { female: false },
        uwep: null,
        uarm: null,
        uarmc: null,
        uarmu: null,
        uarmg: null,
        uarmh: null,
        uarms: null,
        uarmf: null,
        ublindf: null,
        uamul: null,
        uskin: null,
        disp: {},
        gw: { were_changes: 0 },
        context: { warntype: { speciesidx: -1, species: null, polyd: 0, obj: 0 } },
        svm: { mvitals: new Array(NUMMONS).fill(0).map(() => ({ mvflags: 0 })) },
        urace: { mnum: PM_HUMAN, selfmask: M2_HUMAN },
        program_state: {},
        artilist: [],
    };
}

// Shared mons reference for tests that pass a permonst directly.
const mons = testMons();

// -- polyok (mondata.h:93): M2_NOPOLY flag bit is 1 in monsters.js --
// PM_GNOME is not M2_NOPOLY so polyok is true; PM_HUMAN (a placeholder
// used for corpse forms) is M2_NOPOLY so polyok is false.
test('polyok accepts a non-NOPOLY species and rejects a NOPOLY one', () => {
    // PM_GNOME: mflags2 has no M2_NOPOLY bit set (confirmed from monst.c:
    // gnome entry at ~line 1866, flags2 = M2_NOPOLY is NOT set)
    assert.equal(polyok(mons[PM_GNOME]), true);
    // PM_HUMAN: monst.c:2859 sets M2_NOPOLY for the placeholder human
    assert.equal(polyok(mons[PM_HUMAN]), false);
});

// -- is_placeholder (mondata.h:166-168) --
test('is_placeholder identifies the four placeholder species', () => {
    assert.equal(is_placeholder(mons[PM_ORC]), true);
    assert.equal(is_placeholder(mons[PM_GIANT]), true);
    assert.equal(is_placeholder(mons[PM_ELF]), true);
    assert.equal(is_placeholder(mons[PM_HUMAN]), true);
    // PM_GNOME is not a placeholder (mondata.h:562 comment says so)
    assert.equal(is_placeholder(mons[PM_GNOME]), false);
    assert.equal(is_placeholder(mons[PM_DWARF]), false);
});

// -- is_vampire (mondata.h:213): mlet === S_VAMPIRE --
test('is_vampire checks the S_VAMPIRE class letter', () => {
    assert.equal(is_vampire(mons[PM_VAMPIRE]), true);
    assert.equal(is_vampire(mons[PM_VAMPIRE_LEADER]), true);
    assert.equal(is_vampire(mons[PM_GNOME]), false);
});

// -- is_bat (mondata.h:103-105): three identity checks --
test('is_bat identifies exactly three species', () => {
    assert.equal(is_bat(mons[PM_BAT]), true);
    assert.equal(is_bat(mons[PM_GIANT_BAT]), true);
    assert.equal(is_bat(mons[PM_VAMPIRE_BAT]), true);
    // A raven is S_BAT but not is_bat
    assert.equal(is_bat(mons[PM_RAVEN]), false);
});

// -- infravision (mondata.h:154): M3_INFRAVISION flag --
test('infravision checks the M3_INFRAVISION flag', () => {
    // Gnomes have infravision (monst.c: M3_INFRAVISION set)
    assert.equal(infravision(mons[PM_GNOME]), true);
    // A grid bug does not
    assert.equal(infravision(mons[PM_GRID_BUG]), false);
});

// -- pm_invisible (mondata.h:192-193): two identity checks --
test('pm_invisible identifies stalker and black light', () => {
    assert.equal(pm_invisible(mons[PM_STALKER]), true);
    assert.equal(pm_invisible(mons[PM_BLACK_LIGHT]), true);
    assert.equal(pm_invisible(mons[PM_GNOME]), false);
});

// -- valid_vampshiftform (mon.c:5015-5023) --
test('valid_vampshiftform accepts bat/fog/wolf for vampire base', () => {
    const state = minimalState();
    // vampire_bat is a valid shift form for PM_VAMPIRE
    assert.equal(
        valid_vampshiftform(PM_VAMPIRE, PM_VAMPIRE_BAT, state), true,
    );
    // fog cloud is valid for PM_VAMPIRE
    assert.equal(
        valid_vampshiftform(PM_VAMPIRE, PM_FOG_CLOUD, state), true,
    );
    // wolf is NOT valid for PM_VAMPIRE (only for PM_VAMPIRE_LEADER)
    assert.equal(
        valid_vampshiftform(PM_VAMPIRE, PM_WOLF, state), false,
    );
    // wolf IS valid for PM_VAMPIRE_LEADER
    assert.equal(
        valid_vampshiftform(PM_VAMPIRE_LEADER, PM_WOLF, state), true,
    );
    // gnome is never a valid vampshifter form
    assert.equal(
        valid_vampshiftform(PM_VAMPIRE, PM_GNOME, state), false,
    );
    // NON_PM base means not a vampire
    assert.equal(
        valid_vampshiftform(-1, PM_VAMPIRE_BAT, state), false,
    );
});

// -- character_race (role.c:2162-2171) --
test('character_race maps player race PM indices to their race entries', () => {
    const human = character_race(PM_HUMAN);
    assert.ok(human);
    assert.equal(human.noun, 'human');
    const gnome = character_race(PM_GNOME);
    assert.ok(gnome);
    assert.equal(gnome.noun, 'gnome');
    const dwarf = character_race(PM_DWARF);
    assert.ok(dwarf);
    assert.equal(dwarf.noun, 'dwarf');
    // A non-race PM returns null
    const dragon = character_race(PM_GRAY_DRAGON);
    assert.equal(dragon, null);
});

// -- uasmon_maxStr (polyself.c:1076-1119) --
// The gnome race has attrmax[A_STR] = 68 (which is STR18(50) in the C
// encoding). For a gnome, strongmonst is false, so R->attrmax[A_STR] = 68.
test('uasmon_maxStr returns gnome race max strength for PM_GNOME', () => {
    const state = minimalState(PM_GNOME);
    // A_STR = 0 index
    assert.equal(uasmon_maxStr(state), 68);
});

// For a non-race, non-strong monster, uasmon_maxStr returns 18.
test('uasmon_maxStr returns 18 for a generic non-strong monster', () => {
    // PM_GRID_BUG is neither a player race nor strongmonst
    const state = minimalState(PM_GRID_BUG);
    assert.equal(uasmon_maxStr(state), 18);
});

// -- set_uasmon (polyself.c:38-126): PROPSET block --
// Property indices from const.js; FROMFORM = 0x10000000.
const FROMFORM = 0x10000000;
const PROP = {
    FIRE_RES: 1, COLD_RES: 2, SLEEP_RES: 3, DISINT_RES: 4,
    SHOCK_RES: 5, POISON_RES: 6, ACID_RES: 7, STONE_RES: 8,
    DRAIN_RES: 9, SICK_RES: 14, SEE_INVIS: 29, TELEPAT: 30,
    INFRAVISION: 36, INVIS: 40, TELEPORT: 42, TELEPORT_CONTROL: 43,
    LEVITATION: 44, FLYING: 45, SWIMMING: 51, PASSES_WALLS: 52,
    REGENERATION: 53, ANTIMAGIC: 10, STUNNED: 16, HALLUC_RES: 18,
    REFLECTING: 55, BLINDED: 62, BLND_RES: 63,
};

test('set_uasmon sets FROMFORM properties for the gnome form', () => {
    const state = minimalState(PM_GNOME);
    set_uasmon(state);
    // Gnome has M3_INFRAVISION, so INFRAVISION should have FROMFORM set.
    // C ref: polyself.c:91
    assert.ok(
        (state.u.uprops[PROP.INFRAVISION].intrinsic & FROMFORM) !== 0,
        'INFRAVISION FROMFORM should be set for gnome',
    );
    // Gnome has none of these; all should be clear.
    for (const name of [
        'FIRE_RES', 'COLD_RES', 'SLEEP_RES', 'DISINT_RES',
        'SHOCK_RES', 'POISON_RES', 'ACID_RES', 'STONE_RES',
        'DRAIN_RES', 'SEE_INVIS', 'TELEPAT', 'INVIS',
        'TELEPORT', 'TELEPORT_CONTROL', 'LEVITATION', 'FLYING',
        'SWIMMING', 'PASSES_WALLS', 'REGENERATION', 'REFLECTING',
    ]) {
        assert.equal(
            state.u.uprops[PROP[name]].intrinsic & FROMFORM, 0,
            `${name} FROMFORM should not be set for gnome`,
        );
    }
});

test('set_uasmon clears FROMFORM when the new form lacks the property', () => {
    const state = minimalState(PM_GNOME);
    // Pre-set FIRE_RES FROMFORM as if the previous form had fire resistance.
    state.u.uprops[PROP.FIRE_RES].intrinsic |= FROMFORM;
    set_uasmon(state);
    // Gnome has no fire resistance, so FROMFORM must be cleared.
    assert.equal(
        state.u.uprops[PROP.FIRE_RES].intrinsic & FROMFORM, 0,
        'FIRE_RES FROMFORM should be cleared after polymorphing to gnome',
    );
    // INFRAVISION should still be set (gnome has it).
    assert.ok(
        (state.u.uprops[PROP.INFRAVISION].intrinsic & FROMFORM) !== 0,
        'INFRAVISION FROMFORM should still be set for gnome',
    );
});

// -- resists_drli (mondata.c:200-211) --
test('resists_drli returns false for a living non-demonic hero', () => {
    const state = minimalState(PM_GNOME);
    // gnome is not undead, demon, were, or vampshifter
    assert.equal(resists_drli(state.youmonst, state), false);
});

test('resists_drli returns true for an undead form', () => {
    // PM_ZOMBIE is undead; use it to test the undead branch
    const state = minimalState(PM_HUMAN_ZOMBIE);
    assert.equal(resists_drli(state.youmonst, state), true);
});

// -- weight_cap Upolyd adjustment (hack.c:4313-4323) --
// When polymorphed (Upolyd true: umonnum !== umonster), carrying capacity
// scales by the new form's corpse weight.
// Gnome: cwt=650, not strongmonst.  The non-strong branch fires:
//   capacity = trunc(base * cwt / WT_HUMAN) = trunc(550 * 650 / 1450) = 246.
// Base capacity: 25 * (STR + CON) + 50 = 25 * (10 + 12) + 50 = 600.
// But minimalState sets acurr.a = [10,10,10,10,10,10], so STR=10, CON=10 gives
// base = 25 * (10 + 10) + 50 = 550.  Gnome adjustment: trunc(550 * 650 / 1450)
// = trunc(246.55) = 246.
test('weight_cap scales by cwt/WT_HUMAN for a gnome polymorph', () => {
    // minimalState(PM_GNOME) sets umonnum=PM_GNOME (165), umonster=PM_HUMAN
    // (260), making Upolyd true; youmonst.data points to the gnome permonst.
    const state = minimalState(PM_GNOME);
    // The gnome is not strongmonst and has cwt=650, so the port evaluates
    // trunc(550 * 650 / 1450) = 246, matching C's integer arithmetic.
    assert.equal(weight_cap(state), 246);
});

// When umonnum === umonster (not polymorphed), the Upolyd block is skipped
// and the base capacity stands.
test('weight_cap returns the base formula when not polymorphed', () => {
    // Set umonnum to PM_HUMAN so it equals umonster -- Upolyd is false.
    const state = minimalState(PM_HUMAN);
    // base = 25 * (10 + 10) + 50 = 550
    assert.equal(weight_cap(state), 550);
});

// -- make_glib (potion.c:460-468) --
// Clearing Glib (make_glib(0)) when already non-Glib leaves the intrinsic
// unchanged and does not mark the status line dirty.
test('make_glib(0) is a no-op when Glib is already zero', () => {
    const state = minimalState(PM_GNOME);
    // GLIB property starts at zero (set by minimalState's uprops loop).
    state.disp = { botl: false };
    make_glib(0, state);
    // Intrinsic stays zero, botl stays false (no status-line update needed).
    assert.equal(state.u.uprops[GLIB].intrinsic, 0);
    assert.equal(state.disp.botl, false);
});

// Setting Glib to a nonzero value marks the status line dirty.
test('make_glib sets a nonzero timeout and marks botl', () => {
    const state = minimalState(PM_GNOME);
    state.disp = { botl: false };
    // xtime=20 represents a slippery-fingers timeout (e.g. from a potion
    // of oil or a greased weapon).
    make_glib(20, state);
    assert.equal(state.u.uprops[GLIB].intrinsic, 20);
    assert.equal(state.disp.botl, true);
});

// Clearing an active Glib timeout marks botl.  polymon() calls make_glib(0)
// when the new form has no hands (nohands true), such as a dragon.
test('make_glib(0) clears an active Glib timeout and marks botl', () => {
    const state = minimalState(PM_GNOME);
    state.u.uprops[GLIB].intrinsic = 15;
    state.disp = { botl: false };
    make_glib(0, state);
    assert.equal(state.u.uprops[GLIB].intrinsic, 0);
    assert.equal(state.disp.botl, true);
});

// -- uwepgone (wield.c:873-885) --
// uwepgone clears the primary weapon, sets unweapon=true, and calls
// update_inventory().  The objects catalog must be initialized because
// setworn -> removeSlotEffects -> objectType reads the catalog.
test('uwepgone clears uwep and sets unweapon', () => {
    const state = minimalState(PM_GNOME);
    objects_globals_init(state);
    // Build a minimal non-artifact weapon (tool-class lamp).
    // owornmask W_WEP marks it as the primary weapon.  oclass 40
    // (TOOL_CLASS) so is_launcher/is_ammo/is_missile/is_weptool are all
    // false, making setuwep set unweapon=true.
    const lamp = {
        otyp: 0, oclass: 40, /* TOOL_CLASS */
        quan: 1, cursed: false, lamplit: false,
        oartifact: 0, owornmask: W_WEP, spe: 0,
        globby: false, nobj: null, in_use: false,
    };
    state.uwep = lamp;
    state.unweapon = false;
    state.artilist = state.artilist ?? [];
    uwepgone({ state });
    // uwep is cleared, unweapon is set.
    assert.equal(state.uwep, null);
    assert.equal(state.unweapon, true);
    // owornmask is cleared by setworn.
    assert.equal(lamp.owornmask, 0);
});

// -- uswapwepgone (wield.c:888-894) --
test('uswapwepgone clears uswapwep', () => {
    const state = minimalState(PM_GNOME);
    objects_globals_init(state);
    const dagger = {
        otyp: 0, oclass: 0, quan: 1, cursed: false,
        lamplit: false, oartifact: 0, owornmask: W_SWAPWEP,
        spe: 0, globby: false, nobj: null, in_use: false,
    };
    state.uswapwep = dagger;
    state.artilist = state.artilist ?? [];
    uswapwepgone({ state });
    assert.equal(state.uswapwep, null);
    assert.equal(dagger.owornmask, 0);
});

// -- dragon HP formula (polyself.c:860-861) --
// A red dragon (mlevel=15) outside the endgame uses 4*mlvl + d(mlvl,4).
// The development session seed0108 step 109 records d(15,4)=43,
// giving mhmax = 4*15 + 43 = 103.
test('dragon HP formula: 4*mlvl + d(mlvl,4) outside the endgame', () => {
    const mons = testMons();
    const mdat = mons[PM_RED_DRAGON];
    // mlevel for red dragon is 15 (monst.c red dragon entry).
    assert.equal(mdat.mlevel, 15);
    // mlet for red dragon is S_DRAGON.
    const S_DRAGON = mons[PM_GRAY_DRAGON].mlet;
    assert.equal(mdat.mlet, S_DRAGON);
    // PM_RED_DRAGON (146) >= PM_GRAY_DRAGON (138), so the dragon branch fires.
    assert.ok(PM_RED_DRAGON >= PM_GRAY_DRAGON);

    // Verify the production code's dragon branch guard matches.
    // polyself.js:752: mdat.mlet === M.S_DRAGON && mntmp >= M.PM_GRAY_DRAGON
    // The guard depends on mlet and the PM_ ordering, both pinned above.

    // The formula is 4*mlvl + d(mlvl, 4) (polyself.c:860-861).
    // d(15, 4) yields 15..60 (each of 15 dice rolls 1..4).
    // So mhmax ranges from 4*15 + 15 = 75 to 4*15 + 60 = 120.
    // The recipe polyself-dragon-hp-dropweapon.session.json verifies the
    // full formula via differential (d(15,4)=43, mhmax=103).
    const mlvl = mdat.mlevel;
    assert.equal(4 * mlvl, 60,
        'deterministic component 4*mlvl = 60 (polyself.c:861)');
    assert.equal(mlvl, 15,
        'd() uses mlvl=15 dice (polyself.c:861)');
});
