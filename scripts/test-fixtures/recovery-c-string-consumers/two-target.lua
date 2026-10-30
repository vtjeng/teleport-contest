local chosen=des.map({x=10,y=6,map='...\n...\n\0..'})
des.map({x=1,y=0,map='xxx\nxxx'})
local lowx,lowy,highx,highy,count=80,21,0,0,0
chosen:iterate(function(x,y) x=x+1;count=count+1;lowx=math.min(lowx,x);lowy=math.min(lowy,y);highx=math.max(highx,x);highy=math.max(highy,y) end)
nh.pline('MAP_PREFIX_TWO_TARGET='..lowx..','..lowy..','..highx..','..highy..','..count)
des.stair('up',0,0)
des.stair('down',2,2)
