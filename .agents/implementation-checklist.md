# Implementation checklist: the explicit search command

## Boundary

- Roadmap item: `In progress: search`
- Starting code commit: `aa5516aa` (`Open the search goal`)
- Starting event: the `s` keystroke at a command prompt, and the same command
  reached by name through `#search`
- Ending event: the next command prompt after the ECMD_TIME turn that
  `moveloop_core()` already runs
- Valid inputs: `s` bound to `search`; `#search` typed at the extended-command
  prompt; a sighted hero on D:1 with the adjacent squares this slice admits
- Observables: the `rnl()` call sequence and its arguments, Wisdom exercise,
  `nomul(0)`, the secret-door and secret-passage conversions, the messages
  `You find a hidden door.` / `You find a hidden passage.` / `You find <mon>.`,
  complete 24x80 screens and attributes, cursor position, and persisted state
  through the next prompt
- Exclusions, each of which must fail closed in a preflight over all eight
  adjacent squares before the loop's first `rnl()`:
  - `u.uswallow`, whose `!aflag` arm prints through `Norep()`;
  - `Blind || visible_region_at(x, y)`, which reaches `feel_location()`;
    `js/display.js:1384 feel_location()` owns only the blind-obstacle subset
    and throws otherwise;
  - an adjacent monster with `M_AP_TYPE` (`seemimic()`), one failing
    `canspotmon()` (`map_invisible()`), or a `mundetected` hider, under-hider,
    or `S_EEL`;
  - `unmap_invisible()`'s TRUE arm, which needs `unmap_object()`.
  - `warnreveal()`'s `mfind0(mtmp, 1)` caller is outside the slice, so the
    `via_warning` arms are unreachable from this consumer rather than excluded.

The preflight's position is the constraint that shapes this slice.
`dosearch0()` calls `rnl()` per square inside the loop, so a refusal decided at
the fifth square has already consumed randomness for the first four. Every
exclusion above must therefore be settled over the whole 3x3 before the loop
starts. The existing `aflag == 1` owner resolves its unsupported cases
*inside* the loop and after the source `rnl()` succeeds
(`js/detect.js:609-611`), which is correct for that path and wrong for this
one; do not copy that shape.

Two exclusions were added during implementation, both for the same reason:
`preflightTrap()` and the two secret-terrain preflights are capability checks
the `aflag == 1` owner runs inside the loop, so `preflightExplicitSearch()`
runs all three over the whole 3x3 as well. That is what moves an adjacent
unseen `STATUE_TRAP`, and a hallucinating hero's trap discovery, ahead of the
first `rnl()`.

The `You find <mon>.` message listed under Observables turned out to be
unreachable from this consumer. `mfind0()` prints it only when
`found_something` holds, and every input that sets `found_something` is on the
exclusion list above, so the slice's `mfind0()` covers the `return 0` arm
alone.

## How the candidate list was built

A slice-selector traced the upstream functions and I spot-checked every
location it named against `nethack-c/upstream/` and `js/`. The rows below carry
that tracing. The worker extends the table as its own source review and fresh
differentials expose candidates.

- Upstream entry points: `detect.c dosearch()` (2095-2104),
  `detect.c dosearch0()` (2015-2093), `detect.c mfind0()` (1964-2013),
  `display.c unmap_invisible()` (387-396)
- Dispatch tables and catalogs: `cmd.c cmdlist[]` for the `s` binding and
  `extcmdlist[]` for `#search`; the `levl[x][y].typ` families `SDOOR`, `SCORR`,
  and everything else the final `else` arm covers
- Reachable helpers: traced from `dosearch()` through `dosearch0(0)` and
  `mfind0(mtmp, 0)`, including `cmd_safety_prevention()`, `feel_location()`,
  `visible_region_at()`, `cvt_sdoor_to_door()`, `recalc_block_point()`,
  `unblock_point()`, `feel_newsym()`, `find_trap()`,
  `activate_statue_trap()`, `canspotmon()`, `sensemon()`, `seemimic()`,
  `map_invisible()`, `unmap_object()`, and `exercise(A_WIS, TRUE)`
