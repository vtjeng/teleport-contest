import assert from 'node:assert/strict';
import test from 'node:test';

import { SUPPRESS_NAME } from '../js/const.js';
import {
    Amonnam,
    bogon_is_pname,
    bogusmon,
    capitalizedAlwaysVisibleMonsterName,
    capitalizedMonsterName,
    christen_monst,
    lookup_novel,
    mon_nam_too,
    monsterCommonName,
    monsterPossessive,
    noveltitle,
    obj_pmname,
    oname,
    rndmonnam,
    SIR_TERRY_NOVELS,
    UnsupportedMonsterNameError,
    x_monnam,
} from '../js/do_name.js';
import { ART_EXCALIBUR, init_artifacts } from '../js/artifacts.js';
import {
    ARTICLE_A,
    BLINDED,
    CORPSTAT_FEMALE,
    CORPSTAT_HISTORIC,
    CORPSTAT_MALE,
    CORPSTAT_NEUTER,
    CORPSTAT_RANDOM,
    DETECT_MONSTERS,
    HALLUC,
    HALLUC_RES,
    M_AP_MONSTER,
    MD_PAD_BOGONS,
    OBJ_FREE,
    OBJ_INVENT,
    ONAME_WISH,
    PL_PSIZ,
    SUPPRESS_HALLUCINATION,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    W_SADDLE,
    has_oname,
} from '../js/const.js';
import {
    CORPSE,
    FIGURINE,
    LONG_SWORD,
    STATUE,
    objects_globals_init,
} from '../js/objects.js';
import { races, roles } from '../js/roles.js';
import {
    G_NOGEN,
    LOW_PM,
    M1_HUMANOID,
    M2_PNAME,
    NUMMONS,
    PM_ALIGNED_CLERIC,
    PM_GHOST,
    PM_GNOME_RULER,
    PM_NEWT,
    SPECIAL_PM,
    monst_globals_init,
} from '../js/monsters.js';
import { xcrypt } from '../js/random_text.js';
import { RANDOM_TEXT_FILES } from '../js/random_text_data.js';

function titleDraw(result) {
    let draws = 0;
    return {
        env: {
            random: {
                rn2(bound) {
                    ++draws;
                    assert.equal(bound, SIR_TERRY_NOVELS.length);
                    return result;
                },
            },
        },
        get draws() { return draws; },
    };
}

test('ordinary monster names preserve article, saddle, pet, and possessive rules',
    () => {
        const state = {
            u: {
                uprops: [],
                uroleplay: { blind: false },
            },
        };
        // display.h canspotmon() is `canseemon(mon) || sensemon(mon)`, and
        // sensemon()'s Detect_monsters operand is the one this fixture can
        // satisfy without a map: the monster below stands nowhere, so
        // canseemon() has no square to test. Without it every name here would
        // be x_monnam()'s "it", which the last rows of this test pin.
        state.u.uprops[DETECT_MONSTERS] = {
            intrinsic: 1, extrinsic: 0, blocked: 0,
        };
        const monster = {
            data: { pmnames: ['pony'] },
            mextra: {},
            misc_worn_check: W_SADDLE,
            mtame: 10, // A positive tame value selects ARTICLE_YOUR.
        };

        assert.equal(monsterCommonName(monster, state), 'the saddled pony');
        assert.equal(
            capitalizedMonsterName(monster, state),
            'The saddled pony',
        );
        assert.equal(
            capitalizedAlwaysVisibleMonsterName(monster, state),
            'Your saddled pony',
        );
        assert.equal(
            monsterPossessive(monster, state, true),
            "The saddled pony's",
        );

        state.u.uprops[BLINDED] = {
            intrinsic: 1,
            extrinsic: 0,
            blocked: 0,
        };
        assert.equal(monsterCommonName(monster, state), 'the pony');
        monster.mextra.mgivenname = 'Horses';
        assert.equal(monsterPossessive(monster, state), "Horses'");

        // do_name.c x_monnam():863-865 and 876-885. A hero who cannot spot the
        // monster gets "it", ahead of the given name, the article and the
        // saddle adjective alike. noit_mon_nam() (1053-1060) is the one
        // wrapper that keeps its name, because it passes SUPPRESS_IT.
        state.u.uprops[DETECT_MONSTERS].intrinsic = 0;
        assert.equal(monsterCommonName(monster, state), 'it');
        assert.equal(capitalizedMonsterName(monster, state), 'It');
        assert.equal(
            capitalizedAlwaysVisibleMonsterName(monster, state),
            'Horses',
        );
        delete monster.mextra.mgivenname;
        assert.equal(
            capitalizedAlwaysVisibleMonsterName(monster, state),
            'Your pony',
        );

        // The mask is checked the way x_monnam()'s is, so the two partial
        // spellings of one C function agree on an unported flag. A port of
        // do_name.c noname_monnam() (1104-1107) would pass SUPPRESS_NAME, and
        // C's do_name at :872 answers the species where the given-name line
        // here would answer the name; the refusal is what keeps that from
        // being a silent wrong string.
        assert.throws(
            () => monsterCommonName(monster, state, SUPPRESS_NAME),
            UnsupportedMonsterNameError,
        );
    });

