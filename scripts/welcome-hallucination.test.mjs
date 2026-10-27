import assert from 'node:assert/strict';
import test from 'node:test';

import { HALLUC, HALLUC_RES, TIMEOUT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { make_hallucinated } from '../js/potion.js';
import { welcomeHallucinationMessage } from '../js/role_init.js';
import { dosave0 } from '../js/save.js';
import { InMemoryStorage } from '../js/storage.js';

const FILM_LINE = 'NetHack is filmed in front of an undead studio audience.';

for (const hallucinating of [true, false]) {
    test(`${hallucinating ? 'target' : 'control'}: restored welcome with hallucination=${hallucinating}`, async () => {
        const storage = new InMemoryStorage();
        const nethackrc = 'OPTIONS=name:RestoredDream,role:Wizard,race:human,'
            + 'gender:female,align:neutral,playmode:debug,pettype:none,'
            + '!legacy,!tutorial,!splash_screen\n';
        await runSegment({ seed: 901754, datetime: '20320405060710',
            nethackrc, moves: '', storage });

        if (hallucinating) {
            await make_hallucinated(50, false, 0, game, {
                message: async () => {}, redraw: async () => {},
            });
            assert.equal(game.u.uprops[HALLUC].intrinsic & TIMEOUT, 50);
        }
        assert.equal(welcomeHallucinationMessage(game),
            hallucinating ? FILM_LINE : null);
        if (hallucinating) {
            game.u.uprops[HALLUC_RES].extrinsic = 1;
            assert.equal(welcomeHallucinationMessage(game), null,
                'hallucination resistance suppresses the C welcome prelude');
            game.u.uprops[HALLUC_RES].extrinsic = 0;
        }
        // The production save and restore paths preserve the effect across
        // segments. C allmain.c:welcome() prints the film line before the
        // ordinary welcome only when Hallucination is effective.
        dosave0(game);
        assert.ok(storage.getItem('vfs:nhsave'));
        const replay = await runSegment({ seed: 901755,
            datetime: '20320405060810', nethackrc, moves: '  ', storage });
        assert.equal(game.u.uprops[HALLUC].intrinsic & TIMEOUT,
            hallucinating ? 50 : 0);
        const screens = replay.getScreens();
        assert.equal(screens.some(screen => screen.includes(FILM_LINE)),
            hallucinating);
        assert.ok(screens.some(screen => screen.includes('welcome back to NetHack!')));
    });
}
