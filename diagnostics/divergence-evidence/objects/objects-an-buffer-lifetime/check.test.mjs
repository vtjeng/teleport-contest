import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {an} from '../../../../js/objnam.js';
test('source-only lifetime probe: not a public-input divergence witness',()=>{
 const c=readFileSync(new URL('../../../../nethack-c/upstream/src/objnam.c',import.meta.url),'utf8');
 assert.match(c,/#define NUMOBUF 12/);
 assert.match(c,/nextobuf\(void\)\s*\{\s*obufidx = \(obufidx \+ 1\) % NUMOBUF;\s*return obufs\[obufidx\];/);
 const retained=an('apple');
 for(let i=1;i<=12;i++)assert.equal(an('stone'+i),'a stone'+i);
 assert.equal(retained,'an apple');
 // A C pointer retained across the analogous twelve allocations aliases the
 // twelfth buffer write. Whether a valid production path retains it that
 // long without copying/releasing remains unresolved. No C run is claimed.
});
