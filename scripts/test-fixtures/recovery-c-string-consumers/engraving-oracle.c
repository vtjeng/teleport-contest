#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
typedef int coordxy;typedef int boolean;typedef signed char xint8;typedef void*genericptr_t;typedef long lua_Integer;
#define TRUE 1
#define FALSE 0
#define Bitfield(n,b) unsigned n:b
#define alloc malloc
#define Strlen strlen
#define Strcpy strcpy
#define Free free
#define panic(...) abort()
#define A_WIS 2
#define DRY 1
#define SP_COORD_PACK(x,y) (((x)&0xff)+(((y)&0xff)<<16))
#define SP_COORD_PACK_RANDOM(f) (0x01000000L|(f))
enum engraving_texts {
    actual_text,
    remembered_text,
    pristine_text,
    text_states
};

#define engr_text_space(ep) ((char *) ((ep) + 1))

struct engr {
    struct engr *nxt_engr;
    char *engr_txt[text_states];
    coordxy engr_x, engr_y;
    unsigned engr_szeach;  /* length of text including trailing NUL */
    unsigned engr_alloc; /* for save & restore; not length of text */
    long engr_time;    /* moment engraving was (will be) finished */
    xint8 engr_type;
#define DUST 1
#define ENGRAVE 2
#define BURN 3
#define MARK 4
#define ENGR_BLOOD 5
#define HEADSTONE 6
#define N_ENGRAVE 6
    Bitfield(guardobjects, 1); /* if engr_txt is "Elbereth", it is effective
                                * against monsters when an object is present
                                * even when hero isn't (so behaves similarly
                                * to how Elbereth did in 3.4.3) */
    Bitfield(nowipeout, 1);    /* this engraving will not degrade */
    Bitfield(eread, 1);        /* refers to the engaving text: read or felt */
    Bitfield(erevealed, 1);    /* refers to engraving map symbol: revealed */
    /* 4 free bits */
};

#define newengr(lth) \
    (struct engr *) alloc((unsigned) (lth) + (unsigned) sizeof (struct engr))
#define dealloc_engr(engr) free((genericptr_t) (engr))

