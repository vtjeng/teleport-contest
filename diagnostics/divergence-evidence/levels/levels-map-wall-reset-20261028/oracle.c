/* Scoped fixtures for the unchanged C map/terrain writers below. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
typedef int boolean; typedef int coordxy; typedef int lua_Integer;
#define TRUE 1
#define FALSE 0
#define COLNO 80
#define ROWNO 21
#define STONE 0
#define ROOM 25
#define ICE 33
#define NO_ROOM 0
#define INVALID_TYPE (-1)
#define MAX_TYPE 37
#define SPLEV_LEFT 1
#define SPLEV_H_LEFT 2
#define SPLEV_CENTER 3
#define SPLEV_H_RIGHT 4
#define SPLEV_RIGHT 5
#define TOP 1
#define BOTTOM 5
#define LUA_TSTRING 4
#define LUA_TFUNCTION 6
#define NHLpa_panic 0
#define min(a,b) ((a)<(b)?(a):(b))
struct mkroom {int lx,ly,hx,hy;};
struct coder { struct mkroom *croom; } coder;
struct {struct coder *coder;} gc={&coder};
struct {int in_mk_themerooms;} gi;
struct {int themeroom_failed;} gt;
struct {int xstart,xsize,x_maze_max;} gx={1,79,78};
struct {int ystart,ysize,y_maze_max;} gy={0,21,20};
int splev_init_present, icedpools;
struct {int typ,flags,horizontal,roomno,edge,lit,arboreal_sdoor;} levl[80][21];
int SpLev_Map[80][21];
struct mapfragment {int wid,hei;};
struct selectionvar {int points[80][21];};
typedef struct {const char *halign,*valign;int x,y;} lua_State;
typedef struct {int ter,tlit;} terrain;
static int captured[80][21];
static int transparent;
/* Fixed table adapter: exact supplied option names, explicit (10,6),
 * 3x3 wall/transparent fragment, no room/themeroom or contents callback. */
static void create_des_coder(void){}
static int lua_gettop(lua_State *L){return 1;}
static int lua_type(lua_State *L,int idx){return idx==1?5:0;}
static void lcheck_param_table(lua_State *L){}
static const char *luaL_checkstring(lua_State *L,int i){abort();}
static char *dupstr(const char *s){char *p=malloc(strlen(s)+1);strcpy(p,s);return p;}
static int get_table_option(lua_State *L,const char *key,const char *def,const char *const *options){
 const char *v=!strcmp(key,"halign")?L->halign:L->valign;if(!v)v=def;
 for(int i=0;options[i];i++)if(!strcmp(v,options[i]))return i;abort();
}
static void get_table_xy_or_coord(lua_State *L,lua_Integer *x,lua_Integer *y){*x=L->x;*y=L->y;}
static char *get_table_str(lua_State *L,const char *key){assert(!strcmp(key,"map"));return dupstr(transparent?"xxx\nxxx\nxxx":"---\n---\n---");}
static int get_table_boolean_opt(lua_State *L,const char *key,int def){assert(!strcmp(key,"lit"));return def;}
static void lua_getfield(lua_State *L,int i,const char *key){assert(!strcmp(key,"contents"));}
static void lua_remove(lua_State *L,int i){abort();}
static void lua_pop(lua_State *L,int n){}
static struct mapfragment *mapfrag_fromstr(const char *s){assert(!strcmp(s,transparent?"xxx\nxxx\nxxx":"---\n---\n---"));struct mapfragment *m=malloc(sizeof(*m));m->wid=m->hei=3;return m;}
static void mapfrag_free(struct mapfragment **m){free(*m);*m=NULL;}
static int mapfrag_get(struct mapfragment *m,int x,int y){assert(x>=0&&x<3&&y>=0&&y<3);return transparent?MAX_TYPE:2;}
static struct selectionvar *selection_new(void){return calloc(1,sizeof(struct selectionvar));}
static void selection_setpoint(int x,int y,struct selectionvar *s,int v){assert(x>=0&&x<80&&y>=0&&y<21);s->points[x][y]=v;}
static void selection_free(struct selectionvar *s,int b){free(s);}
static void l_selection_push_copy(lua_State *L,struct selectionvar *s){memcpy(captured,s->points,sizeof(captured));}
static int isok(int x,int y){return x>=1&&x<80&&y>=0&&y<21;}
static void nhl_error(lua_State *L,const char *s){fprintf(stderr,"%s\n",s);abort();}
static int rn2(int n){abort();}
static int somex(struct mkroom *r){abort();}
static int somey(struct mkroom *r){abort();}
static void reset_xystart_size(void){abort();}
static void l_push_wid_hei_table(lua_State *L,int x,int y){abort();}
static void nhl_pcall_handle(lua_State *L,int a,int b,const char *s,int p){abort();}


