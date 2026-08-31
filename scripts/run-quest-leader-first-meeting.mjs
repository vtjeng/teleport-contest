#!/usr/bin/env node

// Record and replay a fresh first meeting with a peaceful Priest quest
// leader. Every segment contains replay inputs only; runFreshMatrix() records
// the patched C reference in an isolated workspace.
//
// quest.c chat_with_leader() Rule 5 is reached after the wizard raises the
// Priest to level 20, teleports to Pri-strt, and uses the wizard location
// teleport to stand west of the leader. Thirty right cursor moves and four
// up moves select the square just west of the leader. The two spaces after
// the chat direction dismiss
// the leader_first pager and its alignment diagnostic; y accepts is_pure()'s
// adjustment prompt, and the final space dismisses assignquest.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runFreshMatrix } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RECIPE_PATH = resolve(
    dirname(SCRIPT_PATH),
    '../recipes/quest-leader-first-meeting-alignment-adjust.session.json',
);

export function loadQuestLeaderFirstMeetingRecipe() {
    return validateCleanRecipe(JSON.parse(readFileSync(RECIPE_PATH, 'utf8')),
        'quest leader first meeting recipe');
}

export async function runQuestLeaderFirstMeetingMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'quest leader first meeting',
            recipe: loadQuestLeaderFirstMeetingRecipe(),
        }],
        // playmode:debug leaves a save in the recorder install when the
        // segment ends, so never batch this recipe with another segment.
        chunkLimit: 1,
        summaryLabel: 'QUEST LEADER FIRST MEETING',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runQuestLeaderFirstMeetingMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `quest leader first meeting: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
