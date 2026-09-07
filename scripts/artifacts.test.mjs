import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ARTILIST_TEMPLATE,
    ART_DEMONBANE,
    ART_EXCALIBUR,
    ART_EYE_OF_THE_AETHIOPICA,
    ART_GRIMTOOTH,
    ART_MAGICBANE,
    ART_MAGIC_MIRROR_OF_MERLIN,
    ART_MASTER_KEY_OF_THIEVERY,
    ART_MITRE_OF_HOLINESS,
    ART_ORCRIST,
    ART_STING,
    ART_SUNSWORD,
    ART_FROST_BRAND,
    ART_GRAYSWANDIR,
    ART_HEART_OF_AHRIMAN,
    ART_ORB_OF_DETECTION,
    ART_ORB_OF_FATE,
    ART_SCEPTRE_OF_MIGHT,
    ART_STORMBRINGER,
    ART_VORPAL_BLADE,
    ART_WEREBANE,
    AFTER_LAST_ARTIFACT,
    NROFARTIFACTS,
    UnsupportedArtifactDisplayError,
    artifactTouchable,
    artifact_defends,
    artifact_light,
    artifact_name,
    confers_luck,
    count_surround_traps,
    has_magic_key,
    is_art,
    is_magic_key,
    set_artifact_intrinsic,
    shade_glare,
    createArtifactTable,
    init_artifacts,
    touch_artifact,
} from '../js/artifacts.js';
import {
    A_CHAOTIC, A_LAWFUL, A_NEUTRAL, A_NONE, ANTIMAGIC, ENERGY_REGENERATION,
    HALF_PHDAM, HALF_SPDAM, HALLUC, HALLUC_RES, LAST_PROP, NON_PM,
    W_ARM, W_ARMC, W_ART, W_WEP,
} from '../js/const.js';
import {
    AD_FIRE,
    AD_MAGM,
    M2_DEMON,
    M3_COVETOUS,
    PM_ELF,
    PM_KITTEN,
    PM_ORC,
    PM_WEREWOLF,
    PM_WIZARD,
} from '../js/monsters.js';
import {
    objects_globals_init,
    CRYSTAL_BALL,
    GOLD_DRAGON_SCALES,
    GOLD_DRAGON_SCALE_MAIL,
    LONG_SWORD,
    LUCKSTONE,
    ORCISH_DAGGER,
    SILVER_DRAGON_SCALE_MAIL,
    SILVER_SABER,
} from '../js/objects.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import {
    ROLE_ALIGNMASK,
    ROLE_ALIGNS,
    ROLE_RACEMASK,
    aligns,
    races,
    roles,
} from '../js/roles.js';

const ARTI_INFO_FIELDS = [
    'exists', 'found', 'gift', 'wish', 'named',
    'viadip', 'lvldef', 'bones', 'rndm',
];

function stateFor(filecode, alignmentName, raceName = 'human') {
    const role = roles.find((candidate) => candidate.filecode === filecode);
    const alignmentIndex = aligns.findIndex(
        (alignment) => alignment.name === alignmentName,
    );
    const race = races.find((candidate) => candidate.noun === raceName);
    return {
        flags: { initalign: alignmentIndex },
        urole: { ...role },
        urace: { ...race },
    };
}

test('artifact defense distinguishes wielded and carried records', () => {
    const state = { artilist: ARTILIST_TEMPLATE };
    const magicbane = { oartifact: ART_MAGICBANE };
    const mitre = { oartifact: ART_MITRE_OF_HOLINESS };

    assert.equal(artifact_defends(magicbane, AD_MAGM, state), true);
    assert.equal(artifact_defends(magicbane, AD_FIRE, state), false);
    assert.equal(artifact_defends(mitre, AD_FIRE, state, true), true);
    assert.equal(artifact_defends(mitre, AD_FIRE, state), false);
});

test('artilist matches the complete pinned NetHack 5.0 source table', () => {
    assert.equal(NROFARTIFACTS, 33);
    assert.equal(AFTER_LAST_ARTIFACT, 34);
    // 35 records cover the dummy entry, 33 artifacts, and the otyp-zero
    // terminator from artilist.h.
    assert.equal(ARTILIST_TEMPLATE.length, 35);
    assert.equal(ARTILIST_TEMPLATE[0].name, '');
    assert.equal(ARTILIST_TEMPLATE[AFTER_LAST_ARTIFACT].name, null);
    assert.equal(ARTILIST_TEMPLATE[AFTER_LAST_ARTIFACT].otyp, 0);

    const digest = createHash('sha256')
        .update(JSON.stringify(ARTILIST_TEMPLATE))
        .digest('hex');
    // This digest was independently produced from all fields of all 35
    // records in the pinned recorder binary's artilist source dump.
    assert.equal(
        digest,
        '12810d79031936abbbdc0f8342d82e823e8b0c66ab0de7de6f0c71aebb598823',
    );

    assert.equal(Object.isFrozen(ARTILIST_TEMPLATE), true);
    assert.equal(Object.isFrozen(ARTILIST_TEMPLATE[ART_EXCALIBUR]), true);
    assert.equal(Object.isFrozen(ARTILIST_TEMPLATE[ART_EXCALIBUR].attk), true);
});

