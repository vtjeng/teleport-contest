import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

const SOUNDS_C = readFileSync(
    new URL('../nethack-c/upstream/src/sounds.c', import.meta.url), 'utf8',
);
const SOUNDS_JS = readFileSync(new URL('../js/sounds.js', import.meta.url), 'utf8');
const route = JSON.parse(readFileSync(
    new URL(
        '../recipes/sounds.c/doseduce-succubus-male-wizard-c87-no-worn-armor.session.json',
        import.meta.url,
    ),
    'utf8',
)).segments[0];

// C ref: sounds.c:domonnoise() MS_SEDUCE arm; this frozen recipe enters it
// through #chat and lets doseduce() return after the message acknowledgements.
test('MS_SEDUCE calls doseduce through #chat and preserves its no-armor route', async () => {
    const domonnoise = SOUNDS_C.slice(SOUNDS_C.indexOf('domonnoise(struct monst *mtmp)'));
    const cStart = domonnoise.indexOf('case MS_SEDUCE:');
    const cEnd = domonnoise.indexOf('case MS_ARREST:', cStart);
    const cArm = domonnoise.slice(cStart, cEnd);
    assert.match(cArm,
        /if \(SYSOPT_SEDUCE\)[\s\S]*?ptr->mlet != S_NYMPH[\s\S]*?could_seduce\(mtmp, &gy\.youmonst, \(struct attack \*\) 0\)[\s\S]*?== 1\)[\s\S]*?\(void\) doseduce\(mtmp\);[\s\S]*?break;/u);

    const jsStart = SOUNDS_JS.indexOf('case MS_SEDUCE: {');
    const jsEnd = SOUNDS_JS.indexOf('case MS_ARREST:', jsStart);
    const jsArm = SOUNDS_JS.slice(jsStart, jsEnd);
    assert.match(jsArm,
        /seductionEnabled[\s\S]*?ptr\?\.mlet !== S_NYMPH[\s\S]*?could_seduce\([\s\S]*?\) === 1\)[\s\S]*?await doseduce\(mtmp, state\);[\s\S]*?break;/u);
    assert.match(SOUNDS_JS,
        /case MS_SEDUCE: \{[\s\S]*?await doseduce\(mtmp, state\);[\s\S]*?return ECMD_TIME;/u);

    // The recipe uses its C-frozen Wizard attributes and west chat direction;
    // the strict fresh comparison matches all 47 boundaries for this route.
    await runSegment(route);
    assert.equal(game._ttyToplines, 'The succubus vanishes!');
    assert.ok(game.unported.has('mhitu.c mayberem'));
    for (const slot of ['uarm', 'uarmc', 'uarmf', 'uarmg', 'uarms', 'uarmh', 'uarmu']) {
        assert.ok(!game[slot], `the no-worn recipe leaves ${slot} empty`);
    }
});
