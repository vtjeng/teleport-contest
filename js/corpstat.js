// corpstat.js -- Corpse and statue construction.
// C ref: mkobj.c mkcorpstat(), save_mtraits(), get_mtraits(), and
// mk_named_object().

import {
    CORPSTAT_INIT,
    CORPSTAT_NONE,
    CORPSTAT_SPE_VAL,
    MON_DETACH,
    ONAME_NO_FLAGS,
} from './const.js';
import { oname } from './do_name.js';
import { game } from './gstate.js';
// js/mon.js make_corpse() imports mkcorpstat() from this file. Both sides use
// the other's exports only inside function bodies, so the cycle resolves.
import { copy_mextra } from './mon.js';
import { is_rider, monsndx } from './mondata.js';
import { mksobj, mksobj_at, weight } from './obj.js';
import { CORPSE, STATUE } from './objects.js';
import { PM_LICHEN, PM_LIZARD, S_TROLL } from './monsters.js';
import { obj_stop_timers, start_corpse_timeout } from './timeout.js';

function corpstatEnv(env = {}) {
    return {
        ...env,
        state: env.state ?? game,
        hooks: env.hooks ?? {},
    };
}

function speciesIndex(species, state) {
    if (Number.isInteger(species)) {
        if (!state.mons?.[species])
            throw new RangeError(`mkcorpstat species ${species}`);
        return species;
    }
    if (Number.isInteger(species?.pmidx) && state.mons?.[species.pmidx])
        return species.pmidx;
    throw new TypeError('mkcorpstat requires a species index or record');
}

function specialCorpse(index, state) {
    const monster = state.mons?.[index];
    if (!monster)
        throw new RangeError(`mkcorpstat corpse species ${index}`);
    return index === PM_LIZARD
        || index === PM_LICHEN
        || monster.mlet === S_TROLL
        || is_rider(monster);
}

function monsterSpecies(monster, state) {
    if (monster?.data) return speciesIndex(monster.data, state);
    if (Number.isInteger(monster?.mnum))
        return speciesIndex(monster.mnum, state);
    if (Number.isInteger(monster?.mndx))
        return speciesIndex(monster.mndx, state);
    throw new TypeError('mkcorpstat monster has no species');
}

// C ref: mkobj.c save_mtraits() (2156-2195). "save_mtraits updates
// otmp->oextra->omonst in place": a corpse or statue carries a copy of the
// monster so that a revival can restore it. mkcorpstat() below is C's only
// caller.
//
// C's has_omonst()/newomonst() pair allocates obj->oextra->omonst on demand.
// js/obj.js copy_oextra() already treats that field as a plain object, so the
// port builds one instead. The priest arm at 2159-2160 is refused ahead of the
// call, in mkcorpstat().
function save_mtraits(obj, mtmp) {
    const baselevel = mtmp.data.mlevel; /* "mtmp->data is valid ptr" */
    // C's `*mtmp2 = *mtmp` copies the struct by value, so every struct-valued
    // member inside it is copied too. monst.h gives struct monst two of them:
    // the fixed-size `coord mtrack[MTSZ]` array (monst.h:143) and the `coord
    // mgoal` strategy target (monst.h:189). A JavaScript spread aliases both,
    // so both are rebuilt here. js/obj.js copy_oextra() copies the same two
    // for the same reason.
    const mtmp2 = {
        ...mtmp,
        mtrack: Array.isArray(mtmp.mtrack)
            ? mtmp.mtrack.map((point) => ({ ...point }))
            : mtmp.mtrack,
        mgoal: mtmp.mgoal ? { ...mtmp.mgoal } : mtmp.mgoal,
    };

    mtmp2.mextra = null;
    mtmp2.mnum = monsndx(mtmp.data);
    /* "invalidate pointers"; m_id stays, to recognize a revived quest leader */
    mtmp2.nmon = null;
    mtmp2.data = null;
    mtmp2.minvent = null;
    mtmp2.mw = null; /* MON_NOWEP() */
    if (mtmp.mextra) copy_mextra(mtmp2, mtmp);
    /* "if mtmp is a long worm with segments, its saved traits will be one
       without any segments" */
    mtmp2.wormno = 0;
    /* "make sure mtmp2 can survive if revived ('baselevel' will be 0 for
       1d4 mon)" */
    if (mtmp2.mhpmax <= baselevel) mtmp2.mhpmax = baselevel + 1;
    if (mtmp2.mhp > mtmp2.mhpmax) mtmp2.mhp = mtmp2.mhpmax;
    if (mtmp2.mhp < 1) mtmp2.mhp = 0;
    mtmp2.mstate &= ~MON_DETACH;

    obj.oextra ??= {};
    obj.oextra.omonst = mtmp2;
    return obj;
}

