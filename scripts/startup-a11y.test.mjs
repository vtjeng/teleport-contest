import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COLNO,
    DOOR,
    D_BROKEN,
    IN_SIGHT,
    M_AP_OBJECT,
    ROOM,
    ROOMOFFSET,
    ROWNO,
    SINK,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { init_objects } from '../js/o_init.js';
import { CHEST, objects_globals_init } from '../js/objects.js';
import { parseNethackrc } from '../js/options.js';
import {
    _startupA11yInternals,
    collectLookaroundMessages,
    collectMonsterNoticeMessages,
    emitStartupA11yNotices,
} from '../js/startup_a11y.js';

// Keep the hero away from map edges so room flood-fill and coordinate
// descriptions can be exercised without boundary effects.
function startupState(ux = 13, uy = 6) {
    const state = resetGame();
    state.level = new GameMap();
    state.u = {
        ux,
        uy,
        urooms: [ROOMOFFSET, 0, 0, 0, 0],
    };
    state.a11y = {
        accessiblemsg: false,
        glyph_updates: false,
        mon_notices: false,
        mon_notices_blocked: 0,
    };
    state.viz_array = Array.from(
        { length: ROWNO },
        () => new Uint8Array(COLNO),
    );
    return state;
}

function reveal(state, x, y) {
    state.viz_array[y][x] = IN_SIGHT;
    state.level.at(x, y).remembered_glyph = { ch: '.' };
}

test('accessibility startup options retain their source-owned state', () => {
    assert.deepEqual(parseNethackrc('').a11y, {
        accessiblemsg: false,
        glyph_updates: false,
        mon_notices: false,
        mon_notices_blocked: 0,
    });
    assert.deepEqual(
        parseNethackrc(
            'OPTIONS=accessiblemsg,mention_map,spot_monsters,!accessiblemsg',
        ).a11y,
        {
            accessiblemsg: true,
            glyph_updates: true,
            mon_notices: true,
            mon_notices_blocked: 0,
        },
    );
});

test('dolookaround describes the room then scans interesting glyphs by row', () => {
    const state = startupState();
    // A 7-by-3 rectangle makes both dimensions and the rectangular shape
    // visible in the room summary.
    for (let y = 5; y <= 7; ++y) {
        for (let x = 10; x <= 16; ++x) {
            state.level.at(x, y).typ = ROOM;
            reveal(state, x, y);
        }
    }

    // These positions force y-major ordering: sink, northwest pet, doorway.
    state.level.at(11, 5).typ = SINK;
    state.level.at(9, 6).typ = DOOR;
    state.level.at(9, 6).flags = D_BROKEN;
    reveal(state, 9, 6);

    const pet = {
        data: { pmnames: [null, null, 'little dog'] },
        mx: 12,
        my: 5,
        mhp: 4,
        mtame: 10,
        mpeaceful: true,
        m_ap_type: 0,
    };
    state.level.monsters[12][5] = pet;

    assert.deepEqual(collectLookaroundMessages(state), [
        'You are in a rectangular 7 by 3 room.',
        '(1north,2west): sink.',
        '(northwest): tame little dog.',
        '(4west): doorway.',
    ]);
});

test('notice_all_mons sorts by distance and honors accessiblemsg', () => {
    const state = startupState(20, 10);
    state.a11y.accessiblemsg = true;
    // Squared distances 2 and 16 distinguish distance sorting from list order.
    const nearPet = {
        data: { pmnames: [null, null, 'little dog'] },
        mx: 19,
        my: 9,
        mhp: 4,
        mtame: 10,
        mpeaceful: true,
        m_ap_type: 0,
        mspotted: false,
        nmon: null,
    };
    const farGoblin = {
        data: { pmnames: [null, null, 'goblin'] },
        mx: 24,
        my: 10,
        mhp: 4,
        mtame: 0,
        mpeaceful: true,
        m_ap_type: 0,
        mspotted: false,
        nmon: nearPet,
    };
    state.level.monlist = farGoblin;
    reveal(state, nearPet.mx, nearPet.my);
    reveal(state, farGoblin.mx, farGoblin.my);

    assert.deepEqual(collectMonsterNoticeMessages(state), [
        '(northwest): You see your little dog.',
        '(4east): You see a peaceful goblin.',
    ]);
    assert.deepEqual(collectMonsterNoticeMessages(state), []);
});

test('lookaround treats an adjacent object mimic as seen up close', () => {
    const state = startupState(20, 10);
    objects_globals_init(state);
    // Always choosing the first shuffle slot initializes a deterministic
    // catalog; chest is fixed-name, so the choice does not affect its label.
    init_objects(state, () => 0);
    // One step east is within the source's close-look threshold, so the
    // remembered object is named as a chest rather than vague "tool".
    const x = 21;
    const y = 10;
    state.level.at(x, y).typ = ROOM;
    reveal(state, x, y);
    state.level.monsters[x][y] = {
        m_ap_type: M_AP_OBJECT,
        mappearance: CHEST,
        minvis: false,
        mundetected: false,
        mx: x,
        my: y,
    };

    assert.equal(
        _startupA11yInternals.visibleSubjectAt(x, y, state),
        'a chest',
    );
});

test('mention_map takes precedence and emits each message in source order', async () => {
    const state = startupState();
    // A complete 7-by-3 room leaves only the room summary to emit.
    for (let y = 5; y <= 7; ++y) {
        for (let x = 10; x <= 16; ++x) {
            state.level.at(x, y).typ = ROOM;
            reveal(state, x, y);
        }
    }
    state.a11y.glyph_updates = true;
    state.a11y.mon_notices = true;
    const emitted = [];
    const returned = await emitStartupA11yNotices(state, {
        pline: async (message, receivedState) => {
            assert.equal(receivedState, state);
            emitted.push(message);
        },
    });

    assert.deepEqual(returned, ['You are in a rectangular 7 by 3 room.']);
    assert.deepEqual(emitted, returned);
});
