function segmentDistance(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],squared=dx*dx+dy*dy;
  const t=squared?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/squared)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
/** Pick the topmost visible stitched object. Empty hoop space never starts a move. */
export function hitTestLayer(parts,point) {
  for(let i=parts.length-1;i>=0;i--) {
    const {layer,design}=parts[i]; if(!layer.visible)continue;
    const x=Math.floor(point[0]/0.2),y=Math.floor(point[1]/0.2);
    if(x>=0&&y>=0&&x<500&&y<500&&design.labels?.[y*500+x])return layer.id;
    for(const path of [...(design.lines||[]),...(design.paths||[])]) {
      const pts=path.pts;
      if(pts.length===1&&Math.hypot(point[0]-pts[0][0],point[1]-pts[0][1])<=Math.max(1.5,(pts[0][2]||0)/2))return layer.id;
      for(let j=1;j<pts.length;j++)if(segmentDistance(point,pts[j-1],pts[j])<=Math.max(1.5,(pts[j][2]||0)/2))return layer.id;
    }
  }
  return null;
}
