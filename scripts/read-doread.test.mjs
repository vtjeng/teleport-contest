import assert from 'node:assert/strict';
import test from 'node:test';

import {
    apron_text,
    candy_wrapper_text,
    erode_obj_text,
    hawaiian_design,
    hawaiian_motif,
    tshirt_text,
} from '../js/read.js';

test('read.c fixed apparel and candy text follows source tables and hashes', () => {
    const epoch = { ubirthday: 0 };

    // read.c:tshirt_text() indexes the 71-entry table by o_id.
    assert.equal(
        tshirt_text({ o_id: 0, oeroded: 0 }, epoch),
        'I explored the Dungeons of Doom and all I got was this lousy T-shirt!',
    );
    assert.equal(
        tshirt_text({ o_id: 1, oeroded: 0 }, epoch),
        'Is that Mjollnir in your pocket or are you just happy to see me?',
    );

    // The source hashes the motif with o_id ^ ubirthday and the background
    // with o_id ^ (unsigned)~ubirthday before selecting from separate tables.
    assert.equal(hawaiian_motif({ o_id: 5 }, epoch), 'tropical fish');
    assert.equal(
        hawaiian_design({ o_id: 1 }, epoch),
        'parrots on a red background',
    );

    // read.c:apron_text() uses the object id, and candy_wrapper_text() uses spe.
    assert.equal(apron_text({ o_id: 1, oeroded: 0 }, epoch),
        "I'm making SCIENCE!");
    assert.equal(candy_wrapper_text({ spe: 0 }), '');
    assert.equal(candy_wrapper_text({ spe: 1 }), 'Apollo');
    assert.equal(candy_wrapper_text({ spe: 12 }), 'Wonka Bar');
});

test('read.c erode_obj_text keeps its no-erosion and seeded wipeout results', () => {
    const epoch = { ubirthday: 0 };
    assert.equal(erode_obj_text({ o_id: 7, oeroded: 0 }, 'NetHack', epoch),
        'NetHack');
    assert.equal(erode_obj_text({ o_id: 35, oeroded: 3 }, 'NetHack', epoch),
        '|etH?c|');
});
