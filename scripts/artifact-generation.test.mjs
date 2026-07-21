import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ART_FIRE_BRAND,
    ART_FROST_BRAND,
    ART_GIANTSLAYER,
    ART_GRIMTOOTH,
    ART_ORCRIST,
    ART_SUNSWORD,
    ART_VORPAL_BLADE,
    artifactCount,
    artifact_exists,
    exist_artifact,
    init_artifacts,
    isPermanentlyPoisoned,
    makeArtifact,
    mk_artifact,
    nartifact_exist,
    permapoisoned,
} from '../js/artifacts.js';
import {
    A_LAWFUL,
    A_NONE,
    NON_PM,
    OBJ_FREE,
    ONAME_BONES,
    ONAME_GIFT,
    ONAME_KNOW_ARTI,
    ONAME_LEVEL_DEF,
    ONAME_NO_FLAGS,
    ONAME_RANDOM,
    ONAME_VIA_DIP,
    ONAME_VIA_NAMING,
    ONAME_WISH,
} from '../js/const.js';
import { mksobj, newObject } from '../js/obj.js';
import {
    ELVEN_BROADSWORD,
    LONG_SWORD,
    ORCISH_DAGGER,
    SILVER_MACE,
    WEAPON_CLASS,
    objects_globals_init,
} from '../js/objects.js';
import { aligns, races, roles } from '../js/roles.js';

function stateFor(filecode, alignmentName, raceName = 'human') {
    const role = roles.find((candidate) => candidate.filecode === filecode);
    const alignmentIndex = aligns.findIndex(
        (alignment) => alignment.name === alignmentName,
    );
    const race = races.find((candidate) => candidate.noun === raceName);
    const state = {
        // New-game ids start at 2 and the first playable turn is move 1.
        context: { ident: 2 },
        flags: { initalign: alignmentIndex },
        moves: 1,
        // Artifact selection observes the initial no-gifts, level-1 state.
        u: { ugifts: 0, ulevel: 1 },
        urole: { ...role },
        urace: { ...race },
    };
    objects_globals_init(state);
    init_artifacts(state);
    return state;
}

function scriptedRandom(expectedCalls) {
    const remaining = [...expectedCalls];
    const draw = (name, bound) => {
        const expected = remaining.shift();
        assert.ok(expected, `unexpected ${name}(${bound})`);
        assert.deepEqual(
            [name, bound],
            expected.slice(0, 2),
            `wrong RNG call before scripted result ${expected[2]}`,
        );
        return expected[2];
    };
    return {
        random: {
            rn2: (bound) => draw('rn2', bound),
            rnd: (bound) => draw('rnd', bound),
            rn1: (range, base) => draw('rn1', `${range},${base}`),
            rne: (bound) => draw('rne', bound),
        },
        done() {
            assert.deepEqual(remaining, [], 'scripted RNG calls remain');
        },
    };
}

function bareWeapon(otyp, overrides = {}) {
    return newObject({
        // A nonzero age makes artifact_exists()'s reset visible.
        age: 47,
        oclass: WEAPON_CLASS,
        otyp,
        quan: 1,
        where: OBJ_FREE,
        ...overrides,
    });
}

test('artifact origin flags reserve bit 0 exactly as pinned hack.h', () => {
    assert.deepEqual(
        [
            ONAME_NO_FLAGS,
            ONAME_VIA_NAMING,
            ONAME_WISH,
            ONAME_GIFT,
            ONAME_VIA_DIP,
            ONAME_LEVEL_DEF,
            ONAME_BONES,
            ONAME_RANDOM,
            ONAME_KNOW_ARTI,
        ],
        // 0x0001 is artiexist.exists, so provenance begins at 0x0002.
        [0x0000, 0x0002, 0x0004, 0x0008, 0x0010,
            0x0020, 0x0040, 0x0080, 0x0100],
    );
});

