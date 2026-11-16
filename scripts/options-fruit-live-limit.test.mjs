// C ref: options.c optfn_fruit() (1726-1745).  When the 'O' menu names a new
// fruit while 100 named fruits exist and one has been made since the last
// naming, C refuses with config_error_add(), which outside a configuration
// read prints through cfgfiles.c config_erradd()'s pline() and wait_synch()
// arm (1557-1563), and answers optn_ok with svp.pl_fruit unchanged.  Reaching
// it in play takes a hundred wish-and-rename rounds, so the test builds the
// fruit chain directly; the recordings of
// recipes/options.c/handler_menu_colors-* and handler_msgtype-* cover the
// same pline() arm through test_regex_pattern().
import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { parseoptions } from '../js/options.js';

test('a 101st live fruit name is refused with a pline, not a frame error', async () => {
    // Any start works; the option string only fixes the current fruit name.
    await runSegment({
        seed: 5512, datetime: '20280304120000',
        nethackrc: 'OPTIONS=name:Probe,role:Healer,race:gnome,gender:male,'
            + 'align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,'
            + 'fruit:fig\n',
        moves: '\n',
    });
    assert.equal(game.svp.pl_fruit, 'fig');
    // fid 1 is "fig"; fids 2..100 make fruit_from_name()'s highest fid 100,
    // the first count optfn_fruit()'s `fnum >= 100` test refuses.
    let head = game.gf.ffruit;
    for (let fid = 2; fid <= 100; ++fid)
        head = { fname: `fruit${fid}`, fid, nextf: head };
    game.gf.ffruit = head;
    // made_fruit TRUE keeps forig null, so nothing is replaced in place.
    game.flags.made_fruit = true;

    // doset() hands parseoptions() "fruit:" plus the typed name; "mango" is
    // not among the hundred, so fruit_from_name() finds nothing.
    // optfn_fruit() answers optn_ok, which parseoptions() turns into TRUE.
    const answer = await parseoptions(game, 'fruit:mango', false, false);
    assert.equal(answer, true);
    assert.equal(game.svp.pl_fruit, 'fig');
    assert.equal(
        game.nhDisplay.serialize().split('\n')[0],
        'Doing that so many times isn\'t very fruitful.--More--',
    );
});
