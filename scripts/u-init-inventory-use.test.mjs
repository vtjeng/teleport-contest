import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ANTIMAGIC,
    BLINDED,
    DISPLACED,
    W_ARMC,
    W_ARMG,
    W_QUIVER,
    W_SWAPWEP,
    W_TOOL,
    W_WEP,
} from '../js/const.js';
import {
    ART_EYES_OF_THE_OVERWORLD,
    ART_OGRESMASHER,
    ART_SNICKERSNEE,
    ART_SUNSWORD,
    init_artifacts,
} from '../js/artifacts.js';
import { init_dungeons } from '../js/dungeon.js';
import { initoptions_finish } from '../js/fruit.js';
import { game, resetGame } from '../js/gstate.js';
import { reset_mvitals, monst_globals_init } from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import { objectGenerationHooks } from '../js/object_generation.js';
import * as O from '../js/objects.js';
import { role_init } from '../js/role_init.js';
import { initRng } from '../js/rng.js';
import { aligns, genders, races, roles, str2race, str2role } from '../js/roles.js';
import { u_init_misc } from '../js/u_init.js';
import { u_init_inventory_attrs } from '../js/u_init_inventory_attrs.js';
import {
    ini_inv_use_obj,
    use_initial_inventory,
} from '../js/u_init_inventory_use.js';
import {
    _wornInternals,
    set_twoweap,
    setnotworn,
    setuwep,
    setworn,
} from '../js/worn.js';

function startup(roleName, raceName = 'human', seed = 731_337) {
    resetGame();
    initRng(seed);
    game.context = { ident: 2 };
    game.moves = 0;
    game.flags = {
        initrole: str2role(roleName),
        initrace: str2race(raceName),
        initgend: genders.findIndex((gender) => gender.filecode === 'Mal'),
        initalign: aligns.findIndex((align) => align.filecode === 'Neu'),
        pantheon: -1,
    };
    // Choose the role's first valid alignment when neutral is unavailable.
    const role = roles[game.flags.initrole];
    const race = races[game.flags.initrace];
    if (!(role.allow & race.allow & aligns[game.flags.initalign].allow)) {
        game.flags.initalign = aligns.findIndex(
            (align) => role.allow & race.allow & align.allow,
        );
    }
    game.plname = 'InventoryUse';
    game.u = { uroleplay: {} };
    O.objects_globals_init(game);
    monst_globals_init(game);
    initoptions_finish({}, game);
    reset_mvitals(game);
    init_objects(game);
    role_init(game);
    init_dungeons(game);
    init_artifacts(game);
    u_init_misc(game, undefined, { now: new Date(2_000_000_000_000) });
    const hooks = objectGenerationHooks();
    u_init_inventory_attrs(game, undefined, { objectHooks: hooks });
    return { state: game, hooks };
}

function spellRecorder() {
    const types = [];
    return {
        types,
        initialSpell: (obj) => types.push(obj.otyp),
    };
}

function removalHooks(overrides = {}) {
    return {
        cancelDoff: () => {},
        monsterUnseesProperty: () => {},
        ...overrides,
    };
}

test('Healer inventory is used in final inventory-chain order', () => {
    const env = startup('Healer');
    const spells = spellRecorder();
    use_initial_inventory({ ...env, initialSpell: spells.initialSpell });

    assert.equal(game.uwep?.otyp, O.SCALPEL);
    assert.equal(game.uwep.owornmask, W_WEP);
    assert.equal(game.uarmg?.otyp, O.LEATHER_GLOVES);
    assert.equal(game.uarmg.owornmask, W_ARMG);
    assert.deepEqual(spells.types, [
        O.SPE_HEALING,
        O.SPE_EXTRA_HEALING,
        O.SPE_STONE_TO_FLESH,
    ]);
});

