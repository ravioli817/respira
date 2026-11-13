# Script Satin

Browser adaptation of Ink/Stitch `pacificlo`. The original `ltr.svg`, `font.json`
and `LICENSE` are included unchanged. `geometry.json` is derived font data under
**SIL OFL-1.1**, not the application's Apache-2.0 license.

Source revision: `c7e3a05c3d6f5c77b881c50f257851af9a8e9cb8`
https://github.com/inkstitch/embroidery-fonts/tree/c7e3a05c3d6f5c77b881c50f257851af9a8e9cb8/src/pacificlo

Conversion flattens curves, pairs satin rails using authored rungs, preserves path
order, running paths, advances and kerning, and rounds derived coordinates. A rung
that misses a rail endpoint by at most 0.1 source pixel can snap to that endpoint;
closed/curling rails use monotonic rung order to resolve direction. No Ink/Stitch
application code is included. The app supplies its own satin/underlay generation.

Supported **final capital-letter heights: 14.5–24.5 mm**. The source H is 17.721659 mm high at 100%; the source permits 80–140% scaling.
These bounds are rounded inward and describe cap height, unlike the approximate
font sizes in upstream's catalog. The stitch result is not identical to Ink/Stitch;
a physical stitch-out on the selected fabric is still required.

Rebuild with svgpathtools==1.8.0:
`python scripts/build_lettering_font.py script-satin`
