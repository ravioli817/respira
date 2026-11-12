import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Studio } from "./Studio";
import { emptyProject } from "../projects/projectFile";
import { listProjects, saveProject } from "../projects/projectStore";
vi.mock("./studioApp.js", () => ({
  mountStudio: () => ({
    destroy: () => {},
    snapshot: () => emptyProject(),
    thumbnail: () => "",
    setPlacement: () => {},
  }),
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
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
/** Project actions live in the Projects panel; open it and return the Export button. */
async function openPanelAndFindExport() {
  const projects = screen.getByRole("button", { name: "Projects" });
  await waitFor(() =>
    expect((projects as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(projects);
  return screen.findByRole("button", { name: "Export project" });
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
it("opens the Projects panel with Export reachable even when saved projects cannot be read", async () => {
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