test('Ranger selects primary, alternate, quiver, and displacement cloak', () => {
    const env = startup('Ranger');
    use_initial_inventory({ ...env, initialSpell: () => {} });

    assert.equal(game.uwep?.otyp, O.DAGGER);
    assert.equal(game.uwep.owornmask, W_WEP);
    assert.equal(game.uswapwep?.otyp, O.BOW);
    assert.equal(game.uswapwep.owornmask, W_SWAPWEP);
    assert.equal(game.uquiver?.otyp, O.ARROW);
    assert.equal(game.uquiver.owornmask, W_QUIVER);
    assert.equal(game.uarmc?.otyp, O.CLOAK_OF_DISPLACEMENT);
    assert.equal(
        game.u.uprops[DISPLACED].extrinsic & W_ARMC,
        W_ARMC,
    );
});

test('Wizard cloak confers and removes its worn extrinsic', () => {
    const env = startup('Wizard');
    use_initial_inventory({ ...env, initialSpell: () => {} });

    const cloak = game.uarmc;
    assert.equal(cloak?.otyp, O.CLOAK_OF_MAGIC_RESISTANCE);
    assert.equal(game.u.uprops[ANTIMAGIC].extrinsic & W_ARMC, W_ARMC);
    assert.throws(
        () => setnotworn(cloak, env),
        /worn requires cancelDoff/,
    );
    assert.equal(game.uarmc, cloak);
    assert.equal(cloak.owornmask & W_ARMC, W_ARMC);
    assert.equal(game.u.uprops[ANTIMAGIC].extrinsic & W_ARMC, W_ARMC);

    setnotworn(cloak, {
        ...env,
        hooks: { ...env.hooks, ...removalHooks() },
    });
    assert.equal(game.uarmc, null);
    assert.equal(game.u.uprops[ANTIMAGIC].extrinsic & W_ARMC, 0);
    assert.equal(cloak.owornmask & W_ARMC, 0);
});

test('known described objects and oil lamps update discovery state', () => {
    const env = startup('Archeologist');
    const lamp = {
        otyp: O.OIL_LAMP,
        oclass: O.TOOL_CLASS,
        known: true,
        owornmask: 0,
        spe: 1,
    };
    assert.equal(Boolean(game.objects[O.POT_OIL].oc_name_known), false);
    ini_inv_use_obj(lamp, { ...env, initialSpell: () => {} });
    assert.equal(Boolean(game.objects[O.OIL_LAMP].oc_name_known), true);
    assert.equal(Boolean(game.objects[O.POT_OIL].oc_name_known), true);
    assert.equal(Boolean(game.objects[O.POT_OIL].oc_encountered), true);
});

test('nonweapon artifacts still receive wielded artifact intrinsics', () => {
    const env = startup('Archeologist');
    const potionArtifact = {
        otyp: O.POT_HEALING,
        oclass: O.POTION_CLASS,
        oartifact: ART_EYES_OF_THE_OVERWORLD,
        owornmask: 0,
        spe: 0,
    };
    const calls = [];

    setworn(potionArtifact, W_WEP, {
        ...env,
        hooks: {
            ...env.hooks,
            setArtifactIntrinsic: (obj, on, mask) => {
                calls.push({ obj, on, mask, worn: obj.owornmask });
            },
        },
    });

    assert.deepEqual(calls, [{
        obj: potionArtifact,
        on: true,
        mask: W_WEP,
        worn: W_WEP,
    }]);
    // A nonweapon wielded with only W_WEP does not confer its base oc_oprop.
    assert.equal(game.u.uprops[0].extrinsic & W_WEP, 0);
});

