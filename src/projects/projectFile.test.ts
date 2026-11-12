import { describe, expect, it } from "vitest";
import { emptyProject, exportProject, importProject } from "./projectFile";

describe("editable project files", () => {
  it("round trips drawings, text, pictures, thread overrides and settings", () => {
    const data = emptyProject();
    data.name = "A saved heart";
    data.mode = "image";
    data.draw.strokes.push({
      k: "satin",
      c: 5,
      p: [
        [10, 10, 3],
        [20, 20, 3],
      ],
    });
    data.image.sourceDataURL = "data:image/png;base64,AAAA";
    data.image.fileName = "flower.png";
    data.image.clusters = [{ rgb: [120, 30, 20], thread: 5, on: false }];
    data.text.value = "Hello\nRavi";
    data.settings.angle = 90;
    data.placement = { x: 200, y: -100, rotation: 45 };
    const restored = importProject(exportProject(data));
    expect(restored).toMatchObject(data);
    restored.draw.strokes[0].p[0][0] = 50;
    expect(data.draw.strokes[0].p[0][0]).toBe(10);
  });
  it.each([
    (d: ReturnType<typeof emptyProject>) => {
      d.settings.spacing = 0;
    },
    (d: ReturnType<typeof emptyProject>) => {
      d.draw.labels = [5, 250001];
    },
    (d: ReturnType<typeof emptyProject>) => {
      d.draw.labels = [5, -1];
    },
    (d: ReturnType<typeof emptyProject>) => {
      d.draw.strokes = [{ k: "run", c: 5, p: [[Infinity, 0, 0]] }];
    },
    (d: ReturnType<typeof emptyProject>) => {
      d.image.sourceDataURL = "https://example.com/tracker.png";
    },
    (d: ReturnType<typeof emptyProject>) => {
      d.image.sourceDataURL = "data:image/svg+xml;base64,AAAA";
    },
  ])("rejects invalid engine parameters and external images", (mutate) => {
    const data = emptyProject();
    mutate(data);
    expect(() =>
      importProject(
        JSON.stringify({ format: "respira-project", version: 1, data }),
      ),
    ).toThrow();
  });
  it("rejects malformed files and unsupported versions", () => {
    for (const text of [
      "not json",
      "null",
      "{}",
      JSON.stringify({
        format: "respira-project",
        version: 2,
        data: emptyProject(),
      }),
    ])
      expect(() => importProject(text)).toThrow();
  });
});