test('createArtifactTable deeply clones every mutable artifact record', () => {
    const first = createArtifactTable();
    const second = createArtifactTable();

    assert.deepEqual(first, ARTILIST_TEMPLATE);
    assert.deepEqual(second, ARTILIST_TEMPLATE);
    for (let index = 0; index < first.length; ++index) {
        assert.notEqual(first[index], second[index]);
        assert.notEqual(first[index].attk, second[index].attk);
        assert.notEqual(first[index].defn, second[index].defn);
        assert.notEqual(first[index].cary, second[index].cary);
    }

    // Mutate both a scalar and a nested attack field to exercise the two
    // levels that hack_artifacts() and later artifact combat code can change.
    first[ART_EXCALIBUR].alignment = -99;
    first[ART_EXCALIBUR].attk.damd = 99;
    assert.deepEqual(second, ARTILIST_TEMPLATE);
});

test('init_artifacts clears source-shaped tracking arrays without RNG', () => {
    const state = stateFor('Hea', 'neutral');
    // An arbitrary nonzero seed makes an accidental draw visible in the log.
    initRng(271828);
    enableRngLog();
    init_artifacts(state);

    assert.deepEqual(getRngLog(), []);
    assert.equal(state.artiexist.length, NROFARTIFACTS + 1);
    assert.equal(state.artidisco.length, NROFARTIFACTS);
    assert.deepEqual(state.artidisco, Array(NROFARTIFACTS).fill(0));
    for (const info of state.artiexist) {
        assert.deepEqual(Object.keys(info), ARTI_INFO_FIELDS);
        assert.ok(ARTI_INFO_FIELDS.every((field) => info[field] === 0));
    }
    assert.notEqual(state.artiexist[0], state.artiexist[1]);
});

test('hack_artifacts applies role fixups in C evaluation order', () => {
    for (const role of roles) {
        for (let alignIndex = 0; alignIndex < ROLE_ALIGNS; ++alignIndex) {
            const alignment = aligns[alignIndex];
            if (!(role.allow & alignment.allow & ROLE_ALIGNMASK)) continue;

            const race = races.find(
                (candidate) => role.allow & candidate.allow & ROLE_RACEMASK,
            );
            const state = {
                flags: { initalign: alignIndex },
                urole: { ...role },
                urace: { ...race },
            };
            init_artifacts(state);

            for (let index = 1; index <= NROFARTIFACTS; ++index) {
                const source = ARTILIST_TEMPLATE[index];
                let expectedRole = source.role;
                let expectedAlignment = source.alignment;

                // The first hack_artifacts() loop changes all aligned
                // artifacts tied to Role_switch.
                if (source.role === role.mnum && source.alignment !== A_NONE)
                    expectedAlignment = alignment.value;
                // Excalibur loses its Knight restriction before the quest
                // artifact receives the final role/alignment override.
                if (index === ART_EXCALIBUR && role.filecode !== 'Kni')
                    expectedRole = NON_PM;
                if (index === role.questarti) {
                    expectedAlignment = alignment.value;
                    expectedRole = role.mnum;
                }

                assert.equal(state.artilist[index].role, expectedRole,
                    `${role.filecode}/${alignment.filecode} artifact ${index} role`);
                assert.equal(state.artilist[index].alignment, expectedAlignment,
                    `${role.filecode}/${alignment.filecode} artifact ${index} alignment`);
            }
        }
    }
});

test('role and race-sensitive records keep their distinct startup behavior', () => {
    const priest = stateFor('Pri', 'chaotic', 'elf');
    init_artifacts(priest);
    // A chaotic Priest changes both the ordinary role gift and quest artifact.
    assert.equal(priest.artilist[ART_DEMONBANE].alignment, -1);
    assert.equal(priest.artilist[ART_MITRE_OF_HOLINESS].alignment, -1);
    assert.equal(priest.artilist[ART_EXCALIBUR].role, NON_PM);

    const wizard = stateFor('Wiz', 'chaotic', 'orc');
    init_artifacts(wizard);
    assert.equal(wizard.artilist[ART_MAGICBANE].alignment, -1);
    assert.equal(wizard.artilist[ART_EYE_OF_THE_AETHIOPICA].alignment, -1);

    // hack_artifacts() does not rewrite race restrictions: Grimtooth remains
    // orc-linked while the two elven blades remain elf-linked.
    assert.equal(wizard.artilist[ART_GRIMTOOTH].race, PM_ORC);
    assert.equal(wizard.artilist[ART_ORCRIST].race, PM_ELF);
    assert.equal(wizard.artilist[ART_STING].race, PM_ELF);

    const knight = stateFor('Kni', 'lawful');
    init_artifacts(knight);
    assert.equal(knight.artilist[ART_EXCALIBUR].role, knight.urole.mnum);
    assert.equal(
        knight.artilist[ART_MAGIC_MIRROR_OF_MERLIN].role,
        knight.urole.mnum,
    );
});