test('obj_pmname reads every corpse-statue gender and cleric substitution',
    () => {
        const state = {};
        monst_globals_init(state);
        const body = (otyp, corpsenm, spe) => ({ otyp, corpsenm, spe });

        // do_name.c:1336 admits exactly these three object types. All three
        // take the same neutral newt row from monsters.h.
        for (const otyp of [CORPSE, STATUE, FIGURINE]) {
            assert.equal(
                obj_pmname(body(otyp, PM_NEWT, CORPSTAT_RANDOM), state),
                'newt',
            );
        }

        // hack.h puts gender in spe's low two bits. The historic statue bit
        // above them must not interfere with the male selection.
        for (const [spe, expected] of [
            [CORPSTAT_FEMALE, 'gnome queen'],
            [CORPSTAT_MALE | CORPSTAT_HISTORIC, 'gnome king'],
            [CORPSTAT_NEUTER, 'gnome ruler'],
            [CORPSTAT_RANDOM, 'gnome ruler'],
        ]) {
            assert.equal(
                obj_pmname(body(STATUE, PM_GNOME_RULER, spe), state),
                expected,
            );
        }

        // A random aligned cleric substitutes the role species so that its
        // neutral name is "cleric". Explicit neuter is deliberately distinct
        // and retains "aligned cleric"; explicit sexes retain priest/priestess.
        for (const [spe, expected] of [
            [CORPSTAT_RANDOM, 'cleric'],
            [CORPSTAT_FEMALE, 'priestess'],
            [CORPSTAT_MALE, 'priest'],
            [CORPSTAT_NEUTER, 'aligned cleric'],
        ]) {
            assert.equal(
                obj_pmname(body(STATUE, PM_ALIGNED_CLERIC, spe), state),
                expected,
            );
        }

        // C's impossible() branch still returns its fixed sentinel. Pin both
        // halves of the admission condition independently.
        assert.equal(
            obj_pmname(body(LONG_SWORD, PM_NEWT, 0), state),
            'two-legged glorkum-seeker',
        );
        assert.equal(
            obj_pmname(body(STATUE, NUMMONS, 0), state),
            'two-legged glorkum-seeker',
        );
    });

test('bogon_is_pname recognizes only the three personal-name codes', () => {
    for (const code of ['-', '+', '=']) assert.equal(bogon_is_pname(code), true);
    for (const code of ['', '_', '|']) assert.equal(bogon_is_pname(code), false);
});

