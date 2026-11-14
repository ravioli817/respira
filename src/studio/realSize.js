// Real size: how many screen pixels make a millimetre.
// A web page cannot ask how big its pixels are, so this goes by the device: every iPad is 132 points per
// inch except the mini (163). Other screens get a sensible guess; Create's card check corrects it.
export function guessPxPerMM() {
  var ua = navigator.userAgent || '', touch = (navigator.maxTouchPoints || 0) > 1;
  var w = Math.min(screen.width, screen.height), h = Math.max(screen.width, screen.height);
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) return { v: (w === 744 && h === 1133 ? 163 : 132) / 25.4, sure: true };
  if (/Macintosh/.test(ua)) {
    var known = { '1470x956': 128.6, '1512x982': 127, '1728x1117': 127, '1710x1107': 133, '1440x900': 127.7, '2240x1260': 109, '2560x1440': 109 };
    return { v: (known[screen.width + 'x' + screen.height] || 127) / 25.4, sure: false };
  }
  return { v: 96 / 25.4, sure: false };
}
