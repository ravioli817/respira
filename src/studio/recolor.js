/** Existing colors in one drawing, preserving their first-use order. */
export function drawingColors(drawing) {
  const present=new Set(drawing.labels);present.delete(0);
  for(const stroke of drawing.strokes)present.add(stroke.color);
  return [...new Set([...drawing.order,...present])].filter(c=>present.has(c));
}
/** Replace all marks, or one existing thread, without touching background or geometry. */
export function recolorDrawing(drawing,target,from=null) {
  if(!Number.isInteger(target)||target<1||target>63)throw new Error('Choose a valid thread.');
  const replace=c=>c && (from===null||c===from) ? target : c;
  const labels=drawing.labels.map(replace);
  const present=new Set(labels);present.delete(0);
  const order=[...new Set(drawing.order.map(replace).concat([...present]))].filter(c=>present.has(c));
  return {...drawing,labels,order,strokes:drawing.strokes.map(s=>({...s,color:replace(s.color)}))};
}
