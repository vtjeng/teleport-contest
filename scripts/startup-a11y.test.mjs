import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    COLNO,
    COULD_SEE,
    DB_WEST,
    DETECT_MONSTERS,
    DOOR,
    D_BROKEN,
    DRAWBRIDGE_UP,
    GPCOORDS_COMPASS,
    GPCOORDS_COMFULL,
    GPCOORDS_MAP,
    GPCOORDS_SCREEN,
    IN_SIGHT,
    INFRAVISION,
    LAVAPOOL,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    POOL,
    ROOM,
    ROOMOFFSET,
    ROWNO,
    SEE_INVIS,
    SINK,
    TELEPAT,
    W_SADDLE,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { init_objects } from '../js/o_init.js';
import {
    ARMOR_CLASS,
    CHEST,
    CRYSTAL_PLATE_MAIL,
    LEATHER_ARMOR,
    LONG_SWORD,
    WEAPON_CLASS,
    objects_globals_init,
} from '../js/objects.js';
import { parseNethackrc } from '../js/options.js';
import { M1_FLY, MZ_HUGE } from '../js/monsters.js';
import {
    _startupA11yInternals,
    collectLookaroundMessages,
    collectMonsterMovementMessage,
    collectMonsterNoticeMessage,
    collectMonsterNoticeMessages,
    emitStartupA11yNotices,
    sensesMonster,
    sensesMonsterWithoutDetection,
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
        uprops: [],
        unblind_telepat_range: 0,
        uswallow: false,
        uinwater: false,
    };
    state.iflags = { getpos_coords: 'n' };
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

test('monster sensing shares swallowed and underwater display gates', () => {
    for (const mode of ['detection', 'blind telepathy']) {
        const state = startupState();
        const monster = {
            data: { mflags1: 0, mflags2: 0 },
            mx: state.u.ux + 1,
            my: state.u.uy,
        };
        if (mode === 'detection') {
            state.u.uprops[DETECT_MONSTERS] = {
                intrinsic: 1,
                extrinsic: 0,
            };
        } else {
            state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0 };
            state.u.uprops[TELEPAT] = { intrinsic: 1, extrinsic: 0 };
        }
        const expectedWithoutDetection = mode === 'blind telepathy';
        const assertSensing = (expected, label) => {
            assert.equal(
                sensesMonster(monster, state),
                expected,
                `${mode}: ${label}: sensemon`,
            );
            assert.equal(
                sensesMonsterWithoutDetection(monster, state),
                expected && expectedWithoutDetection,
                `${mode}: ${label}: non-detection senses`,
            );
        };

        assertSensing(true, 'ordinary map');

        state.u.uswallow = true;
        state.u.ustuck = null;
        assertSensing(false, 'unrelated swallowed monster');
        state.u.ustuck = monster;
        assertSensing(true, 'swallowing monster');
        state.u.uswallow = false;

        state.u.uinwater = true;
        state.level.at(monster.mx, monster.my).typ = POOL;
        assertSensing(true, 'adjacent pool');
        state.level.at(monster.mx, monster.my).typ = LAVAPOOL;
        assertSensing(false, 'adjacent lava');
        state.level.at(monster.mx, monster.my).typ = ROOM;
        assertSensing(false, 'adjacent non-pool');
        state.level.at(monster.mx, monster.my).typ = POOL;
        monster.mx = state.u.ux + 3; // Squared distance 9 exceeds mdistu <= 2.
        state.level.at(monster.mx, monster.my).typ = POOL;
        assertSensing(false, 'distant pool');
    }
});

test('accessibility startup options retain their source-owned state', () => {
    assert.deepEqual(parseNethackrc('').a11y, {
        accessiblemsg: false,
        glyph_updates: false,
        mon_movement: false,
        mon_notices: false,
        mon_notices_blocked: 0,
    });
    assert.deepEqual(
        parseNethackrc(
            'OPTIONS=accessiblemsg,mention_map,mon_movement,'
                + 'spot_monsters,!accessiblemsg',
        ).a11y,
        {
            accessiblemsg: true,
            glyph_updates: true,
            mon_movement: true,
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

    // These positions force y-major ordering: sink, northwest pet, broken door.
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
        '(4west): broken door.',
    ]);
});

test('look-at recognizes a drawbridge portcullis from its adjacent bridge', () => {
    const state = startupState();
    const x = 9;
    const y = 6;
    const doorway = state.level.at(x, y);
    doorway.typ = DOOR;
    const bridge = state.level.at(x + 1, y);
    bridge.typ = DRAWBRIDGE_UP;
    bridge.flags = DB_WEST;

    assert.equal(
        _startupA11yInternals.terrainDescription(
            doorway,
            x,
            y,
            state,
        ),
        'open drawbridge portcullis',
    );
});