typedef signed char schar; typedef void *genericptr_t;
#define staticfn static
#define SDOOR 14
#define DOOR 23
#define HWALL 2
#define IRONBARS 22
#define AIR 35
#define CLOUD 36
#define LADDER 27
#define STAIRS 26
#define D_CLOSED 4
#define ICED_POOL 8
#define ICED_MOAT 16
#define SET_LIT_NOCHANGE (-2)
#define SET_LIT_RANDOM (-1)
#define MELT_ICE_AWAY 0
#define IS_DOOR(t) ((t)==DOOR)
#define IS_WALL(t) ((t) && (t)<=12)
#define IS_LAVA(t) ((t)==20 || (t)==21)
#define IS_FOUNTAIN(t) ((t)==28)
#define IS_SINK(t) ((t)==30)
#define CAN_OVERWRITE_TERRAIN(t) (iflags.debug_overwrite_stairs || !((t)==LADDER || (t)==STAIRS))
/* rm.h aliases both these names to flags. */
#define icedpool flags
#define doormask flags
#define wall_info flags
#define IS_STWALL(t) ((t)<=12)
#define IS_TREE(t) ((t)==13) /* arboreal false in these fixtures */
struct {int debug_overwrite_stairs;} iflags;
static int is_ice(int x,int y){assert(levl[x][y].typ==STONE || levl[x][y].typ==ROOM || levl[x][y].typ==HWALL);return 0;}
static void obj_ice_effects(int x,int y,int b){abort();}
static void spot_stop_timers(int x,int y,int t){abort();}
static void count_level_features(void){abort();}
static void del_engr_at(int x,int y){abort();}