test('Amonnam preserves gender, invisibility, appearance, and display RNG', () => {
    const state = {
        u: { uprops: [], uroleplay: { blind: false } },
    };
    monst_globals_init(state);
    const monster = {
        data: state.mons[PM_GNOME_RULER],
        female: true,
        mextra: {},
        minvis: true,
        misc_worn_check: W_SADDLE,
        m_ap_type: 0,
    };
    assert.equal(Amonnam(monster, { state }), 'An invisible saddled gnome queen');

    monster.data = state.mons[PM_NEWT];
    monster.m_ap_type = M_AP_MONSTER;
    monster.mappearance = PM_GNOME_RULER;
    assert.equal(Amonnam(monster, { state }), 'An invisible saddled gnome queen');
    assert.equal(
        x_monnam(
            monster,
            ARTICLE_A,
            null,
            SUPPRESS_IT | SUPPRESS_INVISIBLE,
            false,
            state,
        ),
        'a saddled gnome queen',
        'x_monnam changes only the base name for a monster appearance',
    );

    const pname = state.mons.find((species) => species.mflags2 & M2_PNAME);
    assert.ok(pname, 'catalog has an apparent personal name');
    monster.minvis = false;
    monster.misc_worn_check = 0;
    monster.mappearance = pname.pmidx;
    // M_AP_MONSTER changes pm_name only.  C decides whether an article is
    // suppressed from the real newt, so a personal-looking appearance still
    // takes ARTICLE_A.
    assert.equal(
        Amonnam(monster, { state }),
        `A ${pname.pmnames[0] ?? pname.pmnames[2]}`,
    );

    monster.data = state.mons[PM_GHOST];
    monster.mappearance = PM_GNOME_RULER;
    monster.mextra.mgivenname = 'Alex';
    assert.equal(Amonnam(monster, { state }), "Alex's ghost");
    delete monster.mextra.mgivenname;

    monster.m_ap_type = 0;
    monster.data = state.mons[PM_NEWT];
    monster.minvis = true;
    monster.misc_worn_check = W_SADDLE;
    state.u.uprops[BLINDED] = {
        intrinsic: 1,
        extrinsic: 0,
        blocked: 0,
    };
    assert.equal(Amonnam(monster, { state }), 'An invisible newt');
    state.u.uprops[BLINDED] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    const selected = state.mons.findIndex((species, index) => (
        index >= LOW_PM
        && index < SPECIAL_PM
        && !(species.mflags2 & M2_PNAME)
        && !(species.geno & G_NOGEN)
    ));
    const displayDraws = [selected, 0];
    assert.equal(
        Amonnam(monster, {
            state,
            displayRandom(bound) {
                const result = displayDraws.shift();
                assert.ok(result < bound);
                return result;
            },
        }),
        `An invisible ${
            state.mons[selected].pmnames[0]
                ?? state.mons[selected].pmnames[2]
        }`,
    );
    assert.deepEqual(displayDraws, []);
});

test('x_monnam decides hallucination at run time, not by suppress flag', () => {
    const state = {
        u: { uprops: [], uroleplay: { blind: false } },
        program_state: {},
    };
    monst_globals_init(state);
    state.u.uprops[HALLUC] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    state.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    const monster = {
        data: state.mons[PM_NEWT],
        mextra: {},
        m_ap_type: 0,
        mtame: 0,
        cham: -1,
        mx: 1,
        my: 1,
    };
    // apply.c:392 and insight.c:3392 pass exactly these two bits, and nothing
    // else; before this pair of callers arrived the port demanded
    // SUPPRESS_HALLUCINATION as well and stopped here.
    const STETHOSCOPE = SUPPRESS_IT | SUPPRESS_INVISIBLE;
    assert.equal(
        x_monnam(monster, ARTICLE_A, null, STETHOSCOPE, false, state),
        'a newt',
    );

    // do_name.c:861 raises do_hallu for a hallucinating hero whose caller did
    // not suppress it, and :950-955 then replaces the whole name with
    // rndmonnam(), which draws from the display RNG once per rejected species
    // and once more for the gender. Neither draw is measured yet.
    state.u.uprops[HALLUC].intrinsic = 1;
    assert.throws(
        () => x_monnam(monster, ARTICLE_A, null, STETHOSCOPE, false, state),
        UnsupportedMonsterNameError,
    );

    // youprop.h:119-120 spells Hallucination as the intrinsic minus
    // resistance from either source, so a resistant hero is not hallucinating.
    state.u.uprops[HALLUC_RES].extrinsic = 1;
    assert.equal(
        x_monnam(monster, ARTICLE_A, null, STETHOSCOPE, false, state),
        'a newt',
    );
    state.u.uprops[HALLUC_RES].extrinsic = 0;

    // steed.c mount_steed() passes SUPPRESS_HALLUCINATION, which is what its
    // killer string needs: the same hallucinating hero gets the true name.
    assert.equal(
        x_monnam(monster, ARTICLE_A, null,
                 STETHOSCOPE | SUPPRESS_HALLUCINATION, false, state),
        'a newt',
    );

    // do_name.c:845-846. Disclosure names every monster truly, so the game
    // being over sets the bit for a caller that did not.
    state.program_state.gameover = true;
    assert.equal(
        x_monnam(monster, ARTICLE_A, null, STETHOSCOPE, false, state),
        'a newt',
    );
});

