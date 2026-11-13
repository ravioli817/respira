export interface ProjectData {
  v: 1 | 2 | 3 | 4;
  activeLayerId?: string;
  layers?: DesignLayer[];
  placement?: { x: number; y: number; rotation: number };
  mode: "draw" | "image" | "text";
  name: string;
  view?: Record<string, string>;
  fabric?: string;
  hoop?: { real: boolean; pxmm: number | null };
  settings: { spacing: number; angle: number; underlay: boolean };
  draw: {
    tool: string;
    color: number;
    sizes: Record<string, number>;
    pressure: boolean;
    order: number[];
    example: boolean;
    labels: number[];
    strokes: Array<{ k: "satin" | "run"; c: number; p: number[][] }>;
  };
  image: {
    sizeMM: number;
    k: number;
    removeBg: boolean;
    clean: number;
    sourceDataURL?: string;
    fileName?: string;
    clusters?: Array<{ rgb: number[]; thread: number; on: boolean }>;
  };
  text: {
    value: string;
    font: string;
    widthMM: number;
    color: number;
    heightMM?: number;
    trimRule?: "auto" | "word" | "letter";
    letterSpacing?: number;
    lineGap?: number;
    align?: "left" | "center" | "right";
  };
}
export interface ObjectStitchSettings {
  fillUnderlay: "none" | "tatami" | "edge" | "edge-tatami";
  satinUnderlay:
    | "none"
    | "center"
    | "edge"
    | "zigzag"
    | "center-edge"
    | "center-zigzag";
  fillPullMm: number;
  satinPullMm: number;
  underlayInsetMm: number;
  underlaySpacingMm: number;
  underlayStitchMm: number;
  fillSpacing: number;
  fillAngle: number;
  satinSpacingMm: number;
}
export type DesignLayer = {
  id: string;
  name: string;
  visible: boolean;
  transform: { x: number; y: number; scale: number; rotation: number };
  stitchSettings?: ObjectStitchSettings;
} & (
  | { kind: "draw"; source: ProjectData["draw"] }
  | { kind: "image"; source: ProjectData["image"] }
  | { kind: "text"; source: ProjectData["text"] }
);
export interface SavedProject {
  id: string;
  updatedAt: number;
  data: ProjectData;
  thumbnail: string;
}
export const emptyProject = (): ProjectData => ({
  v: 1,
  mode: "draw",
  name: "Untitled",
  settings: { spacing: 0.4, angle: 45, underlay: true },
  draw: {
    tool: "satin",
    color: 37,
    sizes: { satin: 3, brush: 6, eraser: 6 },
    pressure: true,
    order: [],
    example: false,
    labels: [0, 250000],
    strokes: [],
  },
  image: { sizeMM: 80, k: 4, removeBg: true, clean: 2 },
  text: {
    value: "Bharti",
    font: "SmallSatin",
    widthMM: 80,
    color: 5,
    heightMM: 8,
    letterSpacing: 0.5,
    lineGap: 2,
    align: "center",
  },
});
const fail = () => {
  throw new Error("This is not a supported Respira project file.");
};
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return fail();
  return v as Record<string, unknown>;
};
const number = (
  v: unknown,
  min: number,
  max: number,
  integer = false,
): number => {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v < min ||
    v > max ||
    (integer && !Number.isInteger(v))
  )
    return fail();
  return v;
};
const string = (v: unknown, max: number): string => {
  if (typeof v !== "string" || v.length > max) return fail();
  return v;
};
const bool = (v: unknown): boolean => (typeof v === "boolean" ? v : fail());
const array = (v: unknown, max: number): unknown[] =>
  Array.isArray(v) && v.length <= max ? v : fail();
const color = (v: unknown) => number(v, 1, 63, true);

