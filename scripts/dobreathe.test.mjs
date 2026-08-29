// Pin polyself.c dobreathe() (1420-1447), the poly'd hero's breath weapon
// command, reached from cmd.c domonability() when can_breathe(youmonst.data)
// is true.
//
// Test 1: the low-energy early return. The development session
// seed0108-wizard-extcmd-wishlist exercises this at step 120: the hero is
// polymorphed into a red dragon with Pw 7 (below the 15 threshold), so
// dobreathe() prints "You don't have enough energy to breathe!" and returns
// ECMD_OK. No RNG calls, no state changes beyond the message.
//
// Test 2: the Strangled guard. dobreathe() checks u.uprops[STRANGLED] first
// and prints "You can't breathe.  Sorry." -- before the energy check --
// returning ECMD_OK. Verified by reading polyself.c:1425-1428.
//
// Test 3: attacktype_fordmg returns the matching attack entry (not just a
// boolean), matching C's struct-pointer-or-NULL return at mondata.c:42-50.
// dobreathe() uses the returned entry's adtyp and damn fields. Verified
// against the red dragon's AT_BREA attack in monst.c.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ECMD_OK, STRANGLED, TIMEOUT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dobreathe } from '../js/polyself.js';
import { attacktype_fordmg, can_breathe } from '../js/mondata.js';
import * as monsters from '../js/monsters.js';

const { AT_BREA, AD_ANY, AD_FIRE, PM_RED_DRAGON } = monsters;

const WITNESS_PATH = new URL(
    '../sessions/seed0108-wizard-extcmd-wishlist.session.json',
    import.meta.url,
);

async function witnessSegment() {
    const recording = JSON.parse(await readFile(WITNESS_PATH, 'utf8'));
    assert.equal(recording.segments.length, 1);
    const [{ steps: _steps, ...segment }] = recording.segments;
    return segment;
}

test('#monster with low energy prints the breath-energy message and spends no turn',
    async () => {
        const segment = await witnessSegment();
        const marker = '#monster\n';
        // The session exercises #monster twice. The first (position 79) is
        // in gnome form and reaches the "purely reflexive" catch-all. The
        // second (position 111) is in red-dragon form and hits dobreathe()'s
        // low-energy guard. Use the second occurrence.
        const firstAt = segment.moves.indexOf(marker);
        const monsterAt = segment.moves.indexOf(marker, firstAt + 1);
        assert.notEqual(monsterAt, -1, 'the witness has a second #monster');

        // Run up to the second #monster to establish the red-dragon polymorph
        // state. The hero's energy is Pw:7(7), below the 15 threshold.
        const before = await runSegment({
            ...segment,
            moves: segment.moves.slice(0, monsterAt),
        });
        // Preconditions: hero is a red dragon with Pw below 15.
        // C status line at step 120 shows Pw:7(7).
        assert.ok(
            can_breathe(game.youmonst.data),
            'the red-dragon form can breathe',
        );
        assert.ok(game.u.uen < 15,
            `hero energy ${game.u.uen} should be below 15`);
        const movesBefore = game.moves;
        const drawsBefore = before.getRngLog().length;

        // Run through #monster\n -- this reaches dobreathe().
        const after = await runSegment({
            ...segment,
            moves: segment.moves.slice(0, monsterAt + marker.length),
        });

        // Step 120 records no RNG calls.
        assert.equal(
            after.getRngLog().length - drawsBefore, 0,
            'low-energy breath costs no RNG draws',
        );
        // ECMD_OK means no time passes.
        assert.equal(game.moves - movesBefore, 0,
            'the rejected breath command spends no game turn');
        // The top line shows the low-energy message.
        const topLine = game.nhDisplay.grid[0]
            .map(({ ch }) => ch).join('').trimEnd();
        assert.equal(topLine,
            "You don't have enough energy to breathe!");
    });

test('dobreathe refuses when Strangled, before checking energy',
    async () => {
        const segment = await witnessSegment();
        const marker = '#monster\n';
        const firstAt = segment.moves.indexOf(marker);
        const monsterAt = segment.moves.indexOf(marker, firstAt + 1);

        // Establish the red-dragon state just before the second #monster.
        await runSegment({
            ...segment,
            moves: segment.moves.slice(0, monsterAt),
        });
        assert.ok(can_breathe(game.youmonst.data));

        // Set the Strangled intrinsic. polyself.c:1425 checks
        // u.uprops[STRANGLED].intrinsic (Strangled macro, youprop.h:110).
        game.u.uprops[STRANGLED].intrinsic |= 1;
        // Give ample energy so the energy guard would pass if reached.
        game.u.uen = 100;

        // Push a space into the display queue for the --More-- that
        // ttyPline may produce.
        game.nhDisplay.pushKey(0x20);
        const result = await dobreathe(game);

        assert.equal(result, ECMD_OK,
            'Strangled breath returns ECMD_OK');
        // Energy is unchanged: the Strangled guard returns before the
        // energy deduction at polyself.c:1433.
        assert.equal(game.u.uen, 100,
            'energy is not deducted when Strangled');
    });

test('attacktype_fordmg returns the attack entry for a red dragon breath',
    () => {
        // Red dragon (PM_RED_DRAGON = 146) has an AT_BREA / AD_FIRE attack
        // in its monst.c definition. attacktype_fordmg returns the struct,
        // not a boolean, so dobreathe() can read adtyp and damn.
        // Build a mons array from monst_globals_init, already imported above.
        const { monst_globals_init } = monsters;
        const catalog = {};
        monst_globals_init(catalog);
        const redDragon = catalog.mons[PM_RED_DRAGON];

        const mattk = attacktype_fordmg(redDragon, AT_BREA, AD_ANY);
        assert.ok(mattk, 'red dragon has a breath attack');
        assert.equal(mattk.aatyp, AT_BREA,
            'the returned entry has AT_BREA attack type');
        assert.equal(mattk.adtyp, AD_FIRE,
            'red dragon breath is AD_FIRE (monst.c red dragon entry)');
        // ATTK(AT_BREA, AD_FIRE, 6, 6) in monst.c red dragon entry.
        assert.equal(mattk.damn, 6,
            'red dragon breath uses 6 damage dice (monst.c)');
        assert.equal(mattk.damd, 6,
            'red dragon breath uses d6 (monst.c)');
    });
