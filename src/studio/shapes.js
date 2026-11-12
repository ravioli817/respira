/** Closed preset contours in hoop millimetres. Insets include the outline width. */
export function shapePoints(kind, width, height, cx = 50, cy = 50, inset = 0) {
  if (![width, height, cx, cy, inset].every(Number.isFinite) || width < 2 || height < 2 || width > 98 || height > 98 || inset < 0 || inset > 4) throw new Error('Choose a shape size between 2 and 98 mm.');
  if (cx - width / 2 - inset < 0 || cx + width / 2 + inset > 100 || cy - height / 2 - inset < 0 || cy + height / 2 + inset > 100) throw new Error('This shape would cross the hoop edge. Reduce its size or move it inward.');
  let points;
  if (kind === 'rectangle') points = [[-1,-1],[1,-1],[1,1],[-1,1]];
  else if (kind === 'triangle') points = [[0,-1],[1,1],[-1,1]];
  else if (kind === 'star') points = Array.from({length: 10}, (_,i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.45 : 1; return [Math.cos(a)*r, Math.sin(a)*r]; });
  else if (kind === 'ellipse') points = Array.from({length: 120}, (_,i) => [Math.cos(i*Math.PI/60),Math.sin(i*Math.PI/60)]);
  else if (kind === 'heart') points = Array.from({length: 120}, (_,i) => { const a=i*Math.PI/60; return [Math.pow(Math.sin(a),3), -(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a))/17]; });
  else throw new Error('Choose a preset shape.');
  // Normalize every contour so width/height describe its actual bounds.
  const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  const out=points.map(p=>[cx+((p[0]-minX)/(maxX-minX)-0.5)*width,cy+((p[1]-minY)/(maxY-minY)-0.5)*height]);
  out.push(out[0].slice());
  return out;
}
