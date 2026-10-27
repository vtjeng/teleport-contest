import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { makemon_runtime } from '../js/makemon_create.js';
import { newcham } from '../js/mon.js';
import { keepdogs, keep_mon_accessible } from '../js/dog.js';
import { m_at } from '../js/monst.js';
import { PM_WIZARD_OF_YENDOR, PM_SEWER_RAT } from '../js/monsters.js';
import { MM_NOMSG, MON_MIGRATING } from '../js/const.js';

// C dog.c:768-785 keeps any mon->iswiz accessible, independent of species;
// mon.c:newcham() preserves that identity flag after changing the form.
for (const transformed of [false, true]) {
    test(`${transformed ? 'target: changed-form' : 'control: original-form'} Wizard migrates when the hero leaves`, async () => {
        await runSegment({ seed: 671903, datetime: '20261018120000',
            nethackrc: 'OPTIONS=name:AccessibleWizard,role:Wizard,race:human,gender:male,align:neutral\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup\n',
            moves: '' });
        const state = game;
        const x = state.u.ux + 4;
        const y = state.u.uy;
        assert.equal(m_at(x, y, state), null);
        const wizard = await makemon_runtime(
            state.mons[PM_WIZARD_OF_YENDOR], x, y, MM_NOMSG, { state },
        );
        assert.ok(wizard?.iswiz);
        if (transformed) {
            assert.equal(await newcham(wizard, state.mons[PM_SEWER_RAT], {
                state, message: async () => {},
            }), true);
            assert.equal(wizard.data, state.mons[PM_SEWER_RAT]);
            assert.equal(wizard.iswiz, true);
        }
        assert.equal(keep_mon_accessible(wizard, state), true);

        await keepdogs(false, { state, newsym: () => {} });

        assert.equal(m_at(x, y, state), null);
        assert.equal(state.gm.migrating_mons, wizard);
        assert.equal(wizard.mstate & MON_MIGRATING, MON_MIGRATING);
        assert.equal(state.unported?.has('dog.c migrate_to_level') ?? false,
            false);
    });
}
