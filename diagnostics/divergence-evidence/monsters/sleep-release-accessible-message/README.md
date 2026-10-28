# Sleep release loses the accessible monster location

Confirmed scoped production-API divergence on Main `1c4be74beb32edbfc897de805f218e180f8c6002`, C `16ff59115315917b93185d026aeefea06db9b0f4`. Manual/unbound; no scanner suppression or full C recording is claimed.

A native adjacent lichen establishes its grip through `mhitm_ad_stck` using its shipped attack. `put_monsters_to_sleep` then calls the real sleep and release handlers. Both held and unheld controls sleep for 10 turns; the held cases release the hero. The sole demonstrated difference is the message location: with `accessiblemsg` and map coordinates C's contract gives `<19,15>: The lichen's grip relaxes.`, while JS omits `<19,15>: `. Accessibility off matches; an unheld lichen emits no release message. Native species, initialized hero, reachable adjacent floor, real grip setter and real sleep routine are used; no resistance or grab guard is bypassed. Random draws are valid and recorded, not a full C/JS RNG comparison.

From the repository root (Node and a C99 `cc` required):

```sh
git submodule update --init --checkout --no-fetch -- nethack-c/upstream
node --test diagnostics/divergence-evidence/monsters/sleep-release-accessible-message/*.test.mjs
EXPECT_CURRENT_GAP=1 node --test diagnostics/divergence-evidence/monsters/sleep-release-accessible-message/*.test.mjs
```

The first command running tests intentionally fails only the accessibility-on held target (3 pass, 1 fail). The characterization mode passes all 4 tests. Both were verified in a clean detached checkout of the stated base with only this evidence directory copied in. These tests are not registered in default CI.

The C oracle extracts and compiles the **entire unchanged** `slept_monst` and `pline_mon` functions from the pinned checkout. Surrounding naming, helpless/sticky predicates, `unstuck`, and output are tiny explicit stubs: it demonstrates the held release emits location `(19,15)`, releases, and a subsequent unheld call is silent. It does not simulate C combat, music resistance, or terminal rendering. The final prefix follows `pline.c:175–185` (`accessiblemsg`, valid location, `coord_desc`, then `": "`), while the JS fixture runs the real production owners. This is sufficient for the scoped message-location contract, not a claim of public-input or broader sleep/combat parity.

Main owns any implementation. Relevant owner is `js/mhitm.js:slept_monst`; `js/pline.js:pline_mon` already supports the C location contract. See `case.json` for exact source hashes/tool versions and `observations.txt` for raw focused observations. Prior unresolved Archon targeting, later wraith growth and castmu water-wall wording remain separate.
