import assert from 'node:assert/strict';
import test from 'node:test';

import { ART_SUNSWORD } from '../js/artifacts.js';
import {
    P_ATTACK_SPELL,
    P_BARE_HANDED_COMBAT,
    P_BASIC,
    P_DAGGER,
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
    STR18,
    NEED_AXE,
    NEED_HTH_WEAPON,
    NEED_PICK_AXE,
    NEED_PICK_OR_AXE,
    NEED_RANGED_WEAPON,
    NEED_WEAPON,
    NO_WEAPON_WANTED,
    W_ARM,
    W_ARMC,
    W_ARMG,
    W_ARMS,
    W_ARMU,
    W_RINGL,
    W_RINGR,
    W_WEP,
} from '../js/const.js';
import { newMonster } from '../js/monst.js';
import {
    M2_STRONG,
    PM_ARCHEOLOGIST,
    PM_COCKATRICE,
    PM_DEATH,
    PM_GREMLIN,
    PM_MONK,
    PM_SAMURAI,
    PM_SHADE,
    PM_VALKYRIE,
    PM_VAMPIRE,
    PM_GIANT,
    PM_GIANT_EEL,
    PM_HUMAN_WEREWOLF,
    PM_NEWT,
    PM_WOOD_GOLEM,
    PM_WRAITH,
    PM_XORN,
    monst_globals_init,
} from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import { newObject } from '../js/obj.js';
import {
    ACID_VENOM,
    AXE,
    ARROW,
    BATTLE_AXE,
    BELL_OF_OPENING,
    BOULDER,
    BOW,
    BROADSWORD,
    BULLWHIP,
    CLUB,
    CORPSE,
    CREAM_PIE,
    CROSSBOW_BOLT,
    DAGGER,
    DWARVISH_MATTOCK,
    EGG,
    FLAIL,
    GRAPPLING_HOOK,
    HALBERD,
    HEAVY_IRON_BALL,
    IRON_CHAIN,
    LEATHER_GLOVES,
    LONG_SWORD,
    LUCKSTONE,
    MACE,
    PICK_AXE,
    POT_WATER,
    ROCK,
    SPEAR,
    TRIDENT,
    SILVER_DAGGER,
    SILVER_SABER,
    TIN,
    TIN_OPENER,
    UNICORN_HORN,
    objects_globals_init,
} from '../js/objects.js';
import { skillSlot } from '../js/startup_skills.js';
import {
    abon,
    can_touch_safely,
    dbon,
    dmgval,
    hitval,
    martial_bonus,
    mon_wield_item,
    select_hwep,
    select_rwep,
    setmnotwielded,
    special_dmgval,
    use_skill,
    uwep_skill_type,
    weapon_dam_bonus,
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

    // weapon.c setmnotwielded() runs end_burn() for
    // `artifact_light(obj) && obj->lamplit`, so satisfying one half alone
    // leaves nothing to put out. A Sunsword that was never lit is
    // artifact_light() without lamplit; a lit dagger is the reverse.
    const dormant = object(state, LONG_SWORD, {
        oartifact: ART_SUNSWORD,
        owornmask: W_WEP,
    });
    subject.mw = dormant;
    await setmnotwielded(subject, dormant, { state });
    assert.equal(subject.mw, null);
    assert.equal(dormant.owornmask, 0);

    const litOrdinary = object(state, DAGGER, {
        lamplit: true,
        owornmask: W_WEP,
    });
    subject.mw = litOrdinary;
    await setmnotwielded(subject, litOrdinary, { state });
    assert.equal(subject.mw, null);
    assert.equal(litOrdinary.owornmask, 0);
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

// weapon.c:991-1014. Every band is a separate `return`, and three of the
// comparisons at the top of the 18/xx range are hand-picked: `<=` at 18/75 and
// 18/90, `<` at 18/100. Each pair below straddles one boundary, so flipping any
// one comparison moves a value across it and fails a row.
//
// ACURR(A_STR) is the 3..125 encoding, in which 18 is plain 18, STR18(x) is
// 18+x, and 19..25 come back as 119..125.
test('dbon reads every Strength band and its exact boundaries', () => {
    const at = (str) => dbon(heroState({ str }));

    // str < 6. effective_attribute() floors Strength at 3, so 3 is the lowest
    // value this band can be asked about.
    assert.equal(at(3), -1);
    assert.equal(at(5), -1);
    // str < 16.
    assert.equal(at(6), 0);
    assert.equal(at(15), 0);
    // str < 18.
    assert.equal(at(16), 1);
    assert.equal(at(17), 1);
    // str == 18 exactly: 18/01 is a different band, so this row is one value
    // wide.
    assert.equal(at(18), 2);
    // str <= STR18(75), i.e. 18/01 through 18/75 inclusive. 93 is the last
    // value in the band; were the comparison `<` it would score 4.
    assert.equal(at(STR18(1)), 3);
    assert.equal(at(STR18(75)), 3);
    // str <= STR18(90). 94 is the first value past 18/75 and 108 the last of
    // this band; `<` at 18/90 would push 108 to 5.
    assert.equal(at(STR18(76)), 4);
    assert.equal(at(STR18(90)), 4);
    // str < STR18(100), i.e. 18/91 through 18/99. Here the comparison is
    // strict, so 18/100 itself belongs to the band below, not this one.
    assert.equal(at(STR18(91)), 5);
    assert.equal(at(STR18(99)), 5);
    // The final `else`: 18/100 and above.
    assert.equal(at(STR18(100)), 6);
    // 25 is the encoding's ceiling, which effective_attribute() also caps at.
    assert.equal(at(125), 6);
});

// weapon.c:1638-1729, the damage-side twin of weapon_hit_bonus(). Each arm
// below is a separate constant in C.
test('weapon_dam_bonus reads one bonus per weapon skill level', () => {
    const state = heroState();
    const sword = object(state, LONG_SWORD);
    const setSkill = (skill, level) => {
        state.u.weapon_skills[skill].skill = level;
    };

    // The P_NONE arm. A potion is neither weapon, weapon-tool, nor ammo, so
    // weapon_type() answers P_NONE and the whole type chain is skipped. A
    // restricted long sword would score -2 here, so this row is decisive.
    assert.equal(weapon_dam_bonus(object(state, POT_WATER), state), 0);

    for (const [level, bonus] of [
        [P_ISRESTRICTED, -2], [P_UNSKILLED, -2], [P_BASIC, 0],
        [P_SKILLED, 1], [P_EXPERT, 2],
    ]) {
        setSkill(P_LONG_SWORD, level);
        assert.equal(weapon_dam_bonus(sword, state), bonus, `level ${level}`);
    }

    // A unicorn horn's skill is P_LAST_WEAPON itself, the inclusive end of the
    // `type <= P_LAST_WEAPON` arm.
    assert.equal(P_UNICORN_HORN, P_LAST_WEAPON);
    setSkill(P_UNICORN_HORN, P_SKILLED);
    assert.equal(weapon_dam_bonus(object(state, UNICORN_HORN), state), 1);
});

// weapon.c:1683-1697. The two-weapon arm scores the lower of the two skills,
// and only for a weapon that is actually in one of the two hands.
test('weapon_dam_bonus takes the lower skill while two-weaponing', () => {
    const state = heroState();
    const sword = object(state, LONG_SWORD);
    const dagger = object(state, DAGGER);
    const setSkill = (skill, level) => {
        state.u.weapon_skills[skill].skill = level;
    };
    state.u.twoweap = true;
    state.uwep = sword;
    state.uswapwep = dagger;

    // Long sword parked at Expert, so the two-weapon skill is the lower one
    // and therefore the one the switch reads.
    setSkill(P_LONG_SWORD, P_EXPERT);
    setSkill(P_DAGGER, P_EXPERT);
    for (const [level, bonus] of [
        [P_ISRESTRICTED, -3], [P_UNSKILLED, -3], [P_BASIC, -1],
        [P_SKILLED, 0], [P_EXPERT, 1],
    ]) {
        setSkill(P_TWO_WEAPON_COMBAT, level);
        assert.equal(weapon_dam_bonus(sword, state), bonus, `two ${level}`);
    }

    // Now the weapon skill is the lower one, so `min` picks it instead.
    setSkill(P_TWO_WEAPON_COMBAT, P_EXPERT);
    setSkill(P_LONG_SWORD, P_BASIC);
    assert.equal(weapon_dam_bonus(sword, state), -1);
    // The off-hand weapon reaches the same arm through the uswapwep term.
    setSkill(P_DAGGER, P_SKILLED);
    assert.equal(weapon_dam_bonus(dagger, state), 0);
    // A weapon in neither hand keeps its own ladder even while two-weaponing:
    // P_DAGGER at Skilled scores 1 there rather than the 0 it scores above.
    assert.equal(weapon_dam_bonus(object(state, DAGGER), state), 1);
});

// weapon.c:1697-1712. `bonus = ((max(skill, P_UNSKILLED) - 1 + 1) *
// (martial ? 3 : 1)) / 2` with integer division. The expected values are the
// two columns of C's own comment at 1697-1704.
test('weapon_dam_bonus triples the bare-handed ladder for martial roles',
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
            bare.push(weapon_dam_bonus(null, state));
            state.urole = { mnum: PM_MONK };
            martial.push(weapon_dam_bonus(null, state));
        }
        // Restricted folds onto unskilled, which is why the first two match.
        // The rest are the comment's b.h. column: 0, +1, +1, +2, +2, +3.
        assert.deepEqual(bare, [0, 0, 1, 1, 2, 2, 3]);
        // The comment's m.a. column: +3, +4, +6, +7, +9. Its "n/a" for
        // martial-unskilled is not a special case in the arithmetic; that row
        // scores 1, as restricted does.
        assert.deepEqual(martial, [1, 1, 3, 4, 6, 7, 9]);
    });

