import assert from 'node:assert/strict';
import test from 'node:test';

import { ART_SUNSWORD } from '../js/artifacts.js';
import {
    P_ATTACK_SPELL,
    P_BARE_HANDED_COMBAT,
    P_BASIC,
    P_EXPERT,
    P_GRAND_MASTER,
    P_ISRESTRICTED,
    P_LAST_WEAPON,
    P_MASTER,
    P_NONE,
    P_NUM_SKILLS,
    POOL,
    P_PICK_AXE,
    P_LONG_SWORD,
    P_POLEARMS,
    P_RIDING,
    P_SABER,
    P_SKILLED,
    P_TWO_WEAPON_COMBAT,
    P_UNICORN_HORN,
    P_UNSKILLED,
    ROOM,
    NEED_AXE,
    NEED_HTH_WEAPON,
    NEED_PICK_AXE,
    NEED_PICK_OR_AXE,
    NEED_RANGED_WEAPON,
    NEED_WEAPON,
    NO_WEAPON_WANTED,
    W_ARMG,
    W_ARMS,
    W_WEP,
} from '../js/const.js';
import { newMonster } from '../js/monst.js';
import {
    M2_STRONG,
    PM_COCKATRICE,
    PM_DEATH,
    PM_MONK,
    PM_VALKYRIE,
    PM_GIANT,
    PM_GIANT_EEL,
    PM_HUMAN_WEREWOLF,
    PM_NEWT,
    PM_WRAITH,
    PM_XORN,
    monst_globals_init,
} from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import { newObject } from '../js/obj.js';
import {
    AXE,
    ARROW,
    BATTLE_AXE,
    BELL_OF_OPENING,
    BOULDER,
    BOW,
    CLUB,
    CORPSE,
    CROSSBOW_BOLT,
    DAGGER,
    DWARVISH_MATTOCK,
    EGG,
    GRAPPLING_HOOK,
    HALBERD,
    LONG_SWORD,
    LUCKSTONE,
    PICK_AXE,
    POT_WATER,
    ROCK,
    SPEAR,
    TRIDENT,
    SILVER_DAGGER,
    TIN,
    TIN_OPENER,
    UNICORN_HORN,
    objects_globals_init,
} from '../js/objects.js';
import {
    abon,
    can_touch_safely,
    hitval,
    mon_wield_item,
    select_hwep,
    select_rwep,
    setmnotwielded,
    can_advance,
    UnsupportedWeaponSkillError,
    P_NAME,
    skill_level_name,
    weapon_descr,
    weapon_hit_bonus,
} from '../js/weapon.js';
import { mwelded } from '../js/wield.js';
import { which_armor } from '../js/worn.js';

function makeState() {
    const state = { invent: null, uwep: null, youmonst: {} };
    monst_globals_init(state);
    objects_globals_init(state);
    return state;
}

function monster(state, pmidx = PM_NEWT, overrides = {}) {
    return newMonster({
        data: state.mons[pmidx],
        mnum: pmidx,
        minvent: null,
        misc_worn_check: 0,
        ...overrides,
    });
}

function object(state, otyp, overrides = {}) {
    return newObject({
        otyp,
        oclass: state.objects[otyp].oc_class,
        quan: 1,
        owornmask: 0,
        ...overrides,
    });
}

function inventory(...objects) {
    for (let index = 0; index < objects.length; ++index)
        objects[index].nobj = objects[index + 1] ?? null;
    return objects[0] ?? null;
}

function visibleOperations(events = []) {
    return {
        canSeeMonster: () => true,
        wieldMessage(_monster, obj, detail) {
            events.push(
                `wield:${obj.otyp}:${detail.exclaim}:${detail.newlyWelded}`,
            );
        },
        weldedMessage(_monster, current, wanted) {
            events.push(`welded:${current.otyp}:${wanted.otyp}`);
        },
    };
}

test('can_touch_safely applies corpse, Rider, silver, and artifact gates', () => {
    const state = makeState();
    const subject = monster(state);
    const cockatrice = object(state, CORPSE, { corpsenm: PM_COCKATRICE });

    assert.equal(can_touch_safely(subject, cockatrice, { state }), false);
    subject.misc_worn_check = W_ARMG;
    assert.equal(can_touch_safely(subject, cockatrice, { state }), true);
    subject.misc_worn_check = 0;
    subject.mintrinsics = 0x80;
    assert.equal(can_touch_safely(subject, cockatrice, { state }), true);

    const rider = object(state, CORPSE, { corpsenm: PM_DEATH });
    assert.equal(can_touch_safely(subject, rider, { state }), false);

    const were = monster(state, PM_HUMAN_WEREWOLF);
    assert.equal(can_touch_safely(were, object(state, SILVER_DAGGER), {
        state,
    }), false);
    were.data = { ...were.data, mflags3: 1 };
    assert.equal(can_touch_safely(were, object(state, BELL_OF_OPENING), {
        state,
    }), true);

    const artifact = object(state, LONG_SWORD, { oartifact: 1 });
    assert.throws(
        () => can_touch_safely(subject, artifact, { state }),
        /touchArtifact/,
    );
    assert.equal(can_touch_safely(subject, artifact, {
        state,
        touchArtifact: () => false,
    }), false);
});

