// Pin polyself.c's pure form predicates: poly_gender() (2149-2157),
// ugenocided() (2265-2270) and udeadinside() (2273-2285), with the
// mondata.h:218 weirdnonliving() macro udeadinside() reads. Every expected
// value is read from the C source and the species flags in
// include/monsters.h; the species indexes are the port's pm.h numerals.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    monst_globals_init,
    PM_FLESH_GOLEM, PM_FOG_CLOUD, PM_GNOME, PM_HUMAN, PM_HUMAN_ZOMBIE,
    PM_MANES, PM_RED_DRAGON, PM_STRAW_GOLEM, PM_WIZARD,
    NUMMONS,
} from '../js/monsters.js';
import { weirdnonliving } from '../js/mondata.js';
import { poly_gender, udeadinside, ugenocided } from '../js/polyself.js';
import { G_GENOD } from '../js/const.js';

let _mons;
function testMons() {
    if (!_mons) {
        const catalog = {};
        monst_globals_init(catalog);
        _mons = catalog.mons;
    }
    return _mons;
}

// The three functions read youmonst.data, flags.female, and the role and
// race genocide flags; nothing else on the state is touched.
function formState(species, { female = false } = {}) {
    const mons = testMons();
    return {
        mons,
        youmonst: { data: mons[species] },
        flags: { female },
        urole: { mnum: PM_WIZARD },
        urace: { mnum: PM_HUMAN },
        svm: {
            mvitals: Array.from({ length: NUMMONS }, () => ({ mvflags: 0 })),
        },
    };
}

// -- poly_gender (polyself.c:2149-2157) --
test('poly_gender answers flags.female for a gendered humanoid form', () => {
    // gnome: monsters.h:1681 has M1_HUMANOID and no M2_NEUTER, so the
    // hero's own flags.female is the answer: 0 for male, 1 for female.
    assert.equal(poly_gender(formState(PM_GNOME)), 0);
    assert.equal(poly_gender(formState(PM_GNOME, { female: true })), 1);
});

test('poly_gender answers 2 for a non-humanoid or neuter form', () => {
    // red dragon: no M1_HUMANOID, so 2 (none) whatever flags.female says.
    assert.equal(poly_gender(formState(PM_RED_DRAGON, { female: true })), 2);
    // straw golem: M1_HUMANOID but M2_NEUTER (monsters.h "straw golem"), so
    // the neuter test answers 2 before the humanoid test is reached.
    assert.equal(poly_gender(formState(PM_STRAW_GOLEM)), 2);
});

// -- ugenocided (polyself.c:2265-2270) --
test('ugenocided reads the role and race G_GENOD bits', () => {
    const state = formState(PM_RED_DRAGON);
    assert.equal(ugenocided(state), false);
    // Genociding the role species (PM_WIZARD) alone is enough.
    state.svm.mvitals[PM_WIZARD].mvflags = G_GENOD;
    assert.equal(ugenocided(state), true);
    // So is genociding the race species (PM_HUMAN) alone.
    state.svm.mvitals[PM_WIZARD].mvflags = 0;
    state.svm.mvitals[PM_HUMAN].mvflags = G_GENOD;
    assert.equal(ugenocided(state), true);
});

// -- weirdnonliving (mondata.h:218) and udeadinside (polyself.c:2273-2285) --
test('weirdnonliving is golems plus vortices', () => {
    const mons = testMons();
    // flesh golem is S_GOLEM (monsters.h:2553); fog cloud is S_VORTEX
    // (monsters.h:1053).
    assert.equal(weirdnonliving(mons[PM_FLESH_GOLEM]), true);
    assert.equal(weirdnonliving(mons[PM_FOG_CLOUD]), true);
    // human zombie is M2_UNDEAD (monsters.h:2461) but neither a golem nor a
    // vortex; manes (monsters.h:544) is S_IMP with no undead flag.
    assert.equal(weirdnonliving(mons[PM_HUMAN_ZOMBIE]), false);
    assert.equal(weirdnonliving(mons[PM_MANES]), false);
    assert.equal(weirdnonliving(mons[PM_GNOME]), false);
});

test('udeadinside names the feeling by how nonliving the form is', () => {
    // living, including demons: "dead"
    assert.equal(udeadinside(formState(PM_GNOME)), 'dead');
    // undead plus manes (nonliving but not weirdnonliving): "condemned"
    assert.equal(udeadinside(formState(PM_HUMAN_ZOMBIE)), 'condemned');
    assert.equal(udeadinside(formState(PM_MANES)), 'condemned');
    // golems plus vortices: "empty"
    assert.equal(udeadinside(formState(PM_FLESH_GOLEM)), 'empty');
    assert.equal(udeadinside(formState(PM_FOG_CLOUD)), 'empty');
});
