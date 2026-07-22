---
name: survey-boundary-coverage
description: Survey source-to-port coverage at a defined behavioral or roadmap boundary. Use when Codex needs to inventory remaining implementation paths, prove a milestone complete, enumerate reachable fallbacks, unsupported branches, replay seams, source handlers, or configuration families, or answer whether a boundary is ready to close. Produce a read-only evidence matrix from NetHack upstream and fresh differentials, then cluster confirmed gaps by shared ownership. Do not use for in-game item inventory, correctness review of a committed diff, or work beyond the selected boundary.
---

# Survey Boundary Coverage

Establish whether every source path reachable before a chosen boundary has a
source-faithful implementation. Treat this as a completeness survey, not a
formal correctness audit and not NetHack item-inventory work.

## Guardrails

- Read the applicable `AGENTS.md` and `ROADMAP.md` before surveying.
- Use `nethack-c/upstream/` as the behavior authority and
  `nethack-c/patches/` for recorder-specific behavior.
- Never access `sessions/holdout/` or run the holdout scorer. Use development
  sessions only as regressions, never to define the candidate universe.
- Keep the survey phase read-only. Do not edit source, trackers, the roadmap,
  or the quality ledger while constructing or validating the matrix.
- Stop at the selected behavioral boundary. Include later behavior only when
  needed to prove that a candidate is outside the boundary.
- Do not infer support from parser acceptance, a registered handler, passing
  development recordings, or the absence of an explicit error.
- If the user also requests fixes, finish and report the survey first. Then
  implement only confirmed, in-boundary clusters through the normal project
  workflow.

## Workflow

### 1. Fix the boundary

State the exact behavior being closed, its success criteria, valid input
dimensions, expected observable parity, and excluded later work. Use the
earliest open `ROADMAP.md` milestone when the user has not supplied a narrower
boundary and the repository makes the choice unambiguous.

### 2. Build the candidate universe

Derive candidates independently from the authoritative source rather than
starting only from current JavaScript. Use the relevant source catalogs,
dispatch tables, descriptors, option tables, and valid configuration space.
Cross-check them against implementation sentinels such as fail-closed paths,
unsupported branches, fallbacks, no-ops, and replay scaffolding.

Record how the universe was made exhaustive. A search hit is a candidate, not
a finding. Choose candidate units that follow stable source ownership or
dispatch boundaries; do not split them merely to match current files.

### 3. Trace each candidate end to end

Trace:

1. Source eligibility, short circuits, and ordering.
2. Parsing or selection and dispatch.
3. State ownership and persistence.
4. PRNG and evaluation order where applicable.
5. Rendering, cursor, message, or input-boundary effects before the cutoff.

Prove why a path is or is not reachable before the boundary. Reopen generated
sources or data projections when they define the candidate set.

### 4. Classify consistently

Assign exactly one status to every candidate:

- `covered`: source-equivalent behavior has direct or differential evidence;
- `source-inert`: valid configuration has no effect before this boundary;
- `outside-boundary`: first source effect occurs after the cutoff;
- `unreachable`: the supported source build or valid-input predicates exclude it;
- `confirmed-gap`: source tracing and reproduction establish missing or
  divergent in-boundary behavior;
- `unverified`: evidence is insufficient to decide.

A JavaScript guard or fallback is not itself a status. Classify it from the
source reachability and observable behavior.

### 5. Confirm suspected gaps

Require source evidence plus a focused reproduction. For nontrivial reachable
behavior, use newly chosen strict C-versus-JavaScript recordings and compare
PRNG logs, complete 24-by-80 screens and attributes, and cursor positions.
Exercise the valid option or configuration dimensions relevant to the path.

If no valid natural case reaches the candidate, keep it `unverified`; do not
call it covered. Do not weaken fresh-recipe or sealed-path protections to make
a case easier to produce.

### 6. Cluster confirmed gaps

Group gaps by shared upstream owner, state contract, lifecycle, or dependency.
Recommend the smallest coherent source subsystem that closes the group while
preserving roadmap and source-dependency order. Keep unrelated gaps separate,
even when one recording exposes them together.

### 7. Decide closure

Call the behavioral boundary ready only when:

- every candidate has a supported classification;
- no reachable candidate remains `confirmed-gap` or `unverified`;
- the boundary's required broad fresh differentials pass; and
- no known fallback, replay seam, or unsupported source branch remains live
  before the cutoff.

Report formal quality, simplification, correctness, and score gates separately.
This survey does not satisfy an audit, advance a quality frontier, close a
roadmap milestone, or authorize gameplay beyond the boundary.

## Output

Return this structure:

1. **Boundary**: behavior, inputs, observables, and exclusions.
2. **Universe**: candidate sources and the exhaustiveness argument.
3. **Coverage matrix** with columns for candidate or family, source authority,
   JavaScript path, reachability, evidence, status, and next action.
4. **Counts** by status.
5. **Confirmed clusters** in recommended dependency order.
6. **Unverified items and limitations**.
7. **Closure verdict** and any separate quality gates still due.

Call the result a boundary coverage survey or coverage matrix. Reserve
“audit” for the repository's formal audit skills. If the survey finds no gaps,
state the bounded evidence and uncertainty rather than claiming correctness
beyond the candidate universe.
