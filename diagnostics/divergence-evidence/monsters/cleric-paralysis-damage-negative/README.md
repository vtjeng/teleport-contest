# Clerical paralysis damage is present in C too

Manual, unbound explained negative. The hypothesis was that JS erroneously applies paralysis duration as HP damage, particularly the Free Action branch whose C comment says `not actual damage`. The complete C caller nevertheless assigns the returned duration to `dmg` and forwards it to `mdamageu`. Removing that HP loss from JS would diverge from this pinned C source.

The JS fixture initializes a human Valkyrie, places a native level-10 role cleric, and calls the production `castmu` API with the cleric's shipped `AT_MAGC/AD_CLRC` attack. Valid deterministic draws select spell level 4, avoid fumble and produce initial damage. No spell-effect helper is replaced. The damage adapter records its argument then invokes real `mdamageu`.

Target without Free Action: 14 damage and `multi=-14`, HP 16→2. Control equips a native ring of free action through `mksobj`, `addinv` and `setworn`: 1 damage and `multi=-1`, HP 16→15. Casting draws are identical: `rn2(10)=4`, `rn2(100)=99`, `d(6,6)=6`. Equipment creation occurs before the injected casting stream.

The C oracle compiles the complete unchanged `mcast_paralyze` and `mcast_spell`. It records `nomul` and `mdamageu` arguments, shield/message counts and aborts if any unrelated spell helper is entered. Enumerated labels are assigned distinct local values; this oracle does not establish their numeric ABI. It does not execute C spell selection, actual HP storage, inventory, or a full C monster turn. JS uses the actual HP owner. These are scoped API observations, not a public-play recording or proof of broader spell equivalence.

Base: JS/tooling `32578f23091dad34635a9b4fe0bfb45ed9840e39`; C `16ff59115315917b93185d026aeefea06db9b0f4`. From repository root, with Node and C99 `cc`:

```sh
node --test diagnostics/divergence-evidence/monsters/cleric-paralysis-damage-negative/proof.mjs diagnostics/divergence-evidence/monsters/cleric-paralysis-damage-negative/oracle.mjs
node --test scripts/test-suites.test.mjs
```

Three focused checks and six suite-guard checks pass on the clean stated base. Ordinary `.mjs` names keep evidence outside default discovery. No scanner suppression decision is supplied: the manual semantic claim is not an exact missing-call lead. Four prior unresolved hypotheses remain separate. No gameplay changes or excluded scenarios are involved.

Initial private fixture attempts had an incorrect import location; they did not execute gameplay. A property-only exploratory half-spell case matched (7 damage), but is not part of this qualified proof. The published Free Action control uses actual equipment rather than an injected property.
