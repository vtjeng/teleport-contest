# Constant-WEB callee-stub negative

Exact key: `source-audit:edge-stub:src/monmove.c:maybe_spin_web:maketrap`.

**Explained negative for this stub edge only.** C and JS `maybe_spin_web` pass the constant `WEB`. The complete JS `maketrap` body contains one `note_unported` marker, confined to `case TELEP_TRAP`; it never reassigns `typ`. `WEB` is 18 and `TELEP_TRAP` is 15. Thus this caller cannot select the flagged marker. This does not certify every trap effect, callee continuation, or monster movement.

The source proof checks the complete callee and both call sites; the positive discriminator control still admits TELEP_TRAP. The projection separately retains `gazemu → polymon` and sleepy-gaze warnings active, preventing a broad “callee contains stub” suppression.

## Reached native witnesses

A supported wizard command creates four tame giant spiders; ordinary movement reaches `Your giant spider spins a web.` at step 69. The opposite native-species control creates four tame giant ants and executes the same number of waits without that message. No monster flags, attack tables, RNG draws or callbacks are overridden.

- Target: all 2969 RNG calls and 70 screens/cursors match C/JS.
- Control: all 3027 RNG calls and 67 screens/cursors match C/JS.

Counts differ between species; each comparison is against its own C recording. Complete small recordings, recipes, raw hashes, recorder fingerprint and actual clean-base receipts are included. Earlier longer probes also matched but are omitted as unrelated later gameplay. These recordings support the reached behavior; the constant/switch proof establishes the exact stub unreachability.

```
node diagnostics/divergence-evidence/monsters/web-call-stub-negative/replay.mjs target
node diagnostics/divergence-evidence/monsters/web-call-stub-negative/replay.mjs control
```

Run at the exact case.json JS base with the C gitlink initialized. Both exits must be 0. The runner executes `source-proof.mjs` first, then asserts branch feedback and compares complete replay streams. Current-base source dependencies are hashed. No default-CI runner is added.

## Immutable scan and finite inventory

Original run `2bfc89cdcbaa6139046f`, SHA-256 `4e7ab2870a6c57b5c1d586b651917cfabf28056c485f9f92ebc0e202cfcc1b93`, is reused from [the durable PR #96 artifact](https://github.com/vtjeng/teleport-contest/blob/9c2df4fe2eda635c3a92afc6b3673626d595ebe1/diagnostics/divergence-evidence/monsters/medusa-ugly-reaction-negative/discovery-run.json.gz). No full run is duplicated. Original scan base is b313cde5b50f3c5b5e8f622ff32418cbc1ae12be; native witnesses use the newer case base. `maketrap` is unchanged across these bases; monmove's intervening change is the separate weapon gate, not this helper. Do not apply historical reviews to changed source automatically.

The accepted exporter was run and validated against the complete original run and final decisions: three active keys become two active and one filtered. Only the web edge has a decision. Hub-generated fingerprint and original identities are preserved.

`inventory-keys.json` enumerates the exact 689 raw keys from mhitm.c, mhitu.c, monmove.c, mcastu.c, dogmove.c and mondata.c in that immutable run. `inventory-summary.json` records **5 reviewed: 4 resolved negatives, 1 reviewed/unresolved; 684 without a recorded review**. This is a finite historical slice, not a bug count, permission expansion, or proof that other keys were never informally inspected. Older manual or differently bound reviews are not silently imported. Overall unenumerated monster inventory remains unknown. Guardian #81/#100 stays one parked cause.
