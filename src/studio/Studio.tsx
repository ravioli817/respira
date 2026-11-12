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
        v: 3,
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
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const revision = useRef(0);
  const activeId = useRef("");
  const [document, setDocument] = useState<SavedProject | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [status, setStatus] = useState("Opening projects…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
    setGallery(null);
  }

  return (
    <div className={className}>
      <section
        aria-label="Project files"
        className="px-4 py-3 border-b bg-white dark:bg-gray-800 flex flex-wrap items-center gap-2"
      >
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
              await flush();
              setGallery(await listProjects());
            })
          }
        >
          Projects
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
              await open({ ...newRecord(data), thumbnail: current.thumbnail });
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
        <span
          role="status"
          className="text-sm text-gray-600 dark:text-gray-300"
        >
          {status}
        </span>
        <span className="w-full text-xs text-gray-500 dark:text-gray-400">
          Projects stay in this browser on this device. Export to Files for
          backup or to use another device.
        </span>
        {error && (
          <p
            role="alert"
            className="w-full text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        )}
      </section>
      <div ref={hostRef} />
      <Dialog
        open={gallery !== null}
        onOpenChange={(value) => {
          if (!value) setGallery(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[85dvh] overflow-y-auto">
          <DialogTitle>Your projects</DialogTitle>
          <DialogDescription>
            Open an editable design. This does not change the pattern held by
            the machine.
          </DialogDescription>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {gallery?.map((record) => (
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
