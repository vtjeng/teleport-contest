import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DEAF, FAINTED } from '../js/const.js';
import { heroDeaf, heroUnaware, pline_mon, youHear } from '../js/pline.js';

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
    assert.equal(heroDeaf(state), false);
    assert.equal(heroUnaware(state), false);

    state.u.uprops[DEAF].intrinsic = 1;
    assert.equal(heroDeaf(state), true);
    assert.equal(youHear('a low buzzing.', state), null);

    state.u.uprops[DEAF].intrinsic = 0;
    state.u.uroleplay.deaf = true;
    assert.equal(youHear('a low buzzing.', state), null);

    state.u.uroleplay.deaf = false;
    state.multi = -1;
    state.u.usleep = 1;
    assert.equal(heroUnaware(state), true);
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
    assert.equal(heroUnaware(state), false);
    assert.equal(youHear('someone searching.', state),
        'You hear someone searching.');

    state.u.uhs = FAINTED;
    assert.equal(heroUnaware(state), true);
    assert.equal(youHear('someone searching.', state),
        'You dream that you hear someone searching.');
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
