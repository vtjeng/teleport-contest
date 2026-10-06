import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const UHITM_JS = readFileSync(new URL('../js/uhitm.js', import.meta.url), 'utf8');

// C refs: uhitm.c:mhitm_ad_ssex() and mhitm_adtyping()'s AD_SSEX arm.
test('mhitm_ad_ssex preserves its three source directions and dispatch arm', () => {
    const source = UHITM_C.match(
        /void\s+mhitm_ad_ssex\([\s\S]*?\n\}\n\nvoid\nmhitm_adtyping/u,
    )?.[0];
    assert.ok(source, 'uhitm.c contains the complete helper before mhitm_adtyping');
    assert.match(source,
        /if \(magr == &gy\.youmonst\)[\s\S]*?mhitm_ad_sedu\(magr, mattk, mdef, mhm\);[\s\S]*?else if \(mdef == &gy\.youmonst\)[\s\S]*?if \(SYSOPT_SEDUCE\)[\s\S]*?could_seduce\(magr, mdef, mattk\) == 1 && !magr->mcan[\s\S]*?if \(doseduce\(magr\)\)[\s\S]*?mhm->hitflags = M_ATTK_AGR_DONE;[\s\S]*?mhm->done = TRUE;[\s\S]*?mhitm_ad_sedu\(magr, mattk, mdef, mhm\);[\s\S]*?\/\* mhitm \*\//u);
    assert.match(UHITM_C,
        /case AD_SSEX:\s*mhitm_ad_ssex\(magr, mattk, mdef, mhm\);\s*break;/u);

    assert.match(UHITM_JS,
        /export async function mhitm_ad_ssex\([\s\S]*?if \(magr === state\.youmonst\)[\s\S]*?else if \(mdef === state\.youmonst\)[\s\S]*?could_seduce\(magr, mdef, mattk, \{ \.\.\.env, state \}\) === 1[\s\S]*?if \(await doseduce\(magr, state, env\)\)[\s\S]*?mhm\.hitflags = M_ATTK_AGR_DONE;[\s\S]*?mhm\.done = true;[\s\S]*?mhitm_ad_sedu\(magr, mattk, mdef, mhm, state, env\);[\s\S]*?\n\}/u);
    assert.match(UHITM_JS,
        /case AD_SSEX:\s*await mhitm_ad_ssex\(magr, mattk, mdef, mhm, state, env\);\s*break;/u);
});
