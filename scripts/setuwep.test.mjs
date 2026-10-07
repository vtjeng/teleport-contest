import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ART_OGRESMASHER, ART_SNICKERSNEE, ART_SUNSWORD, init_artifacts } from '../js/artifacts.js';
import { BLINDED, LAST_PROP, LS_OBJECT, OBJ_INVENT, W_ARM, W_WEP } from '../js/const.js';
import { light_globals_init, new_light_source } from '../js/light.js';
import { PM_WIZARD } from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import { newObject } from '../js/obj.js';
import { DAGGER, GOLD_DRAGON_SCALE_MAIL, KATANA, LONG_SWORD, PARTISAN, TOWEL, WAR_HAMMER, objects_globals_init } from '../js/objects.js';
import { setuwep } from '../js/wield.js';

const source = readFileSync(new URL('../nethack-c/upstream/src/wield.c', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('setuwep(struct obj *obj)'), source.indexOf('staticfn boolean\ncant_wield_corpse'));

function hero() {
    const state = {
        u: { uprops: Array.from({ length: LAST_PROP + 1 }, () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 })), usteed: null },
        disp: { botl: false },
        flags: { initalign: 1 }, urole: { mnum: PM_WIZARD }, iflags: {}, program_state: { in_moveloop: true },
        unweapon: false,
    };
    objects_globals_init(state);
    // Preserve source object types without introducing game RNG in the fixture.
    init_objects(state, () => 0);
    light_globals_init(state);
    init_artifacts(state);
    state.artiexist[ART_SUNSWORD].exists = 1;
    state.artiexist[ART_SUNSWORD].found = 1;
    return state;
}
function object(state, otyp, extra = {}) {
    return newObject({ otyp, oclass: state.objects[otyp].oc_class, quan: 1, where: OBJ_INVENT, owornmask: 0, ...extra });
}
function equip(state, otyp = LONG_SWORD, extra = {}) {
    const old = object(state, otyp, { oartifact: ART_SUNSWORD, lamplit: true, owornmask: W_WEP, ...extra });
    state.uwep = old;
    state.invent = old;
    if (old.lamplit) new_light_source(1, 1, 2, LS_OBJECT, old, state); // A radius-two object light lets shutdown prove actual removal.
    return old;
}
function env(state, message) {
    return { state, message, hooks: { cancelDoff: () => {}, monsterUnseesProperty: () => {}, setArtifactIntrinsic: () => {} } };
}

test('source pins slot, burn, blind message, and unweapon order', () => {
    assert.ok(body.indexOf('setworn(obj, W_WEP)') < body.indexOf('end_burn(olduwep, FALSE)'));
    assert.ok(body.indexOf('end_burn(olduwep, FALSE)') < body.indexOf('if (!Blind)'));
    assert.ok(body.indexOf('Tobjnam(olduwep, "stop")') < body.indexOf('gu.unweapon ='));
    assert.match(body, /if \(obj == uwep\)\s+return/u);
});

test('Sunsword shutdown clears slot and light before awaiting the message', async () => {
    const state = hero();
    const old = equip(state);
    let release;
    const suspended = new Promise(resolve => { release = resolve; });
    const pending = setuwep(null, env(state, async text => {
        assert.equal(text, 'The long sword stops shining.');
        assert.equal(state.uwep, null);
        assert.equal(old.owornmask & W_WEP, 0);
        assert.equal(old.lamplit, false);
        assert.equal(state.gl.light_base, null);
        assert.equal(state.unweapon, false); // C computes this only after pline has finished.
        await suspended;
    }));
    assert.equal(old.lamplit, false);
    assert.equal(state.unweapon, false);
    release();
    await pending;
    assert.equal(state.unweapon, true);
});

test('blind artifact shutdown is silent and identical-object assignment does nothing', async () => {
    const state = hero();
    const old = equip(state);
    state.u.uprops[BLINDED].intrinsic = 1; // youprop.h Blind: a positive intrinsic suppresses pline.
    const quiet = env(state, () => { throw Error('blind path printed'); });
    await setuwep(old, quiet);
    assert.equal(old.lamplit, true);
    assert.equal(state.unweapon, false);
    await setuwep(null, quiet);
    assert.equal(old.lamplit, false);
    assert.equal(state.unweapon, true);
});

test('unlit artifacts and lit nonartifacts remain outside the shutdown branch', async () => {
    for (const extra of [{ lamplit: false }, { oartifact: 0 }]) {
        const state = hero();
        const old = equip(state, LONG_SWORD, extra);
        await setuwep(null, env(state, () => { throw Error('outside artifact/light gate'); }));
        assert.equal(old.lamplit, extra.lamplit ?? true);
        assert.equal(state.unweapon, true);
    }
});

test('gold scale armor retains its armor light classification after weapon-slot removal', async () => {
    const state = hero();
    const old = equip(state, GOLD_DRAGON_SCALE_MAIL, { oartifact: 0, owornmask: W_ARM | W_WEP });
    state.uarm = old;
    const messages = [];
    await setuwep(null, env(state, text => { messages.push(text); }));
    assert.equal(old.owornmask, W_ARM);
    assert.equal(old.lamplit, false);
    assert.equal(messages.length, 1); // artifact.c artifact_light includes gold scale mail still worn as armor.
});

test('Ogresmasher status dirties and source unweapon exceptions survive replacement', async () => {
    const state = hero();
    const ogre = object(state, WAR_HAMMER, { oartifact: ART_OGRESMASHER });
    await setuwep(ogre, env(state));
    assert.equal(state.disp.botl, true);
    state.disp.botl = false;
    const dagger = object(state, DAGGER);
    await setuwep(dagger, env(state));
    assert.equal(state.disp.botl, true);
    assert.equal(state.unweapon, false);
    // wield.c's explicit exception keeps Snickersnee usable as a weapon even
    // though obj.h is_pole includes this artifact.
    await setuwep(object(state, KATANA, { oartifact: ART_SNICKERSNEE }), env(state));
    assert.equal(state.unweapon, false);
    await setuwep(object(state, PARTISAN), env(state));
    assert.equal(state.unweapon, true);
    state.u.usteed = {}; // The same polearm is a weapon when mounted.
    await setuwep(object(state, PARTISAN), env(state));
    assert.equal(state.unweapon, false);
    await setuwep(object(state, TOWEL, { spe: 1 }), env(state)); // obj.h is_wet_towel requires spe > 0.
    assert.equal(state.unweapon, false);
    await setuwep(object(state, TOWEL, { spe: 0 }), env(state));
    assert.equal(state.unweapon, true);
});

test('incoming Ogresmasher status and burn inventory refresh precede the light message', async () => {
    const state = hero();
    const old = equip(state);
    const incoming = object(state, WAR_HAMMER, { oartifact: ART_OGRESMASHER });
    const events = [];
    const options = env(state, () => {
        events.push('message');
        assert.equal(state.disp.botl, true);
        assert.equal(state.uwep, incoming);
        assert.equal(old.lamplit, false);
    });
    options.hooks.updateInventory = () => {
        // worn.c:setworn refreshes inventory before setuwep's first botl
        // mark; timeout.c:end_burn refreshes it again after clearing lamplit.
        events.push(old.lamplit ? 'slot-inventory' : 'burn-inventory');
        assert.equal(state.disp.botl, !old.lamplit);
        assert.equal(state.uwep, incoming);
        if (!old.lamplit) assert.equal(state.gl.light_base, null);
    };
    await setuwep(incoming, options);
    assert.deepEqual(events, ['slot-inventory', 'burn-inventory', 'message']);
});
