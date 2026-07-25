// Holding trap effects on monsters.
// C refs: trap.c mintrap(), trapeffect_bear_trap(), trapeffect_pit(),
// trapeffect_web(), m_easy_escape_pit(), mu_maybe_destroy_web(), and fill_pit().

import {
    BEAR_TRAP,
    DEAF,
    FORCETRAP,
    PIT,
    SPIKED_PIT,
    W_ARMF,
    WEB,
} from './const.js';
import { newsym } from './display.js';
import {
    acidic,
    amorphous,
    flaming,
    is_clinger,
    is_floater,
    is_flyer,
    is_whirly,
    metallivorous,
    passes_walls,
    unsolid,
    webmaker,
} from './mondata.js';
import {
    M2_NASTY,
    MZ_HUGE,
    MZ_SMALL,
    PM_BALROG,
    PM_BALUCHITHERIUM,
    PM_BUGBEAR,
    PM_CYCLOPS,
    PM_GELATINOUS_CUBE,
    PM_IRON_GOLEM,
    PM_JABBERWOCK,
    PM_KRAKEN,
    PM_LORD_SURTUR,
    PM_MASTODON,
    PM_NORN,
    PM_ORION,
    PM_OWLBEAR,
    PM_PIT_FIEND,
    PM_PIT_VIPER,
    PM_PURPLE_WORM,
    PM_TITANOTHERE,
    S_DRAGON,
    S_GIANT,
} from './monsters.js';
import { objectType } from './obj.js';
import { BOULDER, IRON } from './objects.js';
import {
    delete_monster_trap,
    monster_avoids_known_trap,
    monster_learns_trap,
    monster_skips_floor_trap,
    nearby_monsters_learn_trap,
    reveal_monster_trap,
    trap_at_monster,
} from './trap_monster_shared.js';
import { ttyPline } from './tty_message.js';
import { canSeeMonster } from './startup_a11y.js';
import { cansee } from './vision.js';
import { which_armor } from './weapon.js';

function holdingOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function') {
        throw new TypeError(
            `monster holding trap requires a ${name} operation`,
        );
    }
    return operation;
}

function monsterName(monster, state, capitalized, env) {
    let name = holdingOperation(env, 'monsterName')(monster, state);
    if (capitalized)
        name = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    return name;
}

function inSight(monster, state) {
    return canSeeMonster(monster, state) || monster === state.u.usteed;
}

function heroIsDeaf(state) {
    const property = state.u?.uprops?.[DEAF];
    return Boolean(property?.intrinsic || property?.extrinsic)
        && !property?.blocked;
}

function monsterInAir(monster) {
    return is_floater(monster.data)
        || is_flyer(monster.data)
        || (is_clinger(monster.data) && monster.mundetected);
}

function ironShoes(monster, state) {
    const shoes = which_armor(monster, W_ARMF);
    return shoes && objectType(shoes, state).oc_material === IRON;
}

function easyPitEscape(monster) {
    return monster.data?.pmidx === PM_PIT_FIEND
        || monster.data?.msize >= MZ_HUGE;
}

function floorObjectOfType(x, y, objectTypeIndex, state) {
    for (let obj = state.level?.objects?.[x]?.[y] ?? null;
        obj;
        obj = obj.nexthere) {
        if (obj.otyp === objectTypeIndex) return obj;
    }
    return null;
}