// weapon.c:1714-1727. Riding adds thrusting damage, but C guards the whole
// switch with `type != P_TWO_WEAPON_COMBAT`, so a two-weapon swing gets none.
test('weapon_dam_bonus adds a riding bonus except while two-weaponing', () => {
    const state = heroState();
    state.u.weapon_skills[P_LONG_SWORD].skill = P_BASIC;
    const sword = object(state, LONG_SWORD);
    // Basic is worth 0, so every number below is the riding term alone.
    assert.equal(weapon_dam_bonus(sword, state), 0);

    state.u.usteed = { mx: 1, my: 1 };
    for (const [level, bonus] of [
        [P_ISRESTRICTED, 0], [P_UNSKILLED, 0], [P_BASIC, 0],
        [P_SKILLED, 1], [P_EXPERT, 2],
    ]) {
        state.u.weapon_skills[P_RIDING].skill = level;
        assert.equal(weapon_dam_bonus(sword, state), bonus, `riding ${level}`);
    }

    // The riding switch sits outside the type chain, so it also lands on the
    // P_NONE and bare-handed arms.
    state.u.weapon_skills[P_RIDING].skill = P_EXPERT;
    assert.equal(weapon_dam_bonus(object(state, POT_WATER), state), 2);
    state.u.weapon_skills[P_BARE_HANDED_COMBAT].skill = P_ISRESTRICTED;
    assert.equal(weapon_dam_bonus(null, state), 0 + 2);

    // The guard. Expert in both two-weapon combat and the long sword scores 1
    // from the two-weapon arm, and Expert riding adds nothing on top.
    state.u.weapon_skills[P_LONG_SWORD].skill = P_EXPERT;
    state.u.weapon_skills[P_TWO_WEAPON_COMBAT].skill = P_EXPERT;
    state.u.twoweap = true;
    state.uwep = sword;
    assert.equal(weapon_dam_bonus(sword, state), 1);
    // Dropping two-weaponing alone moves the same sword to the weapon ladder,
    // worth 2, and lets the same Expert riding add its 2 on top.
    state.u.twoweap = false;
    assert.equal(weapon_dam_bonus(sword, state), 4);
});

