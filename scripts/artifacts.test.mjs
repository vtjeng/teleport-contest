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
    ART_MITRE_OF_HOLINESS,
    ART_ORCRIST,
    ART_STING,
    AFTER_LAST_ARTIFACT,
    NROFARTIFACTS,
    artifact_defends,
    createArtifactTable,
    init_artifacts,
    touch_artifact,
} from '../js/artifacts.js';
import { A_NONE, NON_PM } from '../js/const.js';
import {
    AD_FIRE,
    AD_MAGM,
    M2_DEMON,
    M3_COVETOUS,
    PM_ELF,
    PM_KITTEN,
    PM_ORC,
    PM_WIZARD,
} from '../js/monsters.js';
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

test('monster artifact touching applies alignment, class, and bane gates', () => {
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
    assert.equal(touch_artifact(demonbane, kitten, { state }), false);
    const lawful = {
        data: { ...kitten.data, maligntyp: 5 },
    };
    assert.equal(touch_artifact(demonbane, lawful, { state }), true);

    // Demonbane's DFLAG2 bane check still rejects a coaligned demon.
    const lawfulDemon = {
        data: { ...lawful.data, mflags2: M2_DEMON },
    };
    assert.equal(touch_artifact(demonbane, lawfulDemon, { state }), false);

    // Covetous monsters and role-player monsters bypass ordinary class and
    // alignment restrictions, but not a category bane.
    const covetous = {
        data: { ...kitten.data, mflags3: M3_COVETOUS },
    };
    assert.equal(touch_artifact(demonbane, covetous, { state }), true);
    const playerMonster = {
        data: { ...kitten.data, pmidx: PM_WIZARD },
    };
    assert.equal(touch_artifact(demonbane, playerMonster, { state }), true);

    // An ordinary monster also refuses a self-willed role artifact even when
    // no artifact alignment mismatch is needed to reject it.
    assert.equal(touch_artifact(
        { oartifact: ART_MAGIC_MIRROR_OF_MERLIN },
        lawful,
        { state },
    ), false);
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
