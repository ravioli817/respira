// Bounded, deterministic routes through known later fill coverage. Coordinates are hoop mm.
// A cell is usable only if all four 0.2 mm artwork cells fit inside the inset cover.
const SIZE=250, CELL=.4, TOTAL=SIZE*SIZE;
const machinePoint=p=>p.map(v=>Math.round((v-50)*10)/10+50);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function makeRouteZone(mask) {
  const usable=new Uint8Array(TOTAL);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const k=y*2*500+x*2;
    usable[y*SIZE+x]=mask[k]&&mask[k+1]&&mask[k+500]&&mask[k+501]?1:0;
  }
  const index=p=>{const x=Math.floor(p[0]/CELL+1e-9),y=Math.floor(p[1]/CELL+1e-9);return x>=0&&y>=0&&x<SIZE&&y<SIZE?y*SIZE+x:-1;};
  const at=i=>[(i%SIZE+.5)*CELL,(Math.floor(i/SIZE)+.5)*CELL];
  const inside=p=>{const i=index(p);return i>=0&&usable[i]===1;};
  function segment(a,b) {
    if(!inside(a)||!inside(b))return false;
    let x=Math.floor(a[0]/CELL+1e-9),y=Math.floor(a[1]/CELL+1e-9);
    const endX=Math.floor(b[0]/CELL+1e-9),endY=Math.floor(b[1]/CELL+1e-9),dx=b[0]-a[0],dy=b[1]-a[1],sx=Math.sign(dx),sy=Math.sign(dy);
    const stepX=dx?CELL/Math.abs(dx):Infinity,stepY=dy?CELL/Math.abs(dy):Infinity;
    let tx=dx?((sx>0?x+1:x)*CELL-a[0])/dx:Infinity,ty=dy?((sy>0?y+1:y)*CELL-a[1])/dy:Infinity;
    const safe=(xx,yy)=>xx>=0&&yy>=0&&xx<SIZE&&yy<SIZE&&usable[yy*SIZE+xx];
    for(let steps=0;steps<SIZE*2+2;steps++){
      if(!safe(x,y))return false;if(x===endX&&y===endY)return true;
      if(Math.abs(tx-ty)<1e-10){if(!safe(x+sx,y)||!safe(x,y+sy))return false;x+=sx;y+=sy;tx+=stepX;ty+=stepY;}
      else if(tx<ty){x+=sx;tx+=stepX;}else{y+=sy;ty+=stepY;}
    }
    return false;
  }
  // Connected components reject impossible routes without searching every island.
  const component=new Int32Array(TOTAL), queue=new Int32Array(TOTAL);let id=0;
  const neighbors=i=>[i%SIZE?i-1:-1,i%SIZE<SIZE-1?i+1:-1,i>=SIZE?i-SIZE:-1,i<TOTAL-SIZE?i+SIZE:-1];
  for(let i=0;i<TOTAL;i++)if(usable[i]&&!component[i]){let head=0,end=1;queue[0]=i;component[i]=++id;while(head<end){for(const n of neighbors(queue[head++]))if(n>=0&&usable[n]&&!component[n]){component[n]=id;queue[end++]=n;}}}
  function route(from,to,budget,maxLength=30) {
    const a=machinePoint(from),b=machinePoint(to),start=index(a),goal=index(b);
    if(distance(a,b)<=5.1 || distance(a,b)>maxLength || !inside(a)||!inside(b)||component[start]!==component[goal] || budget.remaining<=0)return null;
    let path;
    if(segment(a,b))path=[a,b];
    else {
      const cost=new Float64Array(TOTAL).fill(Infinity),parent=new Int32Array(TOTAL).fill(-1),heap=[];
      const score=i=>Math.hypot(i%SIZE-goal%SIZE,Math.floor(i/SIZE)-Math.floor(goal/SIZE))*CELL;
      const less=(a,b)=>a.f<b.f||(a.f===b.f&&a.i<b.i);
      function push(entry){heap.push(entry);let n=heap.length-1;while(n){const p=(n-1)>>1;if(!less(heap[n],heap[p]))break;[heap[n],heap[p]]=[heap[p],heap[n]];n=p;}}
      function pop(){const first=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let n=0;while(n*2+1<heap.length){let child=n*2+1;if(child+1<heap.length&&less(heap[child+1],heap[child]))child++;if(!less(heap[child],heap[n]))break;[heap[n],heap[child]]=[heap[child],heap[n]];n=child;}}return first;}
      cost[start]=0;push({i:start,g:0,f:score(start)});let searched=0,found=false;
      while(heap.length&&searched<12000&&budget.remaining>0){const node=pop();if(node.g!==cost[node.i])continue;searched++;budget.remaining--;if(node.i===goal){found=true;break;}
        for(const n of neighbors(node.i))if(n>=0&&usable[n]){const g=node.g+CELL,h=score(n);if(g+h>maxLength*1.45||g>=cost[n])continue;cost[n]=g;parent[n]=node.i;push({i:n,g,f:g+h});}
      }
      if(!found)return null;
      const cells=[];for(let i=goal;i!==-1;i=parent[i])cells.push(at(i));cells.reverse();
      const raw=[a,...cells,b];path=[a];let i=0;
      // Visibility shortcuts are checked against the same safe zone, including holes.
      while(i<raw.length-1){let j=raw.length-1;while(j>i+1&&!segment(raw[i],raw[j]))j--;path.push(raw[j]);i=j;}
    }
    const out=[a];
    for(let i=1;i<path.length;i++){
      const last=out.at(-1),p=path[i],n=Math.max(1,Math.ceil(distance(last,p)/2));
      for(let j=1;j<=n;j++){const q=machinePoint([last[0]+(p[0]-last[0])*j/n,last[1]+(p[1]-last[1])*j/n]);if(distance(out.at(-1),q)>1e-8)out.push(q);}
    }
    let length=0;for(let i=1;i<out.length;i++){if(!segment(out[i-1],out[i]))return null;length+=distance(out[i-1],out[i]);}
    return length<=maxLength?out:null;
  }
  return {route,inside,segment};
}