static struct engr*head_engr;static struct {int in_mklev;} gi={1};
static void exercise(int a,int b){(void)a;(void)b;abort();}static int rnd(int n){(void)n;abort();}
static void del_engr(struct engr*ep){(void)ep;abort();}
struct engr *
engr_at(coordxy x, coordxy y)
{
    struct engr *ep = head_engr;

    while (ep) {
        if (x == ep->engr_x && y == ep->engr_y)
            return ep;
        ep = ep->nxt_engr;
    }
    return (struct engr *) 0;
}
void
make_engr_at(
    coordxy x, coordxy y,
    const char *s,
    const char *pristine_s,
    long e_time,
    int e_type)
{
    int i;
    struct engr *ep;
    unsigned smem = Strlen(s) + 1;
    boolean havepristine = FALSE;

    if (pristine_s != NULL) {
        unsigned prmem = Strlen(pristine_s) + 1;
        if (prmem > smem)
            smem = prmem;
        havepristine = TRUE;
    }
    if ((ep = engr_at(x, y)) != 0)
        del_engr(ep);

    ep = newengr(smem * 3);
    (void) memset((genericptr_t) ep, 0, (smem * 3) + sizeof (struct engr));
    ep->nxt_engr = head_engr;
    head_engr = ep;
    ep->engr_x = x;
    ep->engr_y = y;
    ep->engr_txt[actual_text] = engr_text_space(ep);
    ep->engr_txt[remembered_text] = ep->engr_txt[actual_text] + smem;
    ep->engr_txt[pristine_text] = ep->engr_txt[remembered_text] + smem;
    for(i = 0; i < text_states; ++i)
        Strcpy(ep->engr_txt[i], s);
    if (havepristine)
        Strcpy(ep->engr_txt[pristine_text], pristine_s);
    if (!strcmp(s, "Elbereth")) {
        /* engraving "Elbereth":  if done when making a level, it creates
           an old-style Elbereth that deters monsters when any objects are
           present; otherwise (done by the player), exercises wisdom */
        if (gi.in_mklev)
            ep->guardobjects = 1;
        else
            exercise(A_WIS, TRUE);
    }
    ep->engr_time = e_time;
    ep->engr_type = (xint8) ((e_type > 0) ? e_type : rnd(N_ENGRAVE - 1));
    ep->engr_szeach = smem;
    ep->engr_alloc = smem * 3;
    /* we do not set ep->eread or ep->erevealed;
     * the caller will need to if required */
}
char *
dupstr(const char *string)
{
    size_t len = strlen(string);

    /* make sure len+1 doesn't overflow plain unsigned (for alloc()) */
    if (len > (unsigned) (~0U - 1U))
        panic("dupstr: string length overflow");

    return strcpy((char *) alloc(len + 1), string);
}
typedef struct {int form,pushed;char*text;} lua_State;
static struct {struct {void*croom;}*coder;} gc;
static void create_des_coder(void){static struct {void*croom;} coder;gc.coder=(void*)&coder;}
static int lua_gettop(lua_State*L){return L->form?3:1;}
static void lcheck_param_table(lua_State*L){assert(!L->form);}
static void get_table_xy_or_coord(lua_State*L,lua_Integer*x,lua_Integer*y){assert(!L->form);*x=*y=2;}
static int get_table_option(lua_State*L,const char*k,const char*d,const char*const*o){assert(!L->form&&!strcmp(k,"type")&&!strcmp(d,"engrave")&&!strcmp(o[1],"engrave"));return 1;}
static int get_table_boolean_opt(lua_State*L,const char*k,int d){assert(!L->form&&(!strcmp(k,"degrade")||!strcmp(k,"guardobjects")));return d;}
static int get_coord(lua_State*L,int i,lua_Integer*x,lua_Integer*y){assert(L->form&&i==1);*x=*y=2;return 1;}
static int luaL_checkoption(lua_State*L,int i,const char*d,const char*const*o){assert(L->form&&i==2&&!strcmp(d,"engrave")&&!strcmp(o[1],"engrave"));return 1;}
static void lua_getfield(lua_State*L,int i,const char*k){assert(!L->form&&i==-1&&!strcmp(k,"text"));L->pushed=1;}
static const char*luaL_checkstring(lua_State*L,int i){assert((L->form&&i==3)||(!L->form&&L->pushed&&i==-1));return L->text;}
static void lua_pop(lua_State*L,int n){assert(!L->form&&n==1&&L->pushed);L->pushed=0;}
static void nhl_error(lua_State*L,const char*s){(void)L;(void)s;abort();}
static void get_location_coord(coordxy*x,coordxy*y,int h,void*r,long c){assert(*x==2&&*y==2&&h==DRY&&!r&&c==SP_COORD_PACK(2,2));(*x)++;}
char *
get_table_str(lua_State *L, const char *name)
{
    char *ret;

    lua_getfield(L, -1, name);
    ret = dupstr(luaL_checkstring(L, -1));
    lua_pop(L, 1);
    return ret;
}
int
lspo_engraving(lua_State *L)
{
    static const char *const engrtypes[] = {
        "dust", "engrave", "burn", "mark", "blood", NULL
    };
    static const int engrtypes2i[] = {
        DUST, ENGRAVE, BURN, MARK, ENGR_BLOOD, 0
    };
    int etyp = DUST;
    char *txt = (char *) 0;
    long ecoord;
    coordxy x = -1, y = -1;
    int argc = lua_gettop(L);
    boolean guardobjs = FALSE;
    boolean wipeout = TRUE;
    struct engr *ep;

    create_des_coder();

    if (argc == 1) {
        lua_Integer ex, ey;
        lcheck_param_table(L);

        get_table_xy_or_coord(L, &ex, &ey);
        x = ex;
        y = ey;
        etyp = engrtypes2i[get_table_option(L, "type", "engrave", engrtypes)];
        txt = get_table_str(L, "text");
        wipeout = get_table_boolean_opt(L, "degrade", TRUE);
        guardobjs = get_table_boolean_opt(L, "guardobjects", FALSE);
    } else if (argc == 3) {
        lua_Integer ex, ey;
        (void) get_coord(L, 1, &ex, &ey);
        x = ex;
        y = ey;
        etyp = engrtypes2i[luaL_checkoption(L, 2, "engrave", engrtypes)];
        txt = dupstr(luaL_checkstring(L, 3));
    } else {
        nhl_error(L, "Wrong parameters");
    }

    if (x == -1 && y == -1)
        ecoord = SP_COORD_PACK_RANDOM(0);
    else
        ecoord = SP_COORD_PACK(x, y);

    get_location_coord(&x, &y, DRY, gc.coder->croom, ecoord);
    make_engr_at(x, y, txt, NULL, 0L, etyp);
    Free(txt);
    ep = engr_at(x, y);
    if (ep) {
        ep->guardobjects = guardobjs;
        ep->nowipeout = !wipeout;
    }
    return 0;
}
int main(int argc,char**argv){assert(argc==3);int n=strlen(argv[2]);assert(!(n%2));char*txt=calloc(n/2+1,1);for(int i=0;i<n;i+=2){unsigned v;assert(sscanf(argv[2]+i,"%2x",&v)==1);txt[i/2]=v;}lua_State L={atoi(argv[1]),0,txt};assert(L.form==0||L.form==1);assert(lspo_engraving(&L)==0);struct engr*e=head_engr;assert(e&&!e->nxt_engr);printf("{\"x\":%d,\"y\":%d,\"type\":%d,\"time\":%ld,\"size\":%u,\"allocation\":%u,\"guardobjects\":%u,\"nowipeout\":%u,\"textHex\":[",e->engr_x,e->engr_y,e->engr_type,e->engr_time,e->engr_szeach,e->engr_alloc,e->guardobjects,e->nowipeout);for(int j=0;j<text_states;j++){printf("%s\"",j?",":"");for(unsigned char*c=(unsigned char*)e->engr_txt[j];*c;c++)printf("%02x",*c);printf("\"");}puts("]}");free(txt);dealloc_engr(e);return 0;}
