import assert from 'node:assert/strict';
import test from 'node:test';

import {
    G_GENOD,
    M_AP_OBJECT,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import {
    angry_guards,
    egg_type_from_parent,
    golemeffects,
    kill_eggs,
    mimic_hit_msg,
    pacify_guards,
    usmellmon,
} from '../js/mon.js';
import {
    AD_COLD,
    AD_ELEC,
    AD_FIRE,
    PM_FLESH_GOLEM,
    PM_GNOME,
    PM_IRON_GOLEM,
    PM_KILLER_BEE,
    PM_MINOTAUR,
    PM_QUEEN_BEE,
    PM_ROTHE,
    PM_SMALL_MIMIC,
    PM_WATCHMAN,
    PM_WINGED_GARGOYLE,
    PM_GARGOYLE,
} from '../js/monsters.js';
import { EGG, SPE_HEALING } from '../js/objects.js';
import { newMonster } from '../js/monst.js';
import { runSegment } from '../js/jsmain.js';

const DATETIME = '20260214031500';
const RC = [
    'OPTIONS=name:Span,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
    '',
].join('\n');

async function hero() {
    await runSegment({
        seed: 7700381,
        datetime: DATETIME,
        nethackrc: RC,
        moves: '',
    });
}

function monster(pmidx, overrides = {}) {
    return newMonster({
        mx: game.u.ux + 1,
        my: game.u.uy,
        mhp: 8,
        mhpmax: 8,
        mcanmove: true,
        mcansee: true,
        data: game.mons[pmidx],
        ...overrides,
    });
}

test('egg_type_from_parent preserves the forced and breeder draws', () => {
    const draws = [];
    const random = { rn2: (bound) => {
        draws.push(bound);
        return 0;
    } };
    assert.equal(
        egg_type_from_parent(PM_QUEEN_BEE, false, { random }),
        PM_QUEEN_BEE,
    );
    assert.deepEqual(draws, [77]);
    assert.equal(
        egg_type_from_parent(PM_QUEEN_BEE, true, {
            random: { rn2: () => { throw new Error('forced egg drew'); } },
        }),
        PM_KILLER_BEE,
    );
    assert.equal(
        egg_type_from_parent(PM_WINGED_GARGOYLE, false, {
            random: { rn2: () => 1 },
        }),
        PM_GARGOYLE,
    );
});

test('kill_eggs records the still-unported hatch timer call', async () => {
    await hero();
    game.svm.mvitals[PM_GNOME].mvflags |= G_GENOD;
    kill_eggs({
        otyp: EGG,
        corpsenm: PM_GNOME,
        cobj: { otyp: EGG, corpsenm: PM_GNOME, nobj: null },
        nobj: null,
    }, { state: game });
    assert.ok(game.unported.has('timeout.c kill_egg'));
});

test('golemeffects heals the matching golem and keeps the speed gap explicit',
    async () => {
        await hero();
        const lines = [];
        const iron = monster(PM_IRON_GOLEM, { mhp: 5, mhpmax: 20 });
        await golemeffects(iron, AD_FIRE, 3, {
            state: game,
            message: async (text) => lines.push(text),
        });
        assert.equal(iron.mhp, 8);
        assert.match(lines[0], /seems healthier\.$/u);

        const flesh = monster(PM_FLESH_GOLEM);
        await golemeffects(flesh, AD_ELEC, 6, { state: game });
        assert.equal(flesh.mhp, 8);
        assert.ok(!game.unported.has('worn.c mon_adjust_speed'));

        await golemeffects(flesh, AD_COLD, 1, { state: game });
        assert.ok(game.unported.has('worn.c mon_adjust_speed'));
    });

test('angry_guards changes visible guards, then pacify_guards restores them',
    async () => {
        await hero();
        const guard = monster(PM_WATCHMAN, {
            mpeaceful: true,
            msleeping: true,
            mfrozen: true,
        });
        game.level.monlist = guard;
        const lines = [];
        assert.equal(await angry_guards(false, {
            state: game,
            message: async (text) => lines.push(text),
        }), true);
        assert.equal(guard.mpeaceful, false);
        assert.equal(guard.msleeping, 0);
        assert.equal(guard.mfrozen, 0);
        assert.deepEqual(lines, [
            'The guard wakes up.',
            'The guard gets angry!',
        ]);
        pacify_guards(game);
        assert.equal(guard.mpeaceful, true);
    });

test('mimic_hit_msg and usmellmon preserve their C messages', async () => {
    await hero();
    const mimic = monster(PM_SMALL_MIMIC, {
        m_ap_type: M_AP_OBJECT,
        mappearance: SPE_HEALING,
    });
    const mimicLines = [];
    await mimic_hit_msg(mimic, SPE_HEALING, {
        state: game,
        message: async (text) => mimicLines.push(text),
    });
    assert.match(mimicLines[0], /seems a more vivid .* than before\.$/u);

    const smellLines = [];
    assert.equal(await usmellmon(game.mons[PM_ROTHE], {
        state: game,
        message: async (text) => smellLines.push(text),
    }), true);
    assert.deepEqual(smellLines, ['You notice a bovine smell.']);
    assert.equal(await usmellmon(game.mons[PM_MINOTAUR], {
        state: game,
        message: async (text) => smellLines.push(text),
    }), true);
    assert.equal(smellLines.at(-1), 'You notice a bovine smell.');
});
