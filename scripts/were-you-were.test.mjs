import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { you_were } from '../js/were.js';
import { potionbreathe } from '../js/potion.js';
import { monst_globals_init, PM_WERERAT } from '../js/monsters.js';
import { POT_WATER } from '../js/objects.js';
import {
    NEUTRAL, PARANOID_WERECHANGE, POLYMORPH_CONTROL, STUNNED,
    UNCHANGING,
} from '../js/const.js';
import { verifySyntheticRanges } from './synthetic-range-evidence.mjs';

const cSource = readFileSync(new URL('../nethack-c/upstream/src/were.c',
    import.meta.url), 'utf8');
let restoreReadKey;

async function initialized() {
    restoreReadKey?.();
    // Independent seed and daylight datetime provide normal initialized state;
    // pettype:none avoids a companion affecting monster_nearby's gate.
    await runSegment({ seed: 681106, datetime: '20261006110000',
        nethackrc: 'OPTIONS=name:WereBranches,role:Wizard,race:human,gender:female,'
            + 'align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none,!autopickup', moves: ' ' });
    game.u.ulycn = PM_WERERAT;
    game.gw.were_changes = 0; // were.c increments once only after both gates.
    // Production input interface supplies decline/accept and More responses.
    const display = game.nhDisplay;
    // A direct confirmation has no preceding unread startup message.
    display.toplin = 0; // wintty.h TOPLINE_EMPTY.
    game._pending_message = '';
    game._ttyToplines = '';
    game._ttyPreviousMessage = '';
    game._ttyMessageStopped = false;
    const readKey = display.readKey;
    restoreReadKey = () => { display.readKey = readKey; };
    display.readKey = async () => ' '.charCodeAt(0);
}

const quiet = { message: async () => {}, redraw: () => {} };

test('you_were keeps the complete C gate and counter order', () => {
    const start = cSource.indexOf('you_were(void)');
    const end = cSource.indexOf('\nvoid\nyou_unwere', start);
    const body = cSource.slice(start, end);
    assert.match(body, /Unchanging \|\| u\.umonnum == u\.ulycn/u);
    assert.match(body, /paranoid_query\(ParanoidWerechange, qbuf\)[\s\S]*?monster_nearby\(\)[\s\S]*?gw\.were_changes\+\+[\s\S]*?polymon\(u\.ulycn\)/u);
    // monst.c's animal-form name is prefixed "were"; C strips four bytes.
    const catalog = {};
    monst_globals_init(catalog);
    assert.equal(catalog.mons[PM_WERERAT].pmnames[NEUTRAL].slice(4), 'rat');
});

test('Unchanging and the current beast form return before any RNG or counter',
    async () => {
        await initialized();
        const random = { rn2: () => { throw new Error('guard drew RNG'); } };
        game.u.uprops[UNCHANGING].intrinsic = 1; // active property gate.
        await you_were(game, { ...quiet, random });
        assert.equal(game.gw.were_changes, 0);
        game.u.uprops[UNCHANGING].intrinsic = 0;
        game.u.umonnum = PM_WERERAT; // second early return in were.c:197.
        await you_were(game, { ...quiet, random });
        assert.equal(game.gw.were_changes, 0);
    });

test('controlled changes decline before polymon and preserve the beast prompt',
    async () => {
        await initialized();
        game.u.uprops[POLYMORPH_CONTROL].intrinsic = 1;
        // Single-key confirmation because PARANOID_WERECHANGE is clear.
        game.flags.paranoia_bits &= ~PARANOID_WERECHANGE;
        game.nhDisplay.readKey = async () => 'n'.charCodeAt(0);
        const originalForm = game.u.umonnum;
        await you_were(game, quiet);
        assert.equal(game.u.umonnum, originalForm);
        assert.equal(game.gw.were_changes, 0);
        assert.match(game.nhDisplay.serialize(), /Do you want to change into a rat\?/u);
    });

test('stunning disables controlled confirmation before the ordinary transformation',
    async () => {
        await initialized();
        game.u.uprops[POLYMORPH_CONTROL].intrinsic = 1;
        game.u.uprops[STUNNED].intrinsic = 1;
        await you_were(game, quiet);
        assert.equal(game.u.umonnum, PM_WERERAT);
        // C polyself.c:set_uasmon resets the increment after applying form
        // properties; source-order check above pins the prior increment.
        assert.equal(game.gw.were_changes, 0);
        assert.equal(game.unported?.has('were.c you_were') ?? false, false);
    });

test('water vapor enters you_were and restores potion in_use after transformation',
    async () => {
        await initialized();
        // Known cursed water skips naming input after the vapor branch.
        game.objects[POT_WATER].oc_name_known = true;
        const obj = { otyp: POT_WATER, cursed: true, blessed: false,
            in_use: false, dknown: true };
        await potionbreathe(obj, game, quiet);
        assert.equal(game.u.umonnum, PM_WERERAT);
        assert.equal(game.gw.were_changes, 0); // set_uasmon consumes it.
        assert.equal(obj.in_use, false);
    });

test('the admitted cursed-water command matches through the transformation boundary',
    async () => {
        restoreReadKey?.();
        const result = await verifySyntheticRanges({ functions: [{ synthetic: [{
            batch: 'v17',
            caseId: 'orc-wizard-tin-lycanthropy-cursed-water-corrected-letters',
            segment: 0, fromStep: 77, throughStep: 77,
            source: 'potion.c:peffect_water -> were.c:you_were',
        }] }] });
        assert.equal(result.length, 1); // one cited segment-0 command boundary.
        assert.equal(game.u.umonnum, PM_WERERAT);
        assert.equal(game.gw.were_changes, 0); // set_uasmon consumes it.
    });
