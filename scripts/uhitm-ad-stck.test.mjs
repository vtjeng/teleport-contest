import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { mhitm_adtyping } from '../js/uhitm.js';
import { newMonster } from '../js/monst.js';
import {
    AD_STCK,
    AT_CLAW,
    PM_BARBED_DEVIL,
    PM_HUMAN,
    PM_LARGE_MIMIC,
} from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';

const DATETIME = '20310102030405';
const RC = [
    'OPTIONS=name:Sticking,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
    '',
].join('\n');
const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const MHITU_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8',
);
const MHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitm.c', import.meta.url), 'utf8',
);

async function start(seed) {
    await runSegment({ seed, datetime: DATETIME, nethackrc: RC, moves: '' });
    game.u.ustuck = null;
}

function fixture(pm, m_id, x, y, overrides = {}) {
    return newMonster({
        data: game.mons[pm],
        m_id,
        m_lev: game.mons[pm].mlevel,
        mcan: false,
        mx: x,
        my: y,
        mhp: 20,
        mhpmax: 20,
        ...overrides,
    });
}

function effectEnv(events, onMessage = () => {}) {
    return {
        random: {
            rn2(bound) {
                events.push(`rn2(${bound})`);
                assert.equal(bound, 10);
                return 9;
            },
        },
        message: async (line) => {
            events.push(`message:${String(line)}`);
            await onMessage(line);
        },
        unsupported: (reason) => assert.fail(reason),
    };
}

const attack = { aatyp: AT_CLAW, adtyp: AD_STCK, damn: 2, damd: 4 };

test('mhitm_ad_stck preserves source order and all three dispatcher callers', () => {
    const body = UHITM_C.match(
        /void\s+mhitm_ad_stck\([\s\S]*?\n\}\n/u,
    )?.[0];
    assert.ok(body, 'C defines the complete mhitm_ad_stck function');
    assert.match(body,
        /boolean negated = mhitm_mgc_atk_negated\(magr, mdef, FALSE\);[\s\S]*?struct permonst \*pd = mdef->data;[\s\S]*?boolean barbs = \(magr->data == &mons\[PM_BARBED_DEVIL\]\);/u);
    assert.match(body,
        /if \(magr == &gy\.youmonst\)[\s\S]*?!negated && !sticks\(pd\) && m_next2u\(mdef\)[\s\S]*?set_ustuck\(mdef\)[\s\S]*?Your\("barbs stick to %s!"/u);
    assert.match(body,
        /else if \(mdef == &gy\.youmonst\)[\s\S]*?hitmsg\(magr, mattk\);[\s\S]*?!negated && !u\.ustuck && !sticks\(pd\)[\s\S]*?set_ustuck\(magr\)[\s\S]*?pline\("The barbs stick to you!"/u);
    assert.match(body,
        /else \{\s*\/\* mhitm \*\/[\s\S]*?if \(negated\)\s*mhm->damage = 0;/u);
    assert.match(UHITM_C,
        /case AD_STCK:\s*mhitm_ad_stck\(magr, mattk, mdef, mhm\); break;/u);
    assert.match(UHITM_C,
        /mhitm_adtyping\(&gy\.youmonst, mattk, mdef, &mhm\);/u);
    assert.match(MHITU_C,
        /mhitm_adtyping\(mtmp, mattk, &gy\.youmonst, &mhm\);/u);
    assert.match(MHITM_C,
        /mhitm_adtyping\(magr, mattk, mdef, &mhm\);/u);
});

test('hero stick attack checks defender form and squared distance, then barbs',
    async () => {
        await start(8309911);
        const x = game.u.ux;
        const y = game.u.uy;
        const adjacent = fixture(PM_HUMAN, 99001, x + 1, y);
        const events = [];
        await mhitm_adtyping(
            game.youmonst, attack, adjacent,
            { damage: 4, hitflags: 0, done: false }, game,
            effectEnv(events),
        );
        assert.deepEqual(events, ['rn2(10)']);
        assert.equal(game.u.ustuck, adjacent);

        game.u.ustuck = null;
        const mimic = fixture(PM_LARGE_MIMIC, 99002, x + 1, y);
        const stickyEvents = [];
        await mhitm_adtyping(
            game.youmonst, attack, mimic,
            { damage: 4, hitflags: 0, done: false }, game,
            effectEnv(stickyEvents),
        );
        assert.deepEqual(stickyEvents, ['rn2(10)']);
        assert.equal(game.u.ustuck, null);

        const distant = fixture(PM_HUMAN, 99003, x + 3, y);
        const distantEvents = [];
        await mhitm_adtyping(
            game.youmonst, attack, distant,
            { damage: 4, hitflags: 0, done: false }, game,
            effectEnv(distantEvents),
        );
        assert.deepEqual(distantEvents, ['rn2(10)']);
        assert.equal(game.u.ustuck, null);

        game.youmonst.data = game.mons[PM_BARBED_DEVIL];
        const barbedTarget = fixture(PM_HUMAN, 99004, x + 1, y);
        const barbsEvents = [];
        await mhitm_adtyping(
            game.youmonst, attack, barbedTarget,
            { damage: 4, hitflags: 0, done: false }, game,
            effectEnv(barbsEvents),
        );
        assert.equal(game.u.ustuck, barbedTarget);
        assert.match(barbsEvents.at(-1), /^message:Your barbs stick to .*!$/u);
    },
);

test('monster stick attack messages first and uses C entry snapshots', async () => {
    await start(8309912);
    const attacker = fixture(
        PM_BARBED_DEVIL, 99011, game.u.ux + 1, game.u.uy,
    );
    const originalHeroForm = game.youmonst.data;
    const events = [];
    const env = effectEnv(events, async (line) => {
        if (String(line).startsWith('The barbed devil')) {
            attacker.data = game.mons[PM_HUMAN];
            game.youmonst.data = game.mons[PM_LARGE_MIMIC];
        }
    });
    await mhitm_adtyping(
        attacker, attack, game.youmonst,
        { damage: 4, hitflags: 0, done: false }, game, env,
    );
    assert.deepEqual(events, [
        'rn2(10)', 'message:The barbed devil hits!',
        'message:The barbs stick to you!',
    ]);
    assert.equal(game.u.ustuck, attacker);
    game.youmonst.data = originalHeroForm;
});

test('monster-pair stick attack only clears damage when magic cancellation wins',
    async () => {
        await start(8309913);
        const attacker = fixture(PM_HUMAN, 99021, game.u.ux + 1, game.u.uy);
        const defender = fixture(PM_HUMAN, 99022, game.u.ux + 2, game.u.uy);
        const damage = { damage: 7, hitflags: 0, done: false };
        const events = [];
        await mhitm_adtyping(
            attacker, attack, defender, damage, game, effectEnv(events),
        );
        assert.deepEqual(events, ['rn2(10)']);
        assert.equal(damage.damage, 7);

        attacker.mcan = true;
        const cancelled = { damage: 7, hitflags: 0, done: false };
        const cancelledEvents = [];
        await mhitm_adtyping(
            attacker, attack, defender, cancelled, game,
            effectEnv(cancelledEvents),
        );
        assert.deepEqual(cancelledEvents, []);
        assert.equal(cancelled.damage, 0);
    },
);
