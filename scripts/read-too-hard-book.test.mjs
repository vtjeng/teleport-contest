import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { SPE_SLEEP } from '../js/objects.js';

function witnessPrefix(session, lastStep) {
    return session.segments[0].steps
        .slice(1, lastStep + 1)
        .map(({ key }) => key ?? '')
        .join('');
}

test('uncursed too-hard spellbook aggravation keeps the book', async () => {
    // Development witness seed0014 reaches the selected sleep spellbook at
    // step 227.  Use only its recorded input prefix; the expected state and
    // RNG behavior are pinned below to spell.c study_book()/cursed_book().
    const session = JSON.parse(readFileSync(
        new URL('../sessions/seed0014-dequa-fountain-explore.session.json',
            import.meta.url),
        'utf8',
    ));
    const segment = session.segments[0];
    let boundary = null;
    const replay = await runSegment({
        ...segment,
        moves: witnessPrefix(session, 227),
    }, { onBoundary: (error) => { boundary = error; } });

    let book = game.invent;
    while (book && book.invlet !== 'l') book = book.nobj;
    assert.equal(boundary, null);
    assert.equal(book?.otyp, SPE_SLEEP);
    assert.equal(book?.pickup_prev, false);
    assert.equal(book?.in_use, false);
    assert.equal(game.context.spbook.delay, 0);
    // Local js/terminal.js has no serialize() method; C's logical gt.toplines
    // is mirrored by the display message buffer and remains available here.
    assert.equal(
        game.nhDisplay.toplines,
        'You feel threatened.  You can move again.',
    );

    const log = replay.getRngLog();
    const difficulty = log.findIndex((entry) => entry === 'rnd(20)=12');
    const aggravation = log.findIndex((entry, index) => index > difficulty
        && entry === 'rn2(3)=1');
    const crumble = log.findIndex((entry, index) => index > aggravation
        && entry === 'rn2(3)=2');
    assert.ok(difficulty >= 0);
    assert.ok(aggravation > difficulty);
    assert.ok(crumble > aggravation);
});
