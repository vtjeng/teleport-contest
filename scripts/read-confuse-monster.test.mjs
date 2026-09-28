import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BLINDED, CONFUSION } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { S_HUMANOID } from '../js/monsters.js';
import {
    seffect_confuse_monster,
    seffects,
} from '../js/read.js';
import {
    SCR_CONFUSE_MONSTER,
    SCROLL_CLASS,
    SPE_CONFUSE_MONSTER,
    SPBOOK_CLASS,
} from '../js/objects.js';
import { mksobj } from '../js/obj.js';
import { spelleffects } from '../js/spell.js';

async function initialize(seed) {
    await runSegment({
        seed,
        datetime: '20310928070605',
        nethackrc: [
            'OPTIONS=name:Confuser,role:Wizard,race:human,gender:male,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
            '',
        ].join('\n'),
        moves: '.',
    });
    game.u.umconf = 0;
    game.u.uprops[CONFUSION].intrinsic = 0;
    game.u.uprops[CONFUSION].extrinsic = 0;
    game.u.uprops[BLINDED].intrinsic = 1;
}

function confusionObject(otyp, oclass, { blessed = false, cursed = false } = {}) {
    return { otyp, oclass, blessed, cursed, quan: 1 };
}

test('read.c confusion scroll increments source amount and RNG order', async () => {
    await initialize(9303501);
    const calls = [];
    const messages = [];
    await seffect_confuse_monster(
        confusionObject(SCR_CONFUSE_MONSTER, SCROLL_CLASS),
        game,
        {
            random: {
                rn1(n, x) { calls.push(['rn1', n, x]); return 7; },
                rn2(n) { calls.push(['rn2', n]); return 0; },
                rnd(n) { calls.push(['rnd', n]); return 2; },
            },
            message(text) { messages.push(text); },
        },
    );
    assert.deepEqual(messages, ['Your hands tingle.']);
    assert.deepEqual(calls, [['rnd', 2]]);
    assert.equal(game.u.umconf, 5); // scroll 3 plus rnd(2)
});

test('read.c confusion cap still draws, then fixes gain to one', async () => {
    await initialize(9303502);
    game.u.umconf = 40;
    const calls = [];
    await seffect_confuse_monster(
        confusionObject(SCR_CONFUSE_MONSTER, SCROLL_CLASS, { blessed: true }),
        game,
        {
            random: {
                rn1(n, x) { calls.push(['rn1', n, x]); return 9; },
                rn2(n) { calls.push(['rn2', n]); return 0; },
                rnd(n) { calls.push(['rnd', n]); return 1; },
            },
            message() {},
        },
    );
    assert.deepEqual(calls, [['rn1', 8, 2]]);
    assert.equal(game.u.umconf, 41);
});

test('read.c cursed confusion branch applies HConfusion rather than umconf', async () => {
    await initialize(9303503);
    const calls = [];
    const messages = [];
    await seffect_confuse_monster(
        confusionObject(SCR_CONFUSE_MONSTER, SCROLL_CLASS, { cursed: true }),
        game,
        {
            random: {
                rn1(n, x) { calls.push(['rn1', n, x]); return 2; },
                rn2(n) { calls.push(['rn2', n]); return 0; },
                rnd(n) { calls.push(['rnd', n]); return 23; },
            },
            message(text) { messages.push(text); },
        },
    );
    assert.deepEqual(messages, ['You feel confused.']);
    assert.deepEqual(calls, [['rnd', 100]]);
    assert.equal(game.u.uprops[CONFUSION].intrinsic, 23);
    assert.equal(game.u.umconf, 0);
});

test('read.c polymorphed hero takes the temporary-confusion branch', async () => {
    await initialize(9303507);
    game.youmonst.data = { ...game.youmonst.data, mlet: S_HUMANOID };
    const calls = [];
    const messages = [];
    await seffect_confuse_monster(
        confusionObject(SCR_CONFUSE_MONSTER, SCROLL_CLASS),
        game,
        {
            random: {
                rn1(n, x) { calls.push(['rn1', n, x]); return 2; },
                rn2(n) { calls.push(['rn2', n]); return 0; },
                rnd(n) { calls.push(['rnd', n]); return 9; },
            },
            message(text) { messages.push(text); },
        },
    );
    assert.deepEqual(messages, ['You feel confused.']);
    assert.deepEqual(calls, [['rnd', 100]]);
    assert.equal(game.u.uprops[CONFUSION].intrinsic, 9);
    assert.equal(game.u.umconf, 0);
});

