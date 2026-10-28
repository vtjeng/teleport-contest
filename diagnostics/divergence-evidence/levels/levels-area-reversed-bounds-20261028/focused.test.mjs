import assert from 'node:assert/strict';
import test from 'node:test';
import { selection_area } from '../../../../js/themerooms.js';
// C nhlsel.c:559-584 l_selection_fillrect iterates y1..y2 without sorting;
// selection_do_line accepts either x direction. Valid positive in-map coords.
test('reversed y is intentionally empty; reversed x still paints each row',()=>{
 assert.equal(selection_area(10,12,12,10).numpoints(),0);
 const forward=selection_area(10,10,12,12), reverseX=selection_area(12,10,10,12);
 assert.equal(forward.numpoints(),9);
 assert.deepEqual(reverseX.points,forward.points);
 assert.equal(selection_area(10,10,10,12).numpoints(),3);
});
