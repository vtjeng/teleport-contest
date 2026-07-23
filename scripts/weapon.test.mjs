import assert from 'node:assert/strict';
import test from 'node:test';

import { ART_SUNSWORD } from '../js/artifacts.js';
import {
    NEED_AXE,
    NEED_HTH_WEAPON,
    NEED_PICK_AXE,
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
    PM_GIANT,
    PM_HUMAN_WEREWOLF,
    PM_NEWT,
    monst_globals_init,
} from '../js/monsters.js';
import { newObject } from '../js/obj.js';
import {
    AXE,
    BATTLE_AXE,
    BELL_OF_OPENING,
    CLUB,
    CORPSE,
    DAGGER,
    DWARVISH_MATTOCK,
    LONG_SWORD,
    PICK_AXE,
    SILVER_DAGGER,
    objects_globals_init,
} from '../js/objects.js';
import {
    can_touch_safely,
    mon_wield_item,
    mwelded,
    select_hwep,
    setmnotwielded,
    which_armor,
} from '../js/weapon.js';

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

    await assert.rejects(mon_wield_item(subject, {
        state,
        canSeeMonster: () => true,
        selectRangedWeapon: () => wanted,
    }), /wieldMessage/);
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
    assert.equal(mwelded(object(state, DAGGER, {
        cursed: true,
        owornmask: W_WEP,
    }), state), true);

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
