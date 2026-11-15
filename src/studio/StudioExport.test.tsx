import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Studio } from "./Studio";
import { emptyProject } from "../projects/projectFile";
import { listProjects, saveProject } from "../projects/projectStore";
import { useProjectUi } from "../projects/projectUi";
// The list of designs is opened from the top bar, through the shared projectUi store. The stand-in
// editor only records that it was mounted, which is when the list has something to save.
const editor = vi.hoisted(() => ({ mounted: false }));
vi.mock("./studioApp.js", () => ({
  mountStudio: () => {
    editor.mounted = true;
    return {
      destroy: () => {},
      snapshot: () => emptyProject(),
      thumbnail: () => "",
      setPlacement: () => {},
      send: () => "empty",
    };
  },
}));
vi.mock("../projects/projectStore", () => ({
  getActiveProject: async () => ({
    id: "export",
    data: emptyProject(),
    updatedAt: 0,
    thumbnail: "",
  }),
  activateProject: vi.fn().mockResolvedValue(undefined),
  saveProject: vi.fn(),
  listProjects: vi.fn().mockResolvedValue([]),
}));
beforeEach(() => {
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  editor.mounted = false;
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
/** Design actions live in the list of designs; open it and return the Export button. */
async function openPanelAndFindExport() {
  await waitFor(() => expect(editor.mounted).toBe(true));
  act(() => useProjectUi.getState().openProjects());
  return screen.findByRole("button", { name: "Export design" });
}
it("finishes the local save before downloading an editable backup", async () => {
  const pending: Array<() => void> = [];
  vi.mocked(saveProject).mockImplementation(
    () =>
      new Promise<IDBValidKey>((resolve) => {
        pending.push(() => resolve("export"));
      }),
  );
  render(<Studio onSend={() => null} />);
  const button = await openPanelAndFindExport();
  // Opening the panel saves once so the gallery is current.
  await waitFor(() => expect(pending).toHaveLength(1));
  fireEvent.click(button);
  pending.shift()!();
  // Now the export's own save is in flight: no download until it lands.
  await waitFor(() => expect(pending).toHaveLength(1));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  pending.shift()!();
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
});
it("still downloads the backup when browser storage fails", async () => {
  vi.mocked(saveProject).mockRejectedValue(new Error("quota exceeded"));
  render(<Studio onSend={() => null} />);
  const button = await openPanelAndFindExport();
  fireEvent.click(button);
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
  expect(screen.getByRole("alert").textContent).toContain("Could not save");
});
it("opens the list of designs with Export reachable even when saved designs cannot be read", async () => {
  vi.mocked(saveProject).mockRejectedValue(new Error("storage is gone"));
  vi.mocked(listProjects).mockRejectedValueOnce(new Error("storage is gone"));
  render(<Studio onSend={() => null} />);
  const button = await openPanelAndFindExport();
  expect((button as HTMLButtonElement).disabled).toBe(false);
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be read",
    ),
  );
});
