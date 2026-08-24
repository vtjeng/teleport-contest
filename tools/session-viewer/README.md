# Session Viewer

A divergence viewer for the Teleport Coding Challenge that runs
directly in the browser with no build step. It loads a recorded
session and runs the JavaScript port once per segment. Each segment
produces a sequence of steps. The viewer compares each step's PRNG
calls and screen output against the recorded C result and marks
divergences on a timeline and a 24×80 map.

```
┌─ canon ──────────────────────────────────────────────────────┐
│ ▌ ▌ ▌ █ █ ▌ ▌ ▌ ▌ ▌  ← bar height = log2(arg) of each rn2() │
│ ▌ █ █ ▌ █ ▌                                                  │
└─ js ─────────────────────────────────────────────────────────┘
        click anywhere on the timeline to jump to that step

┌─ map (your js port's screen, with diff overlay) ─┬─ details ─┐
│  …NetHack 5.0.0…                                 │  cursor   │
│  …                                               │  rng      │
│  Welcome, Wizard…  (red bg = char wrong)         │  msg line │
│                    (yellow bg = attr wrong)      │           │
│                    (blue cursor markers)         │           │
└──────────────────────────────────────────────────┴───────────┘
```

## Usage

```bash
# from the repository root
python3 -m http.server 8080
# then open http://localhost:8080/tools/session-viewer/ in a browser
```

Pick a session from the dropdown, which lists the development
sessions named in `sessions/manifest.json`, or use the file picker
labeled `or load file…` to load any `.session.json` you have on
disk. The viewer:

1. Fetches the session.
2. Calls `runSegment()` from your `js/jsmain.js` once per segment
   and reads the screens, cursors, and PRNG slices from the
   `NethackGame` instance each call returns.
3. Decodes both the canonical and the JS-port screens into a
   24×80 grid and diffs them per cell.
4. Draws the three timeline rows and the map.

The viewer computes every step's screens, cursors, and PRNG calls
while the session loads. When the user moves to a different step,
the viewer redraws the timeline canvas and rebuilds the map grid
without re-running the port.

## The three panes

**Status line (under the header).** After a session loads, the line
under the header reads `<name> - <n> steps · PRNG <matched>/<total>
· screens <matched>/<total>`. For PRNG, the viewer pairs each step's
canon and js calls in order and counts the pairs whose call name,
bound, and drawn value agree. The total is the sum, across all
steps, of the larger of the two call counts in each step. For
screens, it counts the steps whose characters, attributes, and
cursor coordinates all match, using the same cell-level comparison
that the map and the `screen` strip use. The contest comparator
tests the two screens for exact equality of their canonicalized SGR
(color and attribute escape) strings, so it can reject a screen that
the `screens` count treats as matching.

**Timelines (top).** Three rows sharing one X axis:

- `canon` and `js`: one bar per PRNG call. Where a step has more
  calls than the pixel columns allotted to it, each column draws the
  tallest call it covers. Bar height is proportional to `log2(bound
  + 1)` for `rn2(bound)`, `rnd(N)`, and any other PRNG call that
  takes a bound argument, scaled so that the largest bound in the
  loaded session sets the full bar height. Bar color encodes match
  status:
  - dark sepia (`match` in the legend): both sides made a call at
    this position, and the call name, bound, and drawn value agree
  - red (`value diff`): both sides made a call at this position, and
    the call name, bound, or drawn value differs
  - brown-orange (`canon-only call`): only `canon` made a call at
    this position
  - purple (`js-only call`): only `js` made a call at this position
- `screen`: one column per step, stacked into up to three thin
  bands, one for each difference the step shows:
  - red (`char wrong` in the legend): at least one cell's character
    differs
  - yellow (`attr wrong`): at least one cell's character matches
    while its attribute or color differs
  - blue (`cursor wrong`): the canon and js cursor positions differ

  A step with none of the three differences fills its column with
  the `match` color.

A bold dark-brown vertical bar marks segment boundaries (multi-game
or save+restore sessions). Click anywhere on the timeline to jump to
that step, or hold the mouse button down and drag along it to scrub.
Press ← or → to move one step; hold Shift while pressing either key
to move ten steps.

**Map (center).** A 24×80 viewport with three switchable modes
(buttons above the grid):

- `canon`: the recorded canonical screen, with red, yellow, and blue
  highlights on the cells where the port diverges
- `js`: the port's screen, with the same divergence highlights
- `diff`: the port's screen, except that where the character
  differs and the port rendered a blank, the canonical character is
  shown; the same divergence highlights apply

**Details (right).** The pane holds three blocks. `cursor` prints
the canon and js cursor coordinates and flags a mismatch. `prng
(this step)` lists the step's calls in order, color-coded
`match`/`diff`/`missing`/`extra` (corresponding to the timeline's
`match`, `value diff`, `canon-only call`, and `js-only call` colors).
`message line` prints row 0 of the canonical screen, and the port's
row 0 below it when the two differ.

## Pass/fail decoration

The scoring runner `frozen/ps_test_runner.mjs` writes a
`.cache/session-results.json` advisory file. When this file exists,
each session in the dropdown shows a ✓/✗/· prefix and a tooltip with
its `RNG` (PRNG-call) and `Screen` match counts. Run `npm run score`
to refresh it. Without the advisory file, the prefixes all read `·`.

## URL state

The viewer writes the selected session, the current step, and the
map mode into the URL hash, so a refresh or a shared link reopens
the same session at the same step in the same map mode.

- `#session=<substring>`: picks the first dropdown entry whose name
  contains the substring
- `#step=<n>`: the step to open, counted from zero; the step readout
  counts from one, so `#step=0` opens the step it shows as `step 1`
- `#view=canon|js|diff`: the map mode to open in (default `js`)
- `?js=<url>`: a query parameter, read each time a session loads;
  the viewer imports that module and takes `runSegment` from it, so
  you can use an alternate port. The default is
  `../../js/jsmain.js`.

## What the viewer requires

- The viewer reads `getScreens()`, `getCursors()`, and, when the
  port provides it, `getRngSlices()` from the `NethackGame` instance
  that `runSegment()` returns. Each must return every capture since
  the start of the session, because the viewer indexes into these
  arrays with a per-segment offset. Without `getRngSlices()`, the
  viewer divides the entries from `getRngLog()` into equal-sized
  groups, one per step.
- Sessions live under `sessions/`. The dropdown lists the file names
  in `sessions/manifest.json`; when that fetch fails, the viewer
  reads the `.session.json` links from the server's directory
  listing of `sessions/`. The file picker loads a `.session.json`
  from disk regardless of whether the manifest loaded.