// Records the order and shape of every random-number call dmgval() and
// special_dmgval() make, and hands back the next scripted result. C makes these
// calls in a fixed order that a live game observes through the RNG log, so the
// order matters as much as the total.
function scriptedRandom(results) {
    const remaining = [...results];
    const calls = [];
    const take = (label) => {
        calls.push(label);
        if (!remaining.length)
            throw new Error(`unscripted random call ${label}`);
        return remaining.shift();
    };
    return {
        calls,
        random: {
            d: (n, x) => take(`d(${n},${x})`),
            rn2: (x) => take(`rn2(${x})`),
            rnd: (x) => take(`rnd(${x})`),
        },
    };
}

// Turns either of dmgval()'s two refusals into a throw the test can name.
const refuseUnsupported = {
    unsupported: (reason) => { throw new Error(reason); },
};

// weapon.c:220-221. The cream pie leaves before anything else runs, so an
// empty script proves no die was rolled.
test('dmgval returns nothing for a cream pie and rolls nothing', () => {
    const state = makeState();
    const roller = scriptedRandom([]);

    assert.equal(dmgval(object(state, CREAM_PIE), monster(state, PM_GIANT),
        state, { random: roller.random, ...refuseUnsupported }), 0);
    assert.deepEqual(roller.calls, []);

    // A cream pie has an oc_wsdam and an oc_wldam of 0, so falling through the
    // early return would still roll nothing and still answer 0. The shade arm
    // is what makes the return itself visible: everything below 220 would stop
    // there, and C returns before reaching it.
    assert.equal(dmgval(object(state, CREAM_PIE), monster(state, PM_SHADE),
        state, { random: roller.random, ...refuseUnsupported }), 0);
    assert.deepEqual(roller.calls, []);
});

