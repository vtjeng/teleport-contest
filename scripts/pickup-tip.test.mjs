import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALTAR,
    ECMD_TIME,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    OBJ_CONTAINED,
    OBJ_DELETED,
    OBJ_FLOOR,
    OBJ_INVENT,
} from '../js/const.js';
import {
    BAG_OF_TRICKS,
    CHEST,
    COIN_CLASS,
    CORPSE,
    DAGGER,
    HORN_OF_PLENTY,
    LARGE_BOX,
    POTION_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';
import { PM_HOUSECAT } from '../js/monsters.js';
import { dotip, tip_ok, use_container } from '../js/pickup.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { newObject } from '../js/obj.js';

async function heroOnCleanSquare(seed = 83001621) {
    await runSegment({
        seed,
        datetime: '20290911101500',
        nethackrc: 'OPTIONS=name:Tipper,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none,!acoustics,!autopickup',
        moves: '',
    });
    clearTtyMessageWindow(game);
    return game;
}

function quantumCatBox(state) {
    const { ux, uy } = state.u;
    const corpse = newObject({
        otyp: CORPSE,
        oclass: state.objects[CORPSE].oc_class,
        corpsenm: PM_HOUSECAT,
        quan: 1,
        where: OBJ_CONTAINED,
        ox: ux,
        oy: uy,
        owt: 20,
    });
    const box = newObject({
        otyp: LARGE_BOX,
        oclass: state.objects[LARGE_BOX].oc_class,
        quan: 1,
        spe: 1,
        where: OBJ_FLOOR,
        ox: ux,
        oy: uy,
        owt: 120,
        cobj: corpse,
    });
    corpse.ocontainer = box;
    state.level.objects[ux][uy] = box;
    return { box, corpse };
}

// C ref: pickup.c tip_ok() (3395-3410). Its source has no RNG, output, or
// state writes; it returns only GETOBJ_EXCLUDE/SUGGEST/DOWNPLAY by class,
// container type, and the horn's discovery flags.
test('tip_ok follows the source eligibility and suggestion rules', () => {
    const knownHornState = {
        objects: { [HORN_OF_PLENTY]: { oc_name_known: true } },
    };
    const unknownHornState = {
        objects: { [HORN_OF_PLENTY]: { oc_name_known: false } },
    };

    assert.equal(tip_ok(null), GETOBJ_EXCLUDE);
    assert.equal(tip_ok({ oclass: COIN_CLASS }), GETOBJ_EXCLUDE);
    assert.equal(tip_ok({ otyp: LARGE_BOX }), GETOBJ_SUGGEST);
    assert.equal(tip_ok({ otyp: BAG_OF_TRICKS }), GETOBJ_SUGGEST);
    assert.equal(tip_ok({
        otyp: HORN_OF_PLENTY,
        dknown: false,
    }, knownHornState), GETOBJ_DOWNPLAY);
    assert.equal(tip_ok({
        otyp: HORN_OF_PLENTY,
        dknown: true,
    }, unknownHornState), GETOBJ_DOWNPLAY);
    assert.equal(tip_ok({
        otyp: HORN_OF_PLENTY,
        dknown: true,
    }, knownHornState), GETOBJ_SUGGEST);
    assert.equal(tip_ok({ oclass: POTION_CLASS }), GETOBJ_DOWNPLAY);
});

test('pickup.c tipcontainer identifies a cursed spill on an altar', async () => {
    const state = await heroOnCleanSquare();
    const { ux, uy } = state.u;
    state.level.at(ux, uy).typ = ALTAR;

    const dagger = {
        otyp: DAGGER,
        oclass: WEAPON_CLASS,
        quan: 1,
        nobj: null,
        cobj: null,
        where: OBJ_CONTAINED,
        unpaid: 0,
        no_charge: false,
        invlet: 0,
        dknown: 1,
        bknown: 0,
        rknown: 0,
        known: 0,
        oartifact: 0,
        cursed: 1,
        blessed: 0,
        spe: 0,
        corpsenm: 0,
        oeroded: 0,
        oeroded2: 0,
        oerodeproof: 0,
        owt: 10,
        age: 0,
        recharged: 0,
        oextra: null,
        onamelth: 0,
        globby: 0,
        how_lost: 0,
        ox: ux,
        oy: uy,
        nexthere: null,
    };
    const chest = {
        otyp: CHEST,
        oclass: 6,
        olocked: 0,
        obroken: 1,
        lknown: 0,
        cknown: 0,
        cobj: dagger,
        nexthere: null,
        nobj: null,
        quan: 1,
        owt: 100,
        ox: ux,
        oy: uy,
        o_id: 70021,
        where: OBJ_FLOOR,
        dknown: 1,
        bknown: 1,
        rknown: 0,
        known: 0,
        invlet: 0,
        oartifact: 0,
        no_charge: false,
        cursed: 0,
        blessed: 0,
        spe: 0,
        corpsenm: 0,
        oeroded: 0,
        oeroded2: 0,
        oerodeproof: 0,
        globby: 0,
        onamelth: 0,
        oextra: null,
        unpaid: 0,
        age: 0,
        recharged: 0,
    };
    dagger.ocontainer = chest;
    state.level.objects[ux][uy] = chest;

    // pickup.c:3601 accepts the container, then :3710 chooses the floor.
    state.nhDisplay.pushKey('y'.charCodeAt(0));
    state.nhDisplay.pushKey(13);
    for (let i = 0; i < 12; ++i) state.nhDisplay.pushKey(32);

    assert.equal(await dotip(state), ECMD_TIME);
    assert.equal(dagger.where, OBJ_FLOOR);
    assert.equal(dagger.cursed, 1);
    assert.equal(dagger.bknown, 1);
    assert.equal(dagger.nexthere, chest);
    assert.equal(state.u.uconduct.gnostic, 1);
    assert.match(state.nhDisplay.toplines, /black flash as a dagger hits the altar/u);
});

test('pickup.c tipcontainer resolves a quantum cat before checking its contents',
    async () => {
        // This seed reaches the live-cat branch after startup. The observer
        // must create the cat silently, consume the stored corpse, and leave
        // tipcontainer_checks with an empty, known box.
        const state = await heroOnCleanSquare(83001622);
        const { box, corpse } = quantumCatBox(state);
        clearTtyMessageWindow(state);

        state.nhDisplay.pushKey('y'.charCodeAt(0));
        state.nhDisplay.pushKey('-'.charCodeAt(0));
        for (let i = 0; i < 30; ++i) state.nhDisplay.pushKey(32);

        assert.equal(await dotip(state), ECMD_TIME);
        assert.equal(box.spe, 0);
        assert.equal(box.cknown, 1);
        assert.equal(box.cobj, null,
            'the live observation consumes the corpse from the box');
        assert.equal(corpse.where, OBJ_DELETED);
        let cat = null;
        for (let mon = state.level.monlist; mon; mon = mon.nmon) {
            if (mon.mnum === PM_HOUSECAT) cat = mon;
        }
        assert.ok(cat, 'makemon creates the live housecat');
        assert.equal(cat.mpeaceful, true);
        assert.equal(cat.minvent, null);
        assert.match(state.nhDisplay.toplines,
            /housecat inside the box is still alive/u);
        assert.deepEqual([...(state.unported ?? [])], []);
    });

test('pickup.c use_container observes a quantum box before opening its prompt',
    async () => {
        const state = await heroOnCleanSquare(83001622);
        const { box, corpse } = quantumCatBox(state);
        clearTtyMessageWindow(state);

        // Dismiss the source observation message, then quit its container
        // prompt. The observer still consumes this turn and marks the box
        // known before use_container enters the ordinary prompt loop.
        state.nhDisplay.pushKey(32);
        state.nhDisplay.pushKey('q'.charCodeAt(0));

        assert.equal(await use_container(box, false, false, state), ECMD_TIME);
        assert.equal(box.spe, 0);
        assert.equal(box.cknown, 1);
        assert.equal(box.cobj, null);
        assert.equal(corpse.where, OBJ_DELETED);
        assert.equal(state.gc.current_container, null);
        assert.deepEqual([...(state.unported ?? [])], []);
    });

test('pickup.c passes drop operations to the tipped horn floor path', async () => {
    const state = await heroOnCleanSquare();
    const { ux, uy } = state.u;
    state.level.at(ux, uy).typ = ALTAR;
    state.level.objects[ux][uy] = null;
    state.flags.invlet_constant = true;

    const horn = newObject({
        otyp: HORN_OF_PLENTY,
        oclass: state.objects[HORN_OF_PLENTY].oc_class,
        quan: 1,
        spe: 1,
        cursed: 1,
        where: OBJ_INVENT,
        invlet: 'a',
        owt: 25,
    });
    state.invent = horn;
    state.nhDisplay.pushKey('a'.charCodeAt(0));
    for (let i = 0; i < 16; ++i) state.nhDisplay.pushKey(32);

    // pickup.c:4016 calls hornoplenty() with a null target; its mkobj.c
    // floor path uses the display hooks supplied by this production caller.
    assert.equal(await dotip(state), ECMD_TIME);
    const spilled = state.level.objects[ux][uy];
    assert.equal(horn.spe, 0);
    assert.equal(spilled.where, OBJ_FLOOR);
    assert.equal(spilled.cursed, 1);
    assert.equal(spilled.bknown, 1);
    assert.match(state.nhDisplay.toplines, /black flash as .* hits the altar/u);
});
