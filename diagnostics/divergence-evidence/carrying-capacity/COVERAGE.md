# Carrying-capacity audit coverage

Ongoing analysis only; Main is the sole gameplay writer. Exclusions remain
absolute. Finite matching probes are not exhaustive certification.

## Qualified outcomes

| Scope | Disposition | Evidence |
| --- | --- | --- |
| Ordinary arithmetic, encoded strength, burden thresholds, rounddiv | scoped negative | PR105;27708 rows+6 controls |
| Real catalog stack weights, mixed constructed chains | scoped negative | PR108;1108 rows+5 controls |
| Just-picked merged stacks, multi-stack menu and automatic category intersections | scoped negative | public-justpicked-merge;5 fixtures |
| Counted multi-drop cancellation and weapons filter | scoped negative | public-drop-cancel;2 fixtures |
| Public multi-drop full/combination menu boundaries | scoped negative | public-multi-drop;3 fixtures |
| Public first burden threshold with split/drop/pickup/merge | scoped negative | public-stack-cycle;2 fixtures |
| Higher message-bearing burden transitions | scoped negative | public-upper-boundaries;3 fixtures |
| Silent Overloaded→Overtaxed status update | confirmed candidate cause1 | public-upper-boundaries;1 failing fixture |
| Public coin rounding at49/50 and149/150 | scoped negative | public-coins;3 fixtures |
| Public non-unit partial pickup / all-fit control | scoped negative | public-rock-admission;2 fixtures |
| Gold capacity preflight blocks C's live count decision | confirmed candidate cause2 | public-gold-limit;2 failing variants+1 passing control |

| Public burden prompt decline then accept | scoped negative | public-burden-prompt;2 fixtures |
| Public odd-capacity half threshold | scoped negative | public-odd-capacity;2 fixtures |
| Public multi-selection count ordering | scoped negative | public-multi-pickup;2 fixtures |
| Decline one row versus quit whole selection | scoped negative | public-prompt-selection;2 fixtures |
| Plain sack arrow and coin weight round trips | scoped negative | public-sack;3 fixtures |
| Container menu wizard-weight naming mode | confirmed candidate cause3 | public-sack-menu;1 failure+1 control |
| Nested plain sack recursive weight and threshold cycle | scoped negative | public-nested-sack;2 fixtures |
| Ordinary tip to floor or sack, pickup/merge | scoped negative | public-tip-weight;2 fixtures |
| Floor-sack partial removal versus all-fit | scoped negative | public-floor-sack;2 fixtures |
| Mixed container menu order, automatic filters and counted split rollback | scoped negative | public-container-order;8 fixtures |
| Three-level plain nesting with threshold cycle | scoped negative | public-depth-three;2 fixtures |
| Counted middle-row capacity refusal stops later rows | scoped negative | public-row-continuation;2 fixtures |
| Counted burden decline/quit/accept rollback | scoped negative | public-counted-decline;3 fixtures |
| Count editing, cancellation, clamping and gold prediction | scoped negative | public-count-edit;4 fixtures |
| Traditional numeric prompt omits live echo | confirmed candidate cause4 | public-traditional-count;3 failures+1 control |
| Traditional filtered menu request loses class restriction | confirmed candidate cause5 | public-menu-request;2 failures+1 control |
| Look-inside fails to restart traditional class query | confirmed candidate cause6 | public-look-restart;1 failure+1 control |
| Empty/absent class lacks one-by-one fallback | confirmed candidate cause7 | public-class-fallback;2 failures+1 control |
| Full-menu long count resets to trailing digits | confirmed candidate cause8 | public-large-menu-count;1 failure+1 control |

Historical public corpus:76 fixtures,63 strict matches,13 failing fixtures grouped
into8 semantic causes at their pinned pre-fix sources. The8 behavior causes span6 source repair families: causes5-7 share query_classes.
No scanner keys or filter rules. Prior arithmetic row
counts are not cause counts. Source-bound receipts and exposure limits live in
each package. #105/#108 remain unchanged.

## Reconciled / invalid / unresolved

- Prior levitation order, active-form overexertion and fainting repairs are not
  new findings. Existing selected-count/heavy-stack pickup repairs cover
  non-gold paths; the confirmed gold guard remains excluded in those paths.
- Seed642918 cycle had incidental combat and a More prompt consuming an
  inventory command. It is invalid setup, not a negative; not retried unchanged.
  Seed642919 qualified the subsequent public cases without combat.
- Ranger odd-capacity calibration was even (800), so it did not meet the
  target. Tourist capacity725 qualified. A menu calibration guessed slot e
  after a rejected wish; actual darts slot f was observed and corrected.
  Neither setup-only result is a negative finding.
- Overloaded floor-sack setup could not apply; #loot at2849 was also refused
  in both engines. Two-stage loading and a2000-arrow drop established the final
  floor-sack witness. These initial attempts are setup-only, not negatives.
- No unresolved attempted case remains in the qualified packages. The inherited
  recorder has no independent build attestation; binary and relevant matching
  source hashes are retained. This provenance limit is explicit.
- Main1e786f87d927b72bd07122fc3eead0ecb5d8203c contains repairs for causes1-3;
  historical failures remain intact. Saved-C/isolated-Main replay verification
  passed all4 former targets and3 controls; see main-replay-1e786f87. Causes4-8 source paths remain unchanged at that Main SHA.

## Practical next paths

1. Completed the practical ordinary-weight frontier: flat/mixed chains, public
   count split/merge, all burden boundaries, coin rounding, prompts, carried and
   nested plain sacks, tip routes and floor-sack partial admission. Additional menu-order/filter/count-rollback and depth-three probes match;
   counted-row stop/continue, edit/cancel/clamp paths are now qualified.
   Traditional askchain exposed cause4; filtered menu handoff exposed cause5.
   Look-inside restart exposed cause6. Exact-Main replay verifies causes1-3 on7 existing fixtures (not new cases).
   Empty/absent-class fallback exposed cause7; full-menu safe-integer boundary
   exposed cause8. Ordinary multiple-drop full/combination boundaries now match in 3 fixtures.
   Count cancellation and weapons-only drop now match in 2 further fixtures.
   Main398d58c75c1d9761c3f5ff6eb084d3f8a6259f1b has no further changes to
   pending topl.js/pickup.js/tty_menu.js paths. Just-picked merged-stack counts, two-stack menu dispatch and automatic
   class/history filters now match in5fixtures, including the explicit coin
   override and a genuine empty food/history intersection. Next frontier:
   ordinary category-selection state reset across successive commands; avoid
   rerunning queued query_classes/count-input causes without new Main changes.
   This is not exhaustive input/seed/role certification; nesting beyond three levels,
   arbitrary menu permutations and other object catalogs remain coverage gaps.
2. Current-base replay on Main398d58c75 confirms all9 cause4-8 target variants
   still fail identically and all5 controls pass (main-replay-398d58c75).
   These14 replays add no fixtures or causes. Post-fix validation awaits Main's implementation.
   Fresh public reruns are declared in each candidate package; do not repeat
   unchanged failures. If a new ordinary-weight source change or concrete lead
   appears, reopen that path with a new executed C comparison.
3. Shops, inventory-slot limits, magical containers and special object/form
   effects remain outside the current ordinary weight-path investigation.

No gameplay repairs, CI dispatches, formal approvals or merges are performed.
