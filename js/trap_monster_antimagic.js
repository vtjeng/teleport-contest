// Anti-magic trap effects on monsters.
// C ref: trap.c trapeffect_anti_magic(), monster branch.

import {
    W_ARMF,
} from './const.js';
import {
    ART_MAGICBANE,
    artifact_defends,
} from './artifacts.js';
import { newsym } from './display.js';
import {
    capitalizedMonsterName,
} from './do_name.js';
import {
    attacktype,
    passes_walls,
    resists_magm,
} from './mondata.js';
import {
    AD_MAGM,
    AT_BREA,
    AT_MAGC,
} from './monsters.js';
import { objectType } from './obj.js';
import { IRON } from './objects.js';
import { canSeeMonster } from './startup_a11y.js';
import {
    monster_avoids_known_trap,
    monster_learns_trap,
    nearby_monsters_learn_trap,
    reveal_monster_trap,
} from './trap_monster_shared.js';
import { ttyPline } from './tty_message.js';
import { cansee } from './vision.js';

function antiMagicOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function') {
        throw new TypeError(
            `monster anti-magic trap requires a ${name} operation`,
        );
    }
    return operation;
}

function ironShoes(monster, state) {
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if ((obj.owornmask & W_ARMF)
            && objectType(obj, state).oc_material === IRON) {
            return obj;
        }
    }
    return null;
}

export async function trigger_monster_antimagic(monster, trap, env) {
    const { random, state } = env;
    const killMonster = antiMagicOperation(env, 'killMonster');
    const monsterName = env.monsterName ?? capitalizedMonsterName;
    const redraw = env.redraw ?? newsym;
    if (typeof monsterName !== 'function') {
        throw new TypeError(
            'monster anti-magic trap requires a monsterName operation',
        );
    }
    if (typeof redraw !== 'function') {
        throw new TypeError(
            'monster anti-magic trap requires a redraw operation',
        );
    }

    if (monster_avoids_known_trap(monster, trap, env)) return false;
    monster_learns_trap(monster, trap.ttyp);
    nearby_monsters_learn_trap(trap, state);

    const boots = ironShoes(monster, state);
    if (boots && boots.spe > 0) {
        --boots.spe;
        return false;
    }

    const inSight = canSeeMonster(monster, state)
        || monster === state.u.usteed;
    const seeSquare = cansee(monster.mx, monster.my, state);
    if (!resists_magm(monster, state)) {
        if (!monster.mcan
            && (attacktype(monster.data, AT_MAGC)
                || attacktype(monster.data, AT_BREA))) {
            monster.mspec_used =
                Math.trunc(monster.mspec_used ?? 0) + random.d(2, 6);
            if (inSight) {
                reveal_monster_trap(trap);
                await ttyPline(
                    `${monsterName(monster, state)} seems lethargic.`,
                    state,
                );
            }
        }
        return false;
    }

    let damage = random.rnd(4);
    if (monster.mw?.oartifact === ART_MAGICBANE)
        damage += random.rnd(4);
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (artifact_defends(obj, AD_MAGM, state, true)) {
            damage += random.rnd(4);
            break;
        }
    }
    if (passes_walls(monster.data))
        damage = Math.trunc((damage + 3) / 4);
    if (inSight) reveal_monster_trap(trap);
    monster.mhp -= damage;
    if (monster.mhp < 1) {
        await killMonster(
            monster,
            monsterName(monster, state),
            {
                ...env,
                deathCause: inSight
                    ? 'compression from an anti-magic field'
                    : null,
            },
        );
        if (seeSquare) redraw(trap.tx, trap.ty);
        return true;
    }
    if (seeSquare) redraw(trap.tx, trap.ty);
    return false;
}
