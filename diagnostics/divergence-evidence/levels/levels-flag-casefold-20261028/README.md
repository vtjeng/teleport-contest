# ASCII level flag dispatch: bounded negative

JS lcase replaces C strcmpi for recognized ASCII flag names; the extra helper is equivalent case normalization in this tested domain.

Exact C lspo_level_flags, strncmpi and lowc bodies with fixed string-stack adapters match public JS des.level_flags in 54 comparisons: 18 names, three ASCII case spellings. Level-flag storage only; no Unicode, embedded NUL, coder-private flags, errors or finalization claims.

Control: 18 lowercase names versus 36 uppercase/alternating-case variants.

## Clean-base reproduction

1. Check out Main `b313cde5b50f3c5b5e8f622ff32418cbc1ae12be`, with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into the checkout without modifying gameplay.
3. Use existing Node 24.19.0 and Clang 19.1.7 (managed environment: `source /workspace/.setup/activate.sh`). No downloads or Lua dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-flag-casefold-20261028/probe.mjs target` (expected 0).
5. Run `node diagnostics/divergence-evidence/levels/levels-flag-casefold-20261028/probe.mjs control` (expected 0).
6. Run `node --test scripts/test-suites.test.mjs`.

Target: 36 uppercase/alternating-case calls; control: 18 lowercase calls. Exact C flag writer and case comparison execute with fixed string-stack inputs; JS executes public des.level_flags after startup and solidfill. Only the selected level flag storage is compared.

Limitations: Tested recognized ASCII names only; no Unicode, embedded NUL, error paths, private coder flags, or finalization/runtime effects. Fixed string-stack adapter; no Lua interpreter execution. Shipped exposure remains unestablished.

Original scan run `ea2181cadbad5793b4be`, SHA `b087d8cb44d510370100ae2b193e7caebc770402333397612e5035ee0f5d2de8`. Official exporter verifies one active key becomes filtered; original identity/fingerprint and compact projection are retained. The specific JS function is byte-identical to the scan base. Eight unrelated stale reviews are not revived.

This two-case batch brings the frozen 523 permitted entries to 10 current negative keys, 1 candidate key, 8 stale bindings, and 504 without a current disposition. Raw count remains 571; 44 Main-owned overlaps remain routing notes. Numeric-string/gradient gaps stay unresolved; replace_terrain source inspection alone adds no disposition.
