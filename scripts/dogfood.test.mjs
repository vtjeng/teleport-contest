import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ACCFOOD,
    APPORT,
    CADAVER,
    DOGFOOD,
    G_GENOD,
    MANFOOD,
    POISON,
    TABU,
    UNDEF,
} from '../js/const.js';
import {
    dogfood,
    dogfoodWithoutObjectResistanceDraw,
} from '../js/dogfood.js';
import {
    MONSTER_TEMPLATES,
    M1_CARNIVORE,
    PM_ACID_BLOB,
    PM_CHAMELEON,
    PM_COCKATRICE,
    PM_DEATH,
    PM_FIRE_ELEMENTAL,
    PM_FLOATING_EYE,
    PM_GELATINOUS_CUBE,
    PM_GHOUL,
    PM_GREEN_SLIME,
    PM_HUMAN,
    PM_KILLER_BEE,
    PM_LITTLE_DOG,
    PM_LIZARD,
    PM_PONY,
    PM_PYROLISK,
    PM_QUEEN_BEE,
    PM_ROCK_MOLE,
    PM_RUST_MONSTER,
    PM_VAMPIRE,
    S_FUNGUS,
    S_YETI,
} from '../js/monsters.js';
import { newObject } from '../js/obj.js';
import {
    AMULET_OF_STRANGULATION,
    APPLE,
    BANANA,
    CANDY_BAR,
    CARROT,
    CLOVE_OF_GARLIC,
    CORPSE,
    DAGGER,
    EGG,
    ELVEN_MITHRIL_COAT,
    FOOD_CLASS,
    GLOB_OF_GREEN_SLIME,
    HEAVY_IRON_BALL,
    LEATHER_ARMOR,
    LUMP_OF_ROYAL_JELLY,
    OBJECT_TEMPLATES,
    ORANGE,
    RIN_SLOW_DIGESTION,
    SILVER_DAGGER,
    STATUE,
    TIN,
    TRIPE_RATION,
    WEAPON_CLASS,
} from '../js/objects.js';

function stateForFood() {
    return {
        level: { monlist: null },
        mons: MONSTER_TEMPLATES,
        moves: 100,
        mvitals: [],
        objects: OBJECT_TEMPLATES,
        urole: { questarti: 21 },
    };
}

function pet(state, pmidx = PM_LITTLE_DOG, overrides = {}) {
    return {
        data: state.mons[pmidx],
        isminion: false,
        mcansee: true,
        mextra: {
            edog: {
                mhpmax_penalty: 0,
            },
        },
        mintrinsics: 0,
        mextrinsics: 0,
        mtame: 10,
        ...overrides,
    };
}

function object(state, otyp, overrides = {}) {
    const type = state.objects[otyp];
    return newObject({
        otyp,
        oclass: type.oc_class,
        quan: 1,
        ...overrides,
    });
}

function env(state, draws = []) {
    return {
        state,
        random: {
            rn2(bound) {
                draws.push(bound);
                return 99; // Ordinary objects do not satisfy 0% resistance.
            },
        },
    };
}

test('dogfood preserves poison and object-resistance evaluation order', () => {
    const state = stateForFood();
    const dog = pet(state);
    const draws = [];
    const poisoned = object(state, TRIPE_RATION, { opoisoned: true });

    assert.equal(dogfood(dog, poisoned, env(state, draws)), POISON);
    assert.deepEqual(draws, []);

    poisoned.opoisoned = false;
    assert.equal(dogfood(dog, poisoned, env(state, draws)), DOGFOOD);
    assert.deepEqual(
        draws,
        [100],
        'obj_resists(0, 95) draws even for an ordinary food object',
    );

    poisoned.oartifact = 1;
    poisoned.cursed = true;
    draws.length = 0;
    assert.equal(dogfood(dog, poisoned, {
        state,
        random: {
            rn2(bound) {
                draws.push(bound);
                return 0; // Artifact chance 95% succeeds.
            },
        },
    }), TABU);
    assert.deepEqual(draws, [100]);

    poisoned.oartifact = state.urole.questarti;
    poisoned.cursed = false;
    draws.length = 0;
    assert.equal(dogfood(dog, poisoned, env(state, draws)), APPORT);
    assert.deepEqual(
        draws,
        [],
        'quest artifacts return before the ordinary artifact RNG check',
    );
});