test('which_armor and select_hwep preserve inventory and source preference', () => {
    const state = makeState();
    const subject = monster(state);
    const shield = object(state, DAGGER, { owornmask: W_ARMS });
    const dagger = object(state, DAGGER);
    const sword = object(state, LONG_SWORD);
    subject.minvent = inventory(shield, dagger, sword);
    subject.misc_worn_check = W_ARMS;

    assert.equal(which_armor(subject, W_ARMS), shield);
    // LONG_SWORD precedes DAGGER in weapon.c despite appearing later here.
    assert.equal(select_hwep(subject, { state }), sword);

    const giant = monster(state, PM_GIANT);
    const giantSword = object(state, LONG_SWORD);
    const club = object(state, CLUB);
    giant.minvent = inventory(giantSword, club);
    assert.equal(select_hwep(giant, { state }), club);
});

test('select_hwep handles artifacts, bimanual limits, and silver aversion', () => {
    const state = makeState();
    const subject = monster(state);
    const artifact = object(state, DAGGER, { oartifact: 1 });
    const sword = object(state, LONG_SWORD);
    subject.minvent = inventory(sword, artifact);

    assert.equal(select_hwep(subject, {
        state,
        touchArtifact: () => true,
    }), artifact);

    const weak = monster(state);
    weak.minvent = inventory(
        object(state, BATTLE_AXE),
        object(state, DAGGER),
    );
    assert.equal(select_hwep(weak, { state }).otyp, DAGGER);

    const strongWithShield = monster(state, PM_NEWT, {
        data: { ...state.mons[PM_NEWT], mflags2: M2_STRONG },
        misc_worn_check: W_ARMS,
    });
    strongWithShield.minvent = inventory(
        object(state, BATTLE_AXE),
        object(state, DAGGER),
    );
    assert.equal(select_hwep(strongWithShield, { state }).otyp, DAGGER);

    const were = monster(state, PM_HUMAN_WEREWOLF);
    were.minvent = inventory(
        object(state, SILVER_DAGGER),
        object(state, DAGGER),
    );
    assert.equal(select_hwep(were, { state }).otyp, DAGGER);
});

test('select_hwep considers only petrifying corpses as weapons', () => {
    const state = makeState();
    const subject = monster(state, PM_NEWT, { misc_worn_check: W_ARMG });
    const ordinaryCorpse = object(state, CORPSE, { corpsenm: PM_NEWT });
    const cockatriceCorpse = object(state, CORPSE, {
        corpsenm: PM_COCKATRICE,
    });
    subject.minvent = inventory(ordinaryCorpse, cockatriceCorpse);
    assert.equal(select_hwep(subject, { state }), cockatriceCorpse);

    const dagger = object(state, DAGGER);
    subject.minvent = inventory(ordinaryCorpse, dagger);
    assert.equal(select_hwep(subject, { state }), dagger);
});

test('select_rwep preserves source preference and visibility gates', () => {
    const state = makeState();
    const subject = monster(state, PM_GIANT, {
        mx: 4,
        my: 4,
        mux: 6,
        muy: 4,
    });
    const dagger = object(state, DAGGER);
    const polearm = object(state, HALBERD);
    subject.minvent = inventory(dagger, polearm);

    assert.equal(select_rwep(subject, {
        state,
        couldSee: () => true,
    }), polearm);
    assert.equal(select_rwep(subject, {
        state,
        couldSee: () => false,
    }), dagger);
});

test('select_rwep requires launchers and only selects petrifying eggs', () => {
    const state = makeState();
    const subject = monster(state, PM_NEWT, {
        mx: 4,
        my: 4,
        mux: 9,
        muy: 4,
    });
    const arrow = object(state, ARROW);
    const dagger = object(state, DAGGER);
    subject.minvent = inventory(arrow, dagger);
    assert.equal(select_rwep(subject, { state }), dagger);

    const bow = object(state, BOW);
    subject.minvent = inventory(arrow, dagger, bow);
    assert.equal(select_rwep(subject, { state }), arrow);

    const ordinaryEgg = object(state, EGG, { corpsenm: PM_NEWT });
    const cockatriceEgg = object(state, EGG, {
        corpsenm: PM_COCKATRICE,
    });
    subject.minvent = inventory(ordinaryEgg, dagger, cockatriceEgg);
    assert.equal(select_rwep(subject, { state }), cockatriceEgg);
});

test('mon_wield_item selects hand-to-hand weapons and reports welded state', async () => {
    const state = makeState();
    const subject = monster(state, PM_NEWT, {
        weapon_check: NEED_HTH_WEAPON,
    });
    const dagger = object(state, DAGGER, { cursed: true });
    const sword = object(state, LONG_SWORD);
    subject.minvent = inventory(dagger, sword);
    const events = [];

    assert.equal(await mon_wield_item(subject, {
        state,
        ...visibleOperations(events),
    }), 1);
    assert.equal(subject.mw, sword);
    assert.equal(subject.weapon_check, NEED_WEAPON);
    assert.equal(sword.owornmask, W_WEP);
    assert.deepEqual(events, [`wield:${LONG_SWORD}:true:false`]);

    subject.mw = dagger;
    dagger.owornmask = W_WEP;
    subject.weapon_check = NEED_HTH_WEAPON;
    subject.minvent = inventory(dagger, object(state, LONG_SWORD));
    assert.equal(await mon_wield_item(subject, {
        state,
        ...visibleOperations(events),
    }), 1);
    assert.equal(subject.mw, dagger);
    assert.equal(subject.weapon_check, NO_WEAPON_WANTED);
    assert.equal(dagger.bknown, true);
    assert.equal(events.at(-1), `welded:${DAGGER}:${LONG_SWORD}`);
});

