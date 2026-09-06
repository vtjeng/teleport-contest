// Tests for attrib.c check_innate_abil(), innately(), is_innate(), from_what().
// All four functions are pure (no RNG, no messages, no state changes), so each
// gets a source-pinned test per AGENTS.md rule 4.

import assert from 'node:assert/strict';
import test from 'node:test';

import { from_what, is_innate } from '../js/attrib.js';
import {
    BLINDED,
    BLND_RES,
    CLAIRVOYANT,
    DEAF,
    DRAIN_RES,
    FAST,
    FROMEXPER,
    FROMFORM,
    FROMOUTSIDE,
    FROM_RACE,
    INFRAVISION,
    INTRINSIC,
    INVIS,
    JUMPING,
    POISON_RES,
    SEARCHING,
    SLEEP_RES,
    STEALTH,
    STRANGLED,
    TIMEOUT,
    W_ARMC,
    W_ARMF,
    W_ARMH,
} from '../js/const.js';
import {
    PM_BARBARIAN,
    PM_DWARF,
    PM_ELF,
    PM_GNOME,
    PM_HUMAN,
    PM_KNIGHT,
    PM_ORC,
    PM_VALKYRIE,
} from '../js/monsters.js';
import { ART_EYES_OF_THE_OVERWORLD } from '../js/artifacts.js';

// ---- helpers ----

// Minimal state for check_innate_abil/innately/is_innate tests.
// C ref: is_innate reads u.ulevel, u.ulycn, u.uprops[propidx], and the
// role/race mnum that role_abil and check_innate_abil look up.
function makeState({ roleMnum, raceMnum, ulevel, uprops = {} } = {}) {
    const propArray = [];
    for (const [idx, val] of Object.entries(uprops)) {
        propArray[Number(idx)] = val;
    }
    return {
        wizard: false,
        urole: { mnum: roleMnum },
        urace: { mnum: raceMnum },
        u: {
            ulevel,
            ulycn: -1, // no lycanthropy by default
            uprops: propArray,
            uroleplay: {},
        },
        youmonst: { data: { mflags1: 0 } }, // has eyes (no M1_NOEYES)
    };
}

// ---- is_innate tests ----

// C ref: bar_abil[] = {{1,POISON_RES},{7,FAST},{15,STEALTH}}.
// A level-1 Barbarian has POISON_RES from role (INNATE_ROLE = 1 = FROM_ROLE).
test('is_innate: Barbarian level 1 has POISON_RES from role', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 1,
        uprops: { [POISON_RES]: { intrinsic: FROMEXPER | FROMOUTSIDE } },
    });
    // C: is_innate(POISON_RES) calls innately() -> check_innate_abil
    //   finds bar_abil[0] (ulevel=1) with mask FROMEXPER, returns FROM_ROLE (1)
    assert.equal(is_innate(POISON_RES, state), 1); // FROM_ROLE
});

// C ref: bar_abil[1] = {7,FAST}. At level 7+, Barbarian has FAST from
// experience (FROM_EXP = 4).
test('is_innate: Barbarian level 7 has FAST from experience', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 7,
        uprops: { [FAST]: { intrinsic: FROMEXPER } },
    });
    // ulevel=7 >= bar_abil[1].ulevel=7 -> match at level > 1 -> FROM_EXP (4)
    assert.equal(is_innate(FAST, state), 4); // FROM_EXP
});

// C ref: A Barbarian at level 6 does not yet have innate FAST.
test('is_innate: Barbarian level 6 does not have innate FAST', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 6,
        uprops: {},
    });
    assert.equal(is_innate(FAST, state), 0); // FROM_NONE
});

// C ref: elf_abil[] = {{1,INFRAVISION},{4,SLEEP_RES}}. An Elf gets
// INFRAVISION from race (FROM_RACE = 2).
test('is_innate: Elf has INFRAVISION from race', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_ELF,
        ulevel: 1,
        uprops: { [INFRAVISION]: { intrinsic: FROM_RACE | FROMOUTSIDE } },
    });
    assert.equal(is_innate(INFRAVISION, state), 2); // FROM_RACE (innately return code)
});

// C ref: is_innate checks FROMOUTSIDE for intrinsic abilities gained from
// prayer/corpse. If no role/race table match, returns FROM_INTR (3).
test('is_innate: FROMOUTSIDE intrinsic returns FROM_INTR', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 5,
        uprops: { [SLEEP_RES]: { intrinsic: FROMOUTSIDE } },
    });
    // SLEEP_RES is not in bar_abil or hum_abil, but FROMOUTSIDE is set
    assert.equal(is_innate(SLEEP_RES, state), 3); // FROM_INTR
});

// C ref: is_innate checks FROMFORM for polymorphed form abilities.
test('is_innate: FROMFORM intrinsic returns FROM_FORM', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 5,
        uprops: { [SEARCHING]: { intrinsic: FROMFORM } },
    });
    // No role/race match for SEARCHING at level 5 as Barbarian, but FROMFORM set
    assert.equal(is_innate(SEARCHING, state), 5); // FROM_FORM
});

