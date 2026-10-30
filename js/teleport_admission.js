// A deliberately narrow admission proof for teleport.c tele_trap()'s
// occupied fixed destination. This is not a speculative relocation: the
// real enexto() must run exactly once, after settrack(), in tele_trap().
import {
    ANTIMAGIC, BLINDED, COLNO, CONFUSION, DISPLACED, FLYING, HALLUC,
    INVIS, LEVITATION, NON_PM, OROOM, ROOM, ROOMOFFSET, ROWNO,
    STUNNED, TELEP_TRAP, THEMEROOM, Upolyd,
} from './const.js';
import { G_UNIQ, S_EEL, S_MIMIC } from './monsters.js';
import { LEASH } from './objects.js';
import { hides_under, is_hider, is_shapeshifter, nonliving } from './mondata.js';
import { m_at } from './monst.js';
import { t_at } from './trap.js';
import { engr_at } from './engrave.js';
import { cansee } from './vision.js';

export function ordinaryFixedTrapOccupantAllowed(trap, state) {
    const { level, u } = state;
    const x = trap.teledest?.x, y = trap.teledest?.y;
    if (trap.ttyp !== TELEP_TRAP || trap.once || !level || !u
        || !Number.isInteger(x) || !Number.isInteger(y)
        // All three rings shuffled by NEW_ENEXTO are inside the map.
        || x < 4 || x >= COLNO - 3 || y < 3 || y >= ROWNO - 3)
        return false;
    const mon = m_at(x, y, state);
    if (!mon?.data || !(mon.mhp > 0) || mon.mx !== x || mon.my !== y
        || (mon.data.geno & G_UNIQ)
        || mon.wormno || mon.isshk || mon.ispriest || mon.isgd
        || mon.isminion || mon.iswiz || mon.minvent || mon.mtrapped
        || mon.mundetected || mon.m_ap_type || mon.mappearance
        || mon.minvis || mon.mburied || mon.mleashed || mon.cham !== NON_PM
        || mon.msleeping || mon.mfrozen || !mon.mcanmove || !mon.mcansee
        || mon.mblinded || mon.mconf || mon.mstun
        || mon.data.mlet === S_EEL || mon.data.mlet === S_MIMIC
        || nonliving(mon.data) || is_shapeshifter(mon.data)
        || is_hider(mon.data) || hides_under(mon.data))
        return false;
    if (u.ustuck || u.usteed || u.uswallow || u.uinwater || u.utrap
        || state.uball || state.uchain || state.go?.occupation || Upolyd(u)
        || u.ushops?.[0] || u.ushops0?.[0]
        || u.ushops_left?.[0] || u.ushops_entered?.[0])
        return false;
    for (const property of [ANTIMAGIC, INVIS, DISPLACED, BLINDED, HALLUC,
        LEVITATION, FLYING, CONFUSION, STUNNED]) {
        const value = u.uprops?.[property];
        if (value?.intrinsic || value?.extrinsic) return false;
    }
    for (let object = state.invent; object; object = object.nobj)
        if (object.otyp === LEASH) return false;
    if (!Array.isArray(level.regions) || level.regions.length
        || !Array.isArray(level.rooms) || !level.objects
        || level.flags.noteleport || level.flags.is_maze_lev
        || !level.rooms.every(room => room.hx < 0
            || room.rtype === OROOM || room.rtype === THEMEROOM))
        return false;
    // C mkroom.h: THEMEROOM is like OROOM but cannot become a special room.
    const ordinaryFloor = (px, py) => {
        const loc = level.at(px, py);
        const room = level.rooms[(loc?.roomno ?? 0) - ROOMOFFSET];
        return loc?.typ === ROOM && room
            && (room.rtype === OROOM || room.rtype === THEMEROOM);
    };
    for (const [px, py] of [[u.ux, u.uy], [trap.tx, trap.ty]]) {
        if (!ordinaryFloor(px, py)
            || (Math.abs(px - x) <= 1 && Math.abs(py - y) <= 1))
            return false;
    }
    // An empty, visible first ring proves goodpos() succeeds without calling
    // it during admission. Excluding eels also excludes its RNG decision.
    for (let dx = -1; dx <= 1; ++dx) for (let dy = -1; dy <= 1; ++dy) {
        const px = x + dx, py = y + dy;
        if (!ordinaryFloor(px, py) || !cansee(px, py, state)
            || level.objects[px]?.[py] || t_at(px, py, state)
            || engr_at(px, py, state)
            || m_at(px, py, state) !== (dx === 0 && dy === 0 ? mon : null))
            return false;
    }
    return true;
}