test('mon_wield_item keeps same-type and empty selection branches actionless', async () => {
    const state = makeState();
    const current = object(state, DAGGER, { owornmask: W_WEP });
    const replacement = object(state, DAGGER);
    const subject = monster(state, PM_NEWT, {
        minvent: inventory(replacement, current),
        mw: current,
        weapon_check: NEED_HTH_WEAPON,
    });

    assert.equal(await mon_wield_item(subject, { state }), 0);
    assert.equal(subject.mw, current);
    assert.equal(subject.weapon_check, NEED_WEAPON);

    subject.minvent = null;
    subject.mw = null;
    subject.weapon_check = NEED_HTH_WEAPON;
    assert.equal(await mon_wield_item(subject, { state }), 0);
    assert.equal(subject.weapon_check, NEED_WEAPON);
});

test('mon_wield_item identifies a newly welded visible weapon', async () => {
    const state = makeState();
    const dagger = object(state, DAGGER, { cursed: true });
    const subject = monster(state, PM_NEWT, {
        minvent: dagger,
        weapon_check: NEED_HTH_WEAPON,
    });
    const events = [];

    assert.equal(await mon_wield_item(subject, {
        state,
        ...visibleOperations(events),
    }), 1);
    assert.equal(subject.mw, dagger);
    assert.equal(dagger.owornmask, W_WEP);
    assert.equal(dagger.bknown, true);
    assert.deepEqual(events, [`wield:${DAGGER}:true:true`]);
});

test('mon_wield_item selects digging tools around shield restrictions', async () => {
    const state = makeState();
    const shield = object(state, DAGGER, { owornmask: W_ARMS });
    const mattock = object(state, DWARVISH_MATTOCK);
    const pick = object(state, PICK_AXE);
    const battleAxe = object(state, BATTLE_AXE);
    const axe = object(state, AXE);
    const subject = monster(state, PM_NEWT, {
        minvent: inventory(shield, mattock, pick, battleAxe, axe),
        misc_worn_check: W_ARMS,
        weapon_check: NEED_PICK_AXE,
    });
    const events = [];

    assert.equal(await mon_wield_item(subject, {
        state,
        ...visibleOperations(events),
    }), 1);
    assert.equal(subject.mw, pick);
    assert.equal(events.at(-1), `wield:${PICK_AXE}:false:false`);

    subject.mw = null;
    pick.owornmask = 0;
    subject.weapon_check = NEED_AXE;
    assert.equal(await mon_wield_item(subject, {
        state,
        ...visibleOperations(events),
    }), 1);
    assert.equal(subject.mw, axe);
});

test('mon_wield_item preserves combined pick-or-axe source priority', async () => {
    const state = makeState();
    const events = [];
    const unshielded = monster(state, PM_NEWT, {
        // Reverse inventory order proves selection follows source type order.
        minvent: inventory(
            object(state, AXE),
            object(state, PICK_AXE),
            object(state, BATTLE_AXE),
            object(state, DWARVISH_MATTOCK),
        ),
        weapon_check: NEED_PICK_OR_AXE,
    });
    assert.equal(await mon_wield_item(unshielded, {
        state,
        ...visibleOperations(events),
    }), 1);
    assert.equal(unshielded.mw.otyp, DWARVISH_MATTOCK);
    assert.equal(events.at(-1), `wield:${DWARVISH_MATTOCK}:false:false`);

    const shield = object(state, DAGGER, { owornmask: W_ARMS });
    const shielded = monster(state, PM_NEWT, {
        minvent: inventory(
            shield,
            object(state, AXE),
            object(state, PICK_AXE),
            object(state, BATTLE_AXE),
            object(state, DWARVISH_MATTOCK),
        ),
        misc_worn_check: W_ARMS,
        weapon_check: NEED_PICK_OR_AXE,
    });
    assert.equal(await mon_wield_item(shielded, {
        state,
        ...visibleOperations(events),
    }), 1);
    assert.equal(shielded.mw.otyp, PICK_AXE);
    assert.equal(events.at(-1), `wield:${PICK_AXE}:false:false`);

    // Both fixtures above stock every tool, so two of C's four m_carrying()
    // lookups are never the one that decides. These make each decisive.
    const carrying = async (otyps, wornShield) => {
        const held = otyps.map((otyp) => object(state, otyp));
        const subject = monster(state, PM_NEWT, {
            minvent: inventory(...(wornShield
                ? [object(state, DAGGER, { owornmask: W_ARMS }), ...held]
                : held)),
            ...(wornShield ? { misc_worn_check: W_ARMS } : {}),
            weapon_check: NEED_PICK_OR_AXE,
        });
        const result = await mon_wield_item(subject, {
            state,
            ...visibleOperations(events),
        });
        return { result, otyp: subject.mw?.otyp };
    };

    // Shielded with no battle-axe reaches the AXE fallback of the inner pair.
    assert.deepEqual(
        await carrying([DWARVISH_MATTOCK, AXE], true),
        { result: 1, otyp: AXE },
    );
    // Unshielded with no mattock stops at BATTLE_AXE, skipping the inner pair.
    assert.deepEqual(
        await carrying([BATTLE_AXE], false),
        { result: 1, otyp: BATTLE_AXE },
    );
    // C's dead end: shielded with only a mattock re-enters the inner pair,
    // finds neither pick nor axe, and leaves obj NULL, so nothing is wielded.
    assert.deepEqual(
        await carrying([DWARVISH_MATTOCK], true),
        { result: 0, otyp: undefined },
    );
});

