import small from './fonts/small-satin/geometry.json';
import rounded from './fonts/rounded-satin/geometry.json';
import script from './fonts/script-satin/geometry.json';
import smallLicense from './fonts/small-satin/LICENSE?raw';
import roundedLicense from './fonts/rounded-satin/LICENSE?raw';
import scriptLicense from './fonts/script-satin/LICENSE?raw';

// Ranges are final cap heights, conservatively inside each source's documented scaling range.
export const EMBROIDERY_FONTS = {
  SmallSatin: { label:'Small Satin', geometry:small, min:4, max:15, license:smallLicense,
    credit:'Adapted from Ink/Stitch Small Font © 2017 Lex Neva. Font geometry: SIL OFL-1.1.' },
  RoundedSatin: { label:'Rounded Satin', geometry:rounded, min:10, max:19, license:roundedLicense,
    credit:'Adapted from Ink/Stitch Geneva Simple Sans Rounded, based on Hershey fonts by A. V. Hershey and James Hurt. Font geometry: CC-BY-SA 2.5; original Hershey notices retained.' },
  ScriptSatin: { label:'Script Satin', geometry:script, min:14.5, max:24.5, license:scriptLicense,
    credit:'Adapted from Pacificlo © 2021 Claudette Venneugues-Aminot, derived from Pacifico © 2018 The Pacifico Project Authors. Font geometry: SIL OFL-1.1.' },
};
export const isEmbroideryFont = id => Object.hasOwn(EMBROIDERY_FONTS, id);
