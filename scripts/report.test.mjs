import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { submit_web_report } from '../js/report.js';

const cReport = readFileSync(new URL('../nethack-c/upstream/src/report.c',
    import.meta.url), 'utf8');

test('submit_web_report() declines when sysopt.crashreporturl is unset', () => {
    // C ref: report.c submit_web_report() opens with this guard, and sys.c
    // sys_early_init() leaves sysopt.crashreporturl NULL in a build without
    // SYSCF, such as the recorder's.
    assert.match(cReport,
        /submit_web_report\(int cos, const char \*msg, const char \*why\)[\s\S]*?if \(!sysopt\.crashreporturl\)\s*return FALSE;/u);
    // cos 2 and the reason string are dobugreport()'s arguments; an empty
    // sysopt and one without the field both stand for the NULL pointer.
    assert.equal(submit_web_report(2, null, '#bugreport command', { sysopt: {} }), false);
    assert.equal(submit_web_report(2, null, '#bugreport command', {}), false);
});
