import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';

const input = invalid => ({
    seed: 9400016,
    datetime: '20310203040506',
    nethackrc: 'OPTIONS=name:Doorway,role:Valkyrie,race:human,gender:female,align:neutral\n'
        + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n',
    moves: `#showtrap\n${invalid}`,
});
const rows = () => game.nhDisplay.grid.map(row =>
    row.map(({ ch }) => ch).join('').trimEnd());

test('target: showtrap direction help explains Ctrl-A', async () => {
    await runSegment(input('A'));
    const lines = rows();
    // pager.c:doidtrap() calls getdir("^"); cmd.c:4243-4261 inserts the
    // mapped control-key explanation before the direction diagram.
    assert.equal(lines[0], 'cmdassist: Invalid direction key!');
    assert.equal(lines[2], 'Are you trying to use ^A as specified in the Guidebook?');
    assert.equal(lines[4], '^A      repeat a previous command (#repeat).');
    assert.equal(lines[6], 'To use that command, hold down the <Ctrl> key as a shift');
    assert.equal(lines[7], 'and press the <A> key.');
    assert.ok(lines.includes('Valid direction keys are:'));
});

test('control: a non-letter invalid direction has no control-key hint', async () => {
    await runSegment(input('+'));
    const lines = rows();
    assert.equal(lines[0], 'cmdassist: Invalid direction key!');
    assert.equal(lines[2], 'Valid direction keys are:');
    assert.ok(!lines.some(line => line.includes('Are you trying to use')));
});


test('control: Wizard-only Ctrl-E is not suggested to a normal hero', async () => {
    await runSegment(input('E'));
    const lines = rows();
    assert.equal(lines[0], 'cmdassist: Invalid direction key!');
    assert.equal(lines[2], 'Valid direction keys are:');
    assert.ok(!lines.some(line => line.includes('Are you trying to use')));
});
