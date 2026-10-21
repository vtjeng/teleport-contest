import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PM_STONE_GOLEM } from '../js/monsters.js';
import { game } from '../js/gstate.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/pickup.c/flesh-golem-cockatrice-pickup-92650104.session.json',
    import.meta.url,
), 'utf8'));

test('bare-handed corpse pickup waits after flesh golem turns to stone',
    async () => {
        const steps = recording.segments[0].steps;
        assert.equal(steps.at(-2).key, '\n');
        assert.match(steps.at(-2).screen,
            /You turn into a stone golem!--More--/u);
        assert.match(steps.at(-1).screen, /Wizard the Stone Golem/u);

        const js = await runJsSession(recording, process.cwd());
        const result = compareSessionOutputs(recording, js);
        assert.equal(result.passed, true, JSON.stringify(result));
        assert.equal(game.u.umonnum, PM_STONE_GOLEM);
    });
