import { columnUnderlay, maskContours } from './underlay.js';
/* Stitch engine: turns filled areas and pen strokes into embroidery stitches,
   and writes Brother PES (v1) and Tajima DST files. No DOM access in here.
   Plain JavaScript on purpose (it started life as the single-file Stitch Sketchbook); types are in engine.d.ts. */
const holder = {};
(function (root) {
  'use strict';

  var CMD = { STITCH: 0, JUMP: 1, TRIM: 2, END: 4, COLOR_CHANGE: 5 };
  var HOOP = 100;          // mm, Skitch 4 x 4 in field
  var RES = 0.2;           // mm per grid cell
  var GRID = 500;          // HOOP / RES

  // Brother PEC thread chart (index 0 is unused). [r, g, b, name]
  var PEC = [[0,0,0,"Unknown"],[14,31,124,"Prussian Blue"],[10,85,163,"Blue"],[0,135,119,"Teal Green"],[75,107,175,"Cornflower Blue"],[237,23,31,"Red"],[209,92,0,"Reddish Brown"],[145,54,151,"Magenta"],[228,154,203,"Light Lilac"],[145,95,172,"Lilac"],[158,214,125,"Mint Green"],[232,169,0,"Deep Gold"],[254,186,53,"Orange"],[255,255,0,"Yellow"],[112,188,31,"Lime Green"],[186,152,0,"Brass"],[168,168,168,"Silver"],[125,111,0,"Russet Brown"],[255,255,179,"Cream Brown"],[79,85,86,"Pewter"],[0,0,0,"Black"],[11,61,145,"Ultramarine"],[119,1,118,"Royal Purple"],[41,49,51,"Dark Gray"],[42,19,1,"Dark Brown"],[246,74,138,"Deep Rose"],[178,118,36,"Light Brown"],[252,187,197,"Salmon Pink"],[254,55,15,"Vermilion"],[240,240,240,"White"],[106,28,138,"Violet"],[168,221,196,"Seacrest"],[37,132,187,"Sky Blue"],[254,179,67,"Pumpkin"],[255,243,107,"Cream Yellow"],[208,166,96,"Khaki"],[209,84,0,"Clay Brown"],[102,186,73,"Leaf Green"],[19,74,70,"Peacock Blue"],[135,135,135,"Gray"],[216,204,198,"Warm Gray"],[67,86,7,"Dark Olive"],[253,217,222,"Flesh Pink"],[249,147,188,"Pink"],[0,56,34,"Deep Green"],[178,175,212,"Lavender"],[104,106,176,"Wisteria Violet"],[239,227,185,"Beige"],[247,56,102,"Carmine"],[181,75,100,"Amber Red"],[19,43,26,"Olive Green"],[199,1,86,"Dark Fuchsia"],[254,158,50,"Tangerine"],[168,222,235,"Light Blue"],[0,103,62,"Emerald Green"],[78,41,144,"Purple"],[47,126,32,"Moss Green"],[255,204,204,"Flesh Pink"],[255,217,17,"Harvest Gold"],[9,91,166,"Electric Blue"],[240,249,112,"Lemon Yellow"],[227,243,91,"Fresh Green"],[255,153,0,"Orange"],[255,240,141,"Cream Yellow"],[255,200,200,"Applique"]];

  // ---------- colour matching (same metric pyembroidery uses) ----------
  function halfRoundEven(s) {
    if (s % 2 === 0) return s / 2;
    var lo = (s - 1) / 2;
    return lo % 2 === 0 ? lo : lo + 1;
  }
  function redMean(r1, g1, b1, r2, g2, b2) {
    var rm = halfRoundEven(r1 + r2);
    var r = r1 - r2, g = g1 - g2, b = b1 - b2;
    return (((512 + rm) * r * r) >> 8) + 4 * g * g + (((767 - rm) * b * b) >> 8);
  }
  function nearestThread(r, g, b, allowed) {
    var best = 1, bd = Infinity;
    for (var i = 1; i < PEC.length; i++) {
      if (allowed && allowed.indexOf(i) < 0) continue;
      if (i === 64) continue; // "Applique" is a placement marker, not a thread
      var t = PEC[i], d = redMean(r, g, b, t[0], t[1], t[2]);
      if (d <= bd) { bd = d; best = i; }
    }
    return best;
  }

  // ---------- small geometry helpers ----------
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function dist2(a, b) { var dx = a[0] - b[0], dy = a[1] - b[1]; return dx * dx + dy * dy; }

  // ---------- mask helpers (Uint8Array W*H, 1 = inside) ----------
  function maskBBox(m, W, H) {
    var x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (var y = 0; y < H; y++) {
      var o = y * W;
      for (var x = 0; x < W; x++) {
        if (m[o + x]) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  function boxPass(src, W, H, r, horiz, all) {
    var out = new Uint8Array(W * H), n = 2 * r + 1;
    var L = horiz ? W : H, M = horiz ? H : W;
    var pre = new Int32Array(L + 1);
    for (var j = 0; j < M; j++) {
      for (var i = 0; i < L; i++) {
        var idx = horiz ? j * W + i : i * W + j;
        pre[i + 1] = pre[i] + (src[idx] ? 1 : 0);
      }
      for (var k = 0; k < L; k++) {
        var a = Math.max(0, k - r), b = Math.min(L, k + r + 1);
        var s = pre[b] - pre[a];
        out[horiz ? j * W + k : k * W + j] = all ? (s === n ? 1 : 0) : (s > 0 ? 1 : 0);
      }
    }
    return out;
  }
  function erode(m, W, H, r) { return r > 0 ? boxPass(boxPass(m, W, H, r, true, true), W, H, r, false, true) : m; }
  function dilate(m, W, H, r) { return r > 0 ? boxPass(boxPass(m, W, H, r, true, false), W, H, r, false, false) : m; }
  function countSet(m) { var c = 0; for (var i = 0; i < m.length; i++) if (m[i]) c++; return c; }

  // Share of a mask that is thinner than about 2*r cells (lost by an opening).
  function thinShare(m, W, H, r) {
    var total = countSet(m);
    if (!total) return 0;
    var opened = dilate(erode(m, W, H, r), W, H, r);
    var lost = 0;
    for (var i = 0; i < m.length; i++) if (m[i] && !opened[i]) lost++;
    return lost / total;
  }

  // ---------- tatami fill ----------
  // Scan the mask along rows at `angle`, group overlapping runs into chains
  // that can be sewn back and forth without lifting the needle.
  function fillChains(mask, W, H, res, o) {
    var bb = maskBBox(mask, W, H);
    if (!bb) return { chains: [], ca: 1, sa: 0 };
    var a = o.angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    var xs = [bb.x0 * res, (bb.x1 + 1) * res], ys = [bb.y0 * res, (bb.y1 + 1) * res];
    var umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
    for (var xi = 0; xi < 2; xi++) for (var yi = 0; yi < 2; yi++) {
      var X = xs[xi], Y = ys[yi];
      var u = X * ca + Y * sa, v = -X * sa + Y * ca;
      if (u < umin) umin = u; if (u > umax) umax = u;
      if (v < vmin) vmin = v; if (v > vmax) vmax = v;
    }
    var sp = o.spacing, h = res * 0.5;
    var k0 = Math.floor(vmin / sp) - 1, k1 = Math.ceil(vmax / sp) + 1;
    var nU = Math.ceil((umax - umin) / h) + 2;
    var chains = [], prev = [];
    for (var k = k0; k <= k1; k++) {
      var vv = (k + 0.5) * sp, runs = [], inRun = false, ua = 0;
      for (var i = 0; i <= nU; i++) {
        var uu = umin - h + i * h, ins = false;
        if (i < nU) {
          var x = uu * ca - vv * sa, y = uu * sa + vv * ca;
          var px = Math.floor(x / res), py = Math.floor(y / res);
          ins = px >= 0 && py >= 0 && px < W && py < H && mask[py * W + px] !== 0;
        }
        if (ins && !inRun) { inRun = true; ua = uu - h / 2; }
        else if (!ins && inRun) {
          inRun = false;
          var a0 = ua - o.pull, b0 = uu - h / 2 + o.pull;
          if (b0 - a0 >= o.minRun) runs.push({ ua: a0, ub: b0, k: k, v: vv, n: 0, chain: null, cand: null });
        }
      }
      for (var c = 0; c < runs.length; c++) {
        var r = runs[c]; r.cand = [];
        for (var p = 0; p < prev.length; p++) {
          var q = prev[p];
          if (Math.min(r.ub, q.ub) - Math.max(r.ua, q.ua) > o.minOverlap) { r.cand.push(q); q.n++; }
        }
      }
      for (c = 0; c < runs.length; c++) {
        r = runs[c];
        if (r.cand.length === 1 && r.cand[0].n === 1) { r.chain = r.cand[0].chain; r.chain.push(r); }
        else { r.chain = [r]; chains.push(r.chain); }
      }
      for (c = 0; c < runs.length; c++) runs[c].cand = null;
      prev = runs;
    }
    return { chains: chains, ca: ca, sa: sa };
  }

  function runNeedles(r, dir, o) {
    var L = o.stitchLen, minEnd = o.minEnd, pts = [r.ua];
    var phase = o.tatami ? ((((r.k % 3) + 3) % 3) / 3) * L : 0;
    var j = Math.ceil((r.ua + minEnd - phase) / L);
    for (;; j++) {
      var u = phase + j * L;
      if (u > r.ub - minEnd) break;
      pts.push(u);
    }
    pts.push(r.ub);
    if (dir < 0) pts.reverse();
    return pts;
  }

  function chainToPath(chain, fromEnd, dir, o, ca, sa) {
    var rows = fromEnd ? chain.slice().reverse() : chain, pts = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], us = runNeedles(r, dir, o);
      for (var j = 0; j < us.length; j++) {
        var p = [us[j] * ca - r.v * sa, us[j] * sa + r.v * ca];
        if (j === 0 && pts.length) {
          var last = pts[pts.length - 1], d = dist(last, p);
          if (d > o.stitchLen) {
            var n = Math.ceil(d / o.stitchLen);
            for (var s = 1; s < n; s++) pts.push([last[0] + (p[0] - last[0]) * s / n, last[1] + (p[1] - last[1]) * s / n]);
          }
        }
        pts.push(p);
      }
      dir = -dir;
    }
    return pts;
  }

  function orderChains(chains, start, o, ca, sa) {
    var left = chains.slice(), paths = [], pos = start;
    while (left.length) {
      var best = null;
      for (var i = 0; i < left.length; i++) {
        var ch = left[i];
        for (var fe = 0; fe < 2; fe++) for (var di = 0; di < 2; di++) {
          var r = fe ? ch[ch.length - 1] : ch[0], d = di ? -1 : 1;
          var u = d > 0 ? r.ua : r.ub;
          var p = [u * ca - r.v * sa, u * sa + r.v * ca];
          var score = pos ? dist2(pos, p) : p[1] * 1000 + p[0];
          if (!best || score < best.score) best = { i: i, fe: !!fe, d: d, score: score };
        }
      }
      var chosen = left.splice(best.i, 1)[0];
      var pts = chainToPath(chosen, best.fe, best.d, o, ca, sa);
      paths.push(pts);
      pos = pts[pts.length - 1];
    }
    return paths;
  }

  function fillPaths(mask, W, H, res, s, start) {
    var out = [], pos = start;
    var tolerant = dilate(mask, W, H, 1);
    var inside = function (x, y) {
      var px = Math.floor(x / res), py = Math.floor(y / res);
      return px >= 0 && py >= 0 && px < W && py < H && tolerant[py * W + px] === 1;
    };
    var fillMode = s.fillUnderlay ?? (s.underlay ? 'tatami' : 'none');
    var inner = erode(mask, W, H, Math.ceil((s.underlayInsetMm ?? 0.4) / res));
    if (fillMode.includes('edge')) {
      maskContours(inner, W, H, res).forEach(function (contour) {
        var points = resample(contour, s.underlayStitchMm ?? 2).map(function (p) { return p.slice(0,2); });
        if (points.length > 1) { out.push({ pts: points, inside: inside }); pos=points[points.length-1]; }
      });
    }
    if (fillMode.includes('tatami')) {
      var u = fillChains(inner, W, H, res, { angle: s.angle + 90, spacing: s.underlaySpacingMm ?? 2.0, pull: 0, minRun: 1.2, minOverlap: 0.6 });
      var up = orderChains(u.chains, pos, { stitchLen: s.underlayStitchMm ?? 3.0, minEnd: 0.6, tatami: false }, u.ca, u.sa);
      for (var i = 0; i < up.length; i++) { out.push({ pts: up[i], inside: inside }); pos = up[i][up[i].length - 1]; }
    }
    var t = fillChains(mask, W, H, res, { angle: s.angle, spacing: s.spacing, pull: s.fillPullMm ?? 0.15, minRun: 0.5, minOverlap: 0.25 });
    var tp = orderChains(t.chains, pos, { stitchLen: s.stitchLen, minEnd: 0.8, tatami: true }, t.ca, t.sa);
    for (var j = 0; j < tp.length; j++) out.push({ pts: tp[j], inside: inside });
    return out;
  }

  // ---------- strokes: satin columns and outline lines ----------
  // pts are [x, y, w] in mm.
  function resample(pts, step) {
    if (pts.length < 2) return pts.map(function (p) { return [p[0], p[1], p[2] || 0]; });
    var out = [[pts[0][0], pts[0][1], pts[0][2] || 0]], carry = 0;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], seg = dist(a, b);
      if (seg === 0) continue;
      var t = step - carry;
      while (t <= seg) {
        var f = t / seg;
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * f]);
        t += step;
      }
      carry = seg - (t - step);
    }
    var last = pts[pts.length - 1], tail = out[out.length - 1];
    if (dist(tail, last) > step * 0.35) out.push([last[0], last[1], last[2] || 0]);
    else out[out.length - 1] = [last[0], last[1], last[2] || 0];
    return out;
  }
  function smooth(P, rad) {
    if (P.length < 3 || rad < 1) return P;
    var out = [];
    for (var i = 0; i < P.length; i++) {
      var r = Math.min(rad, i, P.length - 1 - i), sx = 0, sy = 0, sw = 0, n = 0;
      for (var j = i - r; j <= i + r; j++) { sx += P[j][0]; sy += P[j][1]; sw += P[j][2]; n++; }
      out.push([sx / n, sy / n, sw / n]);
    }
    return out;
  }
  function pathLength(P) { var L = 0; for (var i = 1; i < P.length; i++) L += dist(P[i - 1], P[i]); return L; }

  function dotStroke(pts, w) {
    var x = 0, y = 0;
    for (var i = 0; i < pts.length; i++) { x += pts[i][0]; y += pts[i][1]; }
    x /= pts.length; y /= pts.length;
    var half = Math.max(w * 0.4, 0.6);
    return [[x - half, y, w], [x + half, y, w]];
  }

  function satinPath(stroke, s) {
    var spacing = s.satinSpacing || 0.45, hs = spacing / 2;
    var src = stroke.pts;
    var avgW = 0;
    for (var i = 0; i < src.length; i++) avgW += src[i][2];
    avgW /= Math.max(1, src.length);
    if (pathLength(src) < 0.8) src = dotStroke(src, avgW);
    var P = smooth(resample(src, hs), Math.max(1, Math.round(0.9 / hs)));
    if (P.length < 2) return [];
    var path = [];
    var underlay = s.underlay !== false && avgW >= 1.8;
    if (s.satinUnderlay !== undefined) {
      var rails = P.map(function (p, i) {
        var a=P[Math.max(0,i-2)], b=P[Math.min(P.length-1,i+2)], dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)||1;
        var half=Math.min(6.5,Math.max(1,p[2]))/2;
        return [p[0]-dy/length*half,p[1]+dx/length*half,p[0]+dy/length*half,p[1]-dx/length*half];
      });
      path=columnUnderlay(rails,{mode:s.satinUnderlay,inset:s.underlayInsetMm,spacing:s.underlaySpacingMm,stitchLength:s.underlayStitchMm});
      if(path.length && dist(path[path.length-1],P[P.length-1])<dist(path[path.length-1],P[0]))P=P.slice().reverse();
    } else if (underlay) {
      var every = Math.max(1, Math.round(2.0 / hs));
      for (i = 0; i < P.length; i += every) path.push([P[i][0], P[i][1]]);
      var e = P[P.length - 1];
      if (dist(path[path.length - 1], e) > 0.3) path.push([e[0], e[1]]);
      P = P.slice().reverse();
    }
    var segs = splitAtCorners(P, hs), parity = 0;
    for (var sIdx = 0; sIdx < segs.length; sIdx++) {
      var Q = extendCorners(segs[sIdx], hs, sIdx > 0, sIdx < segs.length - 1);
      var n = Q.length, last = [null, null];
      for (i = 0; i < n; i++) {
        var a = Q[Math.max(0, i - 2)], b = Q[Math.min(n - 1, i + 2)];
        var tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
        tx /= tl; ty /= tl;
        var w = Math.min(6.5, Math.max(1.0, Q[i][2])) + 2 * (s.satinPullMm ?? 0.1);
        var si = parity++ % 2, side = si === 0 ? 1 : -1;
        var c = [Q[i][0] - ty * side * w / 2, Q[i][1] + tx * side * w / 2];
        var L = last[si];
        if (L && (c[0] - L[0]) * tx + (c[1] - L[1]) * ty < 0) c = L;
        last[si] = c;
        path.push(c);
      }
    }
    return path;
  }

  // Split a resampled path where it turns sharply, so each piece gets its own satin column.
  function splitAtCorners(P, hs) {
    var n = P.length, m = Math.max(2, Math.round(1.2 / hs)), minLen = Math.max(3, Math.round(1.0 / hs));
    if (n < 2 * m + 2) return [P];
    var turn = new Float64Array(n);
    for (var i = m; i < n - m; i++) {
      var ax = P[i][0] - P[i - m][0], ay = P[i][1] - P[i - m][1];
      var bx = P[i + m][0] - P[i][0], by = P[i + m][1] - P[i][1];
      var la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la < 1e-6 || lb < 1e-6) continue;
      var cos = (ax * bx + ay * by) / (la * lb);
      turn[i] = Math.acos(Math.max(-1, Math.min(1, cos)));
    }
    var cuts = [], thr = 55 * Math.PI / 180, lastCut = 0;
    for (i = m; i < n - m; i++) {
      if (turn[i] < thr) continue;
      var isMax = true;
      for (var j = i - m; j <= i + m; j++) if (turn[j] > turn[i] || (turn[j] === turn[i] && j < i)) { isMax = false; break; }
      if (isMax && i - lastCut >= minLen && n - 1 - i >= minLen) { cuts.push(i); lastCut = i; }
    }
    if (!cuts.length) return [P];
    var segs = [], s0 = 0;
    cuts.forEach(function (c) { segs.push(P.slice(s0, c + 1)); s0 = c; });
    segs.push(P.slice(s0));
    return segs;
  }

  // Push a corner end of a piece a little past the corner so neighbouring columns overlap.
  function extendCorners(Q, hs, atStart, atEnd) {
    if (Q.length < 2) return Q;
    var out = Q.slice();
    function ext(pts, fromStart) {
      var k = Math.min(pts.length - 1, Math.max(1, Math.round(1.0 / hs)));
      var A = fromStart ? pts[0] : pts[pts.length - 1], B = fromStart ? pts[k] : pts[pts.length - 1 - k];
      var dx = A[0] - B[0], dy = A[1] - B[1], l = Math.hypot(dx, dy);
      if (l < 1e-6) return [];
      dx /= l; dy /= l;
      var e = Math.min(2.0, A[2] * 0.45), add = [];
      for (var t = hs; t <= e + 1e-9; t += hs) add.push([A[0] + dx * t, A[1] + dy * t, A[2]]);
      return add;
    }
    if (atStart) out = ext(Q, true).reverse().concat(out);
    if (atEnd) out = out.concat(ext(Q, false));
    return out;
  }

  function runPath(stroke, s) {
    var src = stroke.pts;
    if (pathLength(src) < 0.8) src = dotStroke(src, 1.2).map(function (p) { return [p[0], p[1], 0]; });
    var P = smooth(resample(src, 0.25), 3);
    var Q = resample(P, s.runLen || 2.0);
    if (Q.length < 2) return [];
    var out = [[Q[0][0], Q[0][1]]];
    for (var i = 1; i < Q.length; i++) {
      out.push([Q[i][0], Q[i][1]], [Q[i - 1][0], Q[i - 1][1]], [Q[i][0], Q[i][1]]);
    }
    return out;
  }

  function orderLines(items, start, s) {
    var left = items.slice(), paths = [], pos = start;
    while (left.length) {
      var best = null;
      for (var i = 0; i < left.length; i++) {
        var pts = left[i].pts, a = pts[0], b = pts[pts.length - 1];
        var da = pos ? dist2(pos, a) : (best ? Infinity : 0), db = pos ? dist2(pos, b) : Infinity;
        if (!best || da < best.score) best = { i: i, rev: false, score: da };
        if (db < best.score) best = { i: i, rev: true, score: db };
      }
      var st = left.splice(best.i, 1)[0];
      var stroke = best.rev ? { kind: st.kind, color: st.color, pts: st.pts.slice().reverse() } : st;
      var p = stroke.kind === 'satin' ? satinPath(stroke, s) : runPath(stroke, s);
      if (p.length) { paths.push({ pts: p, inside: null }); pos = p[p.length - 1]; }
    }
    return paths;
  }

  // ---------- connecting paths into needle moves ----------
  function segInside(a, b, fn) {
    var d = dist(a, b), n = Math.max(1, Math.ceil(d / 0.15));
    for (var i = 0; i <= n; i++) {
      var f = i / n;
      if (!fn(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)) return false;
    }
    return true;
  }

  function buildOps(paths, s) {
    var ops = [], cur = null, prev = null;
    var minStitch = 0.3, maxStitch = s.maxStitch || 7.0, tie = 0.6;
    function put(p, cmd) { ops.push([p[0], p[1], cmd]); }
    function st(p) { put(p, CMD.STITCH); if (!cur || dist(cur, p) > 1e-6) { prev = cur; cur = p; } }
    function stitchTo(p, maxLen) {
      var a = cur, d = dist(a, p);
      if (d < minStitch) return;
      var n = Math.ceil(d / maxLen);
      for (var i = 1; i <= n; i++) st([a[0] + (p[0] - a[0]) * i / n, a[1] + (p[1] - a[1]) * i / n]);
    }
    function unit(dx, dy) { var l = Math.hypot(dx, dy); return l > 1e-6 ? [dx / l, dy / l] : [1, 0]; }
    function tieIn(p, q) {
      var u = q ? unit(q[0] - p[0], q[1] - p[1]) : [1, 0];
      var t = [p[0] + u[0] * tie, p[1] + u[1] * tie];
      put(t, CMD.STITCH); put(p, CMD.STITCH); put(t, CMD.STITCH); put(p, CMD.STITCH);
    }
    function tieOff() {
      if (!cur) return;
      var u = prev ? unit(prev[0] - cur[0], prev[1] - cur[1]) : [1, 0];
      var t = [cur[0] + u[0] * tie, cur[1] + u[1] * tie];
      put(t, CMD.STITCH); put(cur, CMD.STITCH); put(t, CMD.STITCH); put(cur, CMD.STITCH);
    }
    function startAt(p, next) {
      put(p, CMD.JUMP); put(p, CMD.STITCH);
      cur = p; prev = null;
      tieIn(p, next);
    }
    for (var i = 0; i < paths.length; i++) {
      var pts = paths[i].pts;
      if (!pts.length) continue;
      var p0 = pts[0];
      var next = null;
      for (var k = 1; k < pts.length; k++) if (dist(pts[k], p0) > 0.2) { next = pts[k]; break; }
      if (!cur) startAt(p0, next);
      else {
        var d = dist(cur, p0), fn = paths[i].inside;
        var near = fn ? (d <= 0.6 || (d <= 6 && segInside(cur, p0, fn))) : d <= 1.0;
        if (near) stitchTo(p0, 3.0);
        else { tieOff(); put(cur, CMD.TRIM); startAt(p0, next); }
      }
      for (var j = 1; j < pts.length; j++) stitchTo(pts[j], maxStitch);
    }
    tieOff();
    return ops;
  }

  // ---------- design -> plan ----------
  // design: { labels: Uint8Array(GRID*GRID) of thread index (0 = empty),
  //           order: [thread...] fill order, lines: [{kind:'satin'|'run', color, pts:[[x,y,w]]}] }
  function plan(design, settings) {
    var s = {
      angle: 45, spacing: 0.4, stitchLen: 3.5, underlay: true, satinSpacing: 0.45, runLen: 2.0, maxStitch: 7.0
    };
    for (var key in settings) if (settings[key] !== undefined) s[key] = settings[key];
    var blocks = [], pos = null;
    var labels = design.labels;
    if (labels) {
      var present = {};
      for (var i = 0; i < labels.length; i++) if (labels[i]) present[labels[i]] = true;
      var order = (design.order || []).filter(function (c) { return present[c]; });
      Object.keys(present).forEach(function (c) { c = +c; if (order.indexOf(c) < 0) order.push(c); });
      order.forEach(function (c) {
        var m = new Uint8Array(GRID * GRID);
        for (var i = 0; i < m.length; i++) m[i] = labels[i] === c ? 1 : 0;
        var grown = dilate(m, GRID, GRID, 1);
        for (i = 0; i < m.length; i++) if (!m[i] && grown[i] && labels[i] !== 0) m[i] = 1;
        var paths = fillPaths(m, GRID, GRID, RES, s, pos);
        if (paths.length) {
          blocks.push({ color: c, paths: paths });
          var lp = paths[paths.length - 1].pts;
          pos = lp[lp.length - 1];
        }
      });
    }
    var lines = (design.lines || []).filter(function (l) { return l.pts && l.pts.length; });
    var lineColors = [];
    lines.forEach(function (l) { if (lineColors.indexOf(l.color) < 0) lineColors.push(l.color); });
    lineColors.forEach(function (c) {
      var paths = orderLines(lines.filter(function (l) { return l.color === c; }), pos, s);
      if (!paths.length) return;
      var lb = blocks[blocks.length - 1];
      if (lb && lb.color === c) lb.paths = lb.paths.concat(paths);
      else blocks.push({ color: c, paths: paths });
      var lp = paths[paths.length - 1].pts;
      pos = lp[lp.length - 1];
    });
    // Pre-digitized lettering paths retain their authored column/character order.
    (design.paths || []).forEach(function (p) {
      if (!p.pts.length) return;
      var previous = blocks[blocks.length - 1];
      var path = { pts: p.pts, inside: null };
      if (previous && previous.color === p.color) previous.paths.push(path);
      else blocks.push({ color: p.color, paths: [path] });
    });
    var out = blocks.map(function (b) { return { color: b.color, ops: buildOps(b.paths, s) }; });
    return { blocks: out };
  }

  function planStats(p) {
    var stitches = 0, trims = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    var perBlock = p.blocks.map(function (b) {
      var n = 0;
      b.ops.forEach(function (op) {
        if (op[2] === CMD.STITCH) {
          n++;
          if (op[0] < x0) x0 = op[0]; if (op[0] > x1) x1 = op[0];
          if (op[1] < y0) y0 = op[1]; if (op[1] > y1) y1 = op[1];
        } else if (op[2] === CMD.TRIM) trims++;
      });
      stitches += n;
      return n;
    });
    return {
      stitches: stitches, trims: trims, perBlock: perBlock,
      bounds: stitches ? [x0, y0, x1, y1] : null,
      width: stitches ? x1 - x0 : 0, height: stitches ? y1 - y0 : 0
    };
  }

  // ---------- plan -> machine stream (0.1 mm units, centred on the hoop) ----------
  function toStream(p) {
    var S = [], colors = [];
    var R = function (v) { return Math.round((v - HOOP / 2) * 10); };
    var blocks = p.blocks.filter(function (b) { return b.ops.some(function (op) { return op[2] === CMD.STITCH; }); });
    blocks.forEach(function (b, bi) {
      if (bi > 0) { var L = S[S.length - 1]; S.push([L[0], L[1], CMD.COLOR_CHANGE]); }
      colors.push(b.color);
      b.ops.forEach(function (op) {
        var X = R(op[0]), Y = R(op[1]), last = S[S.length - 1];
        if (op[2] === CMD.TRIM) { S.push([last[0], last[1], CMD.TRIM]); return; }
        if (op[2] === CMD.STITCH && last && last[2] === CMD.STITCH && last[0] === X && last[1] === Y) return;
        S.push([X, Y, op[2]]);
      });
    });
    if (S.length) { var E = S[S.length - 1]; S.push([E[0], E[1], CMD.END]); }
    return { stream: S, colors: colors };
  }

  // ---------- machine stream -> the stitch list Respira's PEN encoder takes ----------
  // Colour changes become a colour index, and the leading jump and END marker go.
  // Drop redundant points, but keep explicit trims and the start of a new colour at the same position.
  // Result rows are [x, y, command, colourIndex] in 0.1 mm, centred on the hoop.
  function toRespiraStitches(S) {
    var out = [], color = 0;
    for (var i = 0; i < S.length; i++) {
      var s = S[i];
      if (s[2] === CMD.COLOR_CHANGE) { color++; continue; }
      if (s[2] === CMD.END) continue;
      if (!out.length && s[2] !== CMD.STITCH) continue;
      var last = out[out.length - 1];
      if (s[2] !== CMD.TRIM && last && last[0] === s[0] && last[1] === s[1] && last[3] === color) continue;
      out.push([s[0], s[1], s[2] === CMD.JUMP ? 0x10 : s[2] === CMD.TRIM ? 0x20 : 0x00, color]);
    }
    return out;
  }

  // ---------- byte writer ----------
  function Buf() { this.a = []; }
  Buf.prototype.u8 = function (v) { this.a.push(v & 255); };
  Buf.prototype.i16 = function (v) { this.a.push(v & 255, (v >> 8) & 255); };
  Buf.prototype.i24 = function (v) { this.a.push(v & 255, (v >> 8) & 255, (v >> 16) & 255); };
  Buf.prototype.i32 = function (v) { this.a.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255); };
  Buf.prototype.f32 = function (v) {
    var b = new ArrayBuffer(4); new DataView(b).setFloat32(0, v, true);
    var u = new Uint8Array(b); for (var i = 0; i < 4; i++) this.a.push(u[i]);
  };
  Buf.prototype.str = function (s) { for (var i = 0; i < s.length; i++) this.a.push(s.charCodeAt(i) & 255); };
  Buf.prototype.bytes = function (arr) { for (var i = 0; i < arr.length; i++) this.a.push(arr[i] & 255); };
  Buf.prototype.pos = function () { return this.a.length; };
  Buf.prototype.at16 = function (p, v) { this.a[p] = v & 255; this.a[p + 1] = (v >> 8) & 255; };
  Buf.prototype.at24 = function (p, v) { this.a[p] = v & 255; this.a[p + 1] = (v >> 8) & 255; this.a[p + 2] = (v >> 16) & 255; };
  Buf.prototype.at32 = function (p, v) { this.a[p] = v & 255; this.a[p + 1] = (v >> 8) & 255; this.a[p + 2] = (v >> 16) & 255; this.a[p + 3] = (v >>> 24) & 255; };
  Buf.prototype.out = function () { return new Uint8Array(this.a); };

  function streamBounds(S) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i < S.length; i++) {
      var s = S[i];
      if (s[0] > x1) x1 = s[0]; if (s[0] < x0) x0 = s[0];
      if (s[1] > y1) y1 = s[1]; if (s[1] < y0) y0 = s[1];
    }
    return [x0, y0, x1, y1];
  }
  function commandBlocks(S) {
    var out = [], start = 0;
    for (var i = 1; i <= S.length; i++) {
      if (i === S.length || S[i][2] !== S[i - 1][2]) { out.push(S.slice(start, i)); start = i; }
    }
    return out;
  }
  function asciiName(name, n) {
    var s = String(name || 'Untitled').replace(/[^\x20-\x7E]/g, '');
    return (s || 'Untitled').slice(0, n);
  }
  function padEnd(s, n) { while (s.length < n) s += ' '; return s; }
  function padStart(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }

  // --- PEC section ---
  var PEC_BLANK_HEX = '000000000000f0ffffffff0f080000000010040000000020020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040040000000020080000000010f0ffffffff0f000000000000';
  function pecBlank() {
    var g = new Array(228);
    for (var i = 0; i < 228; i++) g[i] = parseInt(PEC_BLANK_HEX.substr(i * 2, 2), 16);
    return g;
  }
  function drawScaled(ext, pts, g, stride, buffer) {
    var left = ext[0], top = ext[1], right = ext[2], bottom = ext[3];
    var dw = right - left, dh = bottom - top;
    var gw = stride * 8, gh = g.length / stride;
    if (dw === 0) dw = 1; if (dh === 0) dh = 1;
    var sc = Math.min((gw - buffer) / dw, (gh - buffer) / dh);
    var cx = (right + left) / 2, cy = (bottom + top) / 2;
    var tx = -cx * sc + gw / 2, ty = -cy * sc + gh / 2;
    for (var i = 0; i < pts.length; i++) {
      var x = Math.floor(pts[i][0] * sc + tx), y = Math.floor(pts[i][1] * sc + ty);
      var idx = y * stride + Math.trunc(x / 8);
      if (idx < 0) idx += g.length;
      if (idx < 0 || idx >= g.length) continue;
      g[idx] |= 1 << (((x % 8) + 8) % 8);
    }
  }
  function pecValue(b, v, long, flag) {
    if (!long && v > -64 && v < 63) b.u8(v & 0x7f);
    else { v &= 0xfff; v |= 0x8000; v |= flag << 8; b.u8((v >> 8) & 255); b.u8(v & 255); }
  }
  function writePEC(b, S, colors, name) {
    var ext = streamBounds(S);
    b.str('LA:' + padEnd(asciiName(name, 8), 16) + '\r');
    for (var i = 0; i < 12; i++) b.u8(0x20);
    b.u8(0xff); b.u8(0x00); b.u8(6); b.u8(38);
    var count = colors.length;
    if (count) {
      for (i = 0; i < 12; i++) b.u8(0x20);
      b.u8(count - 1);
      for (i = 0; i < count; i++) b.u8(colors[i]);
    } else {
      b.bytes([0x20, 0x20, 0x20, 0x20, 0x64, 0x20, 0x00, 0x20, 0x00, 0x20, 0x20, 0x20, 0xff]);
    }
    for (i = count; i < 463; i++) b.u8(0x20);

    var start = b.pos();
    b.u8(0); b.u8(0); b.i24(0); b.u8(0x31); b.u8(0xff); b.u8(0xf0);
    b.i16(Math.round(ext[2] - ext[0])); b.i16(Math.round(ext[3] - ext[1]));
    b.i16(0x1e0); b.i16(0x1b0);
    var colorTwo = true, jumping = true, init = true, xx = 0, yy = 0;
    for (i = 0; i < S.length; i++) {
      var s = S[i], dx = Math.round(s[0] - xx), dy = Math.round(s[1] - yy), c = s[2];
      xx += dx; yy += dy;
      if (c === CMD.STITCH) {
        if (jumping) { if (dx !== 0 && dy !== 0) { pecValue(b, 0, false, 0); pecValue(b, 0, false, 0); } jumping = false; }
        pecValue(b, dx, false, 0); pecValue(b, dy, false, 0);
      } else if (c === CMD.JUMP) {
        jumping = true;
        var f = init ? 0x10 : 0x20;
        pecValue(b, dx, true, f); pecValue(b, dy, true, f);
      } else if (c === CMD.COLOR_CHANGE) {
        if (jumping) { pecValue(b, 0, false, 0); pecValue(b, 0, false, 0); jumping = false; }
        b.u8(0xfe); b.u8(0xb0); b.u8(colorTwo ? 2 : 1);
        colorTwo = !colorTwo;
      } else if (c === CMD.END) { b.u8(0xff); break; }
      init = false;
    }
    b.at24(start + 2, b.pos() - start);

    var g = pecBlank(), block = [];
    for (i = 0; i <= S.length; i++) {
      if (i < S.length && S[i][2] === CMD.STITCH) block.push(S[i]);
      else if (block.length) { drawScaled(ext, block, g, 6, 4); block = []; }
    }
    b.bytes(g);
    var cs = 0;
    var emit = function (seg) {
      var gg = pecBlank();
      drawScaled(ext, seg.filter(function (q) { return q[2] === CMD.STITCH; }), gg, 6, 5);
      b.bytes(gg);
    };
    for (i = 0; i < S.length; i++) {
      if (S[i][2] === CMD.COLOR_CHANGE) { emit(S.slice(cs, i + 1)); cs = i + 1; }
    }
    if (cs !== S.length) emit(S.slice(cs));
  }

  function writePES(S, colors, name) {
    var b = new Buf();
    b.str('#PES0001');
    var ext = streamBounds(S);
    var cx = (ext[2] + ext[0]) / 2, cy = (ext[3] + ext[1]) / 2;
    var left = ext[0] - cx, top = ext[1] - cy, right = ext[2] - cx, bottom = ext[3] - cy;
    var ph = b.pos(); b.i32(0);
    if (!S.length) { b.i16(1); b.i16(1); b.i16(0); b.i16(0); b.i16(0); }
    else {
      b.i16(1); b.i16(1); b.i16(1);
      b.i16(0xffff); b.i16(0);
      b.i16(7); b.str('CEmbOne');
      var width = right - left, height = bottom - top;
      for (var i = 0; i < 8; i++) b.i16(0);
      var tx = 350 + 1300 / 2 - width / 2;
      var ty = 100 + height + 1800 / 2 - height / 2;
      b.f32(1); b.f32(0); b.f32(0); b.f32(1); b.f32(tx); b.f32(ty);
      b.i16(1); b.i16(0); b.i16(0); b.i16(Math.trunc(width)); b.i16(Math.trunc(height));
      for (i = 0; i < 8; i++) b.u8(0);
      var phSections = b.pos(); b.i16(0);
      b.i16(0xffff); b.i16(0);
      b.i16(7); b.str('CSewSeg');
      var ax = left + cx, ay = bottom + cy;
      var ci = 0, code = colors[ci++], sx = 0, sy = 0, section = 0, log = [], prevCode = -1, flag = -1;
      commandBlocks(S).forEach(function (blk) {
        var cmd = blk[0][2], seg, fl;
        if (cmd === CMD.JUMP) {
          var l = blk[blk.length - 1];
          seg = [[sx - ax, sy - ay], [l[0] - ax, l[1] - ay]]; fl = 1;
        } else if (cmd === CMD.COLOR_CHANGE) {
          if (ci < colors.length) code = colors[ci];
          ci++;
          return;
        } else if (cmd === CMD.STITCH) {
          seg = blk.map(function (q) { sx = q[0]; sy = q[1]; return [q[0] - ax, q[1] - ay]; }); fl = 0;
        } else return;
        if (flag !== -1) b.i16(0x8003);
        if (prevCode !== code) { log.push([section, code]); prevCode = code; }
        flag = fl;
        b.i16(fl); b.i16(code); b.i16(seg.length);
        seg.forEach(function (q) { b.i16(Math.trunc(q[0])); b.i16(Math.trunc(q[1])); });
        section++;
      });
      b.i16(log.length);
      log.forEach(function (e) { b.i16(e[0]); b.i16(e[1]); });
      b.at16(phSections, section);
      b.i16(0); b.i16(0);
    }
    b.at32(ph, b.pos());
    writePEC(b, S, colors, name);
    return b.out();
  }

  // --- DST ---
  function dstRecord(x, y, flags) {
    y = -y;
    var b0 = 0, b1 = 0, b2 = 0;
    if (flags === CMD.JUMP) b2 += 128;
    if (flags === CMD.STITCH || flags === CMD.JUMP) {
      b2 += 3;
      if (x > 40) { b2 += 4; x -= 81; } if (x < -40) { b2 += 8; x += 81; }
      if (x > 13) { b1 += 4; x -= 27; } if (x < -13) { b1 += 8; x += 27; }
      if (x > 4) { b0 += 4; x -= 9; } if (x < -4) { b0 += 8; x += 9; }
      if (x > 1) { b1 += 1; x -= 3; } if (x < -1) { b1 += 2; x += 3; }
      if (x > 0) { b0 += 1; x -= 1; } if (x < 0) { b0 += 2; x += 1; }
      if (x !== 0) throw new Error('DST dx out of range');
      if (y > 40) { b2 += 32; y -= 81; } if (y < -40) { b2 += 16; y += 81; }
      if (y > 13) { b1 += 32; y -= 27; } if (y < -13) { b1 += 16; y += 27; }
      if (y > 4) { b0 += 32; y -= 9; } if (y < -4) { b0 += 16; y += 9; }
      if (y > 1) { b1 += 128; y -= 3; } if (y < -1) { b1 += 64; y += 3; }
      if (y > 0) { b0 += 128; y -= 1; } if (y < 0) { b0 += 64; y += 1; }
      if (y !== 0) throw new Error('DST dy out of range');
    } else if (flags === CMD.COLOR_CHANGE) b2 = 0xc3;
    else if (flags === CMD.END) b2 = 0xf3;
    return [b0, b1, b2];
  }
  function splitForDST(S) {
    var out = [], px = 0, py = 0;
    S.forEach(function (s) {
      var c = s[2];
      if (c === CMD.STITCH || c === CMD.JUMP) {
        var dx = s[0] - px, dy = s[1] - py, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 121));
        for (var i = 1; i < n; i++) out.push([px + Math.round(dx * i / n), py + Math.round(dy * i / n), c]);
        out.push([s[0], s[1], c]);
        px = s[0]; py = s[1];
      } else out.push([px, py, c]);
    });
    return out;
  }
  function writeDST(S0, name) {
    var S = splitForDST(S0), ext = streamBounds(S), b = new Buf();
    var colorChanges = S.filter(function (s) { return s[2] === CMD.COLOR_CHANGE; }).length;
    b.str('LA:' + padEnd(asciiName(name, 16), 16) + '\r');
    b.str('ST:' + padStart(S.length, 7) + '\r');
    b.str('CO:' + padStart(colorChanges, 3) + '\r');
    b.str('+X:' + padStart(Math.abs(ext[2]), 5) + '\r');
    b.str('-X:' + padStart(Math.abs(ext[0]), 5) + '\r');
    b.str('+Y:' + padStart(Math.abs(ext[3]), 5) + '\r');
    b.str('-Y:' + padStart(Math.abs(ext[1]), 5) + '\r');
    var ax = 0, ay = 0;
    if (S.length) { ax = Math.trunc(S[S.length - 1][0]); ay = -Math.trunc(S[S.length - 1][1]); }
    b.str((ax >= 0 ? 'AX:+' : 'AX:-') + padStart(Math.abs(ax), 5) + '\r');
    b.str((ay >= 0 ? 'AY:+' : 'AY:-') + padStart(Math.abs(ay), 5) + '\r');
    b.str('MX:+' + padStart(0, 5) + '\r');
    b.str('MY:+' + padStart(0, 5) + '\r');
    b.str('PD:******\r');
    b.u8(0x1a);
    while (b.pos() < 512) b.u8(0x20);
    var xx = 0, yy = 0;
    S.forEach(function (s) {
      var dx = Math.round(s[0] - xx), dy = Math.round(s[1] - yy), c = s[2];
      xx += dx; yy += dy;
      if (c === CMD.TRIM) {
        b.bytes(dstRecord(2, 2, CMD.JUMP));
        b.bytes(dstRecord(-4, -4, CMD.JUMP));
        b.bytes(dstRecord(2, 2, CMD.JUMP));
      } else b.bytes(dstRecord(dx, dy, c));
    });
    return b.out();
  }

  // ---------- zip (stored, no compression) ----------
  var CRC_TABLE = null;
  function crc32(u8) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        CRC_TABLE[n] = c >>> 0;
      }
    }
    var crc = 0xffffffff;
    for (var i = 0; i < u8.length; i++) crc = CRC_TABLE[(crc ^ u8[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zip(files, when) {
    var d = when || new Date();
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    var date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var b = new Buf(), central = [];
    files.forEach(function (f) {
      var name = f.name, data = f.data, crc = crc32(data), off = b.pos();
      b.i32(0x04034b50); b.i16(20); b.i16(0); b.i16(0); b.i16(time); b.i16(date);
      b.i32(crc); b.i32(data.length); b.i32(data.length); b.i16(name.length); b.i16(0);
      b.str(name); b.bytes(data);
      central.push({ name: name, crc: crc, size: data.length, off: off });
    });
    var cdStart = b.pos();
    central.forEach(function (c) {
      b.i32(0x02014b50); b.i16(20); b.i16(20); b.i16(0); b.i16(0); b.i16(time); b.i16(date);
      b.i32(c.crc); b.i32(c.size); b.i32(c.size); b.i16(c.name.length); b.i16(0); b.i16(0);
      b.i16(0); b.i16(0); b.i32(0); b.i32(c.off); b.str(c.name);
    });
    var cdSize = b.pos() - cdStart;
    b.i32(0x06054b50); b.i16(0); b.i16(0); b.i16(central.length); b.i16(central.length);
    b.i32(cdSize); b.i32(cdStart); b.i16(0);
    return b.out();
  }

  root.StitchEngine = {
    CMD: CMD, HOOP: HOOP, RES: RES, GRID: GRID, PEC: PEC,
    nearestThread: nearestThread, redMean: redMean,
    erode: erode, dilate: dilate, thinShare: thinShare, countSet: countSet,
    plan: plan, planStats: planStats, toStream: toStream,
    writePES: writePES, writeDST: writeDST, zip: zip, crc32: crc32, toRespiraStitches: toRespiraStitches,
    _internals: { fillChains: fillChains, satinPath: satinPath, runPath: runPath, resample: resample }
  };
})(holder);

export const StitchEngine = holder.StitchEngine;
