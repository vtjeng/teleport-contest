# Scoped negative: omitted initial count-output reset

C `get_count` sets its output to zero before reading input. JS leaves an explicitly supplied output object unchanged until the count is committed. That difference would matter for a reused nonzero output, but every current production caller (`parse`, `getobj`, `adjust_split`) creates a fresh `{ value: 0 }` immediately before the call.

This is a source-backed negative for the current call-site domain, not API equivalence for arbitrary constructed states. The proof must be revisited if callers or their initialization change. The separate safe-integer overflow divergence remains valid.

The ordinary control types `12`, Escape, then `:`. C and JS match all five screens/cursors and 2,235 RNG calls. That matching seed supplements the call-site proof; it does not establish universal equivalence.

```
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/count-output-initialization/control.recipe.json
node --test diagnostics/divergence-evidence/commands/count-output-initialization/evidence.test.mjs
```

Both commands pass at `cfb72d4699bfe6080b46f21894f929f35b68414f`. This manual lead is explicitly unbound and does not authorize canonical scanner suppression. See `case.json` for source locations, exact fingerprints, scope and control.
