# Table-form trap type string boundary

C constructs rust trap 9 or anti-magic trap 21 at (11,6), unseen. JS constructs teleport trap 14 at the same square for both suffixed names. All three plain-name controls match. One related C-string path, no new independent cause.

Base `fbcf473308e4b51016fda70aee63d6d3edfb06ad`, C `16ff59115315917b93185d026aeefea06db9b0f4`. Discovered/reviewed 2026-10-29T04:45:46.930019+00:00.

Clean-base reproduction:

1. Check out the exact base and pinned C submodule.
2. Overlay only this complete evidence directory; no sibling evidence dependency.
3. Use existing Node 24.19.0 and Clang 19.1.7 (3+b1), C11 -O2. Here activate with `source /workspace/.setup/activate.sh`; no installs.
4. Run `node diagnostics/divergence-evidence/levels/levels-table-trap-string-20261029/table-trap-probe.mjs target`: expected exit 1, two constructor mismatches.
5. Run `node diagnostics/divergence-evidence/levels/levels-table-trap-string-20261029/table-trap-probe.mjs control`: expected exit 0, three matches.
6. After repair run both expecting exit 0. Exact C function bodies/source hashes are enforced; JS hashes retain provenance without preventing a repair.

Public des.trap({type:name,x:10,y:6,spider_on_web:false,victim:false}) on fresh solidfill ROOM floor. Targets rust and anti magic with embedded NUL suffix; controls plain rust, anti magic and mixed-case RuSt. This is a table-form extension of the existing C-string cause, not an independent cause.

C executes exact registered lspo_trap, get_table_traptype_opt, get_table_str_opt, dupstr, create_trap, mktrap and maketrap. Typed Lua table/string facade exposes the raw full byte allocation; production dupstr supplies truncation. Fixed coordinate/boolean readers supply valid x/y, false spider_on_web and victim, default seen=false. launchfrom and teledest are absent. Callback and unrelated adapters abort. Full Lua VM parsing, numeric coercion and arbitrary table fields are unproved.

C uses actual trap structure and valid fresh construction state. Rust/anti-magic avoid specialized constructors; no victims, actors or objects are created. JS seed 0x5eed deterministically chooses TELEP_TRAP (14) for the unrecognized full name through the default -1 random selector. This witnesses the wrong constructor result only; it does not assert RNG equivalence, random selector correctness or teleport runtime behavior.

All previous positional-trap oracle bounds apply: explicit coordinate frame (1,0), ASCII strcasecmp adapter, D1 difficulty 1, legal rnd(4)=1 adapter, no random C placement, no runtime activation, finalization or shipped-exposure claim. No excluded investigation executes.

Tested JS base fbcf473308e4b51016fda70aee63d6d3edfb06ad adds only the preceding evidence package to accepted Main 2579242c67804962299920a58e3052ab3718c187; source files are unchanged. Earlier receipts are preserved without rebinding.

Actual clean-base receipts and hex-encoded observations are included. Ordinary .mjs runners remain outside default CI. V1 package validation and six layout guards pass; these do not constitute gameplay acceptance.
