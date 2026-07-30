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
- Remaining limits: the worker has not yet traced `rhack()`'s dispatch of the
  `s` binding, nor confirmed which state object owns `already_found_flag`
  across segments. `canspotmon` resolves through `js/startup_a11y.js:1637`
  rather than a `display.h` owner, which needs checking before the preflight
  relies on it.

## Status values

The template's definitions apply unchanged.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `dosearch()` 2095-2104 | Entry point for both `s` and `#search`; runs before any `rnl()` | `js/cmd.js`, new `dosearch()` | Reads and sets `already_found_flag`; returns ECMD_TIME or ECMD_OK | `cmdSafetyPrevention` ported at `js/cmd.js:178` | missing | Port it and decide the flag's owner |
| `s` and `#search` admission | `ADMITTED_COMMANDS` at `js/cmd.js:384` refuses `search` today | `js/cmd.js` | None until admitted | Read at `aa5516a` | missing | Admit both once the preflight lands |
| `dosearch0()` `aflag == 0` preflight | Must settle all eight squares before the loop's first `rnl()` | `js/detect.js dosearch0()` | None on the refusal path | This file's Boundary section | missing | Build it from the exclusion list |
| `dosearch0()` `u.uswallow` `!aflag` arm | `u.uswallow` set | `js/detect.js dosearch0()` | `Norep()` output | detect.c:2020-2022 | missing | Fail closed in the preflight |
| `dosearch0()` `feel_location()` arm | `!aflag && (Blind \|\| visible_region_at())` | `js/display.js feel_location()` | Screen writes before the SDOOR test | `js/display.js:1384` owns the blind-obstacle subset only | missing | Fail closed in the preflight |
| `dosearch0()` SDOOR and SCORR arms | Already ported for `aflag == 1`; `rnl(7 - fund)` per square | `js/detect.js dosearch0()` | `rnl()`, conversion, Wisdom, `nomul(0)`, message | `js/detect.js:613-637` | undecided | Confirm the `aflag == 0` path reuses them unchanged |
| `mfind0(mtmp, 0)` return 0 | Adjacent spotted monster, no discovery; runs before the trap `rnl(8)` | `js/detect.js`, new `mfind0()` | `newsym(x, y)` only | detect.c:1971-1992 | missing | Port the common arm |
| `mfind0()` discovery arms | `M_AP_TYPE`, `!canspotmon()`, or `mundetected` hider | None | `seemimic()`, `map_invisible()`, Wisdom, message | `map_invisible` and `seemimic` absent from `js/` | missing | Fail closed in the preflight |
| `mfind0()` `via_warning` arms | Only `warnreveal()` passes 1 | None | Danger-sense message | detect.c:1969-1970, 1988-1991 | cannot-occur | None; `dosearch0()` passes 0 |
| `unmap_invisible()` FALSE arm | `glyph_is_invisible()` false, which holds while `map_invisible()` is excluded | `js/display.js`, new `unmap_invisible()` | None | display.c:387-396 | missing | Port it; fail closed on the TRUE arm |
| `dosearch0()` trap arm | `t_at() && !tseen && !rnl(8)`; ported for `aflag == 1` | `js/detect.js dosearch0()` | `rnl(8)`, `nomul(0)`, `find_trap()` or statue trap | `js/detect.js:639-653` | undecided | Confirm reuse; statue traps stay excluded |

## Missing work by owner

1. `js/detect.js dosearch0()`: the `aflag == 0` preflight, the `u.uswallow`
   arm, the `feel_location()` arm, and confirmation that the SDOOR, SCORR, and
   trap arms are reused unchanged. Everything else depends on the preflight, so
   it comes first.
2. `js/detect.js mfind0()`: the return-0 arm and a fail-closed discovery arm.
3. `js/display.js unmap_invisible()`: the FALSE arm, failing closed on TRUE.
4. `js/cmd.js`: `dosearch()`, the `already_found_flag` owner, and admitting
   `s` and `#search`.

## Validation

- Commit checked: pending
- Source review: pending
- Focused tests: pending
- Full suite: pending
- Generated-file checks: pending
- Fresh differentials: pending. The planned matrix is `s` with the starting pet
  adjacent, `s` on a bare corridor square with no adjacent monster, `s`
  adjacent to an SDOOR both missing and succeeding on `rnl(7 - fund)`, `s`
  adjacent to an unseen non-statue trap, repeated `s` to pin
  `already_found_flag`, and `#search` by name. New seeds, canonical
  `America/New_York`, committed as a runner.
- Development suite: pending
- Quality check: pending
- Browser check: not required; this changes no browser-specific code, DOM, CSS,
  input, storage, or renderer contract

## Readiness

Current readiness: `Implementation`

Reason: every production row is `missing` or `undecided`, and no validation has
run at any committed head.