// weapon.c:223-249. A giant is MZ_HUGE, so bigmonst() holds and the base die
// is objects[].oc_wldam, the `ldam` column of include/objects.h.
test('dmgval rolls the large-monster die and its extra die', () => {
    const state = makeState();
    const giant = monster(state, PM_GIANT);
    const hit = (otyp, results) => {
        const roller = scriptedRandom(results);
        const damage = dmgval(object(state, otyp), giant, state,
            { random: roller.random, ...refuseUnsupported });
        return { damage, calls: roller.calls };
    };

    // A long sword is in neither switch, so its ldam of 12 is the whole roll.
    assert.deepEqual(hit(LONG_SWORD, [7]), { damage: 7, calls: ['rnd(12)'] });
    // IRON_CHAIN: ldam 4, then the flat `tmp++` arm.
    assert.deepEqual(hit(IRON_CHAIN, [3]), { damage: 4, calls: ['rnd(4)'] });
    // FLAIL: ldam 4, then `rnd(4)`.
    assert.deepEqual(hit(FLAIL, [2, 3]),
        { damage: 5, calls: ['rnd(4)', 'rnd(4)'] });
    // HALBERD: ldam 6, then `rnd(6)`.
    assert.deepEqual(hit(HALBERD, [5, 4]),
        { damage: 9, calls: ['rnd(6)', 'rnd(6)'] });
    // BATTLE_AXE: ldam 6, then `d(2,4)`.
    assert.deepEqual(hit(BATTLE_AXE, [4, 5]),
        { damage: 9, calls: ['rnd(6)', 'd(2,4)'] });
    // DWARVISH_MATTOCK: ldam 8, then `d(2,6)`.
    assert.deepEqual(hit(DWARVISH_MATTOCK, [6, 7]),
        { damage: 13, calls: ['rnd(8)', 'd(2,6)'] });
});

// weapon.c:250-295. A newt is MZ_TINY, so the base die is objects[].oc_wsdam,
// the `sdam` column, and the second switch applies instead.
test('dmgval rolls the small-monster die and its extra die', () => {
    const state = makeState();
    const newt = monster(state, PM_NEWT);
    const hit = (otyp, results) => {
        const roller = scriptedRandom(results);
        const damage = dmgval(object(state, otyp), newt, state,
            { random: roller.random, ...refuseUnsupported });
        return { damage, calls: roller.calls };
    };

    // A long sword is in neither switch here either; its sdam is 8.
    assert.deepEqual(hit(LONG_SWORD, [5]), { damage: 5, calls: ['rnd(8)'] });
    // MACE: sdam 6, then the flat `tmp++` arm.
    assert.deepEqual(hit(MACE, [4]), { damage: 5, calls: ['rnd(6)'] });
    // BROADSWORD: sdam 4, then `rnd(4)`. Note it is `tmp++` on the large side,
    // so the two switches disagree about this weapon.
    assert.deepEqual(hit(BROADSWORD, [3, 2]),
        { damage: 5, calls: ['rnd(4)', 'rnd(4)'] });
    // ACID_VENOM: sdam 6, then `rnd(6)`, the only entry in the small `rnd(6)`
    // arm.
    assert.deepEqual(hit(ACID_VENOM, [6, 5]),
        { damage: 11, calls: ['rnd(6)', 'rnd(6)'] });
});

// weapon.c:297-301.
test('dmgval adds enchantment for weapons only and never below zero', () => {
    const state = makeState();
    const newt = monster(state, PM_NEWT);
    const hit = (obj, results) => {
        const roller = scriptedRandom(results);
        return dmgval(obj, newt, state,
            { random: roller.random, ...refuseUnsupported });
    };

    // A +3 long sword: sdam 8 plus the enchantment.
    assert.equal(hit(object(state, LONG_SWORD, { spe: 3 }), [5]), 8);
    // A -10 long sword rolls 1, which the clamp lifts from -9 to 0. The final
    // `if (tmp > 0)` then skips erosion, so the answer is 0 rather than 1.
    assert.equal(hit(object(state, LONG_SWORD, { spe: -10 }), [1]), 0);
    // An iron chain is CHAIN_CLASS and no weapon-tool, so Is_weapon is false
    // and the same +5 is ignored: ldam-less small roll of 2, plus the `tmp++`.
    assert.equal(hit(object(state, IRON_CHAIN, { spe: 5 }), [2]), 3);
});

// weapon.c:303-305. LEATHER is material 7 in objclass.h, so only the softest
// materials are stopped by a hide.
test('dmgval zeroes soft materials against a thick skin', () => {
    const state = makeState();
    const xorn = monster(state, PM_XORN);
    const newt = monster(state, PM_NEWT);
    const hit = (otyp, target, results) => {
        const roller = scriptedRandom(results);
        return dmgval(object(state, otyp), target, state,
            { random: roller.random, ...refuseUnsupported });
    };

    // A bullwhip is LEATHER, exactly the limit, and a xorn is M1_THICK_HIDE.
    // The die is still rolled first, then discarded.
    assert.equal(hit(BULLWHIP, xorn, [2]), 0);
    // The same bullwhip against a newt, which has no thick hide.
    assert.equal(hit(BULLWHIP, newt, [2]), 2);
    // A long sword is IRON, past the limit, so the same xorn feels it.
    assert.equal(hit(LONG_SWORD, xorn, [5]), 5);
});

