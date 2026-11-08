// Bones-file creation and retrieval.
// C ref: src/bones.c.

import { rest_region_capacity } from './region.js';
// resetobjs()'s restoring arm.
import { artifact_exists, exist_artifact } from './artifacts.js';
import { ONAME, OBJ_CONTAINED, OBJ_FLOOR, ONAME_BONES, SHOPBASE } from './const.js';
import { safe_oname } from './do_name.js';
import { get_obj_location } from './light.js';
import { FOOD_CLASS } from './objects.js';
import { is_quest_artifact } from './questpgr.js';
import { in_rooms } from './rooms.js';
import { inside_shop, tended_shop } from './shk.js';
import {
    BR_NO_END1,
    BR_NO_END2,
    BR_PORTAL,
    BR_STAIR,
    COLNO,
    DEFUNCT_MONSTER,
    DELPHI,
    EBONES,
    HOLE,
    LEAVESTATUE,
    Is_oracle_level,
    LOST_NONE,
    MAGIC_PORTAL,
    MAXNROFROOMS,
    MAX_NUM_WORMS,
    MM_NONAME,
    NON_PM,
    NO_MINVENT,
    OBJ_FREE,
    RANGE_LEVEL,
    TIMER_MONSTER,
    TIMER_OBJECT,
    ROOMOFFSET,
    ROWNO,
    RIGHT_HANDED,
    W_WEP,
    has_ebones,
    has_oname,
    ismnum,
} from './const.js';
import { isok } from './cmd_isok.js';
import { christen_monst, free_oname } from './do_name.js';
import { mk_named_object } from './corpstat.js';
import { objectGenerationEnv } from './object_generation.js';
import { newsym } from './display.js';
import { m_dowear } from './worn.js';
import {
    In_hell,
    Is_botlevel,
    Is_branchlev,
    Is_special,
    assign_level,
    depth,
    dunlevs_in_dungeon,
    ledger_no,
    load_exclusions,
    mapseen_room,
    maxledgerno,
    on_level,
    save_exclusions,
} from './dungeon.js';
import { formatkiller } from './topten.js';
import { game } from './gstate.js';
import { yyyymmddhhmmss } from './calendar.js';
import {
    obj_extract_self,
    add_to_minv,
    add_to_container,
} from './invent.js';
import { y_n } from './cmd.js';
import { dmonsfree, makemon, mongets } from './makemon_create.js';
import {
    give_u_to_m_resistances,
    is_unicorn,
    is_undead,
    likes_gold, likes_gems, likes_objs, likes_magic, monsndx,
    unique_corpstat,
} from './mondata.js';
import { m_at } from './monst.js';
import {
    is_Vlad, iter_mons_async, m_carrying, mongone, restore_cham,
} from './mon.js';
import { enexto, rloc_to } from './teleport.js';
import { restpriest } from './priest.js';
import { restshk, set_residency } from './shk.js';
import { GLYPH_UNEXPLORED_OFF } from './glyph_offsets.js';
import { can_carry } from './moncarry.js';
import { the, xname } from './objnam.js';
import { artifact_light } from './artifacts.js';
import { unleash_all } from './apply.js';
import {
    maybe_write_ls, obj_is_burning, relink_light_sources, restore_light_sources,
} from './light.js';
import {
    defineObjAliases,
    next_ident,
    obj_attach_mid,
    objectType,
    obj_no_longer_held,
    place_object,
    weight,
    curse,
    free_omonst,
    is_mines_prize,
    is_soko_prize,
    set_corpsenm,
} from './obj.js';
import { end_burn, restore_timers, timer_is_local } from './timeout.js';
import { block_point } from './vision.js';
import { place_wsegs } from './worm.js';
import { deltrap } from './trap.js';
import { rest_engravings, sanitize_engravings } from './engrave.js';
import { decodeUtf8ByteString, encodeUtf8ByteString } from './hacklib.js';
import {
    ghostfruit, reset_oattached_mids, rest_stairs, rest_traps, restdamage,
} from './restore.js';
import {
    BOW,
    ELVEN_BOW,
    ORCISH_BOW,
    YUMI,
    BOOMERANG,
    CORPSE,
    EGG,
    MUMMY_WRAPPING,
    AMULET_OF_YENDOR,
    BELL,
    BELL_OF_OPENING,
    FAKE_AMULET_OF_YENDOR,
    SCR_MAIL,
    SPE_BLANK_PAPER,
    SPE_BOOK_OF_THE_DEAD,
    SLIME_MOLD,
    SPE_NOVEL,
    STATUE,
    TIN,
    BRASS_LANTERN,
    CANDELABRUM_OF_INVOCATION,
    ICE_BOX,
    OIL_LAMP,
    POT_OIL,
    TALLOW_CANDLE,
    WAX_CANDLE,
} from './objects.js';
import {
    MS_LEADER,
    MS_NEMESIS,
    PM_DOPPELGANGER,
    PM_GHOST,
    PM_MEDUSA,
    PM_ORACLE,
    SPECIAL_PM,
    S_MUMMY,
} from './monsters.js';
import { peace_minded, propagate, set_malign } from './makemon.js';
import { coreRandom, rn2 } from './rng.js';
import { cant_revive, unpunish } from './read.js';
import { fix_shop_damage } from './shk.js';
import { delete_bonesfile, open_bonesfile, write_bonesfile } from './files_bones.js';
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
    const random = rawEnv.random ?? coreRandom;
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
// C reads and writes binary level files through files.c open_bonesfile(),
// create_bonesfile(), commit_bonesfile() and delete_bonesfile(). The port
// keeps a JSON snapshot under the name files.js set_bonesfile_name() gives.

