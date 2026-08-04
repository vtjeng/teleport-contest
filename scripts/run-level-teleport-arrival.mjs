#!/usr/bin/env node

// Re-record and strictly compare the positive-decimal level-teleport slice.
// Recipes contain replay inputs only; diff-fresh supplies all C and JavaScript
// output in an isolated temporary workspace.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    ACH_SHOP,
    COLNO,
    COURT,
    OBJ_FLOOR,
    OBJ_INVENT,
    OBJ_MINVENT,
    ROOMOFFSET,
    ROWNO,
    THRONE,
    W_ARM,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { mergable } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import {
    PM_AMOROUS_DEMON,
    PM_BARROW_WIGHT,
    PM_FOREST_CENTAUR,
    PM_HOBBIT,
    PM_OGRE_LEADER,
    PM_STALKER,
    PM_TROLL,
    PM_WUMPUS,
} from '../js/monsters.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import {
    ARROW,
    BATTLE_AXE,
    BOW,
    CHEST,
    CLUB,
    CROSSBOW,
    CROSSBOW_BOLT,
    DAGGER,
    ELVEN_DAGGER,
    ELVEN_MITHRIL_COAT,
    GLAIVE,
    GOLD_PIECE,
    KNIFE,
    LONG_SWORD,
    MACE,
    PARTISAN,
    POT_ACID,
    POT_INVISIBILITY,
    POT_SPEED,
    RANSEUR,
    ROCK,
    SLING,
    SPETUM,
    STATUE,
    WAN_FIRE,
} from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310417113000';
const LEVELPORT_KEY = '\x16';
const LEVELCHANGE_DISMISSALS_TO_30 = 29;
const HIGH_LEVEL_ARRIVALS = new Set([
    7650033,
    7650048,
    7650182,
    7650278,
    7650574,
    7650103,
    9449443,
    9449779,
    9449967,
    9450654,
    7650800,
    9461088,
    9461387,
]);

const HOBBIT_ARRIVALS = new Map([
    [7661000, [{ otyp: DAGGER, quan: 1, worn: 0 }]],
    [7661011, [
        { otyp: ROCK, quan: 5, worn: 0 },
        { otyp: SLING, quan: 1, worn: 0 },
    ]],
    [7661130, [{ otyp: ELVEN_DAGGER, quan: 1, worn: 0 }]],
    [7661513, [
        { otyp: ELVEN_MITHRIL_COAT, quan: 1, worn: W_ARM },
        { otyp: ELVEN_DAGGER, quan: 1, worn: 0 },
    ]],
]);

const FOREST_CENTAUR_ARRIVALS = new Map([
    [7650182, []],
    [7650574, [
        { otyp: POT_ACID, quan: 1 },
        { otyp: ARROW, quan: 11 },
        { otyp: BOW, quan: 1 },
    ]],
]);

const OGRE_LEADER_ARRIVALS = new Map([
    [7650033, [
        { otyp: POT_INVISIBILITY, quan: 1, id: 77, worn: 0 },
        { otyp: CLUB, quan: 1, id: 76, worn: 0 },
    ]],
    [7650278, [
        { otyp: WAN_FIRE, quan: 1, id: 105, worn: 0 },
        { otyp: BATTLE_AXE, quan: 1, id: 104, worn: 0 },
    ]],
]);

const TROLL_ARRIVALS = new Map([
    [7650103, []],
    [9450654, [
        { otyp: RANSEUR, quan: 1, id: 70, worn: 0 },
    ]],
    [9449443, [
        { otyp: PARTISAN, quan: 1, id: 76, worn: 0 },
    ]],
    [9449967, [
        { otyp: POT_SPEED, quan: 1, id: 137, worn: 0 },
        { otyp: GLAIVE, quan: 1, id: 135, worn: 0 },
    ]],
    [9449779, [
        { otyp: SPETUM, quan: 1, id: 108, worn: 0 },
    ]],
]);

const BARROW_WIGHT_ARRIVALS = new Map([
    [7650800, [
        { otyp: LONG_SWORD, quan: 1, id: 84, worn: 0 },
        { otyp: KNIFE, quan: 1, id: 82, worn: 0 },
    ]],
]);

