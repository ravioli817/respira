import { StitchEngine as E } from './engine.js';
import { composePlans } from './composition.js';
import { designBounds } from './selection.js';
import { engineSettings } from './stitchSettings.js';
import { sewingFigures } from './simplification.js';
import { makeRouteZone } from './hiddenRoutes.js';

const sewn=plan=>plan.blocks.some(b=>b.ops.some(p=>p[2]===E.CMD.STITCH));
const first=plan=>plan.blocks.find(b=>b.ops.some(p=>p[2]===E.CMD.STITCH));
const last=plan=>plan.blocks.findLast(b=>b.ops.some(p=>p[2]===E.CMD.STITCH));
const needle=(block,end=false)=>end?block?.ops.findLast(p=>p[2]===E.CMD.STITCH):block?.ops.find(p=>p[2]===E.CMD.STITCH);
const dist=(a,b)=>a&&b?Math.hypot(a[0]-b[0],a[1]-b[1]):0;
function bounds(part,plan) {
  const a=designBounds(part.design), b=E.planStats(plan).bounds;
  if(!a)return b;if(!b)return a;
  return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];
}
// A 1 mm guard includes generated pull/locks and gives near-touching artwork a fixed order.
function overlap(a,b) { return a&&b&&a[0]<=b[2]+2&&b[0]<=a[2]+2&&a[1]<=b[3]+2&&b[1]<=a[3]+2; }
export function orderDependencies(parts,plans,original=parts) {
  const originals=new Map(original.map(p=>[p.layer.id,p]));
  const boxes=parts.map((p,i)=>bounds(originals.get(p.layer.id)||p,plans[i]));
  return parts.map((p,i)=>parts.flatMap((q,j)=>j<i&&(p.design.rawStitches||q.design.rawStitches||overlap(boxes[j],boxes[i]))?[j]:[]));
}
function orderScore(order,plans) {
  let tail=null,changes=0,long=0,travel=0;
  for(const i of order){const head=first(plans[i]);if(!head)continue;
    if(tail){if(tail.color!==head.color||head.forceColorChange)changes++;const d=dist(needle(tail,true),needle(head));long+=+(d>5);travel+=d;}
    changes+=Math.max(0,plans[i].blocks.filter(b=>b.ops.some(p=>p[2]===E.CMD.STITCH)).length-1);tail=last(plans[i]);
  }
  return [changes,long,travel,order.reduce((n,i,j)=>n+Math.abs(i-j),0)];
}
const better=(a,b)=>{for(let i=0;i<a.length;i++){if(Math.abs(a[i]-b[i])>1e-7)return a[i]<b[i];}return false;};
/** Stable topological heuristics, trying each allowed first layer. Never split a layer. */
export function chooseLayerOrder(parts,plans,original=parts) {
  const dependencies=orderDependencies(parts,plans,original),base=parts.map((_,i)=>i);
  let best=base,score=orderScore(base,plans);
  const roots=base.filter(i=>!dependencies[i].length);
  for(const root of roots){const order=[root],used=new Set(order);
    while(order.length<parts.length){const tail=last(plans[order.findLast(i=>sewn(plans[i]))]||{blocks:[]});
      const available=base.filter(i=>!used.has(i)&&dependencies[i].every(j=>used.has(j)));
      available.sort((a,b)=>{
        const fa=first(plans[a]),fb=first(plans[b]);
        const match=x=>tail&&x&&tail.color===x.color&&!x.forceColorChange?0:1;
        return match(fa)-match(fb)||dist(needle(tail,true),needle(fa))-dist(needle(tail,true),needle(fb))||a-b;
      });
      const i=available[0];order.push(i);used.add(i);
    }
    const candidate=orderScore(order,plans);if(better(candidate,score)){best=order;score=candidate;}
  }
  return best;
}
function noWorse(a,b) { return a.cuts<=b.cuts&&a.changes<=b.changes; }
function improved(a,b) { return noWorse(a,b)&&(a.cuts<b.cuts||a.changes<b.changes); }

