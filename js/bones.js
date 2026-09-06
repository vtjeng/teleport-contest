// Bones-file creation and retrieval.
// C ref: src/bones.c.

import {
    COLNO,
    DEFUNCT_MONSTER,
    EBONES,
    LEAVESTATUE,
    LOST_NONE,
    MAGIC_PORTAL,
    MM_NONAME,
    NON_PM,
    ROWNO,
    has_ebones,
    has_oname,
    isok,
    ismnum,
} from './const.js';
import { christen_monst } from './do_name.js';
import {
    In_hell,
    Is_botlevel,
    Is_branchlev,
    Is_special,
    assign_level,
    depth,
    dunlevs_in_dungeon,
    ledger_no,
    maxledgerno,
} from './dungeon.js';
import { formatkiller } from './topten.js';
import { fruit_from_indx } from './fruit.js';
import { game } from './gstate.js';
import { yyyymmddhhmmss } from './calendar.js';
import {
    obj_extract_self,
    add_to_minv,
    add_to_container,
} from './invent.js';
import { y_n } from './cmd.js';
import { dmonsfree, makemon, mongone } from './makemon_create.js';
import {
    likes_gold, likes_gems, likes_objs, likes_magic, monsndx,
} from './mondata.js';
import { m_at } from './monst.js';
import { GLYPH_UNEXPLORED_OFF } from './glyph_offsets.js';
import { can_carry } from './moncarry.js';
import {
    next_ident,
    obj_attach_mid,
    objectType,
    obj_no_longer_held,
    place_object,
    weight,
} from './obj.js';
import {
    COIN_CLASS,
    CORPSE,
    EGG,
    SLIME_MOLD,
    SPE_NOVEL,
    STATUE,
    TIN,
} from './objects.js';
import {
    PM_GHOST,
    SPECIAL_PM,
} from './monsters.js';
import { propagate } from './makemon.js';
import { rn2 } from './rng.js';
import { vfsWriteFile, vfsReadFile, vfsDeleteFile } from './storage.js';
import { roles, races, genders, aligns } from './roles.js';
import { initrack } from './track.js';
import { ttyPline } from './tty_message.js';

export function no_bones_level(level, state) {
    // gs.save_dlevel is nonzero only while savebones() temporarily evaluates
    // another level. really_done() reaches this function with its zero value.
    const saveLevel = state.gs?.save_dlevel;
    if (saveLevel && ledger_no(saveLevel, state))
        assign_level(level, saveLevel);

    const special = Is_special(level, state);
    const dungeon = state.dungeons[level.dnum];
    return Boolean(
        (special && !special.boneid)
        || !dungeon.boneid
        || Is_botlevel(level, state)
        || (Is_branchlev(level, state) && level.dlevel > 1)
        || (In_hell(level, state)
            && level.dlevel === dunlevs_in_dungeon(level, state) - 1)
    );
}

// C ref: bones.c can_make_bones() (357-385). This function decides only
// whether bones are feasible. really_done() still refuses the positive result
// because creating and saving a bones level is outside the current slice.
export function can_make_bones(state = game, rawEnv = {}) {
    const random = rawEnv.random ?? { rn2 };
    const level = state.u.uz;

    if (!state.flags.bones) return false;
    const ledger = ledger_no(level, state);
    if (ledger <= 0 || ledger > maxledgerno(state)) return false;
    if (no_bones_level(level, state)) return false;
    if (state.u.uswallow) return false;
    if (!Is_branchlev(level, state)) {
        for (const trap of state.level?.traps ?? []) {
            if (trap.ttyp === MAGIC_PORTAL) return false;
        }
    }

    const levelDepth = depth(level, state);
    if (levelDepth <= 0
        || (!random.rn2(1 + (levelDepth >> 2)) && !state.wizard))
        return false;
    if (state.discover) return false;
    return true;
}

// ── Bones file I/O ──
//
// C uses binary level files via open_bonesfile / create_bonesfile /
// commit_bonesfile / delete_bonesfile / compress_bonesfile.
// The JS port stores bones as a JSON snapshot in VFS storage, keyed by a
// level identifier.

function bonesFilePath(uz) {
    // C ref: files.c set_bonesfile_name(). The bonesid encodes dungeon number
    // and level: "D0.3" for main dungeon level 3, etc.
    return `bones_D${uz.dnum}.${uz.dlevel}`;
}