test('mon_wield_item delegates ranged selection and artifact-light lifecycle', async () => {
    const state = makeState();
    const oldLight = object(state, LONG_SWORD, {
        oartifact: ART_SUNSWORD,
        lamplit: true,
        owornmask: W_WEP,
    });
    const ranged = object(state, DAGGER, { oartifact: ART_SUNSWORD });
    const subject = monster(state, PM_NEWT, {
        minvent: inventory(oldLight, ranged),
        mw: oldLight,
        weapon_check: NEED_RANGED_WEAPON,
    });
    const events = [];

    assert.equal(await mon_wield_item(subject, {
        state,
        ...visibleOperations(events),
        selectRangedWeapon: () => ranged,
        async endArtifactLight(_monster, obj) {
            events.push(`end:${obj.otyp}`);
            obj.lamplit = false;
        },
        async startArtifactLight(_monster, obj) {
            events.push(`start:${obj.otyp}`);
            obj.lamplit = true;
        },
    }), 1);
    assert.equal(subject.mw, ranged);
    assert.equal(oldLight.owornmask, 0);
    assert.equal(ranged.owornmask, W_WEP);
    assert.deepEqual(events, [
        `end:${LONG_SWORD}`,
        `wield:${DAGGER}:true:false`,
        `start:${DAGGER}`,
    ]);
});

test('mon_wield_item checks visibility after extinguishing the old weapon', async () => {
    const state = makeState();
    const current = object(state, LONG_SWORD, {
        oartifact: ART_SUNSWORD,
        lamplit: true,
        owornmask: W_WEP,
    });
    const wanted = object(state, DAGGER, { cursed: true });
    const subject = monster(state, PM_NEWT, {
        minvent: inventory(current, wanted),
        mw: current,
        weapon_check: NEED_RANGED_WEAPON,
    });
    const events = [];
    let visible = true;

    assert.equal(await mon_wield_item(subject, {
        state,
        selectRangedWeapon: () => wanted,
        async endArtifactLight(_monster, obj) {
            events.push('end');
            obj.lamplit = false;
            visible = false;
        },
        canSeeMonster() {
            events.push('see');
            return visible;
        },
        wieldMessage() {
            events.push('wield');
        },
    }), 1);
    assert.deepEqual(events, ['end', 'see']);
    assert.equal(subject.mw, wanted);
    assert.equal(current.owornmask, 0);
    assert.equal(wanted.owornmask, W_WEP);
    assert.equal(wanted.bknown, false);
});

test('mon_wield_item preflights presentation and artifact lifecycle owners', async () => {
    const state = makeState();
    const current = object(state, LONG_SWORD, {
        oartifact: ART_SUNSWORD,
        lamplit: true,
        owornmask: W_WEP,
    });
    const wanted = object(state, DAGGER, { oartifact: ART_SUNSWORD });
    const subject = monster(state, PM_NEWT, {
        minvent: inventory(current, wanted),
        mw: current,
        weapon_check: NEED_RANGED_WEAPON,
    });

    // weapon.c mon_wield_item() prints nothing for a monster canseemon()
    // rejects, so an unseen monster needs no wieldMessage and must still
    // complete the swap. Its visibility is tested after setmnotwielded() has
    // run end_burn() on the old weapon, which is why wieldMessage cannot be
    // resolved in the preflight above: a monster lit only by that artifact is
    // seen before the extinguish and unseen after it.
    const unseenCurrent = object(state, LONG_SWORD, { owornmask: W_WEP });
    const unseenWanted = object(state, DAGGER);
    const unseen = monster(state, PM_NEWT, {
        minvent: inventory(unseenCurrent, unseenWanted),
        mw: unseenCurrent,
        weapon_check: NEED_RANGED_WEAPON,
    });
    assert.equal(await mon_wield_item(unseen, {
        state,
        canSeeMonster: () => false,
        selectRangedWeapon: () => unseenWanted,
    }), 1);
    assert.equal(unseen.mw, unseenWanted);
    assert.equal(unseenWanted.owornmask, W_WEP);
    assert.equal(unseen.weapon_check, NEED_WEAPON);

    let visibilityChecks = 0;
    await assert.rejects(mon_wield_item(subject, {
        state,
        canSeeMonster() {
            ++visibilityChecks;
            return true;
        },
        wieldMessage: () => {},
        selectRangedWeapon: () => wanted,
        startArtifactLight: () => {},
    }), /endArtifactLight/);
    assert.equal(visibilityChecks, 0);
    assert.equal(subject.mw, current);
    assert.equal(subject.weapon_check, NEED_RANGED_WEAPON);
    assert.equal(current.lamplit, true);
    assert.equal(current.owornmask, W_WEP);
    assert.equal(wanted.owornmask, 0);
});

test('setmnotwielded clears ordinary state and preflights lit artifacts', async () => {
    const state = makeState();
    const subject = monster(state);
    const ordinary = object(state, DAGGER, { owornmask: W_WEP });
    subject.mw = ordinary;
    await setmnotwielded(subject, ordinary, { state });
    assert.equal(subject.mw, null);
    assert.equal(ordinary.owornmask, 0);

    const lit = object(state, LONG_SWORD, {
        oartifact: ART_SUNSWORD,
        lamplit: true,
        owornmask: W_WEP,
    });
    subject.mw = lit;
    await assert.rejects(
        setmnotwielded(subject, lit, { state }),
        /endArtifactLight/,
    );
    assert.equal(subject.mw, lit);
    assert.equal(lit.owornmask, W_WEP);
});

