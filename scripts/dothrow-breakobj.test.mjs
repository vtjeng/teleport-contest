import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('breakobj explodes pyrolisk eggs after deleting them', () => {
    const c = readFileSync(
        new URL('../nethack-c/upstream/src/dothrow.c', import.meta.url),
        'utf8',
    );
    const cStart = c.indexOf('breakobj(\n    struct obj *obj,');
    const cEnd = c.indexOf('\n}\n\n/*', cStart);
    assert.ok(cStart > 0 && cEnd > cStart);
    const cBody = c.slice(cStart, cEnd).replace(/\s+/gu, ' ');
    assert.match(cBody,
        /case EGG: .*?if \(obj->corpsenm == PM_PYROLISK\) explosion = TRUE; .*?if \(!fracture\) delobj\(obj\); if \(explosion\) explode\(x, y, -11, d\(3, 6\), 0, EXPL_FIERY\);/u);

    const js = readFileSync(new URL('../js/dothrow.js', import.meta.url), 'utf8');
    const jsStart = js.indexOf('export async function breakobj(');
    const jsEnd = js.indexOf('\n}\n\nfunction next2u', jsStart);
    assert.ok(jsStart > 0 && jsEnd > jsStart);
    const jsBody = js.slice(jsStart, jsEnd);
    assert.match(jsBody,
        /case EGG:[\s\S]*?if \(obj\.corpsenm === PM_PYROLISK\) explosion = true;/u);
    assert.match(jsBody,
        /if \(!fracture\) delobj\(obj, objectEnv\);\s*if \(explosion\) \{\s*await explode\(x, y, -11, \(random\.d \?\? d\)\(3, 6\), 0, EXPL_FIERY, state,/u);
    assert.ok(jsBody.indexOf('if (!fracture) delobj(obj, objectEnv);')
        < jsBody.indexOf('await explode(x, y, -11'));
    assert.equal(jsBody.includes("note_unported('explode.c explode')"), false);
});