function openBonesFile(uz) {
    const path = bonesFilePath(uz);
    const data = vfsReadFile(path);
    return data != null ? { path, data } : null;
}

export function deleteBonesFile(uz) {
    const path = bonesFilePath(uz);
    return vfsDeleteFile(path);
}

// ── Bones helper functions ──

// C ref: bones.c goodfruit() (41-48). Marks a fruit type as existing by
// restoring its positive fid (savebones negates all fids beforehand).
function goodfruit(id, state) {
    const f = fruit_from_indx(-id, state);
    if (f) f.fid = id;
}

// C ref: bones.c set_ghostly_objlist() (783-790). Sets the ghostly flag on
// every object in a chain so the next hero knows the item came from bones.
function set_ghostly_objlist(objchain) {
    let obj = objchain;
    while (obj) {
        obj.ghostly = 1;
        obj = obj.nobj;
    }
}

// C savelev() stores the level's persistent map fields, not the terminal's
// glyph buffer.  The disp_* fields are the JS owner of that transient buffer;
// retaining them in a bones file would make a later arrival repaint the
// deceased hero's old map before the new level redraws it.
function cloneBonesLocation(location) {
    if (!location) return null;
    const clone = { ...location };
    delete clone.objects;
    for (const key of Object.keys(clone)) {
        if (key.startsWith('disp_')) delete clone[key];
    }
    return clone;
}

// C ref: bones.c resetobjs() (51-193), save path only (restore=false).
// The restore=true path (bones.c:67-100) processes artifact migration,
// gold-to-object conversion, and cancel-worn effects. Lines 702-706 call
// resetobjs with restore=true, but those paths are no-ops here because the
// restore logic is not ported.
// Strips player knowledge and names from objects being saved as bones.
function resetobjs(ochain, restore, state) {
    for (let otmp = ochain; otmp; otmp = otmp.nobj) {
        if (otmp.cobj) resetobjs(otmp.cobj, restore, state);
        // in_use objects: C calls obj_extract_self and dealloc_obj. The port
        // skips extraction (no dealloc equivalent) and leaves them in place.
        // They should not appear in normal play at this point.

        if (!restore) {
            // Saving path: strip player knowledge.
            const type = objectType(otmp, state);
            if (type.oc_uses_known) otmp.known = 0;
            otmp.dknown = otmp.bknown = 0;
            otmp.rknown = 0;
            otmp.lknown = 0;
            otmp.cknown = 0;
            otmp.tknown = 0;
            otmp.invlet = 0;
            otmp.no_charge = 0;
            otmp.how_lost = LOST_NONE;

            // C ref: bones.c:123-128. Strip user-supplied names. Keep
            // artifact, statue, novel, and special-PM corpse names.
            if (has_oname(otmp)
                && !(otmp.oartifact || otmp.otyp === STATUE
                     || otmp.otyp === SPE_NOVEL
                     || (otmp.otyp === CORPSE
                         && ismnum(otmp.corpsenm)
                         && otmp.corpsenm >= SPECIAL_PM))) {
                otmp.oname = null;
                otmp.onamelth = 0;
            }

            if (otmp.otyp === SLIME_MOLD) {
                goodfruit(otmp.spe, state);
            } else if (otmp.otyp === EGG) {
                otmp.spe = 0; // not "laid by you" in next game
            } else if (otmp.otyp === TIN) {
                // make tins of unique monster's meat empty (simplified)
            }
        }
    }
}

// C ref: bones.c give_to_nearby_mon() (225-255). Gives an object to a random
// object-liking monster adjacent to (x,y), skipping the hero's location.
// Falls back to place_object if no suitable monster is found.
function give_to_nearby_mon(otmp, x, y, state) {
    let selected = null;
    let nmon = 0;
    for (let xx = x - 1; xx <= x + 1; xx++) {
        for (let yy = y - 1; yy <= y + 1; yy++) {
            if (!isok(xx, yy)) continue;
            if (xx === state.u.ux && yy === state.u.uy) continue;
            const mtmp = m_at(xx, yy, state);
            if (!mtmp) continue;
            if (!(likes_gold(mtmp.data) || likes_gems(mtmp.data)
                  || likes_objs(mtmp.data) || likes_magic(mtmp.data)))
                continue;
            nmon++;
            if (!rn2(nmon)) selected = mtmp;
        }
    }
    if (selected && can_carry(selected, otmp)) {
        add_to_minv(selected, otmp);
    } else {
        place_object(otmp, x, y);
    }
}