// C ref: is_innate special case for DRAIN_RES with lycanthropy.
// ismnum(u.ulycn) must be true -> returns FROM_LYCN (6).
test('is_innate: DRAIN_RES with lycanthropy returns FROM_LYCN', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 5,
    });
    state.u.ulycn = 100; // any valid monster number
    assert.equal(is_innate(DRAIN_RES, state), 6); // FROM_LYCN
});

// C ref: is_innate special case for FAST with Very_fast -> FROM_NONE.
// Very_fast = (HFast & ~INTRINSIC) || EFast. The timed portion (TIMEOUT)
// counts as ~INTRINSIC.
test('is_innate: FAST returns FROM_NONE when Very_fast', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 10,
        uprops: {
            [FAST]: {
                // TIMEOUT bit set (a potion/spell), plus FROMEXPER
                intrinsic: FROMEXPER | 100, // 100 turns remaining
                extrinsic: 0,
            },
        },
    });
    // Very_fast = (HFast & ~INTRINSIC) || EFast = (100 | FROMEXPER) & ~INTRINSIC = 100
    // which is truthy -> FROM_NONE
    assert.equal(is_innate(FAST, state), 0); // FROM_NONE
});

// C ref: is_innate special case for Knight's innate JUMPING.
// Role_if(PM_KNIGHT) && !extrinsic -> FROM_ROLE.
test('is_innate: Knight has innate JUMPING from role', () => {
    const state = makeState({
        roleMnum: PM_KNIGHT,
        raceMnum: PM_HUMAN,
        ulevel: 1,
        uprops: { [JUMPING]: { intrinsic: 0, extrinsic: 0 } },
    });
    // No table entry for JUMPING in kni_abil, but the special case fires
    assert.equal(is_innate(JUMPING, state), 1); // FROM_ROLE
});

// C ref: Knight JUMPING with extrinsic: the special case does NOT fire when
// equipment provides jumping (extrinsic is more versatile).
test('is_innate: Knight JUMPING with extrinsic returns FROM_NONE', () => {
    const state = makeState({
        roleMnum: PM_KNIGHT,
        raceMnum: PM_HUMAN,
        ulevel: 1,
        uprops: { [JUMPING]: { intrinsic: 0, extrinsic: 1 } },
    });
    assert.equal(is_innate(JUMPING, state), 0); // FROM_NONE
});

// C ref: is_innate BLINDED when hero has no eyes -> FROM_FORM.
// haseyes() returns false when M1_NOEYES is set.
test('is_innate: BLINDED without eyes returns FROM_FORM', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 5,
        uprops: { [BLINDED]: { intrinsic: 0 } },
    });
    // M1_NOEYES = 4096 (0x1000) from monsters.js
    state.youmonst.data.mflags1 = 4096; // M1_NOEYES
    assert.equal(is_innate(BLINDED, state), 5); // FROM_FORM
});

// C ref: is_innate BLND_RES with FROMFORM in HBlnd_resist -> FROM_FORM.
test('is_innate: BLND_RES from polymorph form returns FROM_FORM', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 5,
        uprops: { [BLND_RES]: { intrinsic: FROMFORM } },
    });
    assert.equal(is_innate(BLND_RES, state), 5); // FROM_FORM
});

// C ref: check_innate_abil handles all five races. dwa_abil and gno_abil both
// have {1,INFRAVISION}. A Dwarf at level 1 gets INFRAVISION from race.
test('is_innate: Dwarf has INFRAVISION from race', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_DWARF,
        ulevel: 1,
        uprops: { [INFRAVISION]: { intrinsic: FROM_RACE | FROMOUTSIDE } },
    });
    assert.equal(is_innate(INFRAVISION, state), 2); // FROM_RACE
});

test('is_innate: Gnome has INFRAVISION from race', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_GNOME,
        ulevel: 1,
        uprops: { [INFRAVISION]: { intrinsic: FROM_RACE | FROMOUTSIDE } },
    });
    assert.equal(is_innate(INFRAVISION, state), 2); // FROM_RACE
});

// C ref: orc_abil[] = {{1,INFRAVISION},{1,POISON_RES}}.
test('is_innate: Orc has POISON_RES from race', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_ORC,
        ulevel: 1,
        uprops: { [POISON_RES]: { intrinsic: FROM_RACE | FROMOUTSIDE } },
    });
    // Barbarian also has POISON_RES from role at level 1, so role takes
    // precedence (checked first in innately()).
    assert.equal(is_innate(POISON_RES, state), 1); // FROM_ROLE (role checked first)
});

