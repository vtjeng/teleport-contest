import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BOLT_LIM,
    COLNO,
    HOLE,
    MAGIC_PORTAL,
    MIGR_PORTAL,
    MIGR_RANDOM,
    MON_MIGRATING,
    ROWNO,
    TELEP_TRAP,
    Trap_Moved_Mon,
} from '../js/const.js';
import { migrate_to_level } from '../js/dog.js';
import { newsym } from '../js/display.js';
import { game } from '../js/gstate.js';
import { dist2 } from '../js/hacklib.js';
import { runSegment } from '../js/jsmain.js';
import { m_at, relocate_monster } from '../js/monst.js';
import {
    PM_FIRE_ELEMENTAL,
    PM_JACKAL,
} from '../js/monsters.js';
import { AMULET_OF_YENDOR } from '../js/objects.js';
import {
    accessible,
    onscary,
    set_apparxy,
} from '../js/monmove.js';
import {
    mlevel_tele_trap,
    mtele_trap,
} from '../js/teleport.js';
import {
    preflight_dotrap,
    trapeffect_selector,
} from '../js/trap_effects.js';
import { cansee } from '../js/vision.js';

const FIXED_DESTINATION_SEED = 982431;
const HOLE_MIGRATION_SEED = 982432;
const ARRIVAL_SUFFIX_SEED = 982433;
const TELEPORT_RESTRICTION_SEED = 982434;
// These consecutive seeds reset the same D:1 fixture for independent portal
// branches; the portal tests vary only the source trap, endgame state, or
// monster inventory/species that each C branch reads.
const PORTAL_MIGRATION_SEED = 982435;
const PORTAL_ENDGAME_SEED = 982436;
const PORTAL_AMULET_SEED = 982437;
const PORTAL_ELEMENTAL_SEED = 982438;
const PORTAL_HERO_SEED = 982439;

async function initializedMonster(seed, name) {
    await runSegment({
        // Each seed supplies a complete D:1 state; trap randomness is injected.
        seed,
        // Noon avoids a daylight-saving fold in the recorder timezone.
        datetime: '20260724120000',
        nethackrc: `OPTIONS=name:${name},role:Healer,race:human,`
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        // Dismiss startup at the first command prompt.
        moves: ' ',
    });
    const monster = game.level.monlist;
    assert.ok(monster);
    monster.mleashed = false;
    monster.mtrapseen = 0;
    return monster;
}

function emptySquare(monster, predicate = () => true) {
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            if ((x === game.u.ux && y === game.u.uy)
                || (x === monster.mx && y === monster.my)
                || m_at(x, y, game)
                || !accessible(x, y, game)
                || !predicate(x, y)) {
                continue;
            }
            return { x, y };
        }
    }
    assert.fail('the initialized level must have a matching empty square');
}

function teleportEnv(messages = null) {
    const env = {
        newsym: (x, y) => newsym(x, y),
        onscary: (x, y, monster) => onscary(x, y, monster, game),
        seeTrap: (trap) => {
            trap.tseen = true;
        },
        setApparxy: (monster, env) => set_apparxy(monster, env),
        state: game,
    };
    if (messages) env.message = (message) => messages.push(message);
    return env;
}

function portalEnv(messages, rolls = []) {
    const bounds = [];
    const queue = [...rolls];
    return {
        ...teleportEnv(messages),
        bounds,
        random: {
            rn2: (bound) => {
                bounds.push(bound);
                // Each supplied value is the result for the next source draw;
                // one is the nonzero rn2(7) endgame refusal result.
                return queue.length ? queue.shift() : 1;
            },
        },
        migrateToLevel: migrate_to_level,
        redraw: (x, y) => newsym(x, y),
        unsupported: (reason) => { throw new Error(reason); },
    };
}

function useJackalSpecies(monster) {
    monster.data = game.mons[PM_JACKAL];
    monster.mnum = PM_JACKAL;
    monster.mconf = false;
}

test('mtele_trap relocates to a fixed empty destination', async () => {
    const monster = await initializedMonster(
        FIXED_DESTINATION_SEED,
        'FixedTeleport',
    );
    const old = { x: monster.mx, y: monster.my };
    const destination = emptySquare(
        monster,
        (x, y) => cansee(x, y, game),
    );
    const trap = {
        once: false,
        teledest: destination,
        tseen: false,
        ttyp: TELEP_TRAP,
        tx: old.x,
        ty: old.y,
    };
    const messages = [];

    await mtele_trap(monster, trap, true, {
        ...teleportEnv(messages),
        random: {
            rn2: () => assert.fail(
                'a fixed destination bypasses random relocation',
            ),
        },
    });

    assert.deepEqual(
        [monster.mx, monster.my],
        [destination.x, destination.y],
    );
    assert.equal(game.level.monsters[old.x][old.y], null);
    assert.equal(
        game.level.monsters[destination.x][destination.y],
        monster,
    );
    assert.equal(trap.tseen, true);
    assert.match(messages.at(-1), / seems disoriented\.$/u);
});