test('dogfood classifies carnivore and herbivore staple foods', () => {
    const state = stateForFood();
    const dog = pet(state);
    const pony = pet(state, PM_PONY);

    assert.equal(
        dogfood(dog, object(state, TRIPE_RATION), env(state)),
        DOGFOOD,
    );
    assert.equal(
        dogfood(pony, object(state, TRIPE_RATION), env(state)),
        MANFOOD,
    );
    assert.equal(
        dogfood(pony, object(state, APPLE), env(state)),
        DOGFOOD,
    );
    assert.equal(
        dogfood(dog, object(state, APPLE), env(state)),
        MANFOOD,
    );
});

test('draw-free dogfood classification exposes only post-resistance paths',
    () => {
        const state = stateForFood();
        const pony = pet(state, PM_PONY);
        const elfCorpse = object(state, CORPSE, {
            age: state.moves,
            // Human is a non-vegan corpse, so an herbivorous pony rejects it.
            corpsenm: PM_HUMAN,
        });
        const draws = [];

        assert.equal(
            dogfoodWithoutObjectResistanceDraw(
                pony,
                elfCorpse,
                env(state, draws),
            ),
            MANFOOD,
        );
        assert.deepEqual(
            draws,
            [],
            'preflight classification must not consume obj_resists RNG',
        );
    });

test('dogfood keeps stale-corpse exceptions and petrification ahead of diet',
    () => {
        const state = stateForFood();
        const dog = pet(state);
        const oldCorpse = object(state, CORPSE, {
            age: 40, // At move 100 this exceeds the source's 50-turn limit.
            corpsenm: PM_HUMAN,
        });
        assert.equal(dogfood(dog, oldCorpse, env(state)), POISON);

        oldCorpse.corpsenm = PM_LIZARD;
        assert.equal(dogfood(dog, oldCorpse, env(state)), CADAVER);

        oldCorpse.age = state.moves;
        oldCorpse.corpsenm = PM_COCKATRICE;
        assert.equal(dogfood(dog, oldCorpse, env(state)), POISON);
        assert.equal(dogfood(dog, oldCorpse, {
            ...env(state),
            resistsStone: () => true,
        }), CADAVER);
    });

test('dogfood handles starving cannibals and ordinary fetchable objects',
    () => {
        const state = stateForFood();
        const human = pet(state, PM_HUMAN);
        const humanCorpse = object(state, CORPSE, {
            age: state.moves,
            corpsenm: PM_HUMAN,
        });
        assert.equal(dogfood(human, humanCorpse, env(state)), TABU);

        human.mextra.edog.mhpmax_penalty = 2;
        assert.equal(dogfood(human, humanCorpse, env(state)), ACCFOOD);

        const dagger = object(state, DAGGER, { oclass: WEAPON_CLASS });
        assert.equal(dogfood(human, dagger, env(state)), APPORT);
        assert.equal(dagger.oclass, WEAPON_CLASS);
        assert.notEqual(dagger.oclass, FOOD_CLASS);
    });

test('dogfood never treats rock-class objects as fetchable', () => {
    const state = stateForFood();
    const dog = pet(state);
    const draws = [];
    const statue = object(state, STATUE);

    assert.equal(dogfood(dog, statue, env(state, draws)), UNDEF);
    assert.deepEqual(
        draws,
        [100],
        'obj_resists still runs before the ROCK_CLASS switch arm',
    );
});