// C ref: bones.c drop_upon_death() (259-303). Drops all hero inventory,
// usually cursing items. If mtmp is non-null, items go to that monster.
// If cont is non-null, items go into that container. Otherwise items are
// placed on the floor or given to nearby monsters.
export function drop_upon_death(mtmp, cont, x, y, state) {
    // C: u.twoweap = FALSE (bypass set_twoweap)
    state.u.twoweap = false;

    while (state.invent) {
        const otmp = state.invent;
        obj_extract_self(otmp);
        // When not turning into a living monster, detach equipment effects
        if (!mtmp) {
            obj_no_longer_held(otmp);
        }
        // C: if ((cont || artifact_light(otmp)) && obj_is_burning(otmp))
        //        end_burn(otmp, TRUE);
        // Simplified: artifact_light items are rare; skipping for this path.
        otmp.owornmask = 0;

        if (otmp.otyp === SLIME_MOLD) goodfruit(otmp.spe, state);

        // C ref: bones.c:290-291 — rn2(5) then curse(otmp).
        // C's curse() (mkobj.c:1783) unconditionally sets blessed=0, cursed=1
        // for non-coins; it does not set heavycurse.
        if (rn2(5)) {
            if (otmp.oclass !== COIN_CLASS) {
                otmp.blessed = false;
                otmp.cursed = true;
            }
        }
        if (mtmp) {
            add_to_minv(mtmp, otmp);
        } else if (cont) {
            add_to_container(cont, otmp);
        } else if (!rn2(8)) {
            give_to_nearby_mon(otmp, x, y, state);
        } else {
            place_object(otmp, x, y);
        }
    }
    if (cont) cont.owt = weight(cont);
}

// C ref: bones.c remove_mon_from_bones() (389-399). Removes certain special
// monsters (wizard, Medusa, quest leaders/nemeses, Vlad, Oracle on wrong
// level) before saving bones.
function remove_mon_from_bones(mtmp, mongone_fn) {
    const mptr = mtmp.data;
    if (mtmp.iswiz || mptr?.msound === 'MS_NEMESIS'
        || mptr?.msound === 'MS_LEADER') {
        mongone_fn(mtmp);
    }
    // Oracle fixup and other special monsters are simplified for now.
}

// C ref: bones.c newebones() (818-829). Creates an ebones structure on a
// monster to record the dead hero's role, race, and other identity.
function newebones(mtmp) {
    if (!mtmp.mextra) mtmp.mextra = {};
    if (!EBONES(mtmp)) {
        mtmp.mextra.ebones = {
            role: 0,
            race: 0,
            oldalign: null,
            deathlevel: 0,
            luck: 0,
            mnum: 0,
            female: 0,
            demigod: 0,
            crowned: 0,
            parentmid: mtmp.m_id,
        };
    }
}

