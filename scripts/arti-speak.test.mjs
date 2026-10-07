// artifact.c:arti_speak callers through apply.c:doapply's common tail.
// These source state fixtures bypass the separately blocked carried-display
// property owner; they establish caller contracts, not recording evidence.
import assert from 'node:assert/strict';
import test from 'node:test';

import { artifact_exists } from '../js/artifacts.js';
import { doapply } from '../js/apply.js';
import { ECMD_CANCEL, ECMD_TIME } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { getRngLog } from '../js/rng.js';
import { MIRROR, SKELETON_KEY } from '../js/objects.js';

for (const fixture of [
    // artilist.h:278-283 gives the Key to chaotic Rogues. C pick_lock's
    // canceled direction returns zero, then speech adds ECMD_TIME.
    { seed: 78121012, role: 'Rogue', align: 'chaotic', wish: 'skeleton key',
        type: SKELETON_KEY, name: 'The Master Key of Thievery', expected: ECMD_TIME },
    // artilist.h:255-258 gives the Mirror to lawful Knights. use_mirror's
    // canceled direction returns ECMD_CANCEL; speech preserves that bit.
    { seed: 78121013, role: 'Knight', align: 'lawful', wish: 'mirror',
        type: MIRROR, name: 'The Magic Mirror of Merlin', expected: ECMD_CANCEL | ECMD_TIME },
]) {
    test(`doapply awaits ${fixture.name}'s speech after a canceled direction`, async () => {
        // Independent startup only builds the ordinary tool. Set the source
        // artifact identity directly to isolate the bounded doapply speech
        // caller; independent intrinsic recordings cover actual artifact pickup.
        await runSegment({ seed: fixture.seed, datetime: '20791007110000',
            nethackrc: `OPTIONS=name:SpeechCaller,role:${fixture.role},race:human,gender:male,align:${fixture.align},playmode:debug\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup,!acoustics,!debug_mongen\n`,
            moves: ` \u0017${fixture.wish}\n` });
        let tool;
        for (let obj = game.invent; obj; obj = obj.nobj)
            if (obj.otyp === fixture.type) { tool = obj; break; }
        assert.ok(tool);
        artifact_exists(tool, fixture.name, true, undefined, game);
        game.nhDisplay.pushKey(32); // finish the preceding wish message at direct entry
        game.nhDisplay.pushKey(tool.invlet.charCodeAt(0));
        game.nhDisplay.pushKey(27); // C getdir accepts Escape as cancellation
        for (let i = 0; i < 8; ++i) // enough ordinary More dismissals for a rumor
            game.nhDisplay.pushKey(32);
        const before = getRngLog().length;
        assert.equal(await doapply(game), fixture.expected);
        assert.match(game._pending_message, /^".+"$/u); // verbalize1's quoted rumor
        // getrumor draws adjusted truth and a byte offset before its exercise.
        assert.ok(getRngLog().length >= before + 2);
    });
}
