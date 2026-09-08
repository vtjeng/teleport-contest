import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    INVIS,
    MS_BARK,
    MS_BUZZ,
    MS_CHIRP,
    MS_GROWL,
    MS_GRUNT,
    MS_HISS,
    MS_HUMANOID,
    MS_MUMBLE,
    MS_ORC,
    MS_ROAR,
    MS_SQAWK,
    MS_SHRIEK,
    MS_SILENT,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { GLYPH_MON_MALE_OFF } from '../js/glyph_offsets.js';
import { place_monster } from '../js/monst.js';
import {
    ARM_HELM,
    ARMOR_CLASS,
    IRON,
} from '../js/objects.js';
import {
    add_sound_mapping,
    beg,
    choose_soundlib,
    cry_sound,
    maybe_gasp,
    maybe_play_sound,
    mon_is_gecko,
    nosound_achievement,
    nosound_exit_nhsound,
    nosound_hero_playnotes,
    nosound_init_nhsound,
    nosound_play_usersound,
    nosound_soundeffect,
    play_sound_for_message,
    release_sound_mappings,
    responsive_mon_at,
    sound_matches_message,
    tiphat,
} from '../js/sounds.js';
import {
    M1_CARNIVORE,
    M1_NOEYES,
    M1_SEE_INVIS,
    PM_GECKO,
    PM_LONG_WORM,
    S_EEL,
} from '../js/monsters.js';

const SOUNDS_C = readFileSync(
    new URL('../nethack-c/upstream/src/sounds.c', import.meta.url), 'utf8',
).split('\n');

function minimalState() {
    const uprops = [];
    uprops[INVIS] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    return {
        flags: {},
        level: new GameMap(),
        u: { ux: 4, uy: 5, dx: 0, dy: 0, dz: 0, uprops },
    };
}

test('cry_sound pins every sounds.c switch result without drawing', () => {
    assert.match(SOUNDS_C[616], /cry_sound\(struct monst \*mtmp\)/u);
    const cry = (msound, mlet = 0) => cry_sound({ data: { msound, mlet } });
    assert.equal(cry(MS_SILENT), 'chitter');
    assert.equal(cry(MS_SILENT, S_EEL), 'gurgle');
    assert.equal(cry(MS_HISS), 'hiss');
    assert.equal(cry(MS_ROAR), 'growl');
    assert.equal(cry(MS_GROWL), 'growl');
    assert.equal(cry(MS_CHIRP), 'chirp');
    assert.equal(cry(MS_BUZZ), 'buzz');
    assert.equal(cry(MS_SQAWK), 'screech');
    assert.equal(cry(MS_GRUNT), 'grunt');
    assert.equal(cry(MS_MUMBLE), 'mumble');
});

test('maybe_gasp follows the source speech families and draw boundary', () => {
    const state = { youmonst: { data: { mlet: 7 } }, mons: [], urole: {} };
    const bounds = [];
    const random = { rn2: (bound) => { bounds.push(bound); return 4; } };
    assert.equal(maybe_gasp({ data: { msound: MS_HUMANOID } }, state, random),
        'Why?');
    assert.deepEqual(bounds, [5]);

    bounds.length = 0;
    assert.equal(maybe_gasp({ data: { msound: MS_ORC, mlet: 9 } }, state, random),
        null);
    assert.deepEqual(bounds, []);
    assert.equal(maybe_gasp({ data: { msound: MS_ORC, mlet: 7 } }, state, random),
        'Why?');
});

test('beg preserves animal, speaking, and in-between sound branches', async () => {
    const calls = [];
    const animal = {
        mcanmove: true,
        data: { msound: MS_BARK, mflags1: M1_CARNIVORE },
    };
    await beg(animal, {
        state: {},
        domonnoise(monster) { calls.push(['noise', monster]); },
    });
    assert.deepEqual(calls, [['noise', animal]]);

    const speaker = {
        mx: 2,
        my: 3,
        mcanmove: true,
        data: { msound: MS_HUMANOID, mflags1: M1_CARNIVORE },
    };
    await beg(speaker, {
        state: {},
        canSpotMonster: () => false,
        mapInvisible: (x, y) => calls.push(['invisible', x, y]),
        message: (line) => calls.push(['message', line]),
    });
    assert.deepEqual(calls.slice(1), [
        ['invisible', 2, 3],
        ['message', '"I\'m hungry."'],
    ]);

    const between = {
        mcanmove: true,
        data: { msound: MS_SHRIEK, mflags1: M1_CARNIVORE },
    };
    await beg(between, {
        state: {},
        canSpotMonster: () => false,
        message: () => { throw new Error('unseen monster must not print'); },
    });
});