// C ref: bones.c savebones() (403-625). Prepares the current level as a
// bones file: drops hero inventory, creates a ghost, strips player knowledge,
// records cemetery information, and serializes the level to VFS storage.
export async function savebones(how, when, corpse, state) {
    // caller has already checked can_make_bones()

    // C: clear_bypasses() -- bypass flags have no gameplay effect in the port.

    // Check for existing bones file
    const existing = openBonesFile(state.u.uz);
    if (existing) {
        // C ref: bones.c:419-430. The prompt belongs to savebones(), after
        // it opens the current level's bones file. A declined replacement
        // leaves that file available for a later game.
        if (state.wizard) {
            if (await y_n(
                'Bones file already exists.  Replace it?', state,
            ) === 'y'.charCodeAt(0)) {
                if (!deleteBonesFile(state.u.uz)) {
                    await ttyPline('Cannot unlink old bones.', state);
                    return;
                }
            } else {
                return;
            }
            // fall through to make_bones
        } else {
            return;
        }
    }

    // make_bones:
    // C: unleash_all() -- no leash logic to undo in this port's state.

    // C: if (Punished) unpunish();
    // The port has no punishment tracking; skip.

    // C: if (u.usteed) dismount_steed(DISMOUNT_BONES);
    // The port has no mount state in the exercised path; skip.

    // C: iter_mons(remove_mon_from_bones) + dmonsfree()
    // Remove special monsters and discard dead/gone ones.
    for (let mtmp = state.level?.monlist; mtmp; mtmp = mtmp.nmon) {
        if (mtmp.mhp <= 0) continue; // DEADMONSTER
        remove_mon_from_bones(mtmp, (m) => {
            // Simplified mongone: mark as dead for dmonsfree.
            m.mhp = 0;
        });
    }
    // dmonsfree: remove dead monsters from the chain.
    if (state.level) {
        let prev = null;
        let curr = state.level.monlist;
        while (curr) {
            const next = curr.nmon;
            if (curr.mhp <= 0) {
                if (prev) prev.nmon = next;
                else state.level.monlist = next;
                // Clear from monsters grid
                if (state.level.monsters?.[curr.mx]?.[curr.my] === curr) {
                    state.level.monsters[curr.mx][curr.my] = null;
                }
            } else {
                prev = curr;
            }
            curr = next;
        }
    }

    // C: forget_engravings() -- clear erevealed/eread on all engravings.
    for (let ep = state.head_engr; ep; ep = ep.nxt_engr) {
        ep.erevealed = 0;
        ep.eread = 0;
    }

    // Negate all fruit IDs; goodfruit() restores the ones objects reference.
    for (let f = state.ffruit; f; f = f.nextf) {
        f.fid = -f.fid;
    }

    set_ghostly_objlist(state.invent);

    // C ref: bones.c:457-504. Handle ugrave_arise: create the monster the
    // hero becomes, or drop inventory for a ghost.
    let mtmp = null;
    if (ismnum(state.u.ugrave_arise)) {
        // Hero rises as a specific monster -- not exercised in this session.
        // Simplified: fall through to the ghost path.
        drop_upon_death(null, null, state.u.ux, state.u.uy, state);
        state.u.ugrave_arise = NON_PM;
        return;
    } else if (state.u.ugrave_arise === LEAVESTATUE) {
        // Hero becomes a statue -- not exercised.
        drop_upon_death(null, null, state.u.ux, state.u.uy, state);
        return;
    } else {
        // u.ugrave_arise < LEAVESTATUE: drop everything, create a ghost.
        drop_upon_death(null, null, state.u.ux, state.u.uy, state);
        state.in_mklev = true;
        mtmp = makemon(state.mons[PM_GHOST], state.u.ux, state.u.uy, MM_NONAME);
        state.in_mklev = false;
        if (!mtmp) return;
        mtmp = christen_monst(mtmp, state.plname);
        if (corpse) {
            obj_attach_mid(corpse, mtmp.m_id);
        }
    }

    if (mtmp) {
        mtmp.m_lev = state.u.ulevel || 1;
        mtmp.mhp = mtmp.mhpmax = state.u.uhpmax;
        mtmp.female = state.flags.female ? 1 : 0;
        mtmp.msleeping = 1;

        if (!has_ebones(mtmp)) newebones(mtmp);
        if (has_ebones(mtmp)) {
            const eb = EBONES(mtmp);
            // Find role index
            for (let i = 0; i < roles.length; i++) {
                if (state.urole?.name?.m === roles[i].name.m) {
                    eb.role = i;
                    break;
                }
            }
            // Find race index
            for (let i = 0; i < races.length; i++) {
                if (state.urace?.noun === races[i].noun) {
                    eb.race = i;
                    break;
                }
            }
            eb.oldalign = state.u.ualign
                ? { ...state.u.ualign } : null;
            eb.deathlevel = state.u.ulevel;
            eb.luck = state.u.uluck;
            eb.mnum = state.urole?.mnum ?? 0;
            eb.female = state.flags.female ? 1 : 0;
            eb.demigod = state.u.uevent?.udemigod ?? 0;
            eb.crowned = state.u.uevent?.uhand_of_elbereth ?? 0;
        }
    }

    // Process all monsters on the level
    for (let m = state.level?.monlist; m; m = m.nmon) {
        set_ghostly_objlist(m.minvent);
        resetobjs(m.minvent, false, state);
        m.mlstmv = 0;
        if (m.mtame) { m.mtame = 0; m.mpeaceful = 0; }
        m.seen_resistance = 0;
    }

    // Process traps
    for (const ttmp of state.level?.traps ?? []) {
        ttmp.madeby_u = 0;
        // C: ttmp->tseen = unhideable_trap(ttmp->ttyp)
        // unhideable_trap is not ported; leave tseen as-is for now.
    }

    // Process floor objects and buried objects
    set_ghostly_objlist(state.level?.objlist);
    resetobjs(state.level?.objlist, false, state);
    set_ghostly_objlist(state.level?.buriedobjlist);
    resetobjs(state.level?.buriedobjlist, false, state);

    // Hero is no longer on the map
    state.u.ux0 = state.u.ux;
    state.u.uy0 = state.u.uy;
    state.u.ux = 0;
    state.u.uy = 0;

    // Clear all memory from the level
    if (state.level) {
        for (let x = 1; x < COLNO; x++) {
            for (let y = 0; y < ROWNO; y++) {
                const loc = state.level.at(x, y);
                if (loc) {
                    loc.seenv = 0;
                    loc.waslit = 0;
                    loc.glyph = GLYPH_UNEXPLORED_OFF;
                    loc.remembered_glyph = undefined;
                    if (state.lastseentyp?.[x])
                        state.lastseentyp[x][y] = 0;
                }
            }
        }
    }

    // Attach cemetery / bones info to the level
    const newbones = {
        who: `${state.plname}-${state.urole?.filecode ?? '???'}-` +
             `${state.urace?.filecode ?? '???'}-` +
             `${genders[state.flags.female ? 1 : 0]?.filecode ?? '???'}-` +
             `${aligns[1 - (state.u.ualign?.type ?? 0)]?.filecode ?? '???'}`,
        how: formatkiller(how, true, state),
        when: yyyymmddhhmmss(state, when),
        frpx: state.u.ux0,
        frpy: state.u.uy0,
        bonesknown: false,
        next: state.level?.bonesinfo ?? null,
    };
    if (state.level) state.level.bonesinfo = newbones;
    if (state.wizard && state.level) {
        state.level.flags.wizard_bones = 1;
    }

    // Serialize the level to VFS storage as bones.
    // C writes binary data via store_version, Sfo_char, savefruitchn, savelev.
    // The port writes a JSON snapshot.
    const bonesData = serializeBonesLevel(state);
    const path = bonesFilePath(state.u.uz);
    // Strip functions from the serialized output. The cloneObjChain and
    // cloneMon helpers above already break object-graph cycles (ocontainer,
    // ocarry, nmon); shared references (e.g. mons[] data entries) are
    // legitimate duplicates that JSON.stringify handles by value.
    const safeReplacer = (_key, val) => {
        if (typeof val === 'function') return undefined;
        return val;
    };
    vfsWriteFile(path, JSON.stringify(bonesData, safeReplacer));
}

