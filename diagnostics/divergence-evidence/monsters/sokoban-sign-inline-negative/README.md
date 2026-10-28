# Sokoban sign helper: scoped explained negative

The scanner's C-only `m_avoid_soko_push_loc -> sgn` edge has an explicit JS
replacement: `Math.sign`. For valid integer map coordinates the three possible
sign results select the same intervening square. This is not a missing call.

```
node --test diagnostics/divergence-evidence/monsters/sokoban-sign-inline-negative/probe.test.mjs
```

Requires Node and a C99 compiler (`cc`, or `CC`). The test extracts unmodified
`sgn` and `m_avoid_soko_push_loc` from pinned upstream source and compiles an
isolated C predicate driver. The wrapper models the exact fields and one floor
boulder; `dist2` is the integer squared-distance expression. This is not a full
C gameplay recording. JS uses the production avoidance function and GameMap
floor-object grid, without replacing `sobj_at` or the avoidance predicate.

All four cardinal candidates two squares from the hero are avoided when a
boulder lies between them. Controls cover diagonal distance, wrong boulder
square, non-Sokoban level, hostile versus tame monster, confusion, stun and
Conflict. C and JS agree in all 12 rows. These are supported local predicate
states (peaceful/tame monster beside a Sokoban boulder); no layout-generation
or complete movement-path equivalence is claimed.

Scope is this call site with valid integer coordinates. Do not infer equivalence
of arbitrary JavaScript Math.sign inputs such as NaN or nonnumbers, or suppress
other Sokoban, boulder, pathfinding or property-gate leads. The C `Sokoban`
macro reads `level.flags.sokoban_rules`, matching this JS gate. The distance
condition makes only cardinal displacement possible; negative, positive and
zero sign components are all exercised.

`case.json` binds the exact old scanner observation to the shared immutable run
from PR #12, includes source hashes and revalidation against main `acec7a757`.
No new scanner run was needed; relevant gameplay sources are unchanged since
that run. No gameplay edits or default-CI tests are included.