- JavaScript cross-check: `grep -rn` over `js/` for each helper name.
  `cmdSafetyPrevention` is ported at `js/cmd.js:178` and `visible_region_at` at
  `js/region.js:688`. `map_invisible`, `seemimic`, `unmap_object`, and
  `glyph_is_invisible` return no hits at all, which is what makes the
  discovery arms exclusions rather than work. `already_found_flag` returns no
  hits; `cmdSafetyPrevention` models C's `int *` through a `flagName` string,
  so the worker decides where that flag lives.
- Resolved limits: `rhack()`'s dispatch of the `s` binding follows the `#`
  arm's shape, applying the same three `ECMD_*` tests C applies at
  `cmd.c:3810-3818`, because `dosearch()` returns a result rather than a
  Boolean. `already_found_flag` lives on the game state beside
  `did_nothing_flag`, matching C, where both are plain `ga`/`gd` globals that
  no save file carries and a new process zeroes; a segment is a new process,
  so nothing has to persist. `canspotmon` resolves through
  `js/startup_a11y.js canSpotMonster()`, whose `canSeeMonster()` half applies
  `display.h mon_visible()`'s `!mundetected` term, which is why a hidden
  monster fails both `mfind0()` arms and the preflight tests the narrower one
  first.

## Status values

The template's definitions apply unchanged.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `dosearch()` 2095-2104 | Entry point for both `s` and `#search`; runs before any `rnl()` | `js/detect.js dosearch()` | Reads and sets `already_found_flag`; returns ECMD_TIME or ECMD_OK | Focused test at `scripts/detect.test.mjs`; matrix segments 11-13 | ported | None |
| `s` and `#search` admission | `ADMITTED_COMMANDS` at `js/cmd.js` now lists `search` | `js/cmd.js rhack()` and `doextcmd()` | None until admitted | Matrix segments 1 and 2 | ported | None |
| `dosearch0()` `aflag == 0` preflight | Settles all eight squares before the loop's first `rnl()` | `js/detect.js preflightExplicitSearch()` | None on the refusal path | Six focused tests assert an empty draw list on refusal | ported | None |
| `dosearch0()` `u.uswallow` `!aflag` arm | `u.uswallow` set | `js/detect.js preflightExplicitSearch()` | `Norep()` output | detect.c:2020-2022 | fail-closed | None |
| `dosearch0()` `feel_location()` arm | `!aflag && (Blind \|\| visible_region_at())` | `js/detect.js preflightExplicitSearch()` | Screen writes before the SDOOR test | `scripts/cmd.test.mjs` blind-hero boundary case | fail-closed | None |
| `dosearch0()` SDOOR arm | Shared with `aflag == 1`; `rnl(7 - fund)` per square | `js/detect.js dosearch0()` | `rnl()`, conversion, Wisdom, `nomul(0)`, message | Matrix segments 5-7 find the door end to end | ported | None |
| `dosearch0()` SCORR arm | Shared with `aflag == 1`, unchanged by this slice | `js/detect.js dosearch0()` | `rnl()`, `CORR`, Wisdom, `nomul(0)`, message | Focused test only; see "No fresh case for SCORR" | ported | Record a fresh case when a level with an adjacent secret corridor is reachable |
| `mfind0(mtmp, 0)` return 0 | Adjacent spotted monster, no discovery; runs before the trap `rnl(8)` | `js/detect.js mfind0()` | `newsym(x, y)` only | detect.c:1971-1992; matrix segment 3 | ported | None |
| `mfind0()` discovery arms | `M_AP_TYPE`, `!canspotmon()`, or `mundetected` hider | `js/detect.js preflightSearchMonster()` | `seemimic()`, `map_invisible()`, Wisdom, message | Five focused refusal cases, one per species test | fail-closed | None |
| `mfind0()` `via_warning` arms | Only `warnreveal()` passes 1 | `js/detect.js mfind0()` throws | Danger-sense message | detect.c:1969-1970, 1988-1991 | cannot-occur | None; `dosearch0()` passes 0 |
| `unmap_invisible()` FALSE arm | `glyph_is_invisible()` false, which holds while `map_invisible()` is excluded | `js/display.js unmap_invisible()` | None | display.c:387-396 | ported | None |
| `unmap_invisible()` TRUE arm | Needs `unmap_object()` | `js/detect.js preflightExplicitSearch()` refuses; `js/display.js` throws | Would clear remembered `I` | display.c:391-393 | fail-closed | None |
| `dosearch0()` trap arm | `t_at() && !tseen && !rnl(8)`; shared with `aflag == 1` | `js/detect.js dosearch0()` | `rnl(8)`, `nomul(0)`, `find_trap()` | Matrix segments 8-10 find three trap types | ported | None |
| `dosearch0()` statue-trap arm | `activate_statue_trap()` is unported | `js/detect.js preflightExplicitSearch()` | Would animate a statue | `preflightTrap()` at `js/detect.js` | fail-closed | None |
| `set_occupation()` under a count | `extcmdlist[]` gives `search` the occupation text `searching` | None | Repeats the search for `multi` turns | cmd.c:3739-3740 | cannot-occur | None; the admission seam parses no count, so `multi` is 0. `wait` carries the only other occupation text and is admitted on the same terms |