// Serialize the current level state into a JSON-safe object for bones
// storage. Each entity (monster, object) is cloned without circular
// references. C savelev() writes fmon in linked-list order, while floor and
// buried objects come from their linked lists (objlist, buriedobjlist).
// getbones rebuilds all linked lists on restoration.
function serializeBonesLevel(state) {
    const level = state.level;

    // C save_track() writes the populated prefix of the hero's circular
    // tracking ring, along with its insertion point.  The ring is level-local
    // state: restored monsters use it before the hero has taken a new step.
    const track = state.track
        ? {
            utcnt: state.track.utcnt,
            utpnt: state.track.utpnt,
            utrack: state.track.utrack
                .slice(0, state.track.utcnt)
                .map(({ x, y }) => ({ x, y })),
        }
        : null;

    // C savelev() writes gs.stairs separately from the level terrain. Keep
    // the complete linked list because newgame() calls u_on_upstairs() after
    // getbones(), and that lookup reads gs.stairs rather than level.upstair.
    const stairs = [];
    for (let stair = state.stairs; stair; stair = stair.next) {
        stairs.push({
            sx: stair.sx,
            sy: stair.sy,
            up: stair.up,
            isladder: stair.isladder,
            tolev: stair.tolev ? { ...stair.tolev } : null,
            u_traversed: stair.u_traversed,
        });
    }

    // Clone an object chain (nobj-linked), recursing into container contents.
    // Removes back-pointers (ocontainer, ocarry, v) that create cycles.
    function cloneObjChain(obj) {
        const result = [];
        while (obj) {
            const o = { ...obj };
            delete o.ocontainer;
            delete o.ocarry;
            delete o.v;
            // nobj and nexthere are rebuilt during restoration
            o.nobj = null;
            o.nexthere = null;
            if (o.cobj) o.cobj = cloneObjChain(o.cobj);
            else o.cobj = null;
            result.push(o);
            obj = obj.nobj;
        }
        return result;
    }

    // Clone a monster: remove function properties and back-pointers, clone
    // inventory separately to avoid cycles.
    function cloneMon(mtmp) {
        const m = {};
        for (const k of Object.keys(mtmp)) {
            const v = mtmp[k];
            if (typeof v === 'function') continue;
            if (k === 'nmon') { m.nmon = null; continue; }
            if (k === 'minvent') {
                m.minvent = cloneObjChain(v);
                continue;
            }
            m[k] = v;
        }
        return m;
    }

    // Build monsters in fmon order. C save.c:savemonchn() preserves this
    // traversal order in a bones file; scanning the position grid instead
    // would change the order of the next movemon() pass after restoration.
    const monsters = [];
    for (let mon = level.monlist; mon; mon = mon.nmon) {
        if (mon.mhp > 0) monsters.push(cloneMon(mon));
    }

    // Build floor object array from the objlist chain (nobj-linked).
    const floorObjects = cloneObjChain(level.objlist);

    // Buried objects
    const buriedObjects = cloneObjChain(level.buriedobjlist);

    // Clone locations: strip object and monster references (rebuilt from
    // the separate arrays above). Keep the at() function out -- it's rebuilt.
    const locations = [];
    if (level.locations) {
        for (let x = 0; x < COLNO; x++) {
            const col = [];
            for (let y = 0; y < ROWNO; y++) {
                const loc = level.locations[x]?.[y];
                col.push(cloneBonesLocation(loc));
            }
            locations.push(col);
        }
    }

    // Strip functions from traps
    const traps = (level.traps ?? []).map((t) => {
        const tc = { ...t };
        for (const k of Object.keys(tc)) {
            if (typeof tc[k] === 'function') delete tc[k];
        }
        return tc;
    });

    // Clone fruit chain
    let fruitChain = null;
    if (state.ffruit) {
        fruitChain = [];
        for (let f = state.ffruit; f; f = f.nextf) {
            fruitChain.push({ fname: f.fname, fid: f.fid });
        }
    }

    return {
        locations,
        rooms: level.rooms,
        nroom: level.nroom,
        doors: level.doors,
        doorindex: level.doorindex,
        flags: level.flags,
        dnstair: level.dnstair,
        upstair: level.upstair,
        stairs,
        lastseentyp: level.lastseentyp,
        bonesinfo: level.bonesinfo,
        regions: level.regions,
        traps,
        track,
        monsters,
        floorObjects,
        buriedObjects,
        fruitChain,
        moves: state.moves,
    };
}