test('existing-object selection keeps source order and mutation boundaries', () => {
    const state = stateFor('Kni', 'lawful');
    // LONG_SWORD has five random candidates after NOGEN Excalibur is skipped:
    // Frost Brand, Fire Brand, Giantslayer, Vorpal Blade, then Sunsword.
    const script = scriptedRandom([['rn2', 5, 2]]);
    const obj = bareWeapon(LONG_SWORD, {
        oeroded: 2,
        oeroded2: 3,
        oextra: { retained: 'other extra data' },
        owt: 40,
        // +8 plus Giantslayer's +2 would reach +10, outside the accepted
        // [-10,+9] artifact-adjustment range, so source leaves +8 intact.
        spe: 8,
    });

    const result = mk_artifact(obj, A_NONE, 99, true, {
        state,
        random: script.random,
    });
    script.done();

    assert.equal(result, obj);
    assert.equal(obj.oartifact, ART_GIANTSLAYER);
    assert.equal(obj.oextra.oname, 'Giantslayer');
    assert.equal(obj.oextra.retained, 'other extra data');
    assert.equal(obj.age, 0);
    assert.equal(obj.oeroded, 0);
    assert.equal(obj.oeroded2, 0);
    assert.equal(obj.spe, 8);
    // mk_artifact() does not recalculate weight; mksobj() owns that final step.
    assert.equal(obj.owt, 40);
    assert.equal(state.artiexist[ART_GIANTSLAYER].exists, 1);
    assert.equal(state.artiexist[ART_GIANTSLAYER].rndm, 1);
    assert.equal(state.artiexist[ART_GIANTSLAYER].found, 0);
    assert.equal(nartifact_exist(state), 1);
    assert.equal(artifactCount({ state }), 1);
});

test('A_NONE conversion ignores SPFX_RESTR, role, and hostile race filters', () => {
    const orcWizard = stateFor('Wiz', 'chaotic', 'orc');
    // Orcrist is SPFX_RESTR and elf-linked; both restrictions apply to gifts,
    // not conversion of an existing elven broadsword.
    const raceScript = scriptedRandom([['rn2', 1, 0]]);
    const orcrist = makeArtifact(bareWeapon(ELVEN_BROADSWORD, { spe: 1 }), {
        alignment: A_NONE,
        maxGiftValue: 99,
        adjustSpe: true,
        env: { state: orcWizard, random: raceScript.random },
    });
    raceScript.done();
    assert.equal(orcrist.oartifact, ART_ORCRIST);
    assert.equal(orcrist.spe, 4);

    const humanWizard = stateFor('Wiz', 'neutral');
    // Demonbane is Priest-specific, but max 99 does not invoke gift filtering
    // and random existing-object conversion therefore remains eligible.
    const roleScript = scriptedRandom([['rn2', 1, 0]]);
    const demonbane = mk_artifact(
        bareWeapon(SILVER_MACE, { spe: 2 }),
        A_NONE,
        99,
        false,
        { state: humanWizard, random: roleScript.random },
    );
    roleScript.done();
    assert.equal(demonbane.oextra.oname, 'Demonbane');
    assert.equal(demonbane.spe, 2);
});

test('gift-value cap keeps its role exception before type matching', () => {
    const wizard = stateFor('Wiz', 'neutral');
    const noDraw = scriptedRandom([]);
    const rejected = bareWeapon(SILVER_MACE);
    // Demonbane's gift value is 3. A non-Priest at cap 2 gets no candidate.
    assert.equal(
        mk_artifact(rejected, A_NONE, 2, true, {
            state: wizard,
            random: noDraw.random,
        }),
        rejected,
    );
    noDraw.done();
    assert.equal(rejected.oartifact, 0);

    const priest = stateFor('Pri', 'neutral');
    const roleDraw = scriptedRandom([['rn2', 1, 0]]);
    // Role_if(PM_CLERIC) bypasses that same cap in the source loop.
    const accepted = mk_artifact(
        bareWeapon(SILVER_MACE),
        A_NONE,
        2,
        true,
        { state: priest, random: roleDraw.random },
    );
    roleDraw.done();
    assert.equal(accepted.oextra.oname, 'Demonbane');
});

test('NOGEN-only remainder yields no candidate and consumes no RNG', () => {
    const state = stateFor('Kni', 'lawful');
    // Mark every random LONG_SWORD artifact as existing. Excalibur remains,
    // but SPFX_NOGEN excludes it even for a Knight.
    for (const index of [
        ART_FROST_BRAND,
        ART_FIRE_BRAND,
        ART_GIANTSLAYER,
        ART_VORPAL_BLADE,
        ART_SUNSWORD,
    ]) {
        state.artiexist[index].exists = 1;
    }
    const script = scriptedRandom([]);
    const obj = bareWeapon(LONG_SWORD, { oeroded: 2, spe: -3 });

    assert.equal(
        mk_artifact(obj, A_NONE, 99, true, {
            state,
            random: script.random,
        }),
        obj,
    );
    script.done();
    assert.equal(obj.oartifact, 0);
    assert.equal(obj.oextra, null);
    assert.equal(obj.oeroded, 2);
    assert.equal(obj.spe, -3);
});

