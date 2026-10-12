import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { SPE_NOVEL } from '../js/objects.js';
import { study_book } from '../js/spell.js';
import { newuexp } from '../js/exper.js';

// C spell.c:doread -> study_book's novel tribute awards experience and may
// cross a level threshold. The admitted recording initializes the production
// game state; the direct call then places the hero exactly at the threshold
// so the test exercises study_book -> newexplevel -> pluslvl's message path.
test('novel tribute forwards the message owner through level-up', async () => {
    const session = JSON.parse(readFileSync(new URL(
        '../challenges/cases/v52/v52-novel-read-tribute-action-attempt2.session.json',
        import.meta.url,
    ), 'utf8'));
    let boundary = null;

    await runSegment(session.segments[0], {
        onBoundary(error) { boundary = error; },
    });
    assert.equal(boundary, null, boundary?.message);

    let novel = game.invent;
    while (novel && novel.otyp !== SPE_NOVEL) novel = novel.nobj;
    assert.ok(novel);

    const previousLevel = game.u.ulevel;
    game.u.uexp = newuexp(previousLevel) - 20;
    game.u.uevent.read_tribute = 0;
    const messages = [];
    const random = {
        rn2: () => 0,
        rn1: (_range, base) => base,
        rnd: () => 1,
    };

    await study_book(novel, game, {
        random,
        message: (text) => messages.push(text),
        displayTextWindow: async () => {},
    });

    assert.equal(game.u.ulevel, previousLevel + 1);
    assert.equal(game.u.uevent.read_tribute, 1);
    assert.ok(messages.some((text) => text.includes('Welcome to experience level')));
});
