// C code that needs a temporary object writes `temp = cg.zeroobj;` and then
// sets a few fields. The port's cg.zeroobj is newObject() in js/obj.js. No
// game state carries a `zeroobj` property, so spreading one copies nothing
// and leaves every field C zeroes undefined: object_detect()'s mimic copy
// then added an undefined class to a glyph offset.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    FIRST_REAL_GEM, FIRST_SPELL, LAST_GLASS_GEM, LAST_SPELL,
} from '../js/objects.js';
import { generic_obj_to_glyph, object_is_generic } from '../js/display.js';
import { GLYPH_OBJ_OFF } from '../js/glyph_offsets.js';
import { newObject } from '../js/obj.js';

const JS_DIR = join(fileURLToPath(new URL('..', import.meta.url)), 'js');

test('no game code reads a zeroobj property', () => {
    const found = [];
    for (const name of readdirSync(JS_DIR)) {
        if (!name.endsWith('.js')) continue;
        readFileSync(join(JS_DIR, name), 'utf8').split('\n')
            .forEach((line, index) => {
                // `cg.zeroobj` names the C value in a comment; any other
                // owner is a property read that yields undefined.
                if (/(?<!\bcg)\.zeroobj\b/.test(line))
                    found.push(`js/${name}:${index + 1}`);
            });
    }
    assert.deepEqual(found, []);
});

test('a zeroed copy of a gem or spellbook is generic with class zero', () => {
    // display.h obj_is_generic() (925-931) takes an unseen gem or spellbook
    // by type alone, and generic_obj_to_glyph() (940-942) adds its class.
    // The four types are the ends of the two ranges obj_is_generic() names.
    for (const otyp of [
        FIRST_REAL_GEM, LAST_GLASS_GEM, FIRST_SPELL, LAST_SPELL,
    ]) {
        const copy = newObject({ otyp });
        assert.equal(object_is_generic(copy), true);
        // cg.zeroobj's oclass is 0, so the glyph is the first object glyph.
        assert.equal(generic_obj_to_glyph(copy, {}), GLYPH_OBJ_OFF);
    }
});