// wield.c:1078 mwelded() is `obj && (obj->owornmask & W_WEP)
// && will_weld(obj)`, so all three terms must hold. It and will_weld() both
// live in js/wield.js, which owns wield.c; the last two cases below reach the
// two halves of will_weld()'s `erodeable_wep(optr) || (optr)->otyp ==
// TIN_OPENER`, which shows that mwelded() consults it.
test('mwelded needs a wielded, cursed, weldable object', () => {
    const state = makeState();
    const welding = { cursed: true, owornmask: W_WEP };
    // All three terms hold: a cursed dagger wielded as the weapon.
    assert.equal(mwelded(object(state, DAGGER, welding), state), true);
    // The caller may hand mwelded() no object at all; C's `obj &&`
    // short-circuits before it reads the mask.
    assert.equal(mwelded(null, state), false);
    // Cursed and weldable, but carried: an empty owornmask fails the W_WEP
    // term.
    assert.equal(mwelded(object(state, DAGGER, { cursed: true }), state),
        false);
    // Cursed and worn, but on the shield arm: W_ARMS is a different bit, so
    // the W_WEP term still fails.
    assert.equal(mwelded(object(state, DAGGER, {
        cursed: true,
        owornmask: W_ARMS,
    }), state), false);
    // Wielded and weldable, but not cursed, so will_weld() answers false.
    assert.equal(mwelded(object(state, DAGGER, { owornmask: W_WEP }), state),
        false);
    // The tin opener is TOOL_CLASS and no weptool, so erodeable_wep() rejects
    // it; will_weld() names it in its own term and welds it anyway.
    assert.equal(mwelded(object(state, TIN_OPENER, welding), state), true);
    // A luckstone is cursed and wielded. GEM_CLASS fails erodeable_wep() and
    // its otyp fails the tin-opener term, so both halves reject it.
    assert.equal(mwelded(object(state, LUCKSTONE, welding), state), false);
});

// A hero state carrying nothing but the skill slots and the role identity
// P_NAME() and can_advance() read.
function makeHeroState(overrides = {}) {
    const state = makeState();
    // OBJ_NAME() reads obj_descr through oc_name_idx, which init_objects()
    // assigns; the zero-returning rn2 keeps its shuffles deterministic.
    init_objects(state, () => 0);
    state.u = {
        weapon_skills: Array.from(
            { length: P_NUM_SKILLS },
            () => ({ skill: P_ISRESTRICTED, max_skill: P_ISRESTRICTED,
                advance: 0 }),
        ),
        skills_advanced: 0,
        weapon_slots: 0,
    };
    state.urole = { mnum: PM_VALKYRIE };
    return Object.assign(state, overrides);
}

test('P_NAME picks an object name, an odd skill name, or the bare hands', () => {
    const state = makeHeroState();
    // weapon.c skill_names_indices[] stores an object type for a skill named
    // after a representative item and a negative PN_* code for the rest.
    assert.equal(P_NAME(P_LONG_SWORD, state), 'long sword');
    assert.equal(P_NAME(P_PICK_AXE, state), 'pick-axe');
    // odd_skill_names[], reached through the negative codes.
    assert.equal(P_NAME(P_NONE, state), 'no skill');
    assert.equal(P_NAME(P_SABER, state), 'saber');
    assert.equal(P_NAME(P_POLEARMS, state), 'polearms');
    assert.equal(P_NAME(P_ATTACK_SPELL, state), 'attack spells');
    assert.equal(P_NAME(P_TWO_WEAPON_COMBAT, state), 'two weapon combat');
    // barehands_or_martial[], selected by martial_bonus().
    assert.equal(P_NAME(P_BARE_HANDED_COMBAT, state), 'bare handed combat');
    state.urole = { mnum: PM_MONK };
    assert.equal(P_NAME(P_BARE_HANDED_COMBAT, state), 'martial arts');
});

test('weapon_descr names a weapon by its skill and everything else by class',
    () => {
    const state = makeHeroState();
    // The plain case: the skill category name, singularized.
    assert.equal(weapon_descr(object(state, LONG_SWORD), state), 'long sword');
    assert.equal(weapon_descr(object(state, HALBERD), state), 'polearm');
    // The five special cases weapon.c switches on.
    assert.equal(weapon_descr(object(state, ARROW), state), 'arrow');
    assert.equal(weapon_descr(object(state, CROSSBOW_BOLT), state), 'bolt');
    assert.equal(weapon_descr(object(state, ROCK), state), 'stone');
    assert.equal(weapon_descr(object(state, LUCKSTONE), state), 'stone');
    assert.equal(weapon_descr(object(state, GRAPPLING_HOOK), state), 'hook');
    assert.equal(
        weapon_descr(object(state, DWARVISH_MATTOCK), state), 'mattock',
    );
    // P_NONE: the object class name, or the type name for the seven items
    // whose class name would sound strange.
    assert.equal(weapon_descr(object(state, POT_WATER), state), 'potion');
    assert.equal(weapon_descr(object(state, TIN), state), 'tin');
    assert.equal(weapon_descr(object(state, BOULDER), state), 'boulder');
});

