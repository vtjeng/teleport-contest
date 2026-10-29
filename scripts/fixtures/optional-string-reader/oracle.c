#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "lua.h"
#include "lauxlib.h"
#define NHLpa_panic 0
static void nhl_error(lua_State *L, const char *message) { luaL_error(L, "%s", message); }
static void nhl_pcall_handle(lua_State *L, int args, int results, const char *tag, int policy) {
    (void)tag; (void)policy;
    if (lua_pcall(L, args, results, 0) != LUA_OK) lua_error(L);
}
static char *dupstr(const char *text) {
    size_t size = strlen(text) + 1;
    char *copy = malloc(size);
    if (!copy) abort();
    memcpy(copy, text, size);
    return copy;
}
char *
get_table_str_opt(lua_State *L, const char *name, char *defval)
{
    const char *ret;
    int ltyp;

    lua_getfield(L, -1, name);
    ltyp = lua_type(L, -1);
    if (ltyp == LUA_TSTRING || ltyp == LUA_TNIL) {
        ret = luaL_optstring(L, -1, defval);
    } else if (ltyp == LUA_TFUNCTION) {
        nhl_pcall_handle(L, 0, 1, "get_table_str_opt", NHLpa_panic);
        ret = luaL_optstring(L, -1, defval);
    } else {
        nhl_error(L, "get_table_str_opt: no string");
    }
    if (ret) {
        lua_pop(L, 1);
        return dupstr(ret);
    }
    lua_pop(L, 1);
    return NULL;
}
static char *default_value;
static int read_field(lua_State *L) {
    char *text = get_table_str_opt(L, "s", default_value);
    if (text) { lua_pushstring(L, text); free(text); }
    else lua_pushnil(L);
    return 1;
}
int main(void) {
    struct item { const char *id; int type; const char *text; size_t size; char *def; } cases[] = {
        {"plain", 1, "a", 1, NULL}, {"nul", 1, "a\0suffix", 8, NULL},
        {"fn-plain", 2, "return function() return 'b' end", 0, NULL},
        {"fn-nul", 2, "return function() return 'b\\0suffix' end", 0, NULL},
        {"default", 0, NULL, 0, "dflt"}, {"default-nul", 0, NULL, 0, "dflt\0suffix"},
        {"empty", 1, "", 0, "fallback"}, {"leading-nul", 1, "\0suffix", 7, "fallback"},
        {"fn-nil", 2, "return function() return nil end", 0, NULL},
        {"fn-nil-default", 2, "return function() return nil end", 0, "fallback"},
        {"fn-int", 2, "return function() return 3 end", 0, NULL},
        {"fn-float", 2, "return function() return 3.5 end", 0, NULL},
        {"raw-number", 3, NULL, 0, NULL},
        {"fn-boolean", 2, "return function() return false end", 0, NULL}
    };
    lua_State *L = luaL_newstate();
    if (!L) return 2;
    for (unsigned i=0; i<sizeof cases/sizeof *cases; ++i) {
        lua_pushcfunction(L, read_field);
        lua_newtable(L);
        if (cases[i].type == 1) lua_pushlstring(L, cases[i].text, cases[i].size);
        else if (cases[i].type == 2) {
            if (luaL_loadstring(L, cases[i].text) || lua_pcall(L,0,1,0)) return 3;
        } else if (cases[i].type == 3) lua_pushinteger(L, 3);
        if (cases[i].type) lua_setfield(L, -2, "s");
        default_value = cases[i].def;
        int status = lua_pcall(L,1,1,0);
        if (status != LUA_OK) printf("%s\terror\t%s\n",cases[i].id,lua_tostring(L,-1));
        else if (lua_isnil(L,-1)) printf("%s\tnull\t<null>\n",cases[i].id);
        else printf("%s\tstring\t<%s>\n",cases[i].id,lua_tostring(L,-1));
        lua_settop(L,0);
    }
    lua_close(L);
    return 0;
}
