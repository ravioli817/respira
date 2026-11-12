# Small Satin

Browser adaptation of Ink/Stitch Small Font, copyright (c) 2017 Lex Neva.
The original SVG, metadata and OFL-1.1 license are included here. The derived
`geometry.json` remains under OFL-1.1. No Ink/Stitch application code is included.

Source: https://github.com/inkstitch/embroidery-fonts/tree/c7e3a05c3d6f5c77b881c50f257851af9a8e9cb8/src/small_font

Rebuild with Python and svgpathtools==1.8.0:
`python scripts/build_lettering_font.py`

The converter flattens Bezier rails and uses the authored rungs to pair them.
The app regenerates satin spacing and center-walk underlay at the requested
size. It is a separate stitch generator, not a claim of identical output to
Ink/Stitch. Supported cap heights are limited to 4–15 mm, within the source
font's documented scale range. Test on your material before sewing a garment.