// weapon.c:311-321. weight.h sets WT_IRON_BALL_INCR to 160 and objects.h gives
// the heavy iron ball an oc_weight of 480 and an sdam and ldam of 25.
test('dmgval adds a die for a heavy iron ball above its base weight', () => {
    const state = makeState();
    const newt = monster(state, PM_NEWT);
    const hit = (owt, results) => {
        const roller = scriptedRandom(results);
        const damage = dmgval(object(state, HEAVY_IRON_BALL, { owt }), newt,
            state, { random: roller.random, ...refuseUnsupported });
        return { damage, calls: roller.calls };
    };

    // At the base weight the inner `owt > wt` test fails, so only sdam rolls.
    assert.deepEqual(hit(480, [5]), { damage: 5, calls: ['rnd(25)'] });
    // 480 + 3 * 160: three increments, so `rnd(4 * 3)`.
    assert.deepEqual(hit(960, [5, 4]),
        { damage: 9, calls: ['rnd(25)', 'rnd(12)'] });
    // 480 + 200: C's integer division truncates 1.25 to one increment, so the
    // extra die is rnd(4), not rnd(5).
    assert.deepEqual(hit(680, [5, 3]),
        { damage: 8, calls: ['rnd(25)', 'rnd(4)'] });
    // The cap. 25 + 10 is 35, which C clamps back to 25; no erosion follows,
    // so 25 is also the returned damage.
    assert.deepEqual(hit(960, [25, 10]),
        { damage: 25, calls: ['rnd(25)', 'rnd(12)'] });
});

// weapon.c:324-341, the four versus-monster bonus terms and the order C rolls
// them in.
test('dmgval adds each versus-monster damage bonus its source names', () => {
    const state = makeState();
    const newt = monster(state, PM_NEWT);
    const hit = (obj, target, results) => {
        const roller = scriptedRandom(results);
        const damage = dmgval(obj, target, state,
            { random: roller.random, ...refuseUnsupported });
        return { damage, calls: roller.calls };
    };

    // Blessed against a wraith, which is M2_UNDEAD: sdam 8, then rnd(4).
    const wraith = monster(state, PM_WRAITH);
    assert.deepEqual(
        hit(object(state, LONG_SWORD, { blessed: 1 }), wraith, [3, 2]),
        { damage: 5, calls: ['rnd(8)', 'rnd(4)'] },
    );
    // The same blessed sword against a newt buys nothing.
    assert.deepEqual(hit(object(state, LONG_SWORD, { blessed: 1 }), newt, [3]),
        { damage: 3, calls: ['rnd(8)'] });

    // An axe against a wood golem, which is MZ_LARGE, so this rolls ldam 4 and
    // then the axe bonus. The golem is also M1_THICK_HIDE, but an axe is IRON,
    // so the material check above leaves the roll alone.
    const woodGolem = monster(state, PM_WOOD_GOLEM);
    assert.deepEqual(hit(object(state, AXE), woodGolem, [3, 2]),
        { damage: 5, calls: ['rnd(4)', 'rnd(4)'] });
    // The same axe against a giant, which is not wooden.
    assert.deepEqual(hit(object(state, AXE), monster(state, PM_GIANT), [3]),
        { damage: 3, calls: ['rnd(4)'] });
    // A long sword against the wood golem is not an axe.
    assert.deepEqual(hit(object(state, LONG_SWORD), woodGolem, [7]),
        { damage: 7, calls: ['rnd(12)'] });

    // Silver against a werewolf: sdam 4, then rnd(20).
    const were = monster(state, PM_HUMAN_WEREWOLF);
    assert.deepEqual(hit(object(state, SILVER_DAGGER), were, [2, 13]),
        { damage: 15, calls: ['rnd(4)', 'rnd(20)'] });
    // The same silver dagger against a newt, and an iron dagger against the
    // same werewolf: both keep the base roll alone.
    assert.deepEqual(hit(object(state, SILVER_DAGGER), newt, [2]),
        { damage: 2, calls: ['rnd(4)'] });
    assert.deepEqual(hit(object(state, DAGGER), were, [2]),
        { damage: 2, calls: ['rnd(4)'] });

    // A lit Sunsword against a gremlin, which hates light: sdam 8, then
    // rnd(8). The scripted 1 keeps the bonus at 1 so it stays below the
    // artifact-halving test at 338, which this port refuses.
    const gremlin = monster(state, PM_GREMLIN);
    const sunsword = (overrides) => object(state, LONG_SWORD, {
        oartifact: ART_SUNSWORD, ...overrides,
    });
    assert.deepEqual(hit(sunsword({ lamplit: true }), gremlin, [2, 1]),
        { damage: 3, calls: ['rnd(8)', 'rnd(8)'] });
    // artifact_light() alone is not enough; C also requires obj->lamplit.
    assert.deepEqual(hit(sunsword({}), gremlin, [2]),
        { damage: 2, calls: ['rnd(8)'] });
    // And a newt does not hate light.
    assert.deepEqual(hit(sunsword({ lamplit: true }), newt, [2]),
        { damage: 2, calls: ['rnd(8)'] });

    // Two terms at once fix their order. A vampire is M2_UNDEAD and S_VAMPIRE,
    // so it hates both the blessing and the silver: sdam 4, then rnd(4) for
    // the blessing, then rnd(20) for the silver.
    assert.deepEqual(
        hit(object(state, SILVER_DAGGER, { blessed: 1 }),
            monster(state, PM_VAMPIRE), [2, 3, 13]),
        { damage: 18, calls: ['rnd(4)', 'rnd(4)', 'rnd(20)'] },
    );
});

