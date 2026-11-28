int main(int argc,char **argv){
 if(argc!=2)return 2;
 FILE *f=fopen(argv[1],"r");if(!f)return 2;
 int index,ri,ra,lev,con,wis,extreme,al,hpmax,enmax;
 while(fscanf(f,"%d %d %d %d %d %d %d %d %d %d",&index,&ri,&ra,&lev,&con,&wis,&extreme,&al,&hpmax,&enmax)==10){
  assert(ri>=0&&ri<13&&ra>=0&&ra<5&&lev>=0&&lev<=30&&con>=3&&con<=25&&wis>=3&&wis<=25);
  memset(&u,0,sizeof u);rng[0]=0;draws=0;upper=extreme;con_attr=con;wis_attr=wis;
  gu.urole=role_data[ri];gu.urace=race_data[ra];role_kind=role_codes[ri];
  u.ulevel=lev;u.uhpmax=hpmax;u.uenmax=enmax;for(int i=0;i<30;i++){u.uhpinc[i]=77;u.ueninc[i]=77;}aligns[0].value=1;aligns[1].value=0;aligns[2].value=-1;
  assert(al>=0&&al<=2);flags.initalign=al;u.ualign.type=aligns[al].value;u.ualign.record=0;svm.moves=0;
  int hp=newhp();int en=newpw();
  printf("{\"index\":%d,\"hp\":%d,\"en\":%d,\"storedHp\":%d,\"storedEn\":%d,\"alignType\":%d,\"alignRecord\":%d,\"rng\":\"%s\"}\n",index,hp,en,u.uhpinc[lev<30?lev:29],u.ueninc[lev<30?lev:29],u.ualign.type,u.ualign.record,rng);
 }
 if(!feof(f))return 2;
 fclose(f);
 return 0;
}
