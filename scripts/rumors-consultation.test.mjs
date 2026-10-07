import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACH_ORCL, A_WIS, ECMD_OK, ECMD_TIME } from '../js/const.js';
import { game } from '../js/gstate.js';
import { addinv, money_cnt } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { PM_ORACLE } from '../js/monsters.js';
import { mksobj, weight } from '../js/obj.js';
import { GOLD_PIECE } from '../js/objects.js';
import { doconsult } from '../js/rumors.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/rumors.c/oracle-minor-gold-split-b133.session.json', import.meta.url)));
const source = readFileSync(new URL(
    '../nethack-c/upstream/src/rumors.c', import.meta.url), 'utf8');

async function consultation(gold = 0) {
    // Independently selected Wizard startup supplies canonical inventory,
    // achievements and attribute arrays without performing a consultation.
    await runSegment({ ...recipe.segments[0], moves: ' ' });
    if (gold) {
        const coin = mksobj(GOLD_PIECE, false, false, { state: game });
        coin.quan = gold;
        coin.owt = weight(coin, { state: game });
        addinv(coin, { state: game });
    }
    const oracle = { data: game.mons[PM_ORACLE], mpeaceful: 1,
        mx: game.u.ux, my: game.u.uy - 1, m_id: 0x7fffffff,
        minvent: null, mextra: {} };
    const messages = [];
    const prompts = [];
    const draws = [];
    const env = {
        message: async (message) => messages.push(message),
        ynq: async (prompt) => { prompts.push(prompt); return 'q'.charCodeAt(0); },
        y_n: async (prompt) => { prompts.push(prompt); return 'n'.charCodeAt(0); },
        // Zero chooses the first true rumor, offhand wording and no positive
        // Wisdom exercise: deterministic branches from getrumor/outrumor.
        random: { rn2: (bound) => { draws.push(bound); return 0; } },
    };
    return { oracle, messages, prompts, draws, env };
}

test('doconsult preserves whole source guard, payment and reward order', () => {
    const c = source.slice(source.indexOf('int\ndoconsult('),
        source.indexOf('\nstaticfn void\ncouldnt_open_file('));
    const markers = ['gm.multi = 0', 'money_cnt(gi.invent)', 'if (!oracl)',
        'else if (!oracl->mpeaceful)', 'else if (!umoney)', 'switch (ynq(qbuf))',
        'money2mon(oracl', 'disp.botl = TRUE', 'record_achievement(ACH_ORCL)',
        'outrumor(1, BY_ORACLE)', 'outoracle(cheapskate, TRUE)',
        'exercise(A_WIS, !cheapskate)', 'more_experienced(add_xpts, u_pay / 50)',
        'newexplevel()', 'return ECMD_TIME'];
    let previous = -1;
    for (const marker of markers) {
        const position = c.indexOf(marker);
        assert.ok(position > previous, `source order: ${marker}`);
        previous = position;
    }
    assert.match(c, /major_cost = 500 \+ 50 \* u\.ulevel/u);
    assert.match(c, /u_pay \/ \(u\.uevent\.major_oracle \? 25 : 10\)/u);
    assert.match(c, /u_pay \/ \(u\.uevent\.minor_oracle \? 25 : 10\)/u);
    const caller = readFileSync(new URL('../js/sounds.js', import.meta.url), 'utf8');
    assert.match(caller, /case MS_ORACLE:\s*return doconsult\(mtmp, state\)/u);
});

test('null, hostile and penniless guards reset multi before prompting', async () => {
    const c = await consultation();
    for (const [oracle, expected] of [[null, 'There is no one here to consult.'],
        [{ ...c.oracle, mpeaceful: 0 }, 'The Oracle is in no mood for consultations.'],
        [c.oracle, 'You have no gold.']]) {
        game.multi = 7; // A running command is reset even on a free return.
        assert.equal(await doconsult(oracle, game, c.env), ECMD_OK);
        assert.equal(game.multi, 0);
        assert.equal(c.messages.at(-1), expected);
    }
    assert.deepEqual(c.prompts, []);
    assert.deepEqual(c.draws, []);
});

test('quit, insufficient minor payment and major refusal spend no turn or gold', async () => {
    const c = await consultation(49); // One below the C minor cost.
    assert.equal(await doconsult(c.oracle, game, c.env), ECMD_OK);
    c.env.ynq = async () => 'y'.charCodeAt(0);
    assert.equal(await doconsult(c.oracle, game, c.env), ECMD_OK);
    assert.equal(c.messages.at(-1), "You don't even have enough gold for that!");
    c.env.ynq = async () => 'n'.charCodeAt(0);
    assert.equal(await doconsult(c.oracle, game, c.env), ECMD_OK);
    assert.equal(money_cnt(game.invent), 49);
    assert.equal(c.oracle.minvent, null);
    assert.deepEqual(c.draws, []);
});

