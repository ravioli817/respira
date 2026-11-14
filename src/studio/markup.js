// The Create screen's markup. Mounted into a shadow root by mountStudio().
export const STUDIO_MARKUP = `
<main class="studio">
  <header class="editor-tools" aria-label="Editor toolbar">
    <div class="canvas-actions" role="group" aria-label="Canvas tools">
      <button class="btn" id="move-layer" aria-pressed="true">Select</button>
      <button class="btn" id="add-draw-layer" aria-pressed="false">Draw</button>
      <button class="btn" id="add-image-layer">Picture</button>
      <input type="file" id="add-picture-file" accept="image/*" hidden aria-label="Add a picture to the canvas">
      <button class="btn" id="add-text-layer">Text</button>
      <button class="btn" id="shape-tool">Shape</button>
    </div>
      <div class="history">
        <button class="icon-btn" id="undo" aria-label="Undo" title="Undo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5 4 10l5 5"/><path d="M4 10h10.5a5.5 5.5 0 0 1 0 11H12"/></svg>
        </button>
        <button class="icon-btn" id="redo" aria-label="Redo" title="Redo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5 5 5-5 5"/><path d="M20 10H9.5a5.5 5.5 0 0 0 0 11H12"/></svg>
        </button>
        <button class="icon-btn" id="clear">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/></svg><span id="clear-label">Clear</span>
        </button>
      </div>
    <div class="panel-toggles" role="group" aria-label="Editor panels">
      <button class="btn" id="toggle-objects" aria-controls="objects-panel" aria-expanded="true">Parts</button>
      <button class="btn" id="toggle-properties" aria-controls="properties-panel" aria-expanded="true">Settings</button>
    </div>
    <span class="project-status" id="project-status" role="status"></span>
    <button class="btn" id="projects" hidden>Projects</button>
    <button class="btn-primary" id="send">Prepare to stitch</button>
  </header>
  <div class="editor-workspace">
  <aside class="objects-panel" id="objects-panel" aria-label="Parts of the design, in stitching order">
    <div class="panel-heading"><h2>Parts <span id="object-count"></span></h2><button class="icon-btn" id="close-objects" aria-label="Close the parts list">×</button></div>
    <p class="hint">Stitched in this order, top first.</p>
    <div id="layers" class="layer-list" role="group" aria-label="Select an existing object"></div>
    <div class="layer-order"><button class="btn" id="layer-earlier">Move up</button><button class="btn" id="layer-later">Move down</button></div>
    <button class="btn" id="new-drawing-object">Add another drawing</button>
    <p class="hint">Where parts overlap, both are stitched.</p>
  </aside>
  <section class="stage-col" aria-label="Hoop">
    <div class="canvas-heading">
      <div class="readout" id="readout">Nothing to stitch yet</div>
      <p id="editing-object" class="hint" aria-live="polite"></p>
      <div class="heading-controls">
        <button class="btn" id="pan-canvas" aria-pressed="false" hidden>Pan</button>
        <div class="seg small" role="group" aria-label="Show">
          <button id="view-design" data-view="design" aria-pressed="true">Design</button>
          <button id="view-stitches" data-view="stitches" aria-pressed="false">Stitches</button>
        </div>
        <details class="view-menu" id="view-menu">
          <summary class="btn">View</summary>
          <div class="view-pop">
            <div class="seg small" role="group" aria-label="Hoop size on screen">
              <button id="size-real" aria-pressed="true">Real size</button>
              <button id="size-fit" aria-pressed="false">Fit screen</button>
            </div>
            <p class="size-line"><span id="size-note"></span><button class="link" id="size-check">Check the size with a card</button></p>
            <label class="zoom">Zoom <input id="canvas-zoom" type="range" min="50" max="200" step="10" value="100"><output id="zoom-out">100%</output></label>
            <button class="btn" id="grid-toggle" aria-pressed="true">Grid</button>
            <div class="fabrics" role="group" aria-label="Fabric color for the preview" id="fabrics">
              <span class="fabric-label">Fabric</span>
            </div>
          </div>
        </details>
      </div>
    </div>
    <!-- On a narrow screen the drawing tools dock here instead of in a drawer over the hoop. -->
    <div class="draw-dock" id="draw-dock" hidden></div>
    <p class="note" id="note" role="status" hidden></p>
    <div class="canvas-viewport" id="canvas-viewport">

    <div class="hoop">
      <div class="field" id="stage">
        <canvas id="base" aria-hidden="true"></canvas>
        <canvas id="overlay" role="img" aria-label="Embroidery canvas. Select an object to move or resize it, or choose Draw to add marks."></canvas>
        <div id="selection-box" class="selection-box" hidden>
          <button class="resize-handle nw" data-corner="nw" aria-label="Resize object from top left" tabindex="-1"></button>
          <button class="resize-handle ne" data-corner="ne" aria-label="Resize object from top right" tabindex="-1"></button>
          <button class="resize-handle sw" data-corner="sw" aria-label="Resize object from bottom left" tabindex="-1"></button>
          <button class="resize-handle se" data-corner="se" aria-label="Resize object from bottom right" tabindex="-1"></button>
        </div>
        <div class="example-tag" id="example-tag" hidden>Example · tap Clear to start your own</div>
        <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
      </div>
    </div>

    </div>
  </section>
  <aside class="bench" id="properties-panel" aria-label="Selected object properties">
    <div class="panel-heading"><h2>Tools and settings</h2><button class="icon-btn" id="close-properties" aria-label="Close tools and settings">×</button></div>
      <details class="panel shape-tools" hidden>
        <summary>Add a shape</summary>
        <label class="stack">Shape<select id="shape-kind"><option value="ellipse">Circle / ellipse</option><option value="rectangle">Rectangle</option><option value="triangle">Triangle</option><option value="star">Star</option><option value="heart">Heart</option></select></label>
        <div class="shape-grid">
          <label class="stack">Width (mm)<input id="shape-width" type="number" min="2" max="98" value="30"></label>
          <label class="stack">Height (mm)<input id="shape-height" type="number" min="2" max="98" value="30"></label>
          <label class="stack">Center X (mm)<input id="shape-x" type="number" min="0" max="100" value="50"></label>
          <label class="stack">Center Y (mm)<input id="shape-y" type="number" min="0" max="100" value="50"></label>
        </div>
        <label class="stack">Stitch style<select id="shape-style"><option value="run">Line outline</option><option value="satin">Satin outline</option><option value="fill">Filled</option></select></label>
        <label class="stack">Satin width (mm)<input id="shape-line-width" type="number" min="1.5" max="6" step="0.1" value="3"></label>
        <p class="hint">Uses the selected thread. X and Y are measured from the top-left of the hoop. Equal width and height make a circle or square.</p>
        <button class="btn" id="add-shape">Add shape</button><button class="btn" id="cancel-shape">Cancel shape</button>
        <p id="shape-status" role="status" class="hint"></p>
      </details>
    <section class="panel first" id="panel-draw">
      <h2>Drawing</h2>
    <div class="toolbar" id="toolbar">
      <div class="seg tools" role="group" aria-label="Brush">
        <button class="tool" id="tool-line" data-tool="line" aria-pressed="false" title="Line: a bold outline stitch">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3 16c3-7 6 3 9-3s5-3 9-6"/></svg><span>Line</span>
        </button>
        <button class="tool" id="tool-satin" data-tool="satin" aria-pressed="true" title="Satin: a smooth, shiny column">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M5 19 19 5" stroke-width="6" opacity=".28"/><path d="M5.5 15.5l3 3M8 13l3 3M10.5 10.5l3 3M13 8l3 3M15.5 5.5l3 3" stroke-width="1.5"/></svg><span>Satin</span>
        </button>
        <button class="tool" id="tool-brush" data-tool="brush" aria-pressed="false" title="Fill: paint an area that stitches as a fill">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 14.5 19 5a1.9 1.9 0 0 0-2.7-2.7l-9.5 9.5"/><path d="M6.8 12.4c-2 0-3.3 1.4-3.3 3.3 0 1.7-.6 2.9-1.5 3.8 3.4.4 7.5-.4 7.5-4.3a2.8 2.8 0 0 0-2.7-2.8z"/></svg><span>Fill</span>
        </button>
        <button class="tool" id="tool-bucket" data-tool="bucket" aria-pressed="false" title="Bucket: fill a shape you outlined">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4.6 11.2 6.6-6.6 7.2 7.2-6.6 6.6a2 2 0 0 1-2.8 0L4.6 14a2 2 0 0 1 0-2.8z"/><path d="M4 12.5h14.2M8 2.5l3.2 3.2"/><path d="M20.5 15s1.6 2.1 1.6 3.2a1.6 1.6 0 0 1-3.2 0c0-1.1 1.6-3.2 1.6-3.2z"/></svg><span>Bucket</span>
        </button>
        <button class="tool" id="tool-eraser" data-tool="eraser" aria-pressed="false" title="Eraser: remove lines and paint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 20h11"/><path d="m4.4 13.6 8.5-8.5a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L11.5 18.5H8.6L4.4 14.3a.5.5 0 0 1 0-.7z"/><path d="m8.2 9.8 6 6"/></svg><span>Eraser</span>
        </button>
      </div>
      <label class="size" id="size-wrap"><span id="size-label">Width</span><input type="range" id="size" min="1.5" max="6" step="0.1" value="3"><output id="size-out" class="mono" for="size">3.0 mm</output></label>
    </div>

      <div class="threads in-bench">
        <div class="threads-head"><span>Thread</span><strong class="thread-name"></strong></div>
        <div class="palette" id="draw-palette-bench"></div>
      </div>
      <details class="drawing-recolor">
        <summary>Recolor what's drawn</summary>
        <p class="hint">Choose a thread in the palette, then apply it to this drawing. The palette alone changes the thread for new marks.</p>
        <label class="stack">Replace drawing color<select id="recolor-from"><option value="all">All existing colors</option></select></label>
        <button class="btn" id="recolor-drawing">Recolor marks</button>
      </details>

      <details><summary>Drawing help</summary>
      <dl class="legend">
        <dt>Line</dt><dd>A bold outline stitch.</dd>
        <dt>Satin</dt><dd>A smooth, shiny column 1.5 to 6 mm wide.</dd>
        <dt>Fill</dt><dd>Paint an area that stitches as a solid fill.</dd>
        <dt>Bucket</dt><dd>Fill inside a shape you outlined.</dd>
        <dt>Eraser</dt><dd>Removes lines and paint it touches.</dd>
      </dl>
      <label class="check"><input type="checkbox" id="pressure" checked> <span>Pencil pressure changes satin width</span></label>
      <p class="hint">Filled areas stitch first, then lines and satin go on top. Once you use Apple Pencil, finger touches are ignored so your palm can rest on the screen.</p>
      </details>
    </section>

    <section class="panel first" id="panel-image" hidden>
      <h2>Picture settings</h2>
      <div class="file-row">
        <label class="btn" for="file">Choose a picture</label>
        <input type="file" id="file" accept="image/*" class="visually-hidden">
        <span id="file-name" class="muted">Example picture</span>
      </div>
      <label class="range"><span>Size</span><input type="range" id="img-size" min="20" max="100" step="1" value="80"><output id="img-size-out" for="img-size">80 mm</output></label>
      <label class="range"><span>Colors</span><input type="range" id="img-k" min="1" max="8" step="1" value="4"><output id="img-k-out" for="img-k">4</output></label>
      <label class="check"><input type="checkbox" id="img-bg" checked> <span>Remove the background</span></label>
      <div class="field-row"><span>Clean up specks</span>
        <div class="seg small" role="group" aria-label="Clean up specks" id="img-clean">
          <button data-clean="1" aria-pressed="false">Light</button>
          <button data-clean="2" aria-pressed="true">Medium</button>
          <button data-clean="3" aria-pressed="false">Strong</button>
        </div>
      </div>
      <div class="clusters" id="clusters"></div>
      <p class="hint">Tap a thread to change it. Skip a color to leave the fabric showing there.</p>
    </section>

    <section class="panel first" id="panel-text" hidden>
      <h2>Lettering</h2>
      <label class="stack">Words<textarea id="txt" rows="2" maxlength="200" spellcheck="false"></textarea></label>
      <label class="stack">Font<select id="txt-font"></select></label>
      <label class="range" id="decorative-width"><span>Width</span><input type="range" id="txt-w" min="20" max="100" step="1" value="80"><output id="txt-w-out" for="txt-w">80 mm</output></label>
      <div id="lettering-controls" class="shape-grid">
        <label class="stack">Letter height (mm)<input id="txt-height" type="number" min="4" max="15" step="0.5" value="8"></label>
        <label class="stack">Letter spacing (mm)<input id="txt-spacing" type="number" min="0" max="5" step="0.1" value="0.5"></label>
        <label class="stack">Extra line gap (mm)<input id="txt-linegap" type="number" min="0" max="10" step="0.5" value="2"></label>
        <label class="stack">Align lines<select id="txt-align"><option value="left">Left</option><option value="center" selected>Center</option><option value="right">Right</option></select></label>
      </div>
      <div id="lettering-trims">
        <label class="stack">Thread trims<select id="txt-trim"><option value="auto">Automatic</option><option value="word">Between words</option><option value="letter">Between letters</option></select></label>
        <p class="hint">Word and letter rules add cuts at those boundaries. Automatic cuts for long jumps and thread changes still apply. Extra cuts add sewing time; check them in Prepare.</p>
      </div>
      <p id="font-note" class="hint"></p>
      <details id="font-credit-panel"><summary>Embroidery font credit and license</summary><p class="hint" id="font-credit"></p><pre id="font-license" class="license-text"></pre></details>
      <div class="stack"><span>Thread</span><div class="palette" id="txt-palette"></div></div>
    </section>

    <section class="panel object-properties">
  <div class="layer-controls">
    <label class="stack">Width (mm)<input id="object-width" type="number" min="0.1" max="400" step="0.5"></label>
    <label class="stack">Height (mm)<input id="object-height" type="number" min="0.1" max="400" step="0.5"></label>
    <label class="stack">Name<input id="layer-name" maxlength="60"></label>
    <label class="stack">Move across (mm)<input id="layer-x" type="number" min="-100" max="100" step="0.5" value="0"></label>
    <label class="stack">Move down (mm)<input id="layer-y" type="number" min="-100" max="100" step="0.5" value="0"></label>
    <label class="stack">Size (%)<input id="layer-size" type="number" min="10" max="400" step="5" value="100"></label>
    <label class="stack">Turn (°)<input id="layer-rotation" type="number" min="-180" max="180" step="5" value="0"></label>
  </div>
  <div class="layer-actions"><label><input id="layer-visible" type="checkbox" checked> Stitch this part</label><button class="btn" id="layer-duplicate">Duplicate</button><button class="btn" id="layer-remove">Remove</button></div>
    <p class="hint">Resize keeps proportions. Dimensions include rotation.</p>
    </section>


    <details class="panel" id="object-stitches">
      <summary>Advanced: underlay and pull</summary>
      <p class="hint" id="stitch-object-name"></p>
      <label class="check"><input type="checkbox" id="stitch-custom"> Use different stitch settings for this part</label>
      <fieldset id="stitch-fields" disabled>
        <div id="fill-stitch-fields">
          <label class="stack">Fill underlay<select id="stitch-fillUnderlay"><option value="none">None</option><option value="tatami">Sparse tatami</option><option value="edge">Inset edge walk</option><option value="edge-tatami">Edge walk + sparse tatami</option></select></label>
          <label class="stack">Fill pull per edge (mm)<input id="stitch-fillPullMm" type="number" min="0" max="1" step="0.05"></label>
          <label class="stack">Fill row spacing (mm)<input id="stitch-fillSpacing" type="number" min="0.25" max="2" step="0.05"></label>
          <label class="stack">Fill angle in hoop (°)<input id="stitch-fillAngle" type="number" min="0" max="180" step="5"></label>
        </div>
        <div id="satin-stitch-fields">
          <label class="stack">Satin underlay<select id="stitch-satinUnderlay"><option value="none">None</option><option value="center">Center walk</option><option value="edge">Inset edge walk</option><option value="zigzag">Sparse zigzag</option><option value="center-edge">Center + edge walk</option><option value="center-zigzag">Center walk + zigzag</option></select></label>
          <label class="stack">Satin pull per edge (mm)<input id="stitch-satinPullMm" type="number" min="0" max="1" step="0.05"></label>
          <label class="stack">Satin peak-to-peak spacing (mm)<input id="stitch-satinSpacingMm" type="number" min="0.3" max="1" step="0.05"></label>
        </div>
        <label class="stack">Underlay edge inset (mm)<input id="stitch-underlayInsetMm" type="number" min="0.1" max="2" step="0.1"></label>
        <label class="stack">Underlay row / zigzag spacing (mm)<input id="stitch-underlaySpacingMm" type="number" min="0.8" max="4" step="0.1"></label>
        <label class="stack">Underlay running stitch length (mm)<input id="stitch-underlayStitchMm" type="number" min="0.5" max="4" step="0.1"></label>
      </fieldset>
      <p class="hint">Pull compensation extends each fill endpoint or satin edge by this amount at the final size. It does not enlarge the underlay. Line outlines are unchanged. Thin areas may omit inset fill underlay or reduce satin underlay to a center walk. Review Density inspection and test on your fabric.</p>
    </details>
    <details class="panel" id="settings">
      <summary>Stitch settings</summary>
      <div class="field-row"><span>Fill density</span>
        <div class="seg small" role="group" aria-label="Fill density" id="density">
          <button data-spacing="0.5" aria-pressed="false">Light</button>
          <button data-spacing="0.4" aria-pressed="true">Standard</button>
          <button data-spacing="0.34" aria-pressed="false">Dense</button>
        </div>
      </div>
      <label class="range"><span>Fill angle</span><input type="range" id="angle" min="0" max="175" step="5" value="45"><output id="angle-out" for="angle">45°</output></label>
      <label class="check"><input type="checkbox" id="underlay" checked> <span>Supporting underlay stitches beneath fills and satin</span></label>
    </details>

    <details class="panel sequence">
      <summary>Thread order <span class="mono muted" id="seq-sum"></span></summary>
      <ol id="sequence"></ol>
    </details>

    <section class="panel save mid" id="save-panel">
      <label class="stack">Design name<input id="fname" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="24"></label>
      <div class="save-files"><button class="link" id="save">Save a .pes file</button><button class="link" id="save-dst">Save a .dst file</button></div>
    </section>

    <details class="panel howto">
      <summary>Getting it onto your Skitch</summary>
      <ol>
        <li>Tap <strong>Prepare to stitch</strong>. Prepare opens with your design in the hoop. Review its placement and playback.</li>
        <li>Continue to <strong>Stitch</strong>, connect to the machine, then tap <strong>Upload</strong>.</li>
        <li>Let the machine trace the outline so you can see where it will stitch, then start.</li>
      </ol>
      <p>You can also save a .pes file and bring it into Brother's Artspira app.</p>
    </details>
  </aside>
  </div>
  <p class="status editor-status" id="save-status" role="status" aria-live="polite"></p>
</main>

<div class="sheet" id="sheet" hidden>
  <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <h3 id="sheet-title">Pick a thread</h3>
    <div class="palette" id="sheet-palette"></div>
    <button class="btn" id="sheet-close">Done</button>
  </div>
</div>

<div class="sheet" id="ruler" hidden>
  <div class="sheet-card ruler-card" role="dialog" aria-modal="true" aria-labelledby="ruler-title">
    <h3 id="ruler-title">Check the size</h3>
    <p class="hint">Hold a bank card flat against the screen. Drag the slider until the outline is exactly as big as the card.</p>
    <div class="card-outline" id="ruler-outline"></div>
    <div class="ruler-row"><span class="muted small">Smaller</span><input type="range" id="ruler-slider" min="2.4" max="8" step="0.005" aria-label="Size of the outline"><span class="muted small">Bigger</span></div>
    <div class="ruler-actions"><button class="btn" id="ruler-reset">Use this device's default</button><button class="btn" id="ruler-done">Done</button></div>
  </div>
</div>

`;
