import { StitchEngine as E } from './engine.js';
import { maskContours } from './underlay.js';

export const MAX_SHAPES = 300;
export const MAX_VECTOR_POINTS = 20000;
export const MAX_RING_POINTS = 4000;
export const shapePointCount = shapes => (shapes||[]).reduce((n,s)=>n+s.rings.reduce((m,r)=>m+r.length,0),0);
export const area = ring => ring.reduce((n,p,i)=>{const q=ring[(i+1)%ring.length];return n+p[0]*q[1]-q[0]*p[1];},0)/2;
export function insideRing(p,ring) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function insideShape(p,shape) { return shape.rings.reduce((v,r)=>v!==insideRing(p,r),false); }
export function segmentDistance(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;
  const t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
// Iterative Douglas-Peucker: preserves endpoints and width samples for open strokes.
export function simplifyLine(points,tolerance) {
  if(points.length<3)return points.map(p=>p.slice());
  const keep=new Set([0,points.length-1]), stack=[[0,points.length-1]];
  let work=0;
  while(stack.length) {
    const [a,b]=stack.pop();let far=-1,d=tolerance;
    for(let i=a+1;i<b;i++){if(++work>2000000)throw new Error('This line is too complex to simplify at once. Try editing a shorter line.');let v=segmentDistance(points[i],points[a],points[b]);
      if(points[i].length>2){const dx=points[b][0]-points[a][0],dy=points[b][1]-points[a][1],len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((points[i][0]-points[a][0])*dx+(points[i][1]-points[a][1])*dy)/len)):0;v=Math.max(v,Math.abs(points[i][2]-(points[a][2]+t*(points[b][2]-points[a][2])))/2);}if(v>d){d=v;far=i;}}
    if(far>=0){keep.add(far);stack.push([a,far],[far,b]);}
  }
  return [...keep].sort((a,b)=>a-b).map(i=>points[i].slice());
}
export function simplifyRing(ring,tolerance) {
  if(ring.length<=3)return ring.map(p=>p.slice());
  let split=1;
  for(let i=2;i<ring.length;i++)if(Math.hypot(...ring[i].map((v,k)=>v-ring[0][k]))>Math.hypot(...ring[split].map((v,k)=>v-ring[0][k])))split=i;
  const result=simplifyLine(ring.slice(0,split+1),tolerance).slice(0,-1).concat(simplifyLine(ring.slice(split).concat([ring[0]]),tolerance).slice(0,-1));
  return result.length>=3 && Math.sign(area(result))===Math.sign(area(ring)) ? result : ring.map(p=>p.slice());
}
function corners(path) {
  const ring=path.slice(0,-1);
  return ring.filter((p,i)=>{
    const a=ring[(i+ring.length-1)%ring.length], b=ring[(i+1)%ring.length];
    return Math.abs((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]))>1e-9;
  });
}
/** Exact boundaries of processed picture regions, keeping each island and its holes together. */
export function traceLabels(labels,order=[]) {
  const present=new Set(labels);present.delete(0);
  const colors=[...new Set(order.concat([...present]))].filter(c=>present.has(c));
  const shapes=[];
  let count=0;
  for(const color of colors) {
    let edges=0;for(let y=0;y<E.GRID;y++)for(let x=0;x<E.GRID;x++){const i=y*E.GRID+x;if(labels[i]!==color)continue;edges+=+(x===0||labels[i-1]!==color)+ +(x===E.GRID-1||labels[i+1]!==color)+ +(y===0||labels[i-E.GRID]!==color)+ +(y===E.GRID-1||labels[i+E.GRID]!==color);if(edges>100000)throw new Error('This picture has too much edge detail. Use more cleanup or a smaller picture.');}
    const rings=maskContours(labels.map(c=>c===color?1:0),E.GRID,E.GRID,E.RES).map(corners);
    const outer=rings.filter(r=>area(r)>0).map(r=>({color,rings:[r]}));
    for(const hole of rings.filter(r=>area(r)<0)) {
      // Sample just inside this hole (left of its first oriented edge).
      const a=hole[0],b=hole[1],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
      const sample=[(a[0]+b[0])/2+dy/length*1e-5,(a[1]+b[1])/2-dx/length*1e-5];
      const parent=outer.filter(s=>insideRing(sample,s.rings[0])).sort((a,b)=>area(a.rings[0])-area(b.rings[0]))[0];
      if(!parent)throw new Error('This outline could not be traced. Try more picture cleanup.');
      parent.rings.push(hole);
    }
    for(const shape of outer) {
      for(const ring of shape.rings){count+=ring.length;if(ring.length>MAX_RING_POINTS)throw new Error('This outline has too many points. Use more picture cleanup or a smaller picture.');}
      shapes.push(shape);
    }
    if(shapes.length>MAX_SHAPES || count>MAX_VECTOR_POINTS)throw new Error('Too many small shapes to edit. Use fewer picture colors, more cleanup or a smaller picture.');
  }
  if(!shapes.length)throw new Error('There are no filled regions to trace. Include a picture color first.');
  return shapes;
}
/** Even-odd scan conversion at cell centers; holes stay empty rather than painting the background. */
export function paintShape(labels,shape) {
  const rows=Array.from({length:E.GRID},()=>[]);
  for(const ring of shape.rings)for(let i=0;i<ring.length;i++) {
    const a=ring[i],b=ring[(i+1)%ring.length];if(a[1]===b[1])continue;
    const lo=Math.max(0,Math.ceil(Math.min(a[1],b[1])/E.RES-.5));
    const hi=Math.min(E.GRID,Math.ceil(Math.max(a[1],b[1])/E.RES-.5));
    for(let y=lo;y<hi;y++){const yy=(y+.5)*E.RES;rows[y].push(a[0]+(yy-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
  }
  rows.forEach((xs,y)=>{
    xs.sort((a,b)=>a-b);
    for(let i=0;i+1<xs.length;i+=2) {
      const a=Math.max(0,Math.ceil(xs[i]/E.RES-.5-1e-9)), b=Math.min(E.GRID,Math.ceil(xs[i+1]/E.RES-.5-1e-9));
      labels.fill(shape.color,y*E.GRID+a,y*E.GRID+b);
    }
  });
}
export function drawingDesign(source) {
  if(!source.shapes?.length)return {labels:source.labels,order:source.order,lines:source.strokes};
  const labels=source.labels.slice();
  for(const shape of source.shapes)paintShape(labels,shape);
  return {labels,order:[...new Set((source.labels.some(Boolean)?source.order:[]).concat(source.shapes.map(s=>s.color)))],lines:source.strokes};
}
export function cloneShapes(shapes=[]) { return shapes.map(s=>({...s,rings:s.rings.map(r=>r.map(p=>p.slice()))})); }
