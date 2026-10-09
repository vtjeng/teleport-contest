#!/usr/bin/env node
// read.c retry hints: independently chosen seed/clock/roles cover species,
// blessed class selection, and the unchanged !cmdassist hint. Cancellation
// follows a separate More dismissal so it reaches the newly opened getlin.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { num_genocides } from '../js/insight.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = ['species', 'class', 'disabled'];
export async function runGenocideRetryMatrix() {
    return runFreshMatrix({
        entries: CASES.map(name => ({
            label: name,
            recipe: JSON.parse(readFileSync(new URL(
                `../recipes/read.c/genocide-retry-${name}-independent.session.json`,
                import.meta.url,
            ))),
        })),
        verifySegment: async segment => {
            let boundary;
            const session = await runSegment(segment, {
                onBoundary: error => { boundary = error; },
            });
            assert.equal(boundary, undefined);
            const screens = session.getScreens();
            // Initial getlin has no hint; the subsequent source retry adds
            // either the quoted help key or the !cmdassist history hint.
            assert.ok(screens.some(screen => /genocide\?\n/u.test(screen)));
            const retry = screens.find(screen => screen.includes('[enter'));
            assert.ok(retry);
            if (segment.nethackrc.includes('!cmdassist')) {
                assert.ok(retry.replaceAll('\n', '').includes("'?' to see previous genocides]"));
            } else {
                assert.ok(retry.includes("or '?']"));
            }
            // Escape must finish the retry, allowing the last wait to run;
            // the cancelled scroll never genocides a species or class.
            assert.ok(!screens.at(-1).includes('genocide?'));
            assert.equal(num_genocides(game), 0);
        },
        summaryLabel: 'GENOCIDE RETRY', chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runGenocideRetryMatrix, 'genocide retry hints');
