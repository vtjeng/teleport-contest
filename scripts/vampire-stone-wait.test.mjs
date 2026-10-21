import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { decodeScreen } from '../frozen/screen-decode.mjs';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

test('a shifted vampire remains a bat until its stone message is dismissed',
    async () => {
        const recording = JSON.parse(readFileSync(new URL(
            '../recordings/mon.c/vampire-bat-stone-wait.session.json',
            import.meta.url,
        ), 'utf8'));
        const steps = recording.segments[0].steps;
        assert.match(steps[66].screen, /lapidifying vampire bat/u);
        assert.equal(decodeScreen(steps[66].screen)[15][54].ch, 'B');
        assert.equal(decodeScreen(steps[68].screen)[15][54].ch, 'V');

        const replay = await runJsSession(recording, process.cwd());
        const compared = compareSessionOutputs(recording, replay);
        assert.equal(compared.passed, true, JSON.stringify(compared));
    });
