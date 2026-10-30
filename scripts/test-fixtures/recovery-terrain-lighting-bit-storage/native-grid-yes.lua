des.level_init({style='solidfill', fg='.', lit='yes'})
local litcount = 0
for x=1,77 do for y=0,20 do
  if nh.getmap(x,y).lit then litcount = litcount + 1 end
end end
nh.pline('TLIT_NATIVE_GRID_YES=' .. litcount .. '/1617')
des.stair('up',3,3)
des.stair('down',5,3)
