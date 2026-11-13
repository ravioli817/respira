import { useCallback, useEffect, useRef, useState } from "react";
import { mountStudio, type StudioDesign } from "./studioApp.js";
import studioCss from "./studio.css?inline";
import {
  emptyProject,
  exportProject,
  importProject,
  validateProject,
  type ProjectData,
  type SavedProject,
} from "../projects/projectFile";
import {
  activateProject,
  getActiveProject,
  listProjects,
  saveProject,
} from "../projects/projectStore";
import { usePatternStore } from "../stores/usePatternStore";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";

// Lettering fonts for the Text tool, bundled so the app keeps working offline.
import "@fontsource/lobster/latin-400.css";
import "@fontsource/pacifico/latin-400.css";
import "@fontsource/fredoka/latin-600.css";
import "@fontsource/titan-one/latin-400.css";
import "@fontsource/archivo-black/latin-400.css";
import "@fontsource/bebas-neue/latin-400.css";
import "@fontsource/bungee/latin-400.css";
import "@fontsource/permanent-marker/latin-400.css";
import "@fontsource/righteous/latin-400.css";

interface StudioProps {
  className?: string;
  onSend: (design: StudioDesign) => string | null;
}
function download(data: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([data], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const newRecord = (data?: ProjectData): SavedProject => ({
  id: crypto.randomUUID(),
  data:
    data ||
    (() => {
      const base = emptyProject();
      return {
        ...base,
        v: 4,
        activeLayerId: "drawing",
        layers: [
          {
            id: "drawing",
            name: "Drawing",
            kind: "draw",
            visible: true,
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
            source: base.draw,
          },
        ],
      } as ProjectData;
    })(),
  updatedAt: Date.now(),
  thumbnail: "",
});

/** Named editable projects. The machine's loaded job lives in separate stores. */
export function Studio({ className, onSend }: StudioProps) {
  const sourceProjectId = usePatternStore((s) => s.sourceProjectId);
  const offset = usePatternStore((s) => s.patternOffset);
  const rotation = usePatternStore((s) => s.patternRotation);
  const hostRef = useRef<HTMLDivElement>(null);
  const editor = useRef<ReturnType<typeof mountStudio> | null>(null);
  const onSendRef = useRef(onSend);
  // The editor's toolbar holds the Projects button; it calls whatever openPanel is current.
  const openPanelRef = useRef<() => void>(() => {});
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const revision = useRef(0);
  const activeId = useRef("");
  const [document, setDocument] = useState<SavedProject | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [status, setStatus] = useState("Opening projects…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // The Projects panel holds the gallery and every project action. `gallery` is null while it loads.
  const [panelOpen, setPanelOpen] = useState(false);
  const [gallery, setGallery] = useState<SavedProject[] | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);
  useEffect(() => {
    let cancelled = false;
    getActiveProject()
      .then((record) => {
        if (cancelled) return;
        if (record) {
          record = { ...record, data: validateProject(record.data) };
          setDocument(record);
        } else {
          setLegacy(true);
          setDocument(newRecord());
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError(
          "Project storage is unavailable. Export a project file to keep your work.",
        );
        setLegacy(true);
        setDocument(newRecord());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    (id: string, data: ProjectData, thumbnail: string) => {
      const version = ++revision.current;
      const record = {
        id,
        data: validateProject(data),
        thumbnail,
        updatedAt: Date.now(),
      };
      setStatus("Saving…");
      const work = queue.current
        .catch(() => {})
        .then(() => saveProject(record));
      queue.current = work;
      work
        .then(() => {
          if (activeId.current === id && revision.current === version) {
            setStatus("Saved on this device");
            setError("");
          }
        })
        .catch(() => {
          if (activeId.current === id) {
            setStatus("Not saved");
            setError(
              "Could not save on this device. Export a project file to keep your work.",
            );
          }
        });
      return work;
    },
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !document) return;
    activeId.current = document.id;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const instance = mountStudio(root, {
      css: studioCss,
      project: legacy ? undefined : document.data,
      onSend: (design) =>
        onSendRef.current({ ...design, projectId: document.id }),
      onProjects: () => openPanelRef.current(),
      onDirty: () => {
        revision.current++;
        setStatus("Unsaved changes…");
      },
      onSave: (data, thumbnail) => {
        void persist(document.id, data, thumbnail);
      },
    });
    editor.current = instance;
    void activateProject(document.id).catch(() =>
      setError(
        "Could not remember the current project. Use Projects to reopen it, or export a backup.",
      ),
    );
    return () => {
      instance.destroy();
      editor.current = null;
    };
  }, [document, legacy, persist]);

  useEffect(() => {
    if (document && sourceProjectId === document.id)
      editor.current?.setPlacement({ x: offset.x, y: offset.y, rotation });
  }, [document, sourceProjectId, offset.x, offset.y, rotation]);

  async function flush() {
    if (!editor.current || !document)
      throw new Error("The editor is still loading.");
    const data = validateProject(editor.current.snapshot());
    const thumbnail = editor.current.thumbnail();
    await persist(document.id, data, thumbnail);
    return { data, thumbnail };
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The project could not be opened or saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function open(record: SavedProject) {
    await saveProject(record);
    await activateProject(record.id);
    setLegacy(false);
    setDocument(record);
    setPanelOpen(false);
  }
  // Save first so the gallery shows this project as it is now. The panel opens either way:
  // a storage failure must never hide Export, the one way left to keep the work.
  function openPanel() {
    setPanelOpen(true);
    setGallery(null);
    flush()
      .catch(() => {})
      .then(listProjects)
      .then(setGallery, () => {
        setGallery([]);
        setError(
          "Saved projects could not be read on this device. Export a project file to keep your work.",
        );
      });
  }

  useEffect(() => {
    openPanelRef.current = openPanel;
  });
  // Save status is shown in the editor's toolbar, next to Projects.
  useEffect(() => {
    editor.current?.setProjectStatus(status);
  }, [status, document, legacy]);

  return (
    <div className={className}>
      {/* Save status and the Projects button live in the editor's toolbar (studioApp.js), so this
          screen spends no row on them. Only a problem takes a line here. */}
      <input
        ref={importRef}
        type="file"
        accept=".json,.respira.json"
        className="hidden"
        aria-label="Import editable project"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file)
            void perform(async () => {
              if (file.size > 20000000)
                throw new Error("Project files must be smaller than 20 MB.");
              const data = importProject(await file.text());
              await flush();
              await open(newRecord(data));
            });
        }}
      />
      {error && !panelOpen && (
        <p
          role="alert"
          className="flex-shrink-0 px-4 sm:px-5 lg:px-6 py-1.5 border-b bg-white dark:bg-gray-800 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}
      <div ref={hostRef} className="flex-1 min-h-0" />
      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85dvh] overflow-y-auto">
          <DialogTitle>Your projects</DialogTitle>
          <DialogDescription>
            Projects stay in this browser on this device. Export to Files for
            backup or to use another device. Opening a project does not change
            the pattern held by the machine.
          </DialogDescription>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Button
              variant="outline"
              disabled={busy || !document}
              onClick={() =>
                void perform(async () => {
                  await flush();
                  await open(newRecord());
                })
              }
            >
              New project
            </Button>
            <Button
              variant="outline"
              disabled={busy || !document}
              onClick={() =>
                void perform(async () => {
                  const current = await flush();
                  const data = {
                    ...current.data,
                    name: `${current.data.name || "Design"} copy`.slice(0, 24),
                  };
                  await open({
                    ...newRecord(data),
                    thumbnail: current.thumbnail,
                  });
                })
              }
            >
              Save a copy
            </Button>
            <Button
              variant="outline"
              disabled={busy || !document}
              onClick={() =>
                void perform(async () => {
                  if (!editor.current) return;
                  const data = editor.current.snapshot();
                  const contents = exportProject(data);
                  // Finish the local save before offering the download when storage works.
                  // A failed local save must never prevent the user making a backup.
                  if (document)
                    await persist(
                      document.id,
                      data,
                      editor.current.thumbnail(),
                    ).catch(() => {});
                  download(
                    contents,
                    `${(data.name || "design").replace(/[^a-z0-9_-]/gi, "-")}.respira.json`,
                  );
                })
              }
            >
              Export project
            </Button>
            <Button
              variant="outline"
              disabled={busy || !document}
              onClick={() => importRef.current?.click()}
            >
              Import project
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
          {gallery === null ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Opening your projects…
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {gallery.map((record) => (
                <button
                  key={record.id}
                  disabled={busy}
                  className="border rounded-xl p-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() =>
                    void perform(async () => {
                      await flush();
                      await open({
                        ...record,
                        data: validateProject(record.data),
                      });
                    })
                  }
                >
                  {record.thumbnail ? (
                    <img
                      src={record.thumbnail}
                      alt=""
                      className="w-full aspect-square rounded-lg object-contain bg-gray-100"
                    />
                  ) : (
                    <div className="aspect-square bg-gray-100 rounded-lg" />
                  )}
                  <strong className="block truncate mt-2">
                    {record.data.name || "Untitled"}
                  </strong>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(record.updatedAt).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
