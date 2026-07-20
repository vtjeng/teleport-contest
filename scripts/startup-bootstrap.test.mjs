import assert from 'node:assert/strict';
import test from 'node:test';

import { newgame_pre_mklev } from '../js/allmain.js';
import { game, resetGame } from '../js/gstate.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import {
    str2align,
    str2gend,
    str2race,
    str2role,
} from '../js/roles.js';

function initialize(seed, role, race, gender, alignment) {
    resetGame();
    initRng(seed);
    enableRngLog();
    game.fixedDatetime = '20260720123456';
    game.recorderIsDst = true;
    game.moves = 0;
    game.plname = 'FreshBootstrap';
    game.flags = {
        initrole: str2role(role),
        initrace: str2race(race),
        initgend: str2gend(gender),
        initalign: str2align(alignment),
        female: gender.toLowerCase().startsWith('f'),
        bones: true,
    };
    game.u = { uroleplay: {} };
    game.context = { move: 0 };
    newgame_pre_mklev(game);
    return { state: game, log: [...getRngLog()] };
}

test('pre-mklev startup composes every source initializer in order', () => {
    const cases = [
        {
            // Healer adds rnd(4) initial Pw and the handedness draw after the
            // 199 object and 100 dungeon calls; Lua adds the final two calls.
            config: [271828, 'Healer', 'human', 'male', 'neutral'],
            calls: 303,
            hp: 13,
            pw: 3,
            record: 10,
        },
        {
            // Wizard's genderless quest nemesis and rnd(3) initial Pw add two
            // calls before handedness; Lua still owns the final pair.
            config: [271828, 'Wizard', 'elf', 'female', 'chaotic'],
            calls: 304,
            hp: 11,
            pw: 9,
            record: 0,
        },
        {
            // Valkyrie has neither role-init nor initial-Pw randomness, so its
            // handedness draw is call 300 and the Lua shuffle ends at 302.
            config: [161803, 'Valkyrie', 'dwarf', 'female', 'lawful'],
            calls: 302,
            hp: 18,
            pw: 1,
            record: 0,
        },
    ];

    for (const expected of cases) {
        const { state, log } = initialize(...expected.config);
        assert.equal(log.length, expected.calls, expected.config.join('/'));
        assert.match(log.at(-2), /^rn2\(3\)=/u);
        assert.match(log.at(-1), /^rn2\(2\)=/u);
        assert.deepEqual(
            [state.u.uhp, state.u.uen, state.u.ualign.record],
            [expected.hp, expected.pw, expected.record],
            expected.config.join('/'),
        );
        assert.equal(state.moves, 0);
        assert.equal(state.dungeons[0].dname, 'The Dungeons of Doom');
        assert.equal(state.artilist.length, 35);
        assert.deepEqual(
            [...state.splev_align].sort((left, right) => left - right),
            [-1, 0, 1],
        );
    }
});

test('seed 8000 reaches mklev without the deleted replay scaffold', () => {
    const { state, log } = initialize(
        8000, 'Tourist', 'human', 'female', 'neutral',
    );

    // This is the former scaffold boundary: 199 object calls, 100 dungeon
    // calls, handedness, then the two Lua alignment-shuffle calls.
    assert.equal(log.length, 302);
    assert.deepEqual(log.slice(-3), [
        'rn2(10)=0',
        'rn2(3)=2',
        'rn2(2)=1',
    ]);
    assert.equal(state.urole.filecode, 'Tou');
    assert.equal(state.urace.filecode, 'Hum');
    assert.equal(state.flags.female, true);
});
