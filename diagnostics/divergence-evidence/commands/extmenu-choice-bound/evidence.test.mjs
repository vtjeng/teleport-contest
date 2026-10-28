import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {buildExtcmdData} from '../../../../scripts/generate-extcmds.mjs';
const source=readFileSync('nethack-c/upstream/src/cmd.c','utf8');
const rows=buildExtcmdData().rows;
test('whole configured source table cannot exceed extmenu choice limit',()=>{
    const max=Number(source.match(/#define MAX_EXT_CMD (\d+)/u)[1]);
    assert.equal(rows.length,170);assert.equal(max,200);assert.ok(rows.length<max);
    assert.match(source,/if \(\+\+i > MAX_EXT_CMD\)/u);
});
test('longest command bounds every selected prefix well below QBUFSZ guard',()=>{
    const q=Number(readFileSync('nethack-c/upstream/include/global.h','utf8').match(/#define QBUFSZ (\d+)/u)[1]);
    const maxName=Math.max(...rows.map(r=>r.ef_txt.length));
    assert.equal(maxName,14);assert.equal(q,128);assert.ok(maxName<q-2);
    assert.match(source,/if \(nchoices\s*<= 1\)/u);
    assert.match(source,/strncmp\(efp->ef_txt, cbuf, matchlevel\)/u);
    assert.match(source,/if \(matchlevel > \(QBUFSZ - 2\)\)/u);
});