// Return true while the monster remains caught, so m_move() spends its action.
export async function resolve_trapped_monster(monster, env) {
    if (!monster.mtrapped) return false;
    const trap = trap_at_monster(monster, env.state);
    if (!trap) {
        monster.mtrapped = false;
        return false;
    }
    const pit = trap.ttyp === PIT || trap.ttyp === SPIKED_PIT;
    if (trap.ttyp !== WEB && trap.ttyp !== BEAR_TRAP && !pit) {
        throw new RangeError(
            'mintrap: monster is held by an unsupported trap',
        );
    }
    holdingOperation(env, 'monsterName');
    const fillPit = holdingOperation(env, 'fillPit');

    const visible = canSeeMonster(monster, env.state);
    if (!trap.tseen
        && visible
        && cansee(monster.mx, monster.my, env.state)) {
        reveal_monster_trap(trap);
    }
    const easyEscape = pit && easyPitEscape(monster);
    if (env.random.rn2(40) && !easyEscape) {
        if (trap.ttyp === BEAR_TRAP && metallivorous(monster.data)) {
            if (visible) {
                await ttyPline(
                    `${monsterName(monster, env.state, true, env)} eats `
                    + 'a bear trap!',
                    env.state,
                );
            }
            delete_monster_trap(trap, env.state);
            monster.meating = 5;
            monster.mtrapped = false;
            return false;
        }
        if (trap.ttyp === SPIKED_PIT && metallivorous(monster.data)) {
            if (visible) {
                await ttyPline(
                    `${monsterName(monster, env.state, true, env)} munches `
                    + 'on some spikes!',
                    env.state,
                );
            }
            trap.ttyp = PIT;
            monster.meating = 5;
        }
        return true;
    }

    if (pit) {
        const boulder = floorObjectOfType(
            monster.mx,
            monster.my,
            BOULDER,
            env.state,
        );
        if (boulder) {
            if (env.random.rn2(2)) return true;
            monster.mtrapped = false;
            if (visible) {
                await ttyPline(
                    `${monsterName(monster, env.state, true, env)} pulls `
                    + 'free...',
                    env.state,
                );
            }
            await fillPit(monster, trap, boulder, env);
            return false;
        }
        if (visible) {
            await ttyPline(
                `${monsterName(monster, env.state, true, env)} climbs `
                + `${easyEscape ? 'easily ' : ''}out of the pit.`,
                env.state,
            );
        }
        monster.mtrapped = false;
        return false;
    }

    if (visible) {
        await ttyPline(
            `${monsterName(monster, env.state, true, env)} pulls free `
            + `of the ${trap.ttyp === WEB ? 'web' : 'bear trap'}.`,
            env.state,
        );
    }
    monster.mtrapped = false;
    return false;
}

export async function trigger_monster_bear_trap(monster, trap, env) {
    const { random, state } = env;
    const killMonster = holdingOperation(env, 'killMonster');
    holdingOperation(env, 'monsterName');
    if (monster_skips_floor_trap(monster, env)) return false;
    if (monster_avoids_known_trap(monster, trap, env)) return false;
    monster_learns_trap(monster, trap.ttyp);
    nearby_monsters_learn_trap(trap, state);

    const caught = monster.data.msize > MZ_SMALL
        && !amorphous(monster.data)
        && !monsterInAir(monster)
        && !is_whirly(monster.data)
        && !unsolid(monster.data);
    const visible = inSight(monster, state);
    if (!caught) {
        if ((env.trapFlags & FORCETRAP) && visible) {
            await ttyPline(
                `${monsterName(monster, state, true, env)} evades `
                + `${trap.madeby_u ? 'your' : 'a'} bear trap!`,
                state,
            );
            reveal_monster_trap(trap);
        }
        return false;
    }

    monster.mtrapped = true;
    if (visible) {
        await ttyPline(
            `${monsterName(monster, state, true, env)} is caught in `
            + `${trap.madeby_u ? 'your' : 'a'} bear trap!`,
            state,
        );
        reveal_monster_trap(trap);
    } else if ((monster.data?.pmidx === PM_OWLBEAR
        || monster.data?.pmidx === PM_BUGBEAR)
        && !heroIsDeaf(state)) {
        await ttyPline('You hear the roaring of an angry bear!', state);
    }
    if (ironShoes(monster, state)) return false;

    monster.mhp -= random.d(2, 4);
    if (monster.mhp > 0) return false;
    await killMonster(
        monster,
        monsterName(monster, state, true, env),
        env,
    );
    return true;
}

function grounded(monster) {
    // New games begin on a level with a ceiling, so clingers are not
    // grounded at this active boundary.
    return !is_flyer(monster.data)
        && !is_floater(monster.data)
        && !is_clinger(monster.data);
}