test('the source novel catalog has all 41 titles in stable order', () => {
    assert.equal(SIR_TERRY_NOVELS.length, 41);
    assert.equal(SIR_TERRY_NOVELS[0], 'The Colour of Magic');
    assert.equal(SIR_TERRY_NOVELS[33], 'Thud!');
    assert.equal(SIR_TERRY_NOVELS[40], "The Shepherd's Crown");
    assert.ok(Object.isFrozen(SIR_TERRY_NOVELS));
});

test('rndmonnam retries source-excluded monsters before its gender draw', () => {
    const state = {};
    monst_globals_init(state);
    const excluded = state.mons.findIndex((monster, index) => (
        index >= LOW_PM
        && index < SPECIAL_PM
        && ((monster.mflags2 & M2_PNAME) || (monster.geno & G_NOGEN))
    ));
    const ordinary = state.mons.findIndex((monster, index) => (
        index >= LOW_PM
        && index < SPECIAL_PM
        && !(monster.mflags2 & M2_PNAME)
        && !(monster.geno & G_NOGEN)
        && monster.pmnames[1]
    ));
    assert.ok(excluded >= LOW_PM);
    assert.ok(ordinary >= LOW_PM);
    const script = [
        { bound: SPECIAL_PM + 100 - LOW_PM, result: excluded },
        { bound: SPECIAL_PM + 100 - LOW_PM, result: ordinary },
        { bound: 2, result: 1 },
    ];

    assert.equal(rndmonnam({
        state,
        random(bound) {
            const next = script.shift();
            assert.deepEqual(next?.bound, bound);
            return next.result;
        },
    }), state.mons[ordinary].pmnames[1]);
    assert.deepEqual(script, []);
});

test('rndmonnam uses the generated bogusmon byte layout and strips codes', () => {
    const state = {};
    monst_globals_init(state);
    // makedefs emits one 60-byte header record before the 7,640-byte selectable
    // bogusmon payload used as get_rnd_text()'s offset bound.
    const selectableBytes = RANDOM_TEXT_FILES.bogusmon.length - 60;
    assert.equal(selectableBytes, 7640);
    const script = [
        { bound: SPECIAL_PM + 100 - LOW_PM, result: SPECIAL_PM },
        // Offset zero skips the generated "grue" default and selects the
        // first source record.
        { bound: selectableBytes, result: 0 },
    ];
    assert.equal(rndmonnam({
        state,
        random(bound) {
            const next = script.shift();
            assert.deepEqual(next?.bound, bound);
            return next.result;
        },
    }), 'jumbo shrimp');
    assert.deepEqual(script, []);

    const comment = "#\tgenerated\n";
    // MD_PAD_BOGONS includes the trailing newline in each padded record.
    const pad = (text) => `${text}${
        '_'.repeat(MD_PAD_BOGONS - 1 - text.length)
    }\n`;
    const files = {
        bogusmon: comment
            + xcrypt(pad('discard'))
            + xcrypt(pad('-Alice')),
    };
    const selected = bogusmon({
        files,
        random: () => 0,
    });
    assert.deepEqual(selected, { name: 'Alice', code: '-' });
});

