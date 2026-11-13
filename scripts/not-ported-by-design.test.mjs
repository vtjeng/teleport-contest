// Keeps the C files in scripts/not-ported-by-design.mjs unported: no js/
// module carries one of their names, and no goal other than a superseded one
// covers them. Re-adding a port therefore fails here until the file is taken
// off the list, which needs Vincent's approval.

import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { PROJECT_ROOT, cFilePath } from './c-functions.mjs';
import { readGoals } from './goal-log.mjs';
import { NOT_PORTED_BY_DESIGN, touchesNotPorted } from './not-ported-by-design.mjs';

const LISTED = Object.keys(NOT_PORTED_BY_DESIGN);

test('every listed C file exists upstream and records its reason and approval', () => {
    assert.ok(LISTED.length > 0);
    for (const [file, entry] of Object.entries(NOT_PORTED_BY_DESIGN)) {
        // Throws when the C checkout or the file is missing; this check never skips.
        assert.ok(cFilePath(file), file);
        assert.match(entry.reason, /\S/u, `${file} needs a reason`);
        assert.match(entry.approved, /^\S.*, \d{4}-\d{2}-\d{2}$/u, `${file} needs "who, date"`);
    }
});

test('no js/ module is named after a C file that is not ported by design', () => {
    const modules = readdirSync(join(PROJECT_ROOT, 'js'), { recursive: true })
        .filter((path) => path.endsWith('.js'));
    const names = new Set(modules.map((path) => path.split('/').at(-1)));
    for (const file of LISTED) {
        const module = file.replace(/\.c$/u, '.js');
        assert.ok(!names.has(module), `js/ has ${module}, a port of ${file}, which is not `
            + `ported by design: ${NOT_PORTED_BY_DESIGN[file].reason}. Delete the module, or `
            + 'take the file off scripts/not-ported-by-design.mjs with Vincent\'s approval.');
    }
});

test('every goal for a C file not ported by design is superseded', () => {
    const active = readGoals().goals
        .filter((goal) => touchesNotPorted(goal) && goal.status !== 'superseded')
        .map((goal) => `${goal.id} (${goal.status})`);
    assert.deepEqual(active, [], 'retire each with node scripts/goal-log.mjs supersede-goal '
        + '--goal <id> --reason <text>');
});
