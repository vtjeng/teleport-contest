import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ANTIMAGIC,
    BEAR_TRAP,
    TELEP_TRAP,
    VAULT,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { UnsupportedHeroMoveBoundaryError } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { search_special } from '../js/mkroom.js';
import { PM_KOBOLD } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { deltrap, t_at } from '../js/trap.js';
import { tele_trap } from '../js/teleport.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { preflight_dotrap } from '../js/trap_effects.js';
import { loadHeroTeleportTrapRecipe } from './run-hero-teleport-trap.mjs';

// The keys every segment is allowed to spend: the four orthogonal and four
// diagonal walk-in directions, and the search that spends the settling turns.
const SEGMENT_KEYS = new Set(['h', 'j', 'k', 'l', 'y', 'u', 'b', 'n', 's']);

const MATERIALIZE = 'You materialize in a different location!';

// The nethackrc every matrix segment shares, for the direct calls below. Seed
// 1509's dungeon level one holds a vault and the one-shot teleport trap that
// mklev.c makevtele() hides in a niche beside it; it was found by the same
// port-only scan that chose the matrix seeds.
const VAULT_NICHE_SEGMENT = {
    seed: 1509,
    datetime: loadHeroTeleportTrapRecipe().segments[0].datetime,
    nethackrc: loadHeroTeleportTrapRecipe().segments[0].nethackrc,
    moves: '',
};

function teleportTraps() {
    return game.level.traps.filter((trap) => trap.ttyp === TELEP_TRAP);
}

test('hero-teleport-trap matrix contains only source-selected inputs', () => {
    const recipe = loadHeroTeleportTrapRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 5);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // A pet that steps on the trap reaches the monster arm, which is a
        // separate boundary from the hero arm this matrix covers.
        assert.match(segment.nethackrc, /OPTIONS=pettype:none/u);
        assert.ok(
            [...segment.moves].every((key) => SEGMENT_KEYS.has(key)),
            'every segment walks onto the trap and then searches',
        );
        assert.ok(segment.moves.endsWith('sss'));
    }
    // Both approach geometries: hack.c spends the diagonal and the orthogonal
    // step differently, so neither may be the only one recorded.
    assert.ok(recipe.segments.some(({ moves }) => moves.startsWith('u')));
    assert.ok(recipe.segments.some(({ moves }) => moves.startsWith('k')));
});

test('every matrix segment reaches an unseen random-destination teleport trap',
    async () => {
        for (const [index, segment] of
            loadHeroTeleportTrapRecipe().segments.entries()) {
            await runSegment({ ...segment, moves: '' });
            const traps = teleportTraps();
            assert.ok(traps.length, `segment ${index} generates one`);
            for (const trap of traps) {
                assert.equal(trap.tseen, false,
                    `segment ${index} starts with the trap unseen`);
            }
            const before = { x: game.u.ux, y: game.u.uy };

            const replay = await runSegment(segment);
            assert.equal(
                replay.getScreens().length,
                segment.moves.length + 1,
                `segment ${index} emits one screen per key plus the prompt`,
            );
            // seetrap() marks it, and tele_trap() leaves it in place: only the
            // trap->once arm calls deltrap().
            const sprung = teleportTraps().filter((trap) => trap.tseen);
            assert.equal(sprung.length, 1,
                `segment ${index} springs exactly one teleport trap`);
            // trap->once selects vault_tele() and an isok() trap->teledest
            // selects the fixed-destination arm. The trap each segment walks
            // onto has neither, so every one of them takes tele_trap()'s final
            // tele() arm. A level may hide a one-shot niche trap as well; that
            // one is never the trap the hero reaches here.
            assert.ok(!sprung[0].once, `segment ${index} is not one-shot`);
            assert.deepEqual(
                [sprung[0].teledest.x, sprung[0].teledest.y], [0, 0],
                `segment ${index} has no fixed destination`,
            );
            assert.notDeepEqual(
                [game.u.ux, game.u.uy], [before.x, before.y],
                `segment ${index} moves the hero off her starting square`,
            );
            // safe_teleds() never picks the trap's own square: teleok() is
            // called with trapok FALSE.
            assert.equal(t_at(game.u.ux, game.u.uy), null,
                `segment ${index} lands the hero clear of every trap`);
        }
    });

test('the hero arm announces the teleport with teleds()\'s verbose line',
    async () => {
        // teleport.c:545-547. The matrix asserts screen counts and state
        // fields and never reads a screen's contents, so without this the
        // line survives deletion.
        const [diagonal] = loadHeroTeleportTrapRecipe().segments;
        await runSegment({ ...diagonal, moves: 'u' });
        assert.equal(game._ttyToplines, MATERIALIZE);
    });