// weapon.c:343-353.
test('dmgval subtracts erosion but never below one', () => {
    const state = makeState();
    const newt = monster(state, PM_NEWT);
    const hit = (overrides, results, target = newt) => {
        const roller = scriptedRandom(results);
        return dmgval(object(state, LONG_SWORD, overrides), target, state,
            { random: roller.random, ...refuseUnsupported });
    };

    // Rusted twice: 5 - 2.
    assert.equal(hit({ oeroded: 2 }, [5]), 3);
    // greatest_erosion() takes the larger of the two counters, so corrosion
    // of 4 beats rust of 1: 8 - 4.
    assert.equal(hit({ oeroded: 1, oeroded2: 4 }, [8]), 4);
    // The floor: 1 - 3 is -2, which C lifts back to 1.
    assert.equal(hit({ oeroded: 3, oeroded2: 1 }, [1]), 1);
    // C guards the whole block with `tmp > 0`, so damage already reduced to
    // nothing is not lifted to 1 by the floor. A bullwhip is LEATHER and a
    // xorn is thick-skinned, which is what zeroes it.
    const roller = scriptedRandom([2]);
    assert.equal(
        dmgval(object(state, BULLWHIP, { oeroded: 2 }),
            monster(state, PM_XORN), state,
            { random: roller.random, ...refuseUnsupported }),
        0,
    );
});

// The two arms of dmgval() this port stops at. Both sit after the base roll,
// so each refusal happens with the die already spent.
test('dmgval zeroes a shade hit unless the object can glare, and refuses an '
    + 'artifact worth doubling', () => {
    const state = makeState();

    // weapon.c:306-307. An ordinary long sword passes harmlessly through a
    // shade: the die is still rolled, and the total is then thrown away.
    const shadeRoller = scriptedRandom([5]);
    assert.equal(
        dmgval(object(state, LONG_SWORD), monster(state, PM_SHADE),
            state, { random: shadeRoller.random, ...refuseUnsupported }),
        0,
    );
    assert.deepEqual(shadeRoller.calls, ['rnd(8)']);

    // artifact.c shade_glare():558-559 answers TRUE for any silver object, so
    // a silver saber hurts a shade. Its rnd(8) is the base die and the rnd(20)
    // is the silver bonus at weapon.c:331-332, which a shade also earns
    // through mon_hates_silver().
    const silverRoller = scriptedRandom([5, 6]);
    assert.equal(
        dmgval(object(state, SILVER_SABER), monster(state, PM_SHADE),
            state, { random: silverRoller.random, ...refuseUnsupported }),
        11,
    );
    assert.deepEqual(silverRoller.calls, ['rnd(8)', 'rnd(20)']);

    // weapon.c:338-339 needs artifact.c spec_dbon(). C reaches it only for an
    // artifact whose bonus already exceeds 1, so a lit Sunsword against a
    // gremlin refuses once the light bonus rolls 2 rather than the 1 the test
    // above scripted.
    const artifactRoller = scriptedRandom([2, 2]);
    assert.throws(
        () => dmgval(
            object(state, LONG_SWORD, {
                oartifact: ART_SUNSWORD, lamplit: true,
            }),
            monster(state, PM_GREMLIN), state,
            { random: artifactRoller.random, ...refuseUnsupported },
        ),
        /artifact damage doubling/u,
    );
    assert.deepEqual(artifactRoller.calls, ['rnd(8)', 'rnd(8)']);

    // The same bonus of 2 on a weapon that is no artifact passes through.
    const plainRoller = scriptedRandom([3, 2]);
    assert.equal(
        dmgval(object(state, LONG_SWORD, { blessed: 1 }),
            monster(state, PM_WRAITH), state,
            { random: plainRoller.random, ...refuseUnsupported }),
        5,
    );
});

