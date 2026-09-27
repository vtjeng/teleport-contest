import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { MAGIC_MARKER } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/write.c/glib-marker-slip-independent.session.json',
    import.meta.url,
), 'utf8'));
const writeC = readFileSync(new URL(
    '../nethack-c/upstream/src/write.c', import.meta.url,
), 'utf8');
const dowriteC = writeC.slice(
    writeC.indexOf('dowrite(struct obj *pen)'),
    writeC.indexOf('/* most book descriptions', writeC.indexOf('dowrite(struct obj *pen)')),
);

test('dowrite keeps its source-ordered no-hands and Glib branches', () => {
    assert.match(
        dowriteC,
        /if \(nohands\(gy\.youmonst\.data\)\) \{\s*You\("need hands to be able to write!"\);\s*return ECMD_OK;\s*\} else if \(Glib\) \{\s*pline\("%s from your %s\.", Tobjnam\(pen, "slip"\),\s*fingers_or_gloves\(FALSE\)\);\s*dropx\(pen\);\s*return ECMD_TIME;/u,
    );
});

test('applying a marker with Glib reports the slip and drops it', async () => {
    await runSegment(recipe.segments[0]);

    assert.match(game._ttyToplines,
        /The magic marker slips from your fingers\./u);
    let markerInInventory = false;
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (obj.otyp === MAGIC_MARKER) markerInInventory = true;
    }
    assert.equal(markerInInventory, false, 'the slipped marker leaves inventory');
    let markerOnFloor = false;
    for (let x = 0; x < (game.level.objects?.length ?? 0); x++) {
        for (let y = 0; y < (game.level.objects[x]?.length ?? 0); y++) {
            for (let obj = game.level.objects[x][y]; obj; obj = obj.nexthere) {
                if (obj.otyp === MAGIC_MARKER) markerOnFloor = true;
            }
        }
    }
    assert.equal(markerOnFloor, true, 'the marker lands on the floor');
});
