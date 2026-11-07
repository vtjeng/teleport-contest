import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BLINDED, DEAF, FAINTED } from '../js/const.js';
import {
    consume_msg_xy,
    pline_mon,
    set_msg_xy,
    youHear,
    youSee,
} from '../js/pline.js';
import { messageAt } from '../js/startup_a11y.js';
import { Deaf, Unaware } from '../js/youprop.js';

const C_PLINE_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/pline.c', import.meta.url),
    'utf8',
);
const C_YOUPROP_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/include/youprop.h', import.meta.url),
    'utf8',
);

function hearingState() {
    const uprops = [];
    uprops[DEAF] = { intrinsic: 0, extrinsic: 0 };
    return {
        multi: 0,
        flags: { acoustics: true },
        nomovemsg: null,
        u: {
            uprops,
            uroleplay: { deaf: false },
            uinwater: false,
            usleep: 0,
            uhs: 0,
        },
    };
}

test('You_hear reproduces the C guard and prefix branch order', () => {
    const cHear = C_PLINE_SOURCE.slice(
        C_PLINE_SOURCE.indexOf('You_hear(const char *line, ...)'),
        C_PLINE_SOURCE.indexOf('\nvoid\nYou_see(',
            C_PLINE_SOURCE.indexOf('You_hear(const char *line, ...)')),
    );
    assert.match(cHear,
        /if \(\(Deaf && !Unaware\) \|\| !flags\.acoustics\)\s*return;/u);
    assert.ok(cHear.indexOf('if (Underwater)')
        < cHear.indexOf('else if (Unaware)'));
    assert.match(cHear, /You barely hear /u);
    assert.match(cHear, /You dream that you hear /u);
    assert.match(cHear, /You hear /u);
    assert.match(C_YOUPROP_SOURCE,
        /#define Deaf \(HDeaf \|\| EDeaf \|\| u\.uroleplay\.deaf\)/u);
    assert.match(C_YOUPROP_SOURCE,
        /#define Unaware \(gm\.multi < 0 && \(unconscious\(\) \|\| is_fainted\(\)\)\)/u);
});

test('You_hear applies Deaf, acoustics, underwater, and Unaware in C order', () => {
    const state = hearingState();
    assert.equal(youHear('a low buzzing.', state), 'You hear a low buzzing.');
    assert.equal(Deaf(state.u), false);
    assert.equal(Unaware(state), false);

    state.u.uprops[DEAF].intrinsic = 1;
    assert.equal(Deaf(state.u), true);
    assert.equal(youHear('a low buzzing.', state), null);

    state.u.uprops[DEAF].intrinsic = 0;
    state.u.uroleplay.deaf = true;
    assert.equal(youHear('a low buzzing.', state), null);

    state.u.uroleplay.deaf = false;
    state.multi = -1;
    state.u.usleep = 1;
    assert.equal(Unaware(state), true);
    state.u.uroleplay.deaf = true;
    assert.equal(
        youHear('a low buzzing.', state),
        'You dream that you hear a low buzzing.',
    );

    state.flags.acoustics = false;
    assert.equal(youHear('a low buzzing.', state), null);
    state.flags.acoustics = true;
    state.u.uinwater = true;
    assert.equal(
        youHear('a low buzzing.', state),
        'You barely hear a low buzzing.',
    );
});

test('negative multi alone is not enough to dream that one hears', () => {
    const state = hearingState();
    state.multi = -1;
    assert.equal(Unaware(state), false);
    assert.equal(youHear('someone searching.', state),
        'You hear someone searching.');

    state.u.uhs = FAINTED;
    assert.equal(Unaware(state), true);
    assert.equal(youHear('someone searching.', state),
        'You dream that you hear someone searching.');
});

test('You_see picks Unaware before Blind, then the plain prefix', () => {
    // pline.c You_see(): `if (Unaware) ... else if (Blind) ... else`.
    const cSee = C_PLINE_SOURCE.slice(
        C_PLINE_SOURCE.indexOf('You_see(const char *line, ...)'));
    assert.ok(cSee.indexOf('if (Unaware)') < cSee.indexOf('else if (Blind)'));
    const state = hearingState();
    state.u.uprops[BLINDED] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    assert.equal(youSee('a door open.', state), 'You see a door open.');

    state.u.uprops[BLINDED].intrinsic = 1; // Any blindness timeout.
    assert.equal(youSee('a door open.', state), 'You sense a door open.');
    state.u.uprops[BLINDED].blocked = 1; // BBlinded (the Eyes of the Overworld): not Blind.
    assert.equal(youSee('a door open.', state), 'You see a door open.');

    state.u.uprops[BLINDED].blocked = 0;
    state.multi = -1;
    state.u.usleep = 1; // Asleep and helpless: Unaware outranks Blind.
    assert.equal(youSee('a door open.', state),
        'You dream that you see a door open.');
});

test('pline_mon forwards its formatted line through the source owner', async () => {
    const start = C_PLINE_SOURCE.indexOf(
        'pline_mon(struct monst *mtmp, const char *line, ...)',
    );
    const end = C_PLINE_SOURCE.indexOf('\n}\n', start) + 2;
    assert.ok(start >= 0 && end > start);
    const cBody = C_PLINE_SOURCE.slice(start, end);
    assert.match(cBody, /mtmp == &gy\.youmonst\)\s*set_msg_xy\(0, 0\)/u);
    assert.match(cBody, /set_msg_xy\(mtmp->mx, mtmp->my\)/u);

    const monster = { mx: 7, my: 9 };
    const seen = [];
    await pline_mon(monster, 'The leash pulls free.', {}, {
        message: async (line) => seen.push(line),
    });
    assert.deepEqual(seen, ['The leash pulls free.']);
});

test('set_msg_xy annotates and resets the next message location', () => {
    const start = C_PLINE_SOURCE.indexOf('\nset_msg_xy(coordxy x, coordxy y)');
    const end = C_PLINE_SOURCE.indexOf('\n}\n', start) + 2;
    const cBody = C_PLINE_SOURCE.slice(start, end);
    assert.ok(start >= 0 && end > start);
    assert.match(cBody, /a11y\.msg_loc\.x\s*=\s*x;/u);
    assert.match(cBody, /a11y\.msg_loc\.y\s*=\s*y;/u);

    const state = {
        a11y: { accessiblemsg: true },
        u: { ux: 1, uy: 1 },
    };
    set_msg_xy(7, 9, state);
    assert.deepEqual(state.a11y.msg_loc, { x: 7, y: 9 });
    assert.equal(
        consume_msg_xy('The disguise falls away.', state),
        messageAt('The disguise falls away.', 7, 9, state),
    );
    assert.deepEqual(state.a11y.msg_loc, { x: 0, y: 0 });
    assert.equal(consume_msg_xy('The next line is ordinary.', state),
        'The next line is ordinary.');
});