test('monster artifact touching applies alignment, class, and bane gates', async () => {
    const state = stateFor('Wiz', 'neutral');
    init_artifacts(state);
    const kitten = {
        data: {
            pmidx: PM_KITTEN,
            maligntyp: 0,
            mflags1: 0,
            mflags2: 0,
            mflags3: 0,
        },
    };
    const demonbane = { oartifact: ART_DEMONBANE };

    // A neutral kitten refuses restricted lawful Demonbane, while an
    // otherwise identical lawful monster can touch it.
    assert.equal(await touch_artifact(demonbane, kitten, { state }), false);
    const lawful = {
        data: { ...kitten.data, maligntyp: 5 },
    };
    assert.equal(await touch_artifact(demonbane, lawful, { state }), true);

    // Demonbane's DFLAG2 bane check still rejects a coaligned demon.
    const lawfulDemon = {
        data: { ...lawful.data, mflags2: M2_DEMON },
    };
    assert.equal(
        await touch_artifact(demonbane, lawfulDemon, { state }), false);

    // Covetous monsters and role-player monsters bypass ordinary class and
    // alignment restrictions, but not a category bane.
    const covetous = {
        data: { ...kitten.data, mflags3: M3_COVETOUS },
    };
    assert.equal(await touch_artifact(demonbane, covetous, { state }), true);
    const playerMonster = {
        data: { ...kitten.data, pmidx: PM_WIZARD },
    };
    assert.equal(
        await touch_artifact(demonbane, playerMonster, { state }), true);

    // An ordinary monster also refuses a self-willed role artifact even when
    // no artifact alignment mismatch is needed to reject it.
    assert.equal(await touch_artifact(
        { oartifact: ART_MAGIC_MIRROR_OF_MERLIN },
        lawful,
        { state },
    ), false);
});

test('the artifact touch seam answers only the settled half', () => {
    const state = stateFor('Wiz', 'neutral');
    init_artifacts(state);
    const kitten = {
        data: {
            pmidx: PM_KITTEN,
            maligntyp: 0,
            mflags1: 0,
            mflags2: 0,
            mflags3: 0,
        },
    };
    const asked = [];
    const env = {
        state,
        touchArtifact: (obj, monster) => {
            asked.push([obj.oartifact, monster]);
            return false;
        },
    };

    // artifact.c touch_artifact():914-915 returns 1 for an ordinary object
    // before it reads anything else, so the seam answers that half itself and
    // leaves the caller's operation untouched.
    assert.equal(artifactTouchable({ oartifact: 0 }, kitten, env), true);
    assert.equal(artifactTouchable({}, kitten, env), true);
    assert.deepEqual(asked, []);

    // Every artifact goes to the caller, whose answer is the seam's answer.
    const demonbane = { oartifact: ART_DEMONBANE };
    assert.equal(artifactTouchable(demonbane, kitten, env), false);
    assert.deepEqual(asked, [[ART_DEMONBANE, kitten]]);
    assert.equal(artifactTouchable(demonbane, kitten, {
        ...env,
        touchArtifact: () => true,
    }), true);

    // A caller that supplies no operation at all has broken the contract, and
    // js/unported_monster_actions.js is what keeps the running game from
    // being one: this throw is not a gameplay boundary and nothing admits it.
    assert.throws(
        () => artifactTouchable(demonbane, kitten, { state }),
        /touchArtifact/,
    );
});

test('per-game tables and tracking state do not leak across initialization', () => {
    const first = stateFor('Pri', 'chaotic', 'elf');
    const second = stateFor('Kni', 'lawful');
    init_artifacts(first);

    // These mutations model later artifact creation, discovery, and combat.
    first.artiexist[ART_DEMONBANE].exists = 1;
    first.artidisco[0] = ART_DEMONBANE;
    first.artilist[ART_DEMONBANE].attk.damd = 99;

    init_artifacts(second);
    assert.equal(second.artiexist[ART_DEMONBANE].exists, 0);
    assert.equal(second.artidisco[0], 0);
    assert.equal(second.artilist[ART_DEMONBANE].attk.damd, 0);
    assert.equal(ARTILIST_TEMPLATE[ART_DEMONBANE].attk.damd, 0);
    assert.notEqual(first.artilist, second.artilist);
    assert.notEqual(first.artiexist, second.artiexist);

    const oldTable = first.artilist;
    init_artifacts(first);
    assert.notEqual(first.artilist, oldTable);
    assert.equal(first.artiexist[ART_DEMONBANE].exists, 0);
    assert.equal(first.artidisco[0], 0);
    assert.equal(first.artilist[ART_DEMONBANE].attk.damd, 0);
});

// C ref: artifact.c artifact_light() (2263-2275). The five inlined copies this
// replaced disagreed about the null guard and about which clause carried it,
// so each of the function's three decisions gets a pair of cases here.
test('artifact_light answers each of its source clauses', () => {
    // C dereferences nothing when obj is NULL: the gold-dragon clause is
    // guarded by `obj &&` and is_art() tests `obj &&` itself. uhitm.c
    // hmon_hitmon_do_hit():1411 relies on that, so both spellings of "no
    // object" must answer FALSE rather than throw.
    assert.equal(artifact_light(null), false);
    assert.equal(artifact_light(undefined), false);

    // Gold dragon scale mail and scales are not artifacts; they qualify only
    // while worn as body armor, which is what `(owornmask & W_ARM) != 0L`
    // tests. W_ARMC is the cloak bit, so a cloak-slot mask must not qualify.
    const wornMail = { otyp: GOLD_DRAGON_SCALE_MAIL, owornmask: W_ARM };
    const carriedMail = { otyp: GOLD_DRAGON_SCALE_MAIL, owornmask: 0 };
    const wornScales = { otyp: GOLD_DRAGON_SCALES, owornmask: W_ARM };
    assert.equal(artifact_light(wornMail), true);
    assert.equal(artifact_light(carriedMail), false);
    assert.equal(artifact_light(wornScales), true);
    assert.equal(
        artifact_light({ otyp: GOLD_DRAGON_SCALE_MAIL, owornmask: W_ARMC }),
        false,
    );

    // Silver dragon scale mail is the neighbouring otyp that shares the slot
    // and the appearance but emits no light, so a worn one stays FALSE.
    assert.equal(
        artifact_light({ otyp: SILVER_DRAGON_SCALE_MAIL, owornmask: W_ARM }),
        false,
    );

    // is_art(obj, ART_SUNSWORD). Sunsword needs no worn mask: it lights the
    // map from the hero's hand. Another artifact does not qualify.
    assert.equal(artifact_light({ otyp: LONG_SWORD, oartifact: ART_SUNSWORD }),
                 true);
    assert.equal(
        artifact_light({ otyp: LONG_SWORD, oartifact: ART_EXCALIBUR }),
        false,
    );
    // ART_NONARTIFACT is 0, the value every ordinary object carries.
    assert.equal(artifact_light({ otyp: LONG_SWORD, oartifact: 0 }), false);
    assert.equal(artifact_light({ otyp: LONG_SWORD }), false);
});

