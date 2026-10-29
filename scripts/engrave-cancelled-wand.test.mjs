import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { doengrave } from '../js/engrave.js';
import { newObject } from '../js/obj.js';
import { The, xnameFresh } from '../js/objnam.js';
import { WAN_NOTHING, WAND_CLASS } from '../js/objects.js';
import { BLINDED, OBJ_INVENT } from '../js/const.js';

// C engrave.c:810-812,1087-1098: a cancelled wand is consumed before the
// text prompt. The message changes with blindness, but the dust turn does not.
for (const blind of [false, true]) {
    test(`engraving with a cancelled wand: blind=${blind}`, async () => {
        await runSegment({ seed: 880276, datetime: '20320405060710',
            nethackrc: 'OPTIONS=name:EngrAudit,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',
            moves: ' ' });
        if (blind) game.u.uprops[BLINDED].intrinsic = 20;
        const wand = newObject({ otyp: WAN_NOTHING, oclass: WAND_CLASS,
            spe: -1, quan: 1, where: OBJ_INVENT, invlet: 'a',
            known: true, dknown: true });
        wand.nobj = game.invent;
        game.invent = wand;
        const name = The(xnameFresh(wand, game), game);
        const lines = [];
        const result = await doengrave(game, {
            getObject: async () => wand,
            message: async line => lines.push(line),
            random: { rn2: () => assert.fail('cancelled wand must not draw') },
            cantWield: () => false,
            checkCapacity: async () => false,
        });
        assert.equal(result, 1);
        assert.equal(lines[0], `${name} ${blind ? '' : 'glows violently, then '}turns to dust.`);
        assert.equal(game.invent === wand, false);
    });
}
