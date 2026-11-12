import { StitchEngine as E } from './engine.js';
/** A non-blocking heuristic on final-size, processed color masks, not on the source photo. */
export function pictureDetailWarnings(parts) {
  const messages=[];
  for(const {layer,design} of parts) {
    if(layer.kind!=='image'||layer.visible===false||!design.labels)continue;
    const colors=new Set(design.labels);colors.delete(0);
    let thin=false;
    // Inspect colors independently: a thin stripe inside a solid silhouette still matters.
    for(const color of colors) {
      const mask=design.labels.map(c=>c===color?1:0);
      if(E.thinShare(mask,E.GRID,E.GRID,3)>0.12){thin=true;break;}
    }
    if(thin)messages.push(`${layer.name}: some picture details are thinner than about 1.2 mm at this size and may not stitch clearly. Enlarge this picture or simplify its colors/details.`);
  }
  return messages;
}
