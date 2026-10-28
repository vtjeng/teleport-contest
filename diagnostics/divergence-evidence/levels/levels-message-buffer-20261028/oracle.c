/* Fixed one-string Lua stack adapter. Bytes after an embedded zero remain
 * present in the supplied string; exact upstream lspo_message decides length. */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef struct {const char *text;} lua_State;
typedef void *genericptr_t;
#define Strlen strlen
#define alloc malloc
#define Free free
struct {char *lev_message;} gl;
static int lua_gettop(lua_State *L){assert(L);return 1;}
static const char *luaL_checkstring(lua_State *L,int n){assert(n==1);return L->text;}
static void create_des_coder(void){}
static void nhl_error(lua_State *L,const char *s){(void)L;(void)s;abort();}
int
lspo_message(lua_State *L)
{
    char *levmsg;
    int old_n, n;
    const char *msg;

    int argc = lua_gettop(L);

    if (argc < 1) {
        nhl_error(L, "Wrong parameters");
        /*NOTREACHED*/
        return 0;
    }

    create_des_coder();

    msg = luaL_checkstring(L, 1);

    old_n = gl.lev_message ? (Strlen(gl.lev_message) + 1) : 0;
    n = Strlen(msg);

    levmsg = (char *) alloc(old_n + n + 1);
    if (old_n)
        levmsg[old_n - 1] = '\n';
    if (gl.lev_message)
        (void) memcpy((genericptr_t) levmsg, (genericptr_t) gl.lev_message,
                      old_n - 1);
    (void) memcpy((genericptr_t) &levmsg[old_n], msg, n);
    levmsg[old_n + n] = '\0';
    Free(gl.lev_message);
    gl.lev_message = levmsg;

    return 0;  /* number of results */
}

int main(int argc,char **argv){
 assert(argc>=2);
 for(int i=1;i<argc;i++){
  size_t len=strlen(argv[i]);assert(len%2==0);char *text=calloc(len/2+1,1);assert(text);
  for(size_t j=0;j<len;j+=2){unsigned v;assert(sscanf(argv[i]+j,"%2x",&v)==1);text[j/2]=(char)v;}
  lua_State L={text};assert(lspo_message(&L)==0);free(text);
 }
 for(const unsigned char *s=(unsigned char *)gl.lev_message;*s;s++)printf("%02x",*s);
 putchar('\n');free(gl.lev_message);return 0;
}
