int main(int argc,char **argv){
 if(argc!=2)return 2;
 FILE *f=fopen(argv[1],"r");if(!f)return 2;
 int index,skill,rank,maxrank,practice,slots,increment,advanced;
 while(fscanf(f,"%d %d %d %d %d %d %d %d",&index,&skill,&rank,&maxrank,&practice,&slots,&increment,&advanced)==8){
  assert(skill>0&&skill<P_NUM_SKILLS&&slots>=0&&practice>=0&&practice<=65535);
  memset(&u,0,sizeof u);message[0]=0;
  u.weapon_slots=slots;u.skills_advanced=advanced;
  P_SKILL(skill)=rank;P_MAX_SKILL(skill)=maxrank;P_ADVANCE(skill)=practice;
  int before=can_advance(skill,FALSE);
  add_weapon_skill(increment);
  int after=can_advance(skill,FALSE);
  printf("{\"index\":%d,\"before\":%s,\"after\":%s,\"slots\":%d,\"message\":\"%s\"}\n",index,before?"true":"false",after?"true":"false",u.weapon_slots,message);
 }
 if(!feof(f))return 2;
 fclose(f);return 0;
}
