import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { FIGURINE } from '../js/objects.js';
import { M2_HUMAN } from '../js/monsters.js';
import { CORPSTAT_FEMALE, CORPSTAT_MALE, CORPSTAT_NEUTER } from '../js/const.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const name of ['normal', 'monochrome', 'before-control']) {
    test('monster-player object hooks ' + name + ' match independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/mplayer.c/object-hooks-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
            if (name !== 'before-control') {
                const { game } = await import(pathToFileURL(root + '/js/gstate.js').href);
                const figurines = [];
                for (let monster = game.level.monlist; monster; monster = monster.nmon)
                    for (let object = monster.minvent; object; object = object.nobj)
                        if (object.otyp === FIGURINE) figurines.push(object);
                assert.ok(figurines.length > 0, 'default Astral loot reaches mkobj FIGURINE');
                // C mkobj.c:1040-1047 retries human species;1200-1229 finalizes sex.
                for (const object of figurines) {
                    assert.ok(object.corpsenm >= 0);
                    assert.equal(game.mons[object.corpsenm].mflags2 & M2_HUMAN, 0);
                    assert.ok([CORPSTAT_FEMALE, CORPSTAT_MALE, CORPSTAT_NEUTER].includes(object.spe));
                }
            }
        } finally { removeScoringWorkspace(root); }
    });
}
