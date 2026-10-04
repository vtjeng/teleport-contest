import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    A_CON,
    FAINTED,
    SATIATED,
} from '../js/const.js';
import {
    AD_FAMN,
    PM_BLACK_PUDDING,
    PM_FAMINE,
    PM_MUMAK,
    PM_NEWT,
    PM_ROCK_MOLE,
    PM_STONE_GOLEM,
} from '../js/monsters.js';
import { game } from '../js/gstate.js';
import { mhitm_ad_famn, mhitm_adtyping } from '../js/uhitm.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster } from '../js/monst.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const MHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitm.c', import.meta.url), 'utf8',
);
const MHITU_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8',
);
const MONSTERS_C = readFileSync(
    new URL('../nethack-c/upstream/include/monsters.h', import.meta.url), 'utf8',
);
const MONFLAG_H = readFileSync(
    new URL('../nethack-c/upstream/include/monflag.h', import.meta.url), 'utf8',
);
const UHITM_JS = readFileSync(new URL('../js/uhitm.js', import.meta.url), 'utf8');

// These independent fixture values create an ordinary in-moveloop hero; the
// full C-first recipes separately establish the live production callers.
const SEED = 7204813;
const DATETIME = '20381015113000';
const NETHACKRC = [
    'OPTIONS=name:A86FamineTest,role:Tourist,race:human,gender=female,align=neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,playmode:debug,pettype:none,!autopickup,!acoustics,!safe_wait',
    '',
].join('\n');

async function startGame() {
    await runSegment({
        seed: SEED,
        datetime: DATETIME,
        nethackrc: NETHACKRC,
        moves: '', // No commands; initialize the ordinary hero state only.
    });
    game.program_state.in_moveloop = true;
    return game;
}

function monster(state, species) {
    return newMonster({
        data: state.mons[species],
        mnum: species,
        mx: state.u.ux + 1, // Adjacent position for source-style message location.
        my: state.u.uy,
    });
}

function attackEnv(random = {}) {
    return {
        random,
        message: async () => {},
        unsupported: (reason) => assert.fail(reason),
        encumberMessage: async () => {},
    };
}

