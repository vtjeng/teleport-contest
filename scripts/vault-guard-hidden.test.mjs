import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { M_AP_OBJECT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { findgd } from '../js/vault.js';

// C vault.c invault handles object disguise and hiding before silence or
// interrogation. Blind mimic forms also exercise its invisible-marker path
// during both the turn-planning pass and the actual displayed turn.
for (const kind of ['mimic', 'deaf-mimic', 'hidden']) {
    test(`guard leaves the ${kind} hero without interrogation`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/vault.c/guard-${kind}-hero.session.json`, import.meta.url,
        ), 'utf8'));
        let boundary;
        await runSegment({ ...recipe.segments[0], moves: recipe.segments[0].moves.slice(0, -1) }, {
            onBoundary: error => { boundary = error; },
        });
        assert.equal(boundary, undefined);
        if (kind === 'hidden') assert.equal(game.u.uundetected, 1);
        else assert.equal(game.youmonst.m_ap_type, M_AP_OBJECT);
        assert.equal(findgd(game), null);
        assert.match(game.nhDisplay.toplines, kind === 'hidden'
            ? /Puzzled, she turns around and leaves\./u
            : /Puzzled, it turns around and leaves\./u);
    });
}
