// The canvas behaviour — pan, zoom, fullscreen, selection, find, mini-map.
//
// SHARED VERBATIM. This file is copied byte-for-byte into every repo built to the `conducks-visuals` skill, exactly as
// `system.css` is (conducks-visuals §0). Do not edit it locally.
//
// It exists as a FILE because for a long time it did not. The script lived only inside the published
// `architecture.html`, and `render.mjs` recovered it by slicing its own previous output. A second
// repo therefore had nothing to copy: it built the toolbar and the mini-map from the markup table in
// §0, shipped them with no script at all, and every button was dead while the drawing looked right.
//
// The page must contain `#canvas`, `#viewport`, `.zoom-bar`, `.minimap` and `#mini`/`#mini-g`/
// `#mini-vp` for this to bind — see the chrome block in conducks-visuals §0.

(function(){
  var svg=document.getElementById('canvas'), vp=document.getElementById('viewport'),
      wrap=svg.closest('.canvas-wrap'), pct=wrap.querySelector('.zoom-pct');
  var s=1,tx=0,ty=0,drag=false,px=0,py=0,moved=0;
  function apply(){ vp.setAttribute('transform','translate('+tx+','+ty+') scale('+s+')');
                    pct.textContent=Math.round(s*100)+'%'; }
  function zoomAt(a,b,f){ var ns=Math.min(5,Math.max(0.08,s*f));
    tx=a-(a-tx)*(ns/s); ty=b-(b-ty)*(ns/s); s=ns; apply(); }
  function toVB(e){ var r=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal;
    var k=Math.max(vb.width/r.width, vb.height/r.height);
    return [(e.clientX-r.left)*k,(e.clientY-r.top)*k]; }
  svg.addEventListener('wheel',function(e){ e.preventDefault(); var p=toVB(e);
    zoomAt(p[0],p[1], e.deltaY<0?1.12:1/1.12); },{passive:false});
  svg.addEventListener('mousedown',function(e){ drag=true; moved=0; px=e.clientX; py=e.clientY;
    svg.classList.add('grabbing'); });
  window.addEventListener('mouseup',function(){ drag=false; svg.classList.remove('grabbing'); });
  // A drag must not fire the link under the cursor; a genuine click still must.
  svg.addEventListener('click',function(e){ if(moved>4){ e.preventDefault(); e.stopPropagation(); } },true);
  window.addEventListener('mousemove',function(e){ if(!drag)return;
    var r=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal;
    var k=Math.max(vb.width/r.width, vb.height/r.height);
    moved+=Math.abs(e.clientX-px)+Math.abs(e.clientY-py);
    tx+=(e.clientX-px)*k; ty+=(e.clientY-py)*k; px=e.clientX; py=e.clientY; apply(); });
  wrap.querySelector('.zoom-bar').addEventListener('click',function(e){
    var a=e.target.getAttribute&&e.target.getAttribute('data-z'); if(!a)return;
    var vb=svg.viewBox.baseVal;
    if(a==='in')  zoomAt(vb.width/2,vb.height/2,1.3);
    if(a==='out') zoomAt(vb.width/2,vb.height/2,1/1.3);
    if(a==='reset'){ s=1; tx=0; ty=0; apply(); }
    if(a==='fit'){ fit(); }
    if(a==='full') toggleFull();
  });
  // Fit: the canvas is taller than it is wide, so scale to whichever axis runs out first.
  function fit(){
    var r=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal;
    var k=Math.max(vb.width/r.width, vb.height/r.height);
    s=Math.min((r.width*k)/vb.width,(r.height*k)/vb.height); tx=0; ty=0; apply();
  }
  // Real fullscreen where the browser allows it; a fixed overlay where it does not, so the button
  // does the same thing either way. Both paths end up with the canvas filling the window.
  function isFull(){ return document.fullscreenElement===wrap || wrap.classList.contains('overlay'); }
  function toggleFull(){
    if(isFull()){
      if(document.fullscreenElement) document.exitFullscreen().catch(function(){});
      wrap.classList.remove('overlay');
    } else if(wrap.requestFullscreen){
      wrap.requestFullscreen().catch(function(){ wrap.classList.add('overlay'); });
    } else {
      wrap.classList.add('overlay');
    }
    setTimeout(markFull, 60);
  }
  function markFull(){
    var on=isFull();
    wrap.classList.toggle('is-full', on);
    var b=wrap.querySelector('[data-z="full"]');
    if(b){ b.textContent = on ? '⤡' : '⤢'; b.title = on ? 'exit fullscreen (Esc)' : 'fullscreen (f · Esc to exit)'; }
  }
  document.addEventListener('fullscreenchange', markFull);
  document.addEventListener('keydown',function(e){
    if(e.key==='f'||e.key==='F'){ toggleFull(); }
    if(e.key==='Escape'&&wrap.classList.contains('overlay')){ wrap.classList.remove('overlay'); markFull(); }
    if(e.key==='0'){ s=1; tx=0; ty=0; apply(); }
    if(e.key==='+'||e.key==='='){ var vb=svg.viewBox.baseVal; zoomAt(vb.width/2,vb.height/2,1.3); }
    if(e.key==='-'){ var v2=svg.viewBox.baseVal; zoomAt(v2.width/2,v2.height/2,1/1.3); }
  });

  // ── selection ───────────────────────────────────────────────────────────────
  // Selecting pins a class ON THE ELEMENT, so zooming and panning cannot lose it — that is the whole
  // point: you pick a line, then move around freely and it stays lit.
  //
  //   click an EDGE   → follow that one line, everything else dims
  //   click a BLOCK   → light every edge touching it, and the blocks at their far ends
  //   shift-click     → add to the selection
  //   Esc / empty     → clear
  //
  // A block is wrapped in a link, so a plain click would navigate. Selecting is the more common
  // action by far, so a plain click selects and ⌘/Ctrl-click (or the toolbar link) opens the detail.
  var selEdges = new Set(), selBlocks = new Set();
  var allEdges = [].slice.call(svg.querySelectorAll('.e'));

  function edgesTouching(id){
    return allEdges.filter(function(g){
      return g.getAttribute('data-from') === id || g.getAttribute('data-to') === id;
    });
  }
  function paintSel(){
    var live = selEdges.size + selBlocks.size > 0;
    svg.classList.toggle('has-sel', live);
    var lit = new Set(selEdges), litBlocks = new Set(selBlocks);
    selBlocks.forEach(function(id){
      edgesTouching(id).forEach(function(g){
        lit.add(g.getAttribute('data-e'));
        litBlocks.add(g.getAttribute('data-from'));
        litBlocks.add(g.getAttribute('data-to'));
      });
    });
    allEdges.forEach(function(g){ g.classList.toggle('sel', lit.has(g.getAttribute('data-e'))); });
    svg.querySelectorAll('.lbl').forEach(function(el){
      el.classList.toggle('sel', lit.has(el.getAttribute('data-e')));
    });
    svg.querySelectorAll('.blk').forEach(function(el){
      var id = (el.id || '').replace(/^blk-/, '');
      el.classList.toggle('on', litBlocks.has(id));
      el.classList.toggle('pick', selBlocks.has(id));
    });
    var n = wrap.querySelector('.sel-count');
    if (n) n.textContent = live ? (selBlocks.size ? selBlocks.size + ' block' : lit.size + ' edge')
                                  + (Math.max(selBlocks.size, lit.size) === 1 ? '' : 's') + ' · Esc clears' : '';
  }
  function clearSel(){ selEdges.clear(); selBlocks.clear(); paintSel(); }

  svg.addEventListener('click', function(e){
    if (moved > 4) return;                       // that was a drag, not a click
    var g = e.target.closest && e.target.closest('.e');
    if (g) {
      e.preventDefault(); e.stopPropagation();
      var id = g.getAttribute('data-e');
      if (!e.shiftKey) { selBlocks.clear(); if (!selEdges.has(id)) selEdges.clear(); }
      selEdges.has(id) ? selEdges.delete(id) : selEdges.add(id);
      paintSel(); return;
    }
    var b = e.target.closest && e.target.closest('.blk');
    if (b) {
      // THREE GESTURES, and each is the obvious one for what it does:
      //   single click  -> highlight this block's connections (the common act: reading the wiring)
      //   the `i` disc  -> open its page (an explicit target, so one click is unambiguous)
      //   double click  -> open its page (the shortcut, anywhere on the block)
      // The whole block is wrapped in <a>, so "select" means suppressing that link everywhere
      // EXCEPT the marker. Earlier versions bound opening to the whole block, which made tracing an
      // edge impossible without navigating away, and before that to cmd-click, which nobody finds.
      if (e.target.classList && e.target.classList.contains('hint-h')) return;   // the i — open
      e.preventDefault(); e.stopPropagation();
      var bid = (b.id || '').replace(/^blk-/, '');
      if (!e.shiftKey) { selEdges.clear(); if (!selBlocks.has(bid)) selBlocks.clear(); }
      selBlocks.has(bid) ? selBlocks.delete(bid) : selBlocks.add(bid);
      paintSel(); return;
    }
    if (selEdges.size || selBlocks.size) clearSel();
  });

  // DOUBLE CLICK opens, anywhere on the block. The single click already ran and selected — that is
  // deliberate: the selection shows you WHICH block you are about to open, and it is still there
  // when you come back. Navigating by assignment rather than letting the <a> fire, because the
  // click handler above suppressed the default and a suppressed default does not come back.
  svg.addEventListener('dblclick', function(e){
    var b = e.target.closest && e.target.closest('.blk');
    if (!b) return;
    var a = b.querySelector('a');
    var href = a && a.getAttribute('href');
    if (!href) return;                          // a block with no page — nothing to open
    e.preventDefault(); e.stopPropagation();
    window.location.href = href;
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && (selEdges.size || selBlocks.size)) clearSel();
  });

  // ── find ────────────────────────────────────────────────────────────────────
  // Typing matches a block's own title text. Enter centres the first match, so a name is enough to
  // get to a block on a canvas this size without hunting.
  var find = wrap.querySelector('.find'), findN = wrap.querySelector('.find-n');
  var blocks = [].slice.call(svg.querySelectorAll('.blk')).map(function(el){
    var t = el.querySelector('.b-t'), r = el.querySelector('rect');
    return { el: el, text: (t ? t.textContent : '').toLowerCase(),
             x: +r.getAttribute('x'), y: +r.getAttribute('y'),
             w: +r.getAttribute('width'), h: +r.getAttribute('height') };
  });
  function centreOn(b){
    var r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    var k = Math.max(vb.width / r.width, vb.height / r.height);
    s = Math.max(s, 0.9);
    tx = (r.width * k) / 2 - (b.x + b.w / 2) * s;
    ty = (r.height * k) / 2 - (b.y + b.h / 2) * s;
    apply();
  }
  if (find) {
    find.addEventListener('input', function(){
      var q = find.value.trim().toLowerCase();
      var hits = q ? blocks.filter(function(b){ return b.text.indexOf(q) !== -1; }) : [];
      blocks.forEach(function(b){ b.el.classList.toggle('hit', q && hits.indexOf(b) !== -1); });
      findN.textContent = q ? (hits.length || 'none') : '';
      if (q && hits.length) centreOn(hits[0]);
    });
    find.addEventListener('keydown', function(e){
      if (e.key === 'Escape') { find.value = ''; find.dispatchEvent(new Event('input')); find.blur(); }
      e.stopPropagation();                       // so f / 0 / - do not fire while typing
    });
  }

  // ── mini-map ────────────────────────────────────────────────────────────────
  // Every block as a grey rectangle, plus a box showing what is on screen. Drag it to move.
  var mini = document.getElementById('mini'), miniG = document.getElementById('mini-g'),
      miniVp = document.getElementById('mini-vp');
  if (mini) {
    var vb0 = svg.viewBox.baseVal;
    mini.setAttribute('viewBox', '0 0 ' + vb0.width + ' ' + vb0.height);
    mini.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    miniG.innerHTML = blocks.map(function(b){
      return '<rect x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + b.h + '"/>';
    }).join('');
    var syncMini = function(){
      var r = svg.getBoundingClientRect(), k = Math.max(vb0.width / r.width, vb0.height / r.height);
      miniVp.setAttribute('x', (-tx / s).toFixed(0));
      miniVp.setAttribute('y', (-ty / s).toFixed(0));
      miniVp.setAttribute('width', (r.width * k / s).toFixed(0));
      miniVp.setAttribute('height', (r.height * k / s).toFixed(0));
    };
    var _apply = apply;
    apply = function(){ _apply(); syncMini(); };
    var miniJump = function(ev){
      var mr = mini.getBoundingClientRect();
      var scale = Math.min(mr.width / vb0.width, mr.height / vb0.height);
      var ox = (mr.width - vb0.width * scale) / 2, oy = (mr.height - vb0.height * scale) / 2;
      var gx = (ev.clientX - mr.left - ox) / scale, gy = (ev.clientY - mr.top - oy) / scale;
      var r = svg.getBoundingClientRect(), k = Math.max(vb0.width / r.width, vb0.height / r.height);
      tx = (r.width * k) / 2 - gx * s; ty = (r.height * k) / 2 - gy * s; apply();
    };
    var miniDrag = false;
    mini.addEventListener('mousedown', function(e){ miniDrag = true; miniJump(e); e.preventDefault(); });
    window.addEventListener('mousemove', function(e){ if (miniDrag) miniJump(e); });
    window.addEventListener('mouseup', function(){ miniDrag = false; });
  }

  apply(); markFull();
})();
