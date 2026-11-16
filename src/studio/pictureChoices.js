import { assignThreads } from './threadMatch.js';
// What a person has chosen by hand for the colours of a picture: a different thread for one of them,
// or to skip it.
//
// The colours and threads shown for a picture are worked out afresh from its settings every time
// (size, number of colours, background, clean-up, crop), so the same settings always
// give the same result however they were reached. The only thing remembered between one working-out
// and the next is this list. Each choice is tied to a colour of the picture rather than to a row, so
// it follows that colour when a setting changes, waits while the colour is absent (say, with fewer
// colours), and applies again when it comes back.

/** How far apart (in RGB) a colour of the picture and a choice can be and still be the same colour. */
export var REACH = 30;
/** More than a picture can ever show at once (8 colours), with room for choices that are waiting. */
export var MOST_CHOICES = 24;

function gap(a, b) {
  var r = a[0] - b[0], g = a[1] - b[1], bl = a[2] - b[2];
  return r * r + g * g + bl * bl;
}

/**
 * For each colour of the picture, which choice applies to it: an index into `choices`, or -1.
 * A choice goes to the one colour nearest it, if that is within reach; where two choices want the
 * same colour, the nearer one has it.
 */
export function matchChoices(clusters, choices) {
  var winner = clusters.map(function () { return -1; }), winnerGap = clusters.map(function () { return Infinity; });
  choices.forEach(function (choice, index) {
    var near = -1, nearGap = REACH * REACH;
    clusters.forEach(function (cluster, i) {
      var d = gap(cluster.rgb, choice.rgb);
      if (d < nearGap || (d === nearGap && near < 0)) { near = i; nearGap = d; }
    });
    if (near >= 0 && nearGap < winnerGap[near]) { winner[near] = index; winnerGap[near] = nearGap; }
  });
  return winner;
}

/**
 * Sets each colour's `thread`, `on` and `picked` from its automatic match (`auto`) and the choices.
 * @returns the same clusters
 */
export function applyChoices(clusters, choices, palette) {
  var winner = matchChoices(clusters, choices);
  if(palette) {
    // Recompute from source colors each time. Manual overrides reserve their thread;
    // only the remaining automatic rows compete for the remaining palette entries.
    var base=assignThreads(palette,clusters), reserved=[], automatic=[], indexes=[];
    clusters.forEach(function(cluster,i){
      cluster.auto=base[i];
      var choice=winner[i]>=0?choices[winner[i]]:null;
      if(choice && choice.thread!==undefined)reserved.push(choice.thread);
      else {automatic.push(cluster);indexes.push(i);}
    });
    var matched=assignThreads(palette,automatic,reserved);
    indexes.forEach(function(index,i){clusters[index].auto=matched[i];});
  }
  clusters.forEach(function (cluster, i) {
    var choice = winner[i] >= 0 ? choices[winner[i]] : null;
    cluster.picked = !!choice && choice.thread !== undefined && choice.thread !== cluster.auto;
    cluster.thread = cluster.picked ? choice.thread : cluster.auto;
    cluster.on = !(choice && choice.on === false);
  });
  return clusters;
}

/**
 * The list of choices after a person changes one colour of the picture.
 * @param change `{ thread }` to stitch it in that thread, or `{ on }` to stitch or skip it
 * @returns a new list; choosing the automatic thread again, or stitching again, forgets the choice
 */
export function choose(choices, clusters, cluster, change) {
  var at = matchChoices(clusters, choices)[clusters.indexOf(cluster)];
  var next = choices.map(function (c) { return Object.assign({}, c, { rgb: c.rgb.slice() }); });
  var choice = at >= 0 ? next.splice(at, 1)[0] : {};
  // The choice now means the colour as it is on screen.
  choice.rgb = cluster.rgb.slice();
  if ('thread' in change) { if (change.thread === cluster.auto) delete choice.thread; else choice.thread = change.thread; }
  if ('on' in change) { if (change.on) delete choice.on; else choice.on = false; }
  if (choice.thread !== undefined || choice.on === false) next.push(choice);
  return next.slice(-MOST_CHOICES);
}

/** The list with every hand-picked thread forgotten; colours that are skipped stay skipped. */
export function forgetThreads(choices) {
  return choices.filter(function (c) { return c.on === false; }).map(function (c) { return { rgb: c.rgb.slice(), on: false }; });
}

/** Preserve all legacy assignments: old files cannot distinguish automatic from hand-picked threads.
 * Rematching is an explicit user action, never a side effect of opening/autosaving a design. */
export function choicesFromSaved(saved) {
  return saved.map(c => ({rgb:c.rgb.slice(),thread:c.thread,...(c.on===false?{on:false}:{})}));
}
