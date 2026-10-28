-- Default whole-level frame: relative (10,10) is absolute (11,10).
des.terrain({x=10,y=10,typ="."})
local a = selection.area(10,10,10,10)
local b = selection.match(".")
-- Target union: should paint one cell. Target subtraction a-b should be empty.
des.terrain(a | b, "-")
-- Controls in independent fresh maps: a|a, b|b, a-a, b-b.
