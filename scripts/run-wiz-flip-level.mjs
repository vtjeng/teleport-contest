#!/usr/bin/env node
// C-first wizard flip variants. Seeds 1412801-1412809 were fixed before
// recording; ordinary independent layouts cover each orientation and cancel.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { COLNO, ROWNO, DELPHI } from '../js/const.js';
import { runSegment } from '../js/jsmain.js';
import { get_level_extends } from '../js/mkmaze.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const names = ['vertical', 'horizontal', 'both-floor-object', 'random',
    'cancel', 'random-twice', 'live-monster', 'nonwizard'];

export function runWizardFlipMatrix() {
    return runFreshMatrix({
        entries: [
            ...names.map(name => ({ label: `wizard flip ${name}`,
                recipe: JSON.parse(readFileSync(new URL(
                    `../recipes/wizcmds.c/flip-${name}.session.json`, import.meta.url))) })),
            { label: 'Oracle generation zero flip mask', recipe: JSON.parse(readFileSync(
                new URL('../recipes/sp_lev.c/flip-oracle-generation.session.json', import.meta.url))) },
        ],
        summaryLabel: 'WIZARD FLIP',
        chunkLimit: 1,
        verifySegment: async input => {
            const command = input.moves.indexOf('#wizfliplevel');
            if (command < 0) {
                await runSegment(input);
                const rooms = [...game.level.rooms];
                for (let index = 0; index < rooms.length; index++)
                    rooms.push(...(rooms[index].sbrooms ?? []));
                assert.ok(rooms.some(room => room.rtype === DELPHI),
                    'the independent generation route reaches Oracle, whose Lua sets noflip');
                return;
            }
            await runSegment({ ...input, moves: input.moves.slice(0, command) });
            const before = { x: game.u.ux, y: game.u.uy };
            const bounds = get_level_extends(game);
            await runSegment(input);
            const choice = input.moves.match(/#wizfliplevel\n([123\x1b])/u)?.[1];
            if (!choice) return; // Random masks are pinned by source-order tests.
            const mask = choice === '\x1b' ? 0 : Number(choice);
            // sp_lev.c clamps the flippable area after get_level_extends.
            const minx = Math.max(1, bounds.xmin), maxx = Math.min(COLNO - 1, bounds.xmax);
            const miny = Math.max(0, bounds.ymin), maxy = Math.min(ROWNO - 1, bounds.ymax);
            assert.equal(game.u.ux, mask & 2 ? maxx - before.x + minx : before.x);
            assert.equal(game.u.uy, mask & 1 ? maxy - before.y + miny : before.y);
        },
    });
}

runMatrixCli(import.meta.url, runWizardFlipMatrix, 'wizard level flip');
