import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

test('apply flips through the Healer starter book and reports source ink state',
    async () => {
        // u_init.c gives Healers the spellbook of healing in slot i. The final
        // space dismisses flip_through_book()'s preceding page message so the
        // source faded-ink line is the final displayed message.
        await runSegment({
            seed: 71035027,
            datetime: '20281030111626',
            nethackrc: [
                'OPTIONS=name:C34BookTest,role:Healer,race:human,gender:female,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,!autopickup,time,showexp',
                '',
            ].join('\n'),
            moves: '.ai ',
        });

        const screen = game.nhDisplay.grid.flat()
            .map(({ ch }) => ch).join('');
        assert.match(screen,
            /The magical ink in this spellbook is fresh\./u);
    });
