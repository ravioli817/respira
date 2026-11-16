import { StitchEngine as E } from './engine.js';
/**
 * A non-blocking heuristic on final-size, processed color masks, not on the source photo.
 * Thin parts that touch another color are folded into it before this runs (thinDetails.js), unless
 * the picture's clean-up is Light; so the wording says which of the two cases is left.
 */
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
    const folded=!!layer.source&&layer.source.clean>1;
    if(thin)messages.push(folded
      ? `${layer.name}: some details thinner than about 1.2 mm stand on their own, with no other color beside them to fold into, and may not stitch clearly. Enlarge this picture or skip that color.`
      : `${layer.name}: some picture details are thinner than about 1.2 mm at this size and may not stitch clearly. Set Clean up specks to Medium to fold them into the color beside them, or enlarge this picture.`);
  }
  return messages;
}
