import assert from 'node:assert/strict';
import test from 'node:test';

import {
    answer_player_selection_confirmation,
    answer_initial_player_selection,
    build_plselection_prompt,
    continue_player_selection,
    prepare_player_selection,
    root_plselection_prompt,
    RS_ROLE,
} from '../js/player_selection.js';
import {
    ROLE_NONE,
    ROLE_RANDOM,
    str2align,
    str2gend,
    str2race,
    str2role,
} from '../js/roles.js';

function selectionState(role, race, gender, alignment, randomall = false) {
    return {
        flags: {
            initrole: role,
            initrace: race,
            initgend: gender,
            initalign: alignment,
            randomall,
        },
    };
}

function scriptedRandom(choices) {
    const remaining = [...choices];
    const bounds = [];
    const random = (bound) => {
        bounds.push(bound);
        assert.ok(remaining.length, `unexpected random(${bound})`);
        const result = remaining.shift();
        assert.ok(result >= 0 && result < bound,
            `scripted result ${result} is outside random(${bound})`);
        return result;
    };
    random.bounds = bounds;
    random.done = () => assert.deepEqual(remaining, []);
    return random;
}

test('root and full prompts preserve missing-facet order and punctuation', () => {
    assert.equal(
        root_plselection_prompt(
            ROLE_NONE, ROLE_NONE, ROLE_NONE, ROLE_NONE,
        ),
        'character',
    );
    assert.equal(
        build_plselection_prompt(
            ROLE_NONE, ROLE_NONE, ROLE_NONE, ROLE_NONE,
        ),
        "Shall I pick character's race, role, gender and alignment for you? [ynaq] ",
    );
});

test('the initial question repeats invalid input and treats escape as quit', () => {
    const state = selectionState(
        ROLE_NONE, ROLE_NONE, ROLE_NONE, ROLE_NONE,
    );
    const noRandom = (bound) => {
        assert.fail(`initial input handling called random(${bound})`);
    };
    const prepared = prepare_player_selection(state, noRandom);
    assert.strictEqual(
        answer_initial_player_selection(state, prepared, 'x', noRandom),
        prepared,
    );
    assert.deepEqual(
        answer_initial_player_selection(state, prepared, 0, noRandom),
        { ...prepared, status: 'quit', pick4u: 'q' },
    );
});

test('partial and forced configurations use source prompt descriptions', () => {
    const samurai = str2role('Samurai');
    assert.equal(
        build_plselection_prompt(
            samurai, ROLE_NONE, ROLE_NONE, ROLE_NONE,
        ),
        "Shall I pick your Samurai's race, gender and alignment for you? [ynaq] ",
    );

    const state = selectionState(
        samurai, ROLE_NONE, ROLE_NONE, ROLE_NONE,
    );
    // Samurai forces one human race and one lawful alignment; each rigid
    // selection still makes the source's rn2(1) call.
    const random = scriptedRandom([0, 0]);
    const prepared = prepare_player_selection(state, random);
    assert.deepEqual(random.bounds, [1, 1]);
    assert.equal(prepared.status, 'prompt');
    assert.equal(
        prepared.prompt,
        "Shall I pick your lawful human Samurai's gender for you? [ynaq] ",
    );
    random.done();
});

test('gendered role names preserve the Priestess possessive exception', () => {
    const priest = str2role('Priest');
    const human = str2race('human');
    const lawful = str2align('lawful');
    assert.equal(
        root_plselection_prompt(priest, human, ROLE_NONE, lawful),
        'lawful human Priest/Priestess',
    );
    assert.equal(
        build_plselection_prompt(priest, human, ROLE_NONE, lawful),
        "Shall I pick your lawful human Priest/Priestess's gender for you? [ynaq] ",
    );
});

test('incompatible facets retain upstream prompt and non-menu repair quirks', () => {
    const knight = str2role('Knight');
    const dwarf = str2race('dwarf');
    const male = str2gend('male');
    const neutral = str2align('neutral');
    assert.equal(
        build_plselection_prompt(knight, dwarf, male, neutral),
        "Shall I pick your male Knight's race for you? [ynaq] ",
    );

    const state = selectionState(knight, dwarf, male, neutral);
    const noRandom = (bound) => {
        assert.fail(`incompatible explicit repair called random(${bound})`);
    };
    const prepared = prepare_player_selection(state, noRandom);
    assert.equal(prepared.status, 'complete');
    assert.deepEqual(
        [state.flags.initrole, state.flags.initrace,
            state.flags.initgend, state.flags.initalign],
        [knight, str2race('human'), male, str2align('lawful')],
    );
});