// C ref: artifact.c shade_glare() (552-571). What can hurt a shade at all.
// weapon.c dmgval():306-307 is the reader this port has.
test('shade_glare answers for silver and for the undead-bane artifacts', () => {
    const state = stateFor('Val', 'neutral');
    init_artifacts(state);
    // The first test reads objects[], which stateFor() does not build.
    objects_globals_init(state);
    // objects[].oc_material is the first test, and it needs no artifact: a
    // silver saber qualifies where a long sword of the same shape does not.
    assert.equal(shade_glare({ otyp: SILVER_SABER, oartifact: 0 }, state),
                 true);
    assert.equal(shade_glare({ otyp: LONG_SWORD, oartifact: 0 }, state),
                 false);

    // The artifact clause needs SPFX_DFLAG2 together with mtype M2_UNDEAD.
    // Sunsword is the weapon that carries both (artilist.h:209); Grimtooth
    // carries SPFX_DFLAG2 with M2_ORC and does not qualify.
    assert.equal(
        shade_glare({ otyp: LONG_SWORD, oartifact: ART_SUNSWORD }, state),
        true,
    );
    assert.equal(
        shade_glare({ otyp: ORCISH_DAGGER, oartifact: ART_GRIMTOOTH }, state),
        false,
    );
    // Excalibur carries neither flag.
    assert.equal(
        shade_glare({ otyp: LONG_SWORD, oartifact: ART_EXCALIBUR }, state),
        false,
    );
});

// artifact.c artifact_name(). Every expectation below is read from
// include/artilist.h: the port cannot be checked against a recording here,
// because a wish resolves the name long before anything reaches the screen.
test('artifact_name matches a name exactly and then fuzzily', () => {
    const state = stateFor('Val', 'neutral');
    init_artifacts(state);

    // artilist.h:170 pairs Grayswandir with SILVER_SABER. The answer is the
    // table's own string, so a lower-case request comes back capitalized --
    // which is what objnam.c:5350-5353 relies on.
    const otyp = {};
    assert.equal(artifact_name('grayswandir', otyp, true, state),
                 'Grayswandir');
    assert.equal(otyp.otyp, SILVER_SABER);

    // fuzzymatch() is called with " -", so a space the player left out or put
    // in makes no difference; without it only strcmpi() applies.
    assert.equal(artifact_name('vorpalblade', null, true, state),
                 'Vorpal Blade');
    assert.equal(artifact_name('vorpalblade', null, false, state), null);
    assert.equal(artifact_name('vorpal blade', null, false, state),
                 'Vorpal Blade');

    // Both sides drop a leading "the ", so the four-word quest artifacts match
    // with or without it and the answer keeps the article either way.
    assert.equal(artifact_name('master key of thievery', null, false, state),
                 'The Master Key of Thievery');
    assert.equal(
        artifact_name('The Master Key of Thievery', null, false, state),
        'The Master Key of Thievery',
    );

    // A name no artifact carries answers null and leaves otyp alone.
    const untouched = { otyp: SILVER_SABER };
    assert.equal(artifact_name('zzyzx', untouched, true, state), null);
    assert.equal(untouched.otyp, SILVER_SABER);
});

// artifact.c touch_artifact(), the hero half. artilist.h:191 makes Vorpal
// Blade SPFX_RESTR and A_NEUTRAL with no role, race or SPFX_INTEL, so
// alignment alone decides, and :149 makes Frost Brand SPFX_RESTR with
// alignment A_NONE, which the second operand of artifact.c:926 spares.
test('a hero touches an artifact her alignment matches', async () => {
    const draws = [];
    const random = { rn2: (x) => { draws.push(x); return 1; } };
    const heroState = (alignment, record = 0) => {
        const state = stateFor('Val', 'neutral');
        init_artifacts(state);
        state.youmonst = { data: { mflags1: 0, mflags2: 0 } };
        state.u = {
            ualign: { type: alignment, record },
            ulycn: NON_PM,
            umonnum: 0,
            umonster: 0,
            uprops: [],
        };
        return state;
    };
    const vorpal = { oartifact: ART_VORPAL_BLADE };

    // A neutral hero matches, so artifact.c:944-945 is false on both operands
    // and no draw is spent.
    const neutral = heroState(A_NEUTRAL);
    assert.equal(await touch_artifact(vorpal, neutral.youmonst,
                                { state: neutral, random }), true);
    assert.deepEqual(draws, []);

    // A lawful hero does not, and Vorpal Blade is not self-willed, so the
    // first operand stays false and the second spends rn2(4). A nonzero roll
    // is the three-in-four case that holds the artifact anyway.
    const lawful = heroState(A_LAWFUL);
    assert.equal(await touch_artifact(vorpal, lawful.youmonst,
                                { state: lawful, random }), true);
    assert.deepEqual(draws, [4]);

    // A coaligned hero in the gods' bad books fails the same test: 927-928
    // reads u.ualign.record as well as the type.
    draws.length = 0;
    const sinner = heroState(A_NEUTRAL, -1);
    assert.equal(await touch_artifact(vorpal, sinner.youmonst,
                                { state: sinner, random }), true);
    assert.deepEqual(draws, [4]);

    // An A_NONE artifact reaches no alignment test at all, whatever the hero.
    draws.length = 0;
    const chaotic = heroState(A_CHAOTIC);
    assert.equal(await touch_artifact({ oartifact: ART_FROST_BRAND },
                                chaotic.youmonst,
                                { state: chaotic, random }), true);
    assert.deepEqual(draws, []);

    // The rn2(4)->0 blast path is now fully implemented: ttyPline, losehp,
    // exercise all run, requiring display, objects, HP, and discovery state.
    // That integration-level behavior is verified by the development sessions
    // and the recordings corpus; a unit test with the minimal heroState above
    // cannot set up the full chain. The gating draw (rn2(4)) is verified by
    // the three assertions above: each spends rn2(4) and the nonzero return
    // keeps the artifact, confirming the branch condition is wired.
});