// C ref: restore.c restmonchn/restobjchn. During ghostly restoration, every
// monster and every object (including container contents and monster inventory)
// receives a fresh identity via next_ident(), which draws rnd(2). The C code
// processes in the order: monsters (with their inventory inline), floor
// objects, buried objects. The total count of calls determines the PRNG
// advancement; since each call draws exactly one rnd(2), the order within a
// chain does not affect the final PRNG state.
function reassignObjIds(ochain, state) {
    for (let otmp = ochain; otmp; otmp = otmp.nobj) {
        otmp.o_id = next_ident({ state });
        if (otmp.cobj) reassignObjIds(otmp.cobj, state);
    }
}

function reassignBonesIds(state) {
    // Monster identities and inline inventories are assigned while
    // restmonchn() rebuilds each monster. These are the remaining object
    // chains in C getlev().
    // Floor objects (C: restobjchn for fobj)
    reassignObjIds(state.level?.objlist, state);
    // Buried objects (C: restobjchn for buriedobjlist)
    reassignObjIds(state.level?.buriedobjlist, state);
}

// C ref: bones.c getbones() (716-730), mongone() leaves dead monsters on the
// fmon chain and dmonsfree() unlinks them. Complete that lifecycle here so
// the restored level's chain and coordinate grid are consistent before the
// arrival code begins iterating monsters.
function purgeDefunctBonesMonsters(state) {
    for (let mtmp = state.level?.monlist; mtmp; mtmp = mtmp.nmon) {
        if (mtmp.mhpmax === DEFUNCT_MONSTER) {
            mongone(mtmp, { state });
        } else {
            // C resets named-artifact bookkeeping only for survivors.
            resetobjs(mtmp.minvent, true, state);
        }
    }
    // C normally performs this at the next lifecycle boundary; doing it at
    // the end of this restore pass preserves the same detached grid while
    // preventing later arrival code from seeing dead chain nodes.
    dmonsfree(state);
}