// ── Bones helper functions ──

// C ref: bones.c goodfruit() (41-48). Marks a fruit type as existing by
// restoring its positive fid (savebones negates all fids beforehand). The
// lookup is objnam.c fruit_from_indx()'s plain walk of gf.ffruit: js/fruit.js
// fruit_from_indx() rejects a chain holding the negated fids as invalid.
function goodfruit(id, state) {
    for (let f = state.gf?.ffruit ?? null; f; f = f.nextf) {
        if (f.fid === -id) {
            f.fid = id;
            return;
        }
    }
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

// C ref: bones.c fix_ghostly_obj() (795-816). A bones weapon can be marked
// even when it is otherwise an ordinary inventory object. Adjust asymmetric
// weapons for this hero, then clear the marker from every picked-up object.
export async function fix_ghostly_obj(obj, state = game) {
    if (!obj.ghostly) return;

    switch (obj.otyp) {
    case BOW:
    case ELVEN_BOW:
    case ORCISH_BOW:
    case YUMI:
    case BOOMERANG:
        await ttyPline(
            `You make adjustments to ${the(xname(obj, state), state)} `
                + `to suit your ${state.u.uhandedness === RIGHT_HANDED
                    ? 'right' : 'left'} hand.`,
            state,
        );
        break;
    default:
        break;
    }

    obj.ghostly = 0;
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

// C ref: mkroom.c save_room()/save_rooms() (844-871) and
// rest_room()/rest_rooms() (875-903). C writes each mkroom struct whole,
// resident pointer included, and rest_room() and rest_rooms() set every
// room's and subroom's resident to Null while reading it back; getlev() then
// lets each shopkeeper reclaim its room through set_residency() (restore.c
// 1182-1183). The JSON snapshot cannot carry the pointer, so the clone drops
// it on the way out instead.
function cloneBonesRooms(rooms) {
    if (!Array.isArray(rooms)) return rooms;
    return rooms.map((room) => (room ? {
        ...room,
        resident: null,
        sbrooms: cloneBonesRooms(room.sbrooms),
    } : room));
}

// C ref: bones.c resetobjs() (51-193). Saving (restore=false) strips the
// dead hero's knowledge and names from the objects. Restoring (bones.c
// 65-100) does the artifact bookkeeping for the new game and marks partly
// eaten food in a tended shop as not for sale.
function resetobjs(ochain, restore, state) {
    for (let otmp = ochain; otmp; otmp = otmp.nobj) {
        if (otmp.cobj) resetobjs(otmp.cobj, restore, state);
        // in_use objects: C calls obj_extract_self and dealloc_obj. The port
        // skips extraction (no dealloc equivalent) and leaves them in place.
        // They should not appear in normal play at this point.

        if (restore) {
            // artifact bookkeeping needs to be done during restore; other
            // fixups are done while saving
            if (otmp.oartifact) {
                if (exist_artifact(otmp.otyp, safe_oname(otmp), state)
                    || is_quest_artifact(otmp, state)) {
                    // prevent duplicate--revert to ordinary obj
                    otmp.oartifact = 0;
                    if (has_oname(otmp)) free_oname(otmp);
                } else {
                    artifact_exists(otmp, safe_oname(otmp), true,
                        ONAME_BONES, state);
                }
            } else if (has_oname(otmp)) {
                otmp.oextra.oname = sanitize_name(ONAME(otmp), state);
            }
            // 3.6.3: set no_charge for partly eaten food in shop; all other
            // items become goods for sale if in a shop
            if (otmp.oclass === FOOD_CLASS && otmp.oeaten) {
                let top = otmp;
                while (top.where === OBJ_CONTAINED) top = top.ocontainer;
                const where = top.where === OBJ_FLOOR
                    ? get_obj_location(top, 0, state) : null;
                // in_rooms() gives C's string of room numbers as an array;
                // its first element is C's *p. Can't use costly_spot()
                // since its result depends upon the hero's location.
                const rooms = where && inside_shop(where.x, where.y, state)
                    ? in_rooms(where.x, where.y, SHOPBASE, state) : [];
                otmp.no_charge = rooms[0]
                    && tended_shop(mapseen_room(rooms[0] - ROOMOFFSET, state),
                        state) ? 1 : 0;
            }
        }

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
                free_oname(otmp);
            }

            if (otmp.otyp === SLIME_MOLD) {
                goodfruit(otmp.spe, state);
            } else if (otmp.otyp === SCR_MAIL) {
                // bones.c:131-135 (MAIL_STRUCTURES). 0: delivered in-game
                // by an external event; 1: from bones or wishing; 2:
                // written with a marker.
                if (otmp.spe === 0)
                    otmp.spe = 1;
            } else if (otmp.otyp === EGG) {
                otmp.spe = 0; // not "laid by you" in next game
            } else if (otmp.otyp === TIN) {
                // Tins of a unique monster's meat become empty.
                if (ismnum(otmp.corpsenm)
                    && unique_corpstat(state.mons[otmp.corpsenm]))
                    otmp.corpsenm = NON_PM;
            } else if (otmp.otyp === CORPSE || otmp.otyp === STATUE) {
                // bones.c:147-165. Discard the incarnation details of
                // uniques, shopkeepers (revival false), temple priests and
                // vault guards so that the corpse or statue cannot revive
                // them; a unique's corpse turns into a doppelganger's now.
                if (otmp.oextra?.omonst) {
                    const revived = cant_revive(
                        otmp.corpsenm, false, null, state,
                    );
                    if (revived.changed) {
                        free_omonst(otmp);
                        if (revived.mtype === PM_DOPPELGANGER
                            && otmp.otyp === CORPSE)
                            set_corpsenm(otmp, revived.mtype, { state });
                    }
                }
            } else if (is_mines_prize(otmp, state)
                       || is_soko_prize(otmp, state)) {
                // Achievement tracking, in case the prize left its own
                // (always no-bones) level.
                otmp.nomerge = 0;
            } else if (otmp.otyp === AMULET_OF_YENDOR) {
                // C ref: bones.c:170-174. A bones level never keeps the
                // unique real Amulet; the replacement is cursed.
                otmp.otyp = FAKE_AMULET_OF_YENDOR;
                curse(otmp, { state });
            } else if (otmp.otyp === CANDELABRUM_OF_INVOCATION) {
                // bones.c:175-184. The Candelabrum becomes its candles,
                // assumed used.
                if (otmp.lamplit)
                    end_burn(otmp, true, { state });
                otmp.otyp = WAX_CANDLE;
                otmp.age = 50;
                if (otmp.spe > 0)
                    otmp.quan = otmp.spe;
                otmp.spe = 0;
                otmp.owt = weight(otmp, { state });
                curse(otmp, { state });
            } else if (otmp.otyp === BELL_OF_OPENING) {
                otmp.otyp = BELL;
                curse(otmp, { state });
            } else if (otmp.otyp === SPE_BOOK_OF_THE_DEAD) {
                otmp.otyp = SPE_BLANK_PAPER;
                curse(otmp, { state });
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
    if (selected && can_carry(selected, otmp, { state })) {
        add_to_minv(selected, otmp, bonesObjectEnv(state));
    } else {
        place_object(otmp, x, y, { state });
    }
}

// Object hooks for the possessions savebones() moves. mkobj.c
// add_to_container() calls obj_no_longer_held() again for a container outside
// any inventory, such as the hero's statue.
function bonesObjectEnv(state) {
    return objectGenerationEnv({ state });
}

// C ref: bones.c drop_upon_death() (259-303). Drops all hero inventory,
// usually cursing items. If mtmp is non-null, items go to that monster.
// If cont is non-null, items go into that container. Otherwise items are
// placed on the floor or given to nearby monsters.
export async function drop_upon_death(mtmp, cont, x, y, state) {
    // C: u.twoweap = FALSE (bypass set_twoweap)
    state.u.twoweap = false;

    while (state.invent) {
        const otmp = state.invent;
        obj_extract_self(otmp, { state });
        // When not turning into a living monster, detach equipment effects
        if (!mtmp || is_undead(mtmp.data))
            await obj_no_longer_held(otmp, { state });
        // C: if ((cont || artifact_light(otmp)) && obj_is_burning(otmp))
        //        end_burn(otmp, TRUE);
        if ((cont || artifact_light(otmp)) && obj_is_burning(otmp))
            await end_burn(otmp, true, { state });
        otmp.owornmask = 0;

        if (otmp.otyp === SLIME_MOLD) goodfruit(otmp.spe, state);

        // C ref: bones.c:290-291 — rn2(5) then curse(otmp).
        // C's curse() (mkobj.c:1783) unconditionally sets blessed=0, cursed=1
        // for non-coins; it does not set heavycurse.
        if (rn2(5)) await curse(otmp, { state });
        if (mtmp) {
            add_to_minv(mtmp, otmp, bonesObjectEnv(state));
        } else if (cont) {
            await add_to_container(cont, otmp, bonesObjectEnv(state));
        } else if (!rn2(8)) {
            give_to_nearby_mon(otmp, x, y, state);
        } else {
            place_object(otmp, x, y, { state });
        }
    }
    if (cont) cont.owt = weight(cont, bonesObjectEnv(state));
}

// C ref: bones.c fixuporacle() (305-352). Answers false when the Oracle is
// off her own level and should be removed; otherwise she is made peaceful and,
// if she has left her chamber, moved back and the chamber's type restored.
function fixuporacle(oracle, state) {
    if (!Is_oracle_level(state.u.uz, state))
        return false;

    oracle.mpeaceful = 1;
    const roomAt = (x, y) => state.level.at(x, y).roomno - ROOMOFFSET;
    let o_ridx = roomAt(oracle.mx, oracle.my);
    if (o_ridx >= 0 && mapseen_room(o_ridx, state)?.rtype === DELPHI)
        return true;

    // C scans every slot of svr.rooms[], which holds the subrooms after the
    // MAXNROFROOMS + 1 top-level slots.
    const nslots = (MAXNROFROOMS + 1) * 2;
    let ridx;
    for (ridx = 0; ridx < nslots; ++ridx)
        if (mapseen_room(ridx, state)?.orig_rtype === DELPHI)
            break;

    if (o_ridx !== ridx && ridx < nslots) {
        const room = mapseen_room(ridx, state);
        const cx = Math.trunc((room.lx + room.hx) / 2);
        const cy = Math.trunc((room.ly + room.hy) / 2);
        const cc = enexto(cx, cy, oracle.data, { state });
        if (cc) {
            rloc_to(oracle, cc.x, cc.y, { state });
            o_ridx = roomAt(oracle.mx, oracle.my);
        }
    }
    if (ridx === o_ridx)
        mapseen_room(ridx, state).rtype = DELPHI;
    return true;
}

// C ref: bones.c remove_mon_from_bones() (387-399). Sends unique and
// role-specific monsters away before the level is saved as bones; mongone()
// drops the Amulet, invocation tools and the hero's quest artifact first.
async function remove_mon_from_bones(mtmp, state) {
    const mptr = mtmp.data;
    if (mtmp.iswiz || mptr === state.mons[PM_MEDUSA]
        || mptr.msound === MS_NEMESIS || mptr.msound === MS_LEADER
        || is_Vlad(mtmp)
        || (mptr === state.mons[PM_ORACLE] && !fixuporacle(mtmp, state)))
        await mongone(mtmp, { state });
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
    const existing = open_bonesfile(state.u.uz, state);
    if (existing) {
        // C ref: bones.c:419-430. The prompt belongs to savebones(), after
        // it opens the current level's bones file. A declined replacement
        // leaves that file available for a later game.
        if (state.wizard) {
            if (await y_n(
                'Bones file already exists.  Replace it?', state,
            ) === 'y') {
                if (!delete_bonesfile(state.u.uz, state)) {

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
    unleash_all(state);

    // C: if (Punished) unpunish(); Punished is uball != null.
    if (state.uball) unpunish(state);

    // C: if (u.usteed) dismount_steed(DISMOUNT_BONES);
    // The port has no mount state in the exercised path; skip.

    await iter_mons_async((mtmp) => remove_mon_from_bones(mtmp, state), state);
    dmonsfree(state);

    // C: forget_engravings() -- clear erevealed/eread on all engravings.
    for (let ep = state.head_engr; ep; ep = ep.nxt_engr) {
        ep.erevealed = 0;
        ep.eread = 0;
    }

    // C ref: bones.c:449-453. Mark every named fruit as nonexistent;
    // goodfruit() restores the fid of each one an object still uses.
    for (let f = state.gf?.ffruit ?? null; f; f = f.nextf) {
        f.fid = -f.fid;
    }

    set_ghostly_objlist(state.invent);

    // C ref: bones.c:457-504. Handle ugrave_arise: create the monster the
    // hero becomes, or drop inventory for a ghost.
    let mtmp = null;
    if (ismnum(state.u.ugrave_arise)) {
        // bones.c:458-479. The monster the hero becomes is made on the
        // hero's square without inventory and receives the possessions.
        state.in_mklev = true;
        mtmp = makemon(state.mons[state.u.ugrave_arise], state.u.ux,
            state.u.uy, NO_MINVENT, { state });
        state.in_mklev = false;
        if (!mtmp) { /* arise-type might have been genocided */
            await drop_upon_death(null, null, state.u.ux, state.u.uy, state);
            state.u.ugrave_arise = NON_PM;
            return;
        }
        give_u_to_m_resistances(mtmp, state);
        mtmp = christen_monst(mtmp, state.plname, { state });
        newsym(state.u.ux, state.u.uy);
        await drop_upon_death(mtmp, null, state.u.ux, state.u.uy, state);
        if (mtmp.data.mlet === S_MUMMY
            && !m_carrying(mtmp, MUMMY_WRAPPING, state))
            mongets(mtmp, MUMMY_WRAPPING, bonesObjectEnv(state));
        m_dowear(mtmp, true, { state });
    } else if (state.u.ugrave_arise === LEAVESTATUE) {
        // bones.c:480-489. The possessions are embedded in a statue of the
        // hero's current form.
        const otmp = mk_named_object(STATUE, state.mons[state.u.umonnum],
            state.u.ux, state.u.uy, state.plname,
            bonesObjectEnv(state));
        await drop_upon_death(null, otmp, state.u.ux, state.u.uy, state);
        if (!otmp) return; /* couldn't make statue */
        mtmp = null;
    } else {
        // u.ugrave_arise < LEAVESTATUE: drop everything, create a ghost.
        await drop_upon_death(null, null, state.u.ux, state.u.uy, state);
        state.in_mklev = true;
        mtmp = makemon(state.mons[PM_GHOST], state.u.ux, state.u.uy, MM_NONAME, { state });
        state.in_mklev = false;
        if (!mtmp) return;
        mtmp = christen_monst(mtmp, state.plname, { state });
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
        // C's unhideable_trap(ttyp) macro is true only for a hole.
        ttmp.tseen = ttmp.ttyp === HOLE;
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
    // Strip functions from the serialized output. The cloneObjChain and
    // cloneMon helpers above already break object-graph cycles (ocontainer,
    // ocarry, nmon); shared references (e.g. mons[] data entries) are
    // legitimate duplicates that JSON.stringify handles by value.
    const safeReplacer = (_key, val) => {
        if (typeof val === 'function') return undefined;
        return val;
    };
    write_bonesfile(state.u.uz, JSON.stringify(bonesData, safeReplacer), state);
}

// C ref: save.c save_stairs() and savetrapchn(): a destination level in the
// hero's dungeon is saved as an offset from u.uz; restore.c rest_stairs()
// and getlev() add the restoring game's u.uz.dlevel back. Other dungeons'
// destinations, and an unset trap's dnum -1, stay absolute.
function relative_dest(dest, state) {
    return dest.dnum === state.u.uz.dnum
        ? { ...dest, dlevel: dest.dlevel - state.u.uz.dlevel }
        : { ...dest };
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
    // C ref: save.c save_stairs() (665-693): a destination in this dungeon
    // is written relative to the level, so the stairs of a special level
    // that another game places at a different depth still lead one level up
    // or down.
    const stairs = [];
    for (let stair = state.stairs; stair; stair = stair.next) {
        stairs.push({
            sx: stair.sx,
            sy: stair.sy,
            up: stair.up,
            isladder: stair.isladder,
            tolev: stair.tolev ? relative_dest(stair.tolev, state) : null,
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
            // C serializes the species number (mnum), not mtmp->data.  The
            // live species record is shared by monsters and carries object
            // aliases in this port, so copying the pointer would reintroduce
            // a cycle into the bones JSON.  restoreBonesLevel() resolves data
            // from mnum before rebuilding the monster list.
            if (k === 'data') continue;
            // mtmp->mw points into mtmp->minvent.  Save its presence as a
            // flag; restoreBonesLevel() reconnects it to the restored weapon
            // object after rebuilding that inventory chain.
            if (k === 'mw') { m.mw = Boolean(v); continue; }
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

    // Strip functions from traps. C ref: save.c savetrapchn() (918-944)
    // writes a hole's or trap door's destination in this dungeon relative to
    // the level, as save_stairs() does.
    const traps = (level.traps ?? []).map((t) => {
        const tc = { ...t };
        for (const k of Object.keys(tc)) {
            if (typeof tc[k] === 'function') delete tc[k];
        }
        if (tc.dst) tc.dst = relative_dest(tc.dst, state);
        return tc;
    });

    // C ref: save.c savefruitchn() (951-971), which savebones() calls
    // before savelev(): the fruits goodfruit() marked, in chain order.
    const fruitChain = [];
    for (let f = state.gf?.ffruit ?? null; f; f = f.nextf) {
        if (f.fid >= 0) fruitChain.push({ fname: f.fname, fid: f.fid });
    }

    // C ref: engrave.c save_engravings() (1551-1580), which savelev_core()
    // calls after the object chains: every engraving with text, in chain
    // order. The text is copied whole; rest_engravings() strips the leading
    // spaces that wipeout_text() left behind.
    const engravings = [];
    for (let ep = state.head_engr; ep; ep = ep.nxt_engr) {
        if (!ep.engr_txt?.[0]) continue;
        const saved = { ...ep, engr_txt: [...ep.engr_txt] };
        delete saved.nxt_engr;
        engravings.push(saved);
    }

    // C ref: timeout.c save_timers(RANGE_LEVEL) (2668-2699), which
    // savelev_core() calls first: every level-local timer, in queue order.
    // write_timer() (2505-2550) replaces an object or monster argument with
    // its id and marks the timer for relinking.
    const timers = [];
    for (let timer = state.gt?.timer_base; timer; timer = timer.next) {
        if (!timer_is_local(timer, state)) continue;
        let arg = timer.arg;
        if (timer.kind === TIMER_OBJECT) arg = timer.arg.o_id;
        else if (timer.kind === TIMER_MONSTER) arg = timer.arg.m_id;
        timers.push({
            timeout: timer.timeout,
            tid: timer.tid,
            kind: timer.kind,
            func_index: timer.func_index,
            arg,
            needs_fixup: timer.kind === TIMER_OBJECT
                || timer.kind === TIMER_MONSTER,
        });
    }

    // C ref: save.c savedamage() (640-662), which savelev_core() calls after
    // the monster loop's data: the shop damage list in chain order.
    const damage = [];
    for (let dam = level.damagelist ?? null; dam; dam = dam.next) {
        damage.push({
            when: dam.when,
            place: { x: dam.place.x, y: dam.place.y },
            cost: dam.cost,
            typ: dam.typ,
            flags: dam.flags,
        });
    }

    return {
        locations,
        rooms: cloneBonesRooms(level.rooms),
        nroom: level.nroom,
        doors: level.doors,
        doorindex: level.doorindex,
        flags: level.flags,
        dnstair: level.dnstair,
        upstair: level.upstair,
        stairs,
        // C ref: save.c savelev_core():515-516 writes svu.updest and
        // svd.dndest right after the stairs; a bones file is a savelev() too.
        updest: state.updest ? { ...state.updest } : {},
        dndest: state.dndest ? { ...state.dndest } : {},
        lastseentyp: level.lastseentyp,
        bonesinfo: level.bonesinfo,
        regions: level.regions,
        // C ref: save.c:552 save_exclusions(); a bones file is a savelev().
        exclusion_zones: save_exclusions(state),
        traps,
        track,
        monsters,
        floorObjects,
        buriedObjects,
        engravings,
        timers,
        // C ref: worm.c save_worm() (528-551), which savelev_core() calls
        // right after savemonchn(): every worm slot's segments, tail first.
        worms: (level.worms ?? []).map((slot) => (slot
            ? {
                segments: slot.segments.map(({ x, y }) => ({ x, y })),
                growtime: slot.growtime,
            }
            : null)),
        damage,
        // C ref: light.c save_light_sources(RANGE_LEVEL), which savelev_core()
        // calls right after save_timers().
        lights: maybe_write_ls(RANGE_LEVEL, state),
        fruitChain,
        moves: state.moves,
    };
}

// C ref: obj.h age_is_relative(): these objects keep their remaining burn
// or fuel time in age rather than a creation turn.
function age_is_relative(otmp) {
    return otmp.otyp === BRASS_LANTERN || otmp.otyp === OIL_LAMP
        || otmp.otyp === CANDELABRUM_OF_INVOCATION
        || otmp.otyp === TALLOW_CANDLE || otmp.otyp === WAX_CANDLE
        || otmp.otyp === POT_OIL;
}

// C ref: restore.c restobjchn() (231-296), its ghostly fixups for each
// object read from a bones file, in chain order: a fresh identity from
// next_ident() (254-259), then, unless the chain is frozen, the age moved
// from the dead hero's clock to this one's (266-267), then the contents,
// which are frozen inside an ice box (271-278). A slime mold also has its
// fruit renumbered by ghostfruit() (260-261) before its age moves.
// `ghost` carries getlev()'s state for the whole file: `omoves`, the turn the
// bones level was saved on (svo.omoves); `idMap`, C's add_id_mapping() table,
// which maps each saved id to the restored object; and `oldfruit`, the dead
// hero's fruit chain (go.oldfruit).
function restobjchn_ghostly(ochain, frozen, ghost, state) {
    for (let otmp = ochain; otmp; otmp = otmp.nobj) {
        const oldId = otmp.o_id;
        otmp.o_id = next_ident({ state });
        ghost.idMap.set(oldId, otmp);
        if (otmp.otyp === SLIME_MOLD) ghostfruit(otmp, ghost.oldfruit, state);
        if (!frozen && !age_is_relative(otmp))
            otmp.age = state.moves - ghost.omoves + otmp.age;
        if (otmp.cobj)
            restobjchn_ghostly(otmp.cobj, otmp.otyp === ICE_BOX, ghost, state);
    }
}

// C ref: restore.c find_lev_obj() (71-107). The restored fobj chain is
// reversed and every object freed, then each is put back with
// place_object(), so the head of the saved chain ends on top of its pile,
// boulders stay above other objects, and obj_no_longer_held() gives a
// crysknife its chance to revert. Rooms have no resident yet (set_residency()
// comes later in getlev()), so place_object() clears every no_charge and
// costly_alteration() finds no shopkeeper. The ball and chain fixup applies
// only to the hero's own level in a saved game, never to bones.
async function find_lev_obj(state) {
    let fobjtmp = null;
    let otmp;
    while ((otmp = state.level.objlist) != null) {
        state.level.objlist = otmp.nobj;
        otmp.nobj = fobjtmp;
        otmp.where = OBJ_FREE;
        fobjtmp = otmp;
    }
    const env = {
        state,
        hooks: {
            blockPoint: (x, y, placeEnv) => block_point(x, y, placeEnv.state),
        },
    };
    while ((otmp = fobjtmp) != null) {
        fobjtmp = otmp.nobj;
        await place_object(otmp, otmp.ox, otmp.oy, env);
    }
}

// C ref: bones.c getbones() (716-730), mongone() leaves dead monsters on the
// fmon chain and dmonsfree() unlinks them. Complete that lifecycle here so
// the restored level's chain and coordinate grid are consistent before the
// arrival code begins iterating monsters.
function purgeDefunctBonesMonsters(state) {
    for (let mtmp = state.level?.monlist; mtmp; mtmp = mtmp.nmon) {
        // C ref: bones.c:717-718. MGIVENNAME() reads either home.
        if (mtmp.mextra?.mgivenname)
            mtmp.mextra.mgivenname = sanitize_name(mtmp.mextra.mgivenname, state);
        else if (mtmp.mgivenname)
            mtmp.mgivenname = sanitize_name(mtmp.mgivenname, state);
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

// C ref: restore.c getlev() (1199-1220), the ghostly arm of its monster
// loop.  A bones level is loaded for a new character, so every
// non-shopkeeper monster's attitude is recomputed against that character; a
// peaceful monster from the dead character's game can become hostile to the
// new one.  Each monster then has its shape-changing updated and, because the
// level is ghostly, gets hide_monst()'s chance to hide, in the same pass, so
// the random calls interleave per monster as in C.  Keep this before
// purgeDefunctBonesMonsters to preserve C's random-call order for monsters
// rejected by propagate().
export async function ghostly_getlev_monsters(state) {
    const { hide_monst } = await import('./restore.js');
    for (let mtmp = state.level?.monlist; mtmp; mtmp = mtmp.nmon) {
        if (!mtmp.isshk) {
            mtmp.mpeaceful = (is_unicorn(mtmp.data)
                && Math.sign(state.u.ualign.type)
                    === Math.sign(mtmp.data.maligntyp))
                ? 1
                : peace_minded(mtmp.data, { state });
        }
        set_malign(mtmp, state);
        await restore_cham(mtmp, state);
        hide_monst(mtmp, state);
    }
}

// C ref: bones.c getbones() (630-756). Reads a bones file from VFS storage,
// restores the level, and deletes the bones file. The caller (mklev.js)
// handles the preliminary eligibility checks (discover, flags.bones, rn2(3),
// no_bones_level) and the wizard-mode "Get bones?" prompt before calling.
export async function getbones(state = game) {
    const bonesFile = open_bonesfile(state.u.uz, state);
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
    await restoreBonesLevel(bonesData, state);

    // C ref: restore.c getlev() resets peaceful/malign relative to the new
    // character while walking the restored monster chain.
    await ghostly_getlev_monsters(state);

    // Process defunct monsters and surviving inventories for the restore path.
    purgeDefunctBonesMonsters(state);
    resetobjs(state.level?.objlist, true, state);
    resetobjs(state.level?.buriedobjlist, true, state);

    // C ref: bones.c:731 repairs shop damage after restoring the bones level.
    await fix_shop_damage(state);
    // C ref: bones.c:736, once the file is closed.
    sanitize_engravings(state);

    state.u.uroleplay ??= {};
    state.u.uroleplay.numbones = (state.u.uroleplay.numbones ?? 0) + 1;

    // C ref: bones.c:737 -- numbones++ happens before the Unlink prompt.
    // File deletion is handled by the caller (mklev.js) after the optional
    // wizard-mode "Unlink bones?" prompt.
    return true;
}

// Restore a bones level from a serialized snapshot into the game state.
async function restoreBonesLevel(bonesData, state) {
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
    // C ref: restore.c getlev():1149-1163, reached through getbones(): the
    // restored trap chain is the reverse of the one savebones() wrote, and
    // its destinations are relative to the level.
    rest_traps(level, state.u.uz);

    // Rebuild object chains from flat arrays. Returns the head of a linked
    // list (via nobj). For each object, also links container contents (cobj)
    // into an nobj-chain from the saved array form.
    //
    // C ref: restore.c restobjchn() and restobj(). Each object is a newobj()
    // struct, so it gets the union accessors (nexthere, ocontainer, ocarry
    // over `v`) that the JSON snapshot cannot keep, and restobj() clears the
    // union's nexthere. Container contents get their ocontainer back
    // pointer (272-278); restmonchn() gives a monster's pack its ocarry.
    function rebuildObjChain(items) {
        if (!items || !items.length) return null;
        let head = null;
        let tail = null;
        for (const o of items) {
            defineObjAliases(o);
            o.v = null;
            // Rebuild container contents from array to nobj-chain
            if (Array.isArray(o.cobj) && o.cobj.length) {
                o.cobj = rebuildObjChain(o.cobj);
                for (let content = o.cobj; content; content = content.nobj)
                    content.ocontainer = o;
            } else {
                o.cobj = null;
            }
            o.nobj = null;
            if (tail) { tail.nobj = o; tail = o; }
            else { head = o; tail = o; }
        }
        return head;
    }

    // C ref: restore.c getlev():1110 reads the level's timestamp, the turn
    // savebones() wrote it on.
    const omoves = bonesData.moves;
    // C's id mapping table (restore.c add_id_mapping()), cleared by getlev()
    // and filled while the monster and object chains are read: each saved
    // m_id or o_id maps to the restored monster or object.
    const idMap = new Map();
    // C ref: restore.c getlev():1076-1077 loadfruitchn(), first of all: the
    // dead hero's fruits, which loadfruitchn() pushes as it reads them, so
    // the old chain is in reverse order. getlev():1251 frees it; this game's
    // own chain, gf.ffruit, only gains the names ghostfruit() adds.
    const ghost = {
        omoves,
        idMap,
        oldfruit: [...(bonesData.fruitChain ?? [])].reverse(),
    };

    // Rebuild monsters: place in the grid and build the monlist chain.
    const monsGrid = [];
    for (let x = 0; x < COLNO; x++) monsGrid.push(new Array(ROWNO).fill(null));
    let monHead = null;
    let monTail = null;
    for (const m of bonesData.monsters ?? []) {
        // C restmonchn() assigns a fresh identity, resolves mtmp->data from
        // the serialized species number, and then calls propagate() for the
        // ghostly birth before restoring inline inventory.
        const oldId = m.m_id;
        m.m_id = next_ident({ state });
        idMap.set(oldId, m);
        m.data = state.mons?.[m.mnum] ?? m.data;
        const mndx = m.cham === NON_PM ? monsndx(m.data) : m.cham;
        if (!propagate(mndx, true, true, { state }))
            m.mhpmax = DEFUNCT_MONSTER;
        // Rebuild inventory from array to nobj-chain
        if (Array.isArray(m.minvent) && m.minvent.length) {
            m.minvent = rebuildObjChain(m.minvent);
            // C restore.c restmonchn() (419-425): restore the monster back
            // pointer of every object in its pack.
            for (let obj = m.minvent; obj; obj = obj.nobj) obj.ocarry = m;
            restobjchn_ghostly(m.minvent, false, ghost, state);
        } else {
            m.minvent = null;
        }
        // C restore.c:432-446 serializes mw as a non-null pointer marker,
        // then reconnects it to the restored inventory object carrying W_WEP.
        // The saved pointer itself is not a usable object reference.
        if (m.mw) {
            let weapon = m.minvent;
            while (weapon && !(weapon.owornmask & W_WEP))
                weapon = weapon.nobj;
            m.mw = weapon ?? null;
        } else {
            m.mw = null;
        }
        // C restore.c:446-449: a shopkeeper's and a priest's level-bound
        // extension records point at the level the bones are loaded on.
        if (m.isshk) restshk(m, true, state);
        if (m.ispriest) restpriest(m, true, state);
        m.nmon = null;
        if (monTail) { monTail.nmon = m; monTail = m; }
        else { monHead = m; monTail = m; }
    }
    level.monsters = monsGrid;
    level.monlist = monHead;
    // C ref: worm.c rest_worm() (577-603), which getlev() calls right after
    // restmonchn(): each worm slot's segments, tail first, and every slot's
    // wgrowtime. A slot with no segments is free (get_wormno() tests its
    // head), so it restores as js/worm.js's empty slot.
    level.worms = Array(MAX_NUM_WORMS).fill(null);
    (bonesData.worms ?? []).forEach((saved, wormno) => {
        if (wormno > 0 && saved?.segments?.length) {
            level.worms[wormno] = {
                segments: saved.segments.map(({ x, y }) => ({ x, y })),
                growtime: saved.growtime,
            };
        }
    });

    // C ref: restore.c getlev():1113 rest_stairs() rebuilds gs.stairs before
    // the caller places the hero, separately from level.upstair/dnstair:
    // those coordinates describe terrain, while stairway_find_dir() needs the
    // destination-bearing nodes. Each saved stairway is pushed, so the list
    // comes back reversed.
    rest_stairs(bonesData.stairs ?? [], state, state.u.uz);
    // C ref: restore.c getlev():1114-1115 reads svu.updest and svd.dndest
    // right after the stairs. The Wizard's Tower levels keep their tower
    // boundary in dndest, which dungeon.c In_W_tower() requires.
    state.updest = bonesData.updest ? { ...bonesData.updest } : {};
    state.dndest = bonesData.dndest ? { ...bonesData.dndest } : {};
    // C ref: restore.c getlev():1227 load_exclusions() reads the bones
    // level's zones onto the list the departing level's savelev() emptied.
    load_exclusions(bonesData.exclusion_zones, state);

    // C ref: restore.c getlev() (1158-1163): fobj = restobjchn(), which
    // gives each floor object a fresh identity on a ghostly level, then
    // find_lev_obj() builds the pile grid; the buried chain is read after.
    // place_object() works on state.level, so the level is installed first.
    const objGrid = [];
    for (let x = 0; x < COLNO; x++) objGrid.push(new Array(ROWNO).fill(null));
    level.objects = objGrid;
    level.objlist = rebuildObjChain(bonesData.floorObjects ?? []);
    restobjchn_ghostly(level.objlist, false, ghost, state);

    state.level = level;
    await find_lev_obj(state);

    // Buried objects
    level.buriedobjlist = rebuildObjChain(bonesData.buriedObjects ?? []);
    restobjchn_ghostly(level.buriedobjlist, false, ghost, state);

    // C ref: restore.c getlev():1166 rest_engravings(), after the object
    // chains. save_engravings() writes head_engr in chain order and
    // rest_engravings() pushes each one it reads, so the restored chain is
    // reversed; it then strips leading spaces and stamps engr_time.
    rest_engravings((bonesData.engravings ?? []).map((saved) =>
        ({ ...saved, engr_txt: [...saved.engr_txt] })), state);

    rest_region_capacity(level);

    // C restore.c getlev() (1177-1195), the placement half of its monster
    // loop: rest_rooms() cleared every room's resident pointer, so each
    // shopkeeper on the restored chain reclaims its room; then each monster
    // goes onto the map and a worm's tail with it, in chain order.
    for (let mtmp = level.monlist; mtmp; mtmp = mtmp.nmon) {
        if (mtmp.isshk) set_residency(mtmp, false, state);
        if (isok(mtmp.mx, mtmp.my)) level.monsters[mtmp.mx][mtmp.my] = mtmp;
        if (mtmp.wormno) place_wsegs(mtmp, null, { state });
    }

    // C ref: restore.c getlev():1130 restore_timers(RANGE_LEVEL, elapsed)
    // and 1305 relink_timers(ghostly). A bones level's timers move from the
    // dead hero's clock to this one's (timeout.c 2722-2723); each object
    // timer then points at the restored object that had the saved id.
    const timers = [];
    for (const saved of bonesData.timers ?? []) {
        const timer = { ...saved, next: null };
        timer.timeout += state.moves - omoves;
        if (timer.needs_fixup) {
            if (timer.kind !== TIMER_OBJECT)
                throw new Error('relink_timers: no monster timer implemented');
            timer.arg = idMap.get(saved.arg);
            if (!timer.arg) throw new Error(`can't find o_id ${saved.arg}`);
            timer.needs_fixup = false;
        }
        timers.push(timer);
    }
    restore_timers(timers, state);

    // C ref: restore.c getlev():1131 restore_light_sources(), right after
    // the timers, and 1300 relink_light_sources(ghostly) after every monster
    // and object is read. C relinks after the monster loop's restore_cham();
    // this relinks first, which differs only if restore_cham() changed a
    // light-emitting shapeshifter, where C's del_light_source() would miss
    // the still-unlinked source.
    restore_light_sources(bonesData.lights, state);
    relink_light_sources(idMap, state);

    // C ref: restore.c restdamage() (153-179), which getlev() calls after
    // its monster loop.
    restdamage(bonesData.damage ?? [], level, state.moves - omoves);

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

    // C ref: restore.c getlev() (1235-1296), its ghostly arm. getbones()
    // calls getlev() with lev 0, so the arm that gives a level between
    // Medusa's and the castle a missing down staircase (1246-1257) never runs
    // for bones. The old fruit chain freed at 1251 is ghost.oldfruit.
    const br = Is_branchlev(state.u.uz, state);
    if (br && state.u.uz.dlevel === 1) {
        // A branch's first level keeps the dead hero's way back to the
        // parent dungeon; point it at this game's other end of the branch.
        const ltmp = assign_level({},
            on_level(state.u.uz, br.end1) ? br.end2 : br.end1);
        switch (br.type) {
        case BR_STAIR:
        case BR_NO_END1:
        case BR_NO_END2: {
            let stway = state.stairs;
            while (stway && stway.tolev?.dnum === state.u.uz.dnum)
                stway = stway.next;
            if (stway) assign_level(stway.tolev, ltmp);
            break;
        }
        case BR_PORTAL: { /* max of 1 portal per level */
            const trap = level.traps.find((t) => t.ttyp === MAGIC_PORTAL);
            if (!trap) throw new Error('getlev: need portal but none found');
            assign_level(trap.dst, ltmp);
            break;
        }
        default:
            break;
        }
    } else if (!br) {
        // Remove any dangling portals.
        for (const trap of [...level.traps]) {
            if (trap.ttyp === MAGIC_PORTAL) deltrap(trap, state);
        }
    }

    // C ref: restore.c getlev():1301, the last fixup once every monster and
    // object has its new id.
    reset_oattached_mids(idMap, state);
}

// C ref: bones.c sanitize_name() (197-220), for the tty window port the
// recorder uses. It works on the name's bytes: a control character or DEL
// becomes '.', and without wc_eight_bit_input a byte with its eighth bit set
// becomes '_'. JavaScript strings cannot be changed in place, so the caller
// stores the result.
export function sanitize_name(name, state = game) {
    const strip8thBit = !state.iflags?.wc_eight_bit_input;
    return decodeUtf8ByteString(encodeUtf8ByteString(name).map((byte) => {
        const c = byte & 0x7F;
        if (c < 0x20 || c === 0x7F) return 0x2E;
        if (c !== byte && strip8thBit) return 0x5F;
        return byte;
    }));
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