test('noveltitle stores a random index only for the -1 sentinel', () => {
    const random = titleDraw(33);
    assert.deepEqual(noveltitle(-1, random.env), {
        novelidx: 33,
        title: 'Thud!',
    });
    assert.equal(random.draws, 1);
});

test('noveltitle consumes a draw before honoring a valid saved index', () => {
    const random = titleDraw(33);
    assert.deepEqual(noveltitle(3, random.env), {
        novelidx: 3,
        title: 'Mort',
    });
    assert.equal(random.draws, 1);
});

test('noveltitle leaves invalid indices untouched but uses its draw', () => {
    const random = titleDraw(9);
    assert.deepEqual(noveltitle(99, random.env), {
        novelidx: 99,
        title: 'Moving Pictures',
    });
    assert.equal(random.draws, 1);
});

test('lookup_novel canonicalizes source aliases and preserves valid fallback', () => {
    assert.deepEqual(lookup_novel('Color of Magic', 12), {
        novelidx: 0,
        title: 'The Colour of Magic',
    });
    assert.deepEqual(lookup_novel('sorcery', 12), {
        novelidx: 4,
        title: 'Sourcery',
    });
    assert.deepEqual(lookup_novel('Masquerade', 12), {
        novelidx: 17,
        title: 'Maskerade',
    });
    assert.deepEqual(lookup_novel('The Amazing Maurice', 12), {
        novelidx: 27,
        title: 'The Amazing Maurice and His Educated Rodents',
    });
    assert.deepEqual(lookup_novel('Thud', 12), {
        novelidx: 33,
        title: 'Thud!',
    });
    assert.deepEqual(lookup_novel('not a Discworld novel', 12), {
        novelidx: 12,
        title: 'Small Gods',
    });
    assert.deepEqual(lookup_novel('Light Fantastic', 9), {
        novelidx: 9,
        title: 'Moving Pictures',
    });
    assert.deepEqual(lookup_novel('light fantastic', 9), {
        novelidx: 1,
        title: 'The Light Fantastic',
    });
    assert.deepEqual(lookup_novel('not a Discworld novel', -1), {
        novelidx: -1,
        title: null,
    });
    // C folds ASCII only; Unicode's Kelvin sign must not become an ASCII k.
    assert.deepEqual(lookup_novel('MaKing Money', 9), {
        novelidx: 9,
        title: 'Moving Pictures',
    });
});

test('lookup_novel applies the configured-fruit article exception', () => {
    // Fruit ids start at one; only exact fruit-name identity matters here.
    const fruit = {
        fname: 'Light Fantastic',
        fid: 1,
        nextf: null,
    };
    const noArtifactState = {
        gf: { ffruit: fruit },
        // artilist[0] is the source table's unused dummy and the zero type
        // after it is its terminator, so this is an artifact table with no
        // artifacts in it.
        artilist: [{ otyp: 0 }, { otyp: 0 }],
    };
    assert.deepEqual(lookup_novel('Light Fantastic', 9, {
        state: noArtifactState,
    }), {
        novelidx: 1,
        title: 'The Light Fantastic',
    });

    const artifactState = {
        gf: { ffruit: fruit },
        artilist: [
            { otyp: 0 },
            // Any nonzero type keeps this artifact-table entry live.
            { otyp: 1, name: 'Light Fantastic' },
            // A zero type is the source table terminator.
            { otyp: 0 },
        ],
    };
    assert.deepEqual(lookup_novel('Light Fantastic', 9, {
        state: artifactState,
    }), {
        novelidx: 9,
        title: 'Moving Pictures',
    });

    artifactState.artilist[1].name = 'The Light Fantastic';
    assert.deepEqual(lookup_novel('Light Fantastic', 9, {
        state: artifactState,
    }), {
        novelidx: 1,
        title: 'The Light Fantastic',
    });

    // objnam.c:2192 asks artifact_name() with fuzzy FALSE, so an artifact
    // whose name differs from the fruit's only by a space is not that fruit's
    // artifact and the article goes back in.  A fuzzy comparison here would
    // treat the two as one name and drop it.
    artifactState.artilist[1].name = 'LightFantastic';
    assert.deepEqual(lookup_novel('Light Fantastic', 9, {
        state: artifactState,
    }), {
        novelidx: 1,
        title: 'The Light Fantastic',
    });
});

