import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_ORCUS, S_DEMON } from '../js/monsters.js';
import { bribe, demon_talk } from '../js/minion.js';

const C_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/minion.c', import.meta.url),
    'utf8',
);
const RECIPE = JSON.parse(readFileSync(
    new URL('../recipes/priest.c/generated-temple-movement.session.json',
        import.meta.url),
));

function bribeSource() {
    const start = C_SOURCE.indexOf('long\nbribe(struct monst *mtmp, const char *prompt)');
    const end = C_SOURCE.indexOf('\nint\ndprince(', start);
    assert.ok(start >= 0 && end > start, 'minion.c bribe source range');
    return C_SOURCE.slice(start, end);
}

test('minion bribe parses signed C longs and keeps refusal branches ordered',
    async () => {
        const source = bribeSource();
        assert.match(source, /sscanf\(buf, "%ld", &offer\) != 1/u);
        const negative = source.indexOf('if (offer < 0L)');
        const zero = source.indexOf('else if (offer == 0L)');
        const all = source.indexOf('else if (offer >= umoney)');
        const transfer = source.indexOf('(void) money2mon(mtmp, offer)');
        assert.ok(negative >= 0 && negative < zero && zero < all && all < transfer);

        await runSegment(RECIPE.segments[0]);
        const demon = {
            data: game.mons[PM_ORCUS],
            mextra: {},
            m_id: 0x7fffffff,
            minvent: null,
        };
        const lines = [];
        let entered = '-7';
        const shortChange = await bribe(demon, 'How much?', game, {
            getlin: async () => entered,
            message: async (line) => lines.push(line),
        });
        assert.equal(shortChange, 0);
        assert.match(lines.at(-1), /try to shortchange .* but fumble\./u);

        entered = 'not an amount';
        const refused = await bribe(demon, 'How much?', game, {
            getlin: async () => entered,
            message: async (line) => lines.push(line),
        });
        assert.equal(refused, 0);
        assert.equal(lines.at(-1), 'You refuse.');
    });

test('demon-form greeting uses C pline speaker and sentence', async () => {
    assert.match(
        C_SOURCE,
        /pline\("%s says, \\"Good hunting, %s\.\\""/u,
    );
    await runSegment(RECIPE.segments[0]);

    const priorHeroData = game.youmonst.data;
    const priorLevelFlags = game.level.flags;
    const priorMulti = game.multi;
    const priorGender = game.flags.female;
    const lines = [];
    game.youmonst.data = { ...priorHeroData, mlet: S_DEMON };
    game.level.flags = {
        ...priorLevelFlags,
        stasis_until: (game.moves ?? 0) + 100,
    };
    game.multi = -1;
    game.flags.female = true;

    try {
        const result = await demon_talk({
            data: game.mons[PM_ORCUS],
            mx: game.u.ux + 1,
            my: game.u.uy,
            m_id: 0x7fffffff,
            minvis: 0,
            perminvis: 0,
            mstrategy: 0,
            mpeaceful: 1,
            mtame: 0,
        }, game, {
            message: async (line) => lines.push(line),
        });

        assert.equal(result, 1);
        assert.ok(lines.some(
            (line) => line.endsWith(' says, "Good hunting, Sister."'),
        ));
    } finally {
        game.youmonst.data = priorHeroData;
        game.level.flags = priorLevelFlags;
        game.multi = priorMulti;
        game.flags.female = priorGender;
    }
});