// C ref: mkobj.c get_mtraits() (2201-2224). Restore the species pointer on
// the monster snapshot carried by a corpse or statue. With copyof false C
// returns that inline record; with copyof true it allocates a by-value struct
// copy and duplicates mextra while retaining the other pointer fields.
export function get_mtraits(obj, copyof, state = game) {
    const saved = obj?.oextra?.omonst;
    if (!saved) return null;

    let result = saved;
    if (copyof) {
        result = {
            ...saved,
            mtrack: Array.isArray(saved.mtrack)
                ? saved.mtrack.map((point) => ({ ...point }))
                : saved.mtrack,
            mgoal: saved.mgoal ? { ...saved.mgoal } : saved.mgoal,
            mextra: null,
        };
        if (saved.mextra) copy_mextra(result, saved);
    }
    result.data = state.mons[result.mnum];
    return result;
}

export function mkcorpstat(
    objtype,
    monster,
    species,
    x,
    y,
    corpstatflags,
    rawEnv = {},
) {
    if (objtype !== CORPSE && objtype !== STATUE)
        throw new RangeError(`mkcorpstat object type ${objtype}`);
    const env = corpstatEnv(rawEnv);
    const { state } = env;
    const init = Boolean(corpstatflags & CORPSTAT_INIT);
    const relocate = x === 0 && y === 0
        ? env.hooks.relocateObject : null;
    if (x === 0 && y === 0 && typeof relocate !== 'function')
        throw new Error('mkcorpstat requires random object relocation');
    // C ref: mkobj.c:2159-2160. save_mtraits() forgets a priest's temple entry
    // before it copies anything, and priest.c forget_temple_entry() is not
    // ported. The stop is preflighted here, with the relocation owner above,
    // so that it precedes mksobj()'s draws rather than following them.
    if (monster) {
        const unsupported = env.unsupported;
        if (typeof unsupported !== 'function')
            throw new Error('mkcorpstat requires a refusal owner');
        if (monster.ispriest) unsupported("a priest's saved traits");
    }

    // The C helpers are always present.  Validate their JS equivalents and
    // source arguments before mksobj() can consume RNG, allocate an id, arm a
    // timer, or link the new object into a floor chain.
    let resolvedSpecies = species;
    if (monster && resolvedSpecies == null)
        resolvedSpecies = monsterSpecies(monster, state);
    if (resolvedSpecies != null)
        resolvedSpecies = speciesIndex(resolvedSpecies, state);

    let obj;
    if (x === 0 && y === 0) {
        obj = mksobj(objtype, init, false, env);
        relocate(obj, env);
    } else {
        obj = mksobj_at(objtype, x, y, init, false, env);
    }

    obj.spe = corpstatflags & CORPSTAT_SPE_VAL;
    /* decl.h:625 gm.mkcorpstat_norevive. js/uhitm.js hmon_hitmon()'s
       Trollsbane arm is its only writer, and state.gm is its one home. */
    obj.norevive = Boolean(state.gm?.mkcorpstat_norevive);

    if (monster) {
        save_mtraits(obj, monster);
        const record = state.mons[resolvedSpecies];
        if (monster.mcan && !is_rider(record)) obj.norevive = true;
    }

    if (resolvedSpecies != null) {
        const oldSpecies = obj.corpsenm;
        const newSpecies = resolvedSpecies;
        obj.corpsenm = newSpecies;
        obj.owt = weight(obj, env);
        if (obj.otyp === CORPSE
            && (state.gz?.zombify
                || specialCorpse(oldSpecies, state)
                || specialCorpse(newSpecies, state))) {
            obj_stop_timers(obj, state, env);
            start_corpse_timeout(obj, env);
        }
    }
    return obj;
}

// C ref: mkobj.c mk_named_object() (2253-2267).  Creates a new corpse or
// statue at (x, y) with a given name.  The returned object is never null.
export function mk_named_object(objtype, species, x, y, nm, rawEnv = {}) {
    const corpstatflags = (objtype !== STATUE) ? CORPSTAT_INIT
        : CORPSTAT_NONE;
    let otmp = mkcorpstat(objtype, null, species, x, y, corpstatflags, rawEnv);
    if (nm) {
        otmp = oname(otmp, nm, ONAME_NO_FLAGS, rawEnv);
    }
    return otmp;
}
