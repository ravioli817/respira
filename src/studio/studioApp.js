/* The Create screen: draw, turn a picture into stitches, or set text. This is the Stitch Sketchbook's
   interface, mounted into a shadow root so its styles and Respira's stay out of each other's way.
   Plain JavaScript on purpose; the typed surface is in studioApp.d.ts. */
import { StitchEngine as E } from './engine.js';
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
  function listen(target, type, fn, o) { target.addEventListener(type, fn, o); cleanups.push(function () { target.removeEventListener(type, fn, o); }); }
  function shown() { return holder.getClientRects().length > 0; }

  var CURATED = [20, 29, 23, 39, 16, 5, 28, 48, 25, 43, 27, 51, 62, 52, 13, 58, 14, 37, 54, 44, 3, 32, 2, 21, 1, 55, 9, 45, 26, 24, 47];
  var ALL = []; for (var ti = 1; ti < 64; ti++) ALL.push(ti);
  var FABRICS = [['#FFFFFF', 'White'], ['#E9E1CF', 'Natural linen'], ['#B8BCC4', 'Heather gray'], ['#1F2944', 'Navy'], ['#181818', 'Black']];
  var FONTS = {
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
    hoop: { real: true, pxmm: null },     // pxmm: CSS px per mm once the size was checked against a card
    settings: { spacing: 0.4, angle: 45, underlay: true },
    draw: { tool: 'satin', color: 37, sizes: { satin: 3, brush: 6, eraser: 6 }, pressure: true, strokes: [], labels: new Uint8Array(GRID * GRID), order: [], example: false },
    image: { source: null, fileName: '', sizeMM: 80, k: 4, removeBg: true, clean: 2, proc: null, clusters: [] },
    text: { value: 'Hello', font: 'Lobster', widthMM: 80, color: 5 },
    name: '', nameAuto: true,
    design: null, plan: null, stats: null, note: ''
  };
  var undoStack = [], redoStack = [];

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
    var room = stageCol.clientWidth;
    var real = S.hoop.real && (!room || need <= room + 1);
    stageCol.classList.toggle('real', real);
    stageCol.style.setProperty('--real-w', need + 'px');
    $('#size-real').setAttribute('aria-pressed', String(S.hoop.real));
    $('#size-fit').setAttribute('aria-pressed', String(!S.hoop.real));
    $('#size-note').textContent = !S.hoop.real ? 'Scaled to fit the screen.'
      : !real ? 'This screen is too small for real size, so the hoop is scaled to fit.'
      : (S.hoop.pxmm || sizeGuess.sure) ? 'Real size: the hoop is 100 mm (4 in) across, the same as on the machine.'
      : 'Real size is an estimate on this screen.';
    $('#size-check').hidden = !S.hoop.real;
  }
  $('#size-real').addEventListener('click', function () { S.hoop.real = true; applyHoopSize(); scheduleSave(); });
  $('#size-fit').addEventListener('click', function () { S.hoop.real = false; applyHoopSize(); scheduleSave(); });
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
  if (window.ResizeObserver) { var roCol = new ResizeObserver(applyHoopSize); roCol.observe(stageCol); cleanups.push(function () { roCol.disconnect(); }); }

  if (window.ResizeObserver) { var ro = new ResizeObserver(resizeStage); ro.observe(stage); cleanups.push(function () { ro.disconnect(); }); }
  listen(window, 'resize', resizeStage);

  var labelCanvas = document.createElement('canvas');
  labelCanvas.width = labelCanvas.height = GRID;
  var labelCtx = labelCanvas.getContext('2d');
  var labelsDirty = true;
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
    labelsDirty = false;
  }

  function currentView() { return S.view[S.mode]; }

  function render() {
    var ctx = bctx, W = base.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = S.fabric; ctx.fillRect(0, 0, W, W);
    drawGrid(ctx, W);
    if (currentView() === 'design') drawDesign(ctx);
    else drawStitches(ctx);
    drawCenter(ctx);
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
    var d = S.design;
    if (!d) return;
    if (labelsDirty) paintLabels(d.labels);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(labelCanvas, 0, 0, base.width, base.height);
    (d.lines || []).forEach(function (st) {
      ctx.strokeStyle = rgb(st.color); ctx.fillStyle = rgb(st.color);
      strokeShape(ctx, st, px, 0);
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
    return [clamp((e.clientX - r.left) / r.width * HOOP, 0, HOOP), clamp((e.clientY - r.top) / r.height * HOOP, 0, HOOP)];
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
    var k = px, tool = S.draw.tool, lw = tool === 'line' ? 0.75 : w;
    octx.strokeStyle = liveColor(); octx.fillStyle = liveColor();
    octx.lineCap = 'round'; octx.lineJoin = 'round';
    if (!last) { octx.beginPath(); octx.arc(p[0] * k, p[1] * k, lw * k / 2, 0, Math.PI * 2); octx.fill(); }
    else {
      octx.lineWidth = lw * k;
      octx.beginPath(); octx.moveTo(last[0] * k, last[1] * k); octx.lineTo(p[0] * k, p[1] * k); octx.stroke();
    }
  }
  over.addEventListener('pointerdown', function (e) {
    if (S.mode !== 'draw' || active) return;
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
    var list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (list && list.length) list.forEach(addPoint); else addPoint(e);
  });
  function endStroke(e) {
    if (!active || e.pointerId !== active.id) return;
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
  function snap() { var d = S.draw; return { strokes: d.strokes.slice(), labels: d.labels.slice(), order: d.order.slice(), example: d.example }; }
  function restore(s) { var d = S.draw; d.strokes = s.strokes.slice(); d.labels = s.labels.slice(); d.order = s.order.slice(); d.example = s.example; }
  function pushUndo() { undoStack.push(snap()); if (undoStack.length > 40) undoStack.shift(); redoStack = []; syncHistory(); }
  function undo() { if (!undoStack.length) return; redoStack.push(snap()); restore(undoStack.pop()); afterDrawChange(); }
  function redo() { if (!redoStack.length) return; undoStack.push(snap()); restore(redoStack.pop()); afterDrawChange(); }
  function syncHistory() { $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length; }

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
    if (!shown() || S.mode !== 'draw' || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
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
  function processImage() {
    var im = S.image, src = im.source;
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
  function imageDesign() {
    var im = S.image, P = im.proc, labels = new Uint8Array(GRID * GRID), order = [];
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
  function textDesign(done) {
    var t = S.text, token = ++textToken;
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
    if (S.mode === 'draw') {
      S.design = { labels: S.draw.labels, order: S.draw.order, lines: S.draw.strokes };
      S.note = '';
      designReady();
    } else if (S.mode === 'image') {
      S.design = imageDesign();
      var fgMask = new Uint8Array(GRID * GRID);
      for (var i = 0; i < fgMask.length; i++) fgMask[i] = S.design.labels[i] ? 1 : 0;
      var thin = E.thinShare(fgMask, GRID, GRID, 3);
      S.note = thin > 0.12 ? 'Some details are thinner than about 1.2 mm and may get lost. Try a larger size or fewer colors.' : '';
      designReady();
    } else {
      textDesign(function (d, thin) {
        if (S.mode !== 'text') return;
        S.design = d;
        S.note = thin > 0.08 ? 'Parts of these letters are thinner than about 1.2 mm and may not stitch cleanly. Make the text wider or pick a bolder font.' : '';
        designReady();
      });
    }
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
    labelsDirty = true;
    var note = $('#note'); note.textContent = S.note; note.hidden = !S.note;
    render();
    clearTimeout(digitizeTimer);
    digitizeTimer = setTimeout(digitize, 60);
  }
  function digitize() {
    if (!S.design) return;
    S.plan = E.plan(S.design, { spacing: S.settings.spacing, angle: S.settings.angle, underlay: S.settings.underlay });
    S.stats = E.planStats(S.plan);
    renderStats();
    render();
  }
  function afterDrawChange() {
    syncHistory();
    $('#example-tag').hidden = !(S.mode === 'draw' && S.draw.example);
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
  function setMode(m) {
    S.mode = m;
    $$('.modes [role="tab"]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.mode === m)); });
    $('#panel-draw').hidden = m !== 'draw';
    $('#panel-image').hidden = m !== 'image';
    $('#panel-text').hidden = m !== 'text';
    $('#toolbar').hidden = m !== 'draw';
    $('#draw-threads').hidden = m !== 'draw';
    stage.classList.toggle('drawing', m === 'draw');
    $('#example-tag').hidden = !(m === 'draw' && S.draw.example);
    if (m === 'image' && !S.image.source) { S.image.source = examplePicture(); processImage(); renderClusters(); }
    syncView();
    autoName();
    S.plan = null; S.stats = null;
    updateDesign();
    scheduleSave();
  }
  $$('.modes [role="tab"]').forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); }); });

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
  $$('.tool').forEach(function (b) { b.addEventListener('click', function () { setTool(b.dataset.tool); }); });
  $('#size').addEventListener('input', function (e) {
    var t = S.draw.tool; if (!SIZE_CFG[t]) return;
    S.draw.sizes[t] = +e.target.value;
    $('#size-out').textContent = (+e.target.value).toFixed(1) + ' mm';
    scheduleSave();
  });
  $('#pressure').addEventListener('change', function (e) { S.draw.pressure = e.target.checked; scheduleSave(); });

  var drawPalettes = [];
  function pickDrawColor(i) { S.draw.color = i; syncThreadName(); drawPalettes.forEach(function (p) { p.draw(); }); scheduleSave(); }
  drawPalettes.push(Palette($('#draw-palette'), function () { return S.draw.color; }, pickDrawColor));
  drawPalettes.push(Palette($('#draw-palette-bench'), function () { return S.draw.color; }, pickDrawColor));
  function syncThreadName() { $$('.thread-name').forEach(function (el) { el.textContent = threadName(S.draw.color) + ' · #' + S.draw.color; }); }

  // picture controls
  $('#file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    invalidateDesign();
    var done = function (src) {
      S.image.source = src; S.image.fileName = f.name; S.image.clusters = [];
      $('#file-name').textContent = f.name;
      processImage(); renderClusters(); autoName(); updateDesign();
    };
    var fail = function () { updateDesign(); toast("That file couldn't be opened as a picture. Try a PNG or JPEG."); };
    if (window.createImageBitmap) createImageBitmap(f).then(done, function () { viaImg(f, done, fail); });
    else viaImg(f, done, fail);
    e.target.value = '';
  });
  function viaImg(f, done, fail) {
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () { var c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); URL.revokeObjectURL(url); done(c); };
    img.onerror = function () { URL.revokeObjectURL(url); fail(); };
    img.src = url;
  }
  var imgTimer = null;
  function reprocessSoon() { invalidateDesign(); clearTimeout(imgTimer); imgTimer = setTimeout(function () { processImage(); renderClusters(); updateDesign(); scheduleSave(); }, 120); }
  $('#img-size').addEventListener('input', function (e) { S.image.sizeMM = +e.target.value; $('#img-size-out').textContent = e.target.value + ' mm'; reprocessSoon(); });
  $('#img-k').addEventListener('input', function (e) { S.image.k = +e.target.value; $('#img-k-out').textContent = e.target.value; S.image.clusters = []; reprocessSoon(); });
  $('#img-bg').addEventListener('change', function (e) { S.image.removeBg = e.target.checked; reprocessSoon(); });
  $$('#img-clean button').forEach(function (b) {
    b.addEventListener('click', function () {
      S.image.clean = +b.dataset.clean;
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
      sw.addEventListener('click', function () { openSheet(cl.thread, function (t) { cl.thread = t; renderClusters(); updateDesign(); }); });
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = threadName(cl.thread) + ' #' + cl.thread;
      var pct = document.createElement('span'); pct.className = 'pct'; pct.textContent = Math.max(1, Math.round(cl.area / total * 100)) + '%';
      var tg = document.createElement('button'); tg.type = 'button'; tg.className = 'pill'; tg.setAttribute('aria-pressed', String(cl.on)); tg.textContent = cl.on ? 'Stitch' : 'Skip';
      tg.addEventListener('click', function () { cl.on = !cl.on; renderClusters(); updateDesign(); });
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
  Object.keys(FONTS).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = FONTS[k].label; fontSel.appendChild(o); });
  var txtTimer = null;
  function textChanged() { invalidateDesign(); clearTimeout(txtTimer); txtTimer = setTimeout(function () { autoName(); updateDesign(); scheduleSave(); }, 180); }
  $('#txt').addEventListener('input', function (e) { S.text.value = e.target.value; textChanged(); });
  fontSel.addEventListener('change', function (e) { S.text.font = e.target.value; textChanged(); });
  $('#txt-w').addEventListener('input', function (e) { S.text.widthMM = +e.target.value; $('#txt-w-out').textContent = e.target.value + ' mm'; textChanged(); });
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
  $('#underlay').addEventListener('change', function (e) { S.settings.underlay = e.target.checked; digitizeSoon(); scheduleSave(); });
  function digitizeSoon() { invalidatePlan(); digitizeTimer = setTimeout(digitize, 120); }

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
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveLocal, 500); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function saveLocal() {
    try {
      var d = S.draw;
      localStorage.setItem(KEY, JSON.stringify({
        v: 1, mode: S.mode, view: S.view, fabric: S.fabric, hoop: S.hoop, settings: S.settings,
        draw: { tool: d.tool, color: d.color, sizes: d.sizes, pressure: d.pressure, order: d.order, example: d.example, labels: rle(d.labels),
          strokes: d.strokes.map(function (st) { return { k: st.kind, c: st.color, p: st.pts.map(function (p) { return [r2(p[0]), r2(p[1]), r2(p[2])]; }) }; }) },
        image: { sizeMM: S.image.sizeMM, k: S.image.k, removeBg: S.image.removeBg, clean: S.image.clean },
        text: S.text, name: S.nameAuto ? '' : S.name
      }));
    } catch (e) { /* storage unavailable: nothing to keep */ }
  }
  function loadLocal() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return false;
      var s = JSON.parse(raw);
      if (!s || s.v !== 1) return false;
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
  textPalette = Palette($('#txt-palette'), function () { return S.text.color; }, function (i) { S.text.color = i; updateDesign(); scheduleSave(); });
  drawPalettes.forEach(function (p) { p.draw(); });
  syncThreadName(); syncFabric(); setTool(S.draw.tool); syncHistory();
  setMode(savedMode || 'draw');
  applyHoopSize();
  resizeStage();

  return {
    destroy: function () { textToken++; [digitizeTimer, txtTimer, imgTimer, saveTimer, toastTimer, clearArmed].forEach(clearTimeout); cleanups.forEach(function (fn) { fn(); }); if (styleEl) styleEl.remove(); holder.remove(); }
  };
}

