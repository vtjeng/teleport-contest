import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    collectYouBufMessages,
    readSources,
    renderYouBufMessages,
} from './generate-you-buf-messages.mjs';
import { YOU_BUF_MESSAGES } from '../js/you_buf_messages_data.js';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputPath = join(projectRoot, 'js', 'you_buf_messages_data.js');

test('you_buf message table matches deterministic output from src/*.c', () => {
    const generated = renderYouBufMessages(collectYouBufMessages(readSources()));
    assert.equal(readFileSync(outputPath, 'utf8'), generated);
});

test('you_buf message table holds only formats without %', () => {
    // pickup.c encumber_msg()'s Your("movements are now unencumbered."):
    // the message the batch games saw rewritten after rehumanize().
    assert.ok(YOU_BUF_MESSAGES.has('Your movements are now unencumbered.'));
    // region.c:461 pline_The("gas cloud around you dissipates."), the
    // message the recipe recordings/pline.c/you-buf-notice-rewrite shows
    // rewritten.
    assert.ok(YOU_BUF_MESSAGES.has('The gas cloud around you dissipates.'));
    // Both You_feel() prefixes of one literal: sit.c's and trap.c's
    // You_feel("a change coming over you.") prints either.
    assert.ok(YOU_BUF_MESSAGES.has('You feel a change coming over you.'));
    assert.ok(YOU_BUF_MESSAGES.has('You dream that you feel a change coming over you.'));
    // hack.c notice_mon()'s You("%s %s.", ...) is formatted into a copy,
    // so its expansion never reads the buffer late.
    assert.ok(![...YOU_BUF_MESSAGES].some((text) => text.includes('%')));
});

test('conditional formats contribute each literal branch', () => {
    const source = [
        'void f(void) {',
        '    You(Blind ? "feel a draft." : "see a draft.");',
        '    Your("%s hurts.", body_part(HAND));',
        '    There(foo("is a trap."));',
        '}',
    ].join('\n');
    // Both branches of the conditional are formats; the '%' format is
    // vsnprintf()ed into a copy; a literal passed to a nested call is that
    // call's argument, not There()'s format.
    assert.deepEqual(collectYouBufMessages([source]),
        ['You feel a draft.', 'You see a draft.']);
});

test('a text also spelled by another literal is left out', () => {
    const source = [
        'void f(void) {',
        '    You("are hit.");',
        '    pline("You are hit.");',
        '    You("are missed.");',
        '}',
    ].join('\n');
    // pline("You are hit.") prints the same text without the buffer, so
    // the port cannot tell which call it came from.
    assert.deepEqual(collectYouBufMessages([source]), ['You are missed.']);
});