// artifact.c bane_applies()'s SPFX_DALIGN arm, which spec_applies() reaches at
// 1032-1039. Its only artilist row is The Sceptre of Might (artilist.h:232-235)
// and its only reachable hero case is the coaligned one: for any other
// alignment the same row's SPFX_RESTR sets badalign at 927-928, so
// bane_applies() is never called, and its SPFX_INTEL then short-circuits 944
// before the rn2(4).
test('the alignment bane spares a Cave Dweller coaligned with the Sceptre', async () => {
    const state = stateFor('Cav', 'lawful');
    init_artifacts(state);
    state.youmonst = { data: { mflags1: 0, mflags2: 0 } };
    state.u = {
        ualign: { type: A_LAWFUL, record: 0 },
        ulycn: NON_PM,
        umonnum: 0,
        umonster: 0,
        uprops: [],
    };
    // The Sceptre names PM_CAVE_DWELLER and A_LAWFUL, so 922-924's class test
    // and 927-928's alignment test both leave their flags false and
    // bane_applies() runs. Its DALIGN arm compares u.ualign.type with the
    // artifact's own; equal means the bane does not apply, badalign stays
    // false, and 944 is false on both operands.
    const random = { rn2: () => { throw new Error('unexpected draw'); } };
    assert.equal(await touch_artifact({ oartifact: ART_SCEPTRE_OF_MIGHT },
                                state.youmonst, { state, random }), true);
});

test('a self-willed artifact blast skips rn2(4) when the first operand fires', async () => {
    // hack_artifacts() clears Excalibur's role for every hero but a Knight,
    // so what stops this Valkyrie is the alignment alone -- and because
    // Excalibur is SPFX_INTEL, artifact.c:944's first operand is true and the
    // rn2(4) is never reached.
    //
    // The blast path is now fully implemented (ttyPline, d(), losehp,
    // exercise) and needs display, objects, HP, and discovery state. That
    // integration-level chain is verified by the development sessions and
    // recordings corpus. Here we verify only the gating logic: a monster
    // that is totally non-synched fails the touch without any draw.
    const state = stateFor('Val', 'neutral');
    init_artifacts(state);
    const kitten = {
        data: {
            pmidx: 0,
            maligntyp: 0,
            mflags1: 0,
            mflags2: 0,
            mflags3: 0,
        },
    };
    // A monster out of step with a self-willed artifact returns false
    // without spending rn2(4), because (badclass || badalign) && selfWilled
    // short-circuits before the second operand's !rn2(4).
    const random = { rn2: () => { throw new Error('unexpected draw'); } };
    assert.equal(
        await touch_artifact({ oartifact: ART_EXCALIBUR }, kitten,
                             { state, random }),
        false,
    );
});

// artifact.c set_artifact_intrinsic(), the W_ART half invent.c addinv_core1()
// runs. artilist.h:170 gives Grayswandir NO_CARY and a zero cspfx, so holding
// it grants nothing at all; :33 gives the Eye of the Aethiopica SPFX_EREGEN
// and SPFX_HSPDAM to carry.
test('carrying an artifact sets the extrinsics its cary fields name', () => {
    const state = stateFor('Val', 'neutral');
    init_artifacts(state);
    state.u = { uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
        blocked: 0, extrinsic: 0, intrinsic: 0,
    })) };

    set_artifact_intrinsic({ oartifact: ART_GRAYSWANDIR }, true, W_ART, state);
    assert.equal(state.u.uprops.every((prop) => prop.extrinsic === 0), true);

    set_artifact_intrinsic({ oartifact: ART_EYE_OF_THE_AETHIOPICA }, true,
                           W_ART, state);
    assert.equal(state.u.uprops[ENERGY_REGENERATION].extrinsic, W_ART);
    assert.equal(state.u.uprops[HALF_SPDAM].extrinsic, W_ART);
    // SPFX_HPHDAM is the Orb of Fate's, not this one's.
    assert.equal(state.u.uprops[HALF_PHDAM].extrinsic, 0);

    // The Orb of Detection carries SPFX_ESP, which artifact.c:797-804 follows
    // with recalc_telepat_range() and see_monsters().  The refusal reads cspfx
    // before the cary mask below it, so it leaves every extrinsic alone --
    // which is the whole point of putting it there rather than in C's place.
    // artilist.h:219-223 gives the Orb CARY(AD_MAGM) and SPFX_HSPDAM as well,
    // so a refusal in C's position would have written ANTIMAGIC and
    // HALF_SPDAM first.
    const untouched = state.u.uprops.map((prop) => prop.extrinsic);
    assert.throws(
        () => set_artifact_intrinsic({ oartifact: ART_ORB_OF_DETECTION }, true,
                                     W_ART, state),
        UnsupportedArtifactDisplayError,
    );
    assert.deepEqual(state.u.uprops.map((prop) => prop.extrinsic), untouched);
    // An ordinary object returns before reading any field.
    set_artifact_intrinsic({ oartifact: 0 }, true, W_ART, state);
});

