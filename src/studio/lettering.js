import { columnUnderlay } from './underlay.js';
import font from './fonts/small-satin/geometry.json';
import license from './fonts/small-satin/LICENSE?raw';
export const FONT_LICENSE = license;
export const EMBROIDERY_FONT = 'SmallSatin';
export const LETTER_HEIGHT = { min: 4, max: 15 };
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
function samplePairs(pairs, step) {
  const out=[pairs[0]], cumulative=[0];
  for(let i=1;i<pairs.length;i++) cumulative.push(cumulative.at(-1)+(distance(pairs[i-1],pairs[i])+distance(pairs[i-1].slice(2),pairs[i].slice(2)))/2);
  const total=cumulative.at(-1), n=Math.max(1,Math.ceil(total/step));
  let j=1;
  for(let i=1;i<=n;i++) {
    const d=total*i/n;
    while(j<cumulative.length-1 && cumulative[j]<d) j++;
    const f=(d-cumulative[j-1])/(cumulative[j]-cumulative[j-1] || 1);
    out.push(pairs[j-1].map((v,k)=>v+(pairs[j][k]-v)*f));
  }
  return out;
}
/** Satin geometry is digitized at its final size; ordinary web fonts are never rasterized here. */
export function letteringDesign(text, layerScale=1, underlay=true, settings={}) {
  const height=text.heightMM ?? 8, effective=height*layerScale;
  if(!Number.isFinite(effective) || effective<4 || effective>15) throw new Error('Small Satin needs a final letter height between 4 and 15 mm. Adjust letter height or layer size.');
  const value=String(text.value || '').normalize('NFC');
  const missing=[...new Set([...value].filter(c=>c!=='\n' && c!==' ' && !font.glyphs[c]))];
  if(missing.length) throw new Error('Small Satin does not include: '+missing.join(' ')+'. Choose supported letters or a decorative fill font.');
  const scale=height/font.capHeight, spacing=text.letterSpacing ?? 0.5, gap=text.lineGap ?? 2;
  const lines=value.split('\n'), lineWidths=lines.map(line=>[...line].reduce((w,c,i)=>w+(c===' '?font.space*scale:(font.glyphs[c].bounds[2]-font.glyphs[c].bounds[0])*scale)+(i?spacing:0),0));
  const width=Math.max(0,...lineWidths), paths=[];
  if(width*layerScale>142 || (lines.length-1)*(font.leading*scale+gap)*layerScale>142) throw new Error('The lettering is too large for the hoop. Shorten the text or reduce its letter height.');
  lines.forEach((line,row)=>{
    let x=text.align==='left'?0:text.align==='right'?width-lineWidths[row]:(width-lineWidths[row])/2;
    const y=row*(font.leading*scale+gap);
    for(const char of line) {
      if(char===' ') { x+=font.space*scale+spacing; continue; }
      const glyph=font.glyphs[char];
      const move=(p)=>[x+(p[0]-glyph.bounds[0])*scale,y+(p[1]-font.baseline)*scale];
      for(const entry of glyph.order) {
        if(entry[0]==='run') { paths.push({color:text.color,pts:glyph.runs[entry[1]].map(move)}); continue; }
        const column=glyph.columns[entry[1]];
        const pairs=column.map(p=>[...move(p.slice(0,2)),...move(p.slice(2))]);
        const pts=[];
        let reverse=underlay;
        if(settings.satinUnderlay !== undefined) {
          pts.push(...columnUnderlay(pairs,{mode:settings.satinUnderlay,inset:(settings.underlayInsetMm??0.4)/layerScale,spacing:(settings.underlaySpacingMm??2)/layerScale,stitchLength:(settings.underlayStitchMm??1.2)/layerScale}));
          const last=pts.at(-1), start=[(pairs[0][0]+pairs[0][2])/2,(pairs[0][1]+pairs[0][3])/2], end=[(pairs.at(-1)[0]+pairs.at(-1)[2])/2,(pairs.at(-1)[1]+pairs.at(-1)[3])/2];
          reverse=!!last && distance(last,end)<distance(last,start);
        } else if(underlay) for(const p of samplePairs(pairs,1.2/layerScale)) pts.push([(p[0]+p[2])/2,(p[1]+p[3])/2]);
        const satin=samplePairs(reverse?pairs.slice().reverse():pairs,(settings.satinSpacingMm??0.4)/2/layerScale);
        satin.forEach((p,i)=>{
          const dx=p[2]-p[0],dy=p[3]-p[1],len=Math.hypot(dx,dy)||1, pull=(settings.satinPullMm??0.2)/layerScale;
          pts.push(i%2?[p[2]+dx/len*pull,p[3]+dy/len*pull]:[p[0]-dx/len*pull,p[1]-dy/len*pull]);
        });
        paths.push({color:text.color,pts});
      }
      x+=(glyph.bounds[2]-glyph.bounds[0])*scale+spacing;
    }
  });
  const all=paths.flatMap(p=>p.pts);
  if(all.length) {
    let minY=Infinity,maxY=-Infinity; for(const p of all) {minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}
    for(const p of all) {p[0]+=50-width/2;p[1]+=50-(minY+maxY)/2;}
  }
  return {labels:new Uint8Array(250000),order:[],lines:[],paths};
}
