import type { SavedProject } from "./projectFile";
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("respira-projects", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("projects", { keyPath: "id" });
        request.result.createObjectStore("meta");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        database = undefined;
        reject(request.error);
      };
    });
  return database;
}
async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () =>
      reject(tx.error || new Error("Project storage failed."));
  });
}
export const saveProject = (project: SavedProject) =>
  run("projects", "readwrite", (store) => store.put(project));
export const listProjects = async () =>
  (
    await run<SavedProject[]>("projects", "readonly", (store) => store.getAll())
  ).sort((a, b) => b.updatedAt - a.updatedAt);
export const getProject = (id: string) =>
  run<SavedProject | undefined>("projects", "readonly", (store) =>
    store.get(id),
  );
export const activateProject = (id: string) =>
  run("meta", "readwrite", (store) => store.put(id, "active"));
export async function getActiveProject() {
  const id = await run<string | undefined>("meta", "readonly", (store) =>
    store.get("active"),
  );
  return id ? getProject(id) : undefined;
}
