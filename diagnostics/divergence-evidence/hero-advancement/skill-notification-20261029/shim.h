#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdarg.h>
#include <string.h>
#include <assert.h>
typedef int16_t xint16;
typedef int boolean;
#define TRUE 1
#define FALSE 0
#define staticfn static
#include "nethack-c/upstream/include/skills.h"
struct {struct skills weapon_skills[P_NUM_SKILLS];int weapon_slots,skills_advanced;} u;
static int wizard=0;
#define TIP_ENHANCE 0
static char message[1024];
/* Ordinary awake hero; messages are observed before terminal formatting. */
static void You_feel(const char *fmt,...){char text[512];va_list ap;va_start(ap,fmt);vsnprintf(text,sizeof text,fmt,ap);va_end(ap);assert(!message[0]);snprintf(message,sizeof message,"You feel %s",text);}
/* flags.tips is FALSE: hack.c handle_tip returns immediately, without reads
 * or writes beyond that flag. Enabled tips and display prompting are excluded. */
static int handle_tip(int tip){assert(tip==TIP_ENHANCE);return FALSE;}