test('a newly seen distant arrival has no relative suffix', async () => {
    const monster = await initializedMonster(
        ARRIVAL_SUFFIX_SEED,
        'ArrivalSuffix',
    );
    const unseen = emptySquare(
        monster,
        (x, y) => !cansee(x, y, game),
    );
    relocate_monster(monster, unseen.x, unseen.y, game);
    const destination = emptySquare(
        monster,
        (x, y) => cansee(x, y, game)
            && dist2(x, y, game.u.ux, game.u.uy)
                > BOLT_LIM * BOLT_LIM,
    );
    const trap = {
        once: false,
        teledest: destination,
        tseen: false,
        ttyp: TELEP_TRAP,
        tx: unseen.x,
        ty: unseen.y,
    };
    const messages = [];

    await mtele_trap(monster, trap, false, {
        ...teleportEnv(messages),
        random: {
            rn2: () => assert.fail(
                'a fixed destination bypasses random relocation',
            ),
        },
    });

    assert.deepEqual(
        [monster.mx, monster.my],
        [destination.x, destination.y],
    );
    // teleport.c rloc_to_core() calls Monnam(mtmp) at 1722, after
    // place_monster() and set_apparxy(), rather than reusing a name taken
    // before the move. It matters because do_name.c x_monnam()'s do_it arm
    // reads canspotmon(): this monster stands where the hero cannot see it and
    // lands where the hero can, so a name read before the move is "It" and the
    // name C reads is its own.
    assert.equal(messages.at(-1), 'The kitten appears!');
    assert.doesNotMatch(
        messages.at(-1),
        /(?:closer|farther) away/u,
    );
});

test('teleport restriction precedes future pet and vault branches',
    async () => {
        const monster = await initializedMonster(
            TELEPORT_RESTRICTION_SEED,
            'RestrictedTeleport',
        );
        const old = { x: monster.mx, y: monster.my };
        monster.mleashed = true;
        game.level.flags.noteleport = true;

        await mtele_trap(monster, {
            once: true,
            teledest: emptySquare(monster),
            ttyp: TELEP_TRAP,
        }, true);

        assert.deepEqual([monster.mx, monster.my], [old.x, old.y]);
    });

test('mlevel_tele_trap hands an ordinary hole to dog.c migration',
    async () => {
        const monster = await initializedMonster(
            HOLE_MIGRATION_SEED,
            'HoleMigration',
        );
        const old = { x: monster.mx, y: monster.my };
        const sourceLevel = { ...game.u.uz };
        const destination = {
            dnum: sourceLevel.dnum,
            // An ordinary D:1 hole targets the next main-dungeon level.
            dlevel: sourceLevel.dlevel + 1,
        };
        const trap = {
            dst: destination,
            tseen: false,
            ttyp: HOLE,
            tx: old.x,
            ty: old.y,
        };
        const messages = [];

        const result = await mlevel_tele_trap(
            monster,
            trap,
            false,
            true,
            {
                ...teleportEnv(messages),
                migrateToLevel: migrate_to_level,
            },
        );

        assert.equal(result, 'moved');
        assert.equal(game.gm.migrating_mons, monster);
        assert.equal(monster.mstate & MON_MIGRATING, MON_MIGRATING);
        assert.deepEqual([monster.mx, monster.my], [0, 0]);
        assert.deepEqual([monster.mux, monster.muy], [
            destination.dnum,
            destination.dlevel,
        ]);
        assert.deepEqual(monster.mtrack.slice(0, 3), [
            { x: MIGR_RANDOM, y: 0 },
            old,
            { x: sourceLevel.dnum, y: sourceLevel.dlevel },
        ]);
        assert.equal(game.level.monsters[old.x][old.y], null);
        assert.equal(trap.tseen, true);
        assert.match(messages.at(-1), / falls into a hole\.$/u);
    });

test('the selector sends an ordinary monster through a magic portal',
    async () => {
        const monster = await initializedMonster(
            PORTAL_MIGRATION_SEED,
            'PortalMigration',
        );
        useJackalSpecies(monster);
        const old = { x: monster.mx, y: monster.my };
        const sourceLevel = { ...game.u.uz };
        const destination = {
            dnum: sourceLevel.dnum,
            // The portal destination is the next main-dungeon level in this
            // fixture, which keeps migrate_to_level() on its ordinary path.
            dlevel: sourceLevel.dlevel + 1,
        };
        const trap = {
            dst: destination,
            tseen: false,
            ttyp: MAGIC_PORTAL,
            tx: old.x,
            ty: old.y,
        };
        const messages = [];
        const env = portalEnv(messages);

        const result = await trapeffect_selector(monster, trap, 0, env);

        assert.equal(result, Trap_Moved_Mon);
        assert.deepEqual(env.bounds, [],
                         'ordinary dungeon portals do not roll rn2(7)');
        assert.equal(game.gm.migrating_mons, monster);
        assert.equal(monster.mstate & MON_MIGRATING, MON_MIGRATING);
        assert.deepEqual([monster.mx, monster.my], [0, 0]);
        assert.deepEqual([monster.mux, monster.muy], [
            destination.dnum,
            destination.dlevel,
        ]);
        assert.deepEqual(monster.mtrack[0], { x: MIGR_PORTAL, y: 0 });
        assert.equal(monster.mconf, 1,
                     'a portal confuses monsters without teleport control');
        assert.equal(game.level.monsters[old.x][old.y], null);
        assert.equal(trap.tseen, true);
        assert.deepEqual(messages, [
            'Suddenly, the jackal disappears out of sight.',
        ]);
    });

