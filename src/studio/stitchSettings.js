export function stitchDefaults(layer, project) {
  const lettering=layer.kind==='text'&&layer.source.font==='SmallSatin';
  return {
    fillUnderlay:project.underlay?'tatami':'none',
    satinUnderlay:project.underlay?'center':'none',
    fillPullMm:0.15,satinPullMm:lettering?0.2:0.1,
    underlayInsetMm:0.4,underlaySpacingMm:2,underlayStitchMm:lettering?1.2:2,
    fillSpacing:project.spacing,fillAngle:project.angle,satinSpacingMm:lettering?0.4:0.45,
  };
}
/** Uncustomized objects keep the old engine path and exact stitch output. */
export function engineSettings(layer,project) {
  const s=layer.stitchSettings;
  return s ? {...s,spacing:s.fillSpacing,angle:s.fillAngle,satinSpacing:s.satinSpacingMm,underlay:true} : {spacing:project.spacing,angle:project.angle,underlay:project.underlay};
}
