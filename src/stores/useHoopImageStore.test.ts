import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { useHoopImageStore as store } from "./useHoopImageStore";
import { detectMarkers } from "../utils/markerDetection";
vi.mock("../utils/imageWarp", () => ({
  warpImageToHoop: () => document.createElement("canvas"),
}));
vi.mock("../utils/markerDetection", () => ({ detectMarkers: vi.fn() }));
const points = [
  { x: 50, y: 0 },
  { x: 100, y: 50 },
  { x: 50, y: 100 },
  { x: 0, y: 50 },
];
let requests: { resolve: () => void; reject: () => void }[];
beforeEach(() => {
  store.getState().clear();
  requests = [];
  let url = 0;
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => `blob:${++url}`),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      naturalWidth = 100;
      naturalHeight = 100;
      decode() {
        return new Promise<void>((resolve, reject) =>
          requests.push({
            resolve,
            reject: () => reject(new Error("bad file")),
          }),
        );
      }
    },
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  store.getState().clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function aligned() {
  const work = store.getState().loadImage(new File([""], "hoop.png"));
  requests.at(-1)!.resolve();
  await work;
  points.forEach((p) => store.getState().addClick(p));
  expect(store.getState().status).toBe("aligned");
}
it("invalidates the old warp on reset, undo and failed detection", async () => {
  await aligned();
  store.getState().undoClick();
  expect(store.getState().warped).toBeNull();
  expect(store.getState().status).toBe("loaded");
  store.getState().addClick(points[3]);
  expect(store.getState().status).toBe("aligned");
  store.getState().resetClicks();
  expect(store.getState().homography).toBeNull();
  expect(store.getState().status).toBe("loaded");
  points.forEach((p) => store.getState().addClick(p));
  vi.mocked(detectMarkers).mockReturnValue({
    markers: [],
    candidates: [],
    threshold: 128,
  });
  store.getState().autoDetect();
  expect(store.getState().warped).toBeNull();
  expect(store.getState().status).toBe("loaded");
});
it("keeps the newest photo when decodes finish out of order, and clear cancels a pending load", async () => {
  const a = store.getState().loadImage(new File(["a"], "a.png"));
  const b = store.getState().loadImage(new File(["b"], "b.png"));
  requests[1].resolve();
  await b;
  requests[0].resolve();
  await a;
  expect(store.getState().imageUrl).toBe("blob:2");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  const c = store.getState().loadImage(new File(["c"], "c.png"));
  store.getState().clear();
  requests[2].resolve();
  await c;
  expect(store.getState().status).toBe("none");
  expect(store.getState().imageUrl).toBeNull();
});
it("a failed replacement keeps the prior photo URL usable", async () => {
  await aligned();
  const next = store.getState().loadImage(new File(["bad"], "bad.png"));
  requests[1].reject();
  await next;
  expect(store.getState().imageUrl).toBe("blob:1");
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:1");
  expect(store.getState().alignError).toMatch(/Could not load/);
});
