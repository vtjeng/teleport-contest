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
    ROOMOFFSET,
    ROWNO,
    THRONE,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { mergable } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { CHEST, GOLD_PIECE, MACE, STATUE } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310417113000';
const LEVELPORT_KEY = '\x16';

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
    if (game._commandDispatchCount !== 3) {
        throw new Error(
            `seed ${segment.seed} dispatched ${game._commandDispatchCount} `
            + 'commands, expected the trailing command to be third',
        );
    }
    if (game.moves !== 3) {
        throw new Error(
            `seed ${segment.seed} ended on move ${game.moves}, expected `
            + 'both waits and the zero-time teleport to end on move 3',
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
