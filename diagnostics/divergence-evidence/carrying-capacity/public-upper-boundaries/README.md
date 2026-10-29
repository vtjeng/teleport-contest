# Silent encumbrance decrease leaves stale status

**Candidate: one confirmed semantic cause.** Public partial drop from total
weight 2850 to 2849 at capacity 950 changes C status from Overloaded to
Overtaxed. JS keeps Overloaded at zero-based segment 0 step 21 and through the
following inventory view. All 2446 RNG calls and 40 cursor positions match;
the first difference is the status row, column 43 (zero-based), t versus l.

Measured JS base: `55288dbacee2117ac3221566d64144099d6d7d8b` (analysis-only
parent of this package; gameplay equals Main f3e2e6d638383a5f77f153057d0af6684ca64cfb).
C gitlink: `16ff59115315917b93185d026aeefea06db9b0f4`.
Recorder provenance/limits and public setup are documented in the sibling
public-stack-cycle package. Its runner was reused without changes.

## Cause and exposure

C pickup.c encumber_msg sets disp.botl=TRUE whenever oldcap and newcap differ,
after either switch. Its decrease switch has messages for capacities 0..3 but
none for 4. Thus 5→4 must silently dirty the status line. JS pickup.js places
disp.botl=true inside `if (text)`, so the same transition updates oldcap but
never requests the redraw. The status eventually refreshes on another event;
in this recording it becomes correct after the second partial drop.

The recorded inventory weights are correct. This is a display-invalidation
cause, not another capacity arithmetic discrepancy, pickup rejection defect,
or RNG problem. Main owns any repair; this package changes no gameplay.
A fix must preserve C's silence while requesting the status refresh.

The target uses an unworn stack of 2760 arrows obtained with supported wizard
wish, unchanged starting inventory weight 90, St18/Co18 capacity 950, and
wizweight menus. `d1e` produces 2759 arrows; a second `d1e` produces 2758;
`1,` merges one arrow back to 2759. The final comma cannot lift the remaining
arrow because ordinary carry_count admits weight strictly below 3*capacity.
Both implementations reject that last pickup. Only the stale status is a
candidate divergence. These are public-input debug games; ordinary acquisition
of the large stack and all other inventory mechanics are not certified.

## Controls and explained negatives

Three independent upper-boundary cycles match every screen/cursor/RNG call:

| Case | Total weight cycle | Boundary | Screens/cursors | RNG |
| --- | --- | --- | ---: | ---: |
| stressed | 1426→1425→1424→1425→1426 | 1425 | 40 | 2320 |
| strained | 1901→1900→1899→1900→1901 | 1900 | 40 | 2373 |
| overtaxed | 2376→2375→2374→2375→2376 | 2375 | 40 | 2432 |

The three fixtures support one scoped ordinary-upper-transition negative;
they are not three causes. Together with the target they cover the source's
message-bearing and silent encumbrance decreases. All qualified runs have
unchanged HP and no combat messages. observe.mjs verifies public menu weights,
status values, exact expected first difference and strict controls.

The existing pickup test for live weakness capacity transitions passes but
covers a message-bearing transition; the polymorph test also covers messages.
No matching case manifest or PR title was found for encumber_msg. Relevant
status logic dates to e30ea05440a4850bee40881d3f65180c6ae7bb7b. Earlier repairs
and both arithmetic negatives remain separate and unchanged.

## Run and package

From repository root, with existing standard recorder installed, use fresh
output directories (never overwrite evidence):

```
node diagnostics/divergence-evidence/carrying-capacity/public-stack-cycle/probe.mjs diagnostics/divergence-evidence/carrying-capacity/public-upper-boundaries/admission-limit.session.json /tmp/capacity-upper-admission-new
node diagnostics/divergence-evidence/carrying-capacity/public-stack-cycle/probe.mjs diagnostics/divergence-evidence/carrying-capacity/public-upper-boundaries/overtaxed.session.json /tmp/capacity-upper-control-new
node diagnostics/divergence-evidence/carrying-capacity/public-upper-boundaries/observe.mjs
```

Target expects exit 1 before a fix; control expects 0. The observer expects 0
while confirming the recorded pre-fix evidence. A planned post-fix live target
expects 0 and has no receipt. Do not overwrite these pre-fix observations.
Receipts explicitly normalize actual saved recorder/worker/comparison output,
not new runs. Elapsed duration was not measured, not active compute.

## Ongoing inventory

Confirmed: silent 5→4 status invalidation, one cause, one public target.
Explained negatives: arithmetic (#105), stack-weight chains (#108), first
public burden boundary (sibling package), upper message-bearing transitions
(this pass, three fixtures). Invalid earlier setup: seed 642918 cycle, excluded
as already recorded. No unresolved attempted case in this qualified batch.
Next: public coin rounding during partial drop/pickup, then a second ordinary
stackable class and partial-count admission at the carrying limit. All original
exclusions remain absolute; no exhaustive inventory claim is made.
