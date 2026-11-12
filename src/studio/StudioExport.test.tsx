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
import { saveProject } from "../projects/projectStore";
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
it("finishes the local save before downloading an editable backup", async () => {
  let finish!: () => void;
  vi.mocked(saveProject).mockImplementation(
    () =>
      new Promise<IDBValidKey>((resolve) => {
        finish = () => resolve("export");
      }),
  );
  render(<Studio onSend={() => null} />);
  const button = screen.getByRole("button", { name: "Export project" });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(button);
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  finish();
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
});
it("still downloads the backup when browser storage fails", async () => {
  vi.mocked(saveProject).mockRejectedValue(new Error("quota exceeded"));
  render(<Studio onSend={() => null} />);
  const button = screen.getByRole("button", { name: "Export project" });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(button);
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
  expect(screen.getByRole("alert").textContent).toContain("Could not save");
});
