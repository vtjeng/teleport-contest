# Bounded static command catalog — 2026-10-28

JS/main: `32578f23091dad34635a9b4fe0bfb45ed9840e39`.
C gitlink/checkout: `16ff59115315917b93185d026aeefea06db9b0f4`.

This new audit parses source text only. It never imports game modules, executes
handlers, runs the recorder, supplies inputs, or probes command queues, repeats,
coordinate descriptions, or game output. No prior commands evidence was used.
No gameplay edits, score claims, or equivalence claims are made.

## Finite coverage

- C `extcmdlist[]`: 171 initializers = 170 named declarations + null sentinel.
  JS `extcmdlist`: 170 row declarations. 41 names per side are excluded before
  value comparison. All 129 retained names and description labels match.
  122 default key bytes match; seven symbolic C key expressions remain
  unexamined: seeamulet, seearmor, seerings, seetools, seeweapon, showgold,
  showspells. Their labels still match. No symbol tables were investigated.
- C `commands_init` explicit `bind_key` literals / JS `SOURCE_COMMAND_ALIASES`:
  15 C declarations (including one disabled `#if 0` wait row), 14 JS rows.
  Exclude run, rush, overview, and disabled wait. The remaining 11 rows across
  10 command names match, including both name aliases. No binding precedence,
  runtime remapping, or configuration behavior is inferred.
- C `spkeys_binds` / JS `SOURCE_SPECIAL_KEY_DEFAULTS`: escape and count match.
  All 27 getdir/getpos entries per side are excluded; the observations list
  their names and locations without comparing their values.
- C and JS `yn_function_menu`: all eight literal option key/label pairs match
  (Right, Left, Hide, Spin a web, Yes, No, All, Quit). Menu display eligibility,
  formatting, defaults, ordering effects, and selection behavior are unexamined.

`observations.json` includes normalized values and 1-based source locations for
every compared declaration, the complete excluded-name inventory, source SHA256
hashes, finite counts, and comparison dispositions. Zero static mismatches were
found in compared fields. A key-unexamined row is not a full matching row.

## Representation mappings and limitations

The ordinary `.mjs` runner copies only lexical utilities from the pinned
`scripts/generate-extcmds.mjs`; it does not execute or import that generator.
C character literals become byte integers; `C(c)` maps to `c & 0x1f`, `M(c)`
to `c | 0x80`. JS hexadecimal integers are compared numerically. Alias `^x`
and `M-x` spellings use the same mapping. C `NHKF_ESC`'s null binding-name
entry is explicitly paired with JS `escape`; octal `\033` and JS `\x1B`
normalize to 27. Concatenated C string literals join without added whitespace.
Names and label text are case-sensitive. Handler identifiers, flags, occupation
strings, and implementations are not compared or interpreted.

This is an uncompiled declaration inventory: C preprocessor alternatives are
not selected, and runtime availability is not asserted. Repeated same-name
rows would be compared as sets of field tuples; this command inventory has no
such duplicate rows. The alias inventory retains both keys for name.

The exclusion expression is intentionally broad and is recorded in the runner.
It also excludes repeat (the substring `eat`), movement/run/rush, overview,
whatdoes, and adjacent command menus. Excluded entries are not negative evidence.
Other menu literals, dynamically composed menus, mouse bindings, directional
layouts, reset/remapping logic, user configurations, handler aliases inferred
from shared functions, and all runtime semantics are outside this finite pass.
All previously denied investigation topics remain out of scope.

## Reproduce and controls

From repository root, with C checked out at the pinned gitlink:

```
node diagnostics/divergence-evidence/command-catalog/static-20261028/reproduce.mjs
node --test scripts/test-suites.test.mjs
```

The reproducer compares its deterministic result byte-for-byte to the saved
observations. `--write` regenerates that file. Its source hashes fail the saved
comparison if relevant source bytes change. Equal and unequal synthetic records
exercise both comparison outcomes; exclusion and exact inventory-count assertions
prevent an empty or unexpectedly narrowed pass. These are parser controls only.
The existing test-layout guard passes. No `.test.mjs` files were added.

`case.json` follows the field conventions of the accepted levels evidence at
this pinned main, with runtime fields explicitly inapplicable and `ready: false`
(no gameplay repair handoff). No pending PR #84 validator was copied or assumed.