test('automatic y picks role, race, gender, then alignment', () => {
    const state = selectionState(
        ROLE_NONE, ROLE_NONE, ROLE_NONE, ROLE_NONE,
    );
    // Select Rogue from 13 roles, orc from its two races, female from its two
    // genders, then its sole chaotic alignment.
    const random = scriptedRandom([7, 1, 1, 0]);
    const prepared = prepare_player_selection(state, random);
    assert.equal(prepared.status, 'prompt');
    assert.deepEqual(random.bounds, []);

    const selected = answer_initial_player_selection(
        state, prepared, 'y', random,
    );
    assert.equal(selected.status, 'confirmation');
    assert.deepEqual(random.bounds, [13, 2, 2, 1]);
    assert.deepEqual(
        [state.flags.initrole, state.flags.initrace,
            state.flags.initgend, state.flags.initalign],
        [str2role('Rogue'), str2race('orc'),
            str2gend('female'), str2align('chaotic')],
    );
    random.done();
});

test('automatic a uses the same draw order and skips confirmation', () => {
    const state = selectionState(
        ROLE_NONE, ROLE_NONE, ROLE_NONE, ROLE_NONE,
    );
    // Select Knight, its sole race, female from two genders, and its sole
    // alignment. The order differs from rigid configured-random selection.
    const random = scriptedRandom([4, 0, 1, 0]);
    const prepared = prepare_player_selection(state, random);
    const selected = answer_initial_player_selection(
        state, prepared, 'a', random,
    );
    assert.equal(selected.status, 'complete');
    assert.deepEqual(random.bounds, [13, 1, 2, 1]);
    random.done();
});

test('configured random facets resolve in rigid role-race-align-gender order', () => {
    const state = selectionState(
        ROLE_RANDOM, ROLE_RANDOM, ROLE_RANDOM, ROLE_RANDOM,
    );
    // Select Knight, then its one human race and lawful alignment, followed
    // by female from its two valid genders.
    const random = scriptedRandom([4, 0, 0, 1]);
    const prepared = prepare_player_selection(state, random);
    assert.equal(prepared.status, 'complete');
    assert.equal(prepared.picksomething, false);
    assert.deepEqual(random.bounds, [13, 1, 1, 2]);
    random.done();
});

test('manual Random uses the facet picker before continuing manual menus', () => {
    const state = selectionState(
        ROLE_NONE, ROLE_NONE, ROLE_NONE, ROLE_NONE,
    );
    const random = scriptedRandom([9]);
    let context = prepare_player_selection(state, random);
    context = answer_initial_player_selection(
        state, context, 'n', random,
    );
    context = continue_player_selection(
        state, context, { kind: 'random' }, random,
    );

    assert.equal(state.flags.initrole, str2role('Samurai'));
    assert.equal(state.flags.initrace, str2race('human'));
    assert.equal(context.status, 'menu');
    assert.deepEqual(random.bounds, [13]);
    random.done();
});

test('a fully forced missing facet goes directly to confirmation', () => {
    const state = selectionState(
        str2role('Valkyrie'),
        str2race('human'),
        ROLE_NONE,
        str2align('lawful'),
    );
    // Valkyrie has one valid gender, but PICK_RIGID still calls rn2(1).
    const random = scriptedRandom([0]);
    const prepared = prepare_player_selection(state, random);
    assert.equal(prepared.status, 'confirmation');
    assert.equal(state.flags.initgend, str2gend('female'));
    assert.deepEqual(random.bounds, [1]);
    random.done();
});

test('fully specified compatible configurations bypass input and RNG', () => {
    const state = selectionState(
        str2role('Wizard'),
        str2race('elf'),
        str2gend('female'),
        str2align('chaotic'),
    );
    const prepared = prepare_player_selection(state, (bound) => {
        assert.fail(`fully specified selection called random(${bound})`);
    });
    assert.equal(prepared.status, 'complete');
    assert.equal(prepared.picksomething, false);
});

test('confirmation no restarts manually while quit leaves facets intact', () => {
    const state = selectionState(
        ROLE_NONE, ROLE_NONE, ROLE_NONE, ROLE_NONE,
    );
    const random = scriptedRandom([12, 0, 0, 0]);
    const prepared = prepare_player_selection(state, random);
    const confirmation = answer_initial_player_selection(
        state, prepared, 'y', random,
    );
    assert.equal(confirmation.status, 'confirmation');
    const selectedBeforeQuit = { ...state.flags };
    assert.equal(
        answer_player_selection_confirmation(
            state, confirmation, 'q', random,
        ).status,
        'quit',
    );
    assert.deepEqual(state.flags, selectedBeforeQuit);

    const restarted = answer_player_selection_confirmation(
        state, confirmation, 'n', random,
    );
    assert.equal(restarted.status, 'menu');
    assert.equal(restarted.aspect, RS_ROLE);
    assert.deepEqual(
        [state.flags.initrole, state.flags.initrace,
            state.flags.initgend, state.flags.initalign],
        [ROLE_NONE, ROLE_NONE, ROLE_NONE, ROLE_NONE],
    );
    // The restarted flow accepts an ordinary manual role without returning
    // to the initial "Shall I pick" question.
    assert.equal(
        continue_player_selection(
            state,
            restarted,
            { kind: 'value', value: str2role('Wizard') },
            random,
        ).status,
        'menu',
    );
    random.done();
});