test('christen_monst refreshes a leashed name after rename and removal', () => {
    const monster = {
        mleashed: true,
        mextra: { mgivenname: 'Fido' },
    };
    const observed = [];
    const env = {
        updateInventory() {
            observed.push(monster.mextra?.mgivenname ?? '');
        },
    };

    assert.equal(christen_monst(monster, 'Rover', env), monster);
    assert.equal(monster.mextra.mgivenname, 'Rover');
    assert.equal(christen_monst(monster, '', env), monster);
    assert.equal(monster.mextra.mgivenname, undefined);
    assert.deepEqual(observed, ['Rover', '']);
});

test('christen_monst preflights a leashed inventory refresh', () => {
    const monster = {
        mleashed: true,
        mextra: { mgivenname: 'Fido' },
    };
    assert.throws(
        () => christen_monst(monster, 'Rover'),
        /requires update_inventory/,
    );
    assert.equal(monster.mextra.mgivenname, 'Fido');
});

// do_name.c oname() and new_oname(). objnam.c readobjnam() is the only live
// caller, and scripts/run-wizard-wish.mjs carries its end-to-end evidence;
// these pin what a wish cannot show.
function namingState() {
    const state = {
        flags: { initalign: 0 },
        urole: { ...roles.find((role) => role.filecode === 'Val') },
        urace: { ...races.find((race) => race.noun === 'human') },
    };
    objects_globals_init(state);
    init_artifacts(state);
    return state;
}

test('oname names an object and converts a matching artifact', () => {
    const state = namingState();

    // A name no artifact carries is only a label: do_name.c:394-397 writes
    // ONAME and 399-400's artifact_exists() finds nothing to make.
    const plain = { otyp: LONG_SWORD, oartifact: 0, where: OBJ_FREE };
    assert.equal(oname(plain, 'Fido', ONAME_WISH, { state }), plain);
    assert.equal(plain.oextra.oname, 'Fido');
    assert.equal(plain.oartifact, 0);

    // The artifact's own type and name together make the artifact.
    const sword = { otyp: LONG_SWORD, oartifact: 0, where: OBJ_FREE };
    oname(sword, 'Excalibur', ONAME_WISH, { state });
    assert.equal(sword.oartifact, ART_EXCALIBUR);
    assert.equal(state.artiexist[ART_EXCALIBUR].exists, 1);
    assert.equal(state.artiexist[ART_EXCALIBUR].wish, 1);

    // 385-388: a second object cannot take a name the game has already used.
    // The would-be duplicate keeps whatever name it had, which is none.
    const duplicate = { otyp: LONG_SWORD, oartifact: 0, where: OBJ_FREE };
    oname(duplicate, 'Excalibur', ONAME_WISH, { state });
    assert.equal(duplicate.oartifact, 0);
    assert.equal(duplicate.oextra, undefined);

    // The same test spares an object that is already an artifact, so naming
    // Excalibur "Fido" changes nothing about it.
    oname(sword, 'Fido', ONAME_WISH, { state });
    assert.equal(sword.oextra.oname, 'Excalibur');

    // 392: new_oname() drops the old name, so renaming replaces rather than
    // appends, and an empty name clears it.
    oname(plain, 'Rover', ONAME_WISH, { state });
    assert.equal(plain.oextra.oname, 'Rover');
    oname(plain, '', ONAME_WISH, { state });
    assert.equal(has_oname(plain), false);
});

