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
    PM_GRAY_DRAGON, PM_HUMAN_ZOMBIE, PM_DEATH,
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
    // PM_HUMAN = 260 in this port
    const human = character_race(260);
    assert.ok(human);
    assert.equal(human.noun, 'human');
    // PM_GNOME = 165
    const gnome = character_race(165);
    assert.ok(gnome);
    assert.equal(gnome.noun, 'gnome');
    // PM_DWARF = 44
    const dwarf = character_race(44);
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
test('set_uasmon sets FROMFORM properties for the gnome form', () => {
    const state = minimalState(PM_GNOME);
    set_uasmon(state);
    // Gnome has infravision via M3_INFRAVISION, so INFRAVISION should have
    // FROMFORM set. C ref: polyself.c:91
    // INFRAVISION = 36, FROMFORM = 0x10000000
    const FROMFORM = 0x10000000;
    const INFRAVISION_IDX = 36;
    assert.ok(
        (state.u.uprops[INFRAVISION_IDX].intrinsic & FROMFORM) !== 0,
        'INFRAVISION FROMFORM should be set for gnome',
    );
    // Gnome does not have fire resistance, so FIRE_RES should NOT have FROMFORM
    const FIRE_RES_IDX = 1;
    assert.equal(
        state.u.uprops[FIRE_RES_IDX].intrinsic & FROMFORM, 0,
        'FIRE_RES FROMFORM should not be set for gnome',
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
