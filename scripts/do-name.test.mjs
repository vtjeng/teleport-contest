import assert from 'node:assert/strict';
import test from 'node:test';

import {
    bogusmon,
    christen_monst,
    lookup_novel,
    noveltitle,
    rndmonnam,
    SIR_TERRY_NOVELS,
} from '../js/do_name.js';
import {
    G_NOGEN,
    LOW_PM,
    M2_PNAME,
    SPECIAL_PM,
    monst_globals_init,
} from '../js/monsters.js';
import { xcrypt } from '../js/random_text.js';

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
    const script = [
        { bound: SPECIAL_PM + 100 - LOW_PM, result: SPECIAL_PM },
        // Offset zero skips the generated "grue" default and selects the
        // first source record.
        { bound: 7640, result: 0 },
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
    const pad = (text) => `${text}${'_'.repeat(19 - text.length)}\n`;
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
        artilist: [{ otyp: 0 }],
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
