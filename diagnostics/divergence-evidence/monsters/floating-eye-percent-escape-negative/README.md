# Floating-eye percent escape: scoped explained negative

The discovery edge `passivemm -> strNsubst` is implemented at this JS call site
by `.replaceAll('%', '%%')`. It is not a missing behavior. A visible floating
eye named `Eye%s%` produces the same reflection message as compiled upstream C:

```
Eye%s%'s gaze is reflected by the hill orc's amulet.
```

Run from the repository root (Node and a C99 compiler named `cc` required;
`CC` may select another compiler):

```
node --test diagnostics/divergence-evidence/monsters/floating-eye-percent-escape-negative/probe.test.mjs
```

All three tests pass. The fixture initializes a normal level, uses native hill
orc/floating-eye species, supported naming and inventory owners, and equips the
amulet through `m_dowear`. It calls production `mattackm`, `mon_wield_item`, and
`mon_reflects`, without injecting a reflection implementation. Scripted RNG
answers are legal (dice return at least their number of dice). Removing the
amulet freezes the orc for three turns; the target reflects and stays mobile.
Both leave the eye at 7 HP. The original pyrolisk scaffold was replaced before
classification because animal armor restrictions would not support that setup.

`c-oracle.mjs` extracts the actual `s_suffix` and `strNsubst` definitions from
pinned upstream `hacklib.c`, compiles them in a temporary directory, and executes
the exact formatting sequence in `mhitm.c:1374-1379`. This is a focused C
formatting oracle, **not a full C combat recording**. Combat setup follows the
existing initialized-fixture tests; this negative does not require an inferred
public-input recording to prove that the source edge has an explicit replacement.

The proof is limited to ordinary visible, nonhallucinated named floating eyes
whose string fits the C buffer. C names are clipped to 62 bytes (PL_PSIZ-1);
these names plus possessive and doubled percent characters fit BUFSZ=256.
Do not generalize to arbitrary `strNsubst` calls: C truncates expanded strings,
whereas `replaceAll` does not. Do not suppress unrelated reflection, naming,
visibility, equipment or combat leads. Existing reflection repairs and direct
formatter coverage are cited in `case.json`; no gameplay repair is requested.

The exact scanner run is reused from PR #12, without a duplicate archive. The
immutable identity, hash, key, evidenceKey, reviewFingerprint, tool/config hashes
and source hashes are in `case.json`. This run predates the base only by tooling
changes; relevant gameplay sources were checked unchanged. The later batch-c
scan failed its provenance guard during a branch switch and supplied no findings
or classifications for this case.
