local chosen=des.map('..')
local follow=des.map({valign='center',map='..'})
des.map({x=1,y=0,map='xxx\nxxx'})
local function bounds(sel)
 local lowx,lowy,highx,highy,count=80,21,0,0,0
 sel:iterate(function(x,y) x=x+1;count=count+1;lowx=math.min(lowx,x);lowy=math.min(lowy,y);highx=math.max(highx,x);highy=math.max(highy,y) end)
 return lowx..','..lowy..','..highx..','..highy..','..count
end
nh.pline('ROW_MAP_TWO_CELLS='..bounds(chosen)..';FOLLOW='..bounds(follow))
des.stair('up',0,0)
des.stair('down',2,2)
