import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  activateProject,
  getActiveProject,
  getProject,
  listProjects,
  saveProject,
} from "./projectStore";
import { emptyProject } from "./projectFile";

describe("project library", () => {
  it("persists independent copies, full image data and the active selection", async () => {
    const first = {
      id: "first",
      updatedAt: 1,
      thumbnail: "data:image/png;base64,AAAA",
      data: emptyProject(),
    };
    first.data.image.sourceDataURL = "data:image/png;base64,AAAA";
    await saveProject(first);
    const copy = structuredClone(first);
    copy.id = "copy";
    copy.updatedAt = 2;
    copy.data.name = "Second design";
    await saveProject(copy);
    await activateProject(copy.id);
    expect((await getActiveProject())?.data.name).toBe("Second design");
    expect((await getProject("first"))?.data.name).toBe("Untitled");
    expect((await getProject("first"))?.data.image.sourceDataURL).toBe(
      first.data.image.sourceDataURL,
    );
    expect((await listProjects()).map((p) => p.id)).toEqual(["copy", "first"]);
    await activateProject("first");
    expect((await getActiveProject())?.id).toBe("first");
  });
});
