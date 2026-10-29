# Public-input ordinary stack cycle at the burden boundary

One scoped explained negative, zero confirmed divergence causes. This follows
PRs #105 and #108 without modifying or expanding their earlier claims. Unlike
those constructed-state checks, this pass executes public commands against the
installed patched C recorder and the official-overlay JS replay.

Measured JS base: `f3e2e6d638383a5f77f153057d0af6684ca64cfb`.
C source gitlink: `16ff59115315917b93185d026aeefea06db9b0f4`.
The standard recorder already existed; no prerequisites were installed, no C
patches or gameplay code were changed, and no CI was dispatched. Recorder
binary hash and matching relevant source-tree hashes are in provenance.json.
The inherited binary was not rebuilt and has no independent build attestation.

## Setup and public observations

Both cases use fresh seed 642919, clock 20320612101500, human neutral female
Valkyrie, no pet, no autopickup, and debug mode with wizweight and
pickup_burden:l. Wizard wish creates the arrow stack through supported public
input. wizweight displays each object's weight. This is a public-input debug
witness, not evidence that an ordinary game acquires 861 arrows in this way.
No worn item changes, consumption, combat or excluded mechanics are exercised.
The starting equipment stays unchanged; only the unworn arrow stack is moved.

The initial inventory displays 30+10+30+20=90 aum, St:18 and Co:18. The source
formula gives capacity 950. The target wishes for 861 arrows (861 aum).
Each partial drop uses `d1e`; count-prefixed pickup `1,` takes one arrow from
the two-arrow floor stack, and `,` takes the remainder. Inventory is opened
at each stage. Escape dismisses `--More--` when needed and closes menus.

| C and matching JS step | Arrow quantity/weight | Total displayed inventory weight | Status |
| --- | ---: | ---: | --- |
| 1, initial inventory | 0 | 90 | unburdened |
| 16, after wish | 861 | 951 | Burdened |
| 22, after first partial drop | 860 | 950 | unburdened |
| 28, after second partial drop | 859 | 949 | unburdened |
| 33, after count-one pickup | 860 | 950 | unburdened |
| 37, after remaining pickup | 861 | 951 | Burdened |

The 600-arrow control traverses totals 690,689,688,689,690 and stays unburdened.
observe.mjs checks these exact public menu counts/weights, status transitions,
constant HP, expected drop/pickup messages and strict replay parity. It does not
construct or modify game state. observations.json retains the item lines.

## Executed comparison and source attribution

Target: 39/39 screens, 39/39 cursors, 2306/2306 RNG calls, no animations;
control: 39/39 screens, 39/39 cursors, 2299/2299 RNG calls, no animations.
All cells/attributes match, and all mismatch fields are null. This is two
fixtures for one semantic audit question, not thousands of independent causes.

- do.c dodrop -> invent.c getobj's count arm calls mkobj.c splitobj;
  splitobj decrements parent quantity and recomputes both object weights.
- do.c dropx/dropy/dropz places each ordinary arrow on the floor; stackobj
  merges the compatible second drop with the first.
- pickup.c pickup_object splits the floor stack for count-one pickup, then
  pick_obj/addinv merges it into the carried arrows; invent.c merged updates
  quantity and recomputes weight. The last pickup restores the original stack.
- hack.c inv_weight/weight_cap/near_capacity read the live inventory; displayed
  quantities and burden changes independently observe this sequence.

Bindings identify source paths, not runtime function instrumentation. The
recordings prove command behavior; internal call attribution follows the
ordinary source branches for the declared setup.

## Reproduction and receipts

The live runner uses the existing recorder and stages a private install.
Choose output directories that do not exist (it refuses to overwrite):

```
node diagnostics/divergence-evidence/carrying-capacity/public-stack-cycle/probe.mjs diagnostics/divergence-evidence/carrying-capacity/public-stack-cycle/public-target.session.json /tmp/capacity-stack-target-new
node diagnostics/divergence-evidence/carrying-capacity/public-stack-cycle/probe.mjs diagnostics/divergence-evidence/carrying-capacity/public-stack-cycle/public-control.session.json /tmp/capacity-stack-control-new
node diagnostics/divergence-evidence/carrying-capacity/public-stack-cycle/observe.mjs
node scripts/evidence-package.mjs validate diagnostics/divergence-evidence/carrying-capacity/public-stack-cycle/case.json --commit HEAD
node scripts/checkpoint-preflight.mjs --commit HEAD
```

All expect exit 0. Case commands retain the exact original live argv. Raw
recordings, JS output, recorder status, worker status and comparisons are
copied unchanged into target/ and control/. Normalized receipts explicitly
convert these successful saved executions; they are not new runs. Elapsed
audit/live-run duration was not measured; no active-compute claim is made.
The observer was separately executed successfully. Focused ordinary addinv
and coin-merge tests passed 2/2 as supporting JS regression checks.

## Overlap, invalid setup and limits

Existing adjust-split-item-action recipe (cfc6097bf) exercises the organization
menu with food rations; run-inventory-adjust-fuzz tests slot moves, and
run-pickup-burden tests option mappings/heavy-ball retention. None is this
partial-drop/floor-merge/count-pickup boundary cycle. Earlier levitation and
overexertion repairs remain excluded and are not recounted.

Seed 642918 was tried first. Its startup/wish calibration matched, but an
incidental grid-bug attack and an undispatched inventory command at a More
prompt invalidated the intended cycle. It is NOT counted as a negative or
investigated as a combat issue. One additional seed was allowed; seed 642919
completed the qualified target and control above. Setup-only artifacts remain
local under /tmp/capacity-stack-setup-history and are not presented as evidence
for this package. No denied action was retried.

Coverage is one ordinary type, one character/seed, one floor and the first
burden boundary. Other object classes, gold, containers, shops, alternate
pickup modes, save/restore, higher burden transitions and uncommon flags are
not certified. No unsatisfied setup prerequisite remains for this finite
question, and no bug or gameplay repair is proposed.

## Ongoing coverage inventory

Reviewed: arithmetic matrix (#105); real catalog weights/mixed constructed
chains (#108); public first-boundary arrow split/drop/floor-merge/pickup cycle
(this package). Each is one scoped negative, not an exhaustive certificate.
Invalid setup: first seed's cycle (combat/prompt contamination), retained
locally and not repeated unchanged.
Next frontiers: public higher burden transitions and pickup admission limits;
public coin-stack rounding during drop/pickup; a second ordinary stackable
object class; ordinary partial-pickup boundary behavior. These remain untested
until separately recorded and qualified. All original exclusions still apply.