test('setnotworn preserves cancellation, property, artifact, and block order', () => {
    const env = startup('Monk');
    const eyes = {
        otyp: O.LENSES,
        oclass: O.TOOL_CLASS,
        oartifact: ART_EYES_OF_THE_OVERWORLD,
        owornmask: 0,
        spe: 0,
    };
    const events = [];
    const hooks = {
        ...env.hooks,
        cancelDoff: (obj, mask) => events.push({
            kind: 'cancel',
            mask,
            slotted: game.ublindf === obj,
            worn: obj.owornmask,
            blocked: game.u.uprops[BLINDED].blocked,
        }),
        monsterUnseesProperty: (propertyIndex) => events.push({
            kind: 'monster',
            propertyIndex,
            slotted: game.ublindf === eyes,
            worn: eyes.owornmask,
            blocked: game.u.uprops[BLINDED].blocked,
        }),
        setArtifactIntrinsic: (obj, on, mask) => events.push({
            kind: on ? 'artifact-on' : 'artifact-off',
            mask,
            slotted: game.ublindf === obj,
            worn: obj.owornmask,
            blocked: game.u.uprops[BLINDED].blocked,
        }),
    };

    setworn(eyes, W_TOOL, { ...env, hooks });
    assert.equal(game.u.uprops[BLINDED].blocked & W_TOOL, W_TOOL);
    events.length = 0;
    setnotworn(eyes, { ...env, hooks });

    assert.deepEqual(events, [
        {
            kind: 'cancel',
            mask: W_TOOL,
            slotted: true,
            worn: W_TOOL,
            blocked: W_TOOL,
        },
        {
            kind: 'monster',
            propertyIndex: 0,
            slotted: false,
            worn: W_TOOL,
            blocked: W_TOOL,
        },
        {
            kind: 'artifact-off',
            mask: W_TOOL,
            slotted: false,
            worn: 0,
            blocked: W_TOOL,
        },
    ]);
    assert.equal(game.u.uprops[BLINDED].blocked & W_TOOL, 0);
});

test('setworn replacement preserves its distinct old-object source order', () => {
    const env = startup('Monk');
    const eyes = {
        otyp: O.LENSES,
        oclass: O.TOOL_CLASS,
        oartifact: ART_EYES_OF_THE_OVERWORLD,
        owornmask: 0,
        spe: 0,
    };
    const blindfold = {
        otyp: O.BLINDFOLD,
        oclass: O.TOOL_CLASS,
        oartifact: 0,
        owornmask: 0,
        spe: 0,
    };
    const events = [];
    const hooks = {
        ...env.hooks,
        cancelDoff: (obj) => events.push({
            kind: 'cancel',
            slotted: game.ublindf === obj,
            worn: obj.owornmask,
            blocked: game.u.uprops[BLINDED].blocked,
        }),
        monsterUnseesProperty: () => events.push({
            kind: 'monster',
            slotted: game.ublindf === eyes,
            worn: eyes.owornmask,
            blocked: game.u.uprops[BLINDED].blocked,
        }),
        setArtifactIntrinsic: (obj, on) => events.push({
            kind: on ? 'artifact-on' : 'artifact-off',
            slotted: game.ublindf === obj,
            worn: obj.owornmask,
            blocked: game.u.uprops[BLINDED].blocked,
        }),
    };

    setworn(eyes, W_TOOL, { ...env, hooks });
    events.length = 0;
    setworn(blindfold, W_TOOL, { ...env, hooks });

    assert.deepEqual(events, [
        { kind: 'monster', slotted: true, worn: 0, blocked: W_TOOL },
        { kind: 'artifact-off', slotted: true, worn: 0, blocked: 0 },
        { kind: 'cancel', slotted: true, worn: 0, blocked: 0 },
    ]);
    assert.equal(game.ublindf, blindfold);
    assert.equal(blindfold.owornmask & W_TOOL, W_TOOL);
});

test('set_twoweap dirties weapon status only when its value changes', () => {
    startup('Rogue');
    game.flags.weaponstatus = true;
    game.disp = { botl: false };

    assert.equal(set_twoweap(true, game), true);
    assert.equal(game.disp.botl, true);
    game.disp.botl = false;
    assert.equal(set_twoweap(true, game), true);
    assert.equal(game.disp.botl, false);
});