test('dogfood handles dietless monsters and the killer-bee succession rule',
    () => {
        const state = stateForFood();
        const dietless = pet(state, PM_FLOATING_EYE);
        const apple = object(state, APPLE);

        assert.equal(dogfood(dietless, apple, env(state)), APPORT);
        apple.cursed = true;
        assert.equal(dogfood(dietless, apple, env(state)), UNDEF);

        const bee = pet(state, PM_KILLER_BEE);
        const jelly = object(state, LUMP_OF_ROYAL_JELLY);
        assert.equal(dogfood(bee, jelly, env(state)), DOGFOOD);

        state.level.monlist = {
            data: state.mons[PM_QUEEN_BEE],
            mhp: 1, // Positive HP is find_pmmonst()'s live-monster case.
            nmon: null,
        };
        assert.equal(dogfood(bee, jelly, env(state)), TABU);

        state.mvitals[PM_QUEEN_BEE] = { mvflags: G_GENOD };
        assert.equal(dogfood(bee, jelly, env(state)), DOGFOOD);
    });

test('dogfood preserves ghoul corpse and egg age preferences', () => {
    const state = stateForFood();
    const ghoul = pet(state, PM_GHOUL);
    const corpse = object(state, CORPSE, {
        age: 40, // Move 100 makes this older than the 50-turn cutoff.
        corpsenm: PM_HUMAN,
    });

    assert.equal(dogfood(ghoul, corpse, env(state)), DOGFOOD);
    corpse.age = state.moves;
    assert.equal(dogfood(ghoul, corpse, env(state)), POISON);

    ghoul.mextra.edog.mhpmax_penalty = 1;
    assert.equal(dogfood(ghoul, corpse, env(state)), ACCFOOD);

    const egg = object(state, EGG, {
        age: state.moves,
        corpsenm: PM_HUMAN,
    });
    assert.equal(dogfood(ghoul, egg, env(state)), ACCFOOD);
    ghoul.mextra.edog.mhpmax_penalty = 0;
    assert.equal(dogfood(ghoul, egg, env(state)), POISON);
    egg.age = state.moves - 401; // stale_egg() uses a strict 400-turn limit.
    assert.equal(dogfood(ghoul, egg, env(state)), CADAVER);
});

test('dogfood classifies source corpse hazards before ordinary diet', () => {
    const state = stateForFood();
    const dog = pet(state);

    const rider = object(state, CORPSE, {
        age: state.moves,
        corpsenm: PM_DEATH,
    });
    assert.equal(
        dogfood(dog, rider, env(state)),
        APPORT,
        'obj_resists protects an uncursed Rider corpse before dogfood checks it',
    );
    rider.cursed = true;
    assert.equal(dogfood(dog, rider, env(state)), TABU);

    const pyroliskEgg = object(state, EGG, {
        corpsenm: PM_PYROLISK,
    });
    assert.equal(dogfood(dog, pyroliskEgg, env(state)), POISON);
    const fireLovingDog = pet(state, PM_LITTLE_DOG, {
        data: {
            ...state.mons[PM_LITTLE_DOG],
            pmidx: PM_FIRE_ELEMENTAL,
        },
    });
    assert.equal(dogfood(fireLovingDog, pyroliskEgg, env(state)), CADAVER);

    const polymorphCorpse = object(state, CORPSE, {
        age: state.moves,
        corpsenm: PM_CHAMELEON,
    });
    assert.equal(dogfood(dog, polymorphCorpse, env(state)), MANFOOD);
    dog.mtame = 1; // Abused pets may consider polymorph food.
    assert.equal(dogfood(dog, polymorphCorpse, env(state)), CADAVER);

    const acidCorpse = object(state, CORPSE, {
        age: state.moves,
        corpsenm: PM_ACID_BLOB,
    });
    assert.equal(dogfood(dog, acidCorpse, env(state)), POISON);
});