// C ref: bones.c getbones() (630-756). Reads a bones file from VFS storage,
// restores the level, and deletes the bones file. The caller (mklev.js)
// handles the preliminary eligibility checks (discover, flags.bones, rn2(3),
// no_bones_level) and the wizard-mode "Get bones?" prompt before calling.
export function getbones(state = game) {
    const bonesFile = openBonesFile(state.u.uz);
    if (!bonesFile) return false;

    // C: validate() check. The port does not version-check bones files; a
    // JSON parse failure is the closest equivalent.
    let bonesData;
    try {
        bonesData = JSON.parse(bonesFile.data);
    } catch {
        return false;
    }

    // Restore the level from the bones snapshot.
    restoreBonesLevel(bonesData, state);

    // C ref: restore.c getlev() -- during ghostly (bones) restoration, each
    // monster and object gets a fresh identity via next_ident(). Monster
    // identities and inline inventories were assigned by restmonchn-shaped
    // reconstruction above; this covers the floor and buried chains.
    reassignBonesIds(state);

    // Process defunct monsters and surviving inventories for the restore path.
    purgeDefunctBonesMonsters(state);
    resetobjs(state.level?.objlist, true, state);
    resetobjs(state.level?.buriedobjlist, true, state);

    state.u.uroleplay ??= {};
    state.u.uroleplay.numbones = (state.u.uroleplay.numbones ?? 0) + 1;

    // C ref: bones.c:737 -- numbones++ happens before the Unlink prompt.
    // File deletion is handled by the caller (mklev.js) after the optional
    // wizard-mode "Unlink bones?" prompt.
    return true;
}