test('accessible locations honor every whatis_coord presentation', () => {
    const state = startupState(13, 6);
    const describe = _startupA11yInternals.coordinateDescription;
    for (const [mode, expected] of [
        [GPCOORDS_COMPASS, '(2n,3w)'],
        [GPCOORDS_COMFULL, '(2north,3west)'],
        [GPCOORDS_MAP, '<10,4>'],
        [GPCOORDS_SCREEN, '[06,10]'],
    ]) {
        state.iflags.getpos_coords = mode;
        assert.equal(describe(10, 4, state), expected, mode);
    }
    state.iflags.getpos_coords = 'n';
    assert.equal(
        describe(10, 4, state),
        '(2north,3west)',
        'accessible pline output falls back from none to full compass',
    );
    state.iflags.getpos_coords = GPCOORDS_COMPASS;
    assert.equal(describe(12, 5, state), '(northwest)');
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

test('notice_all_mons distinguishes sight, infravision, and sensing', () => {
    const state = startupState(20, 10);
    const monster = (overrides = {}) => ({
        data: {
            pmnames: [null, null, 'goblin'],
            mflags1: 0,
            mflags2: 0,
            mflags3: 0,
        },
        mx: 22,
        my: 10,
        mhp: 4,
        mtame: 0,
        mpeaceful: false,
        m_ap_type: 0,
        mspotted: false,
        nmon: null,
        ...overrides,
    });
    const notice = (current) => {
        state.level.monlist = current;
        current.mspotted = false;
        return collectMonsterNoticeMessages(state);
    };

    const ordinary = monster();
    reveal(state, ordinary.mx, ordinary.my);
    assert.deepEqual(notice(ordinary), ['You see a goblin.']);

    const invisible = monster({ minvis: true });
    assert.deepEqual(notice(invisible), []);
    state.u.uprops[SEE_INVIS] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    assert.deepEqual(notice(invisible), ['You see a goblin.']);

    state.u.uprops[SEE_INVIS] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    state.viz_array[ordinary.my][ordinary.mx] = COULD_SEE;
    state.u.uprops[INFRAVISION] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    const infrared = monster({ data: {
        pmnames: [null, null, 'goblin'],
        mflags1: 0,
        mflags2: 0,
        mflags3: 0x0200,
    } });
    assert.deepEqual(notice(infrared), ['You see a goblin.']);

    state.u.uprops[INFRAVISION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    state.u.uprops[TELEPAT] = { intrinsic: 0, extrinsic: 1, blocked: 0 };
    state.u.unblind_telepat_range = 20;
    assert.deepEqual(notice(monster()), ['You notice a goblin.']);

    state.u.uprops[TELEPAT] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    state.u.unblind_telepat_range = 0;
    assert.deepEqual(notice(monster()), ['You notice a goblin.']);

    state.u.uprops[TELEPAT] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    state.u.uprops[BLINDED] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    state.u.uprops[DETECT_MONSTERS] = {
        intrinsic: 1, extrinsic: 0, blocked: 0,
    };
    const hidden = monster({
        mundetected: true,
        data: {
            pmnames: [null, null, 'goblin'],
            mflags1: 0x00000100,
            mflags2: 0,
            mflags3: 0,
        },
    });
    assert.deepEqual(notice(hidden), []);
    hidden.mundetected = false;
    hidden.m_ap_type = M_AP_FURNITURE;
    assert.deepEqual(notice(hidden), []);
});

test('notice_mon updates one monster only while its option is active', () => {
    const state = startupState(20, 10);
    const subject = {
        data: {
            pmnames: [null, null, 'goblin'],
            mflags1: 0,
            mflags2: 0,
            mflags3: 0,
        },
        mx: 21, // One visible square east exercises the single-monster path.
        my: 10,
        mhp: 4,
        mtame: 0,
        mpeaceful: false,
        m_ap_type: 0,
        mspotted: false,
    };
    reveal(state, subject.mx, subject.my);

    assert.equal(collectMonsterNoticeMessage(subject, state), null);
    assert.equal(subject.mspotted, false);

    state.a11y.mon_notices = true;
    assert.equal(
        collectMonsterNoticeMessage(subject, state),
        'You see a goblin.',
    );
    assert.equal(subject.mspotted, true);
    assert.equal(collectMonsterNoticeMessage(subject, state), null);

    state.viz_array[subject.my][subject.mx] = 0;
    assert.equal(collectMonsterNoticeMessage(subject, state), null);
    assert.equal(subject.mspotted, false);

    subject.mspotted = true;
    state.a11y.mon_notices = false;
    assert.equal(collectMonsterNoticeMessage(subject, state), null);
    assert.equal(subject.mspotted, true);
});

test('monster movement messages classify source-relative distance', () => {
    const state = startupState(20, 10);
    state.a11y.mon_movement = true;
    const subject = {
        data: {
            pmnames: [null, null, 'goblin'],
            mflags1: 0,
            mmove: 12,
        },
        mx: 21,
        my: 10,
        mhp: 4,
        mspotted: true,
    };
    const moved = (oldX, oldY, newX, newY) => {
        subject.mx = newX;
        subject.my = newY;
        state.viz_array = Array.from(
            { length: ROWNO },
            () => new Uint8Array(COLNO),
        );
        reveal(state, newX, newY);
        return collectMonsterMovementMessage(
            subject,
            oldX,
            oldY,
            state,
        );
    };

    // Squared distances 1, 16, 25, and 81 cover next-to, close in either
    // direction, and beyond BOLT_LIM.
    assert.equal(moved(22, 10, 21, 10), 'The goblin moves next to you.');
    assert.equal(moved(25, 10, 24, 10), 'The goblin moves closer.');
    assert.equal(moved(24, 10, 25, 10), 'The goblin moves further away.');
    assert.equal(
        moved(28, 10, 29, 10),
        'The goblin moves in the distance.',
    );

    state.a11y.accessiblemsg = true;
    assert.equal(
        moved(25, 10, 24, 10),
        '(4east): The goblin moves closer.',
    );
});

test('monster movement messages require the option, sight, and prior notice',
    () => {
        const state = startupState(20, 10);
        const subject = {
            data: {
                pmnames: [null, null, 'fog cloud'],
                mflags1: M1_FLY,
                mmove: 12,
                // locomotion() splits flyers on msize, as C does, so a
                // species fixture has to carry it. The real fog cloud is
                // MZ_HUGE (monsters.h).
                msize: MZ_HUGE,
            },
            mx: 22,
            my: 10,
            mhp: 4,
            mspotted: true,
        };
        reveal(state, subject.mx, subject.my);

        assert.equal(
            collectMonsterMovementMessage(subject, 23, 10, state),
            null,
        );
        state.a11y.mon_movement = true;
        assert.equal(
            collectMonsterMovementMessage(subject, 23, 10, state),
            'The fog cloud flies closer.',
        );
        subject.mspotted = false;
        assert.equal(
            collectMonsterMovementMessage(subject, 23, 10, state),
            null,
        );
        subject.mspotted = true;
        state.viz_array[subject.my][subject.mx] = 0;
        assert.equal(
            collectMonsterMovementMessage(subject, 23, 10, state),
            null,
        );
    });

test('monster notices retain saddle adjectives except for given names', () => {
    const state = startupState(20, 10);
    const pony = (overrides = {}) => ({
        data: { pmnames: [null, null, 'pony'], mflags1: 0 },
        mx: 21,
        my: 10,
        mhp: 8,
        mtame: 10,
        mpeaceful: true,
        m_ap_type: 0,
        misc_worn_check: W_SADDLE,
        mspotted: false,
        nmon: null,
        ...overrides,
    });
    reveal(state, 21, 10);

    state.level.monlist = pony();
    assert.deepEqual(collectMonsterNoticeMessages(state), [
        'You see your saddled pony.',
    ]);
    state.level.monlist = pony({ mgivenname: 'Shadowfax' });
    assert.deepEqual(collectMonsterNoticeMessages(state), [
        'You see Shadowfax.',
    ]);
    state.level.monlist = pony({ misc_worn_check: 0 });
    assert.deepEqual(collectMonsterNoticeMessages(state), [
        'You see your pony.',
    ]);
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

test('lookaround object names retain grease and erosion modifier order', () => {
    const state = startupState();
    objects_globals_init(state);
    init_objects(state, () => 0);
    const describe = _startupA11yInternals.describeObject;
    const base = {
        oclass: WEAPON_CLASS,
        dknown: true,
        quan: 1,
        ox: state.u.ux,
        oy: state.u.uy,
    };
    assert.equal(describe({
        ...base,
        otyp: LONG_SWORD,
        greased: true,
        oeroded: 2,
        oeroded2: 3,
    }, state), 'a greased very rusty thoroughly corroded long sword');
    assert.equal(describe({
        ...base,
        otyp: LEATHER_ARMOR,
        oclass: ARMOR_CLASS,
        oeroded: 1,
        oeroded2: 2,
    }, state), 'a burnt very rotted leather armor');
    assert.equal(describe({
        ...base,
        otyp: CRYSTAL_PLATE_MAIL,
        oclass: ARMOR_CLASS,
        oeroded: 3,
    }, state), 'a thoroughly cracked crystal plate mail');
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
