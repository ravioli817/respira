# Respira

Respira is an pattern transmission and embroidery monitoring application for the Brother PP-1 SKiTCH embroidery machine.
It replaces the Artspira app and allows the user to transmit .PES patterns directly from a computer without having to go through the app.
This allows the user to operate the embroidery machine fully offline and from the comfortable screen of a computer.

![](./docs/main_screenshot.png)

## This fork: Respira with a Create screen

This is a fork of [jhbruhn/respira](https://github.com/jhbruhn/respira). Respira's machine protocol and stitch encoder are used as they are. The fork adds:

- **Create screen** (`src/studio/`): draw with a stylus, turn a picture into stitches, or set text, on a hoop shown at real size. "Prepare to stitch" hands the design to the Prepare screen, where it goes through Respira's own encoder and upload. Designs made here do not need a PES file.
- **"What to do now" card** (`src/guide/`): plain-language instructions for each machine state, a chime when the machine needs someone (thread change, a fault, finished), and the screen kept awake while connected.
- **Practice machine** (`src/practice/`): open the app with `?practice` in the address to try the whole flow against a pretend Skitch. Its behaviour is a best guess from the code, not a recording of a real machine.
- The pattern preview now has a height on screens narrower than 1024 px (a tablet held upright).

**Files of Respira's that this fork changes** carry a note on their first line pointing here: the app shell and header, the upload card, the trace button label, the pattern store, the two hooks that prepare a pattern for upload and check it against the hoop, the pattern preview and information displays, the error-popover hook, `main.tsx` and the test configuration. `package.json` and `package-lock.json` (bundled lettering fonts and a test helper) cannot carry a note. This README is changed too.

**Thread cuts.** A design from the Create screen is handed to Respira's encoder as the same clean stitch list Respira builds from a PES file, so the machine receives what Respira would send for that file: lock stitches and one cut on jumps longer than 5 mm and at each color change, and a plain jump across shorter gaps.

Run it locally with `npm install`, then `npm run web:dev`, and open http://localhost:5173 in Chrome.

## Projects, preparation and playback

- **Create:** add drawing, picture and text layers to a shared hoop. In Draw, expand **Preset shapes** to add an ellipse/circle, rectangle, triangle, star or heart. Set its width, height and center position in millimeters, choose a line outline, satin outline or fill, then tap **Add shape**. Shapes use the selected thread and support Undo/Redo. Dimensions describe the contour; satin extends beyond it. Inserted shapes become normal drawing strokes/fills. Drawings, pictures and text can be combined in one design using layers.
- **Projects:** edits save automatically to this browser's IndexedDB. Tap **Projects** to open the panel with the thumbnail gallery; **New project** (a blank drawing), **Save a copy**, **Export project** and **Import project** are in that panel. Drawings, text, pictures, thread choices and prepared placement/rotation are preserved. Picture copies are embedded as PNG, with the longest side limited to 2048 pixels. Clearing browser data removes local projects; **Export project** saves an editable `.respira.json` backup to Files/Downloads. **Import project** opens it as a new project without overwriting another. Projects do not sync between browsers/devices automatically.
- **Prepare:** tap **Prepare to stitch** in Create, or import a PES file on the Prepare screen. Review the dimensions, thread sequence, placement and sewing-time estimate before connecting. After further edits in Create, tap **Prepare to stitch** again to update the prepared snapshot.
- **Stitch playback:** choose this view on Prepare to play, pause, scrub, step one command or jump to color stops. Toggle jumps, cuts and needle points. Playback uses the final encoded PEN data, including machine lock stitches and rotation; it never sends movement commands. The estimate excludes thread changes, cuts and other stops, and the preview does not predict fabric movement.
- **Stitch:** continue to Stitch to upload, trace the outline, and start sewing with the machine's physical buttons. Connection controls remain available on every screen. Opening a different project does not replace the design already held by the machine.

On iPad, ordinary Safari/Chrome do not expose Web Bluetooth. Bluefy is an option for opening the hosted app with Web Bluetooth support. This release's browser checks use the practice machine, not physical iPad/Bluefy/Skitch validation.

## Combined designs and embroidery lettering

Create uses an editor layout: **Objects** and sewing order on the left, the canvas in the center, and selected-object **Properties** on the right. The canvas stays visible while either panel scrolls. On iPad portrait or a narrow window, panels start collapsed and open one at a time as dismissible drawers. The toolbar and Prepare action remain available.

**Select** is the default tool. Tap an object to select and drag it, or use its corner handles to resize with proportions preserved. Width/height in Properties include rotation and regenerate stitches when changed. **Draw** returns to the selected or last-used included drawing; **New drawing object** adds a separate one. **Picture** opens the file picker (cancel adds nothing), **Text** starts editable Small Satin lettering with “Bharti”, and **Shape** inserts a separate drawing object. Existing project text is preserved. Fit screen, real-size calibration, zoom, Pan and the grid toggle affect the preview only.

Properties retain recoloring, lettering, picture cleanup, X/Y offsets, rotation, include/exclude, duplication and removal. Objects controls change sewing order. Undo/Redo covers artwork and object edits; project files keep their existing format. Overlapping included objects both sew; there is no automatic knockout or global color sorting.

**Small Satin** is an embroidery font adapted from Ink/Stitch Small Font by Lex Neva. Its authored satin rails and rungs are bundled under **SIL OFL-1.1**, with the original files, license and source revision in `src/studio/fonts/small-satin`. The browser regenerates satin spacing, center-walk underlay and pull compensation at the final size. Cap height is limited to **4–15 mm**, including layer scaling. There are 98 supported glyphs, including upper/lowercase Latin letters, numbers and selected punctuation/accents. Unsupported characters are reported; they are never silently removed. Adjust letter spacing, line gap and multiline alignment. The other fonts remain available as explicitly labeled **decorative fill** lettering.

This is our own stitch generator, not identical output from Ink/Stitch. Test-stitch on your fabric/stabilizer before using a garment. To rebuild the font geometry, install `svgpathtools==1.8.0` in a Python environment and run `python scripts/build_lettering_font.py`.

Project files now use version 3 and preserve all layer sources, transforms, visibility and order. Versions 1 and 2 remain importable. For version 1, their active design stays visible, while other saved mode content is retained as hidden layers. New blank projects start with one drawing layer. Older releases cannot open version 3 exports. Project files remain limited to 20 MB and designs to 20 layers. Geometry edits reset prepared placement/rotation to the canvas layout; simply reopening or selecting layers retains an unchanged saved placement.

## Density inspection and object stitch settings

On **Prepare**, choose **Density inspection**. The map counts needle penetrations in the final PEN data, including underlay and lock stitches. Jumps, cuts and color stops are excluded; the end marker's final needle point is included. Use 1, 2 or 5 mm grid cells and inspect all thread blocks together or one block at a time. Values are divided by cell area and shown as points/mm². Tap a cell, or use the highest-density cell list, for counts and contributing thread blocks. The short-segment count measures consecutive sewn moves shorter than 0.3 mm; it does not connect across jumps or stops.

The highlight cutoff is adjustable and is **not a fabric safety limit**. Grid size/alignment affects the map, and intentional lock stitches can produce high counts. This view never changes stitch data or sends machine commands.

In Create, select an object and expand **Underlay and pull compensation**, then enable **Customize stitches for this object**. Fills support no underlay, sparse tatami, inset edge walk, or edge walk plus tatami. Satin strokes and Small Satin lettering support no underlay, center walk, edge walk, sparse zigzag, or center combined with edge/zigzag. Controls include underlay inset, spacing and running-stitch length, top fill/satin spacing, fill angle, and separate fill/satin pull compensation. All distances are in final-size millimeters. Pull is added **per edge**: 0.3 mm on a straight satin column increases its total width by 0.6 mm. It does not enlarge the underlay. Inset fill underlay may disappear in thin areas; narrow satin underlay collapses toward the center rather than crossing its rails. Running/bean outlines are unchanged.

Disable customization to return that object to **Project stitch defaults**. Existing projects retain their prior stitch generation until customization is enabled. Version 3 project files preserve each object's custom settings through autosave, copies, undo/redo and import/export. Hoop validation uses encoded stitch and jump coordinates, including lock stitches. These controls still require test stitch-outs for the chosen fabric, stabilizer, thread and needle.

## Workflow details

- **Drawing recoloring:** select a drawing, choose the destination thread in its palette, and expand **Recolor existing marks**. Apply it to all existing colors or replace one existing thread. This changes only that drawing's fills and strokes, preserves geometry, and supports one-step Undo/Redo and project saving. Choosing a palette color without applying recoloring still changes only new marks.
- **Final dimensions:** Prepare, the pattern preview, and pattern details use the final encoded geometry for the current rotation, including travel and machine lock stitches. Uploaded designs use their uploaded bytes without rotating them again.
- **Picture detail warnings:** included pictures are checked at their final placed size, separately for each processed thread-color mask. A named, non-blocking warning highlights a substantial share of features thinner than approximately 1.2 mm. It updates after resizing, color/cleanup changes, hiding, undo or reopening. This is a coarse inspection of retained picture detail, not a guarantee about every pixel in the original photo.
- **Unified Stitch panel:** machine guidance and one primary app action (or a clearly labeled physical-button instruction) share one panel with current/load-now and next-thread cards. Recovery controls appear while paused/interrupted; all thread blocks, dimensions, timing, speed, retracing and deletion are available below. Errors remain inline on Stitch; the header error badge can still be opened manually, and automatic error popovers remain enabled on Create/Prepare. The upload, cache, recovery and machine protocol stores remain the existing ones.

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
