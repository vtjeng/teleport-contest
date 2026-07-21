import assert from 'node:assert/strict';
import test from 'node:test';

import { THEMEROOM_DEFINITIONS } from '../js/themeroom_data.js';

function definitionNamed(name) {
    const definition = THEMEROOM_DEFINITIONS.find((entry) => entry.name === name);
    assert.ok(definition, `missing generated themeroom ${name}`);
    return definition;
}

function eligibleAtDifficulty(definition, difficulty) {
    return (definition.mindiff == null || difficulty >= definition.mindiff)
        && (definition.maxdiff == null || difficulty <= definition.maxdiff);
}

test('generated themeroom actions cover the pinned Lua table in source order', () => {
    // themerms.lua has 31 room definitions. Twin businesses has mindiff=4,
    // leaving the other 30 eligible on dungeon level 1.
    assert.equal(THEMEROOM_DEFINITIONS.length, 31);
    assert.equal(
        THEMEROOM_DEFINITIONS.filter((definition) => eligibleAtDifficulty(definition, 1)).length,
        30,
    );

    const ids = THEMEROOM_DEFINITIONS.map((definition) => definition.id);
    assert.equal(new Set(ids).size, ids.length);
    for (let index = 1; index < THEMEROOM_DEFINITIONS.length; ++index) {
        assert.ok(
            THEMEROOM_DEFINITIONS[index - 1].sourceLine
                < THEMEROOM_DEFINITIONS[index].sourceLine,
            'generated definitions must retain Lua source order',
        );
    }

    const counts = Object.groupBy(
        THEMEROOM_DEFINITIONS,
        (definition) => definition.action.kind,
    );
    // Four literal room callbacks and 19 map callbacks are data-driven. The
    // remaining eight callbacks have named handlers; one is the D:4-only room.
    assert.equal(counts.room?.length, 4);
    assert.equal(counts.map?.length, 19);
    assert.equal(counts.handler?.length, 8);
    assert.deepEqual(Object.keys(counts).sort(), ['handler', 'map', 'room']);
});

test('literal room actions retain type, lighting, fill, and callback fields', () => {
    assert.deepEqual(definitionNamed('default').action, {
        kind: 'room',
        room: { type: 'ordinary', filled: 1 },
    });
    assert.deepEqual(definitionNamed('Default room with themed fill').action, {
        kind: 'room',
        room: { type: 'themed' },
        contents: { kind: 'themeroom-fill' },
    });
    assert.deepEqual(definitionNamed('Unlit room with themed fill').action, {
        kind: 'room',
        room: { type: 'themed', lit: 0 },
        contents: { kind: 'themeroom-fill' },
    });
    assert.deepEqual(
        definitionNamed('Room with both normal contents and themed fill').action,
        {
            kind: 'room',
            room: { type: 'themed', filled: 1 },
            contents: { kind: 'themeroom-fill' },
        },
    );
});

test('map actions distinguish direct filler callbacks from bespoke callbacks', () => {
    const maps = THEMEROOM_DEFINITIONS.filter(
        (definition) => definition.action.kind === 'map',
    );
    const directFillers = maps.filter(
        (definition) => definition.action.contents.kind === 'filler-region',
    );
    const callbacksWithFillers = maps.filter(
        (definition) => definition.action.contents.filler,
    );
    // Seventeen maps call only filler_region. Blocked center also calls it,
    // after preprocessing; Water-surrounded vault is the sole map without it.
    assert.equal(directFillers.length, 17);
    assert.equal(callbacksWithFillers.length, 18);
    assert.equal(maps.filter((definition) => definition.filler).length, 17);

    const cross = definitionNamed('Cross');
    assert.deepEqual(cross.action.contents, {
        kind: 'filler-region',
        filler: { x: 6, y: 6 },
    });
    assert.deepEqual([cross.width, cross.height], [11, 11]);

    const blocked = definitionNamed('Blocked center');
    assert.deepEqual(blocked.action.contents, {
        kind: 'handler',
        handler: 'blocked-center',
        filler: { x: 1, y: 1 },
    });
    assert.equal(Object.hasOwn(blocked, 'filler'), false);
    assert.equal(blocked.map[4], '|...LLL...|');

    const waterVault = definitionNamed('Water-surrounded vault');
    assert.deepEqual(waterVault.action.contents, {
        kind: 'handler',
        handler: 'water-surrounded-vault',
    });
    assert.deepEqual([waterVault.width, waterVault.height], [6, 6]);
});

test('bespoke callback ids are stable, explicit, and deeply frozen', () => {
    const handlerIds = THEMEROOM_DEFINITIONS
        .filter((definition) => definition.action.kind === 'handler')
        .map((definition) => definition.action.handler);
    assert.deepEqual(handlerIds, [
        'fake-delphi',
        'room-in-a-room',
        'huge-room-with-another-room-inside',
        'nesting-rooms',
        'pillars',
        'mausoleum',
        'random-dungeon-feature-in-the-middle-of-an-odd-sized-room',
        'twin-businesses',
    ]);

    const cross = definitionNamed('Cross');
    assert.equal(Object.isFrozen(THEMEROOM_DEFINITIONS), true);
    assert.equal(Object.isFrozen(cross), true);
    assert.equal(Object.isFrozen(cross.action), true);
    assert.equal(Object.isFrozen(cross.action.contents.filler), true);
    assert.equal(Object.isFrozen(cross.map), true);
});
