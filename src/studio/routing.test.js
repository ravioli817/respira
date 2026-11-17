import { describe, it, expect } from 'vitest';
import { StitchEngine as E } from './engine.js';
import { makeRouteZone } from './hiddenRoutes.js';
import { planWithRouting, orderDependencies } from './routing.js';
import { composePlans, transformDesign } from './composition.js';
import { sewingFigures, simplifyParts } from './simplification.js';
const settings={spacing:.4,angle:0,underlay:true};
function rect(id,color,x,y,w,h){const labels=new Uint8Array(250000);for(let yy=y*5;yy<(y+h)*5;yy++)for(let xx=x*5;xx<(x+w)*5;xx++)labels[yy*500+xx]=color;return {layer:{id,name:id,kind:'draw',visible:true,source:{}},design:{labels,order:[color],lines:[]}};}
const plans=parts=>parts.map(p=>E.plan(p.design,settings));
const pos=(order,id)=>order.indexOf(id);

describe('bounded hidden travel',()=>{
  it('routes around a hole and validates every encoded segment, without corner cutting',()=>{
    const p=rect('cover',2,5,5,60,60),m=p.design.labels.map(Boolean);
    for(let y=25*5;y<35*5;y++)for(let x=30*5;x<40*5;x++)m[y*500+x]=0;
    const zone=makeRouteZone(E.erode(m,500,500,3));
    expect(zone.segment([25,30],[45,30])).toBe(false);
    const route=zone.route([25,30],[45,30],{remaining:160000},30);
    expect(route).not.toBeNull();expect(route.length).toBeGreaterThan(10);
    for(let i=1;i<route.length;i++){expect(zone.segment(route[i-1],route[i])).toBe(true);expect(Math.hypot(route[i][0]-route[i-1][0],route[i][1]-route[i-1][1])).toBeLessThanOrEqual(2.15);}
    const tiny=new Uint8Array(250000);for(const [x,y] of [[10,10],[12,12]])for(let j=y;j<y+2;j++)for(let i=x;i<x+2;i++)tiny[j*500+i]=1;
    expect(makeRouteZone(tiny).segment([2.1,2.1],[2.5,2.5])).toBe(false);
  });
  it('refuses disconnected, outside, too-long, short non-cutting and over-budget routes',()=>{
    const p=rect('cover',2,10,10,60,30),m=p.design.labels.map(Boolean);for(let y=0;y<500;y++)for(let x=39*5;x<41*5;x++)m[y*500+x]=0;
    const zone=makeRouteZone(m);
    expect(zone.route([20,20],[50,20],{remaining:160000})).toBeNull();
    expect(zone.route([0,0],[20,20],{remaining:160000})).toBeNull();
    expect(zone.route([11,20],[37,20],{remaining:160000},10)).toBeNull();
    expect(zone.route([11,20],[14,20],{remaining:160000})).toBeNull();
    expect(zone.route([11,20],[30,20],{remaining:0})).toBeNull();
  });
  it('saves machine cuts between editable layers only beneath a later dense fill',()=>{
    const a=rect('a',5,10,10,8,8),b=rect('b',5,30,10,8,8),cover=rect('cover',2,5,5,40,20),parts=[a,b,cover];
    const base=planWithRouting(parts,settings),result=planWithRouting(parts,settings,{hiddenTravel:true});
    expect(result.routes.length).toBeGreaterThan(0);
    expect(sewingFigures(result.plan).cuts).toBeLessThan(sewingFigures(base.plan).cuts);
    expect(result.order).toEqual(['a','b','cover']);
    expect(planWithRouting([a,b],settings,{hiddenTravel:true}).plan).toEqual(composePlans(plans([a,b])));
    expect(planWithRouting([cover,a,b],settings,{hiddenTravel:true}).routes).toHaveLength(0);
    const sparse={...cover,layer:{...cover.layer,stitchSettings:{fillSpacing:2,fillAngle:0}}};
    expect(planWithRouting([a,b,sparse],settings,{hiddenTravel:true}).routes).toHaveLength(0);
  });
  it('never replaces requested lettering trims or imported needle commands',()=>{
    const cover=rect('cover',2,5,5,60,40);
    const text={layer:{id:'text',name:'Text',kind:'text',visible:true,source:{}},design:{paths:[{color:5,pts:[[15,15],[16,15]]},{color:5,trimBefore:true,pts:[[30,15],[31,15]]}]}};
    const raw={...text,layer:{...text.layer,id:'pes',kind:'stitches'},design:{rawStitches:true,paths:[{color:5,slot:0,jump:false,pts:[[15,15],[16,15]]},{color:5,slot:1,jump:true,trimBefore:true,pts:[[30,15],[31,15]]}]}};
    for(const item of [text,raw]){
      const baseline=planWithRouting([item,cover],settings);
      const result=planWithRouting([item,cover],settings,{hiddenTravel:true,optimizeOrder:true});
      expect(result.plan).toEqual(baseline.plan);
    }
  });
});
describe('overlap-preserving layer order',()=>{
  it('groups disjoint same-thread layers and lowers final cuts/stops without editing artwork',()=>{
    const parts=[rect('red1',5,10,10,8,8),rect('blue',2,50,50,8,8),rect('red2',5,25,10,8,8)];
    const saved=parts.map(p=>p.design.labels.slice()),base=planWithRouting(parts,settings),result=planWithRouting(parts,settings,{optimizeOrder:true});
    expect(result.reordered).toBe(true);expect(result.order).toHaveLength(3);
    expect(Math.abs(pos(result.order,'red1')-pos(result.order,'red2'))).toBe(1);
    expect(sewingFigures(result.plan).changes).toBeLessThan(sewingFigures(base.plan).changes);
    expect(sewingFigures(result.plan).cuts).toBeLessThanOrEqual(sewingFigures(base.plan).cuts);
    parts.forEach((p,i)=>expect(p.design.labels).toEqual(saved[i]));
    expect(planWithRouting(parts,settings,{optimizeOrder:true}).order).toEqual(result.order);
  });
  it('preserves overlapping and near-touching layers, including original covered artwork',()=>{
    const parts=[rect('bottom',5,10,10,30,30),rect('middle',2,15,15,35,35),rect('top',5,20,20,30,30)];
    const simplified=simplifyParts(parts,{removeCovered:true}).parts;
    const result=planWithRouting(simplified,settings,{optimizeOrder:true},parts);
    expect(result.order).toEqual(['bottom','middle','top']);
    const near=[rect('a',5,10,10,8,8),rect('b',2,19,10,8,8)];expect(orderDependencies(near,plans(near))[1]).toContain(0);
    const turned=parts.map((p,i)=>({...p,design:transformDesign(p.design,{x:10,y:10,scale:.8,rotation:i*15})}));
    expect(planWithRouting(turned,settings,{optimizeOrder:true}).order).toEqual(['bottom','middle','top']);
  });
  it('never moves a layer across an imported PES boundary',()=>{
    const a=rect('a',5,10,10,8,8),b=rect('b',5,70,70,8,8),raw={layer:{id:'pes',kind:'stitches',source:{}},design:{rawStitches:true,paths:[{color:2,slot:0,pts:[[50,50],[51,50]]},{color:2,slot:1,pts:[[53,50],[54,50]],jump:true,trimBefore:true}]}};
    const parts=[a,raw,b],r=planWithRouting(parts,settings,{optimizeOrder:true,hiddenTravel:true});
    expect(r.order).toEqual(['a','pes','b']);expect(r.plan).toEqual(composePlans(plans(parts)));
  });
  it('keeps default output byte-for-byte and handles empty projects',()=>{
    const parts=[rect('one',5,15,15,20,20)];expect(planWithRouting(parts,settings).plan).toEqual(composePlans(plans(parts)));
    expect(planWithRouting([],settings,{optimizeOrder:true,hiddenTravel:true})).toEqual({plan:{blocks:[]},routes:[],order:[],reordered:false});
  });
});
it('connects underlay pieces only while their dense top fill is still ahead',()=>{
  const ring=rect('ring',5,15,15,50,50);
  for(let y=30*5;y<50*5;y++)for(let x=30*5;x<50*5;x++)ring.design.labels[y*500+x]=0;
  const base=planWithRouting([ring],settings),result=planWithRouting([ring],settings,{hiddenTravel:true});
  expect(result.routes.some(r=>r.coverage==='underlay')).toBe(true);
  expect(sewingFigures(result.plan).cuts).toBeLessThan(sewingFigures(base.plan).cuts);
  for(const r of result.routes)for(const p of r.points)expect(ring.design.labels[Math.floor(p[1]*5)*500+Math.floor(p[0]*5)]).toBe(5);
});
it('does not borrow future coverage across an imported stop boundary or from hidden layers',()=>{
  const a=rect('a',5,10,10,8,8),b=rect('b',5,30,10,8,8),cover=rect('cover',2,5,5,40,20);
  const raw={layer:{id:'pes',kind:'stitches',source:{}},design:{rawStitches:true,paths:[{color:5,slot:0,pts:[[60,60],[61,60]]}]}};
  expect(planWithRouting([a,b,raw,cover],settings,{hiddenTravel:true}).routes).toHaveLength(0);
  expect(planWithRouting([a,b,{...cover,layer:{...cover.layer,visible:false}}],settings,{hiddenTravel:true}).routes).toHaveLength(0);
});
it('retains route geometry and thread stops in a PES round-trip',async()=>{
  const {parsePes,stitchFileDesign}=await import('./pesImport.js');
  const parts=[rect('a',5,10,10,8,8),rect('b',5,30,10,8,8),rect('cover',2,5,5,40,20)];
  const result=planWithRouting(parts,settings,{hiddenTravel:true,optimizeOrder:true});
  const stream=E.toStream(result.plan),pes=E.writePES(stream.stream,stream.colors,'routed');
  const read=parsePes(pes),decoded=E.toStream(E.plan(stitchFileDesign(read)));
  expect(read.slots).toEqual(stream.colors);
  // PES import centers the artwork in the hoop; compare every needle position relative to its first point.
  const relative=ops=>{const pts=ops.filter(s=>s[2]===E.CMD.STITCH);return pts.map(p=>[p[0]-pts[0][0],p[1]-pts[0][1]]);};
  expect(relative(decoded.stream)).toEqual(relative(stream.stream));
});