test('skill_level_name and can_advance read the hero skill slots', () => {
    const state = makeHeroState();
    // weapon.c skill_level_name(); P_ISRESTRICTED falls to the default arm.
    const slot = state.u.weapon_skills[P_LONG_SWORD];
    assert.equal(skill_level_name(P_LONG_SWORD, state), 'Unknown');
    for (const [level, name] of [
        [P_UNSKILLED, 'Unskilled'], [P_BASIC, 'Basic'],
        [P_SKILLED, 'Skilled'], [P_EXPERT, 'Expert'],
        [P_MASTER, 'Master'], [P_GRAND_MASTER, 'Grand Master'],
    ]) {
        slot.skill = level;
        assert.equal(skill_level_name(P_LONG_SWORD, state), name);
    }

    // weapon.c can_advance(): restricted, already at the maximum, or short of
    // either the practice or the slots all answer FALSE.
    slot.skill = P_ISRESTRICTED;
    slot.max_skill = P_EXPERT;
    assert.equal(can_advance(P_LONG_SWORD, false, state), false);
    slot.skill = P_EXPERT;
    assert.equal(can_advance(P_LONG_SWORD, false, state), false);
    // practice_needed_to_advance(P_BASIC) is 2 * 2 * 20 == 80, and
    // slots_required() for a weapon skill is the current level, 2.
    slot.skill = P_BASIC;
    slot.advance = 79;
    state.u.weapon_slots = 2;
    assert.equal(can_advance(P_LONG_SWORD, false, state), false);
    slot.advance = 80;
    state.u.weapon_slots = 1;
    assert.equal(can_advance(P_LONG_SWORD, false, state), false);
    state.u.weapon_slots = 2;
    assert.equal(can_advance(P_LONG_SWORD, false, state), true);
    // P_SKILL_LIMIT is 60 advancements in total.
    state.u.skills_advanced = 60;
    assert.equal(can_advance(P_LONG_SWORD, false, state), false);
});

test('can_advance answers FALSE before it consults speedy', () => {
    const state = makeHeroState();
    const slot = state.u.weapon_skills[P_LONG_SWORD];

    // weapon.c can_advance() evaluates the restricted, maxed and
    // skill-limit tests first and returns FALSE from them; only after that
    // does it reach `if (wizard && speedy) return TRUE`. Each of those three
    // answers is an ordinary FALSE that needs nothing this port lacks.
    //
    // wizard is TRUE for all three, which is what makes this a test of the
    // order rather than of the refusal's condition: with the refusal hoisted
    // back above them, every one of these calls throws instead of answering.
    state.wizard = true;
    slot.skill = P_ISRESTRICTED;
    slot.max_skill = P_EXPERT;
    assert.equal(can_advance(P_LONG_SWORD, true, state), false);
    slot.skill = P_EXPERT;
    assert.equal(can_advance(P_LONG_SWORD, true, state), false);
    slot.skill = P_BASIC;
    state.u.skills_advanced = 60; /* P_SKILL_LIMIT */
    assert.equal(can_advance(P_LONG_SWORD, true, state), false);

    // Past those three the refusal does fire, but only in C's own arm:
    // `speedy` alone does nothing while wizard is FALSE.
    state.u.skills_advanced = 0;
    slot.advance = 80;
    state.u.weapon_slots = 2;
    state.wizard = false;
    assert.equal(can_advance(P_LONG_SWORD, true, state), true);
    state.wizard = true;
    assert.throws(
        () => can_advance(P_LONG_SWORD, true, state),
        (error) => error instanceof UnsupportedWeaponSkillError
            && error.branch === 'can_advance(speedy)',
    );
});

test('slots_required halves the cost for martial and bare-handed skills',
    () => {
    const state = makeHeroState();
    const slot = state.u.weapon_skills[P_BARE_HANDED_COMBAT];
    slot.skill = P_BASIC;
    slot.max_skill = P_EXPERT;
    slot.advance = 80; /* practice_needed_to_advance(P_BASIC) */

    // weapon.c slots_required(): a weapon skill costs its current level, but
    // bare-handed and martial skills cost (tmp + 1) / 2, so P_BASIC costs 1
    // rather than 2. One slot is therefore enough here and not for a weapon.
    state.u.weapon_slots = 1;
    assert.equal(can_advance(P_BARE_HANDED_COMBAT, false, state), true);

    const weaponSlot = state.u.weapon_skills[P_LONG_SWORD];
    weaponSlot.skill = P_BASIC;
    weaponSlot.max_skill = P_EXPERT;
    weaponSlot.advance = 80;
    assert.equal(can_advance(P_LONG_SWORD, false, state), false);
});

// The hero-side to-hit bonuses. weapon.c abon() and weapon_hit_bonus() are
// pure, and hitval() is pure except for the artifact arm that stops, so each
// is pinned against values read from the C source rather than from a replay.

function heroState({ str = 10, dex = 10, ulevel = 1 } = {}) {
    const state = makeState();
    state.u = {
        acurr: { a: [str, 0, 0, dex, 0, 0] },
        abon: [0, 0, 0, 0, 0, 0],
        atemp: [0, 0, 0, 0, 0, 0],
        ulevel,
        twoweap: false,
        usteed: null,
    };
    state.uwep = null;
    state.uswapwep = null;
    state.urole = { mnum: PM_VALKYRIE };
    state.u.weapon_skills = Array.from({ length: P_NUM_SKILLS }, () => ({
        skill: P_ISRESTRICTED, max_skill: P_ISRESTRICTED, advance: 0,
    }));
    return state;
}