test('responsive_mon_at rejects blindness, invisibility, and worm tails', () => {
    const state = minimalState();
    const species = { mflags1: 0 };
    const monster = {
        mx: 5, my: 5, mhp: 3, mcanmove: true, mcansee: true, data: species,
    };
    place_monster(monster, 5, 5, state);
    assert.equal(responsive_mon_at(5, 5, state), monster);

    monster.data = { mflags1: M1_NOEYES };
    assert.equal(responsive_mon_at(5, 5, state), null);
    monster.data = species;
    state.u.uprops[INVIS].intrinsic = 1;
    assert.equal(responsive_mon_at(5, 5, state), null);
    monster.data = { mflags1: M1_SEE_INVIS };
    assert.equal(responsive_mon_at(5, 5, state), monster);
    monster.mx = 6;
    assert.equal(responsive_mon_at(5, 5, state), null);
});

test('mon_is_gecko prefers species identity and excludes long-worm tails', () => {
    const state = minimalState();
    state.mons = [];
    state.mons[PM_GECKO] = { pmidx: PM_GECKO };
    state.mons[PM_LONG_WORM] = { pmidx: PM_LONG_WORM };
    assert.equal(mon_is_gecko({ data: state.mons[PM_GECKO] }, state), true);

    state.level.locations[5][5].disp_glyph = {
        glyph: GLYPH_MON_MALE_OFF + PM_GECKO,
    };
    assert.equal(mon_is_gecko({
        mx: 5, my: 5, data: state.mons[PM_LONG_WORM],
    }, state), false);
    assert.equal(mon_is_gecko({
        mx: 5, my: 5, data: { pmidx: 1 },
    }, state), true);
});

test('tiphat preserves the no-helmet, curse, cancel, and self-direction results',
    async () => {
        const state = minimalState();
        assert.equal(await tiphat(state), 0);

        state.objects = [{ oc_armcat: ARM_HELM, oc_material: IRON }];
        state.uarmh = { bknown: false, cursed: true, oclass: ARMOR_CLASS, otyp: 0 };
        assert.equal(await tiphat(state, { cursed: async () => true }), 1);

        state.uarmh.cursed = false;
        state.uarmh.bknown = true;
        assert.equal(await tiphat(state, {
            cursed: async () => false,
            getdir: async () => false,
        }), 0);

        const messages = [];
        assert.equal(await tiphat(state, {
            cursed: async () => false,
            getdir: async () => true,
            message: (line) => messages.push(line),
        }), 1);
        assert.deepEqual(messages, [
            'You briefly doff your helm.',
            "The lout here doesn't acknowledge you...",
        ]);
    });

test('user sound mappings are newest-first and call both source entry points', () => {
    const state = {};
    assert.equal(add_sound_mapping('MESG "hello" "first.wav" 40 3', state), 1);
    assert.equal(add_sound_mapping(
        'MESG hide "hell.*" "second.wav" 70 4',
        state,
        { msgtypeParseAdd: (line) => { state.msgtype = line; } },
    ), 1);
    assert.equal(state.msgtype, 'hide "hell.*"');
    assert.equal(sound_matches_message('hello', state).filename, './second.wav');

    const played = [];
    state.soundprocs = {
        sound_play_usersound: (...args) => played.push(args),
    };
    play_sound_for_message('hello', state);
    maybe_play_sound('hello', state);
    assert.deepEqual(played, [
        ['./second.wav', 70, 4],
        ['./second.wav', 70, 4],
    ]);
    release_sound_mappings(state);
    assert.equal(sound_matches_message('hello', state), null);
    assert.equal(state.sounddir, null);
});

test('sound mapping errors, choose_soundlib, and no-sound stubs are pinned', () => {
    const errors = [];
    const state = { gc: {} };
    assert.equal(add_sound_mapping('invalid', state, {
        rawPrint: (line) => errors.push(line),
    }), 0);
    assert.deepEqual(errors, ['syntax error in SOUND']);

    choose_soundlib('x'.repeat(60), state, {
        configErrorAdd: (line) => errors.push(line),
    });
    assert.equal(state.gc.chosen_soundlib, 0);
    assert.equal(errors[1],
        `Soundlib type ${'x'.repeat(49)} not recognized.  The only choice is: nosound`);

    assert.equal(nosound_init_nhsound(), undefined);
    assert.equal(nosound_exit_nhsound('done'), undefined);
    assert.equal(nosound_achievement(1, 2, 3), undefined);
    assert.equal(nosound_soundeffect(1, 2), undefined);
    assert.equal(nosound_hero_playnotes(1, 'C', 2), undefined);
    assert.equal(nosound_play_usersound('x', 1, 2), undefined);
});
