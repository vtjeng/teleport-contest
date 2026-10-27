import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';

// The C recorder twice produced the same 100-key session (seed 98732041,
// 20451019123000). Through key 45 the fog-cloud vampire holds the hero and
// C/JS match. On key 46, mon.c:m_calcdistress/decide_to_shapeshift changes the
// engulfer's form; mhitu.c:expels then runs spoteffects(true). This is a
// supported #wizgenesis encounter, not an injected monster/holder state.
const setup = '#wizgenesis\nhostile vampire\n';
const moves = setup + 'm.  '.repeat(18);
const input = {
    seed: 98732041,
    datetime: '20451019123000',
    nethackrc: 'OPTIONS=name:AttackProbe,role:Wizard,race:human,gender:female,'
        + 'align:neutral,playmode:debug,pettype:none,!legacy,!tutorial,'
        + '!splash_screen,!autopickup,!acoustics\n',
};

test('control: the recorded vampire encounter matches the pre-expulsion prefix', async () => {
    const replay = await runSegment({ ...input, moves: moves.slice(0, 45) });
    assert.equal(replay.getRngLog().length, 2973);
    assert.equal(replay.getScreens().length, 46);
    assert.equal(game.u.uswallow, 1);
});

test('target: planned vampire expulsion replays live without changing its C trace', async () => {
    const replay = await runSegment({ ...input, moves: moves.slice(0, 48) });
    const screens = replay.getScreens();
    assert.equal(replay.getRngLog().length, 3036);
    assert.equal(screens.length, 49);
    assert.equal(screens[46].split('\n')[0],
        'You are laden with moisture and can barely breathe!--More--');
    assert.equal(screens[47].split('\n')[0],
        'You emerge from the fog cloud which was a shapeshifted the vampire bat!--More--');
    assert.equal(game.u.uswallow, 0);
});
