-- Public descriptor sequence; reproduced by probe.mjs and C callback oracle.
-- Use the default whole-level frame (xstart=1, ystart=0).
for x=9,11 do
  for y=9,11 do des.terrain({x=x,y=y,typ="."}) end
end
des.door({x=10,y=10,state="secret"})
des.door({x=10,y=10,state="locked"})
des.terrain({x=9,y=10,typ="-"})
-- Target; controls replace this final statement as documented.
des.terrain({x=10,y=10,typ="A"})
