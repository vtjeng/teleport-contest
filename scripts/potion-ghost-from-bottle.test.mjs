// potion.c ghost_from_bottle() and its occupied milky-potion caller.
// The tests pin C branch order and the state changes after awaited messages.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BLINDED, HALLUC, HALLUC_RES, MM_NOMSG } from '../js/const.js';
import { game } from '../js/gstate.js';
import { LOW_PM, PM_GHOST, PM_GIANT_ANT, SPECIAL_PM } from '../js/monsters.js';
import { ghost_from_bottle } from '../js/potion.js';
import { runSegment } from '../js/jsmain.js';

function potionSource() {
    return readFileSync(
        new URL('../nethack-c/upstream/src/potion.c', import.meta.url),
        'utf8',
    );
}

function sourceFunction(source, signature, endMarker) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, 'C source still defines ' + signature);
    const end = source.indexOf(endMarker, start);
    assert.ok(end > start, signature + ' has a closing brace');
    return source.slice(start, end);
}

async function startedGame() {
    // This fixed identity and date initialise the real game state; no C seed
    // behavior is under test because each branch injects monster creation.
    await runSegment({
        seed: 8407219,
        datetime: '20260724120000',
        nethackrc: 'OPTIONS=name:GhostBottlePort,role:Wizard,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
    // The success branch has the verbose message enabled; multi zero and null
    // reason fields model a hero who has not already been interrupted.
    game.flags.verbose = true;
    game.multi = 0;
    game.multi_reason = null;
    game.nomovemsg = null;
    return game;
}

test('ghost_from_bottle preserves the complete C branch and caller order', () => {
    const source = potionSource();
    const helper = sourceFunction(
        source,
        'staticfn void\nghost_from_bottle(void)\n{',
        '/* getobj callback for object to drink from',
    );
    const create = helper.indexOf('makemon(&mons[PM_GHOST], u.ux, u.uy, MM_NOMSG)');
    const emptyCheck = helper.indexOf('if (!mtmp)');
    const emptyMessage = helper.indexOf('This bottle turns out to be empty.');
    const blindCheck = helper.indexOf('if (Blind)');
    const blindMessage = helper.indexOf('something);');
    const visibleMessage = helper.indexOf('Hallucination ? rndmonnam(NULL)');
    const verboseCheck = helper.indexOf('if (flags.verbose)');
    const rest = helper.indexOf('nomul(-3)');
    const reason = helper.indexOf('gm.multi_reason =');
    const recovery = helper.indexOf('gn.nomovemsg =');
    assert.ok(create < emptyCheck && emptyCheck < emptyMessage);
    assert.ok(emptyMessage < blindCheck && blindCheck < blindMessage);
    assert.ok(blindMessage < visibleMessage && visibleMessage < verboseCheck);
    assert.ok(verboseCheck < rest && rest < reason && reason < recovery);

    const cDrink = sourceFunction(
        source,
        'dodrink(void)\n{',
        '\nint\ndopotion(',
    );
    const cOccupantBranch = cDrink.slice(
        cDrink.indexOf('ghost_from_bottle();'),
    );
    assert.ok(cOccupantBranch.indexOf('ghost_from_bottle();')
        < cOccupantBranch.indexOf('useup(otmp);'));
    assert.ok(cOccupantBranch.indexOf('useup(otmp);')
        < cOccupantBranch.indexOf('return ECMD_TIME;'));

    const js = readFileSync(new URL('../js/potion.js', import.meta.url), 'utf8');
    const jsHelper = sourceFunction(
        js,
        'export async function ghost_from_bottle(',
        '// C ref: potion.c dodrink()',
    );
    assert.match(jsHelper, /await makeMonster\([\s\S]*?if \(!monster\)/u);
    assert.match(jsHelper, /if \(heroIsBlind\(state\)\)[\s\S]*?return null;/u);
    assert.match(jsHelper, /await message\([\s\S]*?nomul\(-3, state\);[\s\S]*?state\.multi_reason[\s\S]*?state\.nomovemsg/u);

    const jsDrink = sourceFunction(
        js,
        'export async function dodrink(',
        '// C ref: potion.c toggle_blindness()',
    );
    const jsOccupantBranch = jsDrink.slice(
        jsDrink.indexOf('await ghost_from_bottle(state);'),
    );
    assert.ok(jsOccupantBranch.indexOf('await ghost_from_bottle(state);')
        < jsOccupantBranch.indexOf('useup(otmp, { state });'));
    assert.ok(jsOccupantBranch.indexOf('useup(otmp, { state });')
        < jsOccupantBranch.indexOf('return ECMD_TIME;'));
});

test('a failed ghost creation prints the empty-bottle branch and returns early',
    async () => {
        const state = await startedGame();
        const events = [];
        const args = [];
        const result = await ghost_from_bottle(state, {
            makeMonster: async (...values) => {
                args.push(values);
                events.push('makemon');
                return null;
            },
            message: async (line, messageState) => {
                assert.equal(messageState, state);
                events.push(line);
            },
        });

        // C passes PM_GHOST, the hero's square, and MM_NOMSG to makemon.
        assert.deepEqual(args[0].slice(0, 4), [
            state.mons[PM_GHOST], state.u.ux, state.u.uy, MM_NOMSG,
        ]);
        assert.equal(args[0][4].state, state);
        assert.deepEqual(events, [
            'makemon', 'This bottle turns out to be empty.',
        ]);
        assert.equal(result, null);
        assert.equal(state.multi, 0,
            'the C null-pointer branch returns before nomul(-3)');
        assert.equal(state.multi_reason, null);
        assert.equal(state.nomovemsg, null);
    });

test('a blind hero gets the emergence message without the forced-rest tail',
    async () => {
        const state = await startedGame();
        // A nonzero intrinsic blindness with no blocker makes C's Blind arm
        // true; the remaining values are the ordinary, unblocked state.
        state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
        const messages = [];
        const result = await ghost_from_bottle(state, {
            makeMonster: async () => ({ data: state.mons[PM_GHOST] }),
            message: async (line) => messages.push(line),
        });

        // C's Blind arm uses the source's "something" text and returns early.
        assert.deepEqual(messages, [
            'As you open the bottle, something emerges.',
        ]);
        assert.equal(result, null);
        assert.equal(state.multi, 0);
        assert.equal(state.multi_reason, null);
        assert.equal(state.nomovemsg, null);
    });

test('visible hallucination names the emerged monster before applying rest',
    async () => {
        const state = await startedGame();
        state.flags.verbose = true;
        // Active hallucination without resistance selects C's rndmonnam arm.
        state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0 };
        state.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0 };
        const draws = [];
        const messages = [];
        const result = await ghost_from_bottle(state, {
            makeMonster: async () => ({ data: state.mons[PM_GHOST] }),
            // The first C draw selects PM_GIANT_ANT (index zero); the second
            // selects its first gendered name. Both bounds come from rndmonnam.
            displayRandom: (bound) => {
                draws.push(bound);
                return 0;
            },
            message: async (line, messageState) => {
                assert.equal(messageState, state);
                assert.equal(state.multi, 0,
                    'C prints both lines before nomul(-3)');
                messages.push(line);
            },
        });
        const species = state.mons[PM_GIANT_ANT];
        const speciesName = species.pmnames?.[0]
            ?? species.pmnames?.[2] ?? 'monster';

        // rndmonnam draws SPECIAL_PM+100-LOW_PM candidates and then gender
        // from 2; PM_GIANT_ANT is the monster table's index-zero entry.
        assert.deepEqual(draws, [SPECIAL_PM + 100 - LOW_PM, 2]);
        assert.equal(messages[0],
            'As you open the bottle, an enormous ' + speciesName + ' emerges!');
        assert.equal(messages[1],
            'You are frightened to death, and unable to move.');
        assert.equal(result, null);
        assert.equal(state.multi, -3);
        assert.equal(state.multi_reason, 'being frightened to death');
        assert.equal(state.nomovemsg, 'You regain your composure.');
    });
