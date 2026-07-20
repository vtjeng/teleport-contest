import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as objects from '../js/objects.js';
import {
    ELF_STARTING_INSTRUMENTS,
    ELF_STARTING_INSTRUMENT_ROLES,
    INITIAL_INVENTORY_SUBSTITUTIONS,
    rollElfStartingInstrument,
    STARTING_INVENTORY_TABLES,
    UNDEF_BLESS,
    UNDEF_SPE,
    UNDEF_TYP,
} from '../js/u_init_inventory_data.js';

function scalar(token) {
    const trimmed = token.trim();
    if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
    if (trimmed === 'UNDEF_TYP') return UNDEF_TYP;
    if (trimmed === 'UNDEF_SPE') return UNDEF_SPE;
    if (trimmed === 'UNDEF_BLESS') return UNDEF_BLESS;
    assert.ok(trimmed in objects, `unknown upstream object token ${trimmed}`);
    return objects[trimmed];
}

function sourceInventoryTables() {
    const source = upstreamSource();
    const result = {};
    for (const match of source.matchAll(
        /static const struct trobj\s+(\w+)\[\]\s*=\s*\{([\s\S]*?)\};/g,
    )) {
        const entries = [...match[2].matchAll(
            /\{\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^}]+)\}/g,
        )].map((entry) => ({
            trotyp: scalar(entry[1]),
            trspe: scalar(entry[2]),
            trclass: scalar(entry[3]),
            trquan_min: scalar(entry[4]),
            trquan_max: scalar(entry[5]),
            trbless: scalar(entry[6]),
        })).filter(({ trclass }) => trclass !== 0);
        result[match[1]] = entries;
    }
    return result;
}

function upstreamSource() {
    return readFileSync(
        new URL('../nethack-c/upstream/src/u_init.c', import.meta.url),
        'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
}

test('all starting inventory tables exactly match upstream u_init.c', () => {
    assert.deepEqual(STARTING_INVENTORY_TABLES, sourceInventoryTables());
});

test('all inventory tables and descriptors are immutable', () => {
    assert.ok(Object.isFrozen(STARTING_INVENTORY_TABLES));
    for (const entries of Object.values(STARTING_INVENTORY_TABLES)) {
        assert.ok(Object.isFrozen(entries));
        for (const entry of entries) assert.ok(Object.isFrozen(entry));
    }
});

test('elven instrument eligibility and roll use the local source table', () => {
    const source = upstreamSource();
    const instruments = source.match(
        /static const int trotyp\[\]\s*=\s*\{([^}]+)\}/,
    );
    assert.ok(instruments, 'missing upstream elven instrument list');
    assert.deepEqual(
        ELF_STARTING_INSTRUMENTS,
        instruments[1].split(',').map(scalar),
    );

    const eligibility = source.match(
        /if \(Role_if\((PM_[A-Z_]+)\) \|\| Role_if\((PM_[A-Z_]+)\)\) \{\s*static const int trotyp/,
    );
    assert.ok(eligibility, 'missing upstream elven instrument eligibility');
    const roleFilecodes = { PM_CLERIC: 'Pri', PM_WIZARD: 'Wiz' };
    assert.deepEqual(
        ELF_STARTING_INSTRUMENT_ROLES,
        eligibility.slice(1).map((role) => roleFilecodes[role]),
    );

    const calls = [];
    const rolled = rollElfStartingInstrument({
        rn2(bound) {
            calls.push(bound);
            return 4;
        },
    });
    assert.deepEqual(calls, [6]);
    assert.deepEqual(rolled, [{
        trotyp: objects.BUGLE,
        trspe: 0,
        trclass: objects.TOOL_CLASS,
        trquan_min: 1,
        trquan_max: 1,
        trbless: 0,
    }]);
});

test('race substitutions exactly match active upstream inv_subs entries', () => {
    const raceFilecodes = {
        PM_ELF: 'Elf',
        PM_ORC: 'Orc',
        PM_DWARF: 'Dwa',
        PM_GNOME: 'Gno',
    };
    const block = upstreamSource().match(
        /static const struct inv_sub[\s\S]*?inv_subs\[\]\s*=\s*\{([\s\S]*?)\};/,
    );
    assert.ok(block, 'missing upstream inv_subs');
    const expected = [...block[1].matchAll(
        /\{\s*(PM_[A-Z_]+),\s*([A-Z0-9_]+),\s*([A-Z0-9_]+)\s*\}/g,
    )]
        .filter((match) => match[1] !== 'NON_PM')
        .map((match) => ({
            race: raceFilecodes[match[1]],
            item_otyp: scalar(match[2]),
            subs_otyp: scalar(match[3]),
        }));
    assert.deepEqual(INITIAL_INVENTORY_SUBSTITUTIONS, expected);
});