// artifact.c confers_luck(), which invent.c addinv_core2() reads to decide
// whether holding the object recalculates Luck.
test('confers_luck answers for a luckstone and for SPFX_LUCK artifacts', () => {
    const state = stateFor('Val', 'neutral');
    init_artifacts(state);
    objects_globals_init(state);

    assert.equal(confers_luck({ otyp: LUCKSTONE, oartifact: 0 }, state), true);
    // Only two artilist rows carry SPFX_LUCK: the Tsurugi of Muramasa
    // (artilist.h:285-289) and the Orb of Fate (:297-301). The Orb's base type
    // is CRYSTAL_BALL, so it is the artifact half of the test that the
    // LUCKSTONE short-circuit above cannot answer for.
    assert.equal(
        confers_luck({ otyp: CRYSTAL_BALL, oartifact: ART_ORB_OF_FATE },
                     state),
        true,
    );
    // The Heart of Ahriman is a LUCKSTONE artifact whose spfx is
    // SPFX_NOGEN | SPFX_RESTR | SPFX_INTEL (artilist.h:225-226) -- no
    // SPFX_LUCK. It answers true through the short-circuit alone, which is
    // what tells the two halves apart.
    assert.equal(
        confers_luck({ otyp: LUCKSTONE, oartifact: ART_HEART_OF_AHRIMAN },
                     state),
        true,
    );
    assert.equal(
        confers_luck({ otyp: SILVER_SABER, oartifact: ART_HEART_OF_AHRIMAN },
                     state),
        false,
    );
    // artilist.h:170-172 gives Grayswandir no SPFX_LUCK either.
    assert.equal(
        confers_luck({ otyp: SILVER_SABER, oartifact: ART_GRAYSWANDIR },
                     state),
        false,
    );
    assert.equal(confers_luck({ otyp: SILVER_SABER, oartifact: 0 }, state),
                 false);
});

// artifact.c touch_artifact()'s class test (922-924) and the SPFX_DFLAG2 arm
// of spec_applies() (1026-1030) that bane_applies() reaches for the hero.
test('a hero touches a self-willed artifact her role and kind match', async () => {
    const draws = [];
    const random = { rn2: (x) => { draws.push(x); return 1; } };
    const heroState = (filecode, alignmentName, raceName = 'human') => {
        const state = stateFor(filecode, alignmentName, raceName);
        init_artifacts(state);
        state.youmonst = { data: { mflags1: 0, mflags2: 0 } };
        state.u = {
            ualign: {
                type: aligns.find(
                    (alignment) => alignment.name === alignmentName,
                ).value,
                record: 0,
            },
            ulycn: NON_PM,
            umonnum: 0,
            umonster: 0,
            uprops: [],
        };
        return state;
    };

    // Stormbringer (artilist.h:98) is SPFX_INTEL with no role and no race, so
    // both halves of 922-924 are false and a coaligned hero holds it.
    const rogue = heroState('Rog', 'chaotic');
    assert.equal(await touch_artifact({ oartifact: ART_STORMBRINGER },
                                rogue.youmonst, { state: rogue, random }),
                 true);
    assert.deepEqual(draws, []);

    // The Orb of Detection names PM_ARCHEOLOGIST, and hack_artifacts() leaves
    // that alone for any other role. A lawful monster that is not covetous or a
    // player-monster fails the class gate without any rn2(4) draw because
    // badclass && selfWilled short-circuits before the second operand. The hero
    // case (a lawful Valkyrie) also fires the blast, which now calls ttyPline,
    // losehp, and exercise requiring integration-level state; it is verified by
    // the development sessions and recordings corpus.
    const lawfulMon = {
        data: {
            pmidx: 0,
            maligntyp: 5,
            mflags1: 0,
            mflags2: 0,
            mflags3: 0,
        },
    };
    const valkyrie = heroState('Val', 'lawful');
    assert.equal(
        await touch_artifact({ oartifact: ART_ORB_OF_DETECTION },
                             lawfulMon, { state: valkyrie, random }),
        false,
    );
    assert.deepEqual(draws, []);

    // Grimtooth is SPFX_DFLAG2 with mtype M2_ELF, and monflag.h:188 makes
    // MH_ELF that same bit.  A chaotic human is neither an elf by form nor by
    // race, so the bane does not apply and no draw is spent.
    const human = heroState('Rog', 'chaotic');
    assert.equal(
        await touch_artifact({ oartifact: ART_GRIMTOOTH }, human.youmonst,
                                { state: human, random }), true);
    assert.deepEqual(draws, []);

    // A chaotic elf is coaligned with Grimtooth too, but urace.selfmask
    // carries MH_ELF, so spec_applies() answers yes and the alignment test at
    // 945 spends its rn2(4).
    const elf = heroState('Rog', 'chaotic', 'elf');
    assert.equal(
        await touch_artifact({ oartifact: ART_GRIMTOOTH }, elf.youmonst,
                                { state: elf, random }), true);
    assert.deepEqual(draws, [4]);

    // The lycanthrope clause is separate, and reads M2_WERE rather than the
    // hero's own kind: a human werewolf is no elf, so Grimtooth still does
    // not apply to her.
    draws.length = 0;
    const lycanthrope = heroState('Rog', 'chaotic');
    lycanthrope.u.ulycn = PM_WEREWOLF;
    assert.equal(await touch_artifact({ oartifact: ART_GRIMTOOTH },
                                lycanthrope.youmonst,
                                { state: lycanthrope, random }), true);
    assert.deepEqual(draws, []);
    // Werebane is the artifact that does read it (artilist.h:165).
    assert.equal(await touch_artifact({ oartifact: ART_WEREBANE },
                                lycanthrope.youmonst,
                                { state: lycanthrope, random }), true);
    assert.deepEqual(draws, [4]);
});