test('minor transfer uses canonical split and grants the first five experience points', async () => {
    const c = await consultation(100); // Twice the minor cost forces splitobj.
    c.env.ynq = async () => 'y'.charCodeAt(0);
    assert.equal(await doconsult(c.oracle, game, c.env), ECMD_TIME);
    assert.equal(money_cnt(game.invent), 50);
    assert.equal(money_cnt(c.oracle.minvent), 50);
    assert.equal(game.u.uexp, 5); // First minor: 50 / 10.
    assert.equal(game.u.urexp, 21); // 4 * 5 experience + 50 / 50 score.
    assert.equal(game.u.uevent.minor_oracle, true);
    assert.ok(game.u.uachieved.includes(ACH_ORCL));
    assert.ok(c.messages[0].startsWith('True to her word, the Oracle offhandedly says:'));
    assert.deepEqual(c.draws, [2, 24924, 19, 4]); // getrumor, exercise, wording.
    assert.equal(await doconsult(c.oracle, game, c.env), ECMD_TIME);
    assert.equal(money_cnt(game.invent), 0); // Exact remaining stack now transfers.
    assert.equal(money_cnt(c.oracle.minvent), 100);
    assert.equal(game.u.uexp, 5); // A repeated minor consultation earns no XP.
});

test('first minor after major grants two points without duplicate achievement', async () => {
    const c = await consultation(50); // Exact minor cost.
    game.u.uevent.major_oracle = true;
    c.env.ynq = async () => 'y'.charCodeAt(0);
    assert.equal(await doconsult(c.oracle, game, c.env), ECMD_TIME);
    assert.equal(game.u.uexp, 2); // Previous major changes divisor to 25.
    assert.equal(game.u.uachieved.includes(ACH_ORCL), false);
});

test('major prompt guards use the canonical saved Oracle count and flag', async () => {
    const c = await consultation(51); // Smallest amount permitting the major prompt.
    c.env.ynq = async () => 'n'.charCodeAt(0);
    game.svo = { oracle_cnt: 1 }; // Only the special Oracle remains.
    assert.equal(await doconsult(c.oracle, game, c.env), ECMD_OK);
    game.svo.oracle_cnt = 0; // C's initial, not-yet-loaded Oracle count.
    game.go.oracle_flg = -1; // A prior outoracle file-open failure.
    assert.equal(await doconsult(c.oracle, game, c.env), ECMD_OK);
    game.go.oracle_flg = 0;
    assert.equal(await doconsult(c.oracle, game, c.env), ECMD_OK);
    assert.deepEqual(c.prompts, ['"Then dost thou desire a major one?" (550 zorkmids)']);
    assert.equal(money_cnt(game.invent), 51);
});

test('short major payment transfers all gold, exercises Wisdom negatively and records text gap', async () => {
    const c = await consultation(51); // Above minor, below level-one major cost.
    c.env.ynq = async () => 'n'.charCodeAt(0);
    c.env.y_n = async () => 'y'.charCodeAt(0);
    const before = game.u.aexe[A_WIS];
    c.env.random.rn2 = (bound) => { c.draws.push(bound); return 1; };
    assert.equal(await doconsult(c.oracle, game, c.env), ECMD_TIME);
    assert.equal(money_cnt(game.invent), 0);
    assert.equal(money_cnt(c.oracle.minvent), 51);
    assert.equal(game.u.uevent.major_oracle, true);
    assert.equal(game.u.uexp, 0);
    assert.equal(game.u.aexe[A_WIS], before - 1);
    assert.deepEqual(c.draws, [2]); // Negative attrib.c exercise draw.
    assert.ok(game.unported.has('rumors.c outoracle'));
});

test('full first major after minor grants 22 XP and invokes canonical level gain', async () => {
    const c = await consultation(550); // Level-one major: 500 + 50 * 1.
    c.env.ynq = async () => 'n'.charCodeAt(0);
    c.env.y_n = async () => 'y'.charCodeAt(0);
    // The previous minor changes major's divisor to 25; 550 / 25 = 22,
    // which reaches exper.c newexplevel's level-two threshold of 20.
    game.u.uevent.minor_oracle = true;
    // Leave level-gain RNG with the canonical global generator.
    delete c.env.random;
    assert.equal(await doconsult(c.oracle, game, c.env), ECMD_TIME);
    assert.equal(game.u.uexp, 22);
    assert.equal(game.u.ulevel, 2);
    assert.equal(money_cnt(c.oracle.minvent), 550);
    assert.equal(game.u.uevent.major_oracle, true);
});

test('first major earns 55 XP before level gain caps the surplus; repeats earn none', async () => {
    const c = await consultation(550); // Level-one major, without a prior minor.
    c.env.ynq = async () => 'n'.charCodeAt(0);
    c.env.y_n = async () => 'y'.charCodeAt(0);
    delete c.env.random;
    assert.equal(await doconsult(c.oracle, game, c.env), ECMD_TIME);
    assert.equal(game.u.uexp, 39); // 55 XP is capped below level-three's 40.
    assert.equal(game.u.urexp, 231); // 4 * (550 / 10) + (550 / 50).
    assert.equal(game.u.ulevel, 2);

    const repeat = await consultation(550); // Repeat at the same original level.
    game.u.uevent.major_oracle = true;
    repeat.env.ynq = async () => 'n'.charCodeAt(0);
    repeat.env.y_n = async () => 'y'.charCodeAt(0);
    assert.equal(await doconsult(repeat.oracle, game, repeat.env), ECMD_TIME);
    assert.equal(game.u.uexp, 0);
    assert.deepEqual(repeat.draws, [19]); // Full major still exercises Wisdom.
});
