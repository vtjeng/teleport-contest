import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BOLT_LIM,
    COLNO,
    HOLE,
    MIGR_RANDOM,
    MON_MIGRATING,
    ROWNO,
    TELEP_TRAP,
} from '../js/const.js';
import { migrate_to_level } from '../js/dog.js';
import { newsym } from '../js/display.js';
import { game } from '../js/gstate.js';
import { dist2 } from '../js/hacklib.js';
import { runSegment } from '../js/jsmain.js';
import { m_at, relocate_monster } from '../js/monst.js';
import {
    accessible,
    onscary,
    set_apparxy,
} from '../js/monmove.js';
import {
    mlevel_tele_trap,
    mtele_trap,
} from '../js/teleport.js';
import { cansee } from '../js/vision.js';

const FIXED_DESTINATION_SEED = 982431;
const HOLE_MIGRATION_SEED = 982432;
const ARRIVAL_SUFFIX_SEED = 982433;
const TELEPORT_RESTRICTION_SEED = 982434;

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
