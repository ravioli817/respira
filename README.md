# Respira

Respira is an pattern transmission and embroidery monitoring application for the Brother PP-1 SKiTCH embroidery machine.
It replaces the Artspira app and allows the user to transmit .PES patterns directly from a computer without having to go through the app.
This allows the user to operate the embroidery machine fully offline and from the comfortable screen of a computer.

![](./docs/main_screenshot.png)

## This fork: Respira with a Create screen

This is a fork of [jhbruhn/respira](https://github.com/jhbruhn/respira). Respira's machine code is used as it is. The fork adds:

- **Create screen** (`src/studio/`): draw with a stylus, turn a picture into stitches, or set text, on a hoop shown at real size. "Prepare to stitch" hands the design to the Prepare screen, where it goes through Respira's own encoder and upload. Designs made here do not need a PES file.
- **"What to do now" card** (`src/guide/`): plain-language instructions for each machine state, a chime when the machine needs someone (thread change, a fault, finished), and the screen kept awake while connected.
- **Practice machine** (`src/practice/`): open the app with `?practice` in the address to try the whole flow against a pretend Skitch. Its behaviour is a best guess from the code, not a recording of a real machine.
- The pattern preview now has a height on screens narrower than 1024 px (a tablet held upright).

Run it locally with `npm install`, then `npm run web:dev`, and open http://localhost:5173 in Chrome.

## Projects, preparation and playback

- **Create:** use Draw, Picture or Text. In Draw, expand **Preset shapes** to add an ellipse/circle, rectangle, triangle, star or heart. Set its width, height and center position in millimeters, choose a line outline, satin outline or fill, then tap **Add shape**. Shapes use the selected thread and support Undo/Redo. Dimensions describe the contour; satin extends beyond it. Inserted shapes become normal drawing strokes/fills. Combining the three design modes in one composition is not part of this release.
- **Projects:** edits save automatically to this browser's IndexedDB. Use **Projects** for the thumbnail gallery, **New project** for a blank drawing, and **Save a copy** to duplicate. Drawings, text, pictures, thread choices and prepared placement/rotation are preserved. Picture copies are embedded as PNG, with the longest side limited to 2048 pixels. Clearing browser data removes local projects; **Export project** saves an editable `.respira.json` backup to Files/Downloads. **Import project** opens it as a new project without overwriting another. Projects do not sync between browsers/devices automatically.
- **Prepare:** tap **Prepare to stitch** in Create, or import a PES file on the Prepare screen. Review the dimensions, thread sequence, placement and sewing-time estimate before connecting. After further edits in Create, tap **Prepare to stitch** again to update the prepared snapshot.
- **Stitch playback:** choose this view on Prepare to play, pause, scrub, step one command or jump to color stops. Toggle jumps, cuts and needle points. Playback uses the final encoded PEN data, including machine lock stitches and rotation; it never sends movement commands. The estimate excludes thread changes, cuts and other stops, and the preview does not predict fabric movement.
- **Stitch:** continue to Stitch to upload, trace the outline, and start sewing with the machine's physical buttons. Connection controls remain available on every screen. Opening a different project does not replace the design already held by the machine.

On iPad, ordinary Safari/Chrome do not expose Web Bluetooth. Bluefy is an option for opening the hosted app with Web Bluetooth support. This release's browser checks use the practice machine, not physical iPad/Bluefy/Skitch validation.

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

## Vibe Code Warning

For reasons of fairness and possibly also as a warning, be aware that 99% of the code has been written using LLMs, specifically Claude Code.

That does not mean that the code is untested, bad or dysfunctional.
In fact, LLMs were a great tool for reverse engineering the Bluetooth Protocol and pattern format the Brother PP-1 uses to communicate with Brothers App.

This project wouldn't have happened without the existence of LLMs.
So, while LLMs are still being heavily oversold and the circulary economy of the big AI companies is not exactly a healthy market IMO, they do still offer _some_ benefits.

## License

See `LICENSE.md`.

[^1]: To me this is frankly insane. It effectively makes a computer running macOS not a computer that can run general compute anymore, but only applications that were explicitly allowed by Apple. Not only does signing and notarizing the application require the developer to pay a yearly 99€ fee, but it also strips every Apple computer of its generic compute capabilities, unless you know how to circumvent the security measures.