test('oname truncates a name at PL_PSIZ and stops on a held object', () => {
    const state = namingState();
    const obj = { otyp: LONG_SWORD, oartifact: 0, where: OBJ_FREE };

    // do_name.c:381-385 keeps PL_PSIZ - 1 bytes plus the terminator, so a
    // 70-character name comes back 62 characters long.
    oname(obj, 'x'.repeat(70), ONAME_WISH, { state });
    assert.equal(obj.oextra.oname.length, PL_PSIZ - 1);
    // One byte shorter than the limit is kept whole.
    oname(obj, 'y'.repeat(PL_PSIZ - 1), ONAME_WISH, { state });
    assert.equal(obj.oextra.oname.length, PL_PSIZ - 1);
    oname(obj, 'z'.repeat(PL_PSIZ - 2), ONAME_WISH, { state });
    assert.equal(obj.oextra.oname.length, PL_PSIZ - 2);

    // C measures the buffer in bytes, so a name of multi-byte characters is
    // cut on a byte boundary rather than a code-point one -- and the cut can
    // land inside a character. 'a' plus forty e-acutes is 81 bytes; keeping
    // PL_PSIZ - 1 of them keeps 'a', thirty whole e-acutes and the leading
    // 0xC3 of the thirty-first, which decodeUtf8ByteString() carries as the
    // low-surrogate escape 0xDC00 + 0xC3. A code-point truncation would have
    // kept 62 characters instead of 32.
    oname(obj, `a${'é'.repeat(40)}`, ONAME_WISH, { state });
    assert.equal(obj.oextra.oname.length, 32);
    assert.equal(obj.oextra.oname.slice(0, 31), `a${'é'.repeat(30)}`);
    assert.equal(obj.oextra.oname.charCodeAt(31), 0xDCC3);

    // 424-425 refreshes the inventory window for an object the hero holds; a
    // wish reaches hold_another_object() only after oname() has returned, so
    // no ported caller carries one and the arm stops.
    const held = { otyp: LONG_SWORD, oartifact: 0, where: OBJ_INVENT };
    assert.throws(() => oname(held, 'Fido', ONAME_WISH, { state }),
                  /update_inventory/u);
});

// do_name.c mon_nam_too() (1189-1216). mhitm.c missmm() and hitmm() name the
// defender through it, so the pronoun rows are what a monster attacking itself
// would read. mondata.c pronoun_gender() decides which one, and its
// PRONOUN_HALLU arm spends the only draw here.
test('mon_nam_too swaps a second reference for a reflexive pronoun', () => {
    const state = {
        mons: [],
        u: { uprops: [], uroleplay: { blind: false } },
    };
    // mon_nam_too() reaches mon_nam(), whose do_it arm answers "it" for a
    // monster the hero cannot spot. Detect_monsters is sensemon()'s operand
    // that a monster standing nowhere can still satisfy.
    state.u.uprops[DETECT_MONSTERS] = {
        intrinsic: 1, extrinsic: 0, blocked: 0,
    };
    const other = {
        data: { pmnames: ['jackal'], mflags1: 0, mflags2: 0, mflags3: 0 },
        mextra: {},
    };
    const mon = {
        data: {
            pmnames: ['gnome lord'],
            // mondata.h humanoid() is the first term pronoun_gender() reads
            // after the neuter test, and M1_HUMANOID is its flag.
            mflags1: M1_HUMANOID,
            mflags2: 0,
            mflags3: 0,
            geno: 0,
        },
        female: false,
        mextra: {},
    };
    const env = { canSpotMonster: () => true, random: { rn2: () => 3 } };

    // Two different monsters read as an ordinary name.
    assert.equal(mon_nam_too(mon, other, state, env), 'the gnome lord');

    // The same monster twice reads as a pronoun chosen by gender.
    assert.equal(mon_nam_too(mon, mon, state, env), 'himself');
    mon.female = true;
    assert.equal(mon_nam_too(mon, mon, state, env), 'herself');

    // A monster the hero cannot spot is neuter, which is C's `default` arm
    // sharing its body with `case 2`.
    const unseen = { ...env, canSpotMonster: () => false };
    assert.equal(mon_nam_too(mon, mon, state, unseen), 'itself');

    // Hallucination lets pronoun_gender() answer 3, C's "could happen when
    // hallucinating" row.
    state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    assert.equal(mon_nam_too(mon, mon, state, env), 'themselves');
});
