#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
typedef int coordxy;typedef int boolean;
#define COLNO 80
#define ROWNO 21
#define STONE 0
#define DBWALL 12
#define TRUE 1
#define FALSE 0
#define IS_WALL(t) ((t)&&(t)<=DBWALL)
#define IS_STWALL(t) ((t)<=DBWALL)
#define W_NONDIGGABLE 8
#define W_NONPASSWALL 16
typedef struct {int dnum,dlevel;}d_level;
static struct {d_level uz;}u;static d_level earth_level;
#define Lassigned(y) ((y)->dlevel || (y)->dnum)
#define Lcheck(x,z) (Lassigned(z) && on_level(x, z))
#define Is_earthlevel(x) (Lcheck(x, &earth_level))
struct rm{int typ,wall_info;};static struct rm levl[80][21];
static struct {struct {struct {int is_maze_lev;}flags;}level;}svl;
boolean
on_level(d_level *lev1, d_level *lev2)
{
    return (boolean) (lev1->dnum == lev2->dnum
                      && lev1->dlevel == lev2->dlevel);
}
void
get_level_extends(
    coordxy *left, coordxy *top,
    coordxy *right, coordxy *bottom)
{
    coordxy x, y;
    unsigned typ;
    struct rm *lev;
    boolean found, nonwall;
    coordxy xmin, xmax, ymin, ymax;

    found = nonwall = FALSE;
    for (xmin = 0; !found && xmin <= COLNO; xmin++) {
        lev = &levl[xmin][0];
        for (y = 0; y <= ROWNO - 1; y++, lev++) {
            typ = lev->typ;
            if (typ != STONE) {
                found = TRUE;
                if (!IS_WALL(typ))
                    nonwall = TRUE;
            }
        }
    }
    xmin -= (nonwall || !svl.level.flags.is_maze_lev) ? 2 : 1;
    if (xmin < 0)
        xmin = 0;

    found = nonwall = FALSE;
    for (xmax = COLNO - 1; !found && xmax >= 0; xmax--) {
        lev = &levl[xmax][0];
        for (y = 0; y <= ROWNO - 1; y++, lev++) {
            typ = lev->typ;
            if (typ != STONE) {
                found = TRUE;
                if (!IS_WALL(typ))
                    nonwall = TRUE;
            }
        }
    }
    xmax += (nonwall || !svl.level.flags.is_maze_lev) ? 2 : 1;
    if (xmax >= COLNO)
        xmax = COLNO - 1;

    found = nonwall = FALSE;
    for (ymin = 0; !found && ymin <= ROWNO; ymin++) {
        lev = &levl[xmin][ymin];
        for (x = xmin; x <= xmax; x++, lev += ROWNO) {
            typ = lev->typ;
            if (typ != STONE) {
                found = TRUE;
                if (!IS_WALL(typ))
                    nonwall = TRUE;
            }
        }
    }
    ymin -= (nonwall || !svl.level.flags.is_maze_lev) ? 2 : 1;

    found = nonwall = FALSE;
    for (ymax = ROWNO - 1; !found && ymax >= 0; ymax--) {
        lev = &levl[xmin][ymax];
        for (x = xmin; x <= xmax; x++, lev += ROWNO) {
            typ = lev->typ;
            if (typ != STONE) {
                found = TRUE;
                if (!IS_WALL(typ))
                    nonwall = TRUE;
            }
        }
    }
    ymax += (nonwall || !svl.level.flags.is_maze_lev) ? 2 : 1;

    *left = xmin;
    *right = xmax;
    *top = ymin;
    *bottom = ymax;
}
void
bound_digging(void)
{
    coordxy x, y;
    coordxy xmin, xmax, ymin, ymax;

    if (Is_earthlevel(&u.uz))
        return; /* everything diggable here */

    get_level_extends(&xmin, &ymin, &xmax, &ymax);

    for (x = 0; x < COLNO; x++)
        for (y = 0; y < ROWNO; y++)
            if (IS_STWALL(levl[x][y].typ)) {
                /* undiggable walls at edges, ... */
                if (y <= ymin || y >= ymax || x <= xmin || x >= xmax)
                    levl[x][y].wall_info |= W_NONDIGGABLE;
                /* one tile past that, everything is also unphaseable */
                if (y < ymin || y > ymax || x < xmin || x > xmax)
                    levl[x][y].wall_info |= W_NONPASSWALL;
            }
}
int main(int argc,char**argv){assert(argc==3);int maze=atoi(argv[1]),relation=atoi(argv[2]);assert((maze==0||maze==1)&&relation>=0&&relation<=2);svl.level.flags.is_maze_lev=maze;earth_level=(d_level){2,1};u.uz=relation==0?(d_level){0,1}:relation==1?(d_level){2,2}:earth_level;int nonempty=0;for(int x=0;x<80;x++)for(int y=0;y<21;y++){assert(scanf("%d",&levl[x][y].typ)==1);if(levl[x][y].typ!=STONE)nonempty++;}assert(nonempty>0);coordxy left,top,right,bottom;get_level_extends(&left,&top,&right,&bottom);bound_digging();printf("%d %d %d %d\n",left,top,right,bottom);for(int x=0;x<80;x++)for(int y=0;y<21;y++)printf("%02x",levl[x][y].wall_info);puts("");return 0;}
