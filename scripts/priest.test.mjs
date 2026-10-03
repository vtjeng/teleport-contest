import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { A_CHAOTIC, A_LAWFUL, A_NEUTRAL, A_NONE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { mon_aligntyp } from '../js/priest.js';
import { runSegment } from '../js/jsmain.js';
import { PM_ALIGNED_CLERIC } from '../js/monsters.js';
import { getRngLog } from '../js/rng.js';

const RECIPE = JSON.parse(readFileSync(
    new URL('../recordings/priest.c/roamer-sanctum-gnome-wizard.session.json',
        import.meta.url),
));
const ACTION_RECIPE = JSON.parse(readFileSync(
    new URL('../recordings/priest.c/roamer-sanctum-valkyrie-action.session.json',
        import.meta.url),
));

function alignedRoamers() {
    const roamers = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        if (monster.data?.pmidx === PM_ALIGNED_CLERIC)
            roamers.push(monster);
    }
    return roamers;
}

test('Sanctum explicit aligned clerics use priest.c mk_roamer', async () => {
    // sp_lev.c create_monster() routes the Sanctum's explicit noalign
    // descriptors through priest.c mk_roamer(), which creates ordinary
    // non-tame EMIN roamers. This inspects the production route reached by
    // the independent gnome Wizard recording rather than a direct helper.
    await runSegment(RECIPE.segments[0]);
    assert.equal(game.urole.name.m, 'Wizard');
    assert.equal(game.urace.adj, 'gnomish');
    assert.equal(game.flags.female, true);
    assert.equal(game.u.ualign.type, A_NEUTRAL);

    const roamers = alignedRoamers();
    assert.equal(roamers.length, 9);
    for (const roamer of roamers) {
        assert.equal(roamer.ispriest, false);
        assert.equal(roamer.isminion, true);
        assert.equal(roamer.mpeaceful, false);
        assert.equal(roamer.msleeping, false);
        assert.deepEqual(roamer.mextra.emin, {
            parentmid: 0,
            min_align: -128,
            renegade: false,
        });
        assert.equal(roamer.mtrapseen, -1);
    }
});

test('Valkyrie Sanctum route reaches an ordinary EMIN action turn', async () => {
    const actionSegment = ACTION_RECIPE.segments[0];
    const beforeAction = {
        ...actionSegment,
        moves: actionSegment.moves.replace(/\.+$/u, ''),
    };
    await runSegment(beforeAction);
    const positionsBefore = new Map();
    for (const roamer of alignedRoamers())
        positionsBefore.set(roamer.m_id, [roamer.mx, roamer.my]);

    await runSegment(actionSegment);
    assert.equal(game.urole.name.m, 'Valkyrie');
    assert.equal(game.urace.adj, 'human');
    assert.equal(game.flags.female, true);
    assert.equal(game.u.ualign.type, A_LAWFUL);
    const roamers = alignedRoamers();
    assert.equal(roamers.length, 9);
    assert.ok(roamers.some(roamer => {
        const before = positionsBefore.get(roamer.m_id);
        return before && (before[0] !== roamer.mx || before[1] !== roamer.my);
    }), 'an aligned EMIN must move during the extended production route');
    assert.ok(getRngLog().length > 0);
});


test('priest.c mon_aligntyp selects the source extension and preserves A_NONE', () => {
    // priest.c:280-290 reads EPRI before EMIN before per-species alignment,
    // returns A_NONE unchanged, and sign-normalizes every other alignment.
    assert.equal(mon_aligntyp({
        data: { maligntyp: -3 }, // Negative nonconstant value normalizes to chaotic.
    }), A_CHAOTIC);
    assert.equal(mon_aligntyp({
        data: { maligntyp: 0 }, // Zero species alignment stays neutral.
    }), A_NEUTRAL);
    assert.equal(mon_aligntyp({
        data: { maligntyp: 7 }, // Positive nonconstant value normalizes to lawful.
    }), A_LAWFUL);
    assert.equal(mon_aligntyp({
        data: { maligntyp: A_CHAOTIC },
        isminion: true,
        mextra: { emin: { min_align: 4 } }, // Positive EMIN alignment normalizes.
    }), A_LAWFUL);
    assert.equal(mon_aligntyp({
        data: { maligntyp: A_CHAOTIC },
        ispriest: true,
        isminion: true,
        mextra: {
            epri: { shralign: -9 }, // EPRI takes priority and normalizes.
            emin: { min_align: 4 }, // Conflicting EMIN value must be ignored.
        },
    }), A_CHAOTIC);
    assert.equal(mon_aligntyp({
        data: { maligntyp: A_LAWFUL },
        ispriest: true,
        mextra: { epri: { shralign: A_NONE } },
    }), A_NONE);
});