// Restore a bones level from a serialized snapshot into the game state.
function restoreBonesLevel(bonesData, state) {
    if (!bonesData?.locations) return;

    // Older bones snapshots may contain the JS terminal buffer. Re-clone the
    // map cells through cloneBonesLocation() so those transient fields never
    // become part of the restored level again.
    const locations = bonesData.locations.map((column) =>
        Array.isArray(column)
            ? column.map(cloneBonesLocation)
            : column,
    );

    // Rebuild the level object from the snapshot.
    const level = {
        locations,
        rooms: bonesData.rooms,
        nroom: bonesData.nroom,
        doors: bonesData.doors,
        doorindex: bonesData.doorindex,
        flags: bonesData.flags ?? {},
        dnstair: bonesData.dnstair,
        upstair: bonesData.upstair,
        lastseentyp: bonesData.lastseentyp,
        bonesinfo: bonesData.bonesinfo,
        regions: bonesData.regions,
        traps: bonesData.traps ?? [],
        at(x, y) {
            if (x < 0 || x >= COLNO || y < 0 || y >= ROWNO) return null;
            return this.locations?.[x]?.[y] || null;
        },
    };

    // Rebuild object chains from flat arrays. Returns the head of a linked
    // list (via nobj). For each object, also links container contents (cobj)
    // into an nobj-chain from the saved array form.
    function rebuildObjChain(items) {
        if (!items || !items.length) return null;
        let head = null;
        let tail = null;
        for (const o of items) {
            // Rebuild container contents from array to nobj-chain
            if (Array.isArray(o.cobj) && o.cobj.length) {
                o.cobj = rebuildObjChain(o.cobj);
            } else {
                o.cobj = null;
            }
            o.nobj = null;
            if (tail) { tail.nobj = o; tail = o; }
            else { head = o; tail = o; }
        }
        return head;
    }

    // Rebuild monsters: place in the grid and build the monlist chain.
    const monsGrid = [];
    for (let x = 0; x < COLNO; x++) monsGrid.push(new Array(ROWNO).fill(null));
    let monHead = null;
    let monTail = null;
    for (const m of bonesData.monsters ?? []) {
        // C restmonchn() assigns a fresh identity, resolves mtmp->data from
        // the serialized species number, and then calls propagate() for the
        // ghostly birth before restoring inline inventory.
        m.m_id = next_ident({ state });
        m.data = state.mons?.[m.mnum] ?? m.data;
        const mndx = m.cham === NON_PM ? monsndx(m.data) : m.cham;
        if (!propagate(mndx, true, true, { state }))
            m.mhpmax = DEFUNCT_MONSTER;
        // Rebuild inventory from array to nobj-chain
        if (Array.isArray(m.minvent) && m.minvent.length) {
            m.minvent = rebuildObjChain(m.minvent);
            reassignObjIds(m.minvent, state);
        } else {
            m.minvent = null;
        }
        m.nmon = null;
        if (isok(m.mx, m.my)) monsGrid[m.mx][m.my] = m;
        if (monTail) { monTail.nmon = m; monTail = m; }
        else { monHead = m; monTail = m; }
    }
    level.monsters = monsGrid;
    level.monlist = monHead;

    // C restore.c:rest_stairs() rebuilds gs.stairs before the caller places
    // the hero. Rebuild the chain separately from level.upstair/dnstair;
    // those coordinates describe terrain, while stairway_find_dir() needs
    // the destination-bearing nodes.
    let stairHead = null;
    let stairTail = null;
    for (const saved of bonesData.stairs ?? []) {
        const stair = {
            sx: saved.sx,
            sy: saved.sy,
            up: saved.up,
            isladder: saved.isladder,
            tolev: saved.tolev ? { ...saved.tolev } : null,
            u_traversed: saved.u_traversed,
            next: null,
        };
        if (stairTail) stairTail.next = stair;
        else stairHead = stair;
        stairTail = stair;
    }
    state.stairs = stairHead;

    // Rebuild floor objects: place in the per-location .objects chains, the
    // per-location grid (level.objects), and the flat objlist chain.
    const objGrid = [];
    for (let x = 0; x < COLNO; x++) objGrid.push(new Array(ROWNO).fill(null));
    const floorObjList = rebuildObjChain(bonesData.floorObjects ?? []);
    // Build per-location piles from the flat list (group by ox,oy)
    for (let otmp = floorObjList; otmp; otmp = otmp.nobj) {
        const x = otmp.ox;
        const y = otmp.oy;
        if (!isok(x, y)) continue;
        // objects grid: head of per-square nobj chain for rendering
        otmp.nexthere = objGrid[x][y];
        objGrid[x][y] = otmp;
        // locations .objects: same per-square chain for level operations
        const loc = level.locations?.[x]?.[y];
        if (loc) {
            otmp.nexthere = loc.objects ?? null;
            loc.objects = otmp;
        }
    }
    level.objects = objGrid;
    level.objlist = floorObjList;

    // Buried objects
    level.buriedobjlist = rebuildObjChain(bonesData.buriedObjects ?? []);

    state.level = level;

    // C restore.c rest_track() restores this after the level's other
    // level-local structures and before ghostly arrival.  initrack() first
    // establishes the full zero-filled ring; rest_track() then overwrites
    // only the saved populated prefix.
    if (bonesData.track) {
        const restoredTrack = initrack(state);
        restoredTrack.utcnt = bonesData.track.utcnt;
        restoredTrack.utpnt = bonesData.track.utpnt;
        for (let i = 0; i < restoredTrack.utcnt; i++) {
            const coordinate = bonesData.track.utrack?.[i];
            if (coordinate) restoredTrack.utrack[i] = {
                x: coordinate.x,
                y: coordinate.y,
            };
        }
    } else {
        initrack(state);
    }

    // Restore fruit chain.
    if (bonesData.fruitChain) {
        let fHead = null;
        let fTail = null;
        for (const fc of bonesData.fruitChain) {
            const f = { fname: fc.fname, fid: fc.fid, nextf: null };
            if (fTail) { fTail.nextf = f; fTail = f; }
            else { fHead = f; fTail = f; }
        }
        state.ffruit = fHead;
    }
}

// C ref: bones.c bones_include_name() (762-780). Checks whether the current
// level's cemetery list contains bones from a particular player. The 'who'
// field has the format "name-Rol-Rac-Gen-Ali"; appending a hyphen to the
// search name prevents partial matches.
export function bones_include_name(name, state) {
    const needle = name + '-';
    for (let bp = state.level?.bonesinfo; bp; bp = bp.next) {
        if (bp.who && bp.who.startsWith(needle))
            return true;
    }
    return false;
}