/** Plan from derived artwork; original parts establish overlap constraints before fill removal. */
export function planWithRouting(parts,settings,options={},original=parts) {
  parts=parts.filter(p=>p.layer.visible!==false);
  const plans=parts.map(p=>E.plan(p.design,engineSettings(p.layer,settings)));
  const base=composePlans(plans),natural=parts.map((_,i)=>i);
  let order=natural,ordered=base,baseFigures;
  if(options.optimizeOrder){
    const proposed=chooseLayerOrder(parts,plans,original);
    if(proposed.some((v,i)=>v!==i)){
      const candidate=composePlans(proposed.map(i=>plans[i]));baseFigures=sewingFigures(base);
      if(improved(sewingFigures(candidate),baseFigures)){order=proposed;ordered=candidate;}
    }
  }
  let plan=ordered,routes=[];
  if(options.hiddenTravel){
    const budget={remaining:160000},events=[],future=new Uint8Array(E.GRID*E.GRID),safeByLayer=new Map();
    // Coverage comes only from retained dense fills, in the proposed actual sewing order.
    for(let n=order.length-1;n>=0;n--){const i=order[n],p=parts[i];safeByLayer.set(i,future.slice());
      if(p.design.rawStitches){future.fill(0);continue;}
      const s=engineSettings(p.layer,settings);
      if(!p.design.rawStitches&&s.spacing<=.45&&p.design.labels)for(let j=0;j<future.length;j++)if(p.design.labels[j])future[j]=1;
    }
    const routers=new Map();let attempts=0,zones=0;
    for(const i of order){const later=E.erode(safeByLayer.get(i),E.GRID,E.GRID,3),cache=new Map();
      routers.set(i,(a,b,own=null,toLayerId=parts[i].layer.id)=>{
        if(events.length>=128||budget.remaining<=0||dist(a,b)<=5.1||attempts++>=256)return null;
        const key=own||null;let zone=cache.get(key);
        if(!zone){if(zones++>=32)return null;const inner=own?E.erode(own,E.GRID,E.GRID,1):null;const cover=inner?later.map((v,j)=>v||inner[j]?1:0):later;zone=makeRouteZone(cover);cache.set(key,zone);}
        const points=zone.route(a,b,budget,30);
        if(points)events.push({points,coverage:own?'underlay':'later fill',fromLayerId:parts[i].layer.id,toLayerId});return points;
      });
    }
    const routed=order.map(i=>({i,plan:parts[i].design.rawStitches?plans[i]:E.plan(parts[i].design,{...engineSettings(parts[i].layer,settings),routeTravel:routers.get(i)})}));
    const blocks=[];let previousLayer=null;
    for(const {i,plan:layerPlan} of routed){for(let bi=0;bi<layerPlan.blocks.length;bi++){
      const block=layerPlan.blocks[bi],prev=blocks.at(-1),ops=block.ops;
      if(prev?.color===block.color&&!block.forceColorChange){
        const end=prev.ops.at(-1),head=ops[0];let connection=null;
        // Only a boundary between two editable layers; never replace an authored PES move/stop.
        if(bi===0&&previousLayer!==null&&!parts[previousLayer].design.rawStitches&&!parts[i].design.rawStitches&&head?.[2]===E.CMD.JUMP&&!ops.some(p=>p[2]===E.CMD.TRIM&&p[3]===1)){
          connection=routers.get(previousLayer)(end,head,null,parts[i].layer.id);
        }
        if(connection)prev.ops.push(...connection.slice(1).map(p=>[p[0],p[1],E.CMD.STITCH]),...ops.slice(1));
        else prev.ops.push([end[0],end[1],E.CMD.TRIM],...ops);
      } else blocks.push({...block,ops:ops.slice()});
    }if(sewn(layerPlan))previousLayer=i;}
    const candidate={blocks},before=sewingFigures(ordered),after=sewingFigures(candidate);
    // An opt-in route must actually save machine cuts, not just remove an engine TRIM marker.
    if(events.length&&after.cuts<before.cuts&&noWorse(after,before)){plan=candidate;routes=events;}
  }
  return {plan,routes,order:order.filter(i=>sewn(plans[i])).map(i=>parts[i].layer.id),reordered:order.some((i,n)=>i!==n)};
}
