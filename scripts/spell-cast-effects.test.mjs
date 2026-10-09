// Source-pinned caller checks for spell.c spelleffects SPE_JUMPING1584–1587.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { spelleffects } from '../js/spell.js';
import { SPE_JUMPING } from '../js/objects.js';
import { ECMD_TIME, FROMOUTSIDE, LEVITATION, P_ESCAPE_SPELL, P_UNSKILLED, TIP_GETPOS } from '../js/const.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';

const source = fs.readFileSync(new URL('../js/spell.js', import.meta.url), 'utf8');
const upstream = fs.readFileSync(new URL('../nethack-c/upstream/src/spell.c', import.meta.url), 'utf8');

test('jumping caller consumes the awaited ECMD_TIME bit before common skill and cleanup', () => {
    // C uses the TIME bit, so cancellation or ECMD_OK still gets feedback.
    assert.match(upstream, /case SPE_JUMPING:\s*if \(!\(jump\(max\(role_skill, 1\)\) & ECMD_TIME\)\)\s*pline1\(nothing_happens\)/);
    assert.match(source, /case SPE_JUMPING:\s*(?:\/\/[^\n]*\n\s*)*if \(!\(await jump\(Math\.max\(role_skill, 1\), state, env\) & ECMD_TIME\)\)\s*await \(env\.message \?\? ttyPline\)\(nothing_happens, state\);\s*break;/);
    const caller = source.indexOf('case SPE_JUMPING:');
    const skill = source.indexOf('use_skill(skill, spellev(spell, state), state)', caller);
    const cleanup = source.indexOf('obfree(pseudo, null, { state }); /* now', skill);
    assert.ok(caller >= 0 && skill > caller && cleanup > skill);
});

async function startJumpHero() {
    // Independent startup gives all canonical owners a complete hero/map state.
    await runSegment({ seed: 18541021, datetime: '20480317114322',
        nethackrc: 'OPTIONS=name:JumpCaller,role:Wizard,race:human,gender:female,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!debug_mongen,!acoustics\n', moves: '' });
    clearTtyMessageWindow(game);
    // Source max(role_skill,1) must admit the magical route even when unskilled.
    game.u.weapon_skills[P_ESCAPE_SPELL].skill = P_UNSKILLED;
    game.context.tips = (game.context.tips ?? 0) | (1 << TIP_GETPOS);
}

test('forced jumping while levitating returns cast time without Nothing happens', async () => {
    await startJumpHero();
    game.u.uprops[LEVITATION].intrinsic = FROMOUTSIDE;
    const energy = game.u.uen;
    const hunger = game.u.uhunger;
    const messages = [];
    // The canonical magical traction guard returns ECMD_TIME before targeting.
    assert.equal(await spelleffects(SPE_JUMPING, false, true, game,
        { message: async text => messages.push(text) }), ECMD_TIME);
    assert.deepEqual(messages, []);
    assert.equal(game.u.uen, energy, 'forced casting skips energy cost');
    assert.equal(game.u.uhunger, hunger, 'the guard skips the landing hunger draw');
});

test('forced jump in place emits Nothing happens and still returns cast time', async () => {
    await startJumpHero();
    // A trapless current square returns ECMD_OK from jump; the outer cast is TIME.
    game.nhDisplay.pushKey('.'.charCodeAt(0));
    const messages = [];
    const hunger = game.u.uhunger;
    assert.equal(await spelleffects(SPE_JUMPING, false, true, game,
        { message: async text => messages.push(text) }), ECMD_TIME);
    assert.deepEqual(messages, ['Nothing happens.']);
    assert.equal(game.u.uhunger, hunger, 'in-place jump has no rnd(25) landing');
});