// C ref: hum_abil[] = {{0,0,0,0}} (empty). Human race has no innate abilities.
test('is_innate: Human has no race abilities', () => {
    const state = makeState({
        roleMnum: PM_VALKYRIE, // cold_res at 1, stealth at 3, fast at 7
        raceMnum: PM_HUMAN,
        ulevel: 1,
        uprops: { [SEARCHING]: { intrinsic: 0 } },
    });
    assert.equal(is_innate(SEARCHING, state), 0); // FROM_NONE
});

// ---- from_what tests ----

// C ref: from_what returns '' when not in wizard mode.
test('from_what: returns empty string when not in wizard mode', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 1,
    });
    state.wizard = false;
    assert.equal(from_what(POISON_RES, state), '');
});

// C ref: from_what returns " innately" for FROM_ROLE properties.
test('from_what: returns " innately" for role ability', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 1,
        uprops: { [POISON_RES]: { intrinsic: FROMEXPER | FROMOUTSIDE } },
    });
    state.wizard = true;
    assert.equal(from_what(POISON_RES, state), ' innately');
});

// C ref: from_what returns " because of your experience" for FROM_EXP.
test('from_what: returns experience text for level-gained ability', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 7,
        uprops: { [FAST]: { intrinsic: FROMEXPER, extrinsic: 0 } },
    });
    state.wizard = true;
    assert.equal(from_what(FAST, state), ' because of your experience');
});

// C ref: from_what returns " intrinsically" for FROMOUTSIDE abilities.
test('from_what: returns " intrinsically" for FROMOUTSIDE ability', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 5,
        uprops: { [SLEEP_RES]: { intrinsic: FROMOUTSIDE } },
    });
    state.wizard = true;
    assert.equal(from_what(SLEEP_RES, state), ' intrinsically');
});

// C ref: from_what returns " from your creature form" for FROM_FORM.
test('from_what: returns form text for FROMFORM ability', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 5,
        uprops: { [SEARCHING]: { intrinsic: FROMFORM } },
    });
    state.wizard = true;
    assert.equal(from_what(SEARCHING, state), ' from your creature form');
});

// C ref: from_what returns " due to your lycanthropy" for DRAIN_RES with lycanthropy.
test('from_what: returns lycanthropy text for DRAIN_RES', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 5,
    });
    state.wizard = true;
    state.u.ulycn = 100;
    assert.equal(from_what(DRAIN_RES, state), ' due to your lycanthropy');
});

// C ref: from_what returns " from birth" for roleplay blind/deaf.
test('from_what: returns " from birth" for roleplay blind', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 1,
    });
    state.wizard = true;
    state.u.uroleplay = { blind: true };
    assert.equal(from_what(BLINDED, state), ' from birth');
});

test('from_what: returns " from birth" for roleplay deaf', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 1,
    });
    state.wizard = true;
    state.u.uroleplay = { deaf: true };
    assert.equal(from_what(DEAF, state), ' from birth');
});

// C ref: from_what FAST with Very_fast from timed effect.
// HFast & TIMEOUT != 0 -> "a potion or spell".
test('from_what: FAST from potion/spell reports source', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 5,
        uprops: {
            [FAST]: {
                intrinsic: 100, // 100 turns of TIMEOUT
                extrinsic: 0,
            },
        },
    });
    state.wizard = true;
    assert.equal(from_what(FAST, state), ' because of a potion or spell');
});

// C ref: from_what FAST with only EFast (not W_ARMF or unknown source).
test('from_what: FAST from non-boot extrinsic reports "worn equipment"', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 5,
        uprops: {
            [FAST]: {
                intrinsic: 0,
                extrinsic: 0x100, // some worn mask that is not W_ARMF
            },
        },
    });
    state.wizard = true;
    assert.equal(from_what(FAST, state), ' because of worn equipment');
});

// C ref: from_what negative INVIS. When blocked & W_ARMC is false the
// branch does not fire, so from_what returns ''.
test('from_what: negative INVIS without cloak block returns empty', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 5,
        uprops: { [INVIS]: { blocked: 0 } },
    });
    state.wizard = true;
    assert.equal(from_what(-INVIS, state), '');
});

// C ref: from_what negative CLAIRVOYANT. When blocked & W_ARMH is false or
// not in wizard mode, from_what returns ''.
test('from_what: negative CLAIRVOYANT without helmet block returns empty', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 5,
        uprops: { [CLAIRVOYANT]: { blocked: 0 } },
    });
    state.wizard = true;
    assert.equal(from_what(-CLAIRVOYANT, state), '');
});

// C ref: from_what returns '' for an unknown property with no source.
test('from_what: returns empty for property with no identified source', () => {
    const state = makeState({
        roleMnum: PM_BARBARIAN,
        raceMnum: PM_HUMAN,
        ulevel: 5,
        uprops: { [STEALTH]: { intrinsic: 0, extrinsic: 0 } },
    });
    state.wizard = true;
    // No innate source, no extrinsic, no special case -> empty
    assert.equal(from_what(STEALTH, state), '');
});