test('mhitm_ad_famn follows the complete C body and AD_FAMN callers', () => {
    const body = UHITM_C.match(
        /void\s+mhitm_ad_famn\([\s\S]*?\n\}\n\nvoid\nmhitm_ad_pest/u,
    )?.[0];
    assert.ok(body, 'uhitm.c defines the complete selected function');
    assert.match(body,
        /if \(magr == &gy\.youmonst\)[\s\S]*?goto mhitm_famn;[\s\S]*?else if \(mdef == &gy\.youmonst\)[\s\S]*?pline_mon\(magr, "%s reaches out, and your body shrivels\."[\s\S]*?exercise\(A_CON, FALSE\);[\s\S]*?if \(!is_fainted\(\)\)\s*morehungry\(rn1\(40, 40\)\);[\s\S]*?mhitm_famn:[\s\S]*?if \(!\(carnivorous\(pd\)\s*\|\|\s*herbivorous\(pd\)\s*\|\|\s*metallivorous\(pd\)\)\)[\s\S]*?mhm->damage = 0;/u);
    assert.match(UHITM_C,
        /case AD_FAMN:\s*mhitm_ad_famn\(magr, mattk, mdef, mhm\);\s*break;/u);
    assert.match(MHITM_C,
        /mhitm_adtyping\(magr, mattk, mdef, &mhm\);/u);
    assert.match(MHITU_C,
        /mhitm_adtyping\(mtmp, mattk, &gy\.youmonst, &mhm\);/u);
    assert.match(UHITM_C,
        /mhitm_adtyping\(&gy\.youmonst, mattk, mdef, &mhm\);/u);

    const jsBody = UHITM_JS.match(
        /export async function mhitm_ad_famn\([\s\S]*?\n\}\n\n\/\/ C ref: uhitm\.c mhitm_ad_pest/u,
    )?.[0];
    assert.ok(jsBody, 'uhitm.js keeps the selected function under its C name');
    assert.match(UHITM_JS,
        /case AD_FAMN:\s*await mhitm_ad_famn\(magr, mattk, mdef, mhm, state, env\);\s*break;/u);
    assert.doesNotMatch(jsBody, /note_unported|Unsupported\w*Error/u);
});

test('monster-pair Famine damage depends on the C diet flags', async () => {
    const monsterRow = (name) => {
        const start = MONSTERS_C.indexOf('MON(NAM("' + name + '")');
        const next = MONSTERS_C.indexOf('\n    MON(', start + 1);
        return start < 0 ? null : MONSTERS_C.slice(start, next);
    };
    const stoneRow = monsterRow('stone golem');
    const puddingRow = monsterRow('black pudding');
    const newtRow = monsterRow('newt');
    const mumakRow = monsterRow('mumak');
    const rockMoleRow = monsterRow('rock mole');
    const famineRow = monsterRow('Famine');
    assert.ok(stoneRow);
    assert.ok(puddingRow);
    assert.ok(newtRow);
    assert.ok(mumakRow);
    assert.ok(rockMoleRow);
    assert.ok(famineRow);
    assert.doesNotMatch(stoneRow, /M1_(?:CARNIVORE|HERBIVORE|METALLIVORE)/u);
    assert.match(puddingRow, /M1_OMNIVORE/u);
    assert.match(newtRow, /M1_CARNIVORE/u);
    assert.match(mumakRow, /M1_HERBIVORE/u);
    assert.match(rockMoleRow, /M1_METALLIVORE/u);
    assert.match(famineRow, /AT_TUCH, AD_FAMN/u);
    assert.equal([...MONSTERS_C.matchAll(/\bAD_FAMN\b/gu)].length, 2,
        'the source has only the two AD_FAMN attacks on Famine');
    assert.match(famineRow, /\(G_UNIQ \| G_NOGEN\)/u);
    assert.match(famineRow, /M2_NOPOLY/u,
        'the only AD_FAMN monster cannot be a valid hero polymorph form');
    assert.match(MONFLAG_H, /#define M1_OMNIVORE\s+0x60000000L/u);

    const state = await startGame();
    const famine = monster(state, PM_FAMINE);
    const stoneGolem = monster(state, PM_STONE_GOLEM);
    const blackPudding = monster(state, PM_BLACK_PUDDING);
    const newt = monster(state, PM_NEWT);
    const mumak = monster(state, PM_MUMAK);
    const rockMole = monster(state, PM_ROCK_MOLE);
    const attack = { adtyp: AD_FAMN };
    const initialDamage = 17; // Sentinel normal damage from C's mdamagem setup.
    const stoneDamage = { damage: initialDamage, hitflags: 0, done: false };
    const puddingDamage = { damage: initialDamage, hitflags: 0, done: false };
    const newtDamage = { damage: initialDamage, hitflags: 0, done: false };
    const mumakDamage = { damage: initialDamage, hitflags: 0, done: false };
    const rockMoleDamage = { damage: initialDamage, hitflags: 0, done: false };

    await mhitm_adtyping(
        famine, attack, stoneGolem, stoneDamage, state, attackEnv(),
    );
    await mhitm_adtyping(
        famine, attack, blackPudding, puddingDamage, state, attackEnv(),
    );
    await mhitm_adtyping(
        famine, attack, newt, newtDamage, state, attackEnv(),
    );
    await mhitm_adtyping(
        famine, attack, mumak, mumakDamage, state, attackEnv(),
    );
    await mhitm_adtyping(
        famine, attack, rockMole, rockMoleDamage, state, attackEnv(),
    );

    assert.equal(stoneDamage.damage, 0,
        'the C non-eater arm clears the normal damage');
    assert.equal(puddingDamage.damage, initialDamage,
        'the C omnivore arm leaves normal damage intact');
    assert.equal(newtDamage.damage, initialDamage,
        'the source-recorded carnivorous Newt also remains edible');
    assert.equal(mumakDamage.damage, initialDamage,
        'the C herbivore arm leaves normal damage intact');
    assert.equal(rockMoleDamage.damage, initialDamage,
        'the C metallivore arm leaves normal damage intact');
});

test('monster-to-hero Famine calls exercise before the 40-plus-rn2 hunger drain', async () => {
    const state = await startGame();
    const famine = monster(state, PM_FAMINE);
    const messages = [];
    const events = [];
    const draws = [];
    const random = {
        rn2(bound) {
            draws.push(['rn2', bound]);
            return 1; // C's Constitution exercise decrement consumes rn2(2).
        },
        rn1(bound, base) {
            draws.push(['rn1', bound, base]);
            return base + 3; // A bounded sample inside C's rn1(40, 40).
        },
    };
    const env = {
        ...attackEnv(random),
        message: async (line) => { messages.push(line); },
        encumberMessage: async () => { events.push('encumber_msg'); },
    };
    const hungerBefore = 1500; // Remains SATIATED after the 43-point drain.
    state.u.uhunger = hungerBefore;
    state.u.uhs = SATIATED;
    state.u.aexe[A_CON] = 0; // Keep the C exercise branch below AVAL=50.
    state.moves = 1; // C calls encumber_msg after exercise once play has begun.
    const normalDamage = 9; // Sentinel damage, which this helper leaves unchanged.
    const mhm = { damage: normalDamage, hitflags: 0, done: false };

    await mhitm_ad_famn(
        famine, { adtyp: AD_FAMN }, state.youmonst, mhm, state, env,
    );

    assert.deepEqual(messages, [
        'Famine reaches out, and your body shrivels.',
    ]);
    assert.deepEqual(draws, [['rn2', 2], ['rn1', 40, 40]]);
    assert.deepEqual(events, ['encumber_msg']);
    assert.equal(state.u.uhunger, hungerBefore - 43);
    assert.equal(mhm.damage, normalDamage);
});

test('fainted hero still exercises Constitution but skips morehungry', async () => {
    const state = await startGame();
    const famine = monster(state, PM_FAMINE);
    const draws = [];
    const random = {
        rn2(bound) {
            draws.push(['rn2', bound]);
            return 1; // C's Constitution exercise decrement consumes rn2(2).
        },
        rn1() {
            assert.fail('C skips rn1(40, 40) while is_fainted() is true');
        },
    };
    const hungerBefore = 1500; // The fainted branch leaves hunger unchanged.
    state.u.uhunger = hungerBefore;
    state.u.uhs = FAINTED;
    state.u.aexe[A_CON] = 0; // Keep the C exercise branch below AVAL=50.
    state.moves = 1;

    await mhitm_ad_famn(
        famine,
        { adtyp: AD_FAMN },
        state.youmonst,
        { damage: 9, hitflags: 0, done: false },
        state,
        attackEnv(random),
    );

    assert.deepEqual(draws, [['rn2', 2]]);
    assert.equal(state.u.uhunger, hungerBefore);
});
