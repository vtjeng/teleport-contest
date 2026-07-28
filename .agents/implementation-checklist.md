# Repeated simple commands: post-audit implementation checklist

## Boundary

- Roadmap item: Repeated simple commands beyond the first turn.
- Starting code commit: `7892b219a2b060f14e064668f2916396f4bb24da`
- Starting event: an admitted repeated movement, wait, or starting-pet
  collision command at a ready gameplay prompt.
- Ending event: the next ready prompt, or the handoff to `done(ESCAPED)` after
  the urgent capitulation message and recorder-final boundary at move
  1,000,000,000. The later `end.c` disclosure and topten flow belongs to the
  roadmap's endgame long tail.
- Valid inputs: the committed twelve-case repeated-command matrix, every valid
  starting role/race/seed that can reach HUNGRY or WEAK through those commands,
  and direct source-state boundary cases for move 600 and move 1,000,000,000.
- Observables: state ownership, command retry atomicity, monster state,
  encumbrance, luck, attributes, RNG calls, messages, complete screens and
  attributes, terminal and recorder cursors, and termination state.
- Exclusions: gameplay commands and monster actions already rejected by the
  committed admission boundaries before state, randomness, or output changes;
  hallucination-dependent hunger text remains outside this boundary because no
  admitted starting configuration or command can create hallucination.

## How the candidate list was built

- Upstream entry points: `allmain.c:moveloop_core`, `hack.c:weight_cap`,
  `hack.c:inv_weight`, `hack.c:near_capacity`, `timeout.c:nh_timeout`,
  `monmove.c:m_move`, `attrib.c:exerchk`, `hack.c:domove_swap_with_pet`.
- Dispatch tables and catalogs: starting role/race inventories and attributes,
  the eleven checked-in fresh-matrix recipes, command binding tables, and
  monster movement/action flags.
- Reachable helpers: the completed pre-audit source inventory plus the full
  audit's independent correctness, readability, tests, concurrency, and
  variable-flow traces established the four omitted gameplay branches and six
  evidence/tooling gaps below.
- JavaScript cross-check: searched fixed encumbrance assumptions, timeout
  admission, elapsed-turn increment order, unconditional trapped-monster
  resolution, retry snapshots, audit prompt validation, pet naming oracles,
  and exercise threshold tests.
- Remaining limits: the encumbrance implementation must trace every branch of
  the three weight helpers reachable for a fresh unpolymorphed, unmounted hero;
  source branches requiring later inventory mutations, polymorph, mounts, or
  containers remain outside only if they are proven inert or rejected before
  this boundary.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `weight_cap` / `inv_weight` / `near_capacity` after WEAK | A valid near-capacity starting inventory can cross the first encumbrance threshold after `newuhs` reduces temporary Strength | `js/hack.js`; consumers in `js/allmain.js` and `js/display.js` | Capacity status, movement allocation, regeneration, hunger, exercise, later RNG | Source-shaped live capacity owner; atomic multi-cycle planning; direct weakness-to-burden integration oracle | done | None |
