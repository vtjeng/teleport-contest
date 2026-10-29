`oracle.c` contains the exact pinned `nhlua.c:get_table_str_opt` body. The
wrapper uses the existing recorder's Lua 5.4.8 static library and disclosed
`dupstr`, `nhl_error` and `nhl_pcall_handle` shims. It evaluates scalar table
fields and simple Lua callbacks only: no level, room, trap or game construction.

Reproduce with an existing compiler and Lua 5.4.8 source/build tree:

```sh
clang -I /path/to/lua-5.4.8/src oracle.c /path/to/lua-5.4.8/src/liblua.a -lm -ldl -o /tmp/string-reader-oracle
/tmp/string-reader-oracle
```

`oracle.tsv` is raw output. Node tests verify file hashes and the embedded C
function against the pinned upstream source. Assertions cover returned values
and rejection classes, not full panic/error diagnostic text or allocator
behavior. Existing library provenance is identified, not independently rebuilt
or attested. Downstream constructor behavior and general Lua numeric
representation are outside this finite oracle.