test('read.c blessed use clears existing confusion after its feedback', async () => {
    await initialize(9303504);
    game.u.uprops[CONFUSION].intrinsic = 12;
    const messages = [];
    await seffect_confuse_monster(
        confusionObject(SCR_CONFUSE_MONSTER, SCROLL_CLASS, { blessed: true }),
        game,
        {
            random: {
                rn1() { assert.fail('confused blessed branch has no gain roll'); },
                rn2() { assert.fail('helper does not exercise Wisdom'); },
                rnd() { assert.fail('confused blessed branch has no timeout roll'); },
            },
            message(text) { messages.push(text); },
        },
    );
    assert.deepEqual(messages, [
        'A faint buzz surrounds your head.',
        'You feel less confused now.',
    ]);
    assert.equal(game.u.uprops[CONFUSION].intrinsic, 0);
    assert.equal(game.u.umconf, 0);
});

test('read.c dispatches the scroll effect and spell.c marks spell as book class', async () => {
    await initialize(9303505);
    const calls = [];
    const scroll = mksobj(SCR_CONFUSE_MONSTER, false, false, { state: game });
    scroll.oclass = SCROLL_CLASS;
    await seffects(scroll, game, {
        random: {
            rn1(n, x) { calls.push(['rn1', n, x]); return 3; },
            rn2(n) { calls.push(['rn2', n]); return 0; },
            rnd(n) { calls.push(['rnd', n]); return 1; },
            rnl(n) { calls.push(['rnl', n]); return 0; },
        },
        message() {},
    });
    assert.equal(game.u.umconf, 4); // scroll base 3 plus rnd(2)
    assert.ok(calls.some(([name, bound]) => name === 'rnd' && bound === 2));

    const cSource = readFileSync(new URL(
        '../nethack-c/upstream/src/read.c', import.meta.url,
    ), 'utf8');
    const cStart = cSource.indexOf(
        'seffect_confuse_monster(struct obj **sobjp)\n{',
    );
    const cEnd = cSource.indexOf('\nstaticfn void\nseffect_scare_monster', cStart);
    assert.notEqual(cStart, -1);
    assert.notEqual(cEnd, -1);
    const cEffect = cSource.slice(cStart, cEnd);
    assert.match(cEffect, /\(sobj->oclass == SCROLL_CLASS\) \? 3 : 0/u);
    assert.match(cEffect, /incr \+= rn1\(8, 2\)/u);
    assert.match(cEffect, /if \(u\.umconf >= 40\)\s*incr = 1/u);
    const spellSource = readFileSync(new URL(
        '../nethack-c/upstream/src/spell.c', import.meta.url,
    ), 'utf8');
    const spellStart = spellSource.indexOf('case SPE_CONFUSE_MONSTER:',
        spellSource.indexOf('spelleffects('));
    assert.notEqual(spellStart, -1);
    assert.match(spellSource.slice(spellStart, spellStart + 700),
        /pseudo->blessed = 1;[\s\S]*?seffects\(pseudo\)/u);
    assert.equal(confusionObject(SPE_CONFUSE_MONSTER, SPBOOK_CLASS).oclass,
        SPBOOK_CLASS);
});

test('spell.c confusion duplicate reaches seffects with spellbook increment', async () => {
    await initialize(9303506);
    const calls = [];
    const messages = [];
    await spelleffects(SPE_CONFUSE_MONSTER, true, true, game, {
        random: {
            d(n) { calls.push(['d', n]); return 1; },
            rn1(n, x) { calls.push(['rn1', n, x]); return 3; },
            rn2(n) { calls.push(['rn2', n]); return 0; },
            rnd(n) { calls.push(['rnd', n]); return 2; },
            rne(n) { calls.push(['rne', n]); return 1; },
            rnl(n) { calls.push(['rnl', n]); return 0; },
            rnz(n) { calls.push(['rnz', n]); return 1; },
        },
        message(text) { messages.push(text); },
    });
    assert.deepEqual(messages, ['Your hands tingle.']);
    assert.equal(game.u.umconf, 2); // spell pseudo-object starts at zero.
    assert.deepEqual(calls.filter(([name]) => name === 'rnd'), [['rnd', 2]]);
    assert.equal(calls.filter(([name, bound]) => name === 'rn2'
        && bound === 19).length, 2); // spelleffects() and seffects().
});
