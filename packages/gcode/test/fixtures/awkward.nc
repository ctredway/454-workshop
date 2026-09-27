(A deliberately badly-behaved file: 454's protections exist for files like this)
G21
G90
M3 S18000
G0 X10 Y10
G0 Z2
G1 Z-2 F300
G1 X50 F800
M5
(the spindle was stopped with the tool still in the cut)
M3 S16000
G1 X60 Y20 F800
M6 T2
(a tool change with the spindle running and the tool down)
G0 X20 Y20
G1 Z-1.5 F300
G1 X40 F800
(ends in the material: no lift, no M5, no M30)
