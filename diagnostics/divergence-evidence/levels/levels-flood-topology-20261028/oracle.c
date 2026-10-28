/* Extracted selvar.c flood-fill and pending-stack lookup; wrapper supplies
 * fixed-size selection allocation/access and terrain predicate only. */
#include <stdio.h>
#include <stdlib.h>
#define COLNO 80
#define ROWNO 21
#define TRUE 1
#define FALSE 0
#define staticfn static
typedef int boolean;
typedef int coordxy;
struct selectionvar { unsigned char cells[80][21]; };
static int terrain[80][21], wanted;
static int isok(int x,int y){ return x>=1 && x<80 && y>=0 && y<21; }
static struct selectionvar *selection_new(void){return calloc(1,sizeof(struct selectionvar));}
static void selection_free(struct selectionvar *s,int unused){(void)unused;free(s);}
static int selection_getpoint(int x,int y,struct selectionvar *s){return s->cells[x][y];}
static void selection_setpoint(int x,int y,struct selectionvar *s,int v){s->cells[x][y]=v;}
static void panic(const char *s){fprintf(stderr,"%s",s);exit(2);}
static int match(int x,int y){return terrain[x][y]==wanted;}
static int (*selection_flood_check_func)(int,int)=match;
staticfn boolean
sel_flood_havepoint(
    coordxy x, coordxy y,
    coordxy xs[], coordxy ys[],
    int n)
{
    coordxy xx = x, yy = y;

    while (n > 0) {
        --n;
        if (xs[n] == xx && ys[n] == yy)
            return TRUE;
    }
    return FALSE;
}

void
selection_floodfill(
    struct selectionvar *ov,
    coordxy x, coordxy y,
    boolean diagonals)
{
    struct selectionvar *tmp = selection_new();
#define SEL_FLOOD_STACK (COLNO * ROWNO)
#define SEL_FLOOD(nx, ny) \
    do {                                      \
        if (idx < SEL_FLOOD_STACK) {          \
            dx[idx] = (nx);                   \
            dy[idx] = (ny);                   \
            idx++;                            \
        } else                                \
            panic(floodfill_stack_overrun);   \
    } while (0)
#define SEL_FLOOD_CHKDIR(mx, my, sel) \
    do {                                                        \
        if (isok((mx), (my))                                    \
            && (*selection_flood_check_func)((mx), (my))        \
            && !selection_getpoint((mx), (my), (sel))           \
            && !sel_flood_havepoint((mx), (my), dx, dy, idx))   \
            SEL_FLOOD((mx), (my));                              \
    } while (0)
    static const char floodfill_stack_overrun[] = "floodfill stack overrun";
    int idx = 0;
    coordxy dx[SEL_FLOOD_STACK];
    coordxy dy[SEL_FLOOD_STACK];

    if (selection_flood_check_func == (int (*)(coordxy, coordxy)) 0) {
        selection_free(tmp, TRUE);
        return;
    }
    SEL_FLOOD(x, y);
    do {
        idx--;
        x = dx[idx];
        y = dy[idx];
        if (isok(x, y)) {
            selection_setpoint(x, y, ov, 1);
            selection_setpoint(x, y, tmp, 1);
        }
        SEL_FLOOD_CHKDIR((x + 1), y, tmp);
        SEL_FLOOD_CHKDIR((x - 1), y, tmp);
        SEL_FLOOD_CHKDIR(x, (y + 1), tmp);
        SEL_FLOOD_CHKDIR(x, (y - 1), tmp);
        if (diagonals) {
            SEL_FLOOD_CHKDIR((x + 1), (y + 1), tmp);
            SEL_FLOOD_CHKDIR((x - 1), (y - 1), tmp);
            SEL_FLOOD_CHKDIR((x - 1), (y + 1), tmp);
            SEL_FLOOD_CHKDIR((x + 1), (y - 1), tmp);
        }
    } while (idx > 0);
#undef SEL_FLOOD
#undef SEL_FLOOD_STACK
#undef SEL_FLOOD_CHKDIR
    selection_free(tmp, TRUE);
}


int main(void){int x,y,sx,sy,diagonal;while(scanf("%d%d%d",&sx,&sy,&diagonal)==3){
 for(y=0;y<21;y++)for(x=0;x<80;x++)if(scanf("%d",&terrain[x][y])!=1)return 3;
 wanted=terrain[sx][sy]; struct selectionvar *out=selection_new();
 selection_floodfill(out,sx,sy,diagonal);
 for(y=0;y<21;y++)for(x=0;x<80;x++)putchar(out->cells[x][y]?'1':'0');
 putchar('\n');selection_free(out,TRUE);
}return 0;}
