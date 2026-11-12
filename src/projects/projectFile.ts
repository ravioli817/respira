export interface ProjectData {
  v: 1;
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
  text: { value: string; font: string; widthMM: number; color: number };
}
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
  text: { value: "Hello", font: "Lobster", widthMM: 80, color: 5 },
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

/** Reconstruct only known fields. Imported files never supply live engine state or HTML. */
export function validateProject(value: unknown): ProjectData {
  const s = object(value),
    d = object(s.draw),
    im = object(s.image),
    t = object(s.text),
    settings = object(s.settings);
  if (s.v !== 1 || !["draw", "image", "text"].includes(String(s.mode)))
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
    v: 1,
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
    },
  };
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
  return JSON.stringify({
    format: "respira-project",
    version: 1,
    data: validateProject(data),
  });
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
  if (file.format !== "respira-project" || file.version !== 1) return fail();
  return validateProject(file.data);
}
