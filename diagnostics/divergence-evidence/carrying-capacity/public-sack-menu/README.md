# Sack menu weight annotation: candidate

Source base JS 9fa63e58d98425fcb946b4bb8c510dbf362452b2; C gitlink
16ff59115315917b93185d026aeefea06db9b0f4. Gameplay unchanged from f3e2e6d.
Seed642919 Valkyrie, capacity950, kit90, plain empty sack15 and846 arrows.
Public apply sack, insert weapons, select arrows. No equipment effect changes.

Target `insert` exits1:52 screens/cursors and2318 RNG each, RNG exact.
First screen/cursor difference segment0 step44: C places menu one column right.
C spear label `(weapon in right hand, 30 aum)` versus JS
`(weapon in right hand) (30 aum)`; alternate weapon similarly differs.
Insertion itself succeeds and final loaded sack861/total951 agrees. Do not
classify the whole session as a negative. `no-weight-control` changes only
wizweight off and exits0, all52 screens/cursors and2318 RNG exact.

C pickup.c query_objlist always calls doname_with_price. JS pickup.js:752-762
substitutes donameFresh outside priced floor stock. That substitution changes
withPrice, which C objnam.c:1697 and JS objnam.js:1961 use to join wizard weight
inside an existing final parenthesis. The naming implementation already has
the branch; caller chooses the wrong mode. This is one incidental semantic
cause, not weight arithmetic or equipment effects. Exposure demonstrated only
with debug wizweight, not ordinary non-debug play. Main owns any repair.

Checked existing naming tests (bounded wizard weight/price quote behavior),
source history and PR title searches; these do not cover this caller witness.
Latest Main2579242c67804962299920a58e3052ab3718c187 has identical pickup.js
and objnam.js. Existing levitation and overexertion repairs are unrelated.

Commands, exact expected exits, hashes and actual receipts are in case.json.
Original recipe paths under public-sack are retained to preserve executed argv;
local recipe copies are identical. Fresh runs need unused output directories.
Post-fix check is planned, not executed. observe.mjs independently checks saved
C/JS comparisons. Receipt conversion normalizes retained completed outputs;
elapsed time was not measured. Recorder provenance/build limit is in the sibling
public-stack-cycle package. No gameplay edits or CI dispatch.
