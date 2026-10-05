import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { AD_SLIM, AT_CLAW, PM_GREEN_SLIME, PM_HUMAN } from '../js/monsters.js';
import { cloneIsaacContext, createCoreRandom } from '../js/rng.js';
import { mhitm_ad_slim, mhitm_adtyping } from '../js/uhitm.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const MHITU_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8',
);
const MHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitm.c', import.meta.url), 'utf8',
);
const DATETIME = '20330719091500';
const RC = [
    'OPTIONS=name:SlimeBranch,role:Wizard,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
    '',
].join('\n');

async function startGame(seed) {
    await runSegment({ seed, datetime: DATETIME, nethackrc: RC, moves: '' });
    game.program_state.in_moveloop = true;
    return game;
}

function defender(state, id, extra = {}) {
    const x = state.u.ux + 1;
    const y = state.u.uy;
    const monster = newMonster({
        data: state.mons[PM_HUMAN],
        mnum: PM_HUMAN,
        m_id: id,
        mx: x,
        my: y,
        mhp: 20,
        mhpmax: 20,
        movement: 12,
        mcanmove: true,
        mcansee: true,
        ...extra,
    });
    place_monster(monster, x, y, state);
    monster.nmon = state.level.monlist;
    state.level.monlist = monster;
    return monster;
}

function attack() {
    return { aatyp: AT_CLAW, adtyp: AD_SLIM, damn: 2, damd: 4 };
}

function effect(draws, messages, state = game) {
    const fallback = createCoreRandom(
        cloneIsaacContext(state.coreCtx),
        state,
    );
    return {
        random: {
            rn2(bound) {
                if (draws.length) {
                    const next = draws.shift();
                    assert.equal(next[0], bound);
                    return next[1];
                }
                return fallback.rn2(bound);
            },
            d: fallback.d,
            rn1: fallback.rn1,
            rnd: fallback.rnd,
            rne: fallback.rne,
            rnl: fallback.rnl,
            rnz: fallback.rnz,
        },
        message: async (line) => { messages.push(line); },
        unsupported: (reason) => assert.fail(reason),
    };
}

test('mhitm_ad_slim matches the full C order and its three caller directions',
    () => {
    const body = UHITM_C.match(
        /void\s+mhitm_ad_slim\([\s\S]*?\n\}/u,
    )?.[0];
    assert.ok(body, 'uhitm.c defines the whole selected function');
    assert.match(body,
        /boolean negated = mhitm_mgc_atk_negated\(magr, mdef, FALSE\);[\s\S]*?if \(magr == &gy\.youmonst\)/u);
    assert.match(body,
        /mhitm_mgc_atk_negated\(magr, mdef, FALSE\);[\s\S]*?if \(magr == &gy\.youmonst\)[\s\S]*?!rn2\(4\) && !slimeproof\(pd\)[\s\S]*?munslime\(mdef, TRUE\)[\s\S]*?newcham\(mdef, &mons\[PM_GREEN_SLIME\]/u);
    assert.match(body,
        /else if \(mdef == &gy\.youmonst\)[\s\S]*?hitmsg\(magr, mattk\);[\s\S]*?flaming\(pd\)[\s\S]*?make_slimed\(10L, \(char \*\) 0\);[\s\S]*?delayed_killer\(SLIMED/u);
    assert.match(body,
        /else \{\s*\/\* mhitm \*\/[\s\S]*?!rn2\(4\) && !slimeproof\(pd\)[\s\S]*?munslime\(mdef, FALSE\)[\s\S]*?mdef->mstrategy &= ~STRAT_WAITFORU;[\s\S]*?mhm->damage = 0;/u);
    assert.match(UHITM_C,
        /case AD_SLIM:\s*mhitm_ad_slim\(magr, mattk, mdef, mhm\);\s*break;/u);
    assert.match(UHITM_C,
        /mhitm_adtyping\(&gy\.youmonst, mattk, mdef, &mhm\);/u);
    assert.match(MHITU_C,
        /mhitm_adtyping\(mtmp, mattk, &gy\.youmonst, &mhm\);/u);
    assert.match(MHITM_C,
        /mhitm_adtyping\(magr, mattk, mdef, &mhm\);/u);
});

test('hero AD_SLIM converts a non-slimeproof defender after both source draws',
    async () => {
    // Seed 884201 supplies the game's starting RNG context; the adjacent
    // human defender is placed by this fixture, and these injected C draws
    // select an unnegated attack followed by its one-in-four slime effect.
    const state = await startGame(884201);
    const target = defender(state, 98101, { mtrapped: true });
    const draws = [[10, 9], [4, 0]];
    const messages = [];
    const mhm = { damage: 7, specialdmg: 0, done: false, hitflags: 0 };

    await mhitm_adtyping(
        state.youmonst,
        attack(),
        target,
        mhm,
        state,
        effect(draws, messages, state),
    );

    assert.deepEqual(draws, [], 'negation and AD_SLIM gate draws are consumed');
    assert.equal(target.data, state.mons[PM_GREEN_SLIME]);
    assert.equal(mhm.damage, 0);
    assert.equal(mhm.hitflags, 0,
        'C uhitm sets a hit flag only when its defender dies');
});

test('hero AD_SLIM keeps physical damage when the one-in-four gate misses',
    async () => {
    // Seed 884202 supplies the same source-valid adjacent target; rn2(4)=1
    // deliberately misses the conversion branch after a successful attack.
    const state = await startGame(884202);
    const target = defender(state, 98102, { mtrapped: true });
    const draws = [[10, 9], [4, 1]];
    const messages = [];
    const mhm = { damage: 7, specialdmg: 0, done: false, hitflags: 0 };

    await mhitm_ad_slim(
        state.youmonst,
        attack(),
        target,
        mhm,
        state,
        effect(draws, messages, state),
    );

    assert.deepEqual(draws, [], 'both source draws are consumed');
    assert.equal(target.data, state.mons[PM_HUMAN]);
    assert.equal(mhm.damage, 7);
    assert.equal(mhm.hitflags, 0);
});