// weapon.c:961-982. sbon comes from Strength, and Dexterity adjusts it; the
// `u.ulevel < 3` kludge adds one on top for a level 1 or 2 hero. Each row is a
// boundary of one of the two ladders, with the level kludge removed by using
// ulevel 3.
test('abon reads the Strength and Dexterity ladders at their boundaries',
    () => {
        const at = (str, dex, ulevel = 3) =>
            abon(heroState({ str, dex, ulevel }));

        // Strength, with Dexterity parked in the 8..13 band that adds nothing.
        assert.equal(at(5, 10), -2);
        assert.equal(at(6, 10), -1);
        assert.equal(at(7, 10), -1);
        assert.equal(at(8, 10), 0);
        assert.equal(at(16, 10), 0);
        assert.equal(at(17, 10), 1);
        // STR18(50) is 68 in acurr()'s encoding: 18/49 still scores 1.
        assert.equal(at(67, 10), 1);
        assert.equal(at(68, 10), 2);
        assert.equal(at(117, 10), 2);
        assert.equal(at(118, 10), 3);

        // Dexterity, with Strength parked in the 8..16 band that scores 0.
        assert.equal(at(10, 3), -3);
        assert.equal(at(10, 4), -2);
        assert.equal(at(10, 5), -2);
        assert.equal(at(10, 6), -1);
        assert.equal(at(10, 7), -1);
        assert.equal(at(10, 8), 0);
        assert.equal(at(10, 13), 0);
        assert.equal(at(10, 14), 0);
        assert.equal(at(10, 18), 4);

        // weapon.c:977-979, the low-level kludge.
        assert.equal(at(10, 10, 1), 1);
        assert.equal(at(10, 10, 2), 1);
        assert.equal(at(10, 10, 3), 0);
    });

// weapon.c:1556-1636. Each skill level is a separate constant in C, and the
// two-weapon and bare-handed ladders are separate tables again.
test('weapon_hit_bonus reads one bonus per skill level', () => {
    const state = heroState();
    const sword = object(state, LONG_SWORD);
    const setSkill = (skill, level) => {
        state.u.weapon_skills[skill].skill = level;
    };

    // An object whose class carries no skill at all scores nothing. A rock
    // would not do: rocks are GEM_CLASS, whose oc_skill is a launcher code
    // that weapon_type() folds back to a real skill.
    assert.equal(weapon_hit_bonus(object(state, POT_WATER), state), 0);

    for (const [level, bonus] of [
        [P_ISRESTRICTED, -4], [P_UNSKILLED, -4], [P_BASIC, 0],
        [P_SKILLED, 2], [P_EXPERT, 3],
    ]) {
        setSkill(P_LONG_SWORD, level);
        assert.equal(weapon_hit_bonus(sword, state), bonus, `level ${level}`);
    }

    // A unicorn horn's skill is P_LAST_WEAPON itself, the inclusive end of
    // the weapon table.
    setSkill(P_UNICORN_HORN, P_SKILLED);
    assert.equal(P_UNICORN_HORN, P_LAST_WEAPON);
    assert.equal(weapon_hit_bonus(object(state, UNICORN_HORN), state), 2);

    // Two-weapon combat takes the lower of the two skills, and its own table.
    state.u.twoweap = true;
    state.uwep = sword;
    setSkill(P_LONG_SWORD, P_EXPERT);
    for (const [level, bonus] of [
        [P_ISRESTRICTED, -9], [P_UNSKILLED, -9], [P_BASIC, -7],
        [P_SKILLED, -5], [P_EXPERT, -3],
    ]) {
        setSkill(P_TWO_WEAPON_COMBAT, level);
        assert.equal(weapon_hit_bonus(sword, state), bonus, `two ${level}`);
    }
    // The weapon skill is the lower one here, so it decides instead.
    setSkill(P_TWO_WEAPON_COMBAT, P_EXPERT);
    setSkill(P_LONG_SWORD, P_BASIC);
    assert.equal(weapon_hit_bonus(sword, state), -7);
    // A weapon that is neither wielded nor the off-hand one uses its own
    // skill even while two-weaponing.
    assert.equal(weapon_hit_bonus(object(state, DAGGER), state), -4);
    state.u.twoweap = false;
    state.uwep = null;
});

// weapon.c:1607-1613. `bonus = ((max(skill, P_UNSKILLED) - 1 + 2) * (martial
// ? 2 : 1)) / 2`, with integer division, which is why the plain and martial
// columns of the comment there differ the way they do.
test('weapon_hit_bonus doubles the bare-handed ladder for martial roles',
    () => {
        const state = heroState();
        const levels = [
            P_ISRESTRICTED, P_UNSKILLED, P_BASIC, P_SKILLED, P_EXPERT,
            P_MASTER, P_GRAND_MASTER,
        ];
        const bare = [];
        const martial = [];
        for (const level of levels) {
            state.u.weapon_skills[P_BARE_HANDED_COMBAT].skill = level;
            state.urole = { mnum: PM_VALKYRIE };
            bare.push(weapon_hit_bonus(null, state));
            state.urole = { mnum: PM_MONK };
            martial.push(weapon_hit_bonus(null, state));
        }
        // Restricted folds onto unskilled, which is why the first two match.
        assert.deepEqual(bare, [1, 1, 1, 2, 2, 3, 3]);
        // The comment's "n/a" for martial-unskilled is not a special case in
        // the arithmetic: it scores 2 like restricted does.
        assert.deepEqual(martial, [2, 2, 3, 4, 5, 6, 7]);
    });

