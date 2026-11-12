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

/** Artwork bounds, including satin width and occupied fill cells, in hoop millimeters. */
export function designBounds(design) {
  let bounds = null;
  function include(x, y, radius = 0) {
    if (!bounds) bounds = [x-radius, y-radius, x+radius, y+radius];
    else { bounds[0]=Math.min(bounds[0],x-radius); bounds[1]=Math.min(bounds[1],y-radius); bounds[2]=Math.max(bounds[2],x+radius); bounds[3]=Math.max(bounds[3],y+radius); }
  }
  design.labels?.forEach((color, i) => { if(color) include((i%500+.5)*.2,(Math.floor(i/500)+.5)*.2,.1); });
  for(const path of [...(design.lines||[]),...(design.paths||[])])
    for(const point of path.pts) include(point[0],point[1],(point[2]||0)/2);
  return bounds;
}

/** Uniform resizing about a fixed point in hoop coordinates, including rotated objects. */
export function scaleAbout(transform, factor, anchor) {
  const scale = Math.max(.1, Math.min(4, transform.scale * factor));
  const ratio = scale / transform.scale;
  return {...transform, scale, x:anchor[0]+ratio*(50+transform.x-anchor[0])-50, y:anchor[1]+ratio*(50+transform.y-anchor[1])-50};
}

/** Project the pointer onto the corner diagonal; dragging sideways cannot invert artwork. */
export function resizeFromCorner(transform, bounds, corner, point) {
  const left=corner.includes('w'), top=corner.includes('n');
  const anchor=[bounds[left?2:0],bounds[top?3:1]];
  const vector=[bounds[left?0:2]-anchor[0],bounds[top?1:3]-anchor[1]];
  const squared=vector[0]**2+vector[1]**2;
  const factor=squared ? ((point[0]-anchor[0])*vector[0]+(point[1]-anchor[1])*vector[1])/squared : 1;
  return scaleAbout(transform, Math.max(.01,factor), anchor);
}
