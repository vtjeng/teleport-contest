// objnam.c the_unique_pm() and corpse_xname(), and the two helpers eat.c
// eatcorpse() reaches for a corpse it is about to name or age: mondata.h
// telepathic() and mkobj.c peek_at_iced_corpse_age().
//
// Every expectation is read from the C source rather than from the port: the
// monst.c row for each species, and the format corpse_xname() assembles.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CXN_ARTICLE,
    CXN_NOCORPSE,
    CXN_NORMAL,
    CXN_NO_PFX,
    CXN_PFX_THE,
    CXN_SINGULAR,
} from '../js/const.js';
import { telepathic, type_is_pname } from '../js/mondata.js';
import {
    NON_PM,
    PM_CROESUS,
    PM_FLOATING_EYE,
    PM_GOBLIN,
    PM_HIGH_CLERIC,
    PM_LONG_WORM_TAIL,
    PM_MASTER_MIND_FLAYER,
    PM_MEDUSA,
    PM_MIND_FLAYER,
    PM_NEWT,
    PM_ORACLE,
    PM_WIZARD_OF_YENDOR,
    monst_globals_init,
} from '../js/monsters.js';
import { peek_at_iced_corpse_age } from '../js/obj.js';
import { corpse_xname, the_unique_pm } from '../js/objnam.js';
import { CORPSE, LARGE_BOX } from '../js/objects.js';

const state = { mons: monst_globals_init({}), moves: 100 };
const species = (index) => state.mons[index];

function corpse(overrides = {}) {
    return { otyp: CORPSE, corpsenm: PM_GOBLIN, quan: 1, ...overrides };
}

test('the_unique_pm answers for the four species C names', () => {
    // objnam.c:1801-1821. The Oracle is the ordinary G_UNIQ case, and the
    // three named lines each override it.
    assert.ok(the_unique_pm(species(PM_ORACLE)));
    assert.ok(!the_unique_pm(species(PM_GOBLIN)), 'an ordinary species');
    // "we want to describe them as Name rather than the Name"
    assert.ok(type_is_pname(species(PM_MEDUSA)));
    assert.ok(!the_unique_pm(species(PM_MEDUSA)));
    // The high priest and the worm tail are unique in monst.c and not here.
    assert.notEqual(species(PM_HIGH_CLERIC).geno & 0x1000, 0);
    assert.ok(!the_unique_pm(species(PM_HIGH_CLERIC)));
    assert.ok(!the_unique_pm(species(PM_LONG_WORM_TAIL)));
    // The Wizard is forced true whatever monst.c says.
    assert.ok(the_unique_pm(species(PM_WIZARD_OF_YENDOR)));
});

test('corpse_xname places the article the flags asked for', () => {
    // CXN_NORMAL asks for no article at all.
    assert.equal(corpse_xname(corpse(), null, CXN_NORMAL, state),
        'goblin corpse');
    // CXN_PFX_THE prefixes "the ", and CXN_ARTICLE runs an() over the result.
    assert.equal(corpse_xname(corpse(), null, CXN_PFX_THE, state),
        'the goblin corpse');
    assert.equal(corpse_xname(corpse(), null, CXN_ARTICLE, state),
        'a goblin corpse');
    // "mutually exclusive": both flags together leave only "the ".
    assert.equal(
        corpse_xname(corpse(), null, CXN_PFX_THE | CXN_ARTICLE, state),
        'the goblin corpse',
    );
    // CXN_NOCORPSE drops the suffix do_name() would append itself.
    assert.equal(corpse_xname(corpse(), null, CXN_NOCORPSE, state), 'goblin');
});

test('corpse_xname pluralizes only when the flags let the quantity through',
    () => {
        const two = corpse({ quan: 2 });
        assert.equal(corpse_xname(two, null, CXN_NORMAL, state),
            'goblin corpses');
        // "avoid a newt corpses": the plural cancels the article.
        assert.equal(corpse_xname(two, null, CXN_ARTICLE, state),
            'goblin corpses');
        // CXN_SINGULAR overrides the quantity, and then the article returns.
        assert.equal(corpse_xname(two, null, CXN_SINGULAR, state),
            'goblin corpse');
        assert.equal(
            corpse_xname(two, null, CXN_SINGULAR | CXN_ARTICLE, state),
            'a goblin corpse',
        );
    });