// weapon.c:357-425. special_dmgval() answers with the bonus and writes the
// slot that supplied the silver through its `silverhit_p` output.
test('special_dmgval reads blessed and silver gloves', () => {
    const state = makeState();
    const wraith = monster(state, PM_WRAITH);
    const were = monster(state, PM_HUMAN_WEREWOLF);
    const hit = (armask, mdef, results) => {
        const roller = scriptedRandom(results);
        const out = {};
        const bonus = special_dmgval(state.youmonst, mdef, armask, out, state,
            { random: roller.random, ...refuseUnsupported });
        return { bonus, silverhit: out.silverhit, calls: roller.calls };
    };

    // Blessed gloves against something M2_UNDEAD. Nothing is silver, so the
    // output mask stays empty.
    state.uarmg = object(state, LEATHER_GLOVES, {
        blessed: 1, owornmask: W_ARMG,
    });
    assert.deepEqual(hit(W_ARMG, wraith, [3]),
        { bonus: 3, silverhit: 0, calls: ['rnd(4)'] });
    // The same gloves against a newt, which hates neither.
    assert.deepEqual(hit(W_ARMG, monster(state, PM_NEWT), []),
        { bonus: 0, silverhit: 0, calls: [] });

    // C's comment at 393-395 says no silver gloves exist and that the silver
    // check is deliberately general, so this exercises it with a fixed-material
    // object in the glove slot; special_dmgval() reads only oc_material there.
    state.uarmg = object(state, SILVER_DAGGER, { owornmask: W_ARMG });
    // The mask C passes for a bare-handed hit carries both ring bits too. The
    // gloves win, and the mask C reports back is W_ARMG rather than a ring.
    assert.deepEqual(hit(W_ARMG | W_RINGL | W_RINGR, were, [13]),
        { bonus: 13, silverhit: W_ARMG, calls: ['rnd(20)'] });

    // Blessed and silver together fix the order: rnd(4) then rnd(20). A
    // vampire is M2_UNDEAD and S_VAMPIRE, so it hates both.
    state.uarmg = object(state, SILVER_DAGGER, {
        blessed: 1, owornmask: W_ARMG,
    });
    assert.deepEqual(hit(W_ARMG, monster(state, PM_VAMPIRE), [3, 13]),
        { bonus: 16, silverhit: W_ARMG, calls: ['rnd(4)', 'rnd(20)'] });

    // weapon.c:400-401 wants both halves: a silver object in the glove slot
    // against a newt, which hates neither silver nor blessings, adds nothing
    // and reports no mask.
    state.uarmg = object(state, SILVER_DAGGER, { owornmask: W_ARMG });
    assert.deepEqual(hit(W_ARMG, monster(state, PM_NEWT), []),
        { bonus: 0, silverhit: 0, calls: [] });
    // And leather gloves against a werewolf, which hates silver but finds
    // nothing silver to hate.
    state.uarmg = object(state, LEATHER_GLOVES, { owornmask: W_ARMG });
    assert.deepEqual(hit(W_ARMG, were, []),
        { bonus: 0, silverhit: 0, calls: [] });
});

// weapon.c:405-424, the ring arm C reaches only when the hero wears no gloves.
test('special_dmgval reads silver rings when no gloves are worn', () => {
    const state = makeState();
    const were = monster(state, PM_HUMAN_WEREWOLF);
    // As above, ring materials are shuffled at game start, so a fixed-material
    // object stands in for a silver ring; only oc_material is read here.
    const silver = () => object(state, SILVER_DAGGER);
    const iron = () => object(state, DAGGER);
    const hit = (armask, mdef, results) => {
        const roller = scriptedRandom(results);
        const out = {};
        const bonus = special_dmgval(state.youmonst, mdef, armask, out, state,
            { random: roller.random, ...refuseUnsupported });
        return { bonus, silverhit: out.silverhit, calls: roller.calls };
    };

    state.uarmg = null;
    state.uleft = silver();
    state.uright = silver();

    // W_RINGL alone consults the left hand only, even with silver on both.
    assert.deepEqual(hit(W_RINGL, were, [13]),
        { bonus: 13, silverhit: W_RINGL, calls: ['rnd(20)'] });
    // W_RINGR alone consults the right hand only.
    assert.deepEqual(hit(W_RINGR, were, [11]),
        { bonus: 11, silverhit: W_RINGR, calls: ['rnd(20)'] });
    // Both bits with silver on both hands: C's comment at 417-418 says two
    // silver rings do not double the damage, so exactly one rnd(20) is rolled,
    // while the reported mask names both hands.
    assert.deepEqual(hit(W_RINGL | W_RINGR, were, [13]),
        { bonus: 13, silverhit: W_RINGL | W_RINGR, calls: ['rnd(20)'] });

    // Silver on the right hand only still scores, and reports only W_RINGR.
    state.uleft = iron();
    assert.deepEqual(hit(W_RINGL | W_RINGR, were, [11]),
        { bonus: 11, silverhit: W_RINGR, calls: ['rnd(20)'] });
    // An empty left hand takes the same path: C tests `left_ring && uleft`.
    state.uleft = null;
    assert.deepEqual(hit(W_RINGL | W_RINGR, were, [11]),
        { bonus: 11, silverhit: W_RINGR, calls: ['rnd(20)'] });

    // A defender that does not hate silver scores nothing from either hand.
    state.uleft = silver();
    assert.deepEqual(hit(W_RINGL | W_RINGR, monster(state, PM_NEWT), []),
        { bonus: 0, silverhit: 0, calls: [] });

    // C guards the ring arm with `magr == &gy.youmonst`, because uleft and
    // uright are the hero's slots. An ordinary monster wearing no gloves gets
    // nothing even though the same rings are on the hero's hands.
    const roller = scriptedRandom([]);
    const out = {};
    assert.equal(
        special_dmgval(monster(state, PM_GIANT), were, W_RINGL | W_RINGR, out,
            state, { random: roller.random, ...refuseUnsupported }),
        0,
    );
    assert.equal(out.silverhit, 0);
    assert.deepEqual(roller.calls, []);
});