export function validateStitchSettings(value: unknown): ObjectStitchSettings {
  const s = object(value);
  if (
    !["none", "tatami", "edge", "edge-tatami"].includes(
      String(s.fillUnderlay),
    ) ||
    ![
      "none",
      "center",
      "edge",
      "zigzag",
      "center-edge",
      "center-zigzag",
    ].includes(String(s.satinUnderlay))
  )
    return fail();
  return {
    fillUnderlay: s.fillUnderlay as ObjectStitchSettings["fillUnderlay"],
    satinUnderlay: s.satinUnderlay as ObjectStitchSettings["satinUnderlay"],
    fillPullMm: number(s.fillPullMm, 0, 1),
    satinPullMm: number(s.satinPullMm, 0, 1),
    underlayInsetMm: number(s.underlayInsetMm, 0.1, 2),
    underlaySpacingMm: number(s.underlaySpacingMm, 0.8, 4),
    underlayStitchMm: number(s.underlayStitchMm, 0.5, 4),
    fillSpacing: number(s.fillSpacing, 0.25, 2),
    fillAngle: number(s.fillAngle, 0, 180),
    satinSpacingMm: number(s.satinSpacingMm, 0.3, 1),
  };
}

/** Reconstruct only known fields. Imported files never supply live engine state or HTML. */
export function validateProject(value: unknown): ProjectData {
  const s = object(value),
    d = object(s.draw),
    im = object(s.image),
    t = object(s.text),
    settings = object(s.settings);
  if (
    (s.v !== 1 && s.v !== 2 && s.v !== 3 && s.v !== 4) ||
    !["draw", "image", "text"].includes(String(s.mode))
  )
    return fail();
  const labels = array(d.labels, 500000).map((v, i) =>
    number(v, i % 2 ? 1 : 0, i % 2 ? 250000 : 63, true),
  );
  if (
    labels.length % 2 ||
    labels.filter((_, i) => i % 2).reduce((a, b) => a + b, 0) !== 250000
  )
    return fail();
  let points = 0;
  const strokes = array(d.strokes, 10000).map((value) => {
    const st = object(value);
    if (st.k !== "satin" && st.k !== "run") return fail();
    const p = array(st.p, 100000).map((value) => {
      const row = array(value, 3);
      if (row.length !== 3 || ++points > 200000) return fail();
      return [
        number(row[0], 0, 100),
        number(row[1], 0, 100),
        number(row[2], 0, 20),
      ];
    });
    if (!p.length) return fail();
    return { k: st.k as "satin" | "run", c: color(st.c), p };
  });
  const sizes = object(d.sizes);
  if (!["line", "satin", "brush", "bucket", "eraser"].includes(String(d.tool)))
    return fail();
  const sourceDataURL =
    im.sourceDataURL === undefined
      ? undefined
      : string(im.sourceDataURL, 16000000);
  if (
    sourceDataURL &&
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(sourceDataURL)
  )
    return fail();
  const result: ProjectData = {
    v: s.v,
    mode: s.mode as ProjectData["mode"],
    name: string(s.name, 100),
    settings: {
      spacing: number(settings.spacing, 0.25, 2),
      angle: number(settings.angle, 0, 180),
      underlay: bool(settings.underlay),
    },
    draw: {
      tool: String(d.tool),
      color: color(d.color),
      sizes: {
        satin: number(sizes.satin, 1.2, 6.5),
        brush: number(sizes.brush, 2, 20),
        eraser: number(sizes.eraser, 2, 20),
      },
      pressure: bool(d.pressure),
      order: array(d.order, 63).map(color),
      example: bool(d.example),
      labels,
      strokes,
    },
    image: {
      sizeMM: number(im.sizeMM, 20, 100),
      k: number(im.k, 1, 8, true),
      removeBg: bool(im.removeBg),
      clean: number(im.clean, 1, 3, true),
      sourceDataURL,
      fileName: im.fileName === undefined ? "" : string(im.fileName, 500),
      clusters:
        im.clusters === undefined
          ? []
          : array(im.clusters, 8).map((value) => {
              const c = object(value);
              const rgb = array(c.rgb, 3).map((v) => number(v, 0, 255));
              if (rgb.length !== 3) return fail();
              return { rgb, thread: color(c.thread), on: bool(c.on) };
            }),
    },
    text: {
      value: string(t.value, 2000),
      font: string(t.font, 100),
      widthMM: number(t.widthMM, 20, 100),
      color: color(t.color),
      ...(t.heightMM !== undefined
        ? { heightMM: number(t.heightMM, 1, 250) }
        : {}),
      ...(t.letterSpacing !== undefined
        ? { letterSpacing: number(t.letterSpacing, 0, 5) }
        : {}),
      ...(t.trimRule !== undefined
        ? {
            trimRule: (["auto", "word", "letter"].includes(String(t.trimRule))
              ? t.trimRule
              : fail()) as "auto" | "word" | "letter",
          }
        : {}),
      ...(t.lineGap !== undefined ? { lineGap: number(t.lineGap, 0, 10) } : {}),
      ...(t.align !== undefined
        ? {
            align: (["left", "center", "right"].includes(String(t.align))
              ? t.align
              : fail()) as "left" | "center" | "right",
          }
        : {}),
    },
  };
  if (s.v === 2 || s.v === 3 || s.v === 4) {
    const ids = new Set<string>();
    result.layers = array(s.layers, 20).map((value) => {
      const l = object(value),
        tr = object(l.transform),
        id = string(l.id, 100);
      if (
        !id ||
        ids.has(id) ||
        !["draw", "image", "text"].includes(String(l.kind))
      )
        return fail();
      ids.add(id);
      const kind = l.kind as "draw" | "image" | "text";
      const source = validateProject({
        ...emptyProject(),
        v: 1,
        [kind]: l.source,
      })[kind];
      return {
        id,
        name: string(l.name, 60),
        kind,
        source,
        visible: bool(l.visible),
        ...(l.stitchSettings === undefined
          ? {}
          : { stitchSettings: validateStitchSettings(l.stitchSettings) }),
        transform: {
          x: number(tr.x, -100, 100),
          y: number(tr.y, -100, 100),
          scale: number(tr.scale, 0.1, 4),
          rotation: number(tr.rotation, -180, 180),
        },
      } as DesignLayer;
    });
    // Layer sources are authoritative in v2; do not embed the selected picture twice.
    const legacyDefaults = emptyProject();
    result.draw = legacyDefaults.draw;
    result.image = legacyDefaults.image;
    result.text = legacyDefaults.text;
    result.activeLayerId = string(s.activeLayerId, 100);
    if (!ids.has(result.activeLayerId)) return fail();
  }
  if (s.placement !== undefined) {
    const p = object(s.placement);
    result.placement = {
      x: number(p.x, -2000, 2000),
      y: number(p.y, -2000, 2000),
      rotation: number(p.rotation, -360, 360),
    };
  }
  if (s.fabric !== undefined) {
    const f = string(s.fabric, 7);
    if (!/^#[0-9a-f]{6}$/i.test(f)) return fail();
    result.fabric = f;
  }
  if (s.hoop !== undefined) {
    const h = object(s.hoop);
    result.hoop = {
      real: bool(h.real),
      pxmm: h.pxmm === null ? null : number(h.pxmm, 2, 9),
    };
  }
  if (s.view !== undefined) {
    const v = object(s.view);
    result.view = {};
    for (const mode of ["draw", "image", "text"]) {
      if (!["design", "stitches"].includes(String(v[mode]))) return fail();
      result.view[mode] = String(v[mode]);
    }
  }
  return result;
}
export function exportProject(data: ProjectData): string {
  const encoded = JSON.stringify({
    format: "respira-project",
    version: data.v,
    data: validateProject(data),
  });
  if (encoded.length > 20000000)
    throw new Error(
      "Project files must be smaller than 20 MB. Use smaller pictures or fewer copies.",
    );
  return encoded;
}
export function importProject(text: string): ProjectData {
  if (text.length > 20000000)
    throw new Error("Project files must be smaller than 20 MB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail();
  }
  const file = object(parsed);
  if (
    file.format !== "respira-project" ||
    (file.version !== 1 &&
      file.version !== 2 &&
      file.version !== 3 &&
      file.version !== 4) ||
    object(file.data).v !== file.version
  )
    return fail();
  return validateProject(file.data);
}
