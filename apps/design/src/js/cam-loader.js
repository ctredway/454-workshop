(function(){
  var q = location.search, on = false;
  var local = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname || '');
  try{
    if (/[?&]cam=off\b/.test(q)) localStorage.setItem('454-cam', 'off');
    else if (/[?&]cam\b/.test(q)) localStorage.setItem('454-cam', 'on');
    var pref = localStorage.getItem('454-cam');
    on = pref !== 'off';                            // CAM is released, in beta: on unless turned off (?cam=off)
  }catch(e){ on = local; }
  window.__camWanted = on;                         // so the panel can say if the files are missing
  if (on) document.write('<script src="geom.js"><\/script><script src="cam.js"><\/script>');
})();