boolean
set_levltyp(coordxy x, coordxy y, schar newtyp)
{
    if (isok(x, y) && newtyp >= STONE && newtyp < MAX_TYPE) {
        schar oldtyp = levl[x][y].typ;

        /* hack for secret doors in garden theme rooms */
        if (oldtyp == SDOOR && newtyp == AIR) {
            /* levl[][].typ stays SDOOR rather than change to AIR */
            levl[x][y].arboreal_sdoor = 1;
            return TRUE;
        }

        if (CAN_OVERWRITE_TERRAIN(oldtyp)) {
            /* typ==ICE || (typ==DRAWBRIDGE_UP && drawbridgemask==DB_ICE) */
            boolean was_ice = is_ice(x, y);

            levl[x][y].typ = newtyp;
            /* TODO?
             *  if oldtyp used flags or horizontal differently from
             *  the way newtyp will use them, clear them.
             */

            if (IS_LAVA(newtyp)) /* [what about IS_LAVA(oldtyp)=>.lit = 0?] */
                levl[x][y].lit = 1;
            if (was_ice && newtyp != ICE) {
                /* frozen corpses resume rotting, no more ice to melt away */
                obj_ice_effects(x, y, TRUE);
                spot_stop_timers(x, y, MELT_ICE_AWAY);
            }
            if ((IS_FOUNTAIN(oldtyp) != IS_FOUNTAIN(newtyp))
                || (IS_SINK(oldtyp) != IS_SINK(newtyp)))
                count_level_features(); /* level.flags.nfountains,nsinks */

            return TRUE;
        }
#ifdef EXTRA_SANITY_CHECKS
    } else {
        impossible("set_levltyp(%d,%d,%d)%s%s",
                   (int) x, (int) y, (int) newtyp,
                   !isok(x, y) ? " not isok()" : "",
                   (newtyp < STONE || newtyp >= MAX_TYPE) ? " bad type" : "");
#endif /*EXTRA_SANITY_CHECKS*/
    }
    return FALSE;
}
boolean
set_levltyp_lit(coordxy x, coordxy y, schar typ, schar lit)
{
    boolean ret = set_levltyp(x, y, typ);

    if (ret && isok(x, y)) {
        if (lit != SET_LIT_NOCHANGE) {
#ifdef EXTRA_SANITY_CHECKS
            if (lit < SET_LIT_NOCHANGE || lit > 1)
                impossible("set_levltyp_lit(%d,%d,%d,%d)",
                           (int) x, (int) y, (int) typ, (int) lit);
#endif /*EXTRA_SANITY_CHECKS*/
            if (IS_LAVA(typ))
                lit = 1;
            else if (lit == SET_LIT_RANDOM)
                lit = rn2(2);

            levl[x][y].lit = lit;
        }
    }
    return ret;
}
staticfn void
sel_set_ter(coordxy x, coordxy y, genericptr_t arg)
{
    terrain terr;

    terr = *(terrain *) arg;
    if (!set_levltyp_lit(x, y, terr.ter, terr.tlit))
        return;
    /* TODO: move this below into set_levltyp? */
    /* handle doors and secret doors */
    if (levl[x][y].typ == SDOOR || IS_DOOR(levl[x][y].typ)) {
        if (levl[x][y].typ == SDOOR)
            levl[x][y].doormask = D_CLOSED;
        if (x && (IS_WALL(levl[x - 1][y].typ) || levl[x - 1][y].horizontal))
            levl[x][y].horizontal = 1;
    } else if (levl[x][y].typ == HWALL || levl[x][y].typ == IRONBARS) {
        levl[x][y].horizontal = 1;
    } else if (splev_init_present && levl[x][y].typ == ICE) {
        levl[x][y].icedpool = icedpools ? ICED_POOL : ICED_MOAT;
    } else if (levl[x][y].typ == CLOUD) {
        del_engr_at(x, y); /* clouds cannot have engravings */
    }
}
staticfn void
lvlfill_solid(schar filling, schar lit)
{
    int x, y;

    for (x = 2; x <= gx.x_maze_max; x++)
        for (y = 0; y <= gy.y_maze_max; y++) {
            if (!set_levltyp_lit(x, y, filling, lit))
                continue;
            /* TODO: consolidate this w lspo_map ? */
            levl[x][y].flags = 0;
            levl[x][y].horizontal = 0;
            levl[x][y].roomno = 0;
            levl[x][y].edge = 0;
        }
}
int
lspo_map(lua_State *L)
{
    /*
TODO: allow passing an array of strings as map data
TODO: handle if map lines aren't same length
TODO: gc.coder->croom needs to be updated
     */

    static const char *const left_or_right[] = {
        "left", "half-left", "center", "half-right", "right", "none", NULL
    };
    static const int l_or_r2i[] = {
        SPLEV_LEFT, SPLEV_H_LEFT, SPLEV_CENTER, SPLEV_H_RIGHT,
        SPLEV_RIGHT, -1, -1
    };
    static const char *const top_or_bot[] = {
        "top", "center", "bottom", "none", NULL
    };
    static const int t_or_b2i[] = { TOP, SPLEV_CENTER, BOTTOM, -1, -1 };
    int lr, tb;
    lua_Integer x = -1, y = -1;
    struct mapfragment *mf;
    char *tmpstr;
    int argc = lua_gettop(L);
    boolean has_contents = FALSE;
    int tryct = 0;
    int ox, oy;
    boolean lit = FALSE;
    struct selectionvar *sel;

    create_des_coder();

    if (gi.in_mk_themerooms && gt.themeroom_failed)
        return 0;

    if (argc == 1 && lua_type(L, 1) == LUA_TSTRING) {
        tmpstr = dupstr(luaL_checkstring(L, 1));
        lr = tb = SPLEV_CENTER;
        mf = mapfrag_fromstr(tmpstr);
        free(tmpstr);
    } else {
        lcheck_param_table(L);
        lr = l_or_r2i[get_table_option(L, "halign", "none", left_or_right)];
        tb = t_or_b2i[get_table_option(L, "valign", "none", top_or_bot)];
        get_table_xy_or_coord(L, &x, &y);
        tmpstr = get_table_str(L, "map");
        lit = (boolean) get_table_boolean_opt(L, "lit", FALSE);
        lua_getfield(L, 1, "contents");
        if (lua_type(L, -1) == LUA_TFUNCTION) {
            lua_remove(L, -2);
            has_contents = TRUE;
        } else {
            lua_pop(L, 1);
        }
        mf = mapfrag_fromstr(tmpstr);
        free(tmpstr);
    }

    if (!mf) {
        nhl_error(L, "Map data error");
        /*NOTREACHED*/
        return 0;
    }

    sel = selection_new();
    ox = x;
    oy = y;
 redo_maploc:
    gx.xsize = mf->wid;
    gy.ysize = mf->hei;

    if (lr == -1 && tb == -1) {
        if (gi.in_mk_themerooms && (ox == -1 || oy == -1)) {
            if (ox == -1) {
                if (gc.coder->croom) {
                    x = somex(gc.coder->croom) - mf->wid;
                    if (x < 1)
                        x = 1;
                } else {
                    x = 1 + rn2(COLNO - 1 - mf->wid);
                }
            }

            if (oy == -1) {
                if (gc.coder->croom) {
                    y = somey(gc.coder->croom) - mf->hei;
                    if (y < 1)
                        y = 1;
                } else {
                    y = rn2(ROWNO - mf->hei);
                }
            }
        }

        if (isok(x, y)) {
            /* x,y is given, place map starting at x,y */
            if (gc.coder->croom) {
                /* in a room? adjust to room relative coords */
                gx.xstart = x + gc.coder->croom->lx;
                gy.ystart = y + gc.coder->croom->ly;
                gx.xsize = min(mf->wid,
                              (gc.coder->croom->hx - gc.coder->croom->lx));
                gy.ysize = min(mf->hei,
                              (gc.coder->croom->hy - gc.coder->croom->ly));
            } else {
                gx.xsize = mf->wid;
                gy.ysize = mf->hei;
                gx.xstart = x;
                gy.ystart = y;
            }
        } else {
            mapfrag_free(&mf);
            nhl_error(L, "Map requires either x,y or halign,valign params");
            selection_free(sel, TRUE);
            return 0;
        }
    } else {
        /* place map starting at halign,valign */
        switch (lr) {
        case SPLEV_LEFT:
            gx.xstart = splev_init_present ? 1 : 3;
            break;
        case SPLEV_H_LEFT:
            gx.xstart = 2 + ((gx.x_maze_max - 2 - gx.xsize) / 4);
            break;
        case SPLEV_CENTER:
            gx.xstart = 2 + ((gx.x_maze_max - 2 - gx.xsize) / 2);
            break;
        case SPLEV_H_RIGHT:
            gx.xstart = 2 + ((gx.x_maze_max - 2 - gx.xsize) * 3 / 4);
            break;
        case SPLEV_RIGHT:
            gx.xstart = gx.x_maze_max - gx.xsize - 1;
            break;
        }
        switch (tb) {
        case TOP:
            gy.ystart = 3;
            break;
        case SPLEV_CENTER:
            gy.ystart = 2 + ((gy.y_maze_max - 2 - gy.ysize) / 2);
            break;
        case BOTTOM:
            gy.ystart = gy.y_maze_max - gy.ysize - 1;
            break;
        }
        if (!(gx.xstart % 2))
            gx.xstart++;
        if (!(gy.ystart % 2))
            gy.ystart++;
    }

    if (gy.ystart < 0 || gy.ystart + gy.ysize > ROWNO) {
        if (gi.in_mk_themerooms) {
            gt.themeroom_failed = TRUE;
            goto skipmap;
        }
        /* try to move the start a bit */
        gy.ystart += (gy.ystart > 0) ? -2 : 2;
        if (gy.ysize == ROWNO)
            gy.ystart = 0;
        if (gy.ystart < 0 || gy.ystart + gy.ysize > ROWNO)
            gy.ystart = 0;
    }
    if (gx.xsize <= 1 && gy.ysize <= 1) {
        reset_xystart_size();
    } else {
        coordxy mptyp;
        terrain terr;

        /* Themed rooms should never overwrite anything */
        if (gi.in_mk_themerooms) {
            boolean isokp = TRUE;
            for (y = gy.ystart - 1;
                 y < min(ROWNO, gy.ystart + gy.ysize) + 1; y++)
                for (x = gx.xstart - 1;
                     x < min(COLNO, gx.xstart + gx.xsize) + 1; x++) {
                    if (!isok(x, y)) {
                        isokp = FALSE;
                    } else if (y < gy.ystart || y >= (gy.ystart + gy.ysize)
                            || x < gx.xstart || x >= (gx.xstart + gx.xsize)) {
                        if (levl[x][y].typ != STONE
                            || levl[x][y].roomno != NO_ROOM)
                            isokp = FALSE;
                    } else {
                        mptyp = mapfrag_get(mf, x - gx.xstart, y - gy.ystart);
                        if (mptyp >= MAX_TYPE)
                            continue;
                        if ((levl[x][y].typ != STONE
                             && levl[x][y].typ != mptyp)
                            || levl[x][y].roomno != NO_ROOM)
                            isokp = FALSE;
                    }
                    if (!isokp) {
                        if (tryct++ < 100 && (lr == -1 || tb == -1))
                            goto redo_maploc;
                        gt.themeroom_failed = TRUE;
                        goto skipmap;
                    }
                }
        }

        /* Load the map */
        for (y = gy.ystart; y < min(ROWNO, gy.ystart + gy.ysize); y++)
            for (x = gx.xstart; x < min(COLNO, gx.xstart + gx.xsize); x++) {
                mptyp = mapfrag_get(mf, (x - gx.xstart), (y - gy.ystart));
                if (mptyp == INVALID_TYPE) {
                    /* TODO: warn about illegal map char */
                    continue;
                }
                if (mptyp >= MAX_TYPE)
                    continue;
                /* clear out levl: load_common_data may set them */
                levl[x][y].flags = 0;
                levl[x][y].horizontal = 0;
                levl[x][y].roomno = 0;
                levl[x][y].edge = 0;
                SpLev_Map[x][y] = 1;
                selection_setpoint(x, y, sel, 1);
                terr.ter = mptyp;
                terr.tlit = lit;
                sel_set_ter(x, y, &terr);
            }
    }

 skipmap:
    mapfrag_free(&mf);

    if (gi.in_mk_themerooms && gt.themeroom_failed) {
        /* this mutated xstart and ystart in the process of trying to make a
         * themed room, so undo them */
        reset_xystart_size();
    }
    else if (has_contents) {
        l_push_wid_hei_table(L, gx.xsize, gy.ysize);
        nhl_pcall_handle(L, 1, 0, "lspo_map", NHLpa_panic);
        reset_xystart_size();
    }

    /* return selection where map locations were put */
    l_selection_push_copy(L, sel);
    selection_free(sel, TRUE);

    return 1;
}

