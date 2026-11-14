/* The Create screen: draw, turn a picture into stitches, or set text. This is the Stitch Sketchbook's
   interface, mounted into a shadow root so its styles and Respira's stay out of each other's way.
   Plain JavaScript on purpose; the typed surface is in studioApp.d.ts. */
import { StitchEngine as E } from './engine.js';
import { drawingColors, recolorDrawing } from './recolor.js';
import { pictureDetailWarnings } from './pictureWarnings.js';
import { engineSettings, stitchDefaults } from './stitchSettings.js';
import { hitTestLayer, designBounds, scaleAbout, resizeFromCorner } from './selection.js';
import { transformPoint, transformDesign, composePlans, identityTransform } from './composition.js';
import { letteringDesign, EMBROIDERY_FONT } from './lettering.js';
import { EMBROIDERY_FONTS, isEmbroideryFont } from './embroideryFonts.js';
import { shapePoints } from './shapes.js';
import { STUDIO_MARKUP } from './markup.js';

export function mountStudio(root, opts) {
  opts = opts || {};
  var holder = document.createElement('div');
  holder.className = 'studio-root';
  holder.innerHTML = STUDIO_MARKUP;
  var styleEl = null;
  if (opts.css) { styleEl = document.createElement('style'); styleEl.textContent = opts.css; root.appendChild(styleEl); }
  root.appendChild(holder);
  var PEC = E.PEC, GRID = E.GRID, RES = E.RES, HOOP = E.HOOP, CMD = E.CMD;
  var KEY = 'stitch-sketchbook:v1';
  var $ = function (s) { return root.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
  var cleanups = [];
  var destroyed = false, loadedProject = null, moveDrawing = true;
  function listen(target, type, fn, o) { target.addEventListener(type, fn, o); cleanups.push(function () { target.removeEventListener(type, fn, o); }); }
  function shown() { return holder.getClientRects().length > 0; }

  var CURATED = [20, 29, 5, 43, 13, 37, 2, 55];
  var ALL = []; for (var ti = 1; ti < 64; ti++) ALL.push(ti);
  var FABRICS = [['#FFFFFF', 'White'], ['#E9E1CF', 'Natural linen'], ['#B8BCC4', 'Heather gray'], ['#1F2944', 'Navy'], ['#181818', 'Black']];
  var FONTS = {
    ...Object.fromEntries(Object.entries(EMBROIDERY_FONTS).map(([id,font])=>[id,{label:font.label+' · embroidery',embroidery:true}])),
    'Lobster': { css: '"Lobster", cursive', weight: 400, label: 'Lobster (script)' },
    'Pacifico': { css: '"Pacifico", cursive', weight: 400, label: 'Pacifico (script)' },
    'Fredoka': { css: '"Fredoka", sans-serif', weight: 600, label: 'Fredoka (rounded)' },
    'Titan One': { css: '"Titan One", sans-serif', weight: 400, label: 'Titan One (chunky)' },
    'Archivo Black': { css: '"Archivo Black", sans-serif', weight: 400, label: 'Archivo Black (bold)' },
    'Bebas Neue': { css: '"Bebas Neue", sans-serif', weight: 400, label: 'Bebas Neue (tall capitals)' },
    'Bungee': { css: '"Bungee", sans-serif', weight: 400, label: 'Bungee (block)' },
    'Permanent Marker': { css: '"Permanent Marker", cursive', weight: 400, label: 'Permanent Marker' },
    'Righteous': { css: '"Righteous", sans-serif', weight: 400, label: 'Righteous (retro)' }
  };
  var SIZE_CFG = {
    satin: { min: 1.5, max: 6, step: 0.1, label: 'Width' },
    brush: { min: 2, max: 20, step: 0.5, label: 'Brush' },
    eraser: { min: 2, max: 20, step: 0.5, label: 'Eraser' }
  };
  var MIN_SPECK = { 1: 25, 2: 75, 3: 200 }; // grid cells (0.04 mm² each)

  // ---------- state ----------
  var S = {
    mode: 'draw',
    view: { draw: 'design', image: 'stitches', text: 'stitches' },
    fabric: '#FFFFFF',
    hoop: { real: true, pxmm: null },      // pxmm: CSS px per mm once the size was checked against a card
    settings: { spacing: 0.4, angle: 45, underlay: true },
    draw: { tool: 'satin', color: 37, sizes: { satin: 3, brush: 6, eraser: 6 }, pressure: true, strokes: [], labels: new Uint8Array(GRID * GRID), order: [], example: false },
    image: { source: null, fileName: '', sizeMM: 80, k: 4, removeBg: true, clean: 2, proc: null, clusters: [] },
    text: { value: 'Bharti', font: 'SmallSatin', widthMM: 80, color: 5, heightMM: 8, letterSpacing: 0.5, lineGap: 2, align: 'center' },
    name: '', nameAuto: true, placement: undefined,
    design: null, parts: [], layers: [], activeId: null, plan: null, stats: null, note: ''
  };
  var undoStack = [], redoStack = [];
  var objectBounds = new Map(), zoom = 1, showGrid = true, panCanvas = false, pictureNotes = [];

  // ---------- helpers ----------
  function rgb(i) { var c = PEC[i]; return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  function mix(c, t) {
    var f = function (v) { return Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t); };
    return 'rgb(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ')';
  }
  function lum(hexOrIdx) {
    var c = typeof hexOrIdx === 'number' ? PEC[hexOrIdx] : [parseInt(hexOrIdx.substr(1, 2), 16), parseInt(hexOrIdx.substr(3, 2), 16), parseInt(hexOrIdx.substr(5, 2), 16)];
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  }
  function threadName(i) { return PEC[i][3]; }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function slug(s) {
    return String(s || '').trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9_-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
  }

  // ---------- palettes ----------
  function Palette(el, get, set, opts) {
    var showAll = false;
    function draw() {
      el.innerHTML = '';
      var sel = get(), list = (opts && opts.all) || showAll ? ALL.slice() : CURATED.slice();
      if (list.indexOf(sel) < 0) list.push(sel);
      list.forEach(function (i) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'swatch';
        b.style.setProperty('--c', rgb(i));
        b.title = threadName(i) + ' · ' + i;
        b.setAttribute('aria-label', threadName(i) + ', thread ' + i);
        b.setAttribute('aria-pressed', String(i === sel));
        b.addEventListener('click', function () { set(i); draw(); });
        el.appendChild(b);
      });
      if (!(opts && opts.all)) {
        var t = document.createElement('button');
        t.type = 'button'; t.className = 'swatch-more';
        t.textContent = showAll ? 'Fewer colors' : 'All 63 threads';
        t.addEventListener('click', function () { showAll = !showAll; draw(); });
        el.appendChild(t);
      }
    }
    draw();
    return { draw: draw };
  }

  // ---------- stage ----------
  var stage = $('#stage'), base = $('#base'), over = $('#overlay');
  var bctx = base.getContext('2d'), octx = over.getContext('2d');
  var px = 1;
  function resizeStage() {
    var r = stage.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var size = Math.max(10, Math.round(r.width * dpr));
    if (base.width !== size) { base.width = base.height = over.width = over.height = size; }
    px = size / HOOP;
    render();
  }
  // ---------- real size: the hoop on screen measures a true 100 mm (4 in) ----------
  // A web page cannot ask how big its pixels are, so this goes by the device: every iPad is 132 points per
  // inch except the mini (163). Other screens get a sensible guess and the card check to correct it.
  var stageCol = $('.stage-col');
  function guessPxPerMM() {
    var ua = navigator.userAgent || '', touch = (navigator.maxTouchPoints || 0) > 1;
    var w = Math.min(screen.width, screen.height), h = Math.max(screen.width, screen.height);
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) return { v: (w === 744 && h === 1133 ? 163 : 132) / 25.4, sure: true };
    if (/Macintosh/.test(ua)) {
      var known = { '1470x956': 128.6, '1512x982': 127, '1728x1117': 127, '1710x1107': 133, '1440x900': 127.7, '2240x1260': 109, '2560x1440': 109 };
      return { v: (known[screen.width + 'x' + screen.height] || 127) / 25.4, sure: false };
    }
    return { v: 96 / 25.4, sure: false };
  }
  var sizeGuess = guessPxPerMM();
  function pxPerMM() { return S.hoop.pxmm || sizeGuess.v; }
  function applyHoopSize() {
    var need = Math.round(HOOP * pxPerMM()) + 22;       // the hoop's rim is 11 px each side
    var viewport = $('#canvas-viewport');
    // Space inside the viewport's 4 px padding; zero until the screen is laid out (and in tests).
    var roomW = viewport.clientWidth - 8, roomH = viewport.clientHeight - 8, room = Math.min(roomW, roomH);
    var fit = Math.max(100, room > 0 ? room - 16 : 400);
    // Real size means real size. A screen that is too small scrolls (Pan) instead of quietly shrinking the hoop:
    // drawing at a true 100 mm is the point of this view. "Fit screen" is one tap away in the View menu.
    var width = (S.hoop.real ? need : fit) * zoom;
    $('.hoop').style.width = width + 'px';
    // Up to 6 px of the hoop's rim may hang over the edge before it counts as not fitting.
    var overflow = room > 0 && (width > roomW + 6 || width > roomH + 6);
    var real = S.hoop.real && zoom === 1;
    stageCol.classList.toggle('real', real);
    stageCol.style.setProperty('--real-w', need + 'px');
    $('#size-real').setAttribute('aria-pressed', String(S.hoop.real));
    $('#size-fit').setAttribute('aria-pressed', String(!S.hoop.real));
    var sizeText = zoom!==1 ? 'Zoomed preview.' : !S.hoop.real ? 'Scaled to fit the screen.'
      : (S.hoop.pxmm || sizeGuess.sure) ? 'Real size: the hoop is 100 mm (4 in) across, the same as on the machine.'
      : 'Real size is an estimate on this screen.';
    $('#size-note').textContent = sizeText + (overflow ? ' The hoop is larger than this window: tap Pan and drag to reach the rest.' : '');
    $('#size-check').hidden = !S.hoop.real;
    // Pan only earns its place in the heading while there is something to pan to.
    $('#pan-canvas').hidden = !overflow;
    if (!overflow && panCanvas) setPan(false);
  }
  $('#size-real').addEventListener('click', function () { S.hoop.real = true; resetZoom(); applyHoopSize(); scheduleSave(); });
  $('#size-fit').addEventListener('click', function () { S.hoop.real = false; resetZoom(); applyHoopSize(); scheduleSave(); });
  function showRuler(v) {
    var o = $('#ruler-outline');
    o.style.width = (85.6 * v) + 'px'; o.style.height = (53.98 * v) + 'px';   // a bank card is 85.60 x 53.98 mm
    $('#ruler-slider').value = v;
  }
  function closeRuler() { $('#ruler').hidden = true; applyHoopSize(); scheduleSave(); }
  $('#size-check').addEventListener('click', function () { showRuler(pxPerMM()); $('#ruler').hidden = false; });
  $('#ruler-slider').addEventListener('input', function (e) { S.hoop.pxmm = +e.target.value; showRuler(S.hoop.pxmm); });
  $('#ruler-reset').addEventListener('click', function () { S.hoop.pxmm = null; showRuler(sizeGuess.v); });
  $('#ruler-done').addEventListener('click', closeRuler);
  $('#ruler').addEventListener('click', function (e) { if (e.target === $('#ruler')) closeRuler(); });
  if (window.ResizeObserver) { var roCol = new ResizeObserver(applyHoopSize); roCol.observe($('#canvas-viewport')); cleanups.push(function () { roCol.disconnect(); }); }

  if (window.ResizeObserver) { var ro = new ResizeObserver(resizeStage); ro.observe(stage); cleanups.push(function () { ro.disconnect(); }); }
  listen(window, 'resize', resizeStage);

  var labelCanvas = document.createElement('canvas');
  labelCanvas.width = labelCanvas.height = GRID;
  var labelCtx = labelCanvas.getContext('2d');
  function paintLabels(labels) {
    var img = labelCtx.createImageData(GRID, GRID), d = img.data;
    if (labels) {
      for (var i = 0; i < labels.length; i++) {
        var v = labels[i];
        if (!v) continue;
        var c = PEC[v], o = i * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    labelCtx.putImageData(img, 0, 0);
  }

  function currentView() { return S.view[S.mode]; }

  function render() {
    var ctx = bctx, W = base.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = S.fabric; ctx.fillRect(0, 0, W, W);
    if(showGrid) drawGrid(ctx, W);
    if (currentView() === 'design') drawDesign(ctx);
    else drawStitches(ctx);
    drawCenter(ctx);
    renderSelection();
  }
  function drawGrid(ctx, W) {
    var dark = lum(S.fabric) < 0.45;
    var minor = dark ? 'rgba(255,255,255,.06)' : 'rgba(25,35,70,.05)';
    var major = dark ? 'rgba(255,255,255,.12)' : 'rgba(25,35,70,.10)';
    ctx.lineWidth = Math.max(1, px * 0.08);
    for (var mm = 5; mm < HOOP; mm += 5) {
      ctx.strokeStyle = mm % 10 === 0 ? major : minor;
      var p = Math.round(mm * px) + 0.5;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, W); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke();
    }
    ctx.fillStyle = dark ? 'rgba(255,255,255,.35)' : 'rgba(25,35,70,.35)';
    ctx.font = Math.round(px * 2.1) + 'px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textBaseline = 'top';
    for (mm = 10; mm < HOOP; mm += 10) {
      ctx.fillText(String(mm), mm * px + px * 0.6, px * 0.7);
      if (mm > 10) ctx.fillText(String(mm), px * 0.7, mm * px + px * 0.5);
    }
  }
  function drawCenter(ctx) {
    var dark = lum(S.fabric) < 0.45, c = HOOP / 2 * px, a = 2.2 * px;
    ctx.strokeStyle = dark ? 'rgba(255,255,255,.35)' : 'rgba(25,35,70,.3)';
    ctx.lineWidth = Math.max(1, px * 0.12);
    ctx.beginPath(); ctx.moveTo(c - a, c); ctx.lineTo(c + a, c); ctx.moveTo(c, c - a); ctx.lineTo(c, c + a); ctx.stroke();
  }
  function strokeShape(ctx, st, k, extra) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var pts = st.pts;
    if (pts.length === 1) {
      var w0 = st.kind === 'run' ? 0.8 : pts[0][2];
      ctx.beginPath(); ctx.arc(pts[0][0] * k, pts[0][1] * k, (w0 + extra) * k / 2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (st.kind === 'run') {
      ctx.lineWidth = (0.75 + extra) * k;
      ctx.beginPath(); ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * k, pts[i][1] * k);
      ctx.stroke();
      return;
    }
    var i0 = 0;
    for (var j = 1; j <= pts.length; j++) {
      if (j === pts.length || Math.abs(pts[j][2] - pts[i0][2]) > 0.15) {
        ctx.lineWidth = (pts[i0][2] + extra) * k;
        ctx.beginPath(); ctx.moveTo(pts[Math.max(0, i0 - 1)][0] * k, pts[Math.max(0, i0 - 1)][1] * k);
        for (var q = i0; q < j; q++) ctx.lineTo(pts[q][0] * k, pts[q][1] * k);
        ctx.stroke();
        i0 = j;
      }
    }
  }
  function drawDesign(ctx) {
    S.parts.forEach(function (part) {
      var d = part.design;
      if (!part.preview) {
        paintLabels(d.labels);
        part.preview = document.createElement('canvas'); part.preview.width = part.preview.height = GRID;
        part.preview.getContext('2d').drawImage(labelCanvas, 0, 0);
      }
      ctx.drawImage(part.preview, 0, 0, base.width, base.height);
      (d.lines || []).forEach(function (st) { ctx.strokeStyle = rgb(st.color); ctx.fillStyle = rgb(st.color); strokeShape(ctx, st, px, 0); });
      (d.paths || []).forEach(function (path) { if (!path.pts.length) return; ctx.strokeStyle = rgb(path.color); ctx.lineWidth = Math.max(1,0.3*px); ctx.beginPath(); ctx.moveTo(path.pts[0][0]*px,path.pts[0][1]*px); path.pts.slice(1).forEach(function (p) { ctx.lineTo(p[0]*px,p[1]*px); }); ctx.stroke(); });
    });
  }
  function drawStitches(ctx) {
    var p = S.plan;
    if (!p) return;
    var k = px;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    p.blocks.forEach(function (b) {
      var path = new Path2D(), pen = false;
      b.ops.forEach(function (op) {
        if (op[2] === CMD.STITCH) {
          if (!pen) { path.moveTo(op[0] * k, op[1] * k); pen = true; }
          else path.lineTo(op[0] * k, op[1] * k);
        } else pen = false;
      });
      var c = PEC[b.color];
      ctx.strokeStyle = mix(c, -0.5); ctx.lineWidth = Math.max(1.3, 0.44 * k); ctx.stroke(path);
      ctx.strokeStyle = rgb(b.color); ctx.lineWidth = Math.max(1, 0.31 * k); ctx.stroke(path);
      ctx.strokeStyle = mix(c, 0.5); ctx.lineWidth = Math.max(0.5, 0.08 * k); ctx.stroke(path);
    });
  }

  // ---------- rasterising strokes onto the 0.2 mm grid ----------
  var rc = document.createElement('canvas'); rc.width = rc.height = GRID;
  var rctx = rc.getContext('2d', { willReadFrequently: true });
  function rasterize(fn) {
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.clearRect(0, 0, GRID, GRID);
    rctx.fillStyle = '#000'; rctx.strokeStyle = '#000';
    fn(rctx, 1 / RES);
    var a = rctx.getImageData(0, 0, GRID, GRID).data, m = new Uint8Array(GRID * GRID);
    for (var i = 0; i < m.length; i++) m[i] = a[i * 4 + 3] >= 128 ? 1 : 0;
    return m;
  }
  function polyline(ctx, pts, w, k) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0][0] * k, pts[0][1] * k, w * k / 2, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.lineWidth = w * k;
    ctx.beginPath(); ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * k, pts[i][1] * k);
    ctx.stroke();
  }

  // ---------- drawing input ----------
  var active = null, penSeen = false;
  function toMM(e) {
    var r = over.getBoundingClientRect();
    var point=[clamp((e.clientX-r.left)/r.width*HOOP,0,HOOP),clamp((e.clientY-r.top)/r.height*HOOP,0,HOOP)];
    return transformPoint(point,currentLayer().transform,true).map(function(v){return clamp(v,0,HOOP);});
  }
  function widthFor(e) {
    var d = S.draw;
    if (d.tool === 'satin') {
      var w = d.sizes.satin;
      if (d.pressure && e.pointerType === 'pen' && e.pressure > 0) w = w * (0.4 + 1.2 * e.pressure);
      return clamp(w, 1.2, 6.5);
    }
    if (d.tool === 'brush') return d.sizes.brush;
    if (d.tool === 'eraser') return d.sizes.eraser;
    return 0;
  }
  function liveColor() {
    return S.draw.tool === 'eraser' ? (lum(S.fabric) < 0.45 ? 'rgba(255,255,255,.35)' : 'rgba(30,40,70,.28)') : rgb(S.draw.color);
  }
  function addPoint(e) {
    var p = toMM(e), w = widthFor(e), pts = active.pts, last = pts[pts.length - 1];
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.2) return;
    pts.push([p[0], p[1], w]);
    var k=px, tool=S.draw.tool,lw=(tool==='line'?0.75:w)*currentLayer().transform.scale;
    p=transformPoint(p,currentLayer().transform); if(last)last=transformPoint(last,currentLayer().transform);
    octx.strokeStyle = liveColor(); octx.fillStyle = liveColor();
    octx.lineCap = 'round'; octx.lineJoin = 'round';
    if (!last) { octx.beginPath(); octx.arc(p[0] * k, p[1] * k, lw * k / 2, 0, Math.PI * 2); octx.fill(); }
    else {
      octx.lineWidth = lw * k;
      octx.beginPath(); octx.moveTo(last[0] * k, last[1] * k); octx.lineTo(p[0] * k, p[1] * k); octx.stroke();
    }
  }
  over.addEventListener('pointerdown', function (e) {
    if (active || (e.button && e.button !== 0)) return;
    if(panCanvas){e.preventDefault();var viewport=$('#canvas-viewport');active={id:e.pointerId,pan:true,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};try{over.setPointerCapture(e.pointerId);}catch(err){}return;}
    if(S.mode!=='draw' || moveDrawing) {
      var rect=over.getBoundingClientRect(), hit=hitTestLayer(S.parts,[(e.clientX-rect.left)/rect.width*100,(e.clientY-rect.top)/rect.height*100]);
      if(!hit)return;
      moveDrawing=true;
      if(hit!==S.activeId)selectLayer(hit);
    }
    if(!currentLayer().visible)return;
    if(S.mode!=='draw' || moveDrawing) { e.preventDefault();active={id:e.pointerId,move:true,changed:false,x:e.clientX,y:e.clientY,transform:Object.assign({},currentLayer().transform)};try{over.setPointerCapture(e.pointerId);}catch(err){}return; }
    if (e.pointerType === 'pen') penSeen = true;
    else if (e.pointerType === 'touch' && penSeen) return;
    if (e.button && e.button !== 0) return;
    e.preventDefault();
    if (S.draw.tool === 'bucket') { var p = toMM(e); bucketFill(p[0], p[1]); return; }
    try { over.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    active = { id: e.pointerId, pts: [] };
    if (S.draw.tool === 'eraser') octx.globalAlpha = 1;
    addPoint(e);
  });
  over.addEventListener('pointermove', function (e) {
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    if(active.pan){var viewport=$('#canvas-viewport');viewport.scrollLeft=active.left-(e.clientX-active.x);viewport.scrollTop=active.top-(e.clientY-active.y);return;}
    if(active.resize){
      if(!active.changed){if(Math.hypot(e.clientX-active.x,e.clientY-active.y)<2)return;pushUndo();active.changed=true;}
      var box=over.getBoundingClientRect();
      currentLayer().transform=resizeFromCorner(active.transform,active.bounds,active.corner,[(e.clientX-box.left)/box.width*100,(e.clientY-box.top)/box.height*100]);
      S.placement=undefined;syncLayers();updateDesign();return;
    }
    if(active.move){if(!active.changed){if(Math.hypot(e.clientX-active.x,e.clientY-active.y)<2)return;pushUndo();active.changed=true;}var r=over.getBoundingClientRect();currentLayer().transform.x=clamp(active.transform.x+(e.clientX-active.x)/r.width*100,-100,100);currentLayer().transform.y=clamp(active.transform.y+(e.clientY-active.y)/r.height*100,-100,100);syncLayers();updateDesign();return;}
    var list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (list && list.length) list.forEach(addPoint); else addPoint(e);
  });
  function endStroke(e) {
    if (!active || e.pointerId !== active.id) return;
    if(active.pan){active=null;return;}
    if(active.move||active.resize){var changed=active.changed;active=null;if(changed){S.placement=undefined;updateDesign();scheduleSave();}return;}
    var pts = active.pts; active = null;
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, over.width, over.height);
    if (pts.length) commitStroke(pts);
  }
  over.addEventListener('pointerup', endStroke);
  over.addEventListener('pointercancel', endStroke);
  over.addEventListener('touchstart', function (e) { if (S.mode === 'draw') e.preventDefault(); }, { passive: false });

  function noteOrder(c) { if (S.draw.order.indexOf(c) < 0) S.draw.order.push(c); }
  function commitStroke(pts) {
    var d = S.draw, tool = d.tool;
    pushUndo();
    if (tool === 'line' || tool === 'satin') {
      d.strokes.push({ kind: tool === 'line' ? 'run' : 'satin', color: d.color, pts: pts });
    } else if (tool === 'brush') {
      var m = rasterize(function (ctx, k) { polyline(ctx, pts, d.sizes.brush, k); });
      for (var i = 0; i < m.length; i++) if (m[i]) d.labels[i] = d.color;
      noteOrder(d.color);
    } else if (tool === 'eraser') {
      var er = rasterize(function (ctx, k) { polyline(ctx, pts, d.sizes.eraser, k); });
      for (i = 0; i < er.length; i++) if (er[i]) d.labels[i] = 0;
      var hit = function (x, y) {
        var gx = Math.floor(x / RES), gy = Math.floor(y / RES);
        return gx >= 0 && gy >= 0 && gx < GRID && gy < GRID && er[gy * GRID + gx] === 1;
      };
      var before = d.strokes.length;
      d.strokes = d.strokes.filter(function (st) {
        return !st.pts.some(function (p) {
          var r = st.kind === 'run' ? 0.4 : p[2] / 2;
          return hit(p[0], p[1]) || hit(p[0] + r, p[1]) || hit(p[0] - r, p[1]) || hit(p[0], p[1] + r) || hit(p[0], p[1] - r);
        });
      });
      if (before === d.strokes.length && !er.some(function (v, i) { return v; })) { undoStack.pop(); return; }
    }
    d.example = false;
    afterDrawChange();
  }

  function bucketFill(x, y) {
    var d = S.draw, gx = Math.floor(x / RES), gy = Math.floor(y / RES);
    if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return;
    var barrier = rasterize(function (ctx, k) {
      d.strokes.forEach(function (st) { strokeShape(ctx, st, k, 0.8); });
    });
    var i0 = gy * GRID + gx;
    if (barrier[i0]) { toast('Tap inside a shape, not on its outline.'); return; }
    var seed = d.labels[i0];
    if (seed === d.color) return;
    var region = new Uint8Array(GRID * GRID), stack = new Int32Array(GRID * GRID), sp = 0, count = 0, edge = false;
    stack[sp++] = i0; region[i0] = 1;
    while (sp) {
      var i = stack[--sp], cx = i % GRID, cy = (i - cx) / GRID;
      count++;
      if (cx === 0 || cy === 0 || cx === GRID - 1 || cy === GRID - 1) edge = true;
      var nb = [cx > 0 ? i - 1 : -1, cx < GRID - 1 ? i + 1 : -1, cy > 0 ? i - GRID : -1, cy < GRID - 1 ? i + GRID : -1];
      for (var n = 0; n < 4; n++) {
        var j = nb[n];
        if (j >= 0 && !region[j] && !barrier[j] && d.labels[j] === seed) { region[j] = 1; stack[sp++] = j; }
      }
    }
    pushUndo();
    var grown = E.dilate(region, GRID, GRID, 3);
    for (i = 0; i < region.length; i++) if (region[i] || (grown[i] && barrier[i])) d.labels[i] = d.color;
    noteOrder(d.color);
    d.example = false;
    if (edge && seed === 0 && count > GRID * GRID * 0.45) toast('That filled the background. If you meant a shape, undo and close the gap in its outline.');
    afterDrawChange();
  }

  // ---------- undo ----------
  function cloneLayer(layer) {
    var source=layer.source;
    if(layer.kind==='draw') source=Object.assign({},source,{sizes:Object.assign({},source.sizes),order:source.order.slice(),labels:source.labels.slice(),strokes:source.strokes.map(function(s){return Object.assign({},s,{pts:s.pts.map(function(p){return p.slice();})});})});
    else if(layer.kind==='image') source=Object.assign({},source,{clusters:source.clusters.map(function(c){return Object.assign({},c,{rgb:c.rgb.slice()});})});
    else source=Object.assign({},source);
    // Undo snapshots of a decoding image must receive the same decoded asset, even if
    // they become the active object before the decode completes.
    if(layer.kind==='image' && source.loading && source.loadTicket)source.loadTicket.sources.add(source);
    return Object.assign({},layer,{transform:Object.assign({},layer.transform),source:source,stitchSettings:layer.stitchSettings?Object.assign({},layer.stitchSettings):undefined});
  }
  function snap() { return { layers:S.layers.map(cloneLayer), activeId:S.activeId }; }
  function restore(saved) { S.layers=saved.layers.map(cloneLayer); hydrateImages(); selectLayer(saved.activeId); }
  // Typing in a box or dragging a slider is one edit, not one per keystroke or tick: pass the control's
  // name as `group` and only the step taken when the burst began is kept. A burst ends when a different
  // edit is made, the control reports its final value ("change"), undo or redo is used, or after a pause.
  var undoGroup = null, undoGroupAt = 0;
  function pushUndo(group) {
    var now = Date.now();
    if (group) group += ':' + S.activeId;
    if (group && group === undoGroup && now - undoGroupAt < 1500) { undoGroupAt = now; return; }
    undoGroup = group || null; undoGroupAt = now;
    undoStack.push(snap()); if (undoStack.length > 40) undoStack.shift(); redoStack = []; syncHistory();
  }
  function endUndoGroup() { undoGroup = null; }
  holder.addEventListener('change', endUndoGroup);
  function undo() { if (!undoStack.length) return; endUndoGroup(); redoStack.push(snap()); restore(undoStack.pop()); afterDrawChange(); }
  function redo() { if (!redoStack.length) return; endUndoGroup(); undoStack.push(snap()); restore(redoStack.pop()); afterDrawChange(); }
  function syncHistory() { ['#undo'].forEach(function(id){$(id).disabled=!undoStack.length;}); ['#redo'].forEach(function(id){$(id).disabled=!redoStack.length;}); }

  var clearArmed = null;
  $('#clear').addEventListener('click', function () {
    var btn = $('#clear');
    if (!clearArmed) {
      btn.classList.add('confirm'); $('#clear-label').textContent = 'Tap again to clear';
      clearArmed = setTimeout(disarm, 3000);
      return;
    }
    disarm();
    pushUndo();
    S.draw.strokes = []; S.draw.labels = new Uint8Array(GRID * GRID); S.draw.order = []; S.draw.example = false;
    afterDrawChange();
  });
  function disarm() { clearTimeout(clearArmed); clearArmed = null; $('#clear').classList.remove('confirm'); $('#clear-label').textContent = 'Clear'; }
  $('#undo').addEventListener('click', undo);
  $('#redo').addEventListener('click', redo);
  listen(document, 'keydown', function (e) {
    if (!shown() || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(root.activeElement && root.activeElement.tagName)) return;
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
  });

  // ---------- example drawing ----------
  function paintDisc(L, cx, cy, r, c) {
    for (var y = Math.floor((cy - r) / RES); y <= Math.ceil((cy + r) / RES); y++) {
      for (var x = Math.floor((cx - r) / RES); x <= Math.ceil((cx + r) / RES); x++) {
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
        if (Math.hypot((x + 0.5) * RES - cx, (y + 0.5) * RES - cy) <= r) L[y * GRID + x] = c;
      }
    }
  }
  function curve(fn, n, w) { var pts = []; for (var i = 0; i <= n; i++) { var p = fn(i / n); pts.push([p[0], p[1], typeof w === 'function' ? w(i / n) : w]); } return pts; }
  function exampleDrawing() {
    var L = new Uint8Array(GRID * GRID);
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      paintDisc(L, 50 + 11.5 * Math.cos(a), 36 + 11.5 * Math.sin(a), 9, 43);
    }
    paintDisc(L, 50, 36, 6.5, 13);
    var strokes = [
      { kind: 'run', color: 24, pts: curve(function (t) { return [50 + 7.2 * Math.cos(t * 2 * Math.PI), 36 + 7.2 * Math.sin(t * 2 * Math.PI)]; }, 60, 0) },
      { kind: 'satin', color: 37, pts: curve(function (t) { return [50 - 4 * Math.sin(t * 2.6), 56 + 34 * t]; }, 40, 2.6) },
      { kind: 'satin', color: 37, pts: curve(function (t) { return [48 + 15 * t, 76 - 9 * t - 4 * Math.sin(t * Math.PI)]; }, 30, function (t) { return 1.6 + 4 * Math.sin(t * Math.PI); }) }
    ];
    S.draw.labels = L; S.draw.order = [43, 13]; S.draw.strokes = strokes; S.draw.example = true;
  }

  // ---------- picture mode ----------
  function rr(x, X, y, w, h, r) {
    x.beginPath(); x.moveTo(X + r, y); x.lineTo(X + w - r, y); x.quadraticCurveTo(X + w, y, X + w, y + r);
    x.lineTo(X + w, y + h - r); x.quadraticCurveTo(X + w, y + h, X + w - r, y + h); x.lineTo(X + r, y + h);
    x.quadraticCurveTo(X, y + h, X, y + h - r); x.lineTo(X, y + r); x.quadraticCurveTo(X, y, X + r, y); x.closePath(); x.fill();
  }
  function examplePicture() {
    var c = document.createElement('canvas'); c.width = 600; c.height = 600;
    var x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 600, 600);
    x.fillStyle = '#3E9A4B';
    rr(x, 250, 150, 100, 280, 50);
    rr(x, 168, 225, 58, 125, 29); rr(x, 196, 300, 70, 42, 14);
    rr(x, 374, 190, 58, 130, 29); rr(x, 334, 268, 70, 42, 14);
    x.fillStyle = '#C8643B';
    x.beginPath(); x.moveTo(200, 440); x.lineTo(400, 440); x.lineTo(372, 566); x.lineTo(228, 566); x.closePath(); x.fill();
    rr(x, 178, 405, 244, 48, 12);
    x.fillStyle = '#F06292';
    for (var i = 0; i < 5; i++) { var a = -Math.PI / 2 + i * 2 * Math.PI / 5; x.beginPath(); x.arc(300 + 27 * Math.cos(a), 128 + 27 * Math.sin(a), 24, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#FFD54F'; x.beginPath(); x.arc(300, 128, 17, 0, Math.PI * 2); x.fill();
    return c;
  }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function cdist(a, b, o) { var dr = a[o] - b[0], dg = a[o + 1] - b[1], db = a[o + 2] - b[2]; return 2 * dr * dr + 4 * dg * dg + 3 * db * db; }
  function kmeans(pix, idxs, k) {
    var R = rng(7), n = idxs.length, centers = [];
    var first = idxs[Math.floor(R() * n)] * 4;
    centers.push([pix[first], pix[first + 1], pix[first + 2]]);
    var D = new Float64Array(n);
    while (centers.length < k) {
      var sum = 0;
      for (var i = 0; i < n; i++) {
        var o = idxs[i] * 4, best = Infinity;
        for (var c = 0; c < centers.length; c++) { var dd = cdist(pix, centers[c], o); if (dd < best) best = dd; }
        D[i] = best; sum += best;
      }
      if (sum === 0) break;
      var r = R() * sum, pick = 0;
      for (i = 0; i < n; i++) { r -= D[i]; if (r <= 0) { pick = i; break; } }
      var po = idxs[pick] * 4; centers.push([pix[po], pix[po + 1], pix[po + 2]]);
    }
    for (var it = 0; it < 12; it++) {
      var acc = centers.map(function () { return [0, 0, 0, 0]; });
      for (i = 0; i < n; i++) {
        o = idxs[i] * 4; var bi = 0; best = Infinity;
        for (c = 0; c < centers.length; c++) { dd = cdist(pix, centers[c], o); if (dd < best) { best = dd; bi = c; } }
        var A = acc[bi]; A[0] += pix[o]; A[1] += pix[o + 1]; A[2] += pix[o + 2]; A[3]++;
      }
      centers = centers.map(function (cc, ci) { var A = acc[ci]; return A[3] ? [A[0] / A[3], A[1] / A[3], A[2] / A[3]] : cc; });
    }
    return centers;
  }
  function downscaleTo(src, w, h) {
    var cur = src, cw = src.width, ch = src.height;
    while (cw / 2 >= w * 1.5 && ch / 2 >= h * 1.5) {
      var t = document.createElement('canvas'); t.width = Math.round(cw / 2); t.height = Math.round(ch / 2);
      var tx = t.getContext('2d'); tx.imageSmoothingQuality = 'high'; tx.drawImage(cur, 0, 0, t.width, t.height);
      cur = t; cw = t.width; ch = t.height;
    }
    var out = document.createElement('canvas'); out.width = w; out.height = h;
    var ox = out.getContext('2d', { willReadFrequently: true }); ox.imageSmoothingQuality = 'high';
    ox.drawImage(cur, 0, 0, w, h);
    return ox.getImageData(0, 0, w, h).data;
  }
  function processImage(im) {
    im = im || S.image; var src = im.source;
    if (!src) { im.proc = null; return; }
    var iw = src.width, ih = src.height, longMM = clamp(im.sizeMM, 10, HOOP);
    var wmm = iw >= ih ? longMM : longMM * iw / ih, hmm = ih > iw ? longMM : longMM * ih / iw;
    var gw = Math.max(2, Math.round(wmm / RES)), gh = Math.max(2, Math.round(hmm / RES)), n = gw * gh;
    var pix = downscaleTo(src, gw, gh);
    var fg = new Uint8Array(n), i;
    for (i = 0; i < n; i++) fg[i] = pix[i * 4 + 3] >= 128 ? 1 : 0;
    if (im.removeBg) {
      var border = [];
      for (var x = 0; x < gw; x++) { border.push(x, (gh - 1) * gw + x); }
      for (var y = 0; y < gh; y++) { border.push(y * gw, y * gw + gw - 1); }
      var ch = [[], [], []];
      border.forEach(function (b) { if (fg[b]) { ch[0].push(pix[b * 4]); ch[1].push(pix[b * 4 + 1]); ch[2].push(pix[b * 4 + 2]); } });
      if (ch[0].length) {
        var med = ch.map(function (a) { a.sort(function (p, q) { return p - q; }); return a[a.length >> 1]; });
        var near = function (j) { var o = j * 4, dr = pix[o] - med[0], dg = pix[o + 1] - med[1], db = pix[o + 2] - med[2]; return dr * dr + dg * dg + db * db < 46 * 46; };
        var stack = new Int32Array(n), sp = 0, seen = new Uint8Array(n);
        border.forEach(function (b) { if (fg[b] && !seen[b] && near(b)) { seen[b] = 1; stack[sp++] = b; } });
        while (sp) {
          var j = stack[--sp]; fg[j] = 0;
          var jx = j % gw, jy = (j - jx) / gw;
          var nb = [jx > 0 ? j - 1 : -1, jx < gw - 1 ? j + 1 : -1, jy > 0 ? j - gw : -1, jy < gh - 1 ? j + gw : -1];
          for (var q = 0; q < 4; q++) { var t = nb[q]; if (t >= 0 && !seen[t] && fg[t] && near(t)) { seen[t] = 1; stack[sp++] = t; } }
        }
      }
    }
    var idxs = [], solid = [];
    for (i = 0; i < n; i++) {
      if (!fg[i]) continue;
      idxs.push(i);
      var ix = i % gw, iy = (i - ix) / gw;
      if (ix < 1 || iy < 1 || ix > gw - 2 || iy > gh - 2) continue;
      var flat = true, nbs = [i - 1, i + 1, i - gw, i + gw];
      for (var q2 = 0; q2 < 4 && flat; q2++) {
        var jj = nbs[q2], oi = i * 4, oj = jj * 4;
        if (!fg[jj]) { flat = false; break; }
        var er = pix[oi] - pix[oj], eg = pix[oi + 1] - pix[oj + 1], eb = pix[oi + 2] - pix[oj + 2];
        if (2 * er * er + 4 * eg * eg + 3 * eb * eb > 2700) flat = false;
      }
      if (flat) solid.push(i);
    }
    var pool = solid.length >= 200 ? solid : idxs;
    if (!idxs.length) { im.proc = { gw: gw, gh: gh, lab: new Uint8Array(n), wmm: wmm, hmm: hmm }; im.clusters = []; return; }
    var sample = pool.length > 14000 ? pool.filter(function (v, k2) { return k2 % Math.ceil(pool.length / 14000) === 0; }) : pool;
    var centers = kmeans(pix, sample, Math.min(im.k, sample.length));
    var lab = new Uint8Array(n);
    idxs.forEach(function (p) {
      var o = p * 4, bi = 0, best = Infinity;
      for (var c = 0; c < centers.length; c++) { var dd = cdist(pix, centers[c], o); if (dd < best) { best = dd; bi = c; } }
      lab[p] = bi + 1;
    });
    // smooth: 3x3 majority among foreground labels
    var sm = lab.slice(), cnt = new Int32Array(centers.length + 1);
    for (y = 1; y < gh - 1; y++) for (x = 1; x < gw - 1; x++) {
      var p0 = y * gw + x;
      if (!lab[p0]) continue;
      cnt.fill(0);
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) cnt[lab[p0 + dy * gw + dx]]++;
      var bl = lab[p0], bc = 0;
      for (var c2 = 1; c2 < cnt.length; c2++) if (cnt[c2] > bc) { bc = cnt[c2]; bl = c2; }
      if (bc >= 5) sm[p0] = bl;
    }
    lab = sm;
    // drop slivers too thin to stitch (under ~0.6 mm), e.g. blurred edges between two colors
    var keep = new Uint8Array(n);
    for (var cl1 = 1; cl1 <= centers.length; cl1++) {
      var m1 = new Uint8Array(n), any1 = false;
      for (i = 0; i < n; i++) if (lab[i] === cl1) { m1[i] = 1; any1 = true; }
      if (!any1) continue;
      var op1 = E.dilate(E.erode(m1, gw, gh, 1), gw, gh, 1);
      for (i = 0; i < n; i++) if (m1[i] && op1[i]) keep[i] = 1;
    }
    var fixed = lab.slice(), hist8 = new Int32Array(centers.length + 1);
    for (y = 0; y < gh; y++) for (x = 0; x < gw; x++) {
      var p1 = y * gw + x;
      if (!lab[p1] || keep[p1]) continue;
      hist8.fill(0);
      var bestL = -1, bestC = 0;
      for (var dy1 = -1; dy1 <= 1; dy1++) for (var dx1 = -1; dx1 <= 1; dx1++) {
        var xx1 = x + dx1, yy1 = y + dy1;
        if ((!dx1 && !dy1) || xx1 < 0 || yy1 < 0 || xx1 >= gw || yy1 >= gh) continue;
        var q1 = yy1 * gw + xx1, v1 = lab[q1];
        if (v1 === lab[p1] || (v1 && !keep[q1])) continue;
        hist8[v1]++;
        if (hist8[v1] > bestC) { bestC = hist8[v1]; bestL = v1; }
      }
      if (bestL >= 0) fixed[p1] = bestL;
    }
    lab = fixed;
    // merge specks into their surroundings
    var minPx = MIN_SPECK[im.clean] || 75, visited = new Uint8Array(n), st2 = new Int32Array(n);
    for (i = 0; i < n; i++) {
      if (visited[i]) continue;
      var L = lab[i], sp2 = 0, comp = [], hist = {}, touches = false;
      st2[sp2++] = i; visited[i] = 1;
      while (sp2) {
        var v = st2[--sp2]; comp.push(v);
        var vx = v % gw, vy = (v - vx) / gw;
        if (vx === 0 || vy === 0 || vx === gw - 1 || vy === gh - 1) touches = true;
        var nn = [vx > 0 ? v - 1 : -1, vx < gw - 1 ? v + 1 : -1, vy > 0 ? v - gw : -1, vy < gh - 1 ? v + gw : -1];
        for (var r2 = 0; r2 < 4; r2++) {
          var w2 = nn[r2];
          if (w2 < 0) continue;
          if (lab[w2] === L) { if (!visited[w2]) { visited[w2] = 1; st2[sp2++] = w2; } }
          else hist[lab[w2]] = (hist[lab[w2]] || 0) + 1;
        }
      }
      if (comp.length >= minPx || (L === 0 && touches)) continue;
      var to = -1, tc = -1;
      Object.keys(hist).forEach(function (h) { if (hist[h] > tc) { tc = hist[h]; to = +h; } });
      if (to >= 0) comp.forEach(function (v2) { lab[v2] = to; });
    }
    var areas = new Array(centers.length + 1).fill(0);
    for (i = 0; i < n; i++) areas[lab[i]]++;
    var old = im.clusters;
    var clusters = centers.map(function (c, ci) {
      var rgbv = [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];
      var cl = { id: ci + 1, rgb: rgbv, thread: E.nearestThread(rgbv[0], rgbv[1], rgbv[2]), on: true, area: areas[ci + 1] };
      if (old && old.length === centers.length) {
        var bestOld = null, bd = Infinity;
        old.forEach(function (o2) { var d2 = Math.pow(o2.rgb[0] - rgbv[0], 2) + Math.pow(o2.rgb[1] - rgbv[1], 2) + Math.pow(o2.rgb[2] - rgbv[2], 2); if (d2 < bd) { bd = d2; bestOld = o2; } });
        if (bestOld && bd < 40 * 40) { cl.thread = bestOld.thread; cl.on = bestOld.on; }
      }
      return cl;
    }).filter(function (cl) { return cl.area > 0; });
    clusters.sort(function (a, b) { return b.area - a.area; });
    im.clusters = clusters;
    im.proc = { gw: gw, gh: gh, lab: lab, wmm: wmm, hmm: hmm };
  }
  function imageDesign(im) {
    im = im || S.image; var P = im.proc, labels = new Uint8Array(GRID * GRID), order = [];
    if (!P) return { labels: labels, order: order, lines: [] };
    var map = {};
    im.clusters.forEach(function (cl) { map[cl.id] = cl.on ? cl.thread : 0; if (cl.on && order.indexOf(cl.thread) < 0) order.push(cl.thread); });
    var ox = Math.floor((GRID - P.gw) / 2), oy = Math.floor((GRID - P.gh) / 2);
    for (var y = 0; y < P.gh; y++) for (var x = 0; x < P.gw; x++) {
      var v = P.lab[y * P.gw + x];
      if (v && map[v]) labels[(y + oy) * GRID + x + ox] = map[v];
    }
    return { labels: labels, order: order, lines: [] };
  }

  // ---------- text mode ----------
  var textToken = 0, textCache = null;
  function textDesign(t, done, token) {
    t = Object.assign({}, t);
    var lines = String(t.value || '').replace(/\r/g, '').split('\n').map(function (s) { return s.replace(/\s+$/, ''); });
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    if (!lines.length || !lines.some(function (l) { return l.trim(); })) { textCache = { labels: new Uint8Array(GRID * GRID), order: [], lines: [] }; done(textCache, 0); return; }
    var f = FONTS[t.font] || FONTS.Lobster, size = 160, fontStr = f.weight + ' ' + size + 'px ' + f.css;
    var go = function () {
      if (token !== textToken) return;
      var c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
      x.font = fontStr;
      var lineH = size * 1.2, pad = 60, maxW = 0;
      lines.forEach(function (l) { maxW = Math.max(maxW, x.measureText(l).width); });
      c.width = Math.ceil(maxW + pad * 2); c.height = Math.ceil(lines.length * lineH + pad * 2);
      x.font = fontStr; x.fillStyle = '#000'; x.textAlign = 'center'; x.textBaseline = 'middle';
      lines.forEach(function (l, i) { x.fillText(l, c.width / 2, pad + lineH * (i + 0.5)); });
      var a = x.getImageData(0, 0, c.width, c.height).data, x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (var yy = 0; yy < c.height; yy++) for (var xx = 0; xx < c.width; xx++) {
        if (a[(yy * c.width + xx) * 4 + 3] >= 128) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      }
      var labels = new Uint8Array(GRID * GRID);
      if (x1 < 0) { textCache = { labels: labels, order: [], lines: [] }; done(textCache, 0); return; }
      var bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      var wmm = clamp(t.widthMM, 10, HOOP), hmm = wmm * bh / bw;
      if (hmm > HOOP) { hmm = HOOP; wmm = HOOP * bw / bh; }
      var gw = Math.max(2, Math.round(wmm / RES)), gh = Math.max(2, Math.round(hmm / RES));
      var g = document.createElement('canvas'); g.width = gw; g.height = gh;
      var gx = g.getContext('2d', { willReadFrequently: true }); gx.imageSmoothingQuality = 'high';
      gx.drawImage(c, x0, y0, bw, bh, 0, 0, gw, gh);
      var ga = gx.getImageData(0, 0, gw, gh).data, mask = new Uint8Array(gw * gh);
      for (var i = 0; i < mask.length; i++) mask[i] = ga[i * 4 + 3] >= 128 ? 1 : 0;
      var ox = Math.floor((GRID - gw) / 2), oy = Math.floor((GRID - gh) / 2);
      for (yy = 0; yy < gh; yy++) for (xx = 0; xx < gw; xx++) if (mask[yy * gw + xx]) labels[(yy + oy) * GRID + xx + ox] = t.color;
      textCache = { labels: labels, order: [t.color], lines: [] };
      done(textCache, E.thinShare(mask, gw, gh, 3));
    };
    if (document.fonts && document.fonts.load) {
      var settled = false, fallback = setTimeout(function () { if (!settled) { settled = true; go(); } }, 2500);
      document.fonts.load(fontStr, lines.join(' ')).then(function () { if (!settled) { settled = true; clearTimeout(fallback); go(); } }, function () { if (!settled) { settled = true; clearTimeout(fallback); go(); } });
    } else go();
  }

  // ---------- design + digitise pipeline ----------
  function updateDesign() {
    invalidateDesign();
    if (S.layers.some(function (l) { return l.source.loading; })) return;
    var token = textToken, parts = new Array(S.layers.length), pending = 0, collecting = true;
    S.note = '';
    function ready() {
      if (collecting || pending || token !== textToken || destroyed) return;
      try {
        parts.filter(Boolean).forEach(function(part){
          var b=designBounds(part.design); if(!b){objectBounds.delete(part.layer.id);return;}
          var t=part.layer.transform, corners=[[b[0],b[1]],[b[2],b[1]],[b[0],b[3]],[b[2],b[3]]].map(function(p){return transformPoint(p,t);});
          objectBounds.set(part.layer.id,[Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[1])),Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[1]))]);
        });
        S.parts = parts.filter(Boolean).map(function (part) { return { layer: part.layer, design: transformDesign(part.design, part.layer.transform) }; });
        S.parts.forEach(function(part){objectBounds.set(part.layer.id,designBounds(part.design));});
        // The check costs tens of milliseconds per picture, so a drag reuses the last result and
        // endStroke() runs it once the object is let go.
        if (!(active && (active.move || active.resize))) pictureNotes = pictureDetailWarnings(S.parts);
        S.note = [S.note].concat(pictureNotes).filter(Boolean).join('\n');
        S.design = { labels: new Uint8Array(GRID * GRID), lines: [] };
        designReady();
      } catch (error) { failDesign(error.message); }
    }
    // Reserve all callbacks first: synchronous fonts must not finish the whole generation early.
    pending = S.layers.filter(function (l) { return l.visible && l.kind === 'text' && !isEmbroideryFont(l.source.font); }).length;
    try {
      S.layers.forEach(function (layer, index) {
        if (!layer.visible) return;
        if(layer.source.error)throw new Error(layer.source.error);
        var source = layer.source, design;
        if (layer.kind === 'draw') design = { labels: source.labels, order: source.order, lines: source.strokes };
        else if (layer.kind === 'image') design = imageDesign(source);
        else if (isEmbroideryFont(source.font)) design = letteringDesign(source, layer.transform.scale, S.settings.underlay, layer.stitchSettings || {});
        else {
          textDesign(source, function (d, thin) { if (token !== textToken) return; parts[index] = { layer: layer, design: d }; if (thin > 0.08) S.note = 'Some decorative letters are thin. Try Small Satin for embroidery lettering.'; pending--; ready(); }, token);
          return;
        }
        parts[index] = { layer: layer, design: design };
      });
      collecting = false; ready();
    } catch (error) { textToken++; failDesign(error.message); }
  }
  function failDesign(message) {
    clearTimeout(digitizeTimer); textToken++;
    S.plan = null; S.stats = null; S.parts = []; S.design = null;
    renderStats();
    $('#note').hidden = false; $('#note').textContent = message;
    $('#readout').textContent = 'Design needs attention';
    render();
  }
  var digitizeTimer = null;
  // An edit makes the old plan unusable immediately, including during debounce/font loading.
  function invalidatePlan() {
    clearTimeout(digitizeTimer);
    S.plan = null; S.stats = null;
    renderStats();
    $('#readout').textContent = 'Preparing stitches…';
  }
  function invalidateDesign() {
    textToken++; // Ignore font callbacks for an older edit or mode.
    S.design = null;
    invalidatePlan();
  }
  function designReady() {
    var note = $('#note'); note.textContent = S.note; note.hidden = !S.note;
    render();
    clearTimeout(digitizeTimer);
    digitizeTimer = setTimeout(digitize, 60);
  }
  function digitize() {
    if (!S.design) return;
    S.plan = composePlans(S.parts.map(function (part) { return E.plan(part.design, engineSettings(part.layer, S.settings)); }));
    S.stats = E.planStats(S.plan);
    var bounds = S.stats.bounds;
    if (bounds && (bounds[0] < 0 || bounds[1] < 0 || bounds[2] > 100 || bounds[3] > 100)) { failDesign('Stitches extend beyond the hoop. Move the layer inward or reduce its size.'); return; }
    renderStats();
    render();
    scheduleSave();
  }
  function afterDrawChange() {
    syncDrawingRecolor();
    S.placement = undefined;
    syncHistory();
    $('#example-tag').hidden = !(S.mode === 'draw' && S.draw.example && !moveDrawing);
    updateDesign();
    scheduleSave();
  }

  function renderStats() {
    var st = S.stats, ro = $('#readout'), seq = $('#sequence');
    seq.innerHTML = '';
    if (!st || !st.stitches) {
      ro.textContent = S.mode === 'draw' ? 'Nothing to stitch yet. Draw in the hoop.' : 'Nothing to stitch yet';
      $('#seq-sum').textContent = '';
      var li = document.createElement('li'); li.className = 'empty';
      li.textContent = S.mode === 'draw' ? 'Each thread you use shows up here in sewing order.' : 'Nothing to stitch with these settings.';
      seq.appendChild(li);
      $('#save').disabled = true; $('#save-dst').disabled = true; $('#send').disabled = true;
      return;
    }
    $('#save').disabled = false; $('#save-dst').disabled = false; $('#send').disabled = false;
    var w = st.width, h = st.height;
    ro.innerHTML = '';
    var a = document.createElement('strong'); a.textContent = w.toFixed(1) + ' × ' + h.toFixed(1) + ' mm';
    ro.appendChild(a);
    ro.appendChild(document.createTextNode(' (' + (w / 25.4).toFixed(2) + ' × ' + (h / 25.4).toFixed(2) + ' in) · ' + fmt(st.stitches) + ' stitches'));
    var changes = S.plan.blocks.length - 1;
    $('#seq-sum').textContent = S.plan.blocks.length + (S.plan.blocks.length === 1 ? ' thread' : ' threads') + (changes ? ' · ' + changes + (changes === 1 ? ' change' : ' changes') : '');
    S.plan.blocks.forEach(function (b, bi) {
      var li = document.createElement('li');
      var sw = document.createElement('span'); sw.className = 'sw'; sw.style.setProperty('--c', rgb(b.color));
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = threadName(b.color);
      var no = document.createElement('small'); no.textContent = '#' + b.color; nm.appendChild(no);
      var ct = document.createElement('span'); ct.className = 'ct'; ct.textContent = fmt(st.perBlock[bi]) + ' st';
      li.appendChild(sw); li.appendChild(nm); li.appendChild(ct);
      seq.appendChild(li);
    });
  }

  // ---------- UI wiring ----------
  function currentLayer() { return S.layers.find(function (l) { return l.id === S.activeId; }); }
  function freshSource(kind) {
    if (kind === 'draw') return { tool:'satin',color:37,sizes:{satin:3,brush:6,eraser:6},pressure:true,order:[],example:false,labels:new Uint8Array(GRID*GRID),strokes:[] };
    if (kind === 'image') return { source:null, fileName:'', sizeMM:50,k:4,removeBg:true,clean:2,proc:null,clusters:[] };
    return { value:'Bharti',font:EMBROIDERY_FONT,widthMM:60,color:5,heightMM:8,letterSpacing:0.5,lineGap:2,align:'center' };
  }
  // "Drawing", then "Drawing 2", "Drawing 3": two objects of one kind must be told apart in the list.
  function layerName(kind) {
    var base = kind === 'draw' ? 'Drawing' : kind === 'image' ? 'Picture' : 'Text';
    var taken = S.layers.map(function (l) { return l.name; });
    if (taken.indexOf(base) < 0) return base;
    var n = 2; while (taken.indexOf(base + ' ' + n) >= 0) n++;
    return base + ' ' + n;
  }
  var lastOfKind = {};
  function makeLayer(kind, source) { return { id: crypto.randomUUID(), name: layerName(kind), kind:kind,visible:true,transform:identityTransform(),source:source || freshSource(kind) }; }
  function selectLayer(id) {
    // Finish queued processing on its original source before rebinding controls.
    clearTimeout(txtTimer); clearTimeout(imgTimer);
    if(S.mode==='image' && S.image.source) processImage(S.image);
    if(S.activeId!==id) $('#properties-panel').scrollTop=0;
    setPan(false);$('.shape-tools').hidden=true;S.activeId = id; endUndoGroup();
    var layer = currentLayer(); if (!layer) return;
    lastOfKind[layer.kind] = id;
    S.mode = layer.kind; S[S.mode] = layer.source;
    if (S.mode === 'image' && S.image.source) processImage(S.image);
    ['draw','image','text'].forEach(function (m) { $('#panel-'+m).hidden = m !== S.mode; });
    $('#toolbar').hidden = S.mode !== 'draw'; $('#clear').hidden = S.mode !== 'draw';
    stage.classList.toggle('drawing', S.mode === 'draw' && !moveDrawing);
    $('#example-tag').hidden = !(S.mode === 'draw' && S.draw.example && !moveDrawing);
    $('#pressure').checked = S.draw.pressure;
    setTool(S.draw.tool); syncThreadName(); drawPalettes.forEach(function (p) { p.draw(); });
    $('#img-size').value=S.image.sizeMM; $('#img-size-out').textContent=S.image.sizeMM+' mm';
    $('#img-k').value=S.image.k; $('#img-k-out').textContent=S.image.k; $('#img-bg').checked=S.image.removeBg;
    $$('#img-clean button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.clean === S.image.clean)); });
    $('#file-name').textContent=S.image.fileName || 'No picture selected'; renderClusters();
    $('#txt').value=S.text.value; fontSel.value=S.text.font; $('#txt-w').value=S.text.widthMM; $('#txt-w-out').textContent=S.text.widthMM+' mm';
    $('#txt-height').value=S.text.heightMM ?? 8; $('#txt-spacing').value=S.text.letterSpacing ?? 0.5; $('#txt-linegap').value=S.text.lineGap ?? 2; $('#txt-align').value=S.text.align || 'center';
    syncLettering(); if (textPalette) textPalette.draw();
    syncView(); syncLayers(); syncStitchSettings(); syncDrawingRecolor(); updateDesign(); scheduleSave();
  }
  function setMode(m) {
    // Stay on the selected object when it is already of this kind, else return to the one last used.
    var current=currentLayer(), layer=current&&current.kind===m&&current.visible?current:null;
    if(!layer) layer=S.layers.find(function (l) { return l.id===lastOfKind[m] && l.kind===m && l.visible; });
    if(!layer) layer=S.layers.find(function (l) { return l.kind===m && l.visible; });
    if(!layer) { if(S.layers.length>=20){toast('A design can have up to 20 parts.');return;} pushUndo(); S.placement=undefined; layer=makeLayer(m); S.layers.push(layer); }
    if(!layer.visible) { pushUndo(); S.placement=undefined; layer.visible=true; }
    selectLayer(layer.id);
  }
  function syncLayers() {
    var selected=currentLayer();
    $('#add-draw-layer').setAttribute('aria-pressed',String(S.mode==='draw'&&!moveDrawing));
    $('#move-layer').setAttribute('aria-pressed',String(S.mode!=='draw'||moveDrawing));
    $('#editing-object').textContent=selected ? 'Editing: '+selected.name : '';
    syncEditingLabel();
    placeDrawTools();
    stage.classList.toggle('drawing', S.mode === 'draw' && !moveDrawing);
    $('#example-tag').hidden = !(S.mode === 'draw' && S.draw.example && !moveDrawing);
    $('#object-count').textContent='('+S.layers.length+')';
    var list=$('#layers'); list.innerHTML='';
    S.layers.forEach(function (layer,i) { var button=document.createElement('button'); button.textContent=(i+1)+'. '+layer.name+(layer.visible?'':' (left out)'); button.setAttribute('aria-pressed',String(layer.id===S.activeId)); button.addEventListener('click',function(){moveDrawing=true;selectLayer(layer.id);}); list.appendChild(button); });
    if(!selected) return;
    if(root.activeElement!==$('#layer-name') && document.activeElement!==$('#layer-name')) $('#layer-name').value=selected.name; $('#layer-visible').checked=selected.visible;
    $('#layer-x').value=+selected.transform.x.toFixed(2); $('#layer-y').value=+selected.transform.y.toFixed(2);
    $('#layer-size').value=Math.round(selected.transform.scale*100); $('#layer-rotation').value=selected.transform.rotation;
    $('#layer-remove').disabled=S.layers.length===1;
    $('#layer-earlier').disabled=S.layers[0]===selected; $('#layer-later').disabled=S.layers[S.layers.length-1]===selected;
    syncHistory(); if(S.mode==='text')syncLettering(); renderSelection();
  }

  function syncView() {
    var v = currentView();
    $('#view-design').setAttribute('aria-pressed', String(v === 'design'));
    $('#view-stitches').setAttribute('aria-pressed', String(v === 'stitches'));
  }
  $$('[data-view]').forEach(function (b) { b.addEventListener('click', function () { S.view[S.mode] = b.dataset.view; syncView(); render(); scheduleSave(); }); });

  FABRICS.forEach(function (f) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'fabric'; b.style.setProperty('--c', f[0]);
    b.title = f[1]; b.setAttribute('aria-label', f[1]); b.dataset.fabric = f[0];
    b.addEventListener('click', function () { S.fabric = f[0]; syncFabric(); render(); scheduleSave(); });
    $('#fabrics').appendChild(b);
  });
  function syncFabric() { $$('.fabric').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.fabric === S.fabric)); }); }

  // tools
  function setTool(t) {
    S.draw.tool = t;
    $$('.tool').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tool === t)); });
    var cfg = SIZE_CFG[t], wrap = $('#size-wrap');
    wrap.classList.toggle('off', !cfg);
    if (cfg) {
      var input = $('#size');
      input.min = cfg.min; input.max = cfg.max; input.step = cfg.step; input.value = S.draw.sizes[t];
      $('#size-label').textContent = cfg.label;
      $('#size-out').textContent = (+S.draw.sizes[t]).toFixed(1) + ' mm';
    }
    scheduleSave();
  }
  $$('.tool').forEach(function (b) { b.addEventListener('click', function () { moveDrawing=false;setTool(b.dataset.tool);syncLayers();render(); }); });
  $('#size').addEventListener('input', function (e) {
    var t = S.draw.tool; if (!SIZE_CFG[t]) return;
    S.draw.sizes[t] = +e.target.value;
    $('#size-out').textContent = (+e.target.value).toFixed(1) + ' mm';
    scheduleSave();
  });
  $('#pressure').addEventListener('change', function (e) { S.draw.pressure = e.target.checked; scheduleSave(); });

  var drawPalettes = [];
  function pickDrawColor(i) { S.draw.color = i; syncThreadName(); syncDrawingRecolor(); drawPalettes.forEach(function (p) { p.draw(); }); scheduleSave(); }
  drawPalettes.push(Palette($('#draw-palette-bench'), function () { return S.draw.color; }, pickDrawColor));
  function syncThreadName() { $$('.thread-name').forEach(function (el) { el.textContent = threadName(S.draw.color) + ' · #' + S.draw.color; }); }

  function syncDrawingRecolor() {
    var select=$('#recolor-from'), old=select.value, colors=drawingColors(S.draw);
    select.innerHTML='';
    var all=document.createElement('option');all.value='all';all.textContent='All existing colors';select.appendChild(all);
    colors.forEach(function(c){var option=document.createElement('option');option.value=String(c);option.textContent=threadName(c);select.appendChild(option);});
    select.value=colors.indexOf(+old)>=0?old:'all';
    $('#recolor-drawing').textContent='Recolor marks to '+threadName(S.draw.color);
    $('#recolor-drawing').disabled=!colors.some(function(c){return c!==S.draw.color && (select.value==='all'||c===+select.value);});
  }
  $('#recolor-from').addEventListener('change',syncDrawingRecolor);
  $('#recolor-drawing').addEventListener('click',function(){
    if(S.mode!=='draw'||$('#recolor-drawing').disabled)return;
    pushUndo();
    var source=$('#recolor-from').value;
    S.draw=recolorDrawing(S.draw,S.draw.color,source==='all'?null:+source);currentLayer().source=S.draw;
    afterDrawChange();
  });

  // picture controls
  function handlePictureFile(e, asNew) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    if(asNew && S.layers.length>=20){toast('A design can have up to 20 parts.');e.target.value='';return;}
    pushUndo();
    if(asNew){var layer=makeLayer('image');S.layers.push(layer);moveDrawing=true;showPanel('properties');selectLayer(layer.id);}
    invalidateDesign();
    S.placement=undefined;
    var targetImage = S.image; targetImage.loading = true;
    var ticket={sources:new Set([targetImage])};targetImage.loadTicket=ticket;
    var done = function (src) {
      if (destroyed) { if(src.close)src.close(); return; }
      try {
      var picture = document.createElement('canvas');
      var scale = Math.min(1, 2048 / Math.max(src.width, src.height));
      picture.width = Math.max(1, Math.round(src.width * scale)); picture.height = Math.max(1, Math.round(src.height * scale));
      picture.getContext('2d').drawImage(src, 0, 0, picture.width, picture.height);
      var dataURL=picture.toDataURL('image/png');
      ticket.sources.forEach(function(im){
        if(im.loadTicket!==ticket)return; // A newer replacement owns this object now.
        // Commit only after processing succeeds, so a bad replacement cannot leave
        // a new image paired with the previous image's processed pixels.
        var decoded=Object.assign({},im,{sourceDataURL:dataURL,source:picture,fileName:f.name,clusters:[],loading:false});
        processImage(decoded);Object.assign(im,decoded);delete im.loadTicket;delete im.error;
        if(S.image===im){$('#file-name').textContent=f.name;renderClusters();}
      });
      if(src.close)src.close();
      updateDesign();scheduleSave();
      } catch(error) { if(src.close)src.close(); fail(); }
    };
    var fail = function () {
      if(destroyed)return;
      var affectsCurrent=S.layers.some(function(layer){return layer.source.loadTicket===ticket;});
      ticket.sources.forEach(function(im){if(im.loadTicket===ticket){im.loading=false;delete im.loadTicket;if(!im.source)im.error="This picture could not be opened. Replace it or remove this part.";}});
      updateDesign();scheduleSave();if(affectsCurrent)toast("That file couldn't be opened as a picture. Try a PNG or JPEG.");
    };
    if (window.createImageBitmap) createImageBitmap(f).then(done, function () { viaImg(f, done, fail); });
    else viaImg(f, done, fail);
    e.target.value = '';
  }
  $('#file').addEventListener('change',function(e){handlePictureFile(e,false);});
  $('#add-picture-file').addEventListener('change',function(e){handlePictureFile(e,true);});
  function viaImg(f, done, fail) {
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); done(img); };
    img.onerror = function () { URL.revokeObjectURL(url); fail(); };
    img.src = url;
  }
  var imgTimer = null;
  function reprocessSoon() { S.placement=undefined; invalidateDesign(); clearTimeout(imgTimer); var im=S.image; imgTimer=setTimeout(function(){processImage(im); if(S.image===im) renderClusters(); updateDesign(); scheduleSave();},120); }
  $('#img-size').addEventListener('input', function (e) { pushUndo('img-size'); S.image.sizeMM = +e.target.value; $('#img-size-out').textContent = e.target.value + ' mm'; reprocessSoon(); });
  $('#img-k').addEventListener('input', function (e) { pushUndo('img-k'); S.image.k = +e.target.value; $('#img-k-out').textContent = e.target.value; S.image.clusters = []; reprocessSoon(); });
  $('#img-bg').addEventListener('change', function (e) { pushUndo(); S.image.removeBg = e.target.checked; reprocessSoon(); });
  $$('#img-clean button').forEach(function (b) {
    b.addEventListener('click', function () {
      pushUndo();S.image.clean = +b.dataset.clean;
      $$('#img-clean button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      reprocessSoon();
    });
  });
  function renderClusters() {
    var box = $('#clusters'); box.innerHTML = '';
    var total = S.image.clusters.reduce(function (s, c) { return s + c.area; }, 0) || 1;
    S.image.clusters.forEach(function (cl) {
      var row = document.createElement('div'); row.className = 'cluster' + (cl.on ? '' : ' off');
      var orig = document.createElement('span'); orig.className = 'orig'; orig.style.setProperty('--c', 'rgb(' + cl.rgb.join(',') + ')'); orig.title = 'Color in the picture';
      var sw = document.createElement('button'); sw.type = 'button'; sw.className = 'swatch'; sw.style.setProperty('--c', rgb(cl.thread));
      sw.setAttribute('aria-label', 'Change thread, now ' + threadName(cl.thread));
      sw.addEventListener('click', function () { openSheet(cl.thread, function (t) { pushUndo(); S.placement=undefined; cl.thread = t; renderClusters(); updateDesign(); scheduleSave(); }); });
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = threadName(cl.thread) + ' #' + cl.thread;
      var pct = document.createElement('span'); pct.className = 'pct'; pct.textContent = Math.max(1, Math.round(cl.area / total * 100)) + '%';
      var tg = document.createElement('button'); tg.type = 'button'; tg.className = 'pill'; tg.setAttribute('aria-pressed', String(cl.on)); tg.textContent = cl.on ? 'Stitch' : 'Skip';
      tg.addEventListener('click', function () { pushUndo(); S.placement=undefined; cl.on = !cl.on; renderClusters(); updateDesign(); scheduleSave(); });
      row.appendChild(orig); row.appendChild(sw); row.appendChild(nm); row.appendChild(pct); row.appendChild(tg);
      box.appendChild(row);
    });
  }

  // thread picker sheet
  var sheetPick = null, sheetSel = 0, sheetPalette = null;
  function openSheet(sel, onPick) {
    sheetSel = sel; sheetPick = onPick;
    if (!sheetPalette) sheetPalette = Palette($('#sheet-palette'), function () { return sheetSel; }, function (i) { sheetSel = i; if (sheetPick) sheetPick(i); }, { all: true });
    else sheetPalette.draw();
    $('#sheet').hidden = false;
    $('#sheet-close').focus();
  }
  function closeSheet() { $('#sheet').hidden = true; sheetPick = null; }
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet').addEventListener('click', function (e) { if (e.target === $('#sheet')) closeSheet(); });
  listen(document, 'keydown', function (e) {
    if (e.key !== 'Escape' || !shown()) return;
    if (!$('#sheet').hidden) closeSheet();
    else if (!$('#ruler').hidden) closeRuler();
  });

  // text controls
  var fontSel = $('#txt-font');
  Object.keys(FONTS).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = FONTS[k].label + (FONTS[k].embroidery ? '' : ' · decorative fill'); fontSel.appendChild(o); });
  var txtTimer = null;
  function textChanged() { S.placement=undefined; invalidateDesign(); clearTimeout(txtTimer); txtTimer = setTimeout(function () { autoName(); updateDesign(); scheduleSave(); }, 180); }
  $('#txt').addEventListener('input', function (e) { pushUndo('txt'); S.text.value = e.target.value; textChanged(); });
  fontSel.addEventListener('change', function (e) { pushUndo(); S.text.font = e.target.value; var font=EMBROIDERY_FONTS[S.text.font];if(font){var scale=currentLayer().transform.scale;S.text.heightMM=clamp((S.text.heightMM??8)*scale,font.min,font.max)/scale;} syncLettering(); syncStitchSettings(); textChanged(); });
  $('#txt-w').addEventListener('input', function (e) { pushUndo('txt-w'); S.text.widthMM = +e.target.value; $('#txt-w-out').textContent = e.target.value + ' mm'; textChanged(); });
  function syncLettering() {
    var embroidery=isEmbroideryFont(S.text.font);
    $('#lettering-controls').hidden=!embroidery; $('#decorative-width').hidden=embroidery;
    $('#lettering-trims').hidden=!embroidery; $('#font-credit-panel').hidden=!embroidery;
    var font=EMBROIDERY_FONTS[S.text.font];
    if(font){
      var scale=currentLayer()?.transform.scale || 1;
      $('#txt-height').min=font.min/scale;$('#txt-height').max=font.max/scale;$('#txt-height').value=S.text.heightMM??8;
      $('#font-credit').textContent=font.credit+' This app regenerates stitches from the authored geometry. Test on your fabric before sewing a garment.';
      $('#font-license').textContent=font.license;
    }
    $('#txt-trim').value=S.text.trimRule || 'auto';
    $('#font-note').textContent=embroidery?font.label+': final cap height '+font.min+'–'+font.max+' mm; '+Object.keys(font.geometry.glyphs).filter(c=>[...c].length===1).length+' supported characters. Size includes object scaling.':'Decorative fill lettering: ordinary font shapes filled with stitches.';
  }
  ['height','spacing','linegap'].forEach(function(key){$('#txt-'+key).addEventListener('input',function(e){var value=+e.target.value;var field=key==='height'?'heightMM':key==='spacing'?'letterSpacing':'lineGap'; if(!Number.isFinite(value) || value < +e.target.min || value > +e.target.max) {failDesign('Enter a lettering value within the displayed range.');return;} pushUndo('txt-'+key);S.text[field]=value;textChanged();});});
  $('#txt-align').addEventListener('change',function(e){pushUndo();S.text.align=e.target.value;textChanged();});
  $('#txt-trim').addEventListener('change',function(e){pushUndo();S.text.trimRule=e.target.value;textChanged();});
  var textPalette = null;

  // stitch settings
  $$('#density button').forEach(function (b) {
    b.addEventListener('click', function () {
      S.settings.spacing = +b.dataset.spacing;
      $$('#density button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      digitizeSoon(); scheduleSave();
    });
  });
  $('#angle').addEventListener('input', function (e) { S.settings.angle = +e.target.value; $('#angle-out').textContent = e.target.value + '°'; digitizeSoon(); scheduleSave(); });
  $('#underlay').addEventListener('change', function (e) { S.settings.underlay = e.target.checked; syncStitchSettings(); digitizeSoon(); scheduleSave(); });
  function digitizeSoon() { syncStitchSettings(); S.placement=undefined; invalidateDesign(); digitizeTimer=setTimeout(updateDesign,120); }

  function syncStitchSettings() {
    var layer=currentLayer(); if(!layer)return;
    var values=layer.stitchSettings || stitchDefaults(layer,S.settings);
    $('#stitch-custom').checked=!!layer.stitchSettings; $('#stitch-fields').disabled=!layer.stitchSettings;
    $('#stitch-object-name').textContent='Stitches for: '+layer.name+(layer.stitchSettings?' (its own settings)':' (the design\'s settings)');
    var lettering=layer.kind==='text'&&isEmbroideryFont(layer.source.font);
    $('#fill-stitch-fields').hidden=lettering; $('#satin-stitch-fields').hidden=layer.kind==='image'||(layer.kind==='text'&&!lettering);
    Object.keys(values).forEach(function(key){$('#stitch-'+key).value=values[key];});
  }
  $('#stitch-custom').addEventListener('change',function(e){pushUndo();currentLayer().stitchSettings=e.target.checked?stitchDefaults(currentLayer(),S.settings):undefined;S.placement=undefined;syncStitchSettings();updateDesign();scheduleSave();});
  Object.keys(stitchDefaults({kind:'draw',source:{}},S.settings)).forEach(function(key){
    var input=$('#stitch-'+key);
    input.addEventListener(input.tagName==='SELECT'?'change':'input',function(e){
      if(!currentLayer().stitchSettings)return;
      var value=e.target.tagName==='SELECT'?e.target.value:+e.target.value;
      if(typeof value==='number' && (!Number.isFinite(value)||value<+e.target.min||value>+e.target.max)){failDesign('Use a stitch setting within the displayed range.');return;}
      pushUndo('stitch-'+key);currentLayer().stitchSettings[key]=value;S.placement=undefined;updateDesign();scheduleSave();
    });
  });

  // ---------- naming + saving ----------
  function autoName() {
    if (!S.nameAuto) return;
    var n = '';
    if (S.mode === 'draw') n = 'my-drawing';
    else if (S.mode === 'image') n = slug((S.image.fileName || 'cactus').replace(/\.[^.]+$/, '')) || 'picture';
    else n = slug(S.text.value.split('\n')[0]).toLowerCase() || 'text';
    S.name = n;
    $('#fname').value = n;
  }
  $('#fname').addEventListener('input', function (e) { S.name = e.target.value; S.nameAuto = !e.target.value; scheduleSave(); });

  function setStatus(msg, kind) { var el = $('#save-status'); el.textContent = msg; el.className = 'status' + (kind ? ' ' + kind : ''); }
  function buildFiles() {
    var name = slug(S.name) || 'design';
    var out = E.toStream(S.plan);
    return { name: name, pes: E.writePES(out.stream, out.colors, name), dst: E.writeDST(out.stream, name) };
  }
  // What the Stitch screen needs: the stitch list for Respira's encoder and one thread per colour block.
  function buildDesign() {
    var out = E.toStream(S.plan);
    return {
      name: slug(S.name) || 'design',
      placement: S.placement,
      stitches: E.toRespiraStitches(out.stream),
      threads: out.colors.map(function (c) { var t = PEC[c]; return { index: c, name: t[3], rgb: [t[0], t[1], t[2]] }; })
    };
  }
  function downloadBytes(bytes, filename) {
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    var a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }
  function hasDesign() { return !!(S.plan && S.stats && S.stats.stitches); }
  $('#send').addEventListener('click', function () {
    if (!hasDesign()) return;
    setStatus('');
    var refusal = opts.onSend ? opts.onSend(buildDesign()) : 'Sending is not available here.';
    if (refusal) setStatus(refusal, 'err');
  });
  $('#save').addEventListener('click', function () {
    if (!hasDesign()) return;
    var files = buildFiles();
    downloadBytes(files.pes, files.name + '.pes');
    setStatus('Saved ' + files.name + '.pes.', 'ok');
  });
  $('#save-dst').addEventListener('click', function () {
    if (!hasDesign()) return;
    var files = buildFiles();
    downloadBytes(files.dst, files.name + '.dst');
    setStatus('Saved ' + files.name + '.dst.', 'ok');
  });

  // ---------- local persistence (this browser only) ----------
  function rle(a) { var out = [], v = a[0], n = 0; for (var i = 0; i < a.length; i++) { if (a[i] === v) n++; else { out.push(v, n); v = a[i]; n = 1; } } out.push(v, n); return out; }
  function unrle(r, len) { var a = new Uint8Array(len), p = 0; for (var i = 0; i < r.length; i += 2) { a.fill(r[i], p, Math.min(len, p + r[i + 1])); p += r[i + 1]; } return a; }
  var saveTimer = null;
  function scheduleSave() { if (opts.onDirty) opts.onDirty(); clearTimeout(saveTimer); saveTimer = setTimeout(saveLocal, 500); }
  function serializeSource(kind, source) {
    if(kind==='draw') return {tool:source.tool,color:source.color,sizes:source.sizes,pressure:source.pressure,order:source.order,example:source.example,labels:rle(source.labels),strokes:source.strokes.map(function(st){return {k:st.kind,c:st.color,p:st.pts.map(function(p){return p.slice();})};})};
    if(kind==='text') return Object.assign({},source);
    return {sizeMM:source.sizeMM,k:source.k,removeBg:source.removeBg,clean:source.clean,sourceDataURL:source.sourceDataURL || (source.source && source.source.toDataURL ? source.source.toDataURL('image/png'):undefined),fileName:source.fileName,clusters:source.clusters.map(function(c){return {rgb:c.rgb,thread:c.thread,on:c.on};})};
  }
  function deserializeSource(kind, source) {
    if(kind==='draw') return Object.assign(freshSource(kind),source,{labels:unrle(source.labels,GRID*GRID),strokes:source.strokes.map(function(st){return {kind:st.k,color:st.c,pts:st.p.map(function(p){return p.slice();})};})});
    return Object.assign(freshSource(kind),source);
  }
  function snapshot() {
    if (S.layers.some(function(l){return l.source.loading;})) throw new Error('Wait for all pictures to finish loading.');
    return {v:4,mode:S.mode,view:S.view,fabric:S.fabric,hoop:S.hoop,settings:S.settings,
      draw:serializeSource('draw',S.draw),image:serializeSource('image',S.image),text:serializeSource('text',S.text),name:S.name,placement:S.placement,
      activeLayerId:S.activeId,layers:S.layers.map(function(l){return {id:l.id,name:l.name,kind:l.kind,visible:l.visible,transform:Object.assign({},l.transform),stitchSettings:l.stitchSettings?Object.assign({},l.stitchSettings):undefined,source:serializeSource(l.kind,l.source)};})};
  }
  function thumbnail() {
    var c = document.createElement('canvas'); c.width = c.height = 180;
    c.getContext('2d').drawImage(base, 0, 0, 180, 180);
    return c.toDataURL('image/png');
  }
  function saveLocal() {
    if (destroyed || S.layers.some(function(l){return l.source.loading;})) return;
    if (opts.onSave) opts.onSave(snapshot(), thumbnail());
    else { try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (e) { /* legacy standalone mode */ } }
  }
  function loadLocal() {
    try {
      var s = opts.project;
      if (!s) { var raw = localStorage.getItem(KEY); if (!raw) return false; s = JSON.parse(raw); }
      if (!s || (s.v !== 1 && s.v !== 2 && s.v !== 3 && s.v !== 4)) return false;
      loadedProject = s;
      S.placement = s.placement;
      if (s.view) S.view = Object.assign(S.view, s.view);
      if (s.fabric) S.fabric = s.fabric;
      if (s.hoop) S.hoop = { real: s.hoop.real !== false, pxmm: +s.hoop.pxmm > 2 && +s.hoop.pxmm < 9 ? +s.hoop.pxmm : null };
      if (s.settings) S.settings = Object.assign(S.settings, s.settings);
      var d = s.draw || {};
      if (d.tool) S.draw.tool = d.tool;
      if (d.color) S.draw.color = d.color;
      if (d.sizes) S.draw.sizes = Object.assign(S.draw.sizes, d.sizes);
      if (typeof d.pressure === 'boolean') S.draw.pressure = d.pressure;
      S.draw.order = d.order || [];
      S.draw.example = !!d.example;
      S.draw.labels = d.labels ? unrle(d.labels, GRID * GRID) : new Uint8Array(GRID * GRID);
      S.draw.strokes = (d.strokes || []).map(function (st) { return { kind: st.k, color: st.c, pts: st.p }; });
      if (s.image) Object.assign(S.image, s.image);
      if (s.text) S.text = Object.assign(S.text, s.text);
      if (s.name) { S.name = s.name; S.nameAuto = false; }
      return s.mode || 'draw';
    } catch (e) { return false; }
  }

  var shapeAsObject=false;
  $('#shape-tool').addEventListener('click',function(){showPanel('properties');shapeAsObject=true;$('.shape-tools').hidden=false;$('.shape-tools').open=true;$('#shape-status').textContent='';$('#properties-panel').scrollTop=0;});
  $('#cancel-shape').addEventListener('click',function(){shapeAsObject=false;$('.shape-tools').hidden=true;$('#shape-tool').focus();});
  // Presets become normal editable drawing strokes/fills, including undo and project saving.
  $('#add-shape').addEventListener('click', function () {
    try {
      var style = $('#shape-style').value, w = +$('#shape-line-width').value;
      var points = shapePoints($('#shape-kind').value, +$('#shape-width').value, +$('#shape-height').value, +$('#shape-x').value, +$('#shape-y').value, style === 'satin' ? w / 2 + 0.3 : 0.3);
      if (!Number.isFinite(w) || w < 1.5 || w > 6) throw new Error('Choose an outline width between 1.5 and 6 mm.');
      if(shapeAsObject && S.layers.length>=20){toast('A design can have up to 20 parts.');return;}
      pushUndo();
      if(shapeAsObject){var shape=makeLayer('draw');shape.source.color=S.draw.color;var name=$('#shape-kind').selectedOptions[0].textContent, number=2;shape.name=name;while(S.layers.some(l=>l.name===shape.name))shape.name=name+' '+number++;S.layers.push(shape);moveDrawing=true;selectLayer(shape.id);shapeAsObject=false;}
      if (style === 'fill') {
        var mask = rasterize(function (ctx, k) { ctx.beginPath(); ctx.moveTo(points[0][0]*k, points[0][1]*k); points.slice(1).forEach(function (p) { ctx.lineTo(p[0]*k,p[1]*k); }); ctx.closePath(); ctx.fill(); });
        for (var i=0; i<mask.length; i++) if (mask[i]) S.draw.labels[i] = S.draw.color;
        noteOrder(S.draw.color);
      } else S.draw.strokes.push({ kind: style === 'satin' ? 'satin' : 'run', color: S.draw.color, pts: points.map(function (p) { return [p[0],p[1],style === 'satin' ? w : 0]; }) });
      S.draw.example = false; afterDrawChange();
      $('#shape-status').textContent = 'Shape added. Use Undo to remove it.';
    } catch (error) { $('#shape-status').textContent = error.message; }
  });

  function addObject(kind) {
    if(S.layers.length>=20){toast('A design can have up to 20 parts.');return;}
    pushUndo(); S.placement=undefined; var layer=makeLayer(kind); S.layers.push(layer); selectLayer(layer.id);
    if(kind==='text') { $('#txt').focus(); $('#txt').select(); }
  }
  $('#add-draw-layer').addEventListener('click',function(){setPan(false);moveDrawing=false;setMode('draw');showDrawTools();});
  $('#new-drawing-object').addEventListener('click',function(){moveDrawing=false;addObject('draw');showDrawTools();});
  $('#add-image-layer').addEventListener('click',function(){$('#add-picture-file').click();});
  $('#add-text-layer').addEventListener('click',function(){moveDrawing=true;showPanel('properties');addObject('text');});
  $('#move-layer').addEventListener('click',function(){setPan(false);moveDrawing=true;syncLayers();render();});
  $('#layer-name').addEventListener('input',function(e){pushUndo('layer-name');currentLayer().name=e.target.value.trim().slice(0,60)||'Layer';syncLayers();syncStitchSettings();scheduleSave();});
  $('#layer-visible').addEventListener('change',function(e){pushUndo();S.placement=undefined;currentLayer().visible=e.target.checked;syncLayers();updateDesign();scheduleSave();});
  ['x','y','size','rotation'].forEach(function(key){$('#layer-'+key).addEventListener('input',function(e){var value=+e.target.value;if(!Number.isFinite(value)||value < +e.target.min||value > +e.target.max){failDesign('Enter a layer value within the displayed range.');return;}pushUndo('layer-'+key);S.placement=undefined;currentLayer().transform[key==='size'?'scale':key]=key==='size'?value/100:value;syncLayers();updateDesign();scheduleSave();});});
  $('#layer-duplicate').addEventListener('click',function(){if(S.layers.length>=20){toast('A design can have up to 20 parts.');return;}pushUndo();S.placement=undefined;var layer=cloneLayer(currentLayer());layer.id=crypto.randomUUID();layer.name=(layer.name+' copy').slice(0,60);S.layers.splice(S.layers.indexOf(currentLayer())+1,0,layer);selectLayer(layer.id);});
  $('#layer-remove').addEventListener('click',function(){if(S.layers.length<2)return;pushUndo();S.placement=undefined;S.layers=S.layers.filter(function(l){return l.id!==S.activeId;});selectLayer(S.layers[0].id);});
  [-1,1].forEach(function(direction){$(direction===-1?'#layer-earlier':'#layer-later').addEventListener('click',function(){var i=S.layers.indexOf(currentLayer()),j=i+direction;if(j<0||j>=S.layers.length)return;pushUndo();S.placement=undefined;var layer=S.layers.splice(i,1)[0];S.layers.splice(j,0,layer);syncLayers();updateDesign();scheduleSave();});});


  function hydrateImages() {
  S.layers.forEach(function(layer){
    if(layer.kind!=='image'||!layer.source.sourceDataURL||layer.source.source||layer.source.loading)return;
    var im=layer.source;im.loading=true;var image=new Image();
    image.onload=function(){if(destroyed)return;im.loading=false;im.source=image;processImage(im);if(S.image===im)renderClusters();updateDesign();scheduleSave();};
    image.onerror=function(){if(destroyed)return;im.loading=false;im.error='A saved picture could not be opened. Replace it or hide the layer.';updateDesign();};
    image.src=im.sourceDataURL;
  });
  }


  // Docked panels in landscape; independent, dismissible drawers in portrait.
  var compactQuery=window.matchMedia?.('(max-width: 1023px)'), compact=!!compactQuery?.matches;
  var panels={objects:!compact,properties:!compact};
  function syncPanels(){
    ['objects','properties'].forEach(function(name){
      $('#'+name+'-panel').hidden=!panels[name];
      $('#toggle-'+name).setAttribute('aria-expanded',String(panels[name]));
      $('.editor-workspace').classList.toggle('without-'+name,!panels[name]);
    });
    syncEditingLabel();
    applyHoopSize();
  }
  function showPanel(name){if(compact)panels={objects:false,properties:false};panels[name]=true;syncPanels();}
  // "Editing: Drawing 2" says which object is selected; the docked Objects list already shows that.
  function syncEditingLabel(){$('#editing-object').hidden=!!(panels && panels.objects && !compact);}
  // In the narrow layout Properties is a drawer over the canvas. Drawing needs its tools and thread
  // colors in reach with the whole hoop in view, so while Draw is on they move to a dock above the hoop.
  function placeDrawTools(){
    var dock=$('#draw-dock'), toolbar=$('#toolbar'), threads=$('.threads.in-bench'), home=$('#panel-draw'), after=$('.drawing-recolor');
    var docked=!!compact && S.mode==='draw' && !moveDrawing;
    if(docked && toolbar.parentNode!==dock){dock.appendChild(toolbar);dock.appendChild(threads);if(panels.properties){panels.properties=false;syncPanels();}}
    else if(!docked && toolbar.parentNode===dock){home.insertBefore(toolbar,after);home.insertBefore(threads,after);}
    if(dock.hidden===docked){dock.hidden=!docked;applyHoopSize();}
  }
  // Opening Properties is right when it is docked beside the canvas, wrong when it would cover the hoop.
  function showDrawTools(){if(compact){panels={objects:false,properties:false};syncPanels();}else showPanel('properties');}
  ['objects','properties'].forEach(function(name){
    $('#toggle-'+name).addEventListener('click',function(){if(panels[name]){panels[name]=false;syncPanels();}else showPanel(name);});
    $('#close-'+name).addEventListener('click',function(){panels[name]=false;syncPanels();$('#toggle-'+name).focus();});
  });
  if(compactQuery)listen(compactQuery,'change',function(e){compact=e.matches;panels={objects:!compact,properties:!compact};syncPanels();placeDrawTools();});
  listen(document,'keydown',function(e){if(!shown()||e.key!=='Escape')return; if(compact){var name=panels.properties?'properties':'objects';panels={objects:false,properties:false};syncPanels();$('#toggle-'+name).focus();}});
  function setPan(value){panCanvas=value;$('#pan-canvas').setAttribute('aria-pressed',String(value));stage.classList.toggle('panning',value);renderSelection();}
  $('#pan-canvas').addEventListener('click',function(){setPan(!panCanvas);});
  holder.addEventListener('pointerdown',function(e){var menu=$('#view-menu');if(menu.open&&!menu.contains(e.target))menu.open=false;});
  function resetZoom(){zoom=1;$('#canvas-zoom').value=100;$('#zoom-out').textContent='100%';}
  $('#canvas-zoom').addEventListener('input',function(e){zoom=+e.target.value/100;$('#zoom-out').textContent=e.target.value+'%';applyHoopSize();});
  $('#grid-toggle').addEventListener('click',function(){showGrid=!showGrid;$('#grid-toggle').setAttribute('aria-pressed',String(showGrid));render();});
  function renderSelection(force=false){
    var selected=currentLayer(), bounds=selected&&selected.visible&&objectBounds.get(selected.id), box=$('#selection-box');
    box.hidden=panCanvas||!bounds||!selected.visible||(S.mode==='draw'&&!moveDrawing);
    ['width','height'].forEach(function(key,i){var el=$('#object-'+key);el.disabled=!bounds; if(force||(root.activeElement!==el&&document.activeElement!==el))el.value=bounds?Math.max(.1,bounds[i+2]-bounds[i]).toFixed(1):'';});
    if(box.hidden)return;
    box.style.left=bounds[0]+'%';box.style.top=bounds[1]+'%';box.style.width=(bounds[2]-bounds[0])+'%';box.style.height=(bounds[3]-bounds[1])+'%';
  }
  $$('.resize-handle').forEach(function(handle){handle.addEventListener('pointerdown',function(e){
    if(active || (e.button&&e.button!==0))return;
    var bounds=objectBounds.get(S.activeId);if(!bounds)return;e.preventDefault();e.stopPropagation();
    active={id:e.pointerId,resize:true,changed:false,x:e.clientX,y:e.clientY,corner:handle.dataset.corner,bounds:bounds.slice(),transform:{...currentLayer().transform}};
    try{over.setPointerCapture(e.pointerId);}catch(err){}
  });});
  ['width','height'].forEach(function(key,i){$('#object-'+key).addEventListener('change',function(e){
    var bounds=objectBounds.get(S.activeId), value=Number(e.target.value), size=bounds&&bounds[i+2]-bounds[i];
    if(!size||!Number.isFinite(value)||value<=0||value>400){renderSelection(true);return;}
    pushUndo();currentLayer().transform=scaleAbout(currentLayer().transform,value/size,[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2]);
    S.placement=undefined;syncLayers();updateDesign();renderSelection(true);scheduleSave();
  });});

  // ---------- boot ----------
  var savedMode = loadLocal();
  if (!savedMode) exampleDrawing();
  $('#pressure').checked = S.draw.pressure;
  $('#img-size').value = S.image.sizeMM; $('#img-size-out').textContent = S.image.sizeMM + ' mm';
  $('#img-k').value = S.image.k; $('#img-k-out').textContent = S.image.k;
  $('#img-bg').checked = S.image.removeBg;
  $$('#img-clean button').forEach(function (x) { x.setAttribute('aria-pressed', String(+x.dataset.clean === S.image.clean)); });
  $('#txt').value = S.text.value; fontSel.value = FONTS[S.text.font] ? S.text.font : 'Lobster';
  $('#txt-w').value = S.text.widthMM; $('#txt-w-out').textContent = S.text.widthMM + ' mm';
  $$('#density button').forEach(function (x) { x.setAttribute('aria-pressed', String(+x.dataset.spacing === S.settings.spacing)); });
  $('#angle').value = S.settings.angle; $('#angle-out').textContent = S.settings.angle + '°';
  $('#underlay').checked = S.settings.underlay;
  if (S.name) $('#fname').value = S.name;
  textPalette = Palette($('#txt-palette'), function () { return S.text.color; }, function (i) { pushUndo(); S.placement=undefined; S.text.color = i; updateDesign(); scheduleSave(); });
  drawPalettes.forEach(function (p) { p.draw(); });
  syncThreadName(); syncFabric(); setTool(S.draw.tool); syncHistory();
  if(loadedProject && (loadedProject.v===2 || loadedProject.v===3 || loadedProject.v===4) && loadedProject.layers) {
    S.layers=loadedProject.layers.map(function(l){return Object.assign({},l,{transform:Object.assign({},l.transform),source:deserializeSource(l.kind,l.source)});});
    S.activeId=loadedProject.activeLayerId;
  } else {
    ['draw','image','text'].forEach(function(kind){var source=S[kind];var present=kind==='draw'?(source.strokes.length||E.countSet(source.labels)):kind==='image'?!!source.sourceDataURL:!!source.value;
      if(present || kind===(savedMode||'draw')) {var layer=makeLayer(kind,source);layer.visible=kind===(savedMode||'draw');S.layers.push(layer);if(layer.visible)S.activeId=layer.id;}
    });
  }
  hydrateImages();
  // Open ready to draw when the active object is a drawing; Select stays the start for pictures and text.
  var opening = S.layers.find(function (l) { return l.id === S.activeId; }) || S.layers[0];
  moveDrawing = opening.kind !== 'draw';
  selectLayer(opening.id);
  syncPanels();
  applyHoopSize();
  resizeStage();

  listen(window, 'pagehide', saveLocal);
  listen(document, 'visibilitychange', function () { if (document.visibilityState === 'hidden') saveLocal(); });
  $('#projects').hidden = !opts.onProjects;
  $('#projects').addEventListener('click', function () { if (opts.onProjects) opts.onProjects(); });
  return {
    snapshot: snapshot, thumbnail: thumbnail,
    setProjectStatus: function (text) { $('#project-status').textContent = text || ''; },
    setPlacement: function (value) { if (JSON.stringify(value) !== JSON.stringify(S.placement)) { S.placement = value; scheduleSave(); } },
    destroy: function () { destroyed = true; textToken++; [digitizeTimer, txtTimer, imgTimer, saveTimer, toastTimer, clearArmed].forEach(clearTimeout); cleanups.forEach(function (fn) { fn(); }); if (styleEl) styleEl.remove(); holder.remove(); }
  };
}