const MKLEV_SLEEPER_ARRIVALS = new Map([
    [9461088, PM_AMOROUS_DEMON],
    [9461387, PM_WUMPUS],
]);

function nethackrc({
    character = 'role:Wizard,race:human,gender:male,align:neutral',
    autopickup = false,
    deaf = false,
} = {}) {
    return [
        `OPTIONS=name:Arrival,${character}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:none,!acoustics,${autopickup ? 'autopickup,' : ''}`
            + `${deaf ? 'deaf,' : ''}`
            + 'playmode:debug',
        '',
    ].join('\n');
}

function teleport(seed, destination, {
    config = undefined,
    dismissals = '',
    trailingCommand = '.',
} = {}) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(config),
        // The opening wait paints an ordinary D:1 frame. The closing wait
        // proves the arrival position is live at the next input boundary.
        moves: `.${LEVELPORT_KEY}${destination}\n${dismissals}${trailingCommand}`,
    };
}

function highLevelTeleport(seed, destination) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(),
        // Wizard #levelchange raises from 1 to 30 without spending a turn.
        // Twenty-nine spaces dismiss its complete welcome/intrinsic chain;
        // Ctrl-V then reaches the ordinary destination and the final wait
        // proves the arrived level accepted another command.
        moves: `.#levelchange\n30\n`
            + ' '.repeat(LEVELCHANGE_DISMISSALS_TO_30)
            + `${LEVELPORT_KEY}${destination}\n.`,
    };
}

export function loadLevelTeleportArrivalRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // D:2 also carries this seed's Mines branch, so ordinary arrival
            // remains correct when place_branch() ran during generation.
            teleport(7621004, 2),
            // D:5 exercises the depth-gated ordinary generation branches
            // which the earlier staircase-descent goal never reached.
            teleport(7621001, 5),
            // Independently selected ordinary D:5 layouts naturally create
            // hobbits covering all three source weapon arms. The last also
            // creates an elven mithril coat which the small hobbit wears.
            teleport(7661000, 5),
            teleport(7661011, 5),
            teleport(7661130, 5),
            teleport(7661513, 5),
            // A high-level hero widens rndmonst() enough for this ordinary
            // D:5 to create one stalker through makemon()'s elemental arm.
            highLevelTeleport(7650048, 5),
            // Two more high-level D:5 layouts select exactly one forest
            // centaur. The first takes the no-weapon gate; the second takes
            // the source bow-and-arrow arm.
            highLevelTeleport(7650182, 5),
            highLevelTeleport(7650574, 5),
            // These high-level D:5 layouts each create exactly one ogre
            // leader. The first takes its rn2(6) club arm and later receives
            // a generic invisibility potion; the second takes the battle-axe
            // arm and later receives a generic wand of fire.
            highLevelTeleport(7650033, 5),
            highLevelTeleport(7650278, 5),
            // Five high-level D:5 layouts each create exactly one ordinary
            // troll and collectively cover the outer no-weapon gate plus
            // the source switch's ranseur, partisan, glaive, and spetum arms.
            highLevelTeleport(7650103, 5),
            highLevelTeleport(9450654, 5),
            highLevelTeleport(9449443, 5),
            highLevelTeleport(9449967, 5),
            highLevelTeleport(9449779, 5),
            // This high-level D:5 layout creates exactly one barrow wight.
            // Its unconditional knife-then-long-sword construction leaves
            // the final prepended inventory in long-sword-then-knife order.
            highLevelTeleport(7650800, 5),
            // Fresh high-level D:5 layouts respectively create exactly one
            // ordinary amorous demon and one Wumpus. With no Amulet, each
            // takes makemon()'s nonzero mklev sleeper roll.
            highLevelTeleport(9461088, 5),
            highLevelTeleport(9461387, 5),
            // Independently selected D:5 generation chooses and fills a
            // throne room, while random arrival lands outside it.
            teleport(7640011, 5),
            // A second Court layout lands inside the throne room. The room
            // greeting follows the materialization More prompt; the source's
            // accidental room-index comparison wakes no Court occupant here.
            teleport(7640059, 5, { dismissals: ' ' }),
            // Random arrival lands strictly inside a generated shop. One key
            // dismisses its source greeting before the trailing command.
            teleport(7633019, 5, { dismissals: ' ' }),
            // The same peaceful shop arrival with OPTIONS=deaf takes
            // youprop.h Deaf's roleplay term and prints the visual entry line.
            teleport(7633019, 5, {
                config: { deaf: true },
                dismissals: ' ',
            }),
            // The destination square bears an object and autopickup transfers
            // it into inventory without an intervening prompt.
            teleport(7641005, 2, {
                config: { autopickup: true },
            }),
            // Sight makes the floor scroll mergeable with a carried scroll;
            // comparison and pickup feedback each need a dismissal before a
            // trailing westward move proves ordinary dispatch resumed.
            teleport(7660607, 2, {
                config: { autopickup: true },
                dismissals: '  ',
                trailingCommand: 'h',
            }),
            // Random arrival naturally selects a two-object pile. Both floor
            // indexes evolve twice before the trailing wait command.
            teleport(7660416, 2, {
                config: { autopickup: true },
                dismissals: ' ',
            }),
            // A dwarf lands over a buried object. One key dismisses the exact
            // earth-sense notice before the trailing command.
            teleport(7643705, 2, {
                config: {
                    character: 'role:Valkyrie,race:dwarf,gender:female,align:lawful',
                },
                dismissals: ' ',
            }),
            // The Quest branch entrance is D:14 for this seed. Its four-line
            // first summons consumes four dismissal keys, then the final wait
            // proves that ordinary command dispatch resumed.
            teleport(7645000, 14, { dismissals: '    ' }),
            // Just outside the changing-level boundary: schedule_goto() sets
            // a deferred destination equal to u.uz and deferred_goto() only
            // clears it, generating no replacement level.
            teleport(7621009, 1),
        ],
    }, 'level teleport arrival recipe');
}