test('tele_trap()\'s one-shot arm deletes the trap and lands in the vault',
    async () => {
        // teleport.c:1508-1511, the arm sessions/seed0012-monk-vault-escort
        // reaches: deltrap(), newsym() and vault_tele(). Called directly
        // because the hero cannot walk to this trap without first searching
        // out the secret corridor it sits on, and the same search reveals the
        // trap, which dotrap()'s escape branch then refuses.
        await runSegment(VAULT_NICHE_SEGMENT);
        const trap = teleportTraps().find((each) => each.once);
        assert.ok(trap, 'seed 1509 hides a one-shot teleport trap');
        const vault = search_special(VAULT, game);
        assert.ok(vault, 'seed 1509 generates a vault');
        clearTtyMessageWindow(game);
        game._ttyToplines = '';
        // The vault is full of gold, so the arrival's own pickup line pairs
        // with the materialization line into a More prompt with no segment key
        // left to dismiss it.
        game.nhDisplay.pushKey(0x20); // space

        await tele_trap(trap, game);

        assert.equal(t_at(trap.tx, trap.ty), null, 'deltrap() unlinked it');
        assert.equal(game.level.traps.includes(trap), false);
        // vault_tele() picks its square with somexyspace(), which stays inside
        // the room's own bounds.
        assert.ok(game.u.ux >= vault.lx && game.u.ux <= vault.hx
            && game.u.uy >= vault.ly && game.u.uy <= vault.hy,
        'the hero materializes inside the vault');
        // The vault's gold is under the arrival square, so the last line is
        // the pickup's, not teleds()'s: the materialization line came first,
        // behind the More prompt the space above dismissed. The test that
        // announces the teleport pins that line where nothing follows it.
        assert.match(game._ttyToplines, /^You see here \d+ gold pieces\.$/u);
    });

test('a level that blocks teleportation wrenches instead of moving the hero',
    async () => {
        // teleport.c:1502-1505. noteleport_level() is the reachable third of
        // that condition: In_endgame() needs the endgame dungeon and Antimagic
        // is refused ahead of the move by preflight_dotrap().
        await runSegment(VAULT_NICHE_SEGMENT);
        const trap = teleportTraps().find((each) => each.once);
        const before = { x: game.u.ux, y: game.u.uy };
        game.level.flags.noteleport = true;
        clearTtyMessageWindow(game);
        game._ttyToplines = '';

        await tele_trap(trap, game);

        assert.equal(game._ttyToplines, 'You feel a wrenching sensation.');
        assert.deepEqual([game.u.ux, game.u.uy], [before.x, before.y]);
        // The wrenching arm returns before deltrap(), so the one-shot trap
        // survives for a later attempt.
        assert.equal(t_at(trap.tx, trap.ty), trap);
    });

test('deltrap() unlinks one trap and rejects a trap that is not on the list',
    async () => {
        // trap.c:6529-6548. The list is C's gf.ftrap chain, which maketrap()
        // prepends to; removing the middle link must leave the others in the
        // order they were made.
        await runSegment(VAULT_NICHE_SEGMENT);
        const traps = [...game.level.traps];
        assert.ok(traps.length >= 2, 'seed 1509 generates several traps');
        const victim = traps[Math.floor(traps.length / 2)];

        deltrap(victim, game);

        assert.deepEqual(
            game.level.traps,
            traps.filter((trap) => trap !== victim),
        );
        // C's panic("deltrap: no preceding trap!").
        assert.throws(() => deltrap(victim, game), /no preceding trap/u);
    });

test('search_special() finds the vault among the level\'s rooms', async () => {
    // mkroom.c:764-780.
    await runSegment(VAULT_NICHE_SEGMENT);
    const vault = search_special(VAULT, game);
    assert.equal(vault.rtype, VAULT);
    assert.equal(
        vault,
        game.level.rooms.find((room) => room.rtype === VAULT),
    );
    // A type no room on this level carries.
    assert.equal(search_special(BEAR_TRAP + 1000, game), null);
});

test('preflight_dotrap() admits an unseen teleport trap and names its stops',
    async () => {
        await runSegment(VAULT_NICHE_SEGMENT);
        const trap = teleportTraps().find((each) => each.once);
        trap.tseen = false;
        assert.equal(preflight_dotrap(trap, game), undefined);

        // teleport.c:1503's shieldeff() is a tmp_at() animation, which is not
        // ported; Antimagic is the only property that reaches it.
        game.u.uprops[ANTIMAGIC].intrinsic = 1;
        assert.throws(
            () => preflight_dotrap(trap, game),
            (error) => error instanceof UnsupportedHeroMoveBoundaryError
                && /magic-resistant hero/u.test(error.message),
        );
        game.u.uprops[ANTIMAGIC].intrinsic = 0;

        // teleport.c:1516's rloc_to() moves the monster standing on a fixed
        // destination out of the way, and this port's rloc_to() covers only a
        // monster that is not yet on the map. The trap is made fixed-
        // destination for this case alone: no level generator writes
        // trap->teledest, sp_lev.c does.
        const spot = { x: game.u.ux + 1, y: game.u.uy };
        const kobold = place_monster(
            newMonster({ data: game.mons[PM_KOBOLD], mhp: 4, mcansee: 1 }),
            spot.x, spot.y, game,
        );
        kobold.nmon = game.level.monlist;
        game.level.monlist = kobold;
        trap.once = 0;
        trap.teledest = { ...spot };
        assert.throws(
            () => preflight_dotrap(trap, game),
            (error) => error instanceof UnsupportedHeroMoveBoundaryError
                && /teleport trap destination/u.test(error.message),
        );
    });