test('dogfood keeps slime, blindness, banana, and vampire exceptions', () => {
    const state = stateForFood();
    const dog = pet(state);
    const slime = object(state, GLOB_OF_GREEN_SLIME);

    assert.equal(dogfood(dog, slime, env(state)), POISON);
    dog.mextra.edog.mhpmax_penalty = 1;
    assert.equal(dogfood(dog, slime, env(state)), ACCFOOD);
    dog.mextra.edog.mhpmax_penalty = 0;

    const slimeproofDog = pet(state, PM_LITTLE_DOG, {
        data: {
            ...state.mons[PM_LITTLE_DOG],
            pmidx: PM_GREEN_SLIME,
        },
    });
    assert.equal(dogfood(slimeproofDog, slime, env(state)), ACCFOOD);

    dog.mcansee = false;
    assert.equal(dogfood(dog, object(state, CARROT), env(state)), DOGFOOD);

    const pony = pet(state, PM_PONY);
    assert.equal(dogfood(pony, object(state, BANANA), env(state)), ACCFOOD);
    const yetiHerbivore = pet(state, PM_PONY, {
        data: {
            ...state.mons[PM_PONY],
            mlet: S_YETI,
        },
    });
    assert.equal(
        dogfood(yetiHerbivore, object(state, BANANA), env(state)),
        DOGFOOD,
    );

    const vampireDog = pet(state, PM_LITTLE_DOG, { cham: PM_VAMPIRE });
    assert.equal(
        dogfood(vampireDog, object(state, CLOVE_OF_GARLIC), env(state)),
        TABU,
    );
});

test('dogfood distinguishes default food and nonfood material branches',
    () => {
        const state = stateForFood();
        const dog = pet(state);
        const pony = pet(state, PM_PONY);

        assert.equal(dogfood(dog, object(state, ORANGE), env(state)), MANFOOD);
        assert.equal(
            dogfood(dog, object(state, CANDY_BAR), env(state)),
            ACCFOOD,
        );
        assert.equal(dogfood(pony, object(state, ORANGE), env(state)), ACCFOOD);
        assert.equal(
            dogfood(pony, object(state, CANDY_BAR), env(state)),
            MANFOOD,
        );

        assert.equal(
            dogfood(dog, object(state, AMULET_OF_STRANGULATION), env(state)),
            TABU,
        );
        assert.equal(
            dogfood(dog, object(state, RIN_SLOW_DIGESTION), env(state)),
            TABU,
        );
        const vampireDog = pet(state, PM_LITTLE_DOG, {
            cham: PM_VAMPIRE,
        });
        assert.equal(
            dogfood(vampireDog, object(state, SILVER_DAGGER), env(state)),
            TABU,
        );

        const cube = pet(state, PM_GELATINOUS_CUBE);
        assert.equal(
            dogfood(cube, object(state, LEATHER_ARMOR), env(state)),
            ACCFOOD,
        );

        const rustMonster = pet(state, PM_RUST_MONSTER);
        const dagger = object(state, DAGGER);
        assert.equal(dogfood(rustMonster, dagger, env(state)), DOGFOOD);
        dagger.oerodeproof = true;
        assert.equal(dogfood(rustMonster, dagger, env(state)), ACCFOOD);
        assert.equal(
            dogfood(
                rustMonster,
                object(state, ELVEN_MITHRIL_COAT),
                env(state),
            ),
            APPORT,
        );

        const rockMole = pet(state, PM_ROCK_MOLE);
        assert.equal(
            dogfood(
                rockMole,
                object(state, ELVEN_MITHRIL_COAT),
                env(state),
            ),
            ACCFOOD,
        );

        const ball = object(state, HEAVY_IRON_BALL);
        assert.equal(dogfood(dog, ball, env(state)), UNDEF);
        const cursedDagger = object(state, DAGGER, { cursed: true });
        assert.equal(dogfood(dog, cursedDagger, env(state)), UNDEF);
    });

test('dogfood lets fungus eat old corpses', () => {
    const state = stateForFood();
    const fungus = pet(state, PM_LITTLE_DOG, {
        data: {
            ...state.mons[PM_LITTLE_DOG],
            mflags1: state.mons[PM_LITTLE_DOG].mflags1 | M1_CARNIVORE,
            mlet: S_FUNGUS,
        },
    });
    const oldCorpse = object(state, CORPSE, {
        age: 40, // Move 100 makes this older than the 50-turn cutoff.
        corpsenm: PM_HUMAN,
    });

    assert.equal(dogfood(fungus, oldCorpse, env(state)), CADAVER);
});
