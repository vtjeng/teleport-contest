// Pin polyself.c change_sex() (272-304). The species flags are read from
// monst.c: a newt carries neither M2_MALE nor M2_FEMALE, a water nymph
// carries M2_FEMALE. Role names are from role.c: Priest is
// { "Priest", "Priestess" } (role.c:275) and Valkyrie { "Valkyrie", 0 }
// (role.c:493). The amorous-demon arm calls set_uasmon(), which needs a
// complete hero, so it is left to recorded play.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    monst_globals_init, PM_CLERIC, PM_HUMAN, PM_NEWT, PM_VALKYRIE,
    PM_WATER_NYMPH,
} from '../js/monsters.js';
import { change_sex } from '../js/polyself.js';
import { roles } from '../js/roles.js';

const catalog = {};
monst_globals_init(catalog);
const mons = catalog.mons;

function heroState(roleMnum, { female, form = PM_HUMAN, mfemale = false }) {
    return {
        mons,
        flags: { female },
        u: { umonster: PM_HUMAN, umonnum: form, mfemale },
        youmonst: { data: mons[form] },
        urole: roles.find((role) => role.mnum === roleMnum),
        pl_character: '',
        gm: {},
    };
}

test('change_sex flips an unpolymorphed hero and renames her role', () => {
    // Priest has a female name, so the flipped hero reads "Priestess";
    // the !Upolyd arm also rewrites u.umonnum from u.umonster.
    const state = heroState(PM_CLERIC, { female: false });
    state.u.umonnum = PM_HUMAN;
    change_sex(state);
    assert.equal(state.flags.female, true);
    assert.equal(state.u.mfemale, false); // only the poly'd arm touches it
    assert.equal(state.pl_character, 'Priestess');
    assert.equal(state.u.umonnum, PM_HUMAN);
    // Valkyrie has no female name, so both genders read "Valkyrie".
    const valkyrie = heroState(PM_VALKYRIE, { female: true });
    change_sex(valkyrie);
    assert.equal(valkyrie.flags.female, false);
    assert.equal(valkyrie.pl_character, 'Valkyrie');
});

test('change_sex in a sexless form flips both the form and the saved sex', () => {
    // A newt is neither male, female nor neuter, so flags.female flips, and
    // Upolyd flips u.mfemale too; pl_character follows the saved sex.
    const state = heroState(PM_CLERIC, { female: false, form: PM_NEWT, mfemale: false });
    change_sex(state);
    assert.equal(state.flags.female, true);
    assert.equal(state.u.mfemale, true);
    assert.equal(state.pl_character, 'Priestess');
    assert.equal(state.u.umonnum, PM_NEWT); // still polymorphed
});

test('change_sex in a single-sex form changes only the saved sex', () => {
    // A water nymph is M2_FEMALE, so the form's gender stays female while
    // the saved sex flips from female to male and pl_character reads
    // the male name.
    const state = heroState(PM_CLERIC, { female: true, form: PM_WATER_NYMPH, mfemale: true });
    change_sex(state);
    assert.equal(state.flags.female, true);
    assert.equal(state.u.mfemale, false);
    assert.equal(state.pl_character, 'Priest');
});
