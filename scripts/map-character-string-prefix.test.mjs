import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {check_mapchr, get_table_mapchr, get_table_mapchr_opt} from '../js/mklev.js';
import {INVALID_TYPE, ROOM} from '../js/const.js';
const root = new URL('./test-fixtures/recovery-map-character-strings/',import.meta.url);
const cases = JSON.parse(readFileSync(new URL('expected.json',root)));
const ascii = JSON.parse(readFileSync(new URL('ascii-expected.json',root)));
// The C fixtures execute exact check_mapchr/splev_chr2typ/char2typ bodies.
// Table-wrapper expectations additionally follow nhlua.c's required/error and
// optional-empty/default branches; those C wrappers are not newly executed.
for (const [i,row] of cases.entries()) {
    test(`C map-character validation ${i}`,() => {
        assert.equal(check_mapchr(row.input),row.expectedC);
    });
    test(`required map-character field ${i}`,() => {
        if (row.input === null)
            assert.throws(() => get_table_mapchr({typ:row.input},'typ'));
        else if (row.expectedC === INVALID_TYPE)
            assert.throws(() => get_table_mapchr({typ:row.input},'typ'),/Erroneous map char/u);
        else assert.equal(get_table_mapchr({typ:row.input},'typ'),row.expectedC);
    });
    test(`optional map-character field ${i}`,() => {
        const prefix = row.input?.split('\0',1)[0];
        if (!prefix) assert.equal(get_table_mapchr_opt({typ:row.input},'typ',ROOM),ROOM);
        else if (row.expectedC === INVALID_TYPE)
            assert.throws(() => get_table_mapchr_opt({typ:row.input},'typ',ROOM),/Erroneous map char/u);
        else assert.equal(get_table_mapchr_opt({typ:row.input},'typ',ROOM),row.expectedC);
    });
}
for (const [code,expected] of ascii.entries()) {
    test(`C map-character ASCII validator ${code}`,() => {
        assert.equal(check_mapchr(String.fromCharCode(code)),expected);
    });
}

test('map-character oracle source pins still match the current C checkout',() => {
    const provenance=JSON.parse(readFileSync(new URL('provenance.json',root)));
    for (const [path,expected] of Object.entries(provenance.sha256))
        assert.equal(createHash('sha256').update(readFileSync(new URL(`../nethack-c/upstream/${path}`,import.meta.url))).digest('hex'),expected,path);
});
