// Source-pinned checks for wizcmds.c wiz_map() and both cmd.c dispatch routes.

import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';

import { ADMITTED_COMMANDS } from '../js/cmd.js';
import { CONFUSION, HALLUC } from '../js/const.js';
import {
    extcmdlist,
    IFBURIED,
    WIZMODECMD,
} from '../js/extcmdlist_data.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { wiz_map } from '../js/wizcmds.js';

const DIRECT_KEY = '\x06'; // cmd.c C('f'), the wizmap row's direct binding.
const recipe = JSON.parse(readFileSync(
    new URL('../recipes/wizcmds.c/wizmap-direct.session.json', import.meta.url),
));

test('wizmap is admitted and retains cmd.c row metadata', () => {
    const row = extcmdlist.find(({ ef_txt }) => ef_txt === 'wizmap');
    assert.equal(row.key, DIRECT_KEY.charCodeAt(0));
    assert.equal(row.ef_funct, 'wiz_map');
    assert.equal(row.flags, IFBURIED | WIZMODECMD);
    assert.ok(ADMITTED_COMMANDS.includes('wizmap'));
});

test('wiz_map marks traps and restores temporary confusion properties', async () => {
    // Start one turn before the direct command so the test mutates a complete
    // production level, then call the ported source function directly.
    await runSegment({ ...recipe.segments[0], moves: '.' });
    assert.equal(game.wizard, true);

    const confusion = game.u.uprops[CONFUSION];
    const hallucination = game.u.uprops[HALLUC];
    confusion.intrinsic = 0x12000005;
    hallucination.intrinsic = 0x34000007;
    const traps = [...game.level.traps];

    await wiz_map(game);

    assert.equal(confusion.intrinsic, 0x12000005);
    assert.equal(hallucination.intrinsic, 0x34000007);
    assert.equal(game.a11y.mon_notices_blocked, 0);
    assert.ok(traps.every((trap) => trap.tseen), 'all traps are revealed');
});
