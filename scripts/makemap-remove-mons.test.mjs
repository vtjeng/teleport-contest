import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { G_EXTINCT, MON_MIGRATING } from '../js/const.js';
import { game, resetGame } from '../js/gstate.js';
import { PM_WIZARD, G_UNIQ } from '../js/monsters.js';
import { makemap_remove_mons } from '../js/wizcmds.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/wizcmds.c', 'utf8');
const JS_SOURCE = readFileSync('js/wizcmds.js', 'utf8');
const CMD_SOURCE = readFileSync('js/cmd.js', 'utf8');

function cBody(name, signature) {
    const start = C_SOURCE.indexOf(`\n${name}(${signature})`);
    assert.ok(start >= 0, `${name} exists in wizcmds.c`);
    const end = C_SOURCE.indexOf('\n}', start);
    assert.ok(end > start, `${name} has a closing brace in wizcmds.c`);
    return C_SOURCE.slice(start, end);
}

test('makemap removal follows wizcmds.c order and the cmd.c pre caller', () => {
    const unmake = cBody('makemap_unmakemon', 'struct monst *mtmp, boolean migratory');
    assert.match(unmake, /mvflags &= ~G_EXTINCT;[\s\S]*?born--;/u);
    assert.match(unmake, /if \(mtmp->isgd\)[\s\S]*else if \(DEADMONSTER\(mtmp\)\)/u);
    assert.match(unmake, /MON_OFFMAP[\s\S]*MON_MIGRATING \| MON_LIMBO \| MON_ENDGAME_MIGR[\s\S]*mongone\(mtmp\);/u);

    const remove = cBody('makemap_remove_mons', 'void');
    assert.match(remove, /keepdogs\(TRUE\);[\s\S]*for \(mtmp = fmon;[\s\S]*makemap_unmakemon\(mtmp, FALSE\);/u);
    assert.match(remove, /gm\.migrating_mons[\s\S]*makemap_unmakemon\(mtmp, TRUE\);[\s\S]*dmonsfree\(\);/u);

    const jsRemoveStart = JS_SOURCE.indexOf('export async function makemap_remove_mons(');
    const jsRemoveEnd = JS_SOURCE.indexOf('\n}', jsRemoveStart);
    assert.ok(jsRemoveStart >= 0 && jsRemoveEnd > jsRemoveStart);
    const jsRemove = JS_SOURCE.slice(jsRemoveStart, jsRemoveEnd);
    assert.match(jsRemove, /note_unported\('dog\.c keepdogs'\);[\s\S]*for \(let monster = state\.level\.monlist;[\s\S]*dmonsfree\(state\);/u);
    assert.match(CMD_SOURCE, /if \(pre\) \{\s*await makemap_remove_mons\(state\);/u);
    assert.doesNotMatch(CMD_SOURCE, /note_unported\('wizcmds\.c makemap_remove_mons'\)/u);
});

test('makemap removal resets a dead unique resident before dmonsfree', async () => {
    resetGame();
    const currentLevel = { dnum: 0, dlevel: 1 }; // The fixture home level exercises the matching ESHK level check.
    const vital = { mvflags: G_EXTINCT, born: 1 }; // One extant unique birth is undone by the source function.
    const resident = {
        data: { pmidx: PM_WIZARD, geno: G_UNIQ }, // A unique species reaches G_EXTINCT reset.
        mhp: 0, // A dead migrating resident returns after vital bookkeeping and before mongone().
        isshk: true,
        isgd: false,
        mextra: { eshk: { shoplevel: currentLevel } },
        mstate: MON_MIGRATING,
        nmon: null,
    };
    game.u = { uz: currentLevel };
    game.level = { monlist: null };
    game.gm = { migrating_mons: resident };
    game.iflags = { purge_monsters: 0 };
    game.svm = { mvitals: Object.assign([], { [PM_WIZARD]: vital }) };

    await makemap_remove_mons(game);

    assert.equal(vital.mvflags & G_EXTINCT, 0);
    assert.equal(vital.born, 0);
    assert.equal(game.gm.migrating_mons, null);
    assert.equal(game.level.monlist, null);
    assert.equal(game.unported.has('dog.c keepdogs'), true);
});
