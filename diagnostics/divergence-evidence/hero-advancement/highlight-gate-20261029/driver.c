int main(int argc,char **argv){
 if(argc!=2)return 2;
 FILE*f=fopen(argv[1],"r");if(!f)return 2;
 int id,preset,pending;long oldxp,newxp;
 while(fscanf(f,"%d %d %ld %ld %d",&id,&preset,&oldxp,&newxp,&pending)==5){
  assert(preset>=0&&preset<=3&&oldxp>=0&&newxp>=oldxp&&newxp<20);
  memset(&gb,0,sizeof gb);memset(&u,0,sizeof u);u.ulevel=1;u.uexp=oldxp;flags.showexp=0;flags.beginner=1;disp.botl=pending;
  struct hilite_s rules[3];memset(rules,0,sizeof rules);
  if(preset==1||preset==3){
   rules[0].behavior=rules[1].behavior=BL_TH_VAL_PERCENTAGE;rules[0].rel=LT_VALUE;rules[1].rel=preset==1?GE_VALUE:EQ_VALUE;
   rules[0].value.a_int=rules[1].value.a_int=preset==1?50:100;rules[0].coloridx=1;rules[1].coloridx=2;rules[0].next=&rules[1];
  }else if(preset==2){
   rules[0].behavior=BL_TH_ALWAYS_HILITE;rules[0].coloridx=4;rules[0].next=&rules[1];
   rules[1].behavior=BL_TH_UPDOWN;rules[1].rel=GT_VALUE;rules[1].coloridx=2;rules[1].next=&rules[2];
   rules[2].behavior=BL_TH_VAL_PERCENTAGE;rules[2].rel=GE_VALUE;rules[2].value.a_int=50;rules[2].coloridx=1;
  }
  initblstats[BL_XP].anytype=ANY_INT;gb.blstats[0][BL_XP].percent_matters=1;gb.blstats[0][BL_XP].thresholds=preset?rules:NULL;
  gb.blstats[0][BL_XP].percent_value=exp_percentage();anything value=cg.zeroany;value.a_int=1;int color;
  gb.blstats[0][BL_XP].hilite_rule=get_hilite(0,BL_XP,&value,0,exp_percentage(),&color);
  u.uexp=newxp;int changed=exp_percent_changing();u.uexp=oldxp;more_experienced((int)(newxp-oldxp),0);
  printf("{\"id\":%d,\"changed\":%s,\"redraw\":%s,\"xp\":%ld,\"score\":%ld}\n",id,changed?"true":"false",disp.botl?"true":"false",u.uexp,u.urexp);
 }
 int result=feof(f)?0:2;fclose(f);return result;
}