export async function trigger_monster_pit(monster, trap, env) {
    const { random, state } = env;
    const killMonster = holdingOperation(env, 'killMonster');
    const selfTouch = holdingOperation(env, 'selfTouch');
    holdingOperation(env, 'monsterName');
    if (monster_skips_floor_trap(monster, env)) return false;
    if (monster_avoids_known_trap(monster, trap, env)) return false;
    monster_learns_trap(monster, trap.ttyp);
    nearby_monsters_learn_trap(trap, state);

    const longWormInAir = monster.wormno
        && (monster.wormSegments?.length ?? 0) > 5;
    const visible = inSight(monster, state);
    if (!grounded(monster) || longWormInAir) {
        if ((env.trapFlags & FORCETRAP) && visible) {
            reveal_monster_trap(trap);
            await ttyPline(
                `${monsterName(monster, state, true, env)} doesn't fall `
                + 'into the pit.',
                state,
            );
        }
        return false;
    }

    if (!passes_walls(monster.data)) monster.mtrapped = true;
    if (visible) {
        await ttyPline(
            `${monsterName(monster, state, true, env)} falls into `
            + `${trap.madeby_u ? 'your' : 'a'} pit!`,
            state,
        );
        if (monster.data?.pmidx === PM_PIT_VIPER
            || monster.data?.pmidx === PM_PIT_FIEND) {
            await ttyPline("How pitiful.  Isn't that the pits?", state);
        }
        reveal_monster_trap(trap);
    }

    await selfTouch(monster, 'Falling, ', env);
    if (monster.mhp < 1) return true;
    const relevantSpikes = trap.ttyp === SPIKED_PIT
        && !ironShoes(monster, state);
    monster.mhp -= random.rnd(relevantSpikes ? 10 : 6);
    if (monster.mhp > 0) return false;
    await killMonster(
        monster,
        monsterName(monster, state, true, env),
        env,
    );
    return true;
}

const ALWAYS_TEAR_WEB = new Set([
    PM_TITANOTHERE,
    PM_BALUCHITHERIUM,
    PM_PURPLE_WORM,
    PM_JABBERWOCK,
    PM_IRON_GOLEM,
    PM_BALROG,
    PM_KRAKEN,
    PM_MASTODON,
    PM_ORION,
    PM_NORN,
    PM_CYCLOPS,
    PM_LORD_SURTUR,
]);

export async function trigger_monster_web(monster, trap, env) {
    const { state } = env;
    holdingOperation(env, 'monsterName');
    if (monster_avoids_known_trap(monster, trap, env)) return false;
    monster_learns_trap(monster, trap.ttyp);
    nearby_monsters_learn_trap(trap, state);

    const species = monster.data;
    if (webmaker(species)) return false;
    const visible = inSight(monster, state);
    const article = trap.madeby_u ? 'your' : 'a';
    const passesThrough = amorphous(species)
        || is_whirly(species)
        || flaming(species)
        || unsolid(species)
        || species?.pmidx === PM_GELATINOUS_CUBE;
    if (passesThrough) {
        if (flaming(species) || acidic(species)) {
            if (visible) {
                await ttyPline(
                    `${monsterName(monster, state, true, env)} `
                    + `${flaming(species) ? 'burns' : 'dissolves'} `
                    + `${article} spider web!`,
                    state,
                );
            }
            delete_monster_trap(trap, state);
            newsym(monster.mx, monster.my);
        } else if (visible) {
            await ttyPline(
                `${monsterName(monster, state, true, env)} flows through `
                + `${article} spider web.`,
                state,
            );
            reveal_monster_trap(trap);
        }
        return false;
    }

    const bear = species?.pmidx === PM_OWLBEAR
        || species?.pmidx === PM_BUGBEAR;
    let tearsWeb = ALWAYS_TEAR_WEB.has(species?.pmidx);
    if (!tearsWeb && !bear) {
        tearsWeb = species?.mlet === S_GIANT
            || (species?.mlet === S_DRAGON
                && Boolean(species.mflags2 & M2_NASTY))
            || (monster.wormno
                && (monster.wormSegments?.length ?? 0) > 5);
    } else if (bear && !visible && !heroIsDeaf(state)) {
        await ttyPline(
            'You hear the roaring of a confused bear!',
            state,
        );
    }

    monster.mtrapped = !tearsWeb;
    if (tearsWeb) {
        if (visible) {
            await ttyPline(
                `${monsterName(monster, state, true, env)} tears through `
                + `${article} spider web!`,
                state,
            );
        }
        delete_monster_trap(trap, state);
        newsym(monster.mx, monster.my);
    } else if (visible) {
        await ttyPline(
            `${monsterName(monster, state, true, env)} is caught in `
            + `${article} spider web.`,
            state,
        );
        reveal_monster_trap(trap);
    }
    return monster.mtrapped;
}
