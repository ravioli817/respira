// Reading the stitches out of a Brother embroidery file (.pes, or the bare .pec inside one), so a
// bought or saved design can sit on the canvas as a layer beside drawings, pictures and text.
//
// Only the PEC part of the file is read: it is the part every Brother machine sews from, it is in
// every PES version, and it holds finished stitches (0.1 mm steps), the thread for each colour stop
// and where the thread is cut. The PES part in front of it is the design program's own editable
// data, which this app has no use for.

/** Where the stitches start, counted from the start of the PEC part. */
var STITCHES_AT = 532;
/** The hoop, in millimetres. */
var HOOP = 100;

function fail(message) { throw new Error(message); }

/**
 * @param {Uint8Array} bytes the file
 * @returns {{ slots: number[], paths: Array<{ slot: number, pts: number[][], jump: boolean, trimBefore: boolean }>, stitches: number, width: number, height: number }}
 *   `slots` are thread numbers in the machine's palette (1 to 63), one per colour stop in sewing
 *   order; each path is one unbroken run of stitches in hoop millimetres, the design centred on the
 *   middle of the hoop (50, 50). `width` and `height` are the design's size in millimetres.
 */
export function parsePes(bytes) {
  if (!bytes || bytes.length < 16) fail('That file is too short to be an embroidery file.');
  var magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  var pec;
  if (magic === '#PES') pec = (bytes[8] | (bytes[9] << 8) | (bytes[10] << 16) | (bytes[11] << 24)) >>> 0;
  else if (magic === '#PEC') pec = 8;
  else fail('That is not a Brother .pes file.');
  if (!pec || pec + STITCHES_AT >= bytes.length) fail('That .pes file has no stitches in it.');

  var count = bytes[pec + 48] + 1, slots = [];
  for (var i = 0; i < count; i++) {
    var thread = bytes[pec + 49 + i];
    // 64 is "Applique", a placement marker rather than a thread; anything out of range is shown as black.
    slots.push(thread >= 1 && thread <= 63 ? thread : thread === 64 ? 29 : 20);
  }

  var lengthAt=pec+514;
  var blockEnd=pec+512+(bytes[lengthAt]|(bytes[lengthAt+1]<<8)|(bytes[lengthAt+2]<<16));
  if(blockEnd<=pec+STITCHES_AT || blockEnd>bytes.length)fail('That .pes file has incomplete stitch data.');
  var ended=false;
  var pos = pec + STITCHES_AT, x = 0, y = 0, slot = 0, paths = [], run = null, stitches = 0;
  function coordinate() {
    if(pos >= blockEnd) fail("That .pes file has incomplete stitch data.");
    var a = bytes[pos], value, flags = 0;
    if (a & 0x80) {
      // Two bytes: a 12-bit signed step, with "jump" and "cut the thread" marked in the first byte.
      if(pos+1 >= blockEnd) fail("That .pes file has incomplete stitch data.");
      flags = a & 0x30;
      value = ((a & 0x0f) << 8) | bytes[pos + 1];
      if (value & 0x800) value -= 0x1000;
      pos += 2;
    } else {
      value = a >= 0x40 ? a - 0x80 : a;
      pos += 1;
    }
    return [value, flags];
  }
  while (pos < blockEnd) {
    if (bytes[pos] === 0xff) { ended=true; break; }                                    // end of the design
    if (bytes[pos] === 0xfe && bytes[pos + 1] === 0xb0) {               // thread change
      if(pos+2 >= blockEnd || slot+1 >= slots.length) fail("That .pes file has an invalid thread stop.");
      pos += 3; slot++; run = null;
      continue;
    }
    var dx = coordinate(); if (pos >= blockEnd) break;
    var dy = coordinate();
    x += dx[0]; y += dy[0];
    var point = [x / 10, y / 10];
    if (dx[1] || dy[1]) {
      // A jump or a cut: the needle travels here without sewing, and the next run starts from here.
      run = { slot: slot, pts: [point], jump: true, trimBefore: !!((dx[1]|dy[1]) & 0x20) };
      paths.push(run);
    } else {
      if (!run) { run = { slot: slot, pts: [], jump: false, trimBefore: false }; paths.push(run); }
      run.pts.push(point);
      stitches++;
    }
  }
  if(!ended)fail('That .pes file has incomplete stitch data.');
  // Keep single needle points and consecutive jumps as well as complete runs.
  if (!stitches) fail('That .pes file has no stitches in it.');

  // An empty color stop has no needle position for the machine's stop/lock sequence.
  // Refuse it rather than silently discarding a material-placement stop.
  for (var used=0;used<=slot;used++) if(!paths.some(function(p){return p.slot===used && p.pts.length>(p.jump?1:0);})) fail('That .pes file contains an empty thread section. Remove empty stops in the source design first.');
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  paths.forEach(function (path) {
    path.pts.forEach(function (p) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    });
  });
  var width = x1 - x0, height = y1 - y0;
  var shiftX = HOOP / 2 - (x0 + x1) / 2, shiftY = HOOP / 2 - (y0 + y1) / 2;
  paths.forEach(function (path) {
    path.pts = path.pts.map(function (p) { return [+(p[0] + shiftX).toFixed(2), +(p[1] + shiftY).toFixed(2)]; });
  });
  return { slots: slots, paths: paths, stitches: stitches, width: width, height: height };
}

/** Keep imported runs distinct from generated lettering paths. */
export function stitchFileDesign(source) {
  return { rawStitches: true, paths: source.paths.map(path => ({
    ...path, color: source.slots[path.slot],
  })) };
}
