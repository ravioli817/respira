"""Convert OFL satin rails to a browser asset. Requires svgpathtools==1.8.0.
Run: python scripts/build_lettering_font.py
Only font geometry is read; no Ink/Stitch application code is used.
"""
import json, math, re, xml.etree.ElementTree as ET
from pathlib import Path
from svgpathtools import parse_path
BASE = Path(__file__).resolve().parents[1] / 'src/studio/fonts/small-satin'
INK = '{http://www.inkscape.org/namespaces/inkscape}'
STITCH = '{http://inkstitch.org/namespace}'

def flatten(path):
    out=[]
    for seg in path:
        n=max(1, math.ceil(seg.length()/0.25))
        if not out: out.append([seg.start.real,seg.start.imag])
        out.extend([[seg.point(i/n).real,seg.point(i/n).imag] for i in range(1,n+1)])
    return out

def lengths(p):
    out=[0.0]
    for a,b in zip(p,p[1:]): out.append(out[-1]+math.dist(a,b))
    return out

def point(p,ls,t):
    d=t*ls[-1]
    for i in range(1,len(p)):
        if ls[i]>=d:
            f=(d-ls[i-1])/(ls[i]-ls[i-1]) if ls[i]>ls[i-1] else 0
            return [p[i-1][k]+(p[i][k]-p[i-1][k])*f for k in range(2)]
    return p[-1]

def cross(a,b): return a[0]*b[1]-a[1]*b[0]
def hits(rail, rung):
    ls=lengths(rail)
    for i,(a,b) in enumerate(zip(rail,rail[1:])):
        v=[b[k]-a[k] for k in range(2)]
        for c,d in zip(rung,rung[1:]):
            w=[d[k]-c[k] for k in range(2)]; den=cross(v,w)
            if abs(den)<1e-10: continue
            ca=[c[k]-a[k] for k in range(2)]
            u=cross(ca,w)/den; t=cross(ca,v)/den
            if -1e-6<=u<=1+1e-6 and -1e-6<=t<=1+1e-6: return (ls[i]+u*math.dist(a,b))/ls[-1]
    return None

def pair(paths):
    # Rail subpaths need not precede the rungs in the source SVG.
    candidates=[(i,j) for i in range(len(paths)) for j in range(i+1,len(paths))]
    candidates.sort(key=lambda ij: -(lengths(paths[ij[0]])[-1]+lengths(paths[ij[1]])[-1]))
    for i,j in candidates:
        if all(hits(paths[i],r) is not None and hits(paths[j],r) is not None for k,r in enumerate(paths) if k not in (i,j)):
            paths=[paths[i],paths[j]]+[r for k,r in enumerate(paths) if k not in (i,j)]
            break
    a,b=paths[:2]
    if math.dist(a[0],b[0])+math.dist(a[-1],b[-1])>math.dist(a[0],b[-1])+math.dist(a[-1],b[0]): b=b[::-1]
    anchors=[(0.,0.),(1.,1.)]
    for rung in paths[2:]:
        u,v=hits(a,rung),hits(b,rung)
        if u is None or v is None: raise ValueError('A rung does not cross both rails')
        if 1e-6<u<1-1e-6 and 1e-6<v<1-1e-6: anchors.append((u,v))
    anchors.sort()
    la,lb=lengths(a),lengths(b)
    pairs=[]
    for (u0,v0),(u1,v1) in zip(anchors,anchors[1:]):
        if v1<v0: raise ValueError('Crossed rung ordering')
        n=max(1, math.ceil(max((u1-u0)*la[-1],(v1-v0)*lb[-1])/0.4))
        for i in range(n):
            f=i/n
            pairs.append([*point(a,la,u0+(u1-u0)*f), *point(b,lb,v0+(v1-v0)*f)])
    pairs.append([*a[-1],*b[-1]])
    return [[round(v,4) for v in row] for row in pairs]

root=ET.parse(BASE/'ltr.svg').getroot(); glyphs={}; errors=[]
parents={child:parent for parent in root.iter() for child in parent}
for layer in root:
    label=layer.get(INK+'label','')
    if not label.startswith('GlyphLayer-'): continue
    char=label[len('GlyphLayer-'):]; columns=[]; runs=[]; order=[]
    for node in layer.iter():
        if not node.tag.endswith('}path'): continue
        parts=[flatten(p) for p in parse_path(node.get('d','')).continuous_subpaths()]
        current=node
        while current is not root:
            transform=current.get('transform')
            if transform:
                m=re.fullmatch(r'matrix\(([^)]+)\)',transform)
                if not m: raise ValueError(transform)
                a,b,c,d,e,f=map(float,re.split('[ ,]+',m[1].strip()))
                parts=[[[a*x+c*y+e,b*x+d*y+f] for x,y in p] for p in parts]
            current=parents[current]
        if node.get(STITCH+'satin_column','').lower()=='true':
            try:
                columns.append(pair(parts)); order.append(['column',len(columns)-1])
            except ValueError as err: errors.append((char,node.get('id'),str(err)))
        else:
            for part in parts:
                if part: runs.append(part); order.append(['run',len(runs)-1])
    if columns or runs:
        pts=[p[:2] for c in columns for p in c]+[p[2:] for c in columns for p in c]+[p for r in runs for p in r]
        bounds=[min(p[0] for p in pts),min(p[1] for p in pts),max(p[0] for p in pts),max(p[1] for p in pts)]
        glyphs[char]={'columns':columns,'runs':runs,'order':order,'bounds':[round(v,4) for v in bounds]}
if errors: raise ValueError(errors)
h=glyphs['H']['bounds']; out={'name':'Small Satin','capHeight':h[3]-h[1],'baseline':h[3],'space':17,'leading':30,'glyphs':glyphs}
(BASE/'geometry.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
print(f'Converted {len(glyphs)} glyphs, {sum(len(g["columns"]) for g in glyphs.values())} satin columns')
