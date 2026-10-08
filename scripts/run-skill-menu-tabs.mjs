#!/usr/bin/env node
// Independent C-first role/option routes cover the ordinary, wizard-practice
// and speedy-selectable tab row formats without advancing any skill.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { add_skills_to_menu } from '../js/weapon.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
const cases = ['wizard', 'monk', 'ordinary-wizard', 'speedy'];
function recipe(name) {
    const url = new URL('../recipes/weapon.c/skill-menu-tabs-' + name + '.session.json', import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = cases.find(n => recipe(n).segments[0].seed === segment.seed);
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const screens = replay.getScreens();
    const prompt = name === 'speedy' ? 'Pick a skill to advance:' : 'Current skills:';
    assert.ok(screens.some(screen => screen.includes(prompt)), 'command reaches the source menu');
    assert.ok(!screens.at(-1).includes(prompt), 'Escape restores command input after the menu');
    assert.equal(game.iflags.menu_tab_sep, true, 'canonical startup boolean option enables columns');
    assert.equal(game.u.skills_advanced, 0, 'source cancellation spends no slots or skill advancements');
    assert.equal(game.context.move, 0, 'skill listing takes no turn');
    const rows = add_skills_to_menu(game, name === 'speedy', name === 'speedy')
        .filter(row => !row.heading);
    assert.ok(rows.length > 0);
    assert.ok(rows.every(row => row.text.includes('\t')), 'all skill rows retain C tab bytes');
    if (name === 'wizard' || name === 'speedy') {
        assert.ok(rows.every(row => row.text.split('\t').length === 3), 'wizard format has three columns');
        assert.ok(rows.every(row => /\d+\( *\d+\)$/u.test(row.text)), 'wizard practice and required practice remain visible');
        if (name === 'speedy') assert.ok(rows.some(row => row.value), 'speedy source gate supplies selectable skill identifiers');
    } else {
        assert.ok(rows.every(row => row.text.split('\t').length === 2), 'ordinary format has two columns');
        assert.ok(rows.every(row => /\[[^\]]+\]$/u.test(row.text)), 'ordinary level stays bracketed');
    }
}
export async function runSkillMenuTabsMatrix() {
    return runFreshMatrix({ entries: cases.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'SKILL MENU TABS', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runSkillMenuTabsMatrix, 'weapon.c skill menu tabs');
