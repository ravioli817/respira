# Respira

Respira is an pattern transmission and embroidery monitoring application for the Brother PP-1 SKiTCH embroidery machine.
It replaces the Artspira app and allows the user to transmit .PES patterns directly from a computer without having to go through the app.
This allows the user to operate the embroidery machine fully offline and from the comfortable screen of a computer.

![](./docs/main_screenshot.png)

## This fork: Respira with a Create screen

This is a fork of [jhbruhn/respira](https://github.com/jhbruhn/respira). Respira's Bluetooth protocol code is used as it is; its stitch encoder and machine polling carry the small changes listed under "Carried over from other forks" and "Thread cuts". The fork adds:

- **Create screen** (`src/studio/`): draw with a stylus, turn a picture into stitches, or set text, on a hoop shown at real size. **Next: place it in the hoop** (or the Place step in the top bar) hands the design to the Place screen, where it goes through Respira's own encoder and upload. Designs made here do not need a PES file.
- **"What to do now" card** (`src/guide/`): plain-language instructions for each machine state, a chime when the machine needs someone (thread change, a fault, finished), and the screen kept awake while connected.
- **Practice machine** (`src/practice/`): open the app with `?practice` in the address to try the whole flow against a pretend Skitch. Its behaviour is a best guess from the code, not a recording of a real machine.
- The pattern preview now has a height on screens narrower than 1024 px (a tablet held upright).

**Files of Respira's that this fork changes** carry a note on their first line pointing here; `git grep -l "Changed in this fork"` lists them. `package.json` and `package-lock.json` (bundled lettering fonts, the interface typeface and a test helper) cannot carry a note. This README is changed too.

**Carried over from other forks of Respira**, with their authors' commits kept in the history:

- _Recovering after a Bluetooth reconnect_, by deadman96385 ([`a8b414d`](https://github.com/deadman96385/respira/commit/a8b414d)): the job's details and stitch count are read back after a reconnect without needing this browser's cached copy, progress keeps updating at thread changes, pauses and the finish, and replies from before a dropped connection are ignored.
- _Easier placement by touch_, by deadman96385 ([`9d51736`](https://github.com/deadman96385/respira/commit/9d51736)): the whole design can be grabbed, not just its stitches; dragging no longer scrolls the page; larger handles; a Rotate 90° button.
- _Start from a chosen color block_, by Torsten Feustel ([jhbruhn/respira#98](https://github.com/jhbruhn/respira/pull/98)), offered in this fork's Stitch panel as **Start from a chosen thread**, above the thread spools.
- _Hoop-photo alignment_, by Dunar Dolorgiet ([jhbruhn/respira#95](https://github.com/jhbruhn/respira/pull/95)): on Place, load or take a photo of the hooped fabric, mark the hoop's four corner markers (or let the app find them), and the photo shows under the design for placement. The marker geometry is for the 100 × 100 mm hoop.
- _Pause after each thread cut_, from Jibbe23's fork ([`2f17126`](https://github.com/Jibbe23/respira/commit/2f17126), [`6f44986`](https://github.com/Jibbe23/respira/commit/6f44986)), ported by hand: a switch on Place, off by default. When on, each cut is sent as a cut-and-pause, the same record a thread change uses, so the machine stops and the loose thread end can be held while it starts again. The app tells these pauses from real thread changes.

**The look: Stitch Sketchbook.** The app's own name on screen is Stitch Sketchbook; it is still Respira underneath, and Respira's licence and credits are unchanged. What differs from Respira's interface:

- _One top bar_ (`src/shell/TopBar.tsx`) on every screen: the app's name, the open design (which opens the list of designs), the three steps **1 Create, 2 Place, 3 Stitch**, and the machine connection. It replaces Respira's blue header and eight-step progress strip and this fork's earlier row of tabs. "Place" is the screen that earlier notes and the code call Prepare. Tapping Place from Create waits for valid current stitches; pending or invalid edits stay on Create with an explanation. A cleared design opens empty Place for file import instead of reusing the old snapshot. Existing imported PES files and uploaded jobs remain protected.
- _The hoop sits on a cutting mat_ on all three screens: a green surround with a centimetre grid, the hoop as a dark frame with a ruler along its top, and the controls laid on the mat beneath it. On Place and Stitch the hoop is shown at real size whenever it fits, as it already was on Create.
- _Colour means one thing each._ The chrome is paper and ink and the threads are the only colour, except for three signals on the Stitch screen's instruction card: tape yellow when it is your turn at the machine, pin red for a fault, mat green while the machine is sewing by itself.
- _The Stitch screen_ leads with that card, large enough to read from across a table: a thread change shows the thread as a spool with its name and Brother number. Progress is drawn as a line of stitches in the threads' colours, and the threads are listed as spools, ticked off as they are sewn. The thread faults (upper thread, bobbin) are worded plainly and name the thread to put back.
- _Create_ has a rail of tools down the left (the drawing tools start drawing directly; there is no separate Draw button), and the thread in hand with its Brother number on the right, above the part's settings.
- _Type_ is Atkinson Hyperlegible (SIL OFL 1.1, bundled through `@fontsource/atkinson-hyperlegible`, nothing is fetched from another site). Reading text is 17 px, nothing is set below 15 px, and controls are at least 44 px tall.

Respira's `AppHeader`, `WorkflowStepper`, `PatternCanvasPlaceholder` and `ProgressMonitor` card are no longer shown; their files are left in place so that changes from upstream still merge.

**Portrait Place.** A short size/time summary is followed by the hoop, then a collapsed **Threads and options** panel and the Next button. Playback and density views scroll into view when selected and use the page's natural height on narrow screens. Landscape keeps the options beside the hoop and the Next button at the bottom of that column.

**Sizes and wording.** The app is meant for a tablet used with fingers and a stylus by someone who does not know embroidery software. Nothing floats on top of the hoop: the position note and the zoom buttons sit on the mat under it and the thread list is in the panel beside it. On-screen names are plain ("Layers", "Stitch this layer", "Thread 2 of 4", "120 of 2,014 stitches", "Send to the machine", a design shown as "Flower", not "Flower.pes"). A machine fault does not open a box over the work on Create or Place: the Stitch step shows a dot and the card on Stitch explains it.

**Thread cuts.** A design from the Create screen is handed to Respira's encoder as the same clean stitch list Respira builds from a PES file, so the machine receives what Respira would send for that file: lock stitches and one cut on jumps longer than 5 mm and at each color change, and a plain jump across shorter gaps. Two things can change that, both by choice: a lettering trim rule other than Automatic asks for the same lock-and-cut on short jumps between words or letters, and "Pause after each thread cut" turns each cut into a cut-and-pause.

Run it locally with `npm install`, then `npm run web:dev`, and open http://localhost:5173 in Chrome.

## Projects, preparation and playback

- **Create:** add drawing, picture and text layers to a shared hoop. In Draw, expand **Preset shapes** to add an ellipse/circle, rectangle, triangle, star or heart. Set its width, height and center position in millimeters, choose a line outline, satin outline or fill, then tap **Add shape**. Shapes use the selected thread and support Undo/Redo. Dimensions describe the contour; satin extends beyond it. Inserted shapes become normal drawing strokes/fills. Drawings, pictures and text can be combined in one design using layers.
- **Designs (projects):** edits save automatically to this browser's IndexedDB. Tap the design's name in the top bar to open the list with the thumbnail gallery; **New design** (a blank drawing), **Save a copy**, **Export design** and **Import design** are in that list. Drawings, text, pictures, thread choices and prepared placement/rotation are preserved. Picture copies are embedded as PNG, with the longest side limited to 2048 pixels. Clearing browser data removes local designs; **Export design** saves an editable `.respira.json` backup to Files/Downloads. **Import design** opens it as a new design without overwriting another. Designs do not sync between browsers/devices automatically.
- **Place:** tap **Next: place it in the hoop** in Create (or the Place step in the top bar), or open a PES file with **Use an embroidery file instead** on the Place screen. Drag the design to where it should stitch, and check its size, threads and sewing-time estimate before connecting. After further edits in Create, tap it again to update what is placed. The Place step does not replace a PES file opened on Place, or the job the machine holds.
- **Watch how it will stitch** (stitch playback): choose this on Place to play, pause, scrub, step one command or jump to color stops. Toggle jumps, cuts and needle points. Playback uses the final encoded PEN data, including machine lock stitches and rotation; it never sends movement commands. The estimate excludes thread changes, cuts and other stops, and the preview does not predict fabric movement.
- **Stitch:** go on to Stitch to send the design, trace the outline, and start sewing with the machine's physical buttons. The card shows one next action at a time. When the machine reports the job complete the app remembers it, so the next action offered is deleting the finished design, not tracing and sewing it again. The connection is in the top bar on every screen. Opening a different design does not replace the one already held by the machine.

On iPad, ordinary Safari/Chrome do not expose Web Bluetooth. Bluefy is an option for opening the hosted app with Web Bluetooth support. This release's browser checks use the practice machine, not physical iPad/Bluefy/Skitch validation.

## Combined designs and embroidery lettering

Create uses an editor layout: a rail of tools on the left (Line, Satin, Fill, Bucket, Erase; Picture, Text, Shape, PES file; Move; Layers), the hoop on the mat in the center, and **Thread and settings** on the right, ending in **Next: place it in the hoop**. That panel shows the thread in hand, the selected layer's name, size and position, and then stitch settings, underlay, thread order, the design's name and file saving, each under its own title: nothing sits behind a general "More". The hoop stays visible while a panel scrolls. In a window 1400 px wide or more, the two side panels are wider, using mat that would otherwise be empty.

**Layers** in the rail opens the list of everything in the design, in stitching order from the top down. Each row has a small picture of the layer, its name, and an eye that leaves the layer out of the stitching without deleting it. The list starts open where the window is wide enough for it and a real-size hoop (1172 px). While **Move** is on, a row on the mat under the hoop holds what applies to any selected layer: turn left, turn right (15° a tap), **Copy** and **Delete**; the same and more are under **This layer** in the panel. A design warning (thin picture details, a layer outside the hoop) shows at the top of the panel when it is docked, so it does not push the hoop down.

**Merge.** Only adjacent, included drawings with matching stitch settings can be merged. The app never skips over text, pictures, embroidery layers or excluded layers to find a partner, and refuses a merge that would change the sequence of thread passes. Move the intended drawings next to each other explicitly if needed. The drawings are redrawn where they sit, then become one drawing in the earlier layer's position; Undo restores both. Overlapping paint is flattened to the later drawing's color. Pictures, text and embroidery files cannot be merged.

**Pictures.** **Crop** opens the picture with a box over it; only what is inside the box is stitched, and the crop can be changed or removed later (the whole picture is kept). The picture's colours are matched to threads by eye rather than by RGB distance (`src/studio/threadMatch.js`): lightness on the CIE L\* scale, hue weighted above strength of colour, a penalty for giving a coloured area a gray thread or a thread from the other side of the colour wheel (a brown does not become a teal), and a distinct thread for each automatically matched region. The threads are chosen as a set, not one colour at a time, so several similar shades spread along their own family (grays stay gray, blues stay blue) instead of the last one taking whatever is left; with 8 colours there are always 8 threads. An area that plainly has a colour is strengthened before matching (up to 1.3 times, none of it for grays and weak tints), so a muted photo comes out a little more vivid. Threads selected by hand are reserved; deliberate manual duplicates remain allowed. There is one way of matching, with no switch between a truer and a stronger one. Each row shows one swatch (the thread to be stitched), its name and Brother number, and its share of the picture.

The colours and threads of a picture are worked out afresh from its settings every time (size, number of colours, background, clean-up, crop, and the size its layer is shown at), so the same settings give the same result however they were reached; nothing is carried over from what was on screen before. The one thing kept is what was chosen by hand (`src/studio/pictureChoices.js`): a thread tapped in for a colour, marked "your pick", or a colour set to **Skip**. A choice is tied to that colour of the picture, so it follows the colour through setting changes, waits while the colour is absent (say, with fewer colours) and applies again when it returns. **Back to matched threads** forgets the picked threads; skipped colours stay skipped. Choosing a different picture starts again. A design saved before choices were kept cannot distinguish automatic matches from hand-picked threads, so all its saved thread assignments and skipped colors are preserved. Use **Back to matched threads** explicitly to adopt the new automatic matches. New projects store an empty choices list when nothing was selected manually, avoiding accidental rematching/migration on reopen.

**Thin parts.** A filled area narrower than about 1.2 mm does not stitch cleanly. With **Clean up specks** on Medium or Strong, each such part of a picture is folded into the solid colour it touches (`src/studio/thinDetails.js`): a band between two colours is shared between them, a fringe round a shape joins the shape, and a colour that is thin everywhere it appears (an outline between two areas) is taken up entirely and drops out of the thread list. Thin is measured at the size the layer is shown at, so a picture shrunk with its handles is worked out again when the handle is let go. A thin part that touches no other colour (a whisker over bare fabric, a line drawing) is kept, because folding it away would delete it. **Light** keeps every thin part, for pictures whose fine lines matter more than a clean fill.

**Embroidery files as layers.** **PES file** adds a Brother `.pes` (or `.pec`) to the design as a layer that can be moved, turned, copied and combined with drawings, pictures and text. Its stitches are read from the file's PEC section (`src/studio/pesImport.js`) and kept as needle points and explicit jump/cut boundaries, without resampling or stitching connectors across gaps. When the design is sent to the machine, several hops in a row become one move to where the last lands, so no lock stitches are sewn at a midpoint on bare fabric; the saved design and PES export keep every hop. Distinct color stops stay distinct even if both slots use the same thread. The PEN encoder still adds its machine lock stitches and automatic long-jump cuts. A stop after the last stitch is dropped, and a stop beyond the file's color list carries on with the last listed thread. An empty thread section in the middle of a file and a truncated stitch block are refused rather than silently dropping their controls. Each of the file's threads can be swapped for another. Resizing changes stitch length and density, so keep it within about a fifth. A file larger than the 100 mm hoop is refused. This is separate from **Use an embroidery file instead** on Place, which stitches a file exactly as it is. On iPad portrait or a narrow window the panels are drawers that open one at a time; while drawing, the thread colors and line width sit in a strip above the hoop instead, so the whole hoop stays in view. On a phone the rail lies across the top.

The hoop is shown at **real size** by default (100 mm across), and real size stays real: on an iPad in landscape it fits with the tools beside it, and in a window too small for it the canvas scrolls and a **Pan** button appears, rather than the hoop shrinking. **View** above the canvas holds Real size / Fit screen, the card check, zoom, the grid and the fabric color.

A design that opens on a drawing opens with a drawing tool on, so a stylus draws straight away; otherwise it opens in **Move**. In Move, tap an object to select and drag it, or use its corner handles to resize with proportions preserved. Width/height under This layer include rotation and regenerate stitches when changed. Tapping a drawing tool returns to the selected or last-used included drawing; **Add another drawing** in the Layers list adds a separate one. **Picture** opens the file picker (cancel adds nothing), **Text** starts editable Small Satin lettering with “Bharti”, and **Shape** inserts a separate drawing object. Existing project text is preserved. Everything in the View menu, and Pan, affects the preview only.

Thread and settings keeps recoloring, lettering, picture cleanup, across/down offsets, turning, "Stitch this layer", duplication and removal. **Move up** and **Move down** in the Layers list change the stitching order. Undo/Redo covers artwork and object edits. Overlapping included objects both sew; there is no automatic knockout.

**Thread order** follows the Layers list from the top down. Within a layer, filled areas are sewn first in the order their colours were first used, then lines and satin colour by colour, each colour's pieces ordered to shorten the travel between them; lettering and embroidery files keep their own order. Neighbouring blocks of the same thread share one thread stop, but threads are not sorted across layers: the same colour in two layers with another colour between them is two thread changes. Reordering layers, or merging drawings, is how to bring them together.

Three embroidery fonts are bundled offline. These use pre-digitized satin rails and authored running paths; the app regenerates stitches at the final size, including object scaling, underlay and pull compensation.

| Font | Final capital-letter height | Characters | Source / font-data license |
| --- | --- | --- | --- |
| Small Satin | 4–15 mm | 98 | Ink/Stitch Small Font by Lex Neva / SIL OFL-1.1 |
| Rounded Satin | 10–19 mm | 120 | [Geneva Simple Sans Rounded](https://inkstitch.org/fonts/geneva_simple/), based on Hershey / CC-BY-SA 2.5 plus original Hershey notices |
| Script Satin | 14.5–24.5 mm | 125 | [Pacificlo](https://inkstitch.org/fonts/pacificlo/) by Claudette Venneugues-Aminot, derived from Pacifico / SIL OFL-1.1 |

The size limits use **cap height**, conservatively inside the source font's scale range; they are not the same measurement as upstream's approximate overall font sizes. Changing font brings an out-of-range letter height into the new font's range. Resizing beyond a font's final range blocks placing and export with an explanation. Unsupported characters are reported instead of silently replaced. Spacing, multiline alignment and per-object stitch controls work with all three fonts. Script and rounded lettering preserve authored advances, bearings, kerning and path order. The other fonts remain explicitly labeled **decorative fill**.

**Thread trims** offers Automatic, Between words and Between letters for embroidery lettering. Word/letter rules add a cut before the next word/letter (including line boundaries), not between the satin columns inside a glyph. They never add a trailing cut to an empty string or final character. Automatic long-jump and color-change cuts still apply; this is not a no-trim mode. Extra cuts can increase sewing time and affect script joins. The playback on Place, which uses the final data, shows the actual cuts.

Requested cuts become a tagged jump using the existing PEN lock → jump/cut → lock sequence, including short or zero-distance jumps. They do not emit bare cut commands or add a duplicate cut at a color change. The old automatic behavior and Small Satin output remain unchanged when no additional rule is selected. PES and DST downloads retain the requested boundaries, subject to the destination machine's format handling.

Font source files, licenses, pinned source revision and conversion notes are in `src/studio/fonts`. Derived font data retains its own license rather than Apache-2.0. To rebuild, install `svgpathtools==1.8.0` in a Python environment and run `python scripts/build_lettering_font.py small-satin` (or `rounded-satin`, `script-satin`). This is our own stitch generator, not identical output from Ink/Stitch. Physical stitch-outs of the new fonts and additional trim rules remain necessary before sewing a garment.

New saved/exported projects use **version 9** (including routing options, editable shapes, PES jump/cut metadata and simplification settings) so older apps reject them instead of silently dropping stitch commands or stitch-generation options. Versions 1–8 remain importable. PES layers previously saved in version 5 show a re-import notice: their missing cut/jump information cannot be recovered from those projects, so re-import the original PES to restore it. Picture assignments already overwritten by an earlier release likewise require an older backup to recover; this release preserves the assignments still in the file. Sources, font, trim rule, transforms, visibility, sewing order and custom stitch settings survive autosave, copies, undo/redo and import/export. Projects remain limited to 20 MB and 20 objects. Geometry edits reset prepared placement/rotation to the canvas layout; merely reopening or selecting objects preserves unchanged placement.

## Density inspection and object stitch settings

On **Place**, choose **Check how dense the stitches are**. The map counts needle penetrations in the final PEN data, including underlay and lock stitches. Jumps, cuts and color stops are excluded; the end marker's final needle point is included. Use 1, 2 or 5 mm grid cells and inspect all thread blocks together or one block at a time. Values are divided by cell area and shown as points/mm². Tap a cell, or use the highest-density cell list, for counts and contributing thread blocks. The short-segment count measures consecutive sewn moves shorter than 0.3 mm; it does not connect across jumps or stops.

The highlight cutoff is adjustable and is **not a fabric safety limit**. Grid size/alignment affects the map, and intentional lock stitches can produce high counts. This view never changes stitch data or sends machine commands.

In Create, select an object and expand **Underlay and pull compensation**, then enable **Customize stitches for this object**. Fills support no underlay, sparse tatami, inset edge walk, or edge walk plus tatami. Satin strokes and Small Satin lettering support no underlay, center walk, edge walk, sparse zigzag, or center combined with edge/zigzag. Controls include underlay inset, spacing and running-stitch length, top fill/satin spacing, fill angle, and separate fill/satin pull compensation. All distances are in final-size millimeters. Pull is added **per edge**: 0.3 mm on a straight satin column increases its total width by 0.6 mm. It does not enlarge the underlay. Inset fill underlay may disappear in thin areas; narrow satin underlay collapses toward the center rather than crossing its rails. Running/bean outlines are unchanged.

Disable customization to return that object to **Project stitch defaults**. Existing projects retain their prior stitch generation until customization is enabled. Project files preserve each object's custom settings through autosave, copies, undo/redo and import/export. Hoop validation uses encoded stitch and jump coordinates, including lock stitches. These controls still require test stitch-outs for the chosen fabric, stabilizer, thread and needle.

## Workflow details

- **Drawing recoloring:** select a drawing, choose the destination thread in its palette, and expand **Recolor existing marks**. Apply it to all existing colors or replace one existing thread. This changes only that drawing's fills and strokes, preserves geometry, and supports one-step Undo/Redo and project saving. Choosing a palette color without applying recoloring still changes only new marks.
- **Final dimensions:** Place, the pattern preview, and pattern details use the final encoded geometry for the current rotation, including travel and machine lock stitches. Uploaded designs use their uploaded bytes without rotating them again.
- **Picture detail warnings:** included pictures are checked at their final placed size, separately for each processed thread-color mask. A named, non-blocking warning highlights a substantial share of features thinner than approximately 1.2 mm. Since thin parts that touch another colour are folded into it first (see Thin parts above), the warning is left for two cases and says which: thin parts standing on their own, or a picture set to Light clean-up, where it names Medium as the fix. It updates after resizing, color/cleanup changes, hiding, undo or reopening. This is a coarse inspection of retained picture detail, not a guarantee about every pixel in the original photo.
- **Unified Stitch panel:** machine guidance and one primary app action (or a clearly labeled physical-button instruction) share the instruction card, above the stitched progress line and the threads as spools. **Go back or forward a few stitches** appears while paused/interrupted, and starting from a chosen thread, retracing and deletion are shown as buttons whenever they apply; only the design's dimensions, timing and speed are folded, under **Design details**. Faults are explained in the card on Stitch; the red badge in the top bar opens the machine's own details, and opens by itself on Create/Place only for a problem nothing else shows. The upload, cache, recovery and machine protocol stores remain the existing ones.

### Recovery and editing checks

- Reconnecting restores the exact cached machine job and its placement while keeping a different local draft intact. Uploaded and draft names are tracked separately. A reconnect does not apply a second automatic stitch rollback, and late replies from a dropped connection cannot restore stale recovery controls or artwork.
- Pause-after-cut changes refresh the Stitch preview. Pause-only uploads retain the original editable data in the cache, so the option can be turned off for a later job. The recovery copy is removed only after successful machine deletion; failure to save a recovery copy is reported separately from a successful upload.
- Place lists every thread block in sewing order, including repeated colors. Arrow-key movement requires focus on the visible placement canvas and does not intercept text editing on Create.
- Picture decoding follows the newest replacement and remains consistent through undo/redo. Picture cleanup is undoable. Resetting hoop-photo markers or a failed alignment clears the previous warp; a late image decode cannot replace a newer photo or undo Remove. Hoop photos must be upright for side classification.

These behaviors have software regression coverage and practice-machine/browser checks. The simulator does not validate physical Bluetooth timing, marker dimensions on a real hoop, needle movement or fabric stitch quality.

## Installation

The latest release of Respira can be downloaded [here](https://github.com/jhbruhn/respira/releases/latest). Choose the appropriate installer for your Operating System.
Be aware that the macOS release has difficulties because it is neither signed nor notarized by Apple[^1].
The application will offer updates automatically, at least on Windows.
On macOS it does not because of the aforementioned issue.

If you are using Chrome, Edge or another browser with WebBluetooth capabilities, you can also use it directly in the browser: https://jhbruhn.github.io/respira

## Usage

After first starting, you are prompted to connect to your machine.
Respira will only show Bluetooth devices which are Brother PP-1 machines.
Respira has a handy step-guide at the top.
Clicking on the current step will show hints what needs to be done in the current step.

### Pairing

If you never used Respira with your machine before, you will have to pair your machine with your computer first.
To do so, head to your operating systems Bluetooth settings, long-press the Bluetooth-Button on your Brother PP-1 until the LED changes its blinking pattern or there is a beep, and then pair your computer with the machine from your operating systems Bluetooth settings.
Only after this pairing has been done, Respira will be able to successfully connect with your machine.
Otherwise, the connection will fail silently.

### Homing

After startup, the machine has to home itself.
Remove the hoop and press the accept button.
The machine will move a bit.
Afterwards, you can reinsert the hoop.

### Upload Pattern

To import and prepare a pattern, click the _Choose PES File_ button and import a PES embroidery pattern.
Before uploading it, you can move the pattern in the preview window so that it is embroidered at the correct position.
Upload the pattern using the Upload Pattern button.

### Embroidering

After the pattern has been uploaded, you can start embroidering.
First do a mask trace so that the machine can check whether the whole embroidery area is accessible.
Press the _Start Mask Trace_ button, then press the _Accept_ button on the machine.
When the mask trace was successful, you can start sewing by pressing the _Start Sewing_ button, and then pressing the _Start/Pause_ button on the machine.

While the machine is embroidering, watch your sewing progress using the live preview in the Pattern Preview pane and know which color to change to from the Color Block list in the Sewing Progress pane.

After the embroidery is done, remove your fabric from the hoop and press the _Accept_ button on the machine to continue with a new job, or repeat the current job by pressing the _Start/Pause_ button again.

### Reconnecting during a print

Reconnect to the PP1 after a Bluetooth interruption to recover its live stitch
count, progress, speed and machine state. Respira retries incomplete print
information and does not require another upload. Progress also updates when the
machine reaches a color change, pause or completion.

The preview and color-step list are restored from the exact uploaded pattern
cached in this browser when its ID matches the PP1. Keep using the same browser
and site address to retain that cache. Live machine status remains available if
the cached pattern is missing; color-step details require the cached pattern.

## Pattern Preparation

Embroidery software seems to be a niche product and thus is quite expensive.
But fear not because the great people of [Ink/Stitch built and Inkscape extension](https://inkstitch.org/) which allows you to create embroidery patterns with Free and Open Source software.
How great is that?
I think it's great.
All my tests were done with PES patterns exported from Ink/Stitch.
In fact, Respira is using their pystitch library to import PES patterns.

But PES patterns from other software or downloaded from the internet should work as well.

## License

See `LICENSE.md`.

[^1]: To me this is frankly insane. It effectively makes a computer running macOS not a computer that can run general compute anymore, but only applications that were explicitly allowed by Apple. Not only does signing and notarizing the application require the developer to pay a yearly 99€ fee, but it also strips every Apple computer of its generic compute capabilities, unless you know how to circumvent the security measures.

## Savings every design gets, and actionable notices

Three things that only ever save stitching are done for every design, with no setting (`automaticSavings()` in `src/studio/simplification.js`). They were choices in a **Simplify design** dialog; that dialog and its button are gone.

- **Fill hidden under another fill is not stitched.** Earlier fill interiors beneath later filled regions are left out, keeping a 0.6 mm strip under the edge (rounded up on the 0.2 mm grid) so no fabric shows. Holes, layer order, transforms and excluded layers are respected. Only filled regions hide anything: satin strokes, embroidery lettering and imported PES paths do not. The artwork itself is untouched, so moving or removing the covering layer brings the fill back. A layer whose fill is entirely hidden gets a notice saying so.
- **The same thread is stitched together where layers do not overlap**, and **short moves run under fills still to come** instead of being cut; see the next section but one.

Two other settings from that dialog are not done at all: leaving out small bits of fill and capping the number of thread colors. They change the artwork rather than save stitching; a picture has **Clean up specks** and its **Colors** slider for that. A design saved with any of the old settings opens with the same savings as every other design.

Picture-detail, decorative-lettering and hidden-fill notices are clickable. They select the affected layer, show its bounds and open its settings. Layer-specific generation errors also select the offending layer.

These have software and practice-machine validation only; the strip kept under an edge and the look of hidden moves still need a physical sew-out with the chosen fabric, stabilizer and thread.


## Editable picture tracing and drawing points

On a picture, **Make editable shapes** traces the included, processed picture colors into filled shapes. Each island has an editable outer edge and retains its holes. This starts with exact boundaries on the existing 0.2 mm artwork grid, including the current crop, cleanup and skipped colors. The new drawing inherits placement and stitch settings and replaces the picture at the same position in sewing order. The original picture remains as an excluded layer; Undo restores the picture in one step. Tracing does not silently discard small regions, and changes to the original picture do not change the editable copy.

Use **Points** on a drawing to edit traced shapes or existing running/satin lines. **Turn painted fills into shapes** converts a drawing's painted regions too. Select an outline by tapping it or using **Shape or line**; choose **Outer edge** or a hole separately. Drag a point to reshape, or drag inside a shape to translate the entire shape and its holes. Coordinate boxes use hoop millimeters and account for the layer's rotation and scale. Add a point halfway along the following segment, remove points, recolor just the selected item, delete an item, or use **Fewer points** to reduce redundant nodes (about 0.3 mm tolerance at the current scale). Closed strokes stay closed and satin pressure-width samples are retained when moving/inserting points. Fewer points can alter geometry and pressure slightly; Undo restores the original.

All edits regenerate stitches, are undoable, and survive copies, save/reopen and project export/import. Drag cancellation restores the original geometry and redo history. Arrow keys nudge the focused point by 0.2 mm (Shift: 1 mm), and Delete removes it subject to the minimum point count. Dense outlines show a spaced subset of handles; the point-number control can select every source point. A fill retains at least three points per ring, an open line at least two. A one-point mark can be moved or deleted as an item.

Drawing new marks on an editable-shape layer creates a separate drawing layer; Erase directs you to Points. This prevents brush/eraser operations from flattening editable geometry. Drawings containing editable shapes are not merged with other drawings. All layers still support ordinary move, resize, rotation, visibility and sewing-order controls. A shape is represented by polygon points, not Bezier curve handles, and imported PES needle commands are not made editable by this tool.

Version 8 introduced editable shapes. Older applications reject newer project versions rather than losing geometry or stitch-planning options. Limits are 300 shapes, 4,000 points per ring and 20,000 shape points per drawing; overly detailed traces are refused with cleanup guidance. Point editing uses the layer's original 100 mm drawing coordinates. No new dependencies or Zigzag code are included. Software and practice-machine checks do not replace a physical stitch-out on the selected fabric.


## Hidden travel and sewing-order optimization

Both are applied to every design. The same thread is stitched together where layers do not overlap, and short moves run under fills still to come in place of a cut. The layers and artwork stay as they are; when the stitching order differs from the order of the layers, the Layers panel shows a separate **Stitching order** list. In the **Stitches** view, hidden moves are drawn as blue dashed lines.

Ordering is a bounded, deterministic heuristic, not a globally optimal solver. It groups whole layers, without reversing or splitting their internal stitch sequences. Pairwise dependencies retain the original order of any overlapping artwork/stitch bounding boxes, with a 1 mm guard around each. Constraints use the original transformed artwork even when covered-fill removal has hidden part of it. Bounding boxes are deliberately conservative, so interlocking but non-touching artwork may stay in its original order. Imported PES layers are barriers: no layer moves across them. Candidate orders are accepted only when encoded cuts or stops improve and neither increases.

Travel is allowed only beneath retained fills with spacing at most 0.45 mm that will be sewn later. This includes travel between underlay pieces while their own top fill remains ahead. Later-layer cover is inset by 0.6 mm; own future top fill by 0.2 mm. A 0.4 mm search cell is usable only when all its underlying artwork cells are covered. Four-neighbor search and exact cell traversal prevent shortcuts through holes or diagonal gaps. The route is checked again after machine-coordinate rounding, with approximately 2 mm running stitches and a maximum 30 mm path length. Requested lettering trims and imported PES commands/stops are retained; coverage is never inferred across a PES barrier. Sparse fills, outlines and satin lettering do not establish coverage.

Search is bounded to 12,000 cells per attempt, 160,000 cells per design, 256 attempts, 32 zones and 128 accepted connections; a failed or exhausted search keeps the original cut. Route changes are retained only if the final encoded design actually has fewer cuts without more thread stops. Travel can add a few stitches. These are geometric coverage checks, not a guarantee about thread visibility after fabric movement: use a test sew-out for the fabric, stabilizer and thread.

New saves use **version 9**. Versions 1–8 remain importable and get the same savings. No new dependencies or copied Zigzag code are included.