| Basal luck prefix of `nh_timeout` | Move 600 is live; a starting Archeologist fedora changes basal luck before timeout/property work | `js/timeout.js:nh_timeout_elapsed_turn` | `u.uluck`, later `rnl` behavior | Exact fedora and luckstone unit oracles plus fresh Archeologist move-600 differential | done | None |
| Billion-move capitulation | Runs immediately after incrementing moves and before `hero_seq` or upkeep | `js/allmain.js:finishElapsedTurn` | urgent message, ESCAPED termination, no later state/RNG | Exact terminal-state, message, and no-later-upkeep oracle | done | None |
| `m_move` trapped-monster prologue | `mintrap` runs only when `mtrapped`; ordinary, eating, and tame monsters skip it | `js/monmove.js:m_move` | callback/order and unsupported trap work | Trapped fixture plus fail-fast untrapped eating and tame fixtures | done | None |
| Roadmap/checklist source of truth | Reopened implementation requires an active checklist; closure must not retain a broken required-reading reference | `ROADMAP.md` and this checklist | contributor handoff | Reopened checklist and current roadmap status; reconcile at closure | done | None |
| Sealed-data prompt prohibition | Safe path-free wording must be explicitly negative | `scripts/audit-worktree.mjs:validatePrompt` | audit safety gate | Accept explicit prohibition; reject positive imperative with the same noun phrase | done | None |
| Complete second-turn retry snapshot | Expanded retry tests depend on every live parser/program/output owner | `scripts/second-turn-snapshot.mjs` | parser, `did_nothing_flag`, `disp`, `iflags`, `program_state` | Owners included in canonical digest; one-field mutation sensitization | done | None |
| Physical-command retry snapshot | Atomic rejection also owns full monster state, display RNG, and pending recorder state | `scripts/cmd.test.mjs:heroCommandRetrySnapshot` | monster fields, `displayCtx`, pending frames and RNG index | All owners included and individually sensitized | done | None |
| Starting-pet swap names | All three starting species reach successful swap | `scripts/uhitm.test.mjs` | exact `x_monnam` message | Exact kitten, little dog, and saddled pony messages | done | None |
| Non-Wisdom exercise threshold | Move-600 attribute check reaches both threshold formulas | `scripts/hero-attributes.test.mjs` | attribute change and truncating exercise decay | Paired draw-3 Strength miss and Wisdom success with exact decay | done | None |
| Manual-search boundary contract | ROADMAP excludes every command except wait and walk; the prior checklist accidentally admitted search | `ROADMAP.md`; this checklist; `js/cmd.js` | Fail-closed command admission and maintainer handoff | Boundary reconciled without expansion; existing two-attempt physical-byte oracle remains exact | done | None |
| Planned monster-generation globals | Burdened multi-cycle preflight can generate a monster before live admission | `js/unported_monster_actions.js:planningState` | `mvitals`/`svm`, `flags.made_fruit`, `gl.light_base`, owner aliases | Owners cloned with alias and light-ID remapping; success and later-rejection isolation oracle | done | None |
| Physical exercise message ordering | Strength and Constitution exercise synchronously call `encumber_msg` in C | `js/attrib.js:exercise`; `exerper`; `exerchk` | Message wait, `go.oldcap`, status dirty flag, later RNG/output | Awaited call chain and gated ordering oracle | done | None |
| Parsed-command dispatch ownership | One retained parsed command is one logical dispatch across every retry and eventual completion | `js/cmd.js:rhack` | `_commandDispatchCount`, pending command, retry digest | Two rejections and eventual completion retain one dispatch | done | None |
| Adversarial sealed-data prompt grammar | Direct prohibitions pass; reversal and double-negative instructions fail | `scripts/audit-worktree.mjs:validatePrompt` | Formal-review safety gate | Immediate direct-operation grammar plus two reversal tests | done | None |
| Exact-head checklist lifecycle | A committed Implementation checklist must not contradict a green ROADMAP handoff | `.agents/implementation-checklist.md`; `ROADMAP.md` | Formal-review readiness | Full audit finding 5 | missing | Preserve implementation history, then retire the active checklist at closure and supply an exact-head snapshot |
| Capacity retry snapshot owners | `near_capacity` and `encumber_msg` make `gw` and `go` live retry state | Both canonical retry snapshots | `gw.wc`, `go.oldcap` | Both owners included, sensitized, and pinned in strict fixture digests | done | None |
| Exercise contract documentation | Inventory remains stable but effective-attribute capacity is live | `js/attrib.js:exerper` comment | Shared ownership contract | Contract now separates stable inventory from live effective Strength | done | None |
| Burdened terminal planning order | Move-limit termination precedes region/search upkeep and stops later planned rounds | `js/allmain.js:finishElapsedTurn`; `preflightSimpleMonsterActions` | Terminal state, unsupported seams, later mutation/RNG | Terminal result propagation with burden, active search, and a later region | done | None |
| Read-only capacity admission | Preflight must not update live `gw.wc` before an unsupported monster action is admitted | `js/hack.js`; `js/allmain.js:advanceElapsedTurn` | Capacity cache and retry atomicity | Read-only projection plus stale-cache rejection oracle | done | None |
| Billion-turn output oracle | Terminal evidence must pin pending-message acknowledgement and final message/cursor order | `scripts/allmain-turn.test.mjs` | TTY and recorder output plus no later upkeep | Two acknowledgements, recorder-final frame/cursor, terminal state, and repeated no-op pinned | done | None |
| Real weakness-to-burden transition oracle | Begin HUNGRY with an independently calculated threshold inventory and continue through the next allocation | `scripts/allmain-turn.test.mjs` | Strength penalty, capacity class, moves, hunger, messages, RNG/output | Independent 550-to-525 capacity arithmetic, one-unit threshold, real transition, next two allocations | done | None |
| Fedora conjunction controls | The basal bonus requires both Archeologist and worn fedora | `scripts/timeout.test.mjs` | Basal luck | Non-Archeologist fedora and helmet-negative Archeologist controls | done | None |

## Missing work by owner

Only the exact-head checklist lifecycle remains open. Manual search is not
implementation work: it remains an atomic future boundary under ROADMAP.

## Validation

- Commit checked: pending post-audit remediation commit
- Source review: each gameplay row traced against the cited upstream function
  and its call order.
- Focused tests: all reopened production, safety, and oracle contracts pass.
- Full suite: 1,668 tests pass.
- Generated-file checks: monsters, objects, symbols, and themed-room data pass.
- Fresh differentials: 12 segments; 83,269 PRNG calls; 2,351 screens and
  cursors.
- Development suite: unchanged at 0/33 sessions; 98,385/610,816 PRNG calls;
  250/7,765 screens and cursors.
- Quality check: pending after remediation.
- Browser check: not required because these changes are in the shared Node and
  browser game engine without browser-only behavior.

## Readiness

Current mode: Implementation

Reason: the full audit confirmed planning isolation, ordering, retry, oracle,
and handoff gaps. Every grouped row above must be closed before re-audit.