// weapon.c:380-391. The body-armor arm belongs to mhitu.c's passive hits and
// has no ported caller, so all three of its bits stop here.
test('special_dmgval refuses the body-armor mask', () => {
    const state = makeState();
    const wraith = monster(state, PM_WRAITH);

    for (const armask of [W_ARMC, W_ARM, W_ARMU, W_ARMC | W_ARM | W_ARMU]) {
        assert.throws(
            () => special_dmgval(state.youmonst, wraith, armask, {}, state,
                refuseUnsupported),
            /body armor special damage/u,
            `mask ${armask}`,
        );
    }
});

// weapon.c:1423-1434.
test('use_skill practices a skill and stops where C announces advancement',
    () => {
        const state = makeHeroState();
        const advanceable = (skill) => {
            const slot = skillSlot(skill, state);
            slot.skill = P_BASIC;
            slot.max_skill = P_EXPERT;
            slot.advance = 0;
            return slot;
        };

        // The `skill != P_NONE` term, made decisive by giving slot P_NONE an
        // unrestricted skill so the second term would let it through.
        const none = advanceable(P_NONE);
        use_skill(P_NONE, 5, state);
        assert.equal(none.advance, 0);

        // The `!P_RESTRICTED(skill)` term. A restricted skill takes no
        // practice at all.
        const sword = skillSlot(P_LONG_SWORD, state);
        sword.skill = P_ISRESTRICTED;
        sword.max_skill = P_EXPERT;
        use_skill(P_LONG_SWORD, 5, state);
        assert.equal(sword.advance, 0);

        // The ordinary case. practice_needed_to_advance(P_BASIC) is
        // 2 * 2 * 20 == 80 and slots_required() for a weapon skill is the
        // current level, 2, so with no slots and 5 practice can_advance() is
        // false before and after and nothing is announced.
        advanceable(P_LONG_SWORD);
        state.u.weapon_slots = 0;
        use_skill(P_LONG_SWORD, 5, state);
        assert.equal(sword.advance, 5);
        use_skill(P_LONG_SWORD, 3, state);
        assert.equal(sword.advance, 8);

        // give_may_advance_msg(). Two slots and 79 practice leave the hero one
        // point short, so the increment is what first makes can_advance() true.
        sword.advance = 79;
        state.u.weapon_slots = 2;
        assert.equal(can_advance(P_LONG_SWORD, false, state), false);
        assert.throws(
            () => use_skill(P_LONG_SWORD, 1, state),
            (error) => error instanceof UnsupportedWeaponSkillError
                && error.branch === 'give_may_advance_msg(skill)',
        );
        // C adds the practice before it tests again, so the write survives.
        assert.equal(sword.advance, 80);

        // `!advance_before` keeps the message to the crossing itself. Further
        // practice on an already-advanceable skill announces nothing.
        use_skill(P_LONG_SWORD, 1, state);
        assert.equal(sword.advance, 81);
    });

// weapon.c:1531-1537.
test('uwep_skill_type answers for the wielded weapon or for two-weaponing',
    () => {
        const state = heroState();

        // weapon_type(NULL) is bare-handed combat, not P_NONE.
        state.uwep = null;
        assert.equal(uwep_skill_type(state), P_BARE_HANDED_COMBAT);
        state.uwep = object(state, LONG_SWORD);
        assert.equal(uwep_skill_type(state), P_LONG_SWORD);
        // A potion is neither weapon, weapon-tool, nor ammo.
        state.uwep = object(state, POT_WATER);
        assert.equal(uwep_skill_type(state), P_NONE);

        // u.twoweap is tested first and answers for every one of them.
        state.u.twoweap = true;
        assert.equal(uwep_skill_type(state), P_TWO_WEAPON_COMBAT);
        state.uwep = object(state, LONG_SWORD);
        assert.equal(uwep_skill_type(state), P_TWO_WEAPON_COMBAT);
        state.uwep = null;
        assert.equal(uwep_skill_type(state), P_TWO_WEAPON_COMBAT);
    });

// skills.h:81. Only two roles get the martial tables that P_NAME(),
// weapon_hit_bonus() and weapon_dam_bonus() above read through this.
test('martial_bonus holds for the Samurai and the Monk alone', () => {
    const state = heroState();

    state.urole = { mnum: PM_SAMURAI };
    assert.equal(martial_bonus(state), true);
    state.urole = { mnum: PM_MONK };
    assert.equal(martial_bonus(state), true);
    state.urole = { mnum: PM_VALKYRIE };
    assert.equal(martial_bonus(state), false);
    state.urole = { mnum: PM_ARCHEOLOGIST };
    assert.equal(martial_bonus(state), false);
});
