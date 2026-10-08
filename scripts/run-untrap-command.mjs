#!/usr/bin/env node
// Independent C-first untrap, artifact, autounlock and mimic caller routes.
// Recipe comments retain the C-only terrain, inventory and More corrections.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {m_at} from '../js/monst.js';
import {t_at} from '../js/trap.js';
import {PM_NEWT} from '../js/monsters.js';
import {ARROW, BEARTRAP, CAN_OF_GREASE, CHEST, LAND_MINE, LARGE_BOX, POT_OIL} from '../js/objects.js';
import {ARROW_TRAP, BEAR_TRAP, D_TRAPPED, ICE, LANDMINE, M_AP_FURNITURE, M_AP_NOTHING, OBJ_BURIED, PIT, SQKY_BOARD, WEB} from '../js/const.js';
import {validateCleanRecipe} from './diff-fresh.mjs';
import {runFreshMatrix, runMatrixCli} from './fresh-matrix.mjs';

export const UNTRAP_CASES = [
    ...['untrap-invoke-no-trap', 'untrap-invoke-cancel', 'untrap-floor-box-invoke',
        'untrap-two-floor-boxes-invoke'].map(name => ['artifact.c', name]),
    ...['untrap-bear-ranger', 'untrap-landmine', 'untrap-owned-landmine-ranger',
        'untrap-arrow', 'untrap-dart', 'untrap-floor-box', 'untrap-squeaky-oil-ranger',
        'untrap-squeaky-grease-ranger', 'untrap-board-adjacent-ordinary',
        'untrap-board-adjacent-punished', 'untrap-trap-conversion-digging',
        'untrap-pit-newt', 'untrap-magic-opening-reward',
        'untrap-magic-opening-reward-extra-wand', 'untrap-melting-ice-bear',
        'untrap-melting-ice-landmine', 'untrap-web-newt-reward',
        'untrap-web-newt-spider-reward'].map(name => ['trap.c', name]),
    ...['untrap-door-mimic', 'open-door-mimic', 'close-door-mimic',
        'untrap-box-autounlock', 'untrap-door-autounlock'].map(name => ['lock.c', name]),
];
const load = (root, owner, name) => JSON.parse(readFileSync(new URL(
    `../${root}/${owner}/${name}.session.json`, import.meta.url), 'utf8'));