staticfn void
sel_set_wall_property(coordxy x, coordxy y, genericptr_t arg)
{
    int prop = *(int *) arg;

    if (IS_STWALL(levl[x][y].typ) || IS_TREE(levl[x][y].typ)
        /* 3.6.2: made iron bars eligible to be flagged nondiggable
           (checked by chewing(hack.c) and zap_over_floor(zap.c)) */
        || levl[x][y].typ == IRONBARS)
        levl[x][y].wall_info |= prop;
}
int main(int argc,char **argv){
 if(argc!=3)return 2;
 int prop=atoi(argv[1]);assert(prop==8||prop==16);
 /* Explicit solidfill setup contract, then exact production callbacks. */
 splev_init_present=TRUE;lvlfill_solid(ROOM,0);
 terrain t={HWALL,0};
 for(int x=10;x<13;x++)for(int y=6;y<9;y++){
  sel_set_ter(x,y,&t);sel_set_wall_property(x,y,&prop);
  printf("%s%d",x==10&&y==6?"":",",levl[x][y].wall_info);
 }puts("");
 if(!strcmp(argv[2],"terrain")){
  for(int x=10;x<13;x++)for(int y=6;y<9;y++)sel_set_ter(x,y,&t);
 }else{
  assert(!strcmp(argv[2],"map")||!strcmp(argv[2],"transparent"));transparent=!strcmp(argv[2],"transparent");
  lua_State L={NULL,NULL,10,6};assert(lspo_map(&L)==1);
 }
 for(int x=10;x<13;x++)for(int y=6;y<9;y++)printf("%d,%d,%d,%d\n",x,y,levl[x][y].typ,levl[x][y].wall_info);
}
