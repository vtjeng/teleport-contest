import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { doclassdisco } from '../js/o_init.js';
import { NROFARTIFACTS, ART_EXCALIBUR } from '../js/artifacts.js';
import { ECMD_OK, MENU_TRADITIONAL } from '../js/const.js';

for (const answer of ['y', 'n']) test(`${answer === 'y' ? 'target' : 'control'}: wizard artifact dump answer=${answer}`, async () => {
    await runSegment({ seed: 901730, datetime: '20320405060710',
        nethackrc: 'OPTIONS=name:ArtifactAudit,role:Wizard,race:human,gender:female,align:neutral,playmode:debug,menustyle:traditional,pettype:none,!legacy,!tutorial,!splash_screen\n', moves: '' });
    assert.equal(Boolean(game.wizard), true);
    assert.equal(game.flags.menu_style, MENU_TRADITIONAL);
    assert.equal(Boolean(game.artiexist[ART_EXCALIBUR].exists), false);
    const answers = ['a', answer], prompts = [], windows = [], messages = [];
    const result = await doclassdisco(game, {
        yesNo: async (prompt, choices, _default, addcmdq) => {
            prompts.push(prompt); assert.equal(addcmdq, true);
            const reply = answers.shift();
            assert.ok(choices.includes(reply));
            return reply;
        },
        message: async text => messages.push(text),
        textWindow: async lines => windows.push(lines),
    });
    assert.equal(result, ECMD_OK);
    assert.deepEqual(prompts, ['View discoveries for which sort of objects?',
        'Dump information about all artifacts?']);
    assert.equal(answers.length, 0);
    if (answer === 'y') {
        // C o_init.c:1069 -> artifact.c:1177-1209 writes into the same text window.
        assert.equal(windows.length, 1);
        assert.equal(windows[0][0]?.text, 'Artifacts');
        assert.equal(windows[0].length, NROFARTIFACTS + 1);
        assert.ok(windows[0].some(row => /^  Excalibur +\[\]$/.test(row.text)));
        assert.deepEqual(messages, []);
    } else {
        assert.deepEqual(windows, []);
        assert.deepEqual(messages, ["You haven't discovered any artifacts yet."]);
    }
});