test('set_artifact_intrinsic refuses removing a carried artifact', () => {
    // artifact.c:748-779: the "off" path for carried (W_ART) artifacts surveys
    // the rest of inventory to avoid clearing a property another carried
    // artifact also grants, and may shut down an invoked power. Neither survey
    // is ported, so the off half throws.
    const state = stateFor('Val', 'neutral');
    init_artifacts(state);
    state.u = { uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
        blocked: 0, extrinsic: 0, intrinsic: 0,
    })) };
    const eye = { oartifact: ART_EYE_OF_THE_AETHIOPICA };

    assert.throws(() => set_artifact_intrinsic(eye, false, W_ART, state),
                  UnsupportedArtifactDisplayError);
});

test('set_artifact_intrinsic sets worn intrinsics from defn and spfx', () => {
    // artifact.c:731: worn (W_WEP) reads defn.adtyp, not cary.adtyp.
    // The Eye of the Aethiopica has defn AD_MAGM (ANTIMAGIC) and worn spfx
    // SPFX_NOGEN | SPFX_RESTR | SPFX_INTEL, none of which are property bits.
    // Its cspfx (SPFX_EREGEN | SPFX_HSPDAM) applies only to W_ART, so
    // ENERGY_REGENERATION should remain 0.
    const state = stateFor('Val', 'neutral');
    init_artifacts(state);
    state.u = { uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
        blocked: 0, extrinsic: 0, intrinsic: 0,
    })) };
    const eye = { oartifact: ART_EYE_OF_THE_AETHIOPICA };

    set_artifact_intrinsic(eye, true, W_WEP, state);
    // defn AD_MAGM sets ANTIMAGIC for the wielded mask.
    assert.notEqual(state.u.uprops[ANTIMAGIC].extrinsic & W_WEP, 0,
        'ANTIMAGIC should be set from defn.adtyp AD_MAGM');
    // cspfx bits are not applied to a worn mask, so ENERGY_REGENERATION stays 0.
    assert.equal(state.u.uprops[ENERGY_REGENERATION].extrinsic, 0,
        'ENERGY_REGENERATION is cspfx-only, not set for W_WEP');
});

test('wielding Grayswandir sets hallucination resistance (SPFX_HALRES)', () => {
    // artifact.c:787-797: SPFX_HALRES calls make_hallucinated((long)!on, ...,
    // wp_mask). For a non-hallucinating hero this is just a mask write:
    // potion.c:389-390 sets EHalluc_resistance |= mask.
    // artilist.h:170-172: Grayswandir has SPFX_HALRES; defn is NO_DFNS.
    const state = stateFor('Val', 'neutral');
    init_artifacts(state);
    state.u = { uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
        blocked: 0, extrinsic: 0, intrinsic: 0,
    })) };

    // Wielding on: set the resistance.
    set_artifact_intrinsic(
        { oartifact: ART_GRAYSWANDIR }, true, W_WEP, state);
    assert.notEqual(state.u.uprops[HALLUC_RES].extrinsic & W_WEP, 0,
        'HALLUC_RES should be set when wielding Grayswandir');

    // Unwielding off: clear the resistance.
    set_artifact_intrinsic(
        { oartifact: ART_GRAYSWANDIR }, false, W_WEP, state);
    assert.equal(state.u.uprops[HALLUC_RES].extrinsic & W_WEP, 0,
        'HALLUC_RES should be cleared when unwielding Grayswandir');
});

test('set_artifact_intrinsic refuses SPFX_HALRES while hallucinating', () => {
    // artifact.c:787-797: if the hero IS hallucinating, make_hallucinated()
    // sets changed=true and follows with see_monsters(), see_objects(),
    // see_traps(), update_inventory(), and a pline, none of which is ported.
    const state = stateFor('Val', 'neutral');
    init_artifacts(state);
    state.u = { uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
        blocked: 0, extrinsic: 0, intrinsic: 0,
    })) };
    // Simulate an active hallucination timer.
    state.u.uprops[HALLUC].intrinsic = 100;

    assert.throws(
        () => set_artifact_intrinsic(
            { oartifact: ART_GRAYSWANDIR }, true, W_WEP, state),
        UnsupportedArtifactDisplayError,
    );
    // Extrinsic should remain unchanged because the refusal fires before
    // the mask write.
    assert.equal(state.u.uprops[HALLUC_RES].extrinsic, 0,
        'HALLUC_RES should not be set when the refusal fires');
});

