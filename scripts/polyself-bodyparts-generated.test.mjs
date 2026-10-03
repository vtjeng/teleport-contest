// Keep the generated anatomy strings tied to polyself.c:mbodypart(). The
// twelve tables cover each named monster family; each has one string for
// NO_PART through STOMACH, inclusive.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    parseBodypartTables,
    renderBodypartTables,
} from './generate-polyself-bodyparts.mjs';

const C_SOURCE = new URL('../nethack-c/upstream/src/polyself.c', import.meta.url);
const GENERATED_SOURCE = new URL('../js/polyself_bodyparts.js', import.meta.url);

test('generated body-part module is the deterministic projection of C', () => {
    const cSource = readFileSync(C_SOURCE, 'utf8');
    const { tables, clawClasses } = parseBodypartTables(cSource);
    const generated = readFileSync(GENERATED_SOURCE, 'utf8');

    // C declares twelve named anatomy tables inside mbodypart().
    assert.equal(Object.keys(tables).length, 12);
    // NO_PART through STOMACH occupy nineteen indexed entries in C.
    for (const [name, parts] of Object.entries(tables)) {
        assert.equal(parts.length, 19, `${name}_parts spans all C part indices`);
    }
    // The C not_claws array excludes these class symbols from its hand-claw arm.
    assert.deepEqual(clawClasses, [
        'S_HUMAN', 'S_MUMMY', 'S_ZOMBIE', 'S_ANGEL', 'S_NYMPH',
        'S_LEPRECHAUN', 'S_QUANTMECH', 'S_VAMPIRE', 'S_ORC', 'S_GIANT',
    ]);

    assert.equal(generated, renderBodypartTables({ tables, clawClasses }));
});
