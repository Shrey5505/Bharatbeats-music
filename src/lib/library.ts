import type { ArchiveRecord, QualityMode } from "./archive";

const DATABASE = "bharatbeats-library";
const VERSION = 1;
const STORE = "app-state";

export interface LibraryState {
  favorites: ArchiveRecord[];
  recent: ArchiveRecord[];
  playlists: Array<{ id: string; name: string; tracks: ArchiveRecord[] }>;
  quality: QualityMode;
  lastPosition: number;
  lastTrack?: ArchiveRecord;
}

export const EMPTY_LIBRARY: LibraryState = {
  favorites: [],
  recent: [],
  playlists: [],
  quality: "balanced",
  lastPosition: 0,
};

function openDatabase(): Promise<IDBDatabase> {
  if (!("indexedDB" in window)) return Promise.reject(new Error("This browser does not support IndexedDB."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open your music library."));
    request.onblocked = () => reject(new Error("Your music library is blocked by another open tab."));
  });
}

export async function readLibrary(): Promise<LibraryState> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get("state") as IDBRequest<LibraryState | undefined>;
    request.onsuccess = () => resolve({ ...EMPTY_LIBRARY, ...request.result });
    request.onerror = () => reject(request.error ?? new Error("Could not read your music library."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not read your music library."));
    };
  });
}

export async function writeLibrary(state: LibraryState): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(state, "state");
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not save your music library."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Saving your music library was cancelled."));
    };
  });
}
