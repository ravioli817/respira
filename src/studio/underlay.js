const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
/** Sample authored rail pairs by average rail travel, with physical millimetre spacing. */
export function sampleRailPairs(pairs, step) {
  if(!Number.isFinite(step)||step<=0) throw new Error('Underlay stitch length must be positive.');
  if(pairs.length<2) return pairs.slice();
  const cumulative=[0], out=[pairs[0]];
  for(let i=1;i<pairs.length;i++) cumulative.push(cumulative.at(-1)+(distance(pairs[i-1],pairs[i])+distance(pairs[i-1].slice(2),pairs[i].slice(2)))/2);
  const total=cumulative.at(-1), n=Math.max(1,Math.ceil(total/step));
  let j=1;
  for(let i=1;i<=n;i++) {
    const d=total*i/n; while(j<cumulative.length-1&&cumulative[j]<d)j++;
    const f=(d-cumulative[j-1])/(cumulative[j]-cumulative[j-1]||1);
    out.push(pairs[j-1].map((v,k)=>v+(pairs[j][k]-v)*f));
  }
  return out;
}
function insetPair(p, inset) {
  const dx=p[2]-p[0],dy=p[3]-p[1],width=Math.hypot(dx,dy);
  // Narrow columns collapse to a center walk instead of crossing their rails.
  const f=width ? Math.min(inset/width,0.5) : 0;
  return [p[0]+dx*f,p[1]+dy*f,p[2]-dx*f,p[3]-dy*f];
}
export function columnUnderlay(pairs, {mode='center',inset=0.4,spacing=2,stitchLength=2}={}) {
  if(!pairs.length || mode==='none')return [];
  const out=[];
  function append(path, closed=false) {
    if(!path.length)return;
    const last=out.at(-1);
    if(last && closed) {
      const ring=path.slice(0,-1);let nearest=0;
      for(let i=1;i<ring.length;i++)if(distance(last,ring[i])<distance(last,ring[nearest]))nearest=i;
      path=ring.slice(nearest).concat(ring.slice(0,nearest));path.push(path[0].slice());
    } else if(last&&distance(last,path.at(-1))<distance(last,path[0]))path=path.slice().reverse();
    out.push(...path);
  }
  if(mode.includes('center')) append(sampleRailPairs(pairs,stitchLength).map(p=>[(p[0]+p[2])/2,(p[1]+p[3])/2]));
  if(mode.includes('edge')) {
    const points=sampleRailPairs(pairs,stitchLength).map(p=>insetPair(p,inset));
    const path=points.map(p=>p.slice(0,2)).concat(points.slice().reverse().map(p=>p.slice(2)));
    path.push(points[0].slice(0,2));append(path,true);
  }
  if(mode.includes('zigzag')) append(sampleRailPairs(pairs,spacing/2).map((p,i)=>insetPair(p,inset).slice(i%2?2:0,i%2?4:2)));
  return out;
}

/** Trace oriented cell edges. Each hole/island gets a separate closed path. */
export function maskContours(mask, width, height, res) {
  const edges=[], starts=new Map();
  function add(x,y,nx,ny,dir) {
    const edge={x,y,nx,ny,dir,used:false}; edges.push(edge);
    const key=y*(width+1)+x; if(!starts.has(key))starts.set(key,[]); starts.get(key).push(edge);
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mask[y*width+x]) {
    if(y===0||!mask[(y-1)*width+x])add(x,y,x+1,y,0);
    if(x===width-1||!mask[y*width+x+1])add(x+1,y,x+1,y+1,1);
    if(y===height-1||!mask[(y+1)*width+x])add(x+1,y+1,x,y+1,2);
    if(x===0||!mask[y*width+x-1])add(x,y+1,x,y,3);
  }
  const paths=[];
  for(const first of edges) {
    if(first.used)continue;
    let edge=first; const path=[[edge.x*res,edge.y*res]];
    while(edge&&!edge.used) {
      edge.used=true; path.push([edge.nx*res,edge.ny*res]);
      if(edge.nx===first.x&&edge.ny===first.y)break;
      const candidates=(starts.get(edge.ny*(width+1)+edge.nx)||[]).filter(e=>!e.used);
      const preference=[(edge.dir+1)%4,edge.dir,(edge.dir+3)%4,(edge.dir+2)%4];
      candidates.sort((a,b)=>preference.indexOf(a.dir)-preference.indexOf(b.dir));edge=candidates[0];
    }
    if(path.length>3)paths.push(path);
  }
  return paths;
}