// weapon.c:1616-1633. Riding costs two while unskilled, one at basic, and
// nothing above; two-weaponing from the saddle costs two more.
test('weapon_hit_bonus subtracts a riding penalty', () => {
    const state = heroState();
    state.u.weapon_skills[P_LONG_SWORD].skill = P_BASIC;
    const sword = object(state, LONG_SWORD);
    assert.equal(weapon_hit_bonus(sword, state), 0);

    state.u.usteed = { mx: 1, my: 1 };
    for (const [level, bonus] of [
        [P_ISRESTRICTED, -2], [P_UNSKILLED, -2], [P_BASIC, -1],
        [P_SKILLED, 0], [P_EXPERT, 0],
    ]) {
        state.u.weapon_skills[P_RIDING].skill = level;
        assert.equal(weapon_hit_bonus(sword, state), bonus, `riding ${level}`);
    }
    // Riding is free at Expert, so the -5 below is the two-weapon Skilled
    // bonus of -5 with the saddle's own two-weapon penalty of -2 on top of
    // the Expert two-weapon bonus of -3.
    state.u.weapon_skills[P_RIDING].skill = P_EXPERT;
    state.u.twoweap = true;
    state.uwep = sword;
    state.u.weapon_skills[P_LONG_SWORD].skill = P_EXPERT;
    state.u.weapon_skills[P_TWO_WEAPON_COMBAT].skill = P_EXPERT;
    assert.equal(weapon_hit_bonus(sword, state), -5);
});

// weapon.c:153-186.
test('hitval adds each weapon-versus-monster bonus its source names', () => {
    const state = heroState();
    const newt = monster(state, PM_NEWT);
    const refuse = {
        unsupported: (reason) => { throw new Error(reason); },
    };

    // Enchantment and objects[].oc_hitbon, both of which only a weapon or a
    // weapon-tool contributes.
    const sword = object(state, LONG_SWORD, { spe: 2 });
    assert.equal(
        hitval(sword, newt, state, refuse),
        2 + state.objects[LONG_SWORD].oc_hitbon,
    );
    // A non-weapon of the same enchantment contributes only oc_hitbon.
    const rock = object(state, ROCK, { spe: 2 });
    assert.equal(
        hitval(rock, newt, state, refuse),
        state.objects[ROCK].oc_hitbon,
    );

    // A blessed weapon is worth two more against something that hates it, and
    // nothing against anything else.
    const blessed = object(state, LONG_SWORD, { blessed: 1 });
    assert.equal(hitval(blessed, newt, state, refuse), 0);
    assert.equal(
        hitval(blessed, monster(state, PM_WRAITH), state, refuse),
        2,
    );
    // Blessing something that is not a weapon buys nothing.
    assert.equal(
        hitval(object(state, ROCK, { blessed: 1 }),
            monster(state, PM_WRAITH), state, refuse),
        0,
    );

    // A spear is worth two more against the five kebabable classes.
    const spear = object(state, SPEAR);
    assert.equal(hitval(spear, monster(state, PM_GIANT), state, refuse), 2);
    assert.equal(hitval(spear, newt, state, refuse), 0);
    // A dagger against the same giant is not a spear; what it does score is
    // its own oc_hitbon, which is 2.
    assert.equal(hitval(object(state, DAGGER), monster(state, PM_GIANT),
        state, refuse), state.objects[DAGGER].oc_hitbon);

    // A pick is worth two more against something that both walks through
    // walls and is thick-skinned; a xorn qualifies and a newt does not.
    const pick = object(state, PICK_AXE);
    const pickbon = state.objects[PICK_AXE].oc_hitbon;
    assert.equal(hitval(pick, monster(state, PM_XORN), state, refuse),
        pickbon + 2);
    assert.equal(hitval(pick, newt, state, refuse), pickbon);
    // A dagger against the same xorn is not a pick.
    assert.equal(
        hitval(object(state, DAGGER), monster(state, PM_XORN), state, refuse),
        state.objects[DAGGER].oc_hitbon,
    );

    // artifact.c spec_abon() has no port.
    assert.throws(
        () => hitval(object(state, LONG_SWORD, { oartifact: ART_SUNSWORD }),
            newt, state, refuse),
        /artifact to-hit bonus/u,
    );
});

// weapon.c:170-175, the trident's three answers. It needs a level to read
// is_pool() from, which the other rows above never touch.
test('hitval reads the trident bonus off the target square', () => {
    const state = heroState();
    state.level = {
        at: (x) => ({ typ: x === 5 ? POOL : ROOM }),
    };
    const trident = object(state, TRIDENT);
    const eel = monster(state, PM_GIANT_EEL, { mx: 1, my: 1 });
    const swimmerInWater = monster(state, PM_GIANT_EEL, { mx: 5, my: 1 });
    const newt = monster(state, PM_NEWT, { mx: 1, my: 1 });

    assert.equal(hitval(trident, swimmerInWater, state, {}), 4);
    assert.equal(hitval(trident, eel, state, {}), 2);
    // A newt is not a swimmer, so neither arm applies.
    assert.equal(hitval(trident, newt, state, {}), 0);
    // A long sword against the same eel is not a trident.
    assert.equal(hitval(object(state, LONG_SWORD), swimmerInWater, state, {}),
        0);
});