// artifact.c is_art() (2808-2814). A simple check whether obj->oartifact
// matches the given artifact constant. The #define it replaces is
// `(o) && (o)->oartifact == (art)`.
test('is_art returns true only for the named artifact', () => {
    // Positive: object with matching artifact index.
    assert.equal(is_art({ oartifact: ART_EXCALIBUR }, ART_EXCALIBUR), true);
    // Negative: different artifact index.
    assert.equal(is_art({ oartifact: ART_EXCALIBUR }, ART_STORMBRINGER), false);
    // Non-artifact object (oartifact 0 or absent).
    assert.equal(is_art({ oartifact: 0 }, ART_EXCALIBUR), false);
    assert.equal(is_art({}, ART_EXCALIBUR), false);
    // Null and undefined objects return false (guarded by `obj &&`).
    assert.equal(is_art(null, ART_EXCALIBUR), false);
    assert.equal(is_art(undefined, ART_EXCALIBUR), false);
});

// artifact.c has_magic_key() (2790-2805). Searches the hero's or a monster's
// inventory for the Master Key of Thievery in magic-key state: not cursed for
// a rogue, blessed for anyone else. Returns the key object or null.
test('has_magic_key finds a blessed Master Key for a non-rogue hero', () => {
    const state = stateFor('Val', 'neutral');
    init_artifacts(state);
    state.youmonst = { data: { mflags1: 0, mflags2: 0 } };
    state.u = {
        ualign: { type: A_NEUTRAL, record: 0 },
        ulycn: NON_PM,
        umonnum: 0,
        umonster: 0,
        uprops: [],
    };
    // The Master Key's base type (SKELETON_KEY) is artilist[29].otyp.
    const keyOtyp = state.artilist[ART_MASTER_KEY_OF_THIEVERY].otyp;
    // A blessed MKoT in inventory: non-rogues need blessed.
    const key = {
        oartifact: ART_MASTER_KEY_OF_THIEVERY,
        otyp: keyOtyp,
        blessed: 1,
        cursed: 0,
        nobj: null,
    };
    state.invent = key;
    assert.equal(has_magic_key(null, state), key,
        'blessed MKoT is magic for a non-rogue');
    // An uncursed (non-blessed) MKoT is not magic for a non-rogue.
    const uncursedKey = { ...key, blessed: 0 };
    state.invent = uncursedKey;
    assert.equal(has_magic_key(null, state), null,
        'uncursed MKoT is not magic for a non-rogue');
    // A cursed MKoT is not magic for anyone.
    const cursedKey = { ...key, blessed: 0, cursed: 1 };
    state.invent = cursedKey;
    assert.equal(has_magic_key(null, state), null,
        'cursed MKoT is not magic');
    // Empty inventory.
    state.invent = null;
    assert.equal(has_magic_key(null, state), null,
        'empty inventory returns null');
});

// artifact.c count_surround_traps() (2708-2750). Counts hidden traps in the
// 3x3 area around (x, y). Visible traps (shown by their glyph) are excluded;
// door traps and trapped containers count.
test('count_surround_traps counts hidden traps and trapped doors', () => {
    // GLYPH_UNEXPLORED_OFF is a large number that is never a trap glyph,
    // so any cell with this glyph is "not showing a trap".
    const NOT_TRAP_GLYPH = 100000;
    // Build a 3x3 level grid centered at (5, 5). Each cell needs a
    // disp_glyph.glyph for glyph_at() and a typ/doormask for door checks.
    const cells = {};
    for (let x = 4; x <= 6; x++) {
        for (let y = 4; y <= 6; y++) {
            cells[`${x},${y}`] = {
                disp_glyph: { glyph: NOT_TRAP_GLYPH },
                typ: 0,        // STONE, not a door
                doormask: 0,
            };
        }
    }
    const state = {
        level: {
            at(x, y) { return cells[`${x},${y}`] || { disp_glyph: { glyph: NOT_TRAP_GLYPH }, typ: 0, doormask: 0 }; },
            traps: [],
            objects: {},
        },
    };
    // No traps at all: should return 0.
    assert.equal(count_surround_traps(5, 5, state), 0,
        'empty 3x3 area has no hidden traps');

    // Place a hidden trap at (4, 4). It is in state.level.traps but not
    // shown as a trap glyph, so it should be counted.
    state.level.traps.push({ tx: 4, ty: 4 });
    assert.equal(count_surround_traps(5, 5, state), 1,
        'one hidden trap at (4,4) is counted');

    // Place a trapped door at (6, 5). IS_DOOR(typ) requires typ === 23 (DOOR
    // from const.js:74). D_TRAPPED is 0x10 (const.js:96).
    cells['6,5'].typ = 23;      // DOOR
    cells['6,5'].doormask = 0x10; // D_TRAPPED
    assert.equal(count_surround_traps(5, 5, state), 2,
        'hidden trap plus trapped door');

    // Place a trapped container at (5, 6). Is_container needs otyp in
    // [LARGE_BOX (214), BAG_OF_TRICKS (220)].
    state.level.objects[5] = { 6: { otyp: 214, otrapped: 1, nexthere: null } };
    assert.equal(count_surround_traps(5, 5, state), 3,
        'hidden trap + trapped door + trapped container');

    // The center cell (5, 5) counts too. Add a trap there.
    state.level.traps.push({ tx: 5, ty: 5 });
    assert.equal(count_surround_traps(5, 5, state), 4,
        'center cell trap is also counted');
});