test('a unique base object rejects every matching artifact before RNG', () => {
    const state = stateFor('Wiz', 'neutral', 'elf');
    // Isolate mk_artifact()'s source `unique` gate on an otherwise ordinary
    // artifact base type; the mutable per-game catalog permits this fixture.
    state.objects[ELVEN_BROADSWORD].oc_unique = 1;
    const script = scriptedRandom([]);
    const obj = bareWeapon(ELVEN_BROADSWORD);

    mk_artifact(obj, A_NONE, 99, true, {
        state,
        random: script.random,
    });
    script.done();
    assert.equal(obj.oartifact, 0);
    assert.equal(obj.oextra, null);
});

test('existence tracking prevents duplicates and supports exact uncreation', () => {
    const state = stateFor('Wiz', 'neutral', 'elf');
    const firstDraw = scriptedRandom([['rn2', 1, 0]]);
    const first = mk_artifact(
        bareWeapon(ELVEN_BROADSWORD),
        A_NONE,
        99,
        false,
        { state, random: firstDraw.random },
    );
    firstDraw.done();
    assert.equal(exist_artifact(ELVEN_BROADSWORD, 'Orcrist', state), true);

    const noDuplicateDraw = scriptedRandom([]);
    const second = bareWeapon(ELVEN_BROADSWORD, { age: 91, oeroded: 1 });
    mk_artifact(second, A_NONE, 99, false, {
        state,
        random: noDuplicateDraw.random,
    });
    noDuplicateDraw.done();
    assert.equal(second.oartifact, 0);
    assert.equal(second.oextra, null);
    assert.equal(second.age, 91);
    assert.equal(second.oeroded, 1);

    artifact_exists(first, 'Orcrist', false, ONAME_NO_FLAGS, state);
    assert.equal(first.oartifact, 0);
    assert.equal(first.age, 0);
    assert.equal(exist_artifact(ELVEN_BROADSWORD, 'Orcrist', state), false);
    assert.equal(nartifact_exist(state), 0);
});

test('Grimtooth receives permanent poison during artifact conversion', () => {
    const state = stateFor('Wiz', 'chaotic', 'elf');
    const script = scriptedRandom([['rn2', 1, 0]]);
    const obj = mk_artifact(
        bareWeapon(ORCISH_DAGGER),
        A_NONE,
        99,
        true,
        { state, random: script.random },
    );
    script.done();

    assert.equal(obj.oartifact, ART_GRIMTOOTH);
    assert.equal(obj.opoisoned, true);
    assert.equal(permapoisoned(obj), true);
    assert.equal(isPermanentlyPoisoned(obj), true);
    assert.equal(permapoisoned(null), false);
});

test('obj.js hooks preserve generation order and finalize artifact weight', () => {
    const state = stateFor('Wiz', 'neutral', 'orc');
    const script = scriptedRandom([
        // next_ident(): object id increments by rnd(2).
        ['rnd', 2, 1],
        // Ordinary weapon BUC path: miss +spe, miss -spe, no bless/curse.
        ['rn2', 11, 1],
        ['rn2', 10, 1],
        ['rn2', 10, 1],
        // First artifact gate is rn2(20 + 10 * nartifact_exist()).
        ['rn2', 20, 0],
        // Orcrist is the sole ELVEN_BROADSWORD candidate.
        ['rn2', 1, 0],
    ]);
    const hooks = {
        artifactCount,
        isPermanentlyPoisoned,
        makeArtifact,
    };

    const obj = mksobj(ELVEN_BROADSWORD, true, true, {
        state,
        random: script.random,
        hooks,
    });
    script.done();

    assert.equal(obj.oartifact, ART_ORCRIST);
    assert.equal(obj.oextra.oname, 'Orcrist');
    assert.equal(obj.spe, 3);
    assert.equal(obj.age, 0);
    assert.equal(obj.owt, state.objects[ELVEN_BROADSWORD].oc_weight);
    assert.equal(obj.corpsenm, NON_PM);
});

test('aligned gift branch fails before consuming existing-object RNG', () => {
    const state = stateFor('Kni', 'lawful');
    const script = scriptedRandom([]);
    assert.throws(
        () => mk_artifact(
            bareWeapon(LONG_SWORD),
            A_LAWFUL,
            99,
            true,
            { state, random: script.random },
        ),
        /aligned mk_artifact gifts are not implemented/,
    );
    script.done();
});
