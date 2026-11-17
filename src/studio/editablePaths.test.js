import { describe, expect, it } from 'vitest';
import { traceLabels, drawingDesign, insideShape, simplifyLine, simplifyRing, cloneShapes } from './editablePaths.js';
import { transformDesign } from './composition.js';
const source=labels=>({labels,order:[5,2],strokes:[]});
function rect(labels,x,y,w,h,c){for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)labels[j*500+i]=c;}
function roundtrip(labels){const shapes=traceLabels(labels,[5,2]);expect(drawingDesign({...source(new Uint8Array(250000)),shapes}).labels).toEqual(labels);return shapes;}
describe('editable tracing geometry',()=>{
  it('exactly traces touching colors, holes and an island inside a hole',()=>{
    const labels=new Uint8Array(250000);rect(labels,100,100,100,100,5);rect(labels,120,120,60,60,0);rect(labels,140,140,20,20,5);rect(labels,200,100,80,100,2);
    const shapes=roundtrip(labels);expect(shapes).toHaveLength(3);expect(shapes.find(s=>s.rings.length===2)).toBeTruthy();
    expect(shapes.some(s=>insideShape([26,26],s))).toBe(false);
    expect(shapes.some(s=>insideShape([29,29],s))).toBe(true);
  });
  it('keeps diagonal islands and border cells without joining them',()=>{
    const labels=new Uint8Array(250000);labels[0]=5;labels[501]=5;labels[249999]=2;const shapes=roundtrip(labels);expect(shapes).toHaveLength(3);
    expect(shapes.every(s=>s.rings[0].length===4)).toBe(true);
  });
  it('round-trips deterministic irregular masks without changing pixels',()=>{
    const labels=new Uint8Array(250000);let seed=317;
    for(let y=200;y<220;y++)for(let x=200;x<220;x++){seed=(seed*16807)%2147483647;labels[y*500+x]=[0,5,2][seed%3];}
    roundtrip(labels);
  });
  it('preserves transformed geometry and keeps edits independent of original arrays',()=>{
    const labels=new Uint8Array(250000);rect(labels,200,200,80,60,5);const shapes=traceLabels(labels);
    const a={...source(labels),order:[5]},b={...source(new Uint8Array(250000)),shapes};const t={x:4,y:-3,scale:.8,rotation:25};
    expect(transformDesign(drawingDesign(a),t)).toEqual(transformDesign(drawingDesign(b),t));
    const copy=cloneShapes(shapes);copy[0].rings[0][0][0]+=2;expect(shapes[0].rings[0][0][0]).toBe(40);
  });
  it('supports even-odd holes, recoloring and resizing before regenerating stitches',()=>{
    const s={color:5,rings:[[[10,10],[30,10],[30,30],[10,30]],[[15,15],[15,25],[25,25],[25,15]]]};
    const src={...source(new Uint8Array(250000)),shapes:[s]};const a=drawingDesign(src);expect(a.labels[100*500+100]).toBe(0);expect(a.labels[60*500+60]).toBe(5);
    s.color=2;s.rings[0][1]=[40,10];expect(drawingDesign(src).labels[60*500+170]).toBe(2);expect(a.labels[60*500+170]).toBe(0);
  });
  it('reduces unnecessary nodes while retaining corners, endpoints and pressure changes',()=>{
    expect(simplifyLine([[0,0,2],[1,0,2],[2,0,2]],.1)).toEqual([[0,0,2],[2,0,2]]);
    expect(simplifyLine([[0,0,2],[1,0,5],[2,0,2]],.1)).toHaveLength(3);
    expect(simplifyRing([[0,0],[1,0],[2,0],[2,2],[0,2]],.1)).toHaveLength(4);
  });
  it('refuses empty and excessive traces instead of dropping regions',()=>{
    expect(()=>traceLabels(new Uint8Array(250000))).toThrow(/no filled/);
    const labels=new Uint8Array(250000);for(let y=0;y<40;y+=2)for(let x=0;x<40;x+=2)labels[y*500+x]=5;
    expect(()=>traceLabels(labels)).toThrow(/Too many/);
  });
});

it('retains shape color order after recoloring instead of appending the new thread last',()=>{
  const labels=new Uint8Array(250000);rect(labels,100,100,40,40,5);rect(labels,180,180,40,40,2);
  const shapes=traceLabels(labels,[5,2]);shapes[0].color=55;
  expect(drawingDesign({...source(new Uint8Array(250000)),shapes}).order).toEqual([55,2]);
});
