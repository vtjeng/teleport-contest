import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const DOKICK_C = readFileSync(
    new URL('../nethack-c/upstream/src/dokick.c', import.meta.url), 'utf8',
);
const DOKICK_JS = readFileSync(new URL('../js/dokick.js', import.meta.url), 'utf8');

test('all seven kick passive calls await the source AD_ENCH message path', () => {
    // C has one post-damage call in kickdmg and six early-return/attack calls
    // in kick_monster; all seven discard the C result but preserve call order.
    const kickDamageStart = DOKICK_C.indexOf('kickdmg(struct monst *mon, boolean clumsy)');
    const kickMonsterStart = DOKICK_C.indexOf(
        '\nkick_monster(struct monst *mon, coordxy x, coordxy y)\n{',
    );
    const kickDamageEnd = DOKICK_C.indexOf('\n}\n', kickDamageStart);
    const kickMonsterEnd = DOKICK_C.indexOf('\n}\n', kickMonsterStart);
    const cKickDamage = DOKICK_C.slice(kickDamageStart, kickDamageEnd);
    const cKickMonster = DOKICK_C.slice(kickMonsterStart, kickMonsterEnd);
    const jsKickDamageStart = DOKICK_JS.indexOf('export async function kickdmg(');
    const jsKickMonsterStart = DOKICK_JS.indexOf('export async function kick_monster(');
    const jsKickDamageEnd = DOKICK_JS.indexOf('\n}\n', jsKickDamageStart);
    const jsKickMonsterEnd = DOKICK_JS.indexOf('\n}\n', jsKickMonsterStart);
    const jsKickDamage = DOKICK_JS.slice(jsKickDamageStart, jsKickDamageEnd);
    const jsKickMonster = DOKICK_JS.slice(jsKickMonsterStart, jsKickMonsterEnd);
    assert.ok(kickDamageStart >= 0 && kickDamageEnd > kickDamageStart);
    assert.ok(kickMonsterStart >= 0 && kickMonsterEnd > kickMonsterStart);
    assert.ok(jsKickDamageStart >= 0 && jsKickDamageEnd > jsKickDamageStart);
    assert.ok(jsKickMonsterStart >= 0 && jsKickMonsterEnd > jsKickMonsterStart);
    assert.equal((cKickDamage.match(/\bpassive\(/gu) ?? []).length, 1);
    assert.equal((cKickMonster.match(/\bpassive\(/gu) ?? []).length, 6);
    assert.equal((jsKickDamage.match(/await passive\(/gu) ?? []).length, 1);
    assert.equal((jsKickMonster.match(/await passive\(/gu) ?? []).length, 6);
    assert.equal((jsKickDamage.match(/(?<!await )passive\(/gu) ?? []).length, 0);
    assert.equal((jsKickMonster.match(/(?<!await )passive\(/gu) ?? []).length, 0);
});
