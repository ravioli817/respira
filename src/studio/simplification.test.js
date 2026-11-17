import { describe, it, expect } from 'vitest';
import { StitchEngine as E } from './engine.js';
import { simplifyParts, sewingFigures } from './simplification.js';
import { transformDesign, identityTransform, composePlans } from './composition.js';

function rect(id, color, x0, y0, x1, y1, kind='draw') {
  const labels=new Uint8Array(E.GRID*E.GRID);
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)labels[y*E.GRID+x]=color;
  return {layer:{id,name:id,kind,visible:true},design:{labels,order:[color],lines:[]}};
}
const at=(p,x,y)=>p.design.labels[y*E.GRID+x];
const plan=parts=>composePlans(parts.map(p=>E.plan(p.design,{spacing:0.4,angle:45,underlay:true})));
describe('reversible final-size simplification',()=>{
  it('removes only covered interior, retains the margin and original artwork',()=>{
    const bottom=rect('base',5,50,50,150,150), top=rect('top',2,75,75,125,125);
    const result=simplifyParts([bottom,top],{removeCovered:true,overlapMm:0.6});
    expect(at(result.parts[0],100,100)).toBe(0);
    expect(at(result.parts[0],77,100)).toBe(5);
    expect(at(result.parts[0],78,100)).toBe(0);
    expect(at(bottom,100,100)).toBe(5);
    // Leaving out what is hidden is the normal case: no notice unless nothing is left.
    expect(result.issues).toEqual([]);
    expect(simplifyParts([bottom,top]).parts[0].design.labels).toEqual(bottom.design.labels);
    // A hole can add cuts/locks even as fill area shrinks: report the actual encoded result.
    expect(sewingFigures(plan(result.parts)).stitches).toBeGreaterThan(0);
    const cover=rect('cover',2,40,40,160,160);
    const covered=simplifyParts([bottom,cover],{removeCovered:true});
    expect(sewingFigures(plan(covered.parts)).stitches).toBeLessThan(sewingFigures(plan([bottom,cover])).stitches);
    expect(covered.issues[0].message).toContain('all of its fill is hidden');
  });
  it('respects holes, hidden layers, sewing order and transformed artwork',()=>{
    const base=rect('base',5,50,50,150,150), top=rect('top',2,75,75,125,125);
    top.design.labels[100*E.GRID+100]=0;
    const r=simplifyParts([base,top],{removeCovered:true});
    expect(at(r.parts[0],100,100)).toBe(5);
    expect(at(r.parts[0],98,100)).toBe(5);
    expect(at(r.parts[0],90,90)).toBe(0);
    expect(simplifyParts([base,{...top,layer:{...top.layer,visible:false}}],{removeCovered:true}).parts[0].design.labels).toEqual(base.design.labels);
    expect(simplifyParts([top,base],{removeCovered:true}).parts[1].design.labels).toEqual(base.design.labels);
    const moved={...top,design:transformDesign(top.design,{...identityTransform(),x:30,rotation:30})};
    expect(simplifyParts([base,moved],{removeCovered:true}).parts[0].design.labels).toEqual(base.design.labels);
  });
  it('does not infer coverage from satin or imported needle points',()=>{
    const base=rect('base',5,50,50,150,150);
    const raw={layer:{id:'pes',kind:'stitches'},design:{rawStitches:true,paths:[{color:2,slot:0,trimBefore:true,jump:true,pts:[[10,10],[30,30]]}]}};
    const line={layer:{id:'line',kind:'draw'},design:{lines:[{kind:'satin',color:2,pts:[[10,20,6],[30,20,6]]}]}};
    const result=simplifyParts([base,raw,line],{removeCovered:true,minAreaMm2:10,maxColors:1});
    expect(result.parts[0].design.labels).toEqual(base.design.labels);
    expect(result.parts[1].design).toBe(raw.design);
  });
  it('cleans tiny islands before using them as cover and protects lettering',()=>{
    const base=rect('base',5,50,50,150,150), tiny=rect('tiny',2,90,90,95,95), text=rect('text',2,90,90,95,95,'text');
    const result=simplifyParts([base,tiny],{removeCovered:true,minAreaMm2:2});
    expect(E.countSet(result.parts[1].design.labels)).toBe(0);
    expect(result.parts[0].design.labels).toEqual(base.design.labels);
    expect(result.issues[0].message).toContain('1 tiny bit of fill');
    expect(simplifyParts([text],{minAreaMm2:2}).parts[0].design.labels).toEqual(text.design.labels);
  });
  it('combines into existing threads, preserving cuts, authored paths and source colors',()=>{
    const a=rect('large',47,50,50,150,150), b=rect('small',34,200,200,210,210);
    b.design.paths=[{color:34,trimBefore:true,pts:[[40,40],[41,41]]}];
    const result=simplifyParts([a,b],{maxColors:1});
    expect(at(result.parts[1],205,205)).toBe(47);
    expect(result.parts[1].design.paths[0]).toEqual({...b.design.paths[0],color:47});
    expect(b.design.paths[0].color).toBe(34);
    expect(at(b,205,205)).toBe(34);
    expect(sewingFigures(plan(result.parts)).threads).toBe(1);
  });
  it('reports final machine locks and same-color stop boundaries, and handles empty plans',()=>{
    expect(sewingFigures({blocks:[]})).toEqual({threads:0,changes:0,stitches:0,cuts:0,minutes:0});
    const p={blocks:[{color:5,ops:[[10,10,E.CMD.JUMP],[10,10,E.CMD.STITCH],[11,10,E.CMD.STITCH]]},{color:5,forceColorChange:true,ops:[[12,10,E.CMD.JUMP],[12,10,E.CMD.STITCH],[13,10,E.CMD.STITCH]]}]};
    const f=sewingFigures(p);expect(f.threads).toBe(1);expect(f.changes).toBe(1);expect(f.cuts).toBeGreaterThan(0);expect(f.stitches).toBeGreaterThan(4);
  });
});
