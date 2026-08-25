import assert from 'node:assert/strict';
import test from 'node:test';

import {
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    NO_SPELL,
} from '../js/const.js';
import { init_objects } from '../js/o_init.js';
import {
    MAXSPELL,
    SCR_AMNESIA,
    SCR_BLANK_PAPER,
    SCR_CHARGING,
    SCR_CONFUSE_MONSTER,
    SCR_CREATE_MONSTER,
    SCR_DESTROY_ARMOR,
    SCR_EARTH,
    SCR_ENCHANT_ARMOR,
    SCR_ENCHANT_WEAPON,
    SCR_FIRE,
    SCR_FOOD_DETECTION,
    SCR_GENOCIDE,
    SCR_GOLD_DETECTION,
    SCR_IDENTIFY,
    SCR_LIGHT,
    SCR_MAGIC_MAPPING,
    SCR_MAIL,
    SCR_PUNISHMENT,
    SCR_REMOVE_CURSE,
    SCR_SCARE_MONSTER,
    SCR_STINKING_CLOUD,
    SCR_TAMING,
    SCR_TELEPORTATION,
    SCROLL_CLASS,
    SPBOOK_CLASS,
    SPE_BLANK_PAPER,
    SPE_HEALING,
    SPE_STONE_TO_FLESH,
    TOOL_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';
import {
    known_spell,
    spe_Forgotten,
    spe_Fresh,
    spe_GoingStale,
    spe_Unknown,
} from '../js/spell.js';
import { cost, new_book_description, write_ok } from '../js/write.js';

// -- write_ok tests --------------------------------------------------------

test('write_ok suggests blank paper scroll', () => {
    // SCR_BLANK_PAPER is the preferred target for writing. write_ok(obj)
    // returns GETOBJ_SUGGEST so getobj highlights it as a likely choice.
    assert.equal(
        write_ok({ oclass: SCROLL_CLASS, otyp: SCR_BLANK_PAPER }),
        GETOBJ_SUGGEST,
    );
});

test('write_ok suggests blank spellbook', () => {
    // SPE_BLANK_PAPER is the spellbook-class blank, also preferred.
    assert.equal(
        write_ok({ oclass: SPBOOK_CLASS, otyp: SPE_BLANK_PAPER }),
        GETOBJ_SUGGEST,
    );
});

test('write_ok downplays non-blank scrolls', () => {
    // A non-blank scroll is selectable but not suggested, because writing on
    // it produces "That scroll is not blank!" and wastes wisdom.
    assert.equal(
        write_ok({ oclass: SCROLL_CLASS, otyp: SCR_IDENTIFY }),
        GETOBJ_DOWNPLAY,
    );
});

test('write_ok excludes non-scroll non-spellbook objects', () => {
    // A tool or weapon cannot be written on at all.
    assert.equal(
        write_ok({ oclass: TOOL_CLASS, otyp: 242 }),
        GETOBJ_EXCLUDE,
    );
    assert.equal(
        write_ok({ oclass: WEAPON_CLASS, otyp: 0 }),
        GETOBJ_EXCLUDE,
    );
});

test('write_ok excludes null', () => {
    // null means "no hands / self" -- not a valid writing surface.
    assert.equal(write_ok(null), GETOBJ_EXCLUDE);
});

// -- cost tests -----------------------------------------------------------

// Helper: create a minimal object with the given class and type, sufficient
// for cost() to look up oc_level via objectType().
function costState() {
    const state = { iflags: {}, flags: {} };
    init_objects(state, () => 0);
    return state;
}

test('cost returns 8 for group-1 scrolls (light, gold detection, etc.)', () => {
    // C ref: write.c:25-31. Six scrolls share cost 8.
    const state = costState();
    const group = [
        SCR_LIGHT, SCR_GOLD_DETECTION, SCR_FOOD_DETECTION,
        SCR_MAGIC_MAPPING, SCR_AMNESIA, SCR_FIRE, SCR_EARTH,
    ];
    for (const otyp of group) {
        assert.equal(
            cost({ oclass: SCROLL_CLASS, otyp }, state), 8,
            `scroll otyp ${otyp} should cost 8`,
        );
    }
});

test('cost returns 10 for destroy armor, create monster, punishment', () => {
    // C ref: write.c:32-34. Three scrolls share cost 10.
    const state = costState();
    for (const otyp of [SCR_DESTROY_ARMOR, SCR_CREATE_MONSTER, SCR_PUNISHMENT]) {
        assert.equal(cost({ oclass: SCROLL_CLASS, otyp }, state), 10);
    }
});

test('cost returns 12 for confuse monster', () => {
    // C ref: write.c:35. Confuse monster stands alone at cost 12.
    const state = costState();
    assert.equal(
        cost({ oclass: SCROLL_CLASS, otyp: SCR_CONFUSE_MONSTER }, state), 12,
    );
});

test('cost returns 14 for identify', () => {
    // C ref: write.c:37. Identify stands alone at cost 14.
    const state = costState();
    assert.equal(
        cost({ oclass: SCROLL_CLASS, otyp: SCR_IDENTIFY }, state), 14,
    );
});

test('cost returns 16 for enchant armor, remove curse, enchant weapon, charging', () => {
    // C ref: write.c:38-43.
    const state = costState();
    for (const otyp of [SCR_ENCHANT_ARMOR, SCR_REMOVE_CURSE,
                        SCR_ENCHANT_WEAPON, SCR_CHARGING]) {
        assert.equal(cost({ oclass: SCROLL_CLASS, otyp }, state), 16);
    }
});

test('cost returns 20 for scare monster, stinking cloud, taming, teleportation', () => {
    // C ref: write.c:44-48.
    const state = costState();
    for (const otyp of [SCR_SCARE_MONSTER, SCR_STINKING_CLOUD,
                        SCR_TAMING, SCR_TELEPORTATION]) {
        assert.equal(cost({ oclass: SCROLL_CLASS, otyp }, state), 20);
    }
});

test('cost returns 30 for genocide', () => {
    // C ref: write.c:49. Genocide is the most expensive scroll to write.
    const state = costState();
    assert.equal(
        cost({ oclass: SCROLL_CLASS, otyp: SCR_GENOCIDE }, state), 30,
    );
});

test('cost returns 2 for mail', () => {
    // C ref: write.c:22-23. SCR_MAIL is the cheapest scroll.
    const state = costState();
    assert.equal(
        cost({ oclass: SCROLL_CLASS, otyp: SCR_MAIL }, state), 2,
    );
});

test('cost returns 10 * oc_level for spellbooks', () => {
    // C ref: write.c:16-17. Spellbook cost scales with the book's level.
    // SPE_HEALING is level 1, so cost is 10. SPE_STONE_TO_FLESH is level 3,
    // so cost is 30.
    const state = costState();
    assert.equal(
        cost({ oclass: SPBOOK_CLASS, otyp: SPE_HEALING }, state),
        10 * state.objects[SPE_HEALING].oc_level,
    );
    assert.equal(
        cost({ oclass: SPBOOK_CLASS, otyp: SPE_STONE_TO_FLESH }, state),
        10 * state.objects[SPE_STONE_TO_FLESH].oc_level,
    );
});

test('cost throws for blank paper (impossible branch)', () => {
    // C ref: write.c:52-56. Writing blank paper on blank paper is caught
    // earlier in dowrite, so reaching cost() with it is impossible.
    const state = costState();
    assert.throws(
        () => cost({ oclass: SCROLL_CLASS, otyp: SCR_BLANK_PAPER }, state),
        { message: /impossible/ },
    );
});

// -- new_book_description tests -------------------------------------------

test('new_book_description prepends "into " for composition materials', () => {
    // C ref: write.c:399-401. The compositions "parchment", "vellum", and
    // "cloth" read unnaturally with "turns"; "turns into vellum" is better.
    const state = { iflags: {}, flags: {} };
    init_objects(state, () => 0);

    // Find a spellbook whose description is a composition word, by scanning
    // the catalog. The test verifies the "into " prefix rather than a specific
    // book type, because description assignment depends on the shuffled order.
    const compositions = ['parchment', 'vellum', 'cloth'];
    const first = state.svb.bases[SPBOOK_CLASS];
    const last = state.svb.bases[SPBOOK_CLASS + 1] - 1;
    let foundComposition = false;
    let foundNonComposition = false;
    for (let i = first; i <= last; i++) {
        const descr = state.obj_descr[state.objects[i].oc_descr_idx]?.oc_descr;
        if (!descr) continue;
        const result = new_book_description(i, state);
        if (compositions.includes(descr.toLowerCase())) {
            // Composition: "into parchment", "into vellum", or "into cloth"
            assert.ok(result.startsWith('into '),
                      `expected "into " prefix for "${descr}", got "${result}"`);
            assert.equal(result, `into ${descr}`);
            foundComposition = true;
        } else {
            // Non-composition: the description alone, e.g. "red" or "ragged"
            assert.ok(!result.startsWith('into '),
                      `no "into " for "${descr}", got "${result}"`);
            assert.equal(result, descr);
            foundNonComposition = true;
        }
    }
    // Confirm that at least one composition and one non-composition were found
    // so the test actually exercises both branches.
    assert.ok(foundComposition, 'expected at least one composition description');
    assert.ok(foundNonComposition, 'expected at least one non-composition description');
});

// -- known_spell tests ----------------------------------------------------

test('known_spell returns spe_Unknown for a spell not in the spellbook', () => {
    // The hero has not learned this spell, so it is unknown.
    const state = {
        svs: {
            spl_book: Array.from(
                { length: MAXSPELL + 1 },
                () => ({ sp_id: NO_SPELL, sp_lev: 0, sp_know: 0 }),
            ),
        },
    };
    assert.equal(known_spell(SPE_HEALING, state), spe_Unknown);
});

test('known_spell returns spe_Fresh for a recently learned spell', () => {
    // A spell with knowledge > KEEN/10 is fresh. KEEN = 20000, so KEEN/10 = 2000.
    // A spell with know = 2001 is fresh.
    const state = {
        svs: {
            spl_book: [
                { sp_id: SPE_HEALING, sp_lev: 1, sp_know: 2001 },
                ...Array.from(
                    { length: MAXSPELL },
                    () => ({ sp_id: NO_SPELL, sp_lev: 0, sp_know: 0 }),
                ),
            ],
        },
    };
    assert.equal(known_spell(SPE_HEALING, state), spe_Fresh);
});

test('known_spell returns spe_GoingStale for a fading spell', () => {
    // A spell with 0 < knowledge <= KEEN/10 (= 2000) is going stale.
    const state = {
        svs: {
            spl_book: [
                { sp_id: SPE_HEALING, sp_lev: 1, sp_know: 2000 },
                ...Array.from(
                    { length: MAXSPELL },
                    () => ({ sp_id: NO_SPELL, sp_lev: 0, sp_know: 0 }),
                ),
            ],
        },
    };
    assert.equal(known_spell(SPE_HEALING, state), spe_GoingStale);
});

test('known_spell returns spe_GoingStale at the boundary (know = 1)', () => {
    // knowledge = 1 is the minimum for going stale.
    const state = {
        svs: {
            spl_book: [
                { sp_id: SPE_HEALING, sp_lev: 1, sp_know: 1 },
                ...Array.from(
                    { length: MAXSPELL },
                    () => ({ sp_id: NO_SPELL, sp_lev: 0, sp_know: 0 }),
                ),
            ],
        },
    };
    assert.equal(known_spell(SPE_HEALING, state), spe_GoingStale);
});

test('known_spell returns spe_Forgotten for a fully forgotten spell', () => {
    // A spell with knowledge = 0 (or negative) is forgotten.
    const state = {
        svs: {
            spl_book: [
                { sp_id: SPE_HEALING, sp_lev: 1, sp_know: 0 },
                ...Array.from(
                    { length: MAXSPELL },
                    () => ({ sp_id: NO_SPELL, sp_lev: 0, sp_know: 0 }),
                ),
            ],
        },
    };
    assert.equal(known_spell(SPE_HEALING, state), spe_Forgotten);
});

test('known_spell searches through multiple spells to find the match', () => {
    // When the target spell is not the first entry, known_spell still finds it.
    const state = {
        svs: {
            spl_book: [
                { sp_id: SPE_STONE_TO_FLESH, sp_lev: 3, sp_know: 5000 },
                { sp_id: SPE_HEALING, sp_lev: 1, sp_know: 100 },
                ...Array.from(
                    { length: MAXSPELL - 1 },
                    () => ({ sp_id: NO_SPELL, sp_lev: 0, sp_know: 0 }),
                ),
            ],
        },
    };
    // know = 100 is 0 < 100 <= 2000, so going stale.
    assert.equal(known_spell(SPE_HEALING, state), spe_GoingStale);
});

// -- spe_* constant value tests -------------------------------------------

test('spe_* constants match C spell.h enum spellknowledge values', () => {
    // C ref: spell.h:20-25. Exact integer values.
    assert.equal(spe_Forgotten,  -1);
    assert.equal(spe_Unknown,     0);
    assert.equal(spe_Fresh,       1);
    assert.equal(spe_GoingStale,  2);
});
