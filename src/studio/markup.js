// The Create screen's markup. Mounted into a shadow root by mountStudio().
export const STUDIO_MARKUP = `
<header class="top">
  <div class="brand">
    <span class="brand-name">Create a design</span>
    <span class="brand-sub">4 × 4 in hoop · 100 × 100 mm</span>
  </div>
  <div class="seg modes" role="tablist" aria-label="Make a design from">
    <button role="tab" id="mode-draw" data-mode="draw" aria-selected="true">Draw</button>
    <button role="tab" id="mode-image" data-mode="image" aria-selected="false">Picture</button>
    <button role="tab" id="mode-text" data-mode="text" aria-selected="false">Text</button>
  </div>
</header>

<main class="studio">
  <section class="stage-col" aria-label="Hoop">
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
    </div>

    <div class="hoop">
      <div class="field" id="stage">
        <canvas id="base" aria-hidden="true"></canvas>
        <canvas id="overlay" role="img" aria-label="Embroidery hoop. Draw here with Apple Pencil, a finger or a mouse."></canvas>
        <div class="example-tag" id="example-tag" hidden>Example · tap Clear to start your own</div>
        <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
      </div>
    </div>

    <div class="meta">
      <div class="readout mono" id="readout">Nothing to stitch yet</div>
      <div class="seg small" role="group" aria-label="Show">
        <button id="view-design" data-view="design" aria-pressed="true">Design</button>
        <button id="view-stitches" data-view="stitches" aria-pressed="false">Stitches</button>
      </div>
      <div class="fabrics" role="group" aria-label="Fabric color for the preview" id="fabrics">
        <span class="fabric-label">Fabric</span>
      </div>
      <div class="seg small" role="group" aria-label="Hoop size on screen">
        <button id="size-real" aria-pressed="true">Real size</button>
        <button id="size-fit" aria-pressed="false">Fit screen</button>
      </div>
    </div>
    <p class="size-line"><span id="size-note"></span><button class="link" id="size-check">Check the size with a card</button></p>

    <div class="threads in-stage" id="draw-threads">
      <div class="threads-head"><span>Thread</span><strong class="thread-name"></strong></div>
      <div class="palette" id="draw-palette"></div>
    </div>
  </section>

  <aside class="bench" aria-label="Design settings">
    <section class="panel first" id="panel-draw">
      <h2>Draw</h2>
      <div class="threads in-bench">
        <div class="threads-head"><span>Thread</span><strong class="thread-name"></strong></div>
        <div class="palette" id="draw-palette-bench"></div>
      </div>
      <dl class="legend">
        <dt>Line</dt><dd>A bold outline stitch.</dd>
        <dt>Satin</dt><dd>A smooth, shiny column 1.5 to 6 mm wide.</dd>
        <dt>Fill</dt><dd>Paint an area that stitches as a solid fill.</dd>
        <dt>Bucket</dt><dd>Fill inside a shape you outlined.</dd>
        <dt>Eraser</dt><dd>Removes lines and paint it touches.</dd>
      </dl>
      <label class="check"><input type="checkbox" id="pressure" checked> <span>Pencil pressure changes satin width</span></label>
      <p class="hint">Filled areas stitch first, then lines and satin go on top. Once you use Apple Pencil, finger touches are ignored so your palm can rest on the screen.</p>
    </section>

    <section class="panel first" id="panel-image" hidden>
      <h2>Picture</h2>
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
      <h2>Text</h2>
      <label class="stack">Words<textarea id="txt" rows="2" spellcheck="false"></textarea></label>
      <label class="stack">Font<select id="txt-font"></select></label>
      <label class="range"><span>Width</span><input type="range" id="txt-w" min="20" max="100" step="1" value="80"><output id="txt-w-out" for="txt-w">80 mm</output></label>
      <div class="stack"><span>Thread</span><div class="palette" id="txt-palette"></div></div>
    </section>

    <p class="note" id="note" hidden></p>

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
      <label class="check"><input type="checkbox" id="underlay" checked> <span>Underlay stitches under fills and satin, which keep the fabric from puckering</span></label>
    </details>

    <section class="panel sequence">
      <h2>Color sequence <span class="mono muted" id="seq-sum"></span></h2>
      <ol id="sequence"></ol>
    </section>

    <section class="panel save mid" id="save-panel">
      <label class="stack">Design name<input id="fname" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="24"></label>
      <button class="btn-primary" id="send">Send to Skitch</button>
      <p class="muted small">Opens the Stitch screen with this design, ready to go to the machine.</p>
      <p class="status" id="save-status" role="status" aria-live="polite"></p>
      <div class="save-files"><button class="link" id="save">Save a .pes file</button><button class="link" id="save-dst">Save a .dst file</button></div>
    </section>

    <details class="panel howto">
      <summary>Getting it onto your Skitch</summary>
      <ol>
        <li>Tap <strong>Send to Skitch</strong>. The Stitch screen opens with your design in the hoop.</li>
        <li>Connect to the machine, then tap <strong>Upload</strong>.</li>
        <li>Let the machine trace the outline so you can see where it will stitch, then start.</li>
      </ol>
      <p>You can also save a .pes file and bring it into Brother's Artspira app.</p>
    </details>
  </aside>
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
