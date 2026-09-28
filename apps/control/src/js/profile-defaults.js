/* ---------------- machine profile (persisted) ---------------- */
var PROFILE = {
  bitSetter:{enabled:false, x:null, y:null},
  bitZero:{enabled:false, version:'v2', thk:null},
  spindle:{type:'router', spinup:7},
  jog:{inc:'1', fastXY:3000, fastZ:600},
  run:{highStart:true, travelZ:5, topZ:2, parkEnd:true,
       park:{enabled:false, x:null, y:null},                 // end of job
       tc:{enabled:true, preset:'fc', x:null, y:null}},      // tool changes; preset unless 'custom'
  view:{envW:425, envD:425, envUser:false, origin:'corner', stock:0, rapidRate:5000, checkEnvelope:false, showEnvelope:false},
  // saved G-code snippets for things done often; edit or delete these starters freely
  quick:[
    {name:'Raise Z to top', code:'G53 G0 Z-5'},
    {name:'Spindle warm-up', code:'(2 minutes: slow, then faster)\nM3 S8000\nG4 P60\nM3 S16000\nG4 P60\nM5'}
  ]
};

