import { StitchEngine as E } from './engine.js';
export const identityTransform = () => ({x:0,y:0,scale:1,rotation:0});
export function transformPoint(p,t,inverse=false) {
  const a=t.rotation*Math.PI/180, c=Math.cos(a), s=Math.sin(a);
  if(inverse) {const x=p[0]-50-t.x,y=p[1]-50-t.y;return [50+(x*c+y*s)/t.scale,50+(-x*s+y*c)/t.scale];}
  const x=(p[0]-50)*t.scale,y=(p[1]-50)*t.scale;
  return [50+x*c-y*s+t.x,50+x*s+y*c+t.y];
}
export function transformDesign(design,t) {
  const labels=new Uint8Array(250000), input=design.labels;
  if(input && input.some(Boolean)) {
    // Refuse cropped content rather than silently exporting a partial layer.
    for(let i=0;i<input.length;i++) if(input[i]) {
      const p=transformPoint([(i%500+0.5)*0.2,(Math.floor(i/500)+0.5)*0.2],t);
      if(p[0]<0 || p[1]<0 || p[0]>100 || p[1]>100) throw new Error('A layer extends outside the hoop. Move it inward or reduce its size.');
    }
    for(let y=0;y<500;y++) for(let x=0;x<500;x++) {
      const p=transformPoint([(x+0.5)*0.2,(y+0.5)*0.2],t,true), sx=Math.floor(p[0]/0.2),sy=Math.floor(p[1]/0.2);
      if(sx>=0&&sy>=0&&sx<500&&sy<500) labels[y*500+x]=input[sy*500+sx];
    }
  }
  return {labels,order:design.order || [],lines:(design.lines || []).map(line=>({...line,pts:line.pts.map(p=>[...transformPoint(p,t),(p[2]||0)*t.scale])})),paths:(design.paths||[]).map(path=>({...path,pts:path.pts.map(p=>transformPoint(p,t))}))};
}
/** Preserve layer order. Only adjacent same-thread blocks can share a color stop. */
export function composePlans(plans) {
  const blocks=[];
  for(const plan of plans) for(const block of plan.blocks) {
    const previous=blocks.at(-1);
    if(previous?.color===block.color) {const end=previous.ops.at(-1); previous.ops.push([end[0],end[1],E.CMD.TRIM],...block.ops);}
    else blocks.push({color:block.color,ops:block.ops.slice()});
  }
  return {blocks};
}