test('setworn forwards the caller mask and inspects the old full worn mask', () => {
    const env = startup('Rogue');
    const artifact = {
        otyp: O.DAGGER,
        oclass: O.WEAPON_CLASS,
        oartifact: ART_SUNSWORD,
        owornmask: 0,
        spe: 0,
        lamplit: false,
    };
    const artifactMasks = [];
    const combinedMask = W_WEP | W_SWAPWEP;
    const hooks = {
        ...env.hooks,
        cancelDoff: () => {},
        setArtifactIntrinsic: (obj, on, mask) => {
            artifactMasks.push({ obj, on, mask });
        },
    };

    setworn(artifact, combinedMask, { ...env, hooks });
    assert.deepEqual(artifactMasks, [{
        obj: artifact,
        on: true,
        mask: combinedMask,
    }]);
    assert.equal(artifact.owornmask, combinedMask);

    game.u.twoweap = true;
    setworn(null, W_SWAPWEP, { ...env, hooks });
    assert.equal(game.u.twoweap, false);
    assert.equal(game.uwep, artifact);
    assert.equal(artifact.owornmask, W_WEP);
});

test('setuwep handles Ogresmasher, Sunsword, and Snickersnee source branches', () => {
    let env = startup('Rogue');
    game.flags.weaponstatus = false;
    game.disp = { botl: false };
    const ogresmasher = {
        otyp: O.WAR_HAMMER,
        oclass: O.WEAPON_CLASS,
        oartifact: ART_OGRESMASHER,
        owornmask: 0,
        spe: 0,
        lamplit: false,
    };
    setuwep(ogresmasher, {
        ...env,
        hooks: { ...env.hooks, setArtifactIntrinsic: () => {} },
    });
    assert.equal(game.disp.botl, true);

    env = startup('Samurai');
    const snickersnee = {
        otyp: O.KATANA,
        oclass: O.WEAPON_CLASS,
        oartifact: ART_SNICKERSNEE,
        owornmask: 0,
        spe: 0,
        lamplit: false,
    };
    setuwep(snickersnee, {
        ...env,
        hooks: { ...env.hooks, setArtifactIntrinsic: () => {} },
    });
    assert.equal(_wornInternals.isPole(snickersnee, game), true);
    assert.equal(game.unweapon, false);

    env = startup('Knight');
    const sunsword = {
        otyp: O.LONG_SWORD,
        oclass: O.WEAPON_CLASS,
        oartifact: ART_SUNSWORD,
        owornmask: 0,
        spe: 0,
        lamplit: true,
    };
    const dagger = {
        otyp: O.DAGGER,
        oclass: O.WEAPON_CLASS,
        oartifact: 0,
        owornmask: 0,
        spe: 0,
        lamplit: false,
    };
    const events = [];
    const artifactHook = (obj, on) => {
        events.push(on ? 'artifact-on' : 'artifact-off');
    };
    setuwep(sunsword, {
        ...env,
        hooks: { ...env.hooks, setArtifactIntrinsic: artifactHook },
    });
    events.length = 0;
    assert.throws(
        () => setuwep(dagger, {
            ...env,
            hooks: { ...env.hooks, setArtifactIntrinsic: artifactHook },
        }),
        /worn requires endArtifactLight/,
    );
    assert.equal(game.uwep, sunsword);
    assert.equal(sunsword.owornmask & W_WEP, W_WEP);

    const hooks = {
        ...env.hooks,
        ...removalHooks({
            cancelDoff: () => events.push('cancel'),
            monsterUnseesProperty: () => events.push('monster'),
        }),
        setArtifactIntrinsic: artifactHook,
        endArtifactLight: (obj) => {
            events.push('end-light');
            assert.equal(game.uwep, dagger);
            assert.equal(obj.owornmask & W_WEP, 0);
            obj.lamplit = false;
        },
    };
    setuwep(dagger, { ...env, hooks });
    assert.deepEqual(events, [
        'monster',
        'artifact-off',
        'cancel',
        'end-light',
    ]);
    assert.equal(sunsword.lamplit, false);
    assert.equal(game.uwep, dagger);
});
