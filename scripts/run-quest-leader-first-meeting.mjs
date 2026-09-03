#!/usr/bin/env node

// Record and replay two fresh first meetings with a peaceful Priest quest
// leader, one for each verdict quest.c chat_with_leader() Rule 5 can reach
// with a ported branch. Every segment contains replay inputs only;
// runFreshMatrix() records the patched C reference in an isolated workspace.
//
// Both recipes share a prefix: the wizard raises the Priest to level 20,
// teleports to Pri-strt, and uses the wizard location teleport to stand west
// of the leader. Thirty right cursor moves and four up moves select that
// square, and the following `.` confirms it.
//
// The two then diverge on how the leader is met and how is_pure()'s wizard
// adjustment prompt is answered:
//
//   assignquest  #chat speaks to the leader directly. Two spaces dismiss the
//                leader_first pager and its alignment diagnostic, y accepts
//                the adjustment, and the final space dismisses assignquest.
//   badalign     A `.` rest lets monmove.c dochug() give the waiting leader
//                its turn to speak instead. n declines the adjustment, so the
//                leader delivers badalign and expulsion(FALSE) sends the hero
//                back through the quest portal to the parent dungeon level.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RECIPE_DIR = resolve(dirname(SCRIPT_PATH), '../recipes');

function loadRecipe(name, label) {
    return validateCleanRecipe(
        JSON.parse(readFileSync(resolve(RECIPE_DIR, name), 'utf8')),
        label,
    );
}

export function loadQuestLeaderFirstMeetingRecipe() {
    return loadRecipe(
        'quest-leader-first-meeting-alignment-adjust.session.json',
        'quest leader first meeting recipe',
    );
}

export function loadQuestLeaderBadalignRecipe() {
    return loadRecipe(
        'quest-leader-badalign-expulsion.session.json',
        'quest leader badalign expulsion recipe',
    );
}

export async function runQuestLeaderFirstMeetingMatrix() {
    return runFreshMatrix({
        entries: [
            {
                label: 'quest leader first meeting',
                recipe: loadQuestLeaderFirstMeetingRecipe(),
            },
            {
                label: 'quest leader badalign expulsion',
                recipe: loadQuestLeaderBadalignRecipe(),
            },
        ],
        // playmode:debug leaves a save in the recorder install when the
        // segment ends, so never batch these recipes with another segment.
        chunkLimit: 1,
        summaryLabel: 'QUEST LEADER FIRST MEETING',
    });
}

runMatrixCli(import.meta.url, runQuestLeaderFirstMeetingMatrix, 'quest leader first meeting');
