// C's pline.c impossible() prints its diagnostic and then "Program in
// disorder!" and "Please report these messages to devteam@nethack.org.". A
// port function that reaches a C impossible() call makes the call: an async
// function awaits js/pline.js impossible(), a synchronous one queues the
// report with js/source_steps.js sync_impossible(), and a step generator
// yields an ImpossibleCall. Until 2026-11-22 most sites recorded
// note_unported('pline.c impossible') instead and printed nothing, which a
// game reached through objnam.c an() (recipes/objnam.c/an-empty-killer-name-*).
//
// This check fails when such a marker appears anywhere but the sites listed
// below, or when a listed site loses its marker: remove its entry then.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { parse } from 'acorn';

const JS_DIR = new URL('../js/', import.meta.url);

// Each remaining marker as 'file function', with why it does not call
// impossible().
const REMAINING = new Map([
    ['ball.js unplacebc_core', 'ball.c unplacebc_core() has no impossible(): '
        + 'the marker stands for a missing ball or chain, which C dereferences'],
    ['eat.js adj_victual_nutrition', 'eat.c:344 is an assert(), whose pline.c '
        + 'nhassert_failed() report names the C file and line'],
    ['mkmaze.js restore_waterlevel', 'mkmaze.c:1786 clears '
        + 'program_state.something_worth_saving around the call; a queued '
        + 'report prints after the flag is set again'],
    ['shk.js shop_keeper', 'shk.c:1065 formats svr.rooms[].rtype, the '
        + 'monster number and the given name; the fields were not traced'],
    ['shknam.js shkinit', 'shknam.c:644-652 follows the report with room and '
        + 'door plines that are not ported'],
    ['source_steps.js gap_impossible', 'the onImpossible of a finish_steps() '
        + 'caller that passes none and has no state to queue the report on'],
    ['spell.js learn', 'spell.c learn() has no impossible() for a missing '
        + 'book: the marker stands for a null context.spbook.book'],
    ['topten.js get_rnd_toptenentry', 'the record file is missing only when '
        + 'a game starts without storage, which the recorder never does'],
    ['wintty.js render_status', 'raised while the status rows are drawn; '
        + 'printing the report draws them again'],
]);

function* walk(node, ancestors = []) {
    if (Array.isArray(node)) {
        for (const child of node) yield* walk(child, ancestors);
        return;
    }
    if (!node || typeof node.type !== 'string') return;
    yield [node, ancestors];
    const inner = [...ancestors, node];
    for (const [key, value] of Object.entries(node)) {
        if (key !== 'loc' && value && typeof value === 'object')
            yield* walk(value, inner);
    }
}

// The 'file function' of every note_unported() call whose label starts with
// 'pline.c impossible', in any argument form.
function markerSites() {
    const sites = [];
    const names = readdirSync(JS_DIR).filter((name) => name.endsWith('.js'));
    for (const name of names.sort()) {
        const text = readFileSync(new URL(name, JS_DIR), 'utf8');
        if (!text.includes('pline.c impossible')) continue;
        const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
        for (const [node, ancestors] of walk(ast)) {
            if (node.type !== 'CallExpression'
                || node.callee.name !== 'note_unported') continue;
            // Any string in the argument: a literal, a template, or an arm
            // of a conditional.
            const argument = text.slice(node.start, node.end);
            if (!argument.includes('pline.c impossible')) continue;
            const owner = ancestors.findLast((a) => a.id?.name
                && /Function/u.test(a.type));
            sites.push(`${name} ${owner?.id.name ?? '(module)'}`);
        }
    }
    return sites;
}

test('note_unported() stands in for impossible() only at the listed sites', () => {
    const sites = markerSites();
    assert.deepEqual(sites.sort(), [...REMAINING.keys()].sort(),
        'call impossible(), sync_impossible() or yield an ImpossibleCall '
        + 'with the C format text; remove the entry of a site that now does');
    for (const [site, reason] of REMAINING)
        assert.ok(reason, `${site} needs a reason`);
    // 9 on 2026-11-22, after 247 of 256 sites were converted. The count
    // falls only when a listed site is converted and its entry removed.
    assert.equal(REMAINING.size, 9);
});