test('corpse_xname puts the adjective where the monster name allows', () => {
    // "cursed partly eaten troll corpse": an ordinary name takes it in front.
    assert.equal(
        corpse_xname(corpse(), 'partly eaten', CXN_NORMAL, state),
        'partly eaten goblin corpse',
    );
    // "Medusa's cursed partly eaten corpse": a possessive name takes it after.
    assert.equal(
        corpse_xname(corpse({ corpsenm: PM_MEDUSA }), 'partly eaten',
            CXN_NORMAL, state),
        "Medusa's partly eaten corpse",
    );
    // mungspaces() squeezes out a trailing space the caller left behind.
    assert.equal(
        corpse_xname(corpse(), 'cursed ', CXN_NORMAL, state),
        'cursed goblin corpse',
    );
    // "doname() might include a count in the adjective argument; if so, don't
    // prepend an article."
    assert.equal(
        corpse_xname(corpse(), '2', CXN_ARTICLE, state),
        '2 goblin corpse',
    );
});

test('corpse_xname gives a unique monster "the" and a named one neither',
    () => {
        // "always precede non-personal unique monster name like Oracle with
        // the unless explicitly overridden"
        assert.equal(corpse_xname(corpse({ corpsenm: PM_ORACLE }), null,
            CXN_NORMAL, state), "the Oracle's corpse");
        assert.equal(corpse_xname(corpse({ corpsenm: PM_ORACLE }), null,
            CXN_NO_PFX, state), "Oracle's corpse");
        // A personal name suppresses the article however it was asked for.
        for (const flags of [CXN_NORMAL, CXN_PFX_THE, CXN_ARTICLE]) {
            assert.equal(corpse_xname(corpse({ corpsenm: PM_MEDUSA }), null,
                flags, state), "Medusa's corpse", `flags ${flags}`);
        }
        // A capitalized personal name that is not unique in monst.c takes the
        // same possessive route, because type_is_pname() alone selects it.
        assert.ok(type_is_pname(species(PM_CROESUS)));
        assert.equal(corpse_xname(corpse({ corpsenm: PM_CROESUS }), null,
            CXN_ARTICLE, state), "Croesus' corpse");
        // NON_PM is C's "paranoia" arm.
        assert.equal(corpse_xname(corpse({ corpsenm: NON_PM }), null,
            CXN_NORMAL, state), 'thing corpse');
    });

test('corpse_xname refuses only a globby object that is not a corpse', () => {
    // The glob arm needs OBJ_NAME(objects[otyp]); a CORPSE with the flag set
    // is not one, so it has to name itself the ordinary way.
    assert.equal(
        corpse_xname(corpse({ globby: true }), null, CXN_NORMAL, state),
        'goblin corpse',
    );
    assert.throws(
        () => corpse_xname({ otyp: LARGE_BOX, corpsenm: PM_GOBLIN, quan: 1,
            globby: true }, null, CXN_NORMAL, state),
        { name: 'UnsupportedObjectNameError' },
    );
});

test('telepathic answers for the three species mondata.h names', () => {
    // mondata.h:84-86 is an identity test rather than a flag, so each of the
    // three has to answer on its own.
    assert.ok(telepathic(species(PM_FLOATING_EYE)));
    assert.ok(telepathic(species(PM_MIND_FLAYER)));
    assert.ok(telepathic(species(PM_MASTER_MIND_FLAYER)));
    assert.ok(!telepathic(species(PM_NEWT)));
});

test('peek_at_iced_corpse_age moves an iced corpse forward, nothing else',
    () => {
        // mkobj.c:2422-2438 with ROT_ICE_ADJUSTMENT 2: half the elapsed time
        // did not count, so the stored age moves forward by that half.
        const off = corpse({ age: 40 });
        assert.equal(peek_at_iced_corpse_age(off, state), 40);
        const on = corpse({ age: 40, on_ice: true });
        assert.equal(peek_at_iced_corpse_age(on, state), 70, '40 + (100-40)/2');
        // The odd half rounds toward zero, as C's integer divide does.
        assert.equal(
            peek_at_iced_corpse_age(corpse({ age: 41, on_ice: true }), state),
            70, '41 + (100-41)/2',
        );
        // The otyp test is not redundant: an iced non-corpse keeps its age.
        assert.equal(
            peek_at_iced_corpse_age(
                { otyp: LARGE_BOX, age: 40, on_ice: true }, state,
            ),
            40,
        );
    });