## Findings outside the slice

Three limits were measured while validating and belong to other owners.

1. **Finding a secret door can stop the next turn.** Converting an SDOOR whose
   square is in current vision sets `vision_full_recalc`, and
   `preflightSimpleMonsterActions()`'s cloned scan then refuses
   `visionRecalc` with `monster light-source vision recalculation`
   (`js/unported_monster_actions.js:618`). The live scan supplies the real
   `vision_recalc`; only the dry run cannot. Of 40 candidate seeds with an
   adjacent secret door, 21 stopped that way at the search that found it. The
   matrix therefore uses the seeds whose door is out of current vision. This is
   the monster-scan and vision subsystem's debt, not the search command's.
2. **The `m` prefix paints a frame the port does not.** `m.` and `ms` both
   diverge at the prefix keystroke itself: C emits a screen and a cursor for
   `m`, the port emits none. Reproduced at seed 9300001 with `m..`, which fails
   the same way with `wait` as with `search`, so it predates this slice.
   `reqmenu` prefix handling owns it.
3. **No fresh case for SCORR.** 28,000 generated levels across two seed ranges
   produced no hero with an adjacent secret corridor at the first command
   prompt, and no straight-line walk of up to eight steps over 400 seeds
   reached one either. Secret corridors are generated by `dig_corridor()`'s
   extra-corridor pass, which puts them away from a room the hero starts in.
   The arm is shared with `aflag == 1` and unchanged by this slice, and its
   focused test pins the source operation order, but it has no end-to-end
   evidence.

## Validation

- Commit checked: pending the slice commit; every figure below measured at the
  working tree that commit contains
- Source review: done. `detect.c` 1964-2104 and `display.c` 375-396 read in
  full, plus `cmd.c rhack()` 3627-3843, `include/display.h` 95-134, and
  `win/tty/getline.c` 275-320 for the `#search` lookup.
- Focused tests: `scripts/detect.test.mjs` (10 new cases),
  `scripts/cmd.test.mjs` (1 new case), `scripts/explicit-search.test.mjs`
  (4 new cases). Every one was observed failing against a mutation of the line
  it covers before being kept.
- Full suite: 1,852 tests pass.
- Generated-file checks: all four pass, plus `check:namespace-members`.
- Fresh differentials: `scripts/run-explicit-search.mjs`, committed as a
  runner. 13 segments, 35,560 PRNG calls, 80 screens and 80 cursors, all
  matching. It covers the bare-square base case, `#search` by name, an adjacent
  pet, a corridor square, three secret-door finds at eight, six and one search,
  three trap finds at three, three and one search, and both `cmdassist`
  branches of `cmd_safety_prevention()`.
- Development suite: 433 of 7,765 screens and 99,552 PRNG values, against 398
  and 99,496 at `3011535`. Five sessions improved, none regressed, and
  `seed8000-tourist-starter` now matches completely, taking the fully matched
  count from 0 to 1.
- Quality check: the orchestrator's to run.
- Browser check: not required; this changes no browser-specific code, DOM, CSS,
  input, storage, or renderer contract.

## Readiness

Current readiness: `Ready for audit`

Reason: every production row is `ported`, `fail-closed` or `cannot-occur`; the
real consumer runs from both the `s` key and `#search`; and the fresh matrix,
the full suite and the development score were all measured at the tree the
slice commit contains.
