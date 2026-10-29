# Empty or absent class falls back to one-by-one: candidate

JS2f2a5a3e48271b44ce133c4a55759547efd50898; C16ff59115315917b93185d026aeefea06db9b0f4.
Supported mixed ordinary floor sack900arrows+49coins, traditional menustyle.
Empty class response (Enter) makes C enter one-by-one selection and ask
`Take out: 49 gold pieces...?`; JS repeats the class query. Requesting absent
class '!' first shows `There are no !'s inside.--More--` in both; after Escape,
C enters one-by-one selection while JS repeats the class query. No potion or
other absent object is created/used; this tests source-defined input handling.

Two targets exit1: empty131 screens/cursors, first difference zero-based
segment0 step130; absent-dismissed133, first difference step132. Both2351 RNG
exact. At each difference row0,col0 C'T'/JS'W'; cursor C[46,0,1]/JS[57,0,1].
Explicit 'A' control132 screens/cursors2351 RNG, exit0 exact, reaches the same
one-by-one prompt in both. The earlier absent-class prefix ended at More and
did not exercise fallback; locally retained as incomplete setup, not a negative.

C query_classes:254-260 forces one_at_a_time=TRUE and everything=FALSE when
no object class was picked and selection is empty/incomplete. JS:2828-2840
instead continues prompting when no one_by_one/allflag/oclasses/filter exists.
This is a distinct missing fallback branch, not cause5's menu return code or
cause6's look restart. These3 behavior gaps share one query_classes repair
family; fixture counts must not be mistaken for independent source families.
Main1e786f87d927b72bd07122fc3eead0ecb5d8203c leaves these query branches unchanged.

No transfer needed to reproduce; demonstrated exposure is different pending
input state. observe.mjs checks exact prompts, RNG, full differences/control and
stable HP/no observed combat. Commands/expected exits/actual normalized receipts,
source hashes and planned unexecuted post-fix checks are in case.json.
Existing traditional selection tests do not cover this fallback; query_classes
PR overlap search returned none. Main adjudicates implementation/overlap.

Debug wishes/wizweight establish setup; normal class-response branch is exercised,
not separately recorded without debug. Recorder binary/source provenance and
missing independent build attestation remain in public-stack-cycle; elapsed
unmeasured. All exclusions maintained; no gameplay edits, CI or exhaustive claim.