export async function verifyLevelTeleportArrival(segment) {
    const destination = Number(
        new RegExp(`${LEVELPORT_KEY}(\\d+)\\n`, 'u')
            .exec(segment.moves)?.[1],
    );
    if (!Number.isInteger(destination)) {
        throw new Error(`seed ${segment.seed} has no numeric destination`);
    }
    let pickupControl = null;
    if ([7641005, 7660607, 7660416].includes(segment.seed)) {
        const control = {
            ...segment,
            moves: segment.moves.slice(0, segment.moves.indexOf('\n') + 1),
            nethackrc: segment.nethackrc.replace(
                ',autopickup,',
                ',!autopickup,',
            ),
        };
        await runSegment(control);
        const objects = [];
        for (let object = game.level.objects[game.u.ux][game.u.uy];
            object;
            object = object.nexthere) {
            objects.push({
                object,
                objectId: object.o_id,
                objectType: object.otyp,
                quantity: object.quan,
            });
        }
        let inventoryCount = 0;
        const carriedObjects = [];
        for (let carried = game.invent; carried; carried = carried.nobj) {
            ++inventoryCount;
            carriedObjects.push(carried);
        }
        if (!objects.length
            || objects.some(({ object }) => object.where !== OBJ_FLOOR)) {
            throw new Error(
                'pickup control did not leave its arrival pile on the floor',
            );
        }
        pickupControl = {
            x: game.u.ux,
            y: game.u.uy,
            objects,
            inventoryCount,
            carriedObjects,
        };
        if (segment.seed === 7641005) {
            const [object] = objects;
            if (objects.length !== 1 || object.objectType !== STATUE
                || object.quantity !== 1 || object.objectId !== 84) {
                throw new Error(
                    'pickup control did not leave statue #84 at arrival',
                );
            }
        } else if (segment.seed === 7660607) {
            const [incoming] = objects;
            const observed = { ...incoming.object, dknown: true };
            const target = carriedObjects.find((carried) => mergable(
                carried,
                observed,
                objectGenerationEnv({ state: game }),
            ));
            if (objects.length !== 1 || !target) {
                throw new Error(
                    'sight-created pickup control has no inventory merge target',
                );
            }
            pickupControl.mergeTarget = {
                objectId: target.o_id,
                quantity: target.quan,
            };
        } else if (objects.length !== 2) {
            throw new Error('multi-object pickup control does not have two items');
        }
    }
    await runSegment(segment);
    if (game.u?.uz?.dnum !== 0 || game.u?.uz?.dlevel !== destination) {
        throw new Error(
            `seed ${segment.seed} ended on `
            + `${game.u?.uz?.dnum}:${game.u?.uz?.dlevel}, expected 0:${destination}`,
        );
    }
    const expectedDispatches = HIGH_LEVEL_ARRIVALS.has(segment.seed) ? 4 : 3;
    if (game._commandDispatchCount !== expectedDispatches) {
        throw new Error(
            `seed ${segment.seed} dispatched ${game._commandDispatchCount} `
            + `commands, expected the trailing command to be ${expectedDispatches}`,
        );
    }
    const expectedMoves = [7650048, 7650800].includes(segment.seed) ? 2 : 3;
    if (game.moves !== expectedMoves) {
        throw new Error(
            `seed ${segment.seed} ended on move ${game.moves}, expected `
            + `its zero-time wizard commands to end on move ${expectedMoves}`,
        );
    }
    if (game.u?.utotype !== 0) {
        throw new Error(`seed ${segment.seed} retained a deferred transition`);
    }
    const hasMore = game.nhDisplay.grid.some(
        (row) => row.map(({ ch }) => ch).join('').includes('--More--'),
    );
    if (hasMore) {
        throw new Error(`seed ${segment.seed} stopped at a --More-- prompt`);
    }
    if (segment.seed === 7640011) {
        const court = game.level.rooms.some(
            (room) => room?.rtype === COURT || room?.orig_rtype === COURT,
        );
        let throne = false;
        for (let x = 0; x < COLNO; ++x) {
            for (let y = 0; y < ROWNO; ++y) {
                if (game.level.at(x, y)?.typ === THRONE) throne = true;
            }
        }
        if (!court || !throne) {
            throw new Error('Court seed did not generate its throne room');
        }
        if (!game.level.flags.has_court) {
            throw new Error('undiscovered Court did not retain has_court');
        }
    }
    const expectedHobbitInventory = HOBBIT_ARRIVALS.get(segment.seed);
    if (expectedHobbitInventory) {
        const hobbits = [];
        for (let monster = game.level.monlist; monster; monster = monster.nmon) {
            if (monster.mnum === PM_HOBBIT) hobbits.push(monster);
        }
        if (hobbits.length !== 1) {
            throw new Error(
                `hobbit seed ${segment.seed} generated ${hobbits.length} hobbits`,
            );
        }
        const [hobbit] = hobbits;
        const inventory = [];
        const objectIds = new Set();
        for (let obj = hobbit.minvent; obj; obj = obj.nobj) {
            if (obj.where !== OBJ_MINVENT || obj.ocarry !== hobbit) {
                throw new Error(
                    `hobbit seed ${segment.seed} lost inventory ownership`,
                );
            }
            if (!Number.isInteger(obj.o_id) || objectIds.has(obj.o_id)) {
                throw new Error(
                    `hobbit seed ${segment.seed} has invalid object identity`,
                );
            }
            objectIds.add(obj.o_id);
            inventory.push({
                otyp: obj.otyp,
                quan: obj.quan,
                worn: obj.owornmask,
            });
        }
        if (hobbit.mgenmklev !== true
            || game.level.monsters[hobbit.mx][hobbit.my] !== hobbit
            || hobbit.misc_worn_check
                !== (segment.seed === 7661513 ? W_ARM : 0)
            || JSON.stringify(inventory)
                !== JSON.stringify(expectedHobbitInventory)) {
            throw new Error(
                `hobbit seed ${segment.seed} lost source inventory or worn state`,
            );
        }
    }
    if (segment.seed === 7650048) {
        const stalkers = [];
        for (let monster = game.level.monlist; monster; monster = monster.nmon) {
            if (monster.mnum === PM_STALKER) stalkers.push(monster);
        }
        if (stalkers.length !== 1) {
            throw new Error(
                `stalker seed generated ${stalkers.length} stalkers`,
            );
        }
        const [stalker] = stalkers;
        if (game.u.ulevel !== 30
            || stalker.mgenmklev !== true
            || game.level.monsters[stalker.mx][stalker.my] !== stalker
            || !stalker.perminvis || !stalker.minvis) {
            throw new Error(
                'stalker seed lost hero level, ownership, or invisibility',
            );
        }
    }
    const expectedCentaurInventory = FOREST_CENTAUR_ARRIVALS.get(segment.seed);
    if (expectedCentaurInventory) {
        const centaurs = [];
        for (let monster = game.level.monlist; monster; monster = monster.nmon) {
            if (monster.mnum === PM_FOREST_CENTAUR) centaurs.push(monster);
        }
        if (centaurs.length !== 1) {
            throw new Error(
                `forest-centaur seed ${segment.seed} generated `
                + `${centaurs.length} forest centaurs`,
            );
        }
        const [centaur] = centaurs;
        const inventory = [];
        const objectIds = new Set();
        for (let obj = centaur.minvent; obj; obj = obj.nobj) {
            if (obj.where !== OBJ_MINVENT || obj.ocarry !== centaur) {
                throw new Error(
                    `forest-centaur seed ${segment.seed} lost inventory ownership`,
                );
            }
            if (!Number.isInteger(obj.o_id) || objectIds.has(obj.o_id)) {
                throw new Error(
                    `forest-centaur seed ${segment.seed} has invalid object identity`,
                );
            }
            objectIds.add(obj.o_id);
            inventory.push({ otyp: obj.otyp, quan: obj.quan });
        }
        const wrongLoadout = inventory.some(
            ({ otyp }) => otyp === CROSSBOW || otyp === CROSSBOW_BOLT,
        );
        if (game.u.ulevel !== 30
            || centaur.mgenmklev !== true
            || game.level.monsters[centaur.mx][centaur.my] !== centaur
            || wrongLoadout
            || JSON.stringify(inventory)
                !== JSON.stringify(expectedCentaurInventory)) {
            throw new Error(
                `forest-centaur seed ${segment.seed} lost source inventory, `
                + `hero level, or ownership: level=${game.u.ulevel}, `
                + `mgenmklev=${centaur.mgenmklev}, `
                + `grid=${game.level.monsters[centaur.mx][centaur.my] === centaur}, `
                + `inventory=${JSON.stringify(inventory)}`,
            );
        }
    }
    const expectedOgreInventory = OGRE_LEADER_ARRIVALS.get(segment.seed);
    if (expectedOgreInventory) {
        const leaders = [];
        for (let monster = game.level.monlist; monster; monster = monster.nmon) {
            if (monster.mnum === PM_OGRE_LEADER) leaders.push(monster);
        }
        if (leaders.length !== 1) {
            throw new Error(
                `ogre-leader seed ${segment.seed} generated `
                + `${leaders.length} ogre leaders`,
            );
        }
        const [leader] = leaders;
        const inventory = [];
        const objectIds = new Set();
        for (let obj = leader.minvent; obj; obj = obj.nobj) {
            if (obj.where !== OBJ_MINVENT || obj.ocarry !== leader) {
                throw new Error(
                    `ogre-leader seed ${segment.seed} lost inventory ownership`,
                );
            }
            if (!Number.isInteger(obj.o_id) || objectIds.has(obj.o_id)) {
                throw new Error(
                    `ogre-leader seed ${segment.seed} has invalid object identity`,
                );
            }
            objectIds.add(obj.o_id);
            inventory.push({
                otyp: obj.otyp,
                quan: obj.quan,
                id: obj.o_id,
                worn: obj.owornmask,
            });
        }
        const selectedWeapons = inventory.filter(
            ({ otyp }) => otyp === BATTLE_AXE || otyp === CLUB,
        );
        const expectedWeapon = expectedOgreInventory.find(
            ({ otyp }) => otyp === BATTLE_AXE || otyp === CLUB,
        );
        if (game.u.ulevel !== 30
            || leader.mgenmklev !== true
            || game.level.monsters[leader.mx][leader.my] !== leader
            || selectedWeapons.length !== 1
            || selectedWeapons[0].otyp !== expectedWeapon?.otyp
            || JSON.stringify(inventory)
                !== JSON.stringify(expectedOgreInventory)) {
            throw new Error(
                `ogre-leader seed ${segment.seed} lost source inventory, `
                + `hero level, or ownership: level=${game.u.ulevel}, `
                + `mgenmklev=${leader.mgenmklev}, `
                + `grid=${game.level.monsters[leader.mx][leader.my] === leader}, `
                + `inventory=${JSON.stringify(inventory)}`,
            );
        }
    }
    const expectedTrollInventory = TROLL_ARRIVALS.get(segment.seed);
    if (expectedTrollInventory) {
        const trolls = [];
        for (let monster = game.level.monlist; monster; monster = monster.nmon) {
            if (monster.mnum === PM_TROLL) trolls.push(monster);
        }
        if (trolls.length !== 1) {
            throw new Error(
                `troll seed ${segment.seed} generated ${trolls.length} trolls`,
            );
        }
        const [troll] = trolls;
        const inventory = [];
        const objectIds = new Set();
        for (let obj = troll.minvent; obj; obj = obj.nobj) {
            if (obj.where !== OBJ_MINVENT || obj.ocarry !== troll) {
                throw new Error(
                    `troll seed ${segment.seed} lost inventory ownership`,
                );
            }
            if (!Number.isInteger(obj.o_id) || objectIds.has(obj.o_id)) {
                throw new Error(
                    `troll seed ${segment.seed} has invalid object identity`,
                );
            }
            objectIds.add(obj.o_id);
            inventory.push({
                otyp: obj.otyp,
                quan: obj.quan,
                id: obj.o_id,
                worn: obj.owornmask,
            });
        }
        const polearms = [RANSEUR, PARTISAN, GLAIVE, SPETUM];
        const selectedWeapons = inventory.filter(
            ({ otyp }) => polearms.includes(otyp),
        );
        const expectedWeapon = expectedTrollInventory.find(
            ({ otyp }) => polearms.includes(otyp),
        );
        if (game.u.ulevel !== 30
            || troll.mgenmklev !== true
            || game.level.monsters[troll.mx][troll.my] !== troll
            || selectedWeapons.length !== Number(Boolean(expectedWeapon))
            || selectedWeapons[0]?.otyp !== expectedWeapon?.otyp
            || JSON.stringify(inventory)
                !== JSON.stringify(expectedTrollInventory)) {
            throw new Error(
                `troll seed ${segment.seed} lost source inventory, hero level, `
                + `or ownership: level=${game.u.ulevel}, `
                + `mgenmklev=${troll.mgenmklev}, `
                + `grid=${game.level.monsters[troll.mx][troll.my] === troll}, `
                + `inventory=${JSON.stringify(inventory)}`,
            );
        }
    }
    const expectedWightInventory = BARROW_WIGHT_ARRIVALS.get(segment.seed);
    if (expectedWightInventory) {
        const wights = [];
        for (let monster = game.level.monlist; monster; monster = monster.nmon) {
            if (monster.mnum === PM_BARROW_WIGHT) wights.push(monster);
        }
        if (wights.length !== 1) {
            throw new Error(
                `barrow-wight seed ${segment.seed} generated `
                + `${wights.length} barrow wights`,
            );
        }
        const [wight] = wights;
        const inventory = [];
        const objectIds = new Set();
        for (let obj = wight.minvent; obj; obj = obj.nobj) {
            if (obj.where !== OBJ_MINVENT || obj.ocarry !== wight) {
                throw new Error(
                    `barrow-wight seed ${segment.seed} lost inventory ownership`,
                );
            }
            if (!Number.isInteger(obj.o_id) || objectIds.has(obj.o_id)) {
                throw new Error(
                    `barrow-wight seed ${segment.seed} has invalid object identity`,
                );
            }
            objectIds.add(obj.o_id);
            inventory.push({
                otyp: obj.otyp,
                quan: obj.quan,
                id: obj.o_id,
                worn: obj.owornmask,
            });
        }
        const selectedWeapons = inventory.filter(
            ({ otyp }) => otyp === KNIFE || otyp === LONG_SWORD,
        );
        if (game.u.ulevel !== 30
            || wight.mgenmklev !== true
            || game.level.monsters[wight.mx][wight.my] !== wight
            || selectedWeapons.length !== 2
            || selectedWeapons[0].otyp !== LONG_SWORD
            || selectedWeapons[1].otyp !== KNIFE
            || selectedWeapons[0].id <= selectedWeapons[1].id
            || JSON.stringify(inventory)
                !== JSON.stringify(expectedWightInventory)) {
            throw new Error(
                `barrow-wight seed ${segment.seed} lost source inventory, `
                + `hero level, or ownership: level=${game.u.ulevel}, `
                + `mgenmklev=${wight.mgenmklev}, `
                + `grid=${game.level.monsters[wight.mx][wight.my] === wight}, `
                + `inventory=${JSON.stringify(inventory)}`,
            );
        }
    }
    const sleeperMndx = MKLEV_SLEEPER_ARRIVALS.get(segment.seed);
    if (sleeperMndx !== undefined) {
        const sleepers = [];
        for (let monster = game.level.monlist; monster; monster = monster.nmon) {
            if (monster.mnum === sleeperMndx) sleepers.push(monster);
        }
        if (sleepers.length !== 1) {
            throw new Error(
                `mklev-sleeper seed ${segment.seed} generated `
                + `${sleepers.length} target monsters`,
            );
        }
        const [sleeper] = sleepers;
        if (game.u.ulevel !== 30
            || game.u.uhave.amulet
            || sleeper.mgenmklev !== true
            || game.level.monsters[sleeper.mx][sleeper.my] !== sleeper
            || sleeper.msleeping !== true) {
            throw new Error(
                `mklev-sleeper seed ${segment.seed} lost source sleep, `
                + `hero level, Amulet state, or ownership: `
                + `level=${game.u.ulevel}, amulet=${game.u.uhave.amulet}, `
                + `mgenmklev=${sleeper.mgenmklev}, `
                + `grid=${game.level.monsters[sleeper.mx][sleeper.my] === sleeper}, `
                + `sleeping=${sleeper.msleeping}`,
            );
        }
    }
    if (segment.seed === 7640059) {
        const roomno = game.level.at(game.u.ux, game.u.uy)?.roomno;
        const room = roomno >= ROOMOFFSET
            ? game.level.rooms[roomno - ROOMOFFSET]
            : null;
        if (!room || room.orig_rtype !== COURT || room.rtype === COURT
            || game.level.flags.has_court) {
            throw new Error('inside-Court seed did not discover its Court');
        }
    }
    if (segment.seed === 7640011 || segment.seed === 7640059) {
        const room = game.level.rooms.find(
            (candidate) => candidate?.orig_rtype === COURT
                || candidate?.rtype === COURT,
        );
        if (!room || room.irregular || room.doorct < 1) {
            throw new Error('Court oracle requires a rectangular room with a door');
        }
        const door = game.level.doors[room.fdoor];
        let throne = null;
        for (let x = room.lx; x <= room.hx; ++x) {
            for (let y = room.ly; y <= room.hy; ++y) {
                const location = game.level.at(x, y);
                const excluded = (x === room.lx && door.x === x - 1)
                    || (x === room.hx && door.x === x + 1)
                    || (y === room.ly && door.y === y - 1)
                    || (y === room.hy && door.y === y + 1);
                if (excluded) continue;
                const monster = m_at(x, y, game);
                if (!monster || !monster.msleeping || monster.mpeaceful) {
                    throw new Error(
                        `Court cell <${x},${y}> lacks a sleeping hostile`,
                    );
                }
                if (location.typ === THRONE) throne = { x, y, monster };
            }
        }
        if (!throne) throw new Error('Court ruler is not on its throne');
        let mace = false;
        for (let obj = throne.monster.minvent; obj; obj = obj.nobj) {
            if (obj.otyp === MACE) mace = true;
        }
        if (!mace) throw new Error('Court ruler lacks its source mace');

        let chest = null;
        for (let obj = game.level.objlist; obj; obj = obj.nobj) {
            if (obj.otyp === CHEST
                && obj.ox >= room.lx && obj.ox <= room.hx
                && obj.oy >= room.ly && obj.oy <= room.hy
                && obj.spe === 2) {
                chest = obj;
                break;
            }
        }
        const gold = chest?.cobj;
        if (!chest || !chest.known || chest.oartifact
            || gold?.otyp !== GOLD_PIECE || !gold.known || gold.oartifact) {
            throw new Error('Court royal coffers lost source initialization');
        }
    }
    if (segment.seed === 7633019
        && !game.u.uachieved.includes(ACH_SHOP)) {
        throw new Error('shop seed did not record shop entry');
    }
    if (segment.seed === 7641005) {
        let inventoryCount = 0;
        let pickedUp = null;
        for (let obj = game.invent; obj; obj = obj.nobj) {
            ++inventoryCount;
            if (obj.o_id === pickupControl?.objects[0].objectId) pickedUp = obj;
        }
        if (!pickupControl
            || game.u.ux !== pickupControl.x || game.u.uy !== pickupControl.y
            || game.level.objects[game.u.ux][game.u.uy] !== null
            || inventoryCount !== pickupControl.inventoryCount + 1
            || pickedUp?.where !== OBJ_INVENT
            || pickedUp.otyp !== pickupControl.objects[0].objectType
            || pickedUp.quan !== pickupControl.objects[0].quantity) {
            throw new Error(
                'autopickup did not transfer its control floor object',
            );
        }
    }
    if (segment.seed === 7660607) {
        const target = (() => {
            for (let obj = game.invent; obj; obj = obj.nobj) {
                if (obj.o_id === pickupControl?.mergeTarget?.objectId)
                    return obj;
            }
            return null;
        })();
        const incomingId = pickupControl?.objects[0].objectId;
        const incomingStillOwned = (() => {
            for (let obj = game.invent; obj; obj = obj.nobj) {
                if (obj.o_id === incomingId) return true;
            }
            return false;
        })();
        if (!target || incomingStillOwned
            || target.quan !== pickupControl.mergeTarget.quantity
                + pickupControl.objects[0].quantity
            || !target.pickup_prev
            || game.level.objects[pickupControl.x][pickupControl.y] !== null) {
            throw new Error('sight-created pickup did not merge atomically');
        }
    }
    if (segment.seed === 7660416) {
        const pickedIds = new Set();
        let inventoryCount = 0;
        for (let obj = game.invent; obj; obj = obj.nobj) {
            ++inventoryCount;
            if (pickupControl?.objects.some(
                ({ objectId }) => objectId === obj.o_id,
            )) pickedIds.add(obj.o_id);
        }
        if (pickedIds.size !== 2
            || inventoryCount !== pickupControl.inventoryCount + 2
            || game.level.objects[pickupControl.x][pickupControl.y] !== null) {
            throw new Error('multi-object arrival pile was not wholly picked up');
        }
    }
    if (segment.seed === 7643705) {
        const buriedUnderfoot = (() => {
            for (let obj = game.level.buriedobjlist; obj; obj = obj.nobj) {
                if (obj.ox === game.u.ux && obj.oy === game.u.uy) return true;
            }
            return false;
        })();
        if (!buriedUnderfoot) {
            throw new Error('earth-sense seed has no buried object underfoot');
        }
    }
    if (segment.seed === 7645000 && !game.u.uevent?.qcalled) {
        throw new Error('Quest-entrance seed did not deliver the first summons');
    }
}

export async function runLevelTeleportArrivalMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'level teleport arrival',
            recipe: loadLevelTeleportArrivalRecipe(),
        }],
        summaryLabel: 'LEVEL TELEPORT ARRIVAL',
        verifySegment: verifyLevelTeleportArrival,
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runLevelTeleportArrivalMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `level teleport arrival: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
