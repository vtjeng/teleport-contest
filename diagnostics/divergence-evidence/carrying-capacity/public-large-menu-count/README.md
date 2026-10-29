# Full-menu count resets above safe-integer range: candidate

JS2f2a5a3e48271b44ce133c4a55759547efd50898; C16ff59115315917b93185d026aeefea06db9b0f4.
Supported public floor sack900arrows+49coins, kit90/cap950, full menu style and
pickup_burden:u. Select arrow row with count90071992547409921 then Enter. This
count is within the installed Linux C recorder's signed64-bit long range.
C clamps requested count to available900 and waits for burden confirmation.
JS instead takes1arrow without that prompt. Stop at this first semantic boundary;
no C900-arrow transfer is claimed because C is still awaiting confirmation.

Target exit1:121 screens/cursors each; first difference zero-based segment0
step120,row0,col0 C'Y'/JS'f'. C top line asks `removing 900 arrows...Continue?`;
JS reports `f - an arrow (1 aum).` C2382 RNG versus JS2395 because JS commits a
turn while C waits; first RNG difference index2382. This downstream RNG tail
is not a separate cause. Stable HP/no observed combat verified in BOTH streams.

Control9007199254740991 (Number.MAX_SAFE_INTEGER) selects the same available900
and matches all120 screens/cursors2382 RNG, exit0. Both end at burden prompt.

Root: JS tty_menu.js:1499-1506 sets pendingCount=null when Number.isSafeInteger
fails. After the valid C prefix9007199254740992 resets JS state, the final1
starts a new count. C wintty.c:1583-1602 uses AppendLongDigit and keeps counting
until signed-long overflow; integer.h:120 defines that bound check. No overflow
occurs for this target in the installed C ABI. query_objlist then clamps C's
count to the stack quantity; JS supplies1. This is full-menu parsing, not the
traditional tty_yn_function echo cause. Exposure requires an unusually long but
source-supported count; ordinary small counts remain separately scoped negatives.

Existing menu tests contain no MAX_SAFE/large-count/overflow boundary case;
PR title search for count overflow found none. Main1e786f87d's tty_menu.js is
unchanged. observe.mjs verifies exact endpoint prompts, quantity message, RNG
boundary and full control. case.json pins source, actual receipts/expected exits,
raw outputs and planned unexecuted post-fix command. Fresh output paths required.

Debug wishes/wizweight establish setup; normal menu input path. Recorder source/
binary provenance and missing independent build attestation remain explicit in
public-stack-cycle. Elapsed unmeasured. No gameplay edits, CI, effects, consumption,
rings, migration, timers, combat or denied investigations. Main owns the fix.