test('an endgame portal refuses an ordinary monster after rn2(7)',
    async () => {
        const monster = await initializedMonster(
            PORTAL_ENDGAME_SEED,
            'PortalEndgame',
        );
        useJackalSpecies(monster);
        // Matching astral dnum is the C In_endgame() predicate; this
        // constructed state isolates the portal refusal without changing the
        // monster's map coordinates.
        game.u.uz = { ...game.astral_level };
        const trap = {
            dst: { dnum: 0, dlevel: 1 },
            tseen: false,
            ttyp: MAGIC_PORTAL,
            tx: monster.mx,
            ty: monster.my,
        };
        const messages = [];
        const env = portalEnv(messages, [1]);

        const result = await mlevel_tele_trap(monster, trap, false, true, env);

        assert.equal(result, 'finished');
        assert.deepEqual(env.bounds, [7]);
        assert.deepEqual(messages, [
            'The jackal seems to shimmer for a moment.',
        ]);
        assert.equal(trap.tseen, true);
        assert.equal(monster.mconf, false);
        assert.equal(game.gm?.migrating_mons ?? null, null);
    });

test('an endgame amulet short-circuits the portal random gate',
    async () => {
        const monster = await initializedMonster(
            PORTAL_AMULET_SEED,
            'PortalAmulet',
        );
        useJackalSpecies(monster);
        monster.minvent = { otyp: AMULET_OF_YENDOR, nobj: null };
        game.u.uz = { ...game.astral_level };
        const trap = {
            dst: { dnum: 0, dlevel: 1 },
            tseen: false,
            ttyp: MAGIC_PORTAL,
            tx: monster.mx,
            ty: monster.my,
        };
        const messages = [];
        const env = portalEnv(messages, [0]);

        const result = await mlevel_tele_trap(monster, trap, false, true, env);

        assert.equal(result, 'finished');
        assert.deepEqual(env.bounds, [],
                         'mon_has_amulet() short-circuits before rn2(7)');
        assert.deepEqual(messages, [
            'The jackal seems to shimmer for a moment.',
        ]);
        assert.equal(trap.tseen, true);
    });

test('a home elemental is refused silently at an endgame portal',
    async () => {
        const monster = await initializedMonster(
            PORTAL_ELEMENTAL_SEED,
            'PortalElemental',
        );
        monster.data = game.mons[PM_FIRE_ELEMENTAL];
        monster.mnum = PM_FIRE_ELEMENTAL;
        game.u.uz = { ...game.astral_level };
        // The normal dungeon topology keeps the fire plane away from the
        // astral plane. Making the two descriptors equal isolates the C
        // is_home_elemental() short circuit inside the endgame gate.
        game.fire_level = { ...game.astral_level };
        const trap = {
            dst: { dnum: 0, dlevel: 1 },
            tseen: false,
            ttyp: MAGIC_PORTAL,
            tx: monster.mx,
            ty: monster.my,
        };
        const messages = [];
        const env = portalEnv(messages, [0]);

        const result = await mlevel_tele_trap(monster, trap, false, true, env);

        assert.equal(result, 'finished');
        assert.deepEqual(env.bounds, [],
                         'is_home_elemental() short-circuits before rn2(7)');
        assert.deepEqual(messages, [],
                         'C suppresses the shimmer message for elementals');
        // The C gate suppresses both shimmer output and seetrap() for an
        // elemental, even when the caller reports the monster in sight.
        assert.equal(trap.tseen, false);
    });

test('hero magic portals remain behind the existing preflight boundary',
    async () => {
        await initializedMonster(PORTAL_HERO_SEED, 'PortalHero');

        assert.throws(
            () => preflight_dotrap({ ttyp: MAGIC_PORTAL }, game),
            (error) => error.reason === 'trap activation',
        );

        const trap = {
            dst: { dnum: 0, dlevel: 1 },
            tseen: false,
            ttyp: MAGIC_PORTAL,
            tx: game.u.ux,
            ty: game.u.uy,
        };
        await assert.rejects(
            trapeffect_selector(game.youmonst, trap, 0, portalEnv([])),
            /domagicportal\(\)/u,
        );
        assert.equal(trap.tseen, true,
                     'the direct selector preserves C feeltrap() before its boundary');
    });