function floorObjects(type) {
    const result = [];
    for (let obj = game.level.objlist; obj; obj = obj.nobj)
        if (obj.otyp === type) result.push(obj);
    return result;
}
function inventory(type) {
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.otyp === type) return obj;
    return null;
}
export async function verifyUntrapSegment(input, owner, name) {
    // Recorder DST is replay metadata, not an independently chosen input.
    const recorded = load('recordings', owner, name).segments[0];
    assert.equal(recorded.seed, input.seed);
    assert.equal(recorded.moves, input.moves);
    const segment = {...input, recorderIsDst: recorded.recorderIsDst};
    let rescued, revealed, destination, melted;
    let rewardExpected = true;
    if (name === 'untrap-pit-newt') {
        const command = input.moves.lastIndexOf('#untrap');
        await runSegment({...segment, moves: input.moves.slice(0, command)});
        rescued = m_at(game.u.ux, game.u.uy - 1, game);
        assert.equal(rescued?.data, game.mons[PM_NEWT]);
        assert.ok(rescued.mtrapped, 'the last rescue starts with a trapped newt');
        assert.equal(t_at(rescued.mx, rescued.my, game)?.ttyp, PIT);
        rescued = rescued.m_id;
    } else if (name === 'untrap-web-newt-spider-reward') {
        rewardExpected = false; // C rnl(10)=9 declines pacification here.
        const command = input.moves.indexOf('#untrap');
        await runSegment({...segment, moves: input.moves.slice(0, command)});
        rescued = m_at(game.u.ux, game.u.uy - 1, game);
        assert.equal(rescued?.data, game.mons[PM_NEWT]);
        assert.ok(rescued.mtrapped);
        assert.equal(t_at(rescued.mx, rescued.my, game)?.ttyp, WEB);
        rescued = rescued.m_id;
    } else if (name.startsWith('untrap-magic-opening')) {
        rewardExpected = name.endsWith('extra-wand');
        const command = input.moves.lastIndexOf(rewardExpected ? 'zfk' : 'zek');
        await runSegment({...segment, moves: input.moves.slice(0, command)});
        rescued = m_at(game.u.ux, game.u.uy - 1, game);
        assert.equal(rescued?.data, game.mons[PM_NEWT]);
        assert.ok(rescued.mtrapped);
        assert.equal(t_at(rescued.mx, rescued.my, game)?.ttyp, WEB);
        rescued = rescued.m_id;
    } else if (name.startsWith('untrap-melting-ice')) {
        const command = input.moves.lastIndexOf('zgj');
        await runSegment({...segment, moves: input.moves.slice(0, command)});
        melted = [game.u.ux, game.u.uy + 1]; // Fire is directed south.
        assert.equal(game.level.at(...melted).typ, ICE);
        assert.equal(t_at(...melted, game)?.ttyp,
            name.endsWith('bear') ? BEAR_TRAP : LANDMINE);
    } else if (name.endsWith('door-mimic')) {
        const command = name === 'untrap-door-mimic' ? input.moves.indexOf('#untrap')
            : input.moves.lastIndexOf(name.startsWith('open') ? 'oh' : 'ch');
        await runSegment({...segment, moves: input.moves.slice(0, command)});
        revealed = m_at(game.u.ux - 1, game.u.uy, game);
        assert.equal(revealed?.m_ap_type, M_AP_FURNITURE);
        assert.ok(revealed.msleeping, 'a sleeping door disguise reaches the caller');
        revealed = revealed.m_id;
    } else if (name === 'untrap-board-adjacent-punished') {
        const command = input.moves.indexOf('#untrap');
        await runSegment({...segment, moves: input.moves.slice(0, command)});
        assert.ok(game.uball && game.uchain);
        destination = [game.u.ux + 1, game.u.uy]; // Recipe disarms eastward.
        assert.equal(t_at(...destination, game)?.ttyp, SQKY_BOARD);
    }
    let boundary;
    await runSegment(segment, {onBoundary: error => { boundary = error; }});
    assert.equal(boundary, undefined);
    if (rescued !== undefined) {
        let mon = game.level.monlist;
        while (mon && mon.m_id !== rescued) mon = mon.nmon;
        assert.ok(mon);
        assert.equal(Boolean(mon.mtrapped), false);
        assert.equal(Boolean(mon.mpeaceful), rewardExpected,
            'the C reward chance distinguishes grateful from released-only');
    } else if (revealed !== undefined) {
        let mon = game.level.monlist;
        while (mon && mon.m_id !== revealed) mon = mon.nmon;
        assert.ok(mon);
        assert.equal(mon.m_ap_type, M_AP_NOTHING);
        assert.equal(Boolean(mon.msleeping), false);
    } else if (destination) {
        assert.deepEqual([game.u.ux, game.u.uy], destination);
        assert.deepEqual([game.uball.ox, game.uball.oy], destination);
        assert.deepEqual([game.uchain.ox, game.uchain.oy], destination);
        assert.equal(game.iflags.failing_untrap, 0);
    }
    if (melted) {
        const type = name.endsWith('bear') ? BEARTRAP : LAND_MINE;
        const converted = floorObjects(type).find(obj =>
            obj.ox === melted[0] && obj.oy === melted[1]);
        assert.ok(converted, 'melt_ice unearths the converted trap object');
        assert.notEqual(converted.where, OBJ_BURIED);
        assert.notEqual(t_at(...melted, game)?.ttyp,
            name.endsWith('bear') ? BEAR_TRAP : LANDMINE);
        // Later fire evaporation may create a pit; it cannot retain the old trap.
        assert.equal(game.unported.has('trap.c trap_ice_effects'), false);
    } else if (name === 'untrap-web-newt-reward') {
        assert.ok(game.u.utrap > 0, 'failed web disarming traps the hero');
        const mon = m_at(game.u.ux, game.u.uy - 1, game);
        assert.ok(mon?.mtrapped, 'the original trapped monster remains held');
    } else if (name === 'untrap-bear-ranger') {
        assert.equal(floorObjects(BEARTRAP).length, 1);
        assert.equal(t_at(game.u.ux, game.u.uy, game), null);
    } else if (name === 'untrap-owned-landmine-ranger') {
        assert.equal(floorObjects(LAND_MINE).length, 1);
        assert.equal(t_at(game.u.ux, game.u.uy, game), null);
    } else if (name === 'untrap-arrow') {
        assert.ok(floorObjects(ARROW).some(obj => obj.quan > 0 && obj.quan <= 50));
        assert.notEqual(t_at(game.u.ux, game.u.uy, game)?.ttyp, ARROW_TRAP);
    } else if (name === 'untrap-squeaky-oil-ranger') {
        assert.equal(inventory(POT_OIL), null);
        assert.ok(game.objects[POT_OIL].oc_name_known);
        assert.equal(t_at(game.u.ux, game.u.uy, game), null);
    } else if (name === 'untrap-squeaky-grease-ranger') {
        // One successful repair consumes one of the five independent charges.
        assert.equal(inventory(CAN_OF_GREASE)?.spe, 4);
        assert.equal(t_at(game.u.ux, game.u.uy, game), null);
    } else if (name === 'untrap-two-floor-boxes-invoke') {
        const [chest] = floorObjects(CHEST), [box] = floorObjects(LARGE_BOX);
        assert.ok(chest?.otrapped, 'declining the newest container preserves it');
        assert.equal(Boolean(box?.otrapped), false);
        assert.ok(box.tknown, 'the selected next container was disarmed');
    } else if (name === 'untrap-floor-box-invoke') {
        const [box] = floorObjects(LARGE_BOX);
        assert.equal(Boolean(box?.otrapped), false);
        assert.ok(box.tknown);
    } else if (name === 'untrap-door-autounlock') {
        const door = game.level.at(game.u.ux - 1, game.u.uy);
        assert.equal((door.flags || door.doormask) & D_TRAPPED, 0);
    } else if (name === 'untrap-trap-conversion-digging') {
        assert.equal(game.u.uz.dlevel, 2, 'the downward wand reaches the shaft arrival');
        // Digging unearths the converted bear trap before changing level.
        const old = game._savedLevels['1'].level;
        let converted = old.objlist;
        while (converted && converted.otyp !== BEARTRAP) converted = converted.nobj;
        assert.ok(converted);
        assert.notEqual(converted.where, OBJ_BURIED);
    }
}
export async function runUntrapMatrix() {
    const entries = UNTRAP_CASES.map(([owner, name]) => ({label: name,
        recipe: validateCleanRecipe(load('recipes', owner, name), name)}));
    const byMoves = new Map(UNTRAP_CASES.map(([owner, name]) =>
        [load('recipes', owner, name).segments[0].moves, [owner, name]]));
    return runFreshMatrix({entries, summaryLabel: 'untrap commands', chunkLimit: 1,
        verifySegment: input => verifyUntrapSegment(input, ...byMoves.get(input.moves))});
}
runMatrixCli(import.meta.url, runUntrapMatrix, 'untrap commands');